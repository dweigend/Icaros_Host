#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyserial>=3.5"]
# ///
"""Pair, probe, or flash an attached M5 controller over USB serial for Icaros Host.

The script discovers a likely USB serial port, can send one newline-delimited
`configure` frame, reads serial JSON, and reports whether live controller frames
are visible. Firmware upload is only performed in explicit `flash` mode.
"""

from __future__ import annotations

import argparse
import errno
import glob
import json
import os
import select
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import NoReturn, Protocol, cast
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

if os.name != "nt":
    import termios

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

DEFAULT_BAUD_RATE = 115200
DEFAULT_SECONDS = 10.0
CONFIGURE_RESULT_TIMEOUT_SECONDS = 8.0
CONFIGURE_RETRY_INTERVAL_SECONDS = 2.0
FIRMWARE_CHECK_SECONDS = 3.0
DIAGNOSE_RESULT_TIMEOUT_SECONDS = 2.5
PAIRING_EVENT_PREFIX = "PAIRING_EVENT "
REQUIRED_FIRMWARE_VERSION = os.environ.get(
    "ICAROS_REQUIRED_M5_FIRMWARE", "0.2.2-icaros-ws-reconnect"
)
DEFAULT_FIRMWARE_DIR = Path("firmware/m5-controller")
POSIX_M5_PORT_PATTERNS = (
    "/dev/cu.usbserial*",
    "/dev/cu.wchusbserial*",
    "/dev/cu.usbmodem*",
    "/dev/tty.usbserial*",
    "/dev/tty.wchusbserial*",
    "/dev/tty.usbmodem*",
)
DIAGNOSE_PROBE_MESSAGE = {"type": "diagnose"}
LEGACY_PROBE_MESSAGES = (
    {"type": "statusRequest"},
    {"type": "getConfig"},
    {"type": "startTelemetry"},
)
FRAME_TYPES_THAT_PROVE_DATA = {
    "imu",
    "orientation",
    "telemetry",
    "deviceState",
    "status",
    "heartbeat",
    "register",
}
POSIX_BAUD_CONSTANTS = (
    {}
    if os.name == "nt"
    else {
        9600: termios.B9600,
        19200: termios.B19200,
        38400: termios.B38400,
        57600: termios.B57600,
        115200: termios.B115200,
        230400: getattr(termios, "B230400", None),
        1500000: getattr(termios, "B1500000", None),
    }
)
WINDOWS_SERIAL_KEYWORDS = (
    "cp210",
    "ch340",
    "esp32",
    "m5",
    "silicon labs",
    "usb serial",
    "usb-serial",
    "usb to uart",
    "wch",
)
WINDOWS_POLL_INTERVAL_SECONDS = 0.02


class SerialConnection(Protocol):
    def read(self, size: int) -> bytes: ...

    def write(self, data: bytes) -> None: ...

    def flush_input(self) -> None: ...

    def wait_for_data(self, timeout_seconds: float) -> bool: ...

    def close(self) -> None: ...


class PySerialPort(Protocol):
    in_waiting: int

    def read(self, size: int = 1) -> bytes: ...

    def write(self, data: bytes) -> int | None: ...

    def flush(self) -> None: ...

    def reset_input_buffer(self) -> None: ...

    def close(self) -> None: ...


def raise_windows_serial_error(action: str, error: Exception) -> NoReturn:
    raise OSError(
        errno.EACCES,
        f"Could not {action} Windows serial port. "
        "Close serial monitors, browser Web Serial sessions, or other tools, then retry. "
        f"Details: {error}",
    ) from error


@dataclass(frozen=True)
class PosixSerialConnection:
    fd: int

    def read(self, size: int) -> bytes:
        return os.read(self.fd, size)

    def write(self, data: bytes) -> None:
        os.write(self.fd, data)

    def flush_input(self) -> None:
        try:
            termios.tcflush(self.fd, termios.TCIFLUSH)
        except termios.error:
            pass

    def wait_for_data(self, timeout_seconds: float) -> bool:
        readable, _, _ = select.select([self.fd], [], [], timeout_seconds)
        return bool(readable)

    def close(self) -> None:
        os.close(self.fd)


