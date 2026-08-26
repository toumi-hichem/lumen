set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

android_home := env_var_or_default("ANDROID_HOME", if os_family() == "windows" {
    env_var_or_default("LOCALAPPDATA", "") + "\\Android\\Sdk"
} else {
    env_var_or_default("HOME", env_var_or_default("USERPROFILE", "")) + "/Android/Sdk"
})

java_home := env_var_or_default("JAVA_HOME", if os_family() == "windows" {
    "C:\\Program Files\\Android\\Android Studio\\jbr"
} else {
    "/usr/lib/jvm/java-21-openjdk-amd64"
})

export ANDROID_HOME := android_home
export ANDROID_SDK_ROOT := android_home
export JAVA_HOME := java_home
export PATH := if os_family() == "windows" {
    java_home + "\\bin;" + android_home + "\\platform-tools;" + android_home + "\\emulator;" + env_var("PATH")
} else {
    java_home + "/bin:" + android_home + "/platform-tools:" + android_home + "/emulator:" + env_var("PATH")
}

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
# Local pretty URL: http://lumen.test (no port) is served by a local reverse
# proxy on :80 (Apache on Linux/macOS, Caddy via `just proxy-bg` on Windows)
# forwarding to :{{web_port}}. lumen.test is already in server.allowedHosts in
# vite.config.ts. Full one-time setup for either OS: docs/local-lumen-test-domain.md
# A `.test` TLD is used (not .com) because browsers never force it to HTTPS.
# Full setup + the vhost: docs/local-lumen-test-domain.md
dev:
    bun run dev -- --port {{web_port}} --strictPort

# Start everything needed for http://lumen.test: the dev server in the
# background, plus the reverse proxy on Windows (Apache already runs that
# role on Linux/macOS, so there's nothing extra to start there).
[unix]
up: dev-bg

# Start everything needed for http://lumen.test: the dev server in the
# background, plus the reverse proxy on Windows (Apache already runs that
# role on Linux/macOS, so there's nothing extra to start there).
[windows]
up: dev-bg proxy-bg

# Stop everything started by `just up`.
[unix]
down: dev-stop

# Stop everything started by `just up`.
[windows]
down: dev-stop proxy-stop

# Same dev server, detached into the background. Logs go to /tmp/lumen-dev.log
# and the PID to /tmp/lumen-dev.pid (%TEMP% on Windows). Stop it with: just dev-stop
[unix]
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

# Same dev server, detached into the background. Logs go to %TEMP%\lumen-dev.log
# and the PID to %TEMP%\lumen-dev.pid. Stop it with: just dev-stop
[windows]
dev-bg:
    #!powershell.exe
    $ErrorActionPreference = "Stop"
    $pidFile = Join-Path $env:TEMP "lumen-dev.pid"
    $logFile = Join-Path $env:TEMP "lumen-dev.log"
    $errFile = Join-Path $env:TEMP "lumen-dev.err.log"
    if (Test-Path $pidFile) {
        $existingPid = Get-Content $pidFile
        if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
            Write-Error "Dev server already running (pid $existingPid). Stop with: just dev-stop"
            exit 1
        }
    }
    $bun = (Get-Command bun).Source
    $batchFile = Join-Path $env:TEMP "lumen-dev-run.cmd"
    Set-Content -Path $batchFile -Value "@echo off" -Encoding ascii
    Add-Content -Path $batchFile -Value "`"$bun`" run dev -- --port {{web_port}} --strictPort > `"$logFile`" 2> `"$errFile`""
    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $batchFile -WindowStyle Hidden -PassThru
    Set-Content -Path $pidFile -Value $proc.Id
    Write-Output "Dev server started (pid $($proc.Id)) on http://localhost:{{web_port}}."
    Write-Output "  - Follow logs:  Get-Content `"$logFile`" -Wait  (errors: `"$errFile`")"
    Write-Output "  - Stop:         just dev-stop"

# Stop the backgrounded dev server started by `just dev-bg`.
[unix]
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

# Stop the backgrounded dev server started by `just dev-bg`.
[windows]
dev-stop:
    #!powershell.exe
    $pidFile = Join-Path $env:TEMP "lumen-dev.pid"
    if (-not (Test-Path $pidFile)) {
        Write-Error "No pid file at $pidFile — nothing to stop."
        exit 0
    }
    $procId = Get-Content $pidFile
    if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
        taskkill /PID $procId /T /F | Out-Null
        Write-Output "Stopped dev server (pid $procId)."
    } else {
        Write-Output "Process $procId was not running."
    }
    Remove-Item $pidFile -Force

