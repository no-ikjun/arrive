#!/usr/bin/env python3
"""Exercise the local demo on a dedicated emulator, using observable UI text."""
import argparse
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument("--adb", default="adb")
parser.add_argument("--serial", required=True)
parser.add_argument("--screenshots", default="artifacts/screenshots")
args = parser.parse_args()
if not args.serial.startswith("emulator-"):
    parser.error("Use a dedicated emulator; this script resets the demo app's data.")
package = "com.arrivetogether.app"
screens = Path(args.screenshots)
screens.mkdir(parents=True, exist_ok=True)


def adb(*command, binary=False):
    return subprocess.check_output([args.adb, "-s", args.serial, *command], text=not binary, timeout=20)


def tree():
    # Compose may not expose an accessibility root on the first launch frame.
    # Never consume a stale XML dump when the new dump failed.
    for _ in range(6):
        result = adb("shell", "uiautomator", "dump", "/sdcard/together-ui.xml")
        if "dumped to:" in result:
            return ET.fromstring(adb("shell", "cat", "/sdcard/together-ui.xml"))
        time.sleep(.3)
    raise AssertionError("UI hierarchy unavailable after launch")


def wait_for(label):
    for _ in range(6):
        root = tree()
        if any(label in node.get("text", "") for node in root.iter("node")):
            return root
        time.sleep(.3)
    raise AssertionError(f"UI text not found: {label}")


def tap_node(node):
    x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds", "")))
    adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))


def tap(label):
    for _ in range(8):
        root = tree()
        node = next((n for n in root.iter("node") if label == n.get("text")), None)
        if node is not None:
            tap_node(node)
            return
        container = next((n for n in root.iter("node") if n.get("scrollable") == "true"), None)
        if container is None:
            time.sleep(.3)
            continue
        x1,y1,x2,y2 = map(int, re.findall(r"\d+", container.get("bounds")))
        x = (x1+x2)//2
        adb("shell", "input", "swipe", str(x), str(y2-50), str(x), str(y1+50), "250")
    raise AssertionError("Action not found: " + label)


def toggle_restriction():
    root = tree()
    switch = next(n for n in root.iter("node") if n.get("checkable") == "true")
    tap_node(switch)


def screenshot(name):
    (screens / name).write_bytes(adb("exec-out", "screencap", "-p", binary=True))


def assert_actions_visible(*labels):
    root = tree()
    parents = {child: parent for parent in root.iter() for child in parent}
    bounds = []
    for label in labels:
        node = next(n for n in root.iter("node") if n.get("text") == label)
        while node.get("clickable") != "true":
            node = parents[node]
        box = tuple(map(int, re.findall(r"\d+", node.get("bounds"))))
        assert box[3] - box[1] >= 80, (label, box)
        assert node.get("enabled") == "true", label
        bounds.append(box)
    if len(bounds) == 2:
        bounds.sort()
        assert bounds[1][0] - bounds[0][2] >= 16, bounds
    print("PASS visible labeled action buttons: " + ", ".join(labels), flush=True)


def reset():
    tap("새 방문")
    tap("새로 시작")
    wait_for("방문 시작")


if "android.hardware.type.automotive" in adb("shell", "pm", "list", "features"):
    parser.error("This local UI smoke requires a dedicated non-Automotive emulator with the simulation switch.")
adb("shell", "pm", "clear", package)
adb("shell", "am", "start", "-W", "-n", package + "/.MainActivity")
wait_for("방문 시작")
assert_actions_visible("방문 시작")
screenshot("01-plan.png")
tap("더 보기")
tap("장소 정보")
wait_for("북쪽 ↑")
wait_for("35.22669, 126.83931")
screenshot("06-site-locations.png")
tap("닫기")
tap("방문 시작")
tap("하차 완료")
tap("다른 주차장")
wait_for("주차장 2")
tap("다른 주차장")
wait_for("축구장 주차장")
wait_for("주차장 1 입구 옆")
assert_actions_visible("다른 주차장", "주차 완료")
screenshot("02-parking-fallback.png")
print("PASS fallback keeps meeting point", flush=True)

adb("shell", "am", "force-stop", package)
adb("shell", "am", "start", "-W", "-n", package + "/.MainActivity")
wait_for("축구장 주차장")
wait_for("다른 주차장")
print("PASS process restart restores session", flush=True)

toggle_restriction()
root = wait_for("정차 후 이용해 주세요")
assert not any(n.get("text") == "주차 완료" for n in root.iter("node"))
screenshot("03-restricted.png")
toggle_restriction()
tap("주차 완료")
wait_for("주차 완료 · 도보 이동")
tap("동승자 공유")
wait_for("동승자 공유")
screenshot("04-companion-connect.png")
tap("닫기")
tap("만남 완료")
wait_for("함께 도착했어요")
print("PASS restriction, companion connection dialog and reunion", flush=True)

reset()
tap("방문 시작")
tap("하차 완료")
for _ in range(4):
    tap("다른 주차장")
root = wait_for("주차 후보 없음")
assert not any(n.get("text") == "주차 완료" for n in root.iter("node"))
wait_for("주차장 1 입구 옆")
screenshot("05-exhausted.png")
tap("더 보기")
tap("방문 종료")
tap("종료")
wait_for("방문을 종료했어요")
print("PASS exhausted candidates and cancellation", flush=True)
reset()
print("PASS all Android smoke scenarios", flush=True)