@dataclass(frozen=True)
class WindowsSerialConnection:
    serial_port: PySerialPort

    def read(self, size: int) -> bytes:
        try:
            return self.serial_port.read(size)
        except Exception as error:
            raise_windows_serial_error("read from", error)

    def write(self, data: bytes) -> None:
        try:
            self.serial_port.write(data)
            self.serial_port.flush()
        except Exception as error:
            raise_windows_serial_error("write to", error)

    def flush_input(self) -> None:
        try:
            self.serial_port.reset_input_buffer()
        except Exception as error:
            raise_windows_serial_error("flush", error)

    def wait_for_data(self, timeout_seconds: float) -> bool:
        # Windows-specific: pyserial COM handles cannot be used with select().
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            if self.read_waiting_bytes() > 0:
                return True
            time.sleep(min(WINDOWS_POLL_INTERVAL_SECONDS, max(0.0, deadline - time.monotonic())))
        return self.read_waiting_bytes() > 0

    def close(self) -> None:
        self.serial_port.close()

    def read_waiting_bytes(self) -> int:
        try:
            return self.serial_port.in_waiting
        except Exception as error:
            # WINDOWS stability: surface transient COM access failures without a pyserial traceback.
            raise_windows_serial_error("poll", error)


@dataclass
class ProbeStats:
    bytes_read: int = 0
    lines: int = 0
    json_lines: int = 0
    data_frames: int = 0
    firmware_version: str | None = None
    configure_saved: bool = False
    reboot_sent: bool = False


@dataclass(frozen=True)
class ConfigureInput:
    ssid: str
    password: str
    server_url: str
    device_id: str
    static_ip: str | None
    gateway: str | None
    subnet: str | None
    dns: str | None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode",
        choices=("configure", "probe", "flash"),
        default="configure",
        help="USB workflow to run. Configure preserves the existing pairing behavior.",
    )
    parser.add_argument("--port", help="Serial device path, for example /dev/cu.usbserial-... or COM3.")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD_RATE)
    parser.add_argument("--seconds", type=float, default=DEFAULT_SECONDS)
    parser.add_argument(
        "--config-stdin",
        action="store_true",
        help="Read pairing config as JSON from stdin so secrets do not appear in process args.",
    )
    parser.add_argument(
        "--reboot-after-configure",
        action="store_true",
        help="Send a reboot command after configureResult ok so saved WiFi config is applied cleanly.",
    )
    parser.add_argument(
        "--server-url",
        help="The host /ws/device URL this controller should use when configured for WiFi.",
    )
    parser.add_argument(
        "--write-probes",
        action="store_true",
        help="Send statusRequest/getConfig/startTelemetry before reading serial data.",
    )
    parser.add_argument("--ssid", help="WiFi SSID to write to the controller.")
    parser.add_argument("--password", help="WiFi password to write to the controller.")
    parser.add_argument("--device-id", default="icaros-station-a-m5")
    parser.add_argument("--static-ip", help="Optional static controller IP.")
    parser.add_argument("--gateway", help="Gateway for optional static controller IP.")
    parser.add_argument("--subnet", help="Subnet mask for optional static controller IP.")
    parser.add_argument("--dns", help="DNS server for optional static controller IP.")
    args = parser.parse_args()
    configure_input = read_configure_input(args)
    if args.mode == "configure" and not args.server_url and configure_input is None:
        raise SystemExit("--server-url is required unless --config-stdin provides serverUrl.")

    server_url = configure_input.server_url if configure_input is not None else (args.server_url or "")
    device_id = configure_input.device_id if configure_input is not None else args.device_id
    print("Icaros Host USB controller setup")
    print(f"Mode: {args.mode}")
    if server_url:
        print(f"Runtime device endpoint: {redact_pairing_token(server_url)}")
    if configure_input is None:
        print("This run checks USB telemetry only; WiFi credentials are not requested or stored.")
    else:
        print("This run writes pairing config over USB; WiFi password is not logged or stored.")

    port = args.port or choose_default_port()
    if not port:
        print("No likely M5 USB serial port found. Reconnect USB or pass --port explicitly.")
        print("Visible serial devices:")
        for device in find_all_serial_ports():
            print(f"- {device}")
        return 2

    print(f"Selected serial port: {port}")
    emit_event(
        state="usb_connected",
        step="USB verbunden",
        progress=10,
        deviceId=device_id,
        usbConnected=True,
        usbPort=port,
        message=f"USB serial port selected: {port}",
    )

    if args.mode == "flash":
        firmware_version = flash_firmware(port=port)
        emit_event(
            state="firmware_update",
            step="Firmware aktualisiert",
            progress=100,
            firmwareVersion=firmware_version,
            flashState="succeeded",
            message="Firmware upload finished and controller reset was triggered by upload.",
        )
        print("Firmware flash passed.")
        return 0

    firmware_version = check_firmware(port=port, baud_rate=args.baud)
    stats = probe_port(
        port=port,
        baud_rate=args.baud,
        seconds=args.seconds,
        configure_input=configure_input,
        write_probes=args.write_probes,
        reboot_after_configure=args.reboot_after_configure,
        firmware_version=firmware_version,
    )
    print(
        "USB summary: "
        f"{stats.bytes_read} bytes, {stats.lines} lines, "
        f"{stats.json_lines} JSON lines, {stats.data_frames} data frames."
    )

    if stats.configure_saved:
        message = "Controller accepted paired configuration."
        if stats.reboot_sent:
            message = "Controller accepted paired configuration and reboot command was sent."
        emit_event(
            state="usb_test",
            step="USB-Konfiguration gespeichert",
            progress=80,
            usbOk=True,
            firmwareVersion=stats.firmware_version,
            message=message,
        )
        print("USB setup passed: controller accepted paired configuration.")
        return 0

    if stats.data_frames > 0:
        emit_event(
            state="usb_test",
            step="USB-Daten geprüft",
            progress=80,
            usbOk=True,
            firmwareVersion=stats.firmware_version,
            message="USB telemetry received. Waiting for WLAN/WebSocket verification.",
        )
        print("USB check passed: controller data is visible on serial.")
        return 0

    if stats.json_lines > 0:
        print("USB check partial: JSON is visible, but no telemetry-like data frame arrived.")
        return 1

    print("USB check failed: no JSON controller data arrived during the probe window.")
    return 1


