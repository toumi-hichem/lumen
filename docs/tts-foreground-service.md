# Android TTS Foreground Service

## Goal

Allow TTS to keep running when the screen turns off and the user sends the app to the background. Show proper Android media controls in the notification shade (play/pause/stop, book title, cover art).

## Why the current setup isn't enough

`@capacitor-community/text-to-speech` calls `android.speech.tts.TextToSpeech` natively, which is correct. But without a foreground service, Android's battery manager can throttle or kill background processes after a few minutes. There is also no native `MediaSession` on the Android side, so lock screen and notification controls don't work reliably.

## What this adds

- A foreground service that keeps the process alive while TTS is active
- A persistent notification with play/pause/stop actions and book metadata
- A native Android `MediaSession` so headphone buttons and Android Auto work
- The JS side communicates with the service through a small custom Capacitor plugin

---

## Implementation plan

### 1. Create the Capacitor plugin skeleton

File: `android/app/src/main/java/org/wikisubmission/lumen/tts/TtsServicePlugin.kt`

Register it in `MainActivity.java`:
```java
import org.wikisubmission.lumen.tts.TtsServicePlugin;

// inside onCreate, after super.onCreate:
registerPlugin(TtsServicePlugin.class);
```

The plugin exposes these methods to JavaScript:

| JS call | Description |
|---|---|
| `speak({ text, rate, pitch, voiceIndex })` | Queue text, start service if needed |
| `stop()` | Stop playback, release service |
| `pause()` | Pause current utterance |
| `resume()` | Resume paused utterance |
| `setMetadata({ title, author, coverUrl })` | Update notification and MediaSession |
| `getSupportedVoices()` | Return device voices |
| `addListener('onDone', cb)` | Chunk finished naturally |
| `addListener('onError', cb)` | TTS error |
| `addListener('onMediaAction', cb)` | play/pause/next/prev from headphones or notification |

### 2. Create the foreground service

File: `android/app/src/main/java/org/wikisubmission/lumen/tts/TtsService.kt`

Key responsibilities:
- Extends `Service`, calls `startForeground()` immediately on start with a notification
- Holds an `android.speech.tts.TextToSpeech` instance
- Holds an `android.media.session.MediaSession` instance
- Manages audio focus via `AudioManager.requestAudioFocus()`
- Sends events back to the plugin via a local broadcast or a shared singleton

Minimal service lifecycle:
```kotlin
override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIF_ID, buildNotification())
    return START_STICKY
}

override fun onDestroy() {
    tts.shutdown()
    mediaSession.release()
    audioManager.abandonAudioFocus(...)
}
```

### 3. Set up the notification channel and notification

Create the channel once at app startup (or in `MainActivity.onCreate`):
```kotlin
val channel = NotificationChannel(
    "tts_playback",
    "Read Aloud",
    NotificationManager.IMPORTANCE_LOW  // silent, no sound
)
notificationManager.createNotificationChannel(channel)
```

Build the notification with `MediaStyle`:
```kotlin
NotificationCompat.Builder(context, "tts_playback")
    .setSmallIcon(R.drawable.ic_headphones)
    .setContentTitle(bookTitle)
    .setContentText(authorName)
    .setLargeIcon(coverBitmap)
    .addAction(R.drawable.ic_skip_prev, "Previous", prevPendingIntent)
    .addAction(R.drawable.ic_pause,    "Pause",    pausePendingIntent)
    .addAction(R.drawable.ic_stop,     "Stop",     stopPendingIntent)
    .setStyle(
        MediaStyle()
            .setMediaSession(mediaSession.sessionToken)
            .setShowActionsInCompactView(0, 1, 2)
    )
    .build()
```

Cover art: download from the `coverUrl` passed by JS on a background thread, then update the notification.

### 4. Set up MediaSession

```kotlin
mediaSession = MediaSession(context, "LumenTts")
mediaSession.setCallback(object : MediaSession.Callback() {
    override fun onPlay()  { resume() }
    override fun onPause() { pause()  }
    override fun onStop()  { stop()   }
    override fun onSkipToNext()     { notifyJS("onMediaAction", "next") }
    override fun onSkipToPrevious() { notifyJS("onMediaAction", "prev") }
})
mediaSession.isActive = true
```

Update playback state when TTS status changes:
```kotlin
val state = PlaybackState.Builder()
    .setState(PlaybackState.STATE_PLAYING, 0, rate)
    .setActions(ACTION_PLAY_PAUSE or ACTION_STOP or ACTION_SKIP_TO_NEXT or ACTION_SKIP_TO_PREVIOUS)
    .build()
mediaSession.setPlaybackState(state)
```

### 5. Declare everything in AndroidManifest.xml

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<service
    android:name=".tts.TtsService"
    android:foregroundServiceType="mediaPlayback"
    android:exported="false" />
```

### 6. Wire the JS side

Create `src/tts/nativeTtsServiceEngine.ts` that replaces `nativeTtsEngine.ts` on Android. It calls the new plugin instead of `@capacitor-community/text-to-speech`. The `speak()` method resolves when the plugin fires `onDone`. The `stop()` method calls `plugin.stop()` and also fires the resolve early.

Register it in `registry.ts` as `native-tts`, replacing the current entry. The rest of the TTS stack (`TtsController`, `useTts`, `ReaderActionBar`) stays unchanged.

### 7. Cover art loading

Pass `coverUrl` from `useTts` options to the plugin's `setMetadata` call whenever TTS starts or the book changes. In Kotlin, download the bitmap with:
```kotlin
val bitmap = BitmapFactory.decodeStream(URL(coverUrl).openStream())
```
Do this off the main thread. Handle failures gracefully (show a placeholder icon).

---

## Files to create/modify

| File | Action |
|---|---|
| `android/app/src/main/java/.../tts/TtsService.kt` | Create |
| `android/app/src/main/java/.../tts/TtsServicePlugin.kt` | Create |
| `android/app/src/main/java/.../MainActivity.java` | Register plugin |
| `android/app/src/main/AndroidManifest.xml` | Add permissions + service declaration |
| `android/app/src/main/res/drawable/ic_headphones.xml` | Add notification icon |
| `src/tts/nativeTtsServiceEngine.ts` | Create (replaces nativeTtsEngine.ts) |
| `src/tts/registry.ts` | Swap engine factory |

## Notes

- The `@capacitor-community/text-to-speech` package can be removed once the custom plugin is in place, or kept as a fallback for iOS (iOS doesn't need a foreground service for background audio when the `category` is set to `playback`).
- Test audio focus behavior: the service should duck/pause when a phone call arrives and resume after.
- The `START_STICKY` return from `onStartCommand` means Android will restart the service if it gets killed, but TTS state will be lost. A smarter approach is `START_NOT_STICKY` and let the user resume manually.
