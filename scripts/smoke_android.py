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
    adb("shell", "uiautomator", "dump", "/sdcard/together-ui.xml")
    return ET.fromstring(adb("shell", "cat", "/sdcard/together-ui.xml"))


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
    root = wait_for(label)
    node = next(n for n in root.iter("node") if label == n.get("text"))
    tap_node(node)


def toggle_restriction():
    root = tree()
    switch = next(n for n in root.iter("node") if n.get("checkable") == "true")
    tap_node(switch)


def screenshot(name):
    (screens / name).write_bytes(adb("exec-out", "screencap", "-p", binary=True))


def reset():
    tap("처음부터")
    tap("새로 시작")
    wait_for("방문 흐름 시연하기")


adb("shell", "pm", "clear", package)
adb("shell", "am", "start", "-n", package + "/.MainActivity")
wait_for("방문 흐름 시연하기")
screenshot("01-plan.png")
tap("장소 위치 보기")
wait_for("북쪽 ↑")
wait_for("35.22669, 126.83931")
screenshot("06-site-locations.png")
tap("닫기")
tap("방문 흐름 시연하기")
tap("동승자 하차 확인")
tap("이곳은 이용할 수 없어요")
wait_for("오룡관 주차장 2")
tap("이곳은 이용할 수 없어요")
wait_for("축구장 주차장")
wait_for("오룡관 주차장 1 입구 옆 만남 지점")
screenshot("02-parking-fallback.png")
print("PASS fallback keeps meeting point", flush=True)

adb("shell", "am", "force-stop", package)
adb("shell", "am", "start", "-n", package + "/.MainActivity")
wait_for("축구장 주차장")
wait_for("이번 방문에서 제외한 후보 2곳")
print("PASS process restart restores session", flush=True)

toggle_restriction()
root = wait_for("주행 제한 상태 시연")
assert not any(n.get("text") == "이곳에 주차했어요" for n in root.iter("node"))
screenshot("03-restricted.png")
toggle_restriction()
tap("이곳에 주차했어요")
tap("도착 카드 미리보기")
wait_for("운전자가 주차 완료를 확인했어요")
wait_for("35.22648, 126.83947")
screenshot("04-companion-preview.png")
tap("닫기")
tap("다시 만났어요")
wait_for("함께 도착했어요")
print("PASS restriction, companion preview and reunion", flush=True)

reset()
tap("방문 흐름 시연하기")
tap("동승자 하차 확인")
for _ in range(4):
    tap("이곳은 이용할 수 없어요")
root = wait_for("안내할 주차 후보가 없어요")
assert not any(n.get("text") == "이곳에 주차했어요" for n in root.iter("node"))
wait_for("오룡관 주차장 1 입구 옆 만남 지점")
screenshot("05-exhausted.png")
tap("이번 방문 종료")
wait_for("이번 방문을 종료했어요")
print("PASS exhausted candidates and cancellation", flush=True)
reset()
print("PASS all Android smoke scenarios", flush=True)