def choose_default_port() -> str | None:
    if os.name == "nt":
        return choose_default_windows_port()

    for pattern in POSIX_M5_PORT_PATTERNS:
        matches = sorted(glob.glob(pattern))
        if matches:
            return matches[0]
    return None


def find_all_serial_ports() -> list[str]:
    if os.name == "nt":
        return find_all_windows_serial_ports()

    ports: set[str] = set()
    for pattern in ("/dev/cu.*", "/dev/tty.*"):
        ports.update(glob.glob(pattern))
    return sorted(ports)


def choose_default_windows_port() -> str | None:
    # Windows-specific: pyserial exposes COM ports and USB metadata through list_ports.
    ports = list_windows_serial_port_infos()
    if not ports:
        return None

    for port_info in ports:
        searchable = " ".join(
            str(part).lower()
            for part in (
                getattr(port_info, "device", ""),
                getattr(port_info, "description", ""),
                getattr(port_info, "hwid", ""),
                getattr(port_info, "manufacturer", ""),
                getattr(port_info, "product", ""),
            )
        )
        if any(keyword in searchable for keyword in WINDOWS_SERIAL_KEYWORDS):
            return str(port_info.device)

    return str(ports[0].device)


def find_all_windows_serial_ports() -> list[str]:
    # Windows-specific: COM port names are the values users can pass back via --port.
    return [str(port_info.device) for port_info in list_windows_serial_port_infos()]


def list_windows_serial_port_infos() -> list[object]:
    try:
        from serial.tools import list_ports
    except ImportError as error:
        raise SystemExit(
            "Windows USB setup requires pyserial. Run this script with `uv run "
            "scripts/connect-m5-usb.py ...` or install pyserial in the active Python environment."
        ) from error

    ports = list(list_ports.comports())
    ports.sort()
    return ports


