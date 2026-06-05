// Purpose: render local diagnostics on the M5StickC Plus2 display.
//
// This file intentionally stays presentation-only. It receives already sampled
// orientation and connection state, redacts sensitive URL query values before
// drawing them, and never changes controller pairing or WebSocket behavior.

#include "controller_display.h"

#include <M5Unified.h>

#include <cmath>

namespace {

constexpr int16_t DisplayRotation = 1;
constexpr int16_t Padding = 8;
constexpr int16_t HeaderHeight = 22;
constexpr int16_t LevelTop = 30;
constexpr int16_t LevelHeight = 82;
constexpr int16_t StatusTop = 118;
constexpr float MaxLevelDegrees = 35.0F;

M5Canvas frameBuffer(&M5.Display);
bool frameBufferReady = false;

uint16_t backgroundColor() {
  return M5.Display.color565(8, 12, 18);
}

uint16_t panelColor() {
  return M5.Display.color565(18, 25, 34);
}

uint16_t mutedColor() {
  return M5.Display.color565(139, 154, 171);
}

uint16_t textColor() {
  return M5.Display.color565(236, 241, 247);
}

uint16_t okColor() {
  return M5.Display.color565(66, 211, 146);
}

uint16_t warnColor() {
  return M5.Display.color565(255, 190, 87);
}

float clampFloat(float value, float minValue, float maxValue) {
  if (value < minValue) {
    return minValue;
  }

  if (value > maxValue) {
    return maxValue;
  }

  return value;
}

String formatDegrees(float value) {
  if (!std::isfinite(value)) {
    return "0.0";
  }

  return String(value, 1);
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

String fitText(String text, uint16_t maxWidth) {
  if (frameBuffer.textWidth(text) <= maxWidth) {
    return text;
  }

  while (text.length() > 4 && frameBuffer.textWidth("..." + text) > maxWidth) {
    text.remove(0, 1);
  }

  return "..." + text;
}

void drawHeader(const ControllerDisplayState &state) {
  const uint16_t statusColor = state.webSocketConnected ? okColor() : warnColor();
  frameBuffer.fillRect(0, 0, frameBuffer.width(), HeaderHeight, panelColor());
  frameBuffer.setTextSize(1);
  frameBuffer.setTextColor(textColor(), panelColor());
  frameBuffer.drawString("Icaros M5", Padding, 7);
  frameBuffer.fillCircle(frameBuffer.width() - 15, 11, 5, statusColor);
}

void drawLevel(const ControllerDisplayState &state) {
  const int16_t width = frameBuffer.width() - (Padding * 2);
  const int16_t centerX = Padding + (width / 2);
  const int16_t centerY = LevelTop + (LevelHeight / 2);
  const int16_t radius = 29;
  const float xRatio = clampFloat(state.pitch / MaxLevelDegrees, -1.0F, 1.0F);
  const float yRatio = clampFloat(-state.roll / MaxLevelDegrees, -1.0F, 1.0F);
  const int16_t bubbleX = centerX + static_cast<int16_t>(xRatio * radius);
  const int16_t bubbleY = centerY + static_cast<int16_t>(yRatio * radius);

  frameBuffer.drawRoundRect(Padding, LevelTop, width, LevelHeight, 6, mutedColor());
  frameBuffer.drawLine(centerX - radius, centerY, centerX + radius, centerY, mutedColor());
  frameBuffer.drawLine(centerX, centerY - radius, centerX, centerY + radius, mutedColor());
  frameBuffer.drawCircle(centerX, centerY, radius, mutedColor());
  frameBuffer.fillCircle(bubbleX, bubbleY, 7, okColor());

  frameBuffer.setTextColor(textColor(), backgroundColor());
  frameBuffer.drawString("P " + formatDegrees(state.pitch), Padding + 4, LevelTop + 6);
  frameBuffer.drawString("R " + formatDegrees(state.roll), Padding + 4, LevelTop + 21);
}

void drawStatusRow(const char *label, const String &value, int16_t y, uint16_t valueColor) {
  frameBuffer.setTextSize(1);
  frameBuffer.setTextColor(mutedColor(), backgroundColor());
  frameBuffer.drawString(label, Padding, y);

  const int16_t valueX = 55;
  const uint16_t maxWidth = static_cast<uint16_t>(frameBuffer.width() - valueX - Padding);
  frameBuffer.setTextColor(valueColor, backgroundColor());
  frameBuffer.drawString(fitText(value, maxWidth), valueX, y);
}

void drawStatus(const ControllerDisplayState &state) {
  const String wifiStatus = state.wifiConnected ? "wifi ok" : "wifi down";
  const String socketStatus = state.webSocketConnected ? "ws ok" : "ws down";
  const String connectionStatus = wifiStatus + " / " + socketStatus;
  const String localIp = state.wifiConnected && state.localIp.length() > 0 ? state.localIp : "-";
  const String serverUrl = state.serverUrl.length() > 0 ? redactPairingToken(state.serverUrl) : "-";
  const uint16_t statusColor = state.webSocketConnected ? okColor() : warnColor();

  drawStatusRow("conn", connectionStatus, StatusTop, statusColor);
  drawStatusRow("ip", localIp, StatusTop + 17, textColor());
  drawStatusRow("server", serverUrl, StatusTop + 34, textColor());
}

}  // namespace

void beginControllerDisplay() {
  M5.Display.setRotation(DisplayRotation);
  M5.Display.setTextDatum(top_left);
  M5.Display.setTextSize(1);
  M5.Display.fillScreen(backgroundColor());

  frameBuffer.setColorDepth(16);
  frameBufferReady = frameBuffer.createSprite(M5.Display.width(), M5.Display.height()) != nullptr;
  frameBuffer.setTextDatum(top_left);
  frameBuffer.setTextSize(1);
}

void renderControllerDisplay(const ControllerDisplayState &state) {
  if (!frameBufferReady) {
    return;
  }

  frameBuffer.startWrite();
  frameBuffer.fillScreen(backgroundColor());
  drawHeader(state);
  drawLevel(state);
  drawStatus(state);
  frameBuffer.endWrite();

  M5.Display.startWrite();
  frameBuffer.pushSprite(0, 0);
  M5.Display.endWrite();
}
