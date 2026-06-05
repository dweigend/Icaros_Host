// Purpose: public display boundary for the Icaros M5 controller firmware.
//
// The display module owns only local diagnostics rendering: a simple level,
// connection state, local IP, and a redacted server URL. It does not own WiFi,
// WebSocket, pairing, IMU sampling, or telemetry transport behavior.

#pragma once

#include <Arduino.h>

struct ControllerDisplayState {
  float pitch = 0.0F;
  float roll = 0.0F;
  bool wifiConnected = false;
  bool webSocketConnected = false;
  String localIp;
  String serverUrl;
};

void beginControllerDisplay();
void renderControllerDisplay(const ControllerDisplayState &state);
