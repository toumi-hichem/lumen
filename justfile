android_home := env_var_or_default("ANDROID_HOME", env_var("HOME") + "/Android/Sdk")
java_home := "/usr/lib/jvm/java-21-openjdk-amd64"

export ANDROID_HOME := android_home
export ANDROID_SDK_ROOT := android_home
export JAVA_HOME := java_home
export PATH := java_home + "/bin:" + android_home + "/platform-tools:" + android_home + "/emulator:" + env_var("PATH")

# applicationId and namespace are both org.wikisubmission.lumen, so the
# `.MainActivity` shorthand resolves correctly.
app_id := "org.wikisubmission.lumen"
launch_activity := app_id + "/.MainActivity"

# Dedicated port for the web dev server so it never collides with other Vite
# projects (which grab the default 5173).
web_port := "5183"

default:
    @just --list

# Run the Vite dev server (web version) in the foreground with hot reload.
# Pinned to --port {{web_port}} with --strictPort so it fails fast instead of
# silently landing on another port. Vite binds 0.0.0.0 (server.host in
# vite.config), so it is reachable from other devices on your LAN at
# http://<this-machine-ip>:{{web_port}} as well as localhost.
#
# Local pretty URL: http://lumen.test (no port) is served by a local Apache
# vhost reverse-proxying to :{{web_port}}. One-time host setup:
#   1. echo '127.0.0.1 lumen.test' | sudo tee -a /etc/hosts
#   2. Apache vhost (ServerName lumen.test) proxying to 127.0.0.1:{{web_port}},
#      with proxy_wstunnel enabled for HMR.
#   3. lumen.test is in server.allowedHosts in vite.config.ts.
# A `.test` TLD is used (not .com) because browsers never force it to HTTPS.
# Full setup + the vhost: docs/local-lumen-test-domain.md
dev:
    bun run dev -- --port {{web_port}} --strictPort

# Same dev server, detached into the background. Logs go to /tmp/lumen-dev.log
# and the PID to /tmp/lumen-dev.pid. Stop it with: just dev-stop
dev-bg:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f /tmp/lumen-dev.pid ] && kill -0 "$(cat /tmp/lumen-dev.pid)" 2>/dev/null; then
      echo "Dev server already running (pid $(cat /tmp/lumen-dev.pid)). Stop with: just dev-stop" >&2
      exit 1
    fi
    nohup bun run dev -- --port {{web_port}} --strictPort >/tmp/lumen-dev.log 2>&1 &
    echo $! > /tmp/lumen-dev.pid
    echo "Dev server started (pid $!) on http://localhost:{{web_port}}."
    echo "  - Follow logs:  tail -f /tmp/lumen-dev.log"
    echo "  - Stop:         just dev-stop"

# Stop the backgrounded dev server started by `just dev-bg`.
dev-stop:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -f /tmp/lumen-dev.pid ]; then
      echo "No pid file at /tmp/lumen-dev.pid — nothing to stop." >&2
      exit 0
    fi
    pid="$(cat /tmp/lumen-dev.pid)"
    if kill "$pid" 2>/dev/null; then
      echo "Stopped dev server (pid $pid)."
    else
      echo "Process $pid was not running."
    fi
    rm -f /tmp/lumen-dev.pid

# Compile the web build, sync it into the native project, build a debug APK, then install + launch it on the phone connected over adb (USB or wireless). Inspect the WebView live at chrome://inspect.
android-debug:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "$(adb devices | awk 'NR>1 && $2=="device"' | wc -l)" -eq 0 ]; then
      echo "No authorized device over adb. Connect your phone first:" >&2
      echo "  1. Phone: Settings > Developer options > enable USB debugging." >&2
      echo "  2. Plug in over USB and accept the 'Allow USB debugging?' prompt." >&2
      echo "  3. Verify with:  just android-devices" >&2
      echo "     (wireless instead:  just android-wifi  or  just android-connect <ip>:<port>)" >&2
      exit 1
    fi
    # 1. Vite build -> dist/
    bun run build
    # 2. Copy the web build + plugins into the native Android project
    bunx cap sync android
    # 3. Build the debug APK (Android Studio uses this same Gradle task under the hood)
    (cd android && ./gradlew assembleDebug --no-daemon)
    # 4. Install + launch over the debug bridge
    adb install -r android/app/build/outputs/apk/debug/app-debug.apk
    adb shell am start -n {{launch_activity}}
    echo ""
    echo "Launched {{app_id}} on device. Next:"
    echo "  - Debug the WebView (JS console, DOM, network) at chrome://inspect in Chrome."
    echo "  - Tail native + JS logs with:  just android-logcat"

# Switch a USB-connected phone to wireless adb automatically: reads the phone's Wi-Fi IP, restarts adb on port 5555, and connects — no need to read the IP/port off the phone. Plug in over USB first; afterwards you can unplug.
android-wifi:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "$(adb devices | awk 'NR>1 && $2=="device"' | wc -l)" -eq 0 ]; then
      echo "Plug the phone in over USB first (and accept the USB-debugging prompt)." >&2
      exit 1
    fi
    ip="$(adb shell ip route get 1.1.1.1 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}')"
    if [ -z "$ip" ]; then
      echo "Could not read the phone's Wi-Fi IP — make sure it is on Wi-Fi (same network as this machine)." >&2
      exit 1
    fi
    adb tcpip 5555
    sleep 1
    adb connect "$ip:5555"
    echo "Connected to $ip:5555 — you can unplug USB now. Deploy with: just android-debug"

# Connect a phone over Wi-Fi using an explicit <ip>:<port> read from the phone's Wireless debugging screen (run `adb pair <ip>:<pairport>` first if it asks to pair).
android-connect addr:
    adb connect {{addr}}

# List devices/emulators adb can see. A phone shown as 'unauthorized' just needs the USB-debugging prompt accepted on-device.
android-devices:
    adb start-server
    adb devices -l

# Stream the running app's logs (JS console + native) from the phone.
android-logcat:
    #!/usr/bin/env bash
    set -euo pipefail
    pid="$(adb shell pidof -s {{app_id}} || true)"
    if [ -z "$pid" ]; then
      echo "{{app_id}} is not running — launch it first (just android-debug)." >&2
      exit 1
    fi
    adb logcat --pid="$pid"
