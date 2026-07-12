#!/usr/bin/env python3
"""Serial-to-HTTP bridge for CoachCatch's device endpoints.

Reads lines from a serial port (or stdin in --dry-run mode) and forwards
them to the backend: a "REP" line counts one rep, a "BR:<score>" line
reports a breath-force/intensity reading (0-10 resting, 10-20 moderate,
20-40 heavy, 40+ labored — not a literal breaths-per-minute rate). This
is the no-WiFi fallback for the ESP32 sketch — plug the sensor into a
laptop over USB instead.

Usage:
    pip install pyserial
    python3 bridge.py --port /dev/tty.usbserial-XXXX --token <sensor-code>

Dry run (no hardware; reads lines from stdin instead of a serial port):
    printf 'REP\\nBR:18\\nREP\\n' | python3 bridge.py --dry-run --token <sensor-code>
"""
import argparse
import json
import sys
import urllib.error
import urllib.request


def post(base_url, path, token, payload):
    req = urllib.request.Request(
        f"{base_url}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Device-Token": token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--token", required=True, help='the "Sensor code" shown on the phone')
    p.add_argument("--base-url", default="http://localhost:3001")
    p.add_argument("--port", help="serial port, e.g. /dev/tty.usbserial-XXXX")
    p.add_argument("--baud", type=int, default=115200)
    p.add_argument("--dry-run", action="store_true", help="read lines from stdin instead of serial")
    args = p.parse_args()

    if args.dry_run:
        lines = sys.stdin
    else:
        import serial  # pip install pyserial

        ser = serial.Serial(args.port, args.baud, timeout=1)
        lines = (line.decode("utf-8", errors="ignore") for line in ser)

    rep_number = 0
    for raw in lines:
        line = raw.strip()
        if line == "REP":
            rep_number += 1
            status = post(args.base_url, "/api/devices/reps", args.token, {"repNumber": rep_number})
            print(f"REP {rep_number} -> {status}")
        elif line.startswith("BR:"):
            value = line.split(":", 1)[1].strip()
            status = post(args.base_url, "/api/devices/biometrics", args.token, {"type": "breath_rate", "value": value})
            print(f"BR {value} -> {status}")
        elif line:
            print(f"ignoring unrecognized line: {line!r}")


if __name__ == "__main__":
    main()
