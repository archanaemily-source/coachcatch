/*
 * CoachApp ESP32 example — WiFi connect + POST a rep and a heart-rate
 * reading to the backend, using the X-Device-Token header.
 *
 * This is a cross-check, not the source of truth: the phone camera is
 * canonical for the rep count the coach sees. Rough is fine here.
 *
 * Fill in WIFI_SSID / WIFI_PASSWORD / SERVER_HOST / DEVICE_TOKEN below.
 * DEVICE_TOKEN is the 8-char "Sensor code" shown on the student's phone
 * when they start a session.
 *
 * Wire up your actual rep-detection / heart-rate sensor logic where
 * marked below (TODO) — this skeleton only shows the network calls.
 */
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "your-wifi-name";
const char* WIFI_PASSWORD = "your-wifi-password";
const char* SERVER_HOST = "http://192.168.1.50:3001"; // laptop's LAN IP running `make dev`
const char* DEVICE_TOKEN = "abcd1234"; // the "Sensor code" from the phone

int repCount = 0;

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");

  // TODO: initialize your rep-detection sensor (accelerometer, button,
  // limit switch, etc.) and heart-rate sensor here.
}

void postRep(int repNumber) {
  HTTPClient http;
  http.begin(String(SERVER_HOST) + "/api/devices/reps");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  String body = "{\"repNumber\":" + String(repNumber) + "}";
  int status = http.POST(body);
  Serial.printf("REP %d -> %d\n", repNumber, status);
  http.end();
}

void postHeartRate(int bpm) {
  HTTPClient http;
  http.begin(String(SERVER_HOST) + "/api/devices/biometrics");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  String body = "{\"type\":\"heart_rate\",\"value\":\"" + String(bpm) + "\"}";
  int status = http.POST(body);
  Serial.printf("HR %d -> %d\n", bpm, status);
  http.end();
}

void loop() {
  // TODO: replace with your real rep-detection logic. When a rep is
  // detected:
  //   repCount++;
  //   postRep(repCount);

  // TODO: replace with your real heart-rate sensor read. Report every
  // few seconds, not on every loop iteration:
  //   postHeartRate(currentBpm);

  delay(1000);
}