def read_configure_input(args: argparse.Namespace) -> ConfigureInput | None:
    if args.config_stdin:
        return read_configure_input_from_stdin(args)

    if not args.ssid and not args.password:
        return None

    if not args.ssid or args.password is None:
        raise SystemExit("--ssid and --password must be passed together for USB pairing.")

    return ConfigureInput(
        ssid=args.ssid,
        password=args.password,
        server_url=args.server_url,
        device_id=args.device_id,
        static_ip=args.static_ip,
        gateway=args.gateway,
        subnet=args.subnet,
        dns=args.dns,
    )


def read_configure_input_from_stdin(args: argparse.Namespace) -> ConfigureInput | None:
    try:
        raw_config = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        raise SystemExit(f"Invalid --config-stdin JSON: {error}") from error

    if not isinstance(raw_config, dict):
        raise SystemExit("--config-stdin JSON must be an object.")

    server_url = read_required_string(raw_config, "serverUrl")
    device_id = read_optional_string(raw_config, "deviceId") or args.device_id
    ssid = read_optional_string(raw_config, "ssid")
    password = read_optional_string(raw_config, "password")

    if ssid is None and password is None:
        args.server_url = server_url
        args.device_id = device_id
        return None

    if ssid is None or password is None:
        raise SystemExit("stdin config ssid and password must be passed together.")

    return ConfigureInput(
        ssid=ssid,
        password=password,
        server_url=server_url,
        device_id=device_id,
        static_ip=read_optional_string(raw_config, "staticIp"),
        gateway=read_optional_string(raw_config, "gateway"),
        subnet=read_optional_string(raw_config, "subnet"),
        dns=read_optional_string(raw_config, "dns"),
    )


def read_required_string(config: dict[object, object], key: str) -> str:
    value = read_optional_string(config, key)
    if value is None:
        raise SystemExit(f"stdin config missing required string field {key}.")
    return value


def read_optional_string(config: dict[object, object], key: str) -> str | None:
    value = config.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise SystemExit(f"stdin config field {key} must be a string or null.")

    trimmed = value.strip()
    return trimmed or None


def check_firmware(*, port: str, baud_rate: int) -> str | None:
    emit_event(
        state="firmware_check",
        step="Firmware prüfen",
        progress=20,
        message="Checking controller firmware version.",
    )
    firmware_version = read_firmware_version(port=port, baud_rate=baud_rate)
    if firmware_version:
        emit_event(
            state="firmware_check",
            step="Firmware geprüft",
            progress=30,
            firmwareVersion=firmware_version,
            message=f"Firmware version {firmware_version} detected.",
        )
    else:
        emit_event(
            state="firmware_check",
            step="Firmware nicht erkannt",
            progress=30,
            message="No firmware version was detected over USB.",
        )

    if firmware_version == REQUIRED_FIRMWARE_VERSION:
        return firmware_version

    emit_event(
        state="firmware_check",
        step="Firmware geprüft",
        progress=35,
        firmwareVersion=firmware_version,
        message="Firmware update not requested in this USB workflow.",
    )
    return firmware_version


def flash_firmware(*, port: str) -> str:
    firmware_dir = Path(os.environ.get("ICAROS_M5_FIRMWARE_DIR", str(DEFAULT_FIRMWARE_DIR)))
    if not firmware_dir.exists():
        raise SystemExit(f"M5 firmware project not found at {firmware_dir}; cannot update firmware.")

    emit_event(
        state="firmware_update",
        step="Firmware aktualisieren",
        progress=40,
        flashState="running",
        message="Building and uploading local controller firmware.",
    )
    run_firmware_update(firmware_dir=firmware_dir, port=port)
    time.sleep(2.0)
    return REQUIRED_FIRMWARE_VERSION


def read_firmware_version(*, port: str, baud_rate: int) -> str | None:
    try:
        connection = open_serial_port(port, baud_rate)
    except OSError:
        return None

    deadline = time.monotonic() + FIRMWARE_CHECK_SECONDS
    buffer = b""
    try:
        while time.monotonic() < deadline:
            if not connection.wait_for_data(0.2):
                continue

            chunk = connection.read(4096)
            if not chunk:
                continue

            buffer += chunk
            while b"\n" in buffer:
                raw_line, buffer = buffer.split(b"\n", 1)
                parsed = parse_json_object(raw_line.decode("utf-8", errors="replace").strip())
                if parsed is None:
                    continue
                version = parsed.get("firmwareVersion")
                if isinstance(version, str) and version:
                    return version
    except OSError:
        return None
    finally:
        connection.close()

    return None


