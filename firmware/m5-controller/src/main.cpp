// Purpose: minimal M5StickC Plus2 controller firmware for Icaros Host.
//
// It reads newline-delimited USB JSON config, stores WiFi and plain ws:// target
// settings, connects non-blockingly, and streams Host-compatible register,
// heartbeat, and orientation frames. It intentionally does not implement WSS,
// browser UI behavior, or automatic flashing.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <M5Unified.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <esp_system.h>

#include <cmath>
#include <cstring>

#include "controller_display.h"

namespace {

constexpr const char *FirmwareVersion = "0.2.2-icaros-ws-reconnect";
constexpr const char *DeviceRole = "controller";
constexpr const char *PreferencesNamespace = "icaros-m5";
constexpr const char *FallbackDeviceId = "icaros-station-a-m5";

constexpr uint32_t WifiReconnectIntervalMs = 3000;
constexpr uint32_t WebSocketReconnectIntervalMs = 3000;
constexpr uint32_t HeartbeatIntervalMs = 2000;
constexpr uint32_t OrientationIntervalMs = 50;
constexpr uint32_t SerialOrientationMirrorIntervalMs = 250;
constexpr uint32_t DisplayIntervalMs = 250;
constexpr uint32_t StatusIntervalMs = 5000;
constexpr uint32_t SerialCommandQuietMs = 1000;
constexpr uint32_t SerialBufferLimit = 768;
constexpr uint16_t DefaultWebSocketPort = 80;
constexpr uint16_t TcpProbeTimeoutMs = 1500;

struct DeviceConfig {
  String ssid;
  String password;
  String serverUrl;
  String deviceId;
};

struct WebSocketEndpoint {
  String host;
  String path = "/";
  uint16_t port = DefaultWebSocketPort;
};

struct ParseResult {
  bool ok;
  const char *error;
};

struct ImuSample {
  float accelX = 0.0F;
  float accelY = 0.0F;
  float accelZ = 0.0F;
  float gyroX = 0.0F;
  float gyroY = 0.0F;
  float gyroZ = 0.0F;
  float pitch = 0.0F;
  float roll = 0.0F;
};

Preferences preferences;
WebSocketsClient webSocket;
DeviceConfig config;
ImuSample lastSample;

String serialLine;
String lastWebSocketError = "";

uint32_t lastWifiAttemptMs = 0;
uint32_t lastWebSocketAttemptMs = 0;
uint32_t lastHeartbeatMs = 0;
uint32_t lastOrientationMs = 0;
uint32_t lastSerialOrientationMirrorMs = 0;
uint32_t lastDisplayMs = 0;
uint32_t lastStatusMs = 0;
uint32_t serialQuietUntilMs = 0;

bool hasConfig = false;
bool webSocketConfigured = false;
bool webSocketConnected = false;

ParseResult okResult() {
  return {true, ""};
}

ParseResult errorResult(const char *error) {
  return {false, error};
}

bool hasNetworkConfig(const DeviceConfig &targetConfig) {
  return targetConfig.ssid.length() > 0 && targetConfig.serverUrl.length() > 0 &&
         targetConfig.deviceId.length() > 0;
}

const char *effectiveDeviceId() {
  return config.deviceId.length() > 0 ? config.deviceId.c_str() : FallbackDeviceId;
}

bool parsePositivePort(const String &value, uint16_t &port) {
  if (value.length() == 0 || value.length() > 5) {
    return false;
  }

  uint32_t parsedPort = 0;
  for (size_t index = 0; index < value.length(); index += 1) {
    const char nextChar = value.charAt(index);
    if (!isDigit(nextChar)) {
      return false;
    }

    parsedPort = (parsedPort * 10U) + static_cast<uint32_t>(nextChar - '0');
    if (parsedPort > 65535U) {
      return false;
    }
  }

  if (parsedPort == 0U) {
    return false;
  }

  port = static_cast<uint16_t>(parsedPort);
  return true;
}

ParseResult parseWebSocketUrl(const String &serverUrl, WebSocketEndpoint &endpoint) {
  String url = serverUrl;
  url.trim();
  endpoint = WebSocketEndpoint{};

  if (url.startsWith("wss://")) {
    return errorResult("wss URLs are not supported");
  }

  if (!url.startsWith("ws://")) {
    return errorResult("URL must start with ws://");
  }

  url.remove(0, 5);
  const int pathStart = url.indexOf('/');
  String authority = pathStart >= 0 ? url.substring(0, pathStart) : url;
  authority.trim();
  endpoint.path = pathStart >= 0 ? url.substring(pathStart) : "/";
  endpoint.path.trim();

  if (authority.length() == 0) {
    return errorResult("WebSocket host is missing");
  }

  if (authority.startsWith("[") || authority.indexOf(']') >= 0) {
    return errorResult("IPv6 hosts are not supported");
  }

  const int portStart = authority.lastIndexOf(':');
  if (portStart >= 0) {
    endpoint.host = authority.substring(0, portStart);
    String portText = authority.substring(portStart + 1);
    if (!parsePositivePort(portText, endpoint.port)) {
      return errorResult("WebSocket port is invalid");
    }
  } else {
    endpoint.host = authority;
    endpoint.port = DefaultWebSocketPort;
  }

  endpoint.host.trim();
  if (endpoint.host.length() == 0) {
    return errorResult("WebSocket host is missing");
  }

  if (endpoint.host.indexOf(':') >= 0) {
    return errorResult("IPv6 hosts are not supported");
  }

  if (endpoint.path.length() == 0 || !endpoint.path.startsWith("/")) {
    return errorResult("WebSocket path is invalid");
  }

  return okResult();
}

String redactPairingToken(const String &serverUrl) {
  String output = serverUrl;
  int searchFrom = 0;
  while (true) {
    const int tokenStart = output.indexOf("pairing=", searchFrom);
    if (tokenStart < 0) {
      return output;
    }

    const int valueStart = tokenStart + 8;
    int valueEnd = output.indexOf('&', valueStart);
    if (valueEnd < 0) {
      valueEnd = output.length();
    }

    output = output.substring(0, valueStart) + "redacted" + output.substring(valueEnd);
    searchFrom = valueStart + 8;
  }
}

String redactPairingTokenInPath(const String &path) {
  return redactPairingToken("ws://placeholder" + path).substring(16);
}

bool probeTcpConnection(const WebSocketEndpoint &endpoint) {
  WiFiClient client;
  client.setTimeout(TcpProbeTimeoutMs);
  const bool connected = client.connect(endpoint.host.c_str(), endpoint.port);
  client.stop();
  return connected;
}

void loadConfig() {
  preferences.begin(PreferencesNamespace, true);
  config.ssid = preferences.getString("ssid", "");
  config.password = preferences.getString("password", "");
  config.serverUrl = preferences.getString("serverUrl", "");
  config.deviceId = preferences.getString("deviceId", "");
  preferences.end();
  hasConfig = hasNetworkConfig(config);
}

bool saveConfig(const DeviceConfig &nextConfig) {
  preferences.begin(PreferencesNamespace, false);
  preferences.putString("ssid", nextConfig.ssid);
  preferences.putString("password", nextConfig.password);
  preferences.putString("serverUrl", nextConfig.serverUrl);
  preferences.putString("deviceId", nextConfig.deviceId);
  preferences.end();

  config = nextConfig;
  hasConfig = hasNetworkConfig(config);
  return hasConfig;
}

template <typename TDocument>
void sendSerialJson(TDocument &document) {
  serializeJson(document, Serial);
  Serial.println();
}

template <typename TDocument>
bool sendWebSocketJson(TDocument &document, bool mirrorSerial) {
  String payload;
  serializeJson(document, payload);
  if (mirrorSerial) {
    Serial.println(payload);
  }

  if (!webSocketConnected) {
    return false;
  }

  return webSocket.sendTXT(payload);
}

template <typename TDocument>
void addBaseFrame(TDocument &document, const char *type) {
  document["type"] = type;
  document["deviceId"] = effectiveDeviceId();
  document["role"] = DeviceRole;
}

void sendRegisterFrame() {
  JsonDocument document;
  addBaseFrame(document, "register");
  document["firmwareVersion"] = FirmwareVersion;
  JsonArray capabilities = document["capabilities"].to<JsonArray>();
  capabilities.add("imu");
  capabilities.add("orientation");
  sendWebSocketJson(document, true);
}

void sendHeartbeatFrame() {
  JsonDocument document;
  addBaseFrame(document, "heartbeat");
  document["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  document["uptimeMs"] = millis();
  document["quality"] = 1;
  sendWebSocketJson(document, true);
}

void sendOrientationFrame(const ImuSample &sample, bool mirrorSerial) {
  JsonDocument document;
  addBaseFrame(document, "orientation");
  document["pitch"] = sample.pitch;
  document["roll"] = sample.roll;
  document["quality"] = 1;
  sendWebSocketJson(document, mirrorSerial);
}

void sendDiagnoseResult() {
  serialQuietUntilMs = millis() + SerialCommandQuietMs;

  WebSocketEndpoint endpoint;
  const ParseResult result = parseWebSocketUrl(config.serverUrl, endpoint);

  JsonDocument document;
  document["type"] = "diagnoseResult";
  document["firmwareVersion"] = FirmwareVersion;
  document["deviceId"] = effectiveDeviceId();
  document["wifiStatus"] = WiFi.status();
  document["localIp"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  document["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  document["serverUrl"] = redactPairingToken(config.serverUrl);
  document["wsHost"] = result.ok ? endpoint.host : "";
  document["wsPort"] = result.ok ? endpoint.port : 0;
  document["wsPath"] = result.ok ? redactPairingTokenInPath(endpoint.path) : "";
  document["tcpProbeOk"] = result.ok && WiFi.status() == WL_CONNECTED ? probeTcpConnection(endpoint) : false;
  document["webSocketConfigured"] = webSocketConfigured;
  document["webSocketConnected"] = webSocketConnected;
  document["lastWebSocketError"] = lastWebSocketError.length() > 0 ? lastWebSocketError.c_str() : result.error;
  sendSerialJson(document);
}

void sendConfigureResult(bool ok, const char *message) {
  JsonDocument document;
  document["type"] = "configureResult";
  document["ok"] = ok;
  document["message"] = message;
  document["firmwareVersion"] = FirmwareVersion;
  if (config.deviceId.length() > 0) {
    document["deviceId"] = config.deviceId;
  }
  sendSerialJson(document);
}

void disconnectWebSocket() {
  if (webSocketConfigured || webSocketConnected) {
    webSocket.disconnect();
  }
  webSocketConfigured = false;
  webSocketConnected = false;
}

void handleWebSocketEvent(WStype_t type, uint8_t *, size_t) {
  switch (type) {
    case WStype_CONNECTED:
      webSocketConnected = true;
      webSocketConfigured = true;
      lastWebSocketError = "";
      sendRegisterFrame();
      break;
    case WStype_DISCONNECTED:
      webSocketConnected = false;
      webSocketConfigured = false;
      lastWebSocketError = "disconnected";
      break;
    case WStype_ERROR:
      webSocketConnected = false;
      webSocketConfigured = false;
      lastWebSocketError = "websocket error";
      break;
    default:
      break;
  }
}

void beginWifiConnection(uint32_t nowMs) {
  if (!hasConfig || WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (lastWifiAttemptMs != 0 && nowMs - lastWifiAttemptMs < WifiReconnectIntervalMs) {
    return;
  }

  lastWifiAttemptMs = nowMs;
  WiFi.disconnect(false);
  WiFi.begin(config.ssid.c_str(), config.password.c_str());
}

void beginWebSocketConnection(uint32_t nowMs) {
  if (!hasConfig || WiFi.status() != WL_CONNECTED || webSocketConfigured) {
    return;
  }

  if (lastWebSocketAttemptMs != 0 && nowMs - lastWebSocketAttemptMs < WebSocketReconnectIntervalMs) {
    return;
  }

  WebSocketEndpoint endpoint;
  const ParseResult result = parseWebSocketUrl(config.serverUrl, endpoint);
  lastWebSocketAttemptMs = nowMs;

  if (!result.ok) {
    lastWebSocketError = result.error;
    return;
  }

  lastWebSocketError = "";
  webSocket.begin(endpoint.host.c_str(), endpoint.port, endpoint.path.c_str(), "");
  webSocket.onEvent(handleWebSocketEvent);
  webSocket.setReconnectInterval(WebSocketReconnectIntervalMs);
  webSocketConfigured = true;
}

void maintainConnections(uint32_t nowMs) {
  if (!hasConfig) {
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    disconnectWebSocket();
    beginWifiConnection(nowMs);
    return;
  }

  beginWebSocketConnection(nowMs);
}

DeviceConfig readConfigFromDocument(JsonDocument &document) {
  DeviceConfig nextConfig;
  nextConfig.ssid = document["ssid"] | "";
  nextConfig.password = document["password"] | "";
  nextConfig.serverUrl = document["serverUrl"] | "";
  nextConfig.deviceId = document["deviceId"] | "";
  nextConfig.ssid.trim();
  nextConfig.serverUrl.trim();
  nextConfig.deviceId.trim();
  return nextConfig;
}

void applySavedConfig(const DeviceConfig &nextConfig) {
  disconnectWebSocket();
  WiFi.disconnect(false);
  lastWifiAttemptMs = 0;
  lastWebSocketAttemptMs = 0;
  saveConfig(nextConfig);
}

void handleConfigure(JsonDocument &document) {
  const DeviceConfig nextConfig = readConfigFromDocument(document);
  if (!hasNetworkConfig(nextConfig)) {
    sendConfigureResult(false, "Missing ssid, serverUrl, or deviceId");
    return;
  }

  WebSocketEndpoint endpoint;
  const ParseResult result = parseWebSocketUrl(nextConfig.serverUrl, endpoint);
  if (!result.ok) {
    sendConfigureResult(false, result.error);
    return;
  }

  applySavedConfig(nextConfig);
  sendConfigureResult(true, "Configuration saved");
}

void handleSerialDocument(JsonDocument &document) {
  const char *type = document["type"] | "";

  if (strcmp(type, "configure") == 0) {
    handleConfigure(document);
    return;
  }

  if (strcmp(type, "diagnose") == 0) {
    sendDiagnoseResult();
    return;
  }

  if (strcmp(type, "reboot") == 0) {
    sendConfigureResult(true, "Rebooting");
    Serial.flush();
    delay(100);
    ESP.restart();
    return;
  }

  sendConfigureResult(false, "Unsupported setup message");
}

void handleSerialLine() {
  serialQuietUntilMs = millis() + SerialCommandQuietMs;

  JsonDocument document;
  DeserializationError error = deserializeJson(document, serialLine);
  serialLine = "";

  if (error) {
    sendConfigureResult(false, "Invalid JSON");
    return;
  }

  handleSerialDocument(document);
}

void readSerialSetup() {
  while (Serial.available() > 0) {
    const char nextChar = static_cast<char>(Serial.read());
    if (nextChar == '\r') {
      continue;
    }

    if (nextChar == '\n') {
      handleSerialLine();
      continue;
    }

    if (serialLine.length() < SerialBufferLimit) {
      serialLine += nextChar;
      continue;
    }

    serialLine = "";
    sendConfigureResult(false, "Setup message too long");
  }
}

bool readImuSample(ImuSample &sample) {
  if (M5.Imu.getType() == m5::imu_none || !M5.Imu.update()) {
    sample.pitch = 0.0F;
    sample.roll = 0.0F;
    return false;
  }

  const auto data = M5.Imu.getImuData();
  sample.accelX = data.accel.x;
  sample.accelY = data.accel.y;
  sample.accelZ = data.accel.z;
  sample.gyroX = data.gyro.x;
  sample.gyroY = data.gyro.y;
  sample.gyroZ = data.gyro.z;
  sample.pitch =
      atan2f(sample.accelY, sqrtf(sample.accelX * sample.accelX + sample.accelZ * sample.accelZ)) *
      180.0F / PI;
  sample.roll = atan2f(-sample.accelX, sample.accelZ) * 180.0F / PI;
  return true;
}

void sendTelemetry(uint32_t nowMs) {
  if (nowMs - lastHeartbeatMs >= HeartbeatIntervalMs) {
    lastHeartbeatMs = nowMs;
    sendHeartbeatFrame();
  }

  if (nowMs - lastOrientationMs < OrientationIntervalMs) {
    return;
  }

  lastOrientationMs = nowMs;
  ImuSample sample = lastSample;
  readImuSample(sample);
  lastSample = sample;

  const bool serialQuiet = nowMs < serialQuietUntilMs;
  const bool serialMirrorDue =
      lastSerialOrientationMirrorMs == 0 ||
      nowMs - lastSerialOrientationMirrorMs >= SerialOrientationMirrorIntervalMs;
  const bool mirrorSerial = !serialQuiet && serialMirrorDue;
  if (mirrorSerial) {
    lastSerialOrientationMirrorMs = nowMs;
  }
  sendOrientationFrame(lastSample, mirrorSerial);
}

void sendPeriodicStatus(uint32_t nowMs) {
  if (nowMs - lastStatusMs < StatusIntervalMs) {
    return;
  }

  lastStatusMs = nowMs;
  WebSocketEndpoint endpoint;
  const ParseResult result = parseWebSocketUrl(config.serverUrl, endpoint);

  JsonDocument document;
  document["type"] = "status";
  document["firmwareVersion"] = FirmwareVersion;
  document["deviceId"] = effectiveDeviceId();
  document["wifiStatus"] = WiFi.status();
  document["localIp"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  document["serverUrl"] = redactPairingToken(config.serverUrl);
  document["wsHost"] = result.ok ? endpoint.host : "";
  document["wsPort"] = result.ok ? endpoint.port : 0;
  document["wsPath"] = result.ok ? redactPairingTokenInPath(endpoint.path) : "";
  document["webSocketConfigured"] = webSocketConfigured;
  document["webSocketConnected"] = webSocketConnected;
  document["lastWebSocketError"] = lastWebSocketError;
  sendSerialJson(document);
}

void renderDisplay(uint32_t nowMs) {
  if (lastDisplayMs != 0 && nowMs - lastDisplayMs < DisplayIntervalMs) {
    return;
  }

  lastDisplayMs = nowMs;
  ControllerDisplayState displayState;
  displayState.pitch = lastSample.pitch;
  displayState.roll = lastSample.roll;
  displayState.wifiConnected = WiFi.status() == WL_CONNECTED;
  displayState.webSocketConnected = webSocketConnected;
  displayState.localIp = displayState.wifiConnected ? WiFi.localIP().toString() : "";
  displayState.serverUrl = config.serverUrl;
  renderControllerDisplay(displayState);
}

}  // namespace

void setup() {
  auto m5Config = M5.config();
  m5Config.serial_baudrate = 115200;
  m5Config.clear_display = true;
  m5Config.internal_imu = true;
  M5.begin(m5Config);
  beginControllerDisplay();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);

  loadConfig();
  webSocket.onEvent(handleWebSocketEvent);
  sendConfigureResult(hasConfig, hasConfig ? "Configuration loaded" : "No saved configuration");
  sendRegisterFrame();
  sendDiagnoseResult();
}

void loop() {
  const uint32_t nowMs = millis();

  M5.update();
  readSerialSetup();
  maintainConnections(nowMs);

  if (webSocketConfigured || webSocketConnected) {
    webSocket.loop();
  }

  sendTelemetry(nowMs);
  renderDisplay(nowMs);
  sendPeriodicStatus(nowMs);
  yield();
}