# Reverse-proxy http://lumen.test (port 80) to the Vite dev server, using the
# Caddyfile at the repo root. Unlike Unix, Windows doesn't reserve port 80 for
# admins, so no elevation is needed. One-time setup: docs/local-lumen-test-domain.md
[windows]
proxy-bg:
    #!powershell.exe
    $ErrorActionPreference = "Stop"
    $pidFile = Join-Path $env:TEMP "lumen-proxy.pid"
    $logFile = Join-Path $env:TEMP "lumen-proxy.log"
    if (Test-Path $pidFile) {
        $existingPid = Get-Content $pidFile
        if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
            Write-Error "Proxy already running (pid $existingPid). Stop with: just proxy-stop"
            exit 1
        }
    }
    $caddyCmd = Get-Command caddy -ErrorAction SilentlyContinue
    if ($caddyCmd) {
        $caddy = $caddyCmd.Source
    } else {
        # winget's PATH update needs a fresh env block that some shells don't
        # pick up even after restarting; fall back to its known install path.
        $wingetCaddy = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\CaddyServer.Caddy_*\caddy.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $wingetCaddy) {
            Write-Error "caddy not found on PATH or in the winget packages folder. Install it with: winget install --id CaddyServer.Caddy -e"
            exit 1
        }
        $caddy = $wingetCaddy.FullName
    }
    $caddyfile = Join-Path "{{justfile_directory()}}" "Caddyfile"
    $batchFile = Join-Path $env:TEMP "lumen-proxy-run.cmd"
    Set-Content -Path $batchFile -Value "@echo off" -Encoding ascii
    Add-Content -Path $batchFile -Value "`"$caddy`" run --config `"$caddyfile`" --adapter caddyfile > `"$logFile`" 2>&1"
    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $batchFile -WindowStyle Hidden -PassThru
    Set-Content -Path $pidFile -Value $proc.Id
    Write-Output "Proxy started (pid $($proc.Id)). http://lumen.test now proxies to :{{web_port}}."
    Write-Output "  - Follow logs:  Get-Content `"$logFile`" -Wait"
    Write-Output "  - Stop:         just proxy-stop"

# Stop the backgrounded proxy started by `just proxy-bg`.
[windows]
proxy-stop:
    #!powershell.exe
    $pidFile = Join-Path $env:TEMP "lumen-proxy.pid"
    if (-not (Test-Path $pidFile)) {
        Write-Error "No pid file at $pidFile — nothing to stop."
        exit 0
    }
    $procId = Get-Content $pidFile
    if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
        taskkill /PID $procId /T /F | Out-Null
        Write-Output "Stopped proxy (pid $procId)."
    } else {
        Write-Output "Process $procId was not running."
    }
    Remove-Item $pidFile -Force

# Compile the web build, sync it into the native project, build a debug APK, then install + launch it on the phone connected over adb (USB or wireless). Inspect the WebView live at chrome://inspect.
[unix]
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

# Compile the web build, sync it into the native project, build a debug APK, then install + launch it on the phone connected over adb (USB or wireless). Inspect the WebView live at chrome://inspect.
[windows]
android-debug:
    #!powershell.exe
    $ErrorActionPreference = "Stop"
    $connected = (adb devices | Select-String "\sdevice$").Count
    if ($connected -eq 0) {
        Write-Error "No authorized device over adb. Connect your phone first: 1) Phone: Settings > Developer options > enable USB debugging. 2) Plug in over USB and accept the 'Allow USB debugging?' prompt. 3) Verify with: just android-devices (wireless instead: just android-wifi or just android-connect <ip>:<port>)"
        exit 1
    }
    # 1. Vite build -> dist/
    bun run build
    # 2. Copy the web build + plugins into the native Android project
    bunx cap sync android
    # 3. Build the debug APK (Android Studio uses this same Gradle task under the hood)
    Push-Location android
    try {
        .\gradlew.bat assembleDebug --no-daemon
    } finally {
        Pop-Location
    }
    # 4. Install + launch over the debug bridge
    adb install -r android/app/build/outputs/apk/debug/app-debug.apk
    adb shell am start -n {{launch_activity}}
    Write-Output ""
    Write-Output "Launched {{app_id}} on device. Next:"
    Write-Output "  - Debug the WebView (JS console, DOM, network) at chrome://inspect in Chrome."
    Write-Output "  - Tail native + JS logs with:  just android-logcat"

# Switch a USB-connected phone to wireless adb automatically: reads the phone's Wi-Fi IP, restarts adb on port 5555, and connects — no need to read the IP/port off the phone. Plug in over USB first; afterwards you can unplug.
[unix]
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

# Switch a USB-connected phone to wireless adb automatically: reads the phone's Wi-Fi IP, restarts adb on port 5555, and connects — no need to read the IP/port off the phone. Plug in over USB first; afterwards you can unplug.
[windows]
android-wifi:
    #!powershell.exe
    $ErrorActionPreference = "Stop"
    $connected = (adb devices | Select-String "\sdevice$").Count
    if ($connected -eq 0) {
        Write-Error "Plug the phone in over USB first (and accept the USB-debugging prompt)."
        exit 1
    }
    $routeOutput = adb shell ip route get 1.1.1.1 2>$null
    $match = $routeOutput | Select-String -Pattern 'src ([\d.]+)'
    if (-not $match) {
        Write-Error "Could not read the phone's Wi-Fi IP — make sure it is on Wi-Fi (same network as this machine)."
        exit 1
    }
    $ip = $match.Matches[0].Groups[1].Value
    adb tcpip 5555
    Start-Sleep -Seconds 1
    adb connect "${ip}:5555"
    Write-Output "Connected to ${ip}:5555 — you can unplug USB now. Deploy with: just android-debug"

# Connect a phone over Wi-Fi using an explicit <ip>:<port> read from the phone's Wireless debugging screen (run `adb pair <ip>:<pairport>` first if it asks to pair).
android-connect addr:
    adb connect {{addr}}

# List devices/emulators adb can see. A phone shown as 'unauthorized' just needs the USB-debugging prompt accepted on-device.
android-devices:
    adb start-server
    adb devices -l

# Stream the running app's logs (JS console + native) from the phone.
[unix]
android-logcat:
    #!/usr/bin/env bash
    set -euo pipefail
    pid="$(adb shell pidof -s {{app_id}} || true)"
    if [ -z "$pid" ]; then
      echo "{{app_id}} is not running — launch it first (just android-debug)." >&2
      exit 1
    fi
    adb logcat --pid="$pid"

# Stream the running app's logs (JS console + native) from the phone.
[windows]
android-logcat:
    #!powershell.exe
    $procId = (adb shell pidof -s {{app_id}}).Trim()
    if (-not $procId) {
        Write-Error "{{app_id}} is not running — launch it first (just android-debug)."
        exit 1
    }
    adb logcat --pid=$procId