def run_firmware_update(*, firmware_dir: Path, port: str) -> None:
    command = [
        "uvx",
        "--from",
        "platformio",
        "platformio",
        "run",
        "-d",
        str(firmware_dir),
        "--target",
        "upload",
        "--upload-port",
        port,
    ]
    result = subprocess.run(
        command,
        cwd=Path.cwd(),
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if result.returncode != 0:
        raise SystemExit("Firmware upload failed.")


def probe_port(
    *,
    port: str,
    baud_rate: int,
    seconds: float,
    configure_input: ConfigureInput | None,
    write_probes: bool,
    reboot_after_configure: bool,
    firmware_version: str | None,
) -> ProbeStats:
    stats = ProbeStats()
    stats.firmware_version = firmware_version
    started_at = time.monotonic()
    deadline = started_at + seconds
    buffer = b""

    try:
        connection = open_serial_port(port, baud_rate)
    except OSError as error:
        explain_open_error(port, error)
        return stats

    try:
        if configure_input is not None:
            emit_event(
                state="configure",
                step="Controller konfigurieren",
                progress=60,
                deviceId=configure_input.device_id,
                firmwareVersion=firmware_version,
                message="Writing paired WLAN/WebSocket configuration over USB.",
            )
            send_configure_request(connection, configure_input)
            stats.configure_saved = True
            if reboot_after_configure:
                send_reboot_request(connection)
                stats.reboot_sent = True
        if write_probes:
            buffer = write_probe_messages(connection, stats)
        emit_event(
            state="usb_test",
            step="USB-Daten prüfen",
            progress=70,
            deviceId=configure_input.device_id if configure_input else None,
            firmwareVersion=firmware_version,
            message="Checking USB telemetry frames.",
        )
        while time.monotonic() < deadline:
            if not connection.wait_for_data(0.2):
                continue

            chunk = connection.read(4096)
            if not chunk:
                continue

            stats.bytes_read += len(chunk)
            buffer += chunk

            while b"\n" in buffer:
                raw_line, buffer = buffer.split(b"\n", 1)
                handle_line(raw_line.rstrip(b"\r"), stats)

        if buffer:
            handle_line(buffer.rstrip(b"\r"), stats)
    except OSError as error:
        explain_serial_error(port, error)
    finally:
        connection.close()

    return stats


def send_configure_request(connection: SerialConnection, configure_input: ConfigureInput) -> None:
    request = build_configure_request(configure_input)
    safe_request = {
        key: value for key, value in request.items() if key not in {"password", "ssid"}
    }
    safe_request["ssid"] = "<redacted>"
    safe_request["serverUrl"] = redact_pairing_token(str(safe_request["serverUrl"]))
    print(f"Sending configure frame: {json.dumps(safe_request, ensure_ascii=False)}")

    configure_line = json.dumps(request, separators=(",", ":")).encode("utf-8") + b"\n"
    started_at = time.monotonic()
    last_sent_at = 0.0
    buffer = b""
    while time.monotonic() - started_at < CONFIGURE_RESULT_TIMEOUT_SECONDS:
        now = time.monotonic()
        if last_sent_at == 0.0 or now - last_sent_at >= CONFIGURE_RETRY_INTERVAL_SECONDS:
            connection.flush_input()
            connection.write(configure_line)
            last_sent_at = now

        if not connection.wait_for_data(0.2):
            continue

        chunk = connection.read(4096)
        if not chunk:
            continue

        buffer += chunk
        while b"\n" in buffer:
            raw_line, buffer = buffer.split(b"\n", 1)
            result = parse_configure_result_line(raw_line)
            if result is None:
                continue

            print(f"configureResult: {summarize_json(result)}")
            if result.get("ok") is True:
                emit_event(
                    state="configure",
                    step="Konfiguration gespeichert",
                    progress=68,
                    deviceId=configure_input.device_id,
                    message="Controller accepted paired configuration.",
                )
                return
            message = result.get("message")
            detail = f": {message}" if isinstance(message, str) and message else "."
            raise SystemExit(f"Controller rejected configure frame{detail}")

    raise SystemExit("Timed out waiting for configureResult.")


def send_reboot_request(connection: SerialConnection) -> None:
    request = {"type": "reboot"}
    connection.write(json.dumps(request, separators=(",", ":")).encode("utf-8") + b"\n")
    print("Sent USB command: reboot")
    emit_event(
        state="configure",
        step="Controller neu starten",
        progress=72,
        message="Reboot command sent so saved WLAN/WebSocket configuration is applied cleanly.",
    )


def parse_configure_result_line(raw_line: bytes) -> dict[str, object] | None:
    parsed = parse_json_object(raw_line.decode("utf-8", errors="replace").strip())
    if parsed is None or parsed.get("type") != "configureResult":
        return None
    return parsed


def build_configure_request(configure_input: ConfigureInput) -> dict[str, str]:
    request = {
        "type": "configure",
        "ssid": configure_input.ssid,
        "password": configure_input.password,
        "serverUrl": configure_input.server_url,
        "deviceId": configure_input.device_id,
    }
    optional_fields = {
        "staticIp": configure_input.static_ip,
        "gateway": configure_input.gateway,
        "subnet": configure_input.subnet,
        "dns": configure_input.dns,
    }
    request.update({key: value for key, value in optional_fields.items() if value})
    return request


def open_serial_port(port: str, baud_rate: int) -> SerialConnection:
    if os.name == "nt":
        return open_windows_serial_port(port, baud_rate)

    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        configure_serial_fd(fd, baud_rate)
        try:
            os.set_blocking(fd, False)
        except AttributeError:
            pass
        return PosixSerialConnection(fd)
    except Exception:
        os.close(fd)
        raise


def open_windows_serial_port(port: str, baud_rate: int) -> SerialConnection:
    # Windows-specific: COM ports are opened through pyserial instead of POSIX fd APIs.
    try:
        from serial import EIGHTBITS, PARITY_NONE, STOPBITS_ONE, Serial
    except ImportError as error:
        raise SystemExit(
            "Windows USB setup requires pyserial. Run this script with `uv run "
            "scripts/connect-m5-usb.py ...` or install pyserial in the active Python environment."
        ) from error

    try:
        serial_port = Serial(
            port=port,
            baudrate=baud_rate,
            bytesize=EIGHTBITS,
            parity=PARITY_NONE,
            stopbits=STOPBITS_ONE,
            timeout=0,
            write_timeout=2,
            xonxoff=False,
            rtscts=False,
            dsrdtr=False,
        )
    except Exception as error:
        raise OSError(errno.EIO, str(error)) from error

    return WindowsSerialConnection(cast(PySerialPort, serial_port))


def configure_serial_fd(fd: int, baud_rate: int) -> None:
    baud_constant = POSIX_BAUD_CONSTANTS.get(baud_rate)
    if baud_constant is None:
        raise OSError(errno.EINVAL, f"Unsupported baud rate: {baud_rate}")

    attrs = termios.tcgetattr(fd)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = baud_constant | termios.CS8 | termios.CREAD | termios.CLOCAL
    attrs[3] = 0
    attrs[4] = baud_constant
    attrs[5] = baud_constant
    attrs[6][termios.VMIN] = 0
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)


