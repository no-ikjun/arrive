#!/usr/bin/env python3
"""Read-only Pleos setup check. Does not accept licenses, grant permissions or issue routes."""
import argparse
from pathlib import Path
import os
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--sdk', type=Path, default=Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'Library/Android/sdk'))))
parser.add_argument('--serial', help='ADB serial of the Pleos emulator to inspect')
args = parser.parse_args()
image = args.sdk / 'system-images/android-34/pleos_car_emulator/arm64-v8a'
print('Pleos ARM64 system image:', 'INSTALLED' if (image / 'system.img').exists() else 'NOT_INSTALLED')
print('AVD definitions:', ', '.join(p.stem for p in (Path.home() / '.android/avd').glob('*.ini')) or 'NONE')
adb = args.sdk / 'platform-tools/adb'
if not adb.is_file():
    parser.exit(1, 'adb not found in selected SDK\n')
def run(*command):
    result = subprocess.run([str(adb), *command], capture_output=True, text=True, timeout=20)
    if result.returncode:
        parser.exit(1, result.stderr or 'ADB command failed\n')
    return result.stdout.strip()
print(run('devices'))
if args.serial:
    def shell(*command): return run('-s', args.serial, 'shell', *command)
    automotive = 'android.hardware.type.automotive' in shell('pm', 'list', 'features')
    print('Automotive feature:', automotive)
    print('Hardware:', shell('getprop', 'ro.hardware'))
    services = shell('cmd', 'package', 'query-services', '--brief', '-a', 'ai.pleos.playground.intent.action.NAVI_START')
    print('Navi service query:', services or 'NONE')
    package = shell('dumpsys', 'package', 'com.arrivetogether.app')
    print('App installed:', 'YES' if 'Package [com.arrivetogether.app]' in package else 'NO')
    for line in package.splitlines():
        if 'pleos.car.permission.NAVI_' in line and 'granted=' in line:
            print('Permission:', line.strip())
print('This is environment inspection only, not proof of an SDK connection or a successful route.')