def write_probe_messages(connection: SerialConnection, stats: ProbeStats) -> bytes:
    connection.flush_input()
    send_probe_message(connection, DIAGNOSE_PROBE_MESSAGE)
    buffer = read_until_frame_type(connection, stats, "diagnoseResult")

    for message in LEGACY_PROBE_MESSAGES:
        send_probe_message(connection, message)
        time.sleep(0.15)

    return buffer


def send_probe_message(connection: SerialConnection, message: dict[str, str]) -> None:
    line = json.dumps(message, separators=(",", ":")).encode("utf-8") + b"\n"
    connection.write(line)
    print(f"Sent USB probe: {message['type']}")


def read_until_frame_type(
    connection: SerialConnection, stats: ProbeStats, expected_type: str
) -> bytes:
    deadline = time.monotonic() + DIAGNOSE_RESULT_TIMEOUT_SECONDS
    buffer = b""

    while time.monotonic() < deadline:
        if not connection.wait_for_data(0.2):
            continue

        chunk = connection.read(4096)
        if not chunk:
            continue

        stats.bytes_read += len(chunk)
        buffer += chunk
        while b"\n" in buffer:
            raw_line, buffer = buffer.split(b"\n", 1)
            parsed = handle_line(raw_line.rstrip(b"\r"), stats)
            if parsed is not None and parsed.get("type") == expected_type:
                return buffer

    return buffer


def handle_line(raw_line: bytes, stats: ProbeStats) -> dict[str, object] | None:
    if not raw_line:
        return None

    stats.lines += 1
    text = raw_line.decode("utf-8", errors="replace").strip()
    parsed = parse_json_object(text)
    if parsed is None:
        print(f"serial text: {text[:180]}")
        return None

    stats.json_lines += 1
    frame_type = parsed.get("type")
    version = parsed.get("firmwareVersion")
    if isinstance(version, str) and version:
        stats.firmware_version = version
    print(f"serial json: {summarize_json(parsed)}")
    if is_data_frame(frame_type, parsed):
        stats.data_frames += 1
    return parsed


def parse_json_object(text: str) -> dict[str, object] | None:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None

    if isinstance(parsed, dict):
        return parsed
    return None


def is_data_frame(frame_type: object, parsed: dict[str, object]) -> bool:
    if isinstance(frame_type, str) and frame_type in FRAME_TYPES_THAT_PROVE_DATA:
        return True

    numeric_fields = ("pitch", "roll", "angleX", "angleY", "rotationX", "rotationY")
    return any(isinstance(parsed.get(field), (int, float)) for field in numeric_fields)


def summarize_json(parsed: dict[str, object]) -> str:
    public_keys = (
        "type",
        "deviceId",
        "firmwareVersion",
        "wifiStatus",
        "localIp",
        "wsHost",
        "wsPort",
        "wsPath",
        "tcpProbeOk",
        "webSocketConfigured",
        "webSocketConnected",
        "lastWebSocketError",
        "pitch",
        "roll",
        "angleX",
        "angleY",
        "rotationX",
        "rotationY",
        "quality",
        "rssi",
        "uptimeMs",
        "message",
        "ok",
    )
    summary = {key: parsed[key] for key in public_keys if key in parsed}
    ws_path = summary.get("wsPath")
    if isinstance(ws_path, str):
        summary["wsPath"] = redact_pairing_token(ws_path)
    server_url = parsed.get("serverUrl")
    if isinstance(server_url, str):
        summary["serverUrl"] = redact_pairing_token(server_url)
    if summary:
        return json.dumps(summary, ensure_ascii=False, separators=(",", ":"))[:700]

    fallback = {"keys": sorted(str(key) for key in parsed.keys())}
    return json.dumps(fallback, ensure_ascii=False, separators=(",", ":"))[:700]


def explain_open_error(port: str, error: OSError) -> None:
    print(f"Could not open {port}: {error}")
    if error.errno in (errno.EBUSY, errno.EACCES):
        print("Close serial monitors, browser Web Serial sessions, or other tools, then retry.")


def explain_serial_error(port: str, error: OSError) -> None:
    print(f"Could not access {port}: {error}")
    if error.errno in (errno.EBUSY, errno.EACCES, errno.EIO):
        print("Close serial monitors, browser Web Serial sessions, or other tools, then retry.")


def emit_event(**event: object) -> None:
    clean_event = {key: value for key, value in event.items() if value is not None}
    print(f"{PAIRING_EVENT_PREFIX}{json.dumps(clean_event, separators=(',', ':'))}")


def redact_pairing_token(server_url: str) -> str:
    parsed = urlsplit(server_url)
    query = [
        (key, "redacted" if key == "pairing" else value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
    ]
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


if __name__ == "__main__":
    raise SystemExit(main())
