package org.wikisubmission.lumen.kokoro;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Log;

import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Foreground media-playback service that runs the whole read-aloud queue
 * natively for Kokoro. Structurally identical to SupertonicTtsService (same
 * synthesis-thread/AudioTrack-playback-thread pipeline, wake lock,
 * MediaSession, notification) — the only real difference is Kokoro has no
 * denoising-steps quality knob, so there is no per-chunk adaptive-RTF
 * throttling loop, just an RTF log line for future tuning.
 *
 * The queue and listener are handed over through static state set by
 * KokoroNativePlugin before startForegroundService(); an Intent cannot carry
 * a whole chapter of text plus a callback.
 */
public class KokoroTtsService extends Service {

    private static final String TAG = "KokoroTts";
    private static final String CHANNEL_ID = "lumen_tts_kokoro";
    private static final int NOTIFICATION_ID = 42;

    static final String ACTION_START = "org.wikisubmission.lumen.kokorotts.START";
    static final String ACTION_PLAY_PAUSE = "org.wikisubmission.lumen.kokorotts.PLAY_PAUSE";
    static final String ACTION_PAUSE = "org.wikisubmission.lumen.kokorotts.PAUSE";
    static final String ACTION_RESUME = "org.wikisubmission.lumen.kokorotts.RESUME";
    static final String ACTION_STOP = "org.wikisubmission.lumen.kokorotts.STOP";
    static final String ACTION_SKIP_NEXT = "org.wikisubmission.lumen.kokorotts.SKIP_NEXT";
    static final String ACTION_SKIP_PREVIOUS = "org.wikisubmission.lumen.kokorotts.SKIP_PREVIOUS";

    interface Listener {
        void onChunk(int index);

        void onStateChanged(boolean playing);

        void onComplete();

        void onError(String message);

        void onModelLoading();

        void onModelReady(long elapsedMs);

        void onSynthesizing(int index);

        void onSkipNext();

        void onSkipPrevious();
    }

    static final class Request {
        final List<String> chunks;
        final String voiceId;
        final float rate;
        final int startIndex;
        final String title;
        /** Notification large-icon art: a data: URL, or null for none. */
        final String cover;

        Request(List<String> chunks, String voiceId, float rate, int startIndex, String title, String cover) {
            this.chunks = chunks;
            this.voiceId = voiceId;
            this.rate = rate;
            this.startIndex = startIndex;
            this.title = title;
            this.cover = cover;
        }
    }

    private static volatile Request pendingRequest;
    private static volatile Listener listener;

    static void setPendingRequest(Request request, Listener l) {
        pendingRequest = request;
        listener = l;
    }

    private static final class Synthesized {
        final int index;
        final float[] samples;

        Synthesized(int index, float[] samples) {
            this.index = index;
            this.samples = samples;
        }
    }

    private static final Synthesized END = new Synthesized(-1, new float[0]);

    /** See SupertonicTtsService for why this is a fresh token per queue, not one reused flag. */
    private volatile AtomicBoolean cancelled = new AtomicBoolean(false);
    private final Object pauseLock = new Object();
    private volatile boolean paused = false;
    private long framesWritten = 0;

    private KokoroRuntime runtime;
    /** 0.3 s of silence written between chunks, like Supertonic's pipeline. */
    private float[] interChunkSilence = new float[0];
    private AudioTrack audioTrack;
    private MediaSession mediaSession;
    private PowerManager.WakeLock wakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private Thread synthesisThread;
    private Thread playbackThread;
    private Request request;
    private volatile String currentLine;
    private Bitmap coverBitmap;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_PLAY_PAUSE.equals(action)) {
            if (paused) resumePlayback();
            else pausePlayback();
            return START_NOT_STICKY;
        }
        if (ACTION_PAUSE.equals(action)) {
            pausePlayback();
            return START_NOT_STICKY;
        }
        if (ACTION_RESUME.equals(action)) {
            resumePlayback();
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            stopPlayback();
            return START_NOT_STICKY;
        }
        if (ACTION_SKIP_NEXT.equals(action)) {
            Listener l = listener;
            if (l != null) l.onSkipNext();
            return START_NOT_STICKY;
        }
        if (ACTION_SKIP_PREVIOUS.equals(action)) {
            Listener l = listener;
            if (l != null) l.onSkipPrevious();
            return START_NOT_STICKY;
        }
        if (ACTION_START.equals(action)) {
            Request req = pendingRequest;
            pendingRequest = null;
            if (req == null || req.chunks.isEmpty()) {
                stopSelf();
                return START_NOT_STICKY;
            }
            start(req);
        }
        return START_NOT_STICKY;
    }

    private void start(Request req) {
        stopThreads();
        AtomicBoolean token = new AtomicBoolean(false);
        this.cancelled = token;
        this.request = req;
        this.paused = false;
        this.currentLine = null;
        this.coverBitmap = decodeCover(req.cover);

        createMediaSession();
        goForeground(true);
        acquireWakeLock();

        synthesisThread = new Thread(() -> runPipeline(req, token), "kokoro-synthesis");
        synthesisThread.start();
    }

    private void runPipeline(Request request, AtomicBoolean cancelled) {
        BlockingQueue<Synthesized> buffer = new ArrayBlockingQueue<>(2);
        Listener l = listener;
        try {
            boolean wasLoaded = KokoroRuntimeHolder.isLoaded();
            if (!wasLoaded) {
                updateNotificationLine("Loading voice model…");
                if (l != null) l.onModelLoading();
            }
            long loadStart = SystemClock.elapsedRealtime();
            runtime = KokoroRuntimeHolder.obtain(this, null);
            if (l != null) {
                l.onModelReady(wasLoaded ? 0 : SystemClock.elapsedRealtime() - loadStart);
            }
            if (cancelled.get()) return;
            if (!requestAudioFocus()) {
                fail("Audio focus denied", cancelled);
                return;
            }
            createAudioTrack(runtime.sampleRate());

            playbackThread = new Thread(
                () -> drainAndPlay(buffer, request, cancelled), "kokoro-playback");
            playbackThread.start();

            for (int i = request.startIndex; i < request.chunks.size(); i++) {
                if (cancelled.get()) break;
                if (l != null) l.onSynthesizing(i);
                long t0 = SystemClock.elapsedRealtime();
                float[] samples = runtime.synthesize(
                    request.chunks.get(i), request.voiceId, request.rate, cancelled);
                long ms = SystemClock.elapsedRealtime() - t0;
                double audioSec = samples.length / (double) runtime.sampleRate();
                double rtf = audioSec > 0 ? (ms / 1000.0) / audioSec : 0;
                Log.d(TAG, "Synthesized chunk " + i + " ("
                    + request.chunks.get(i).length() + " chars) in "
                    + ms + " ms, rtf=" + String.format(java.util.Locale.US, "%.2f", rtf));
                buffer.put(new Synthesized(i, samples));
            }
            buffer.put(END);
        } catch (KokoroRuntime.CancelledException | InterruptedException e) {
            // Stopped by the user; playback thread is torn down by stopPlayback().
        } catch (Exception e) {
            Log.e(TAG, "Synthesis failed", e);
            if (!cancelled.get()) fail(userMessage(e), cancelled);
        }
    }

    private void drainAndPlay(
            BlockingQueue<Synthesized> buffer, Request request, AtomicBoolean cancelled) {
        Listener l = listener;
        try {
            while (!cancelled.get()) {
                Synthesized chunk = buffer.take();
                if (chunk == END) {
                    if (cancelled.get()) return;
                    drainTail(cancelled);
                    if (l != null) l.onComplete();
                    finish();
                    return;
                }
                if (cancelled.get()) return;
                if (l != null) l.onChunk(chunk.index);
                updateNotificationLine(request.chunks.get(chunk.index));
                updatePlaybackState(true);
                writeFully(chunk.samples, cancelled);
                writeFully(interChunkSilence, cancelled);
            }
        } catch (InterruptedException e) {
            // Stopped.
        } catch (Exception e) {
            Log.e(TAG, "Playback failed", e);
            if (!cancelled.get()) fail(userMessage(e), cancelled);
        }
    }

    private void writeFully(float[] samples, AtomicBoolean cancelled)
            throws InterruptedException {
        int offset = 0;
        while (offset < samples.length && !cancelled.get()) {
            synchronized (pauseLock) {
                while (paused && !cancelled.get()) pauseLock.wait();
            }
            if (cancelled.get()) return;
            int written = audioTrack.write(
                samples, offset, samples.length - offset, AudioTrack.WRITE_BLOCKING);
            if (written < 0) throw new IllegalStateException("AudioTrack write error " + written);
            offset += written;
            framesWritten += written;
        }
    }

    private void drainTail(AtomicBoolean cancelled) throws InterruptedException {
        if (audioTrack == null) return;
        long deadline = System.currentTimeMillis() + 3000;
        while (!cancelled.get() && System.currentTimeMillis() < deadline) {
            long head = audioTrack.getPlaybackHeadPosition() & 0xFFFFFFFFL;
            if (head >= framesWritten) break;
            Thread.sleep(50);
        }
        audioTrack.stop();
    }

    void pausePlayback() {
        if (paused) return;
        paused = true;
        if (audioTrack != null) audioTrack.pause();
        updatePlaybackState(false);
        Listener l = listener;
        if (l != null) l.onStateChanged(false);
        goForeground(false);
    }

    void resumePlayback() {
        if (!paused) return;
        paused = false;
        if (audioTrack != null) audioTrack.play();
        synchronized (pauseLock) {
            pauseLock.notifyAll();
        }
        updatePlaybackState(true);
        Listener l = listener;
        if (l != null) l.onStateChanged(true);
        goForeground(true);
    }

    void stopPlayback() {
        cancelled.set(true);
        synchronized (pauseLock) {
            paused = false;
            pauseLock.notifyAll();
        }
        stopThreads();
        finish();
    }

    private void fail(String message, AtomicBoolean cancelled) {
        Listener l = listener;
        if (l != null) l.onError(message);
        cancelled.set(true);
        finish();
    }

    private void finish() {
        releaseWakeLock();
        abandonAudioFocus();
        if (audioTrack != null) {
            try {
                audioTrack.pause();
                audioTrack.flush();
                audioTrack.release();
            } catch (Exception ignored) {
            }
            audioTrack = null;
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
        }
        coverBitmap = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void stopThreads() {
        cancelled.set(true);
        if (synthesisThread != null) {
            synthesisThread.interrupt();
            synthesisThread = null;
        }
        if (playbackThread != null) {
            playbackThread.interrupt();
            playbackThread = null;
        }
    }

    @Override
    public void onDestroy() {
        stopThreads();
        releaseWakeLock();
        abandonAudioFocus();
        if (audioTrack != null) {
            audioTrack.release();
            audioTrack = null;
        }
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        // Owned by KokoroRuntimeHolder and deliberately survives this service.
        runtime = null;
        super.onDestroy();
    }

    // --- audio plumbing ---

    private void createAudioTrack(int sampleRate) {
        if (audioTrack != null) {
            try {
                audioTrack.release();
            } catch (Exception ignored) {
            }
            audioTrack = null;
        }
        framesWritten = 0;
        interChunkSilence = new float[(int) (sampleRate * 0.3f)];
        int minBuffer = AudioTrack.getMinBufferSize(
            sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT);
        audioTrack = new AudioTrack.Builder()
            .setAudioAttributes(mediaAttributes())
            .setAudioFormat(new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build())
            .setBufferSizeInBytes(Math.max(minBuffer, sampleRate * 4))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build();
        audioTrack.play();
    }

    private AudioAttributes mediaAttributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
    }

    private boolean requestAudioFocus() {
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(mediaAttributes())
                .setOnAudioFocusChangeListener(change -> {
                    if (change == AudioManager.AUDIOFOCUS_LOSS
                        || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                        pausePlayback();
                    }
                })
                .build();
            return audioManager.requestAudioFocus(focusRequest)
                == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        @SuppressWarnings("deprecation")
        int result = audioManager.requestAudioFocus(
            change -> {
                if (change == AudioManager.AUDIOFOCUS_LOSS) pausePlayback();
            },
            AudioManager.STREAM_MUSIC,
            AudioManager.AUDIOFOCUS_GAIN);
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
            focusRequest = null;
        }
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lumen:tts:kokoro");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(4 * 60 * 60 * 1000L); // safety ceiling: 4 hours
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    // --- media session + notification ---

    private void createMediaSession() {
        if (mediaSession == null) {
            mediaSession = new MediaSession(this, "LumenKokoroTts");
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    resumePlayback();
                }

                @Override
                public void onPause() {
                    pausePlayback();
                }

                @Override
                public void onStop() {
                    stopPlayback();
                }

                @Override
                public void onSkipToNext() {
                    Listener l = listener;
                    if (l != null) l.onSkipNext();
                }

                @Override
                public void onSkipToPrevious() {
                    Listener l = listener;
                    if (l != null) l.onSkipPrevious();
                }
            });
        }
        mediaSession.setActive(true);
        updatePlaybackState(true);
    }

    private void updatePlaybackState(boolean playing) {
        if (mediaSession == null) return;
        mediaSession.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, 0, 1f)
            .build());
    }

    private void updateNotificationLine(String line) {
        currentLine = line;
        if (mediaSession != null) {
            mediaSession.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE,
                    request != null && request.title != null ? request.title : "Reading aloud")
                .putString(MediaMetadata.METADATA_KEY_ARTIST, line)
                .build());
        }
        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification(!paused));
        }
    }

    private void goForeground(boolean playing) {
        Notification notification = buildNotification(playing);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification(boolean playing) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Read aloud (Kokoro)", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Read-aloud playback controls");
            manager.createNotificationChannel(channel);
        }

        PendingIntent skipPrevious = servicePendingIntent(1, ACTION_SKIP_PREVIOUS);
        PendingIntent playPause = servicePendingIntent(2, ACTION_PLAY_PAUSE);
        PendingIntent skipNext = servicePendingIntent(3, ACTION_SKIP_NEXT);
        PendingIntent stop = servicePendingIntent(4, ACTION_STOP);
        PendingIntent open = PendingIntent.getActivity(this, 5,
            getPackageManager().getLaunchIntentForPackage(getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        String line = currentLine;
        builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setLargeIcon(coverBitmap)
            .setContentTitle(request != null && request.title != null ? request.title : "Reading aloud")
            .setContentText(line != null && !line.isEmpty() ? line : (playing ? "Playing" : "Paused"))
            .setContentIntent(open)
            .setOngoing(playing)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_previous, "Previous", skipPrevious).build())
            .addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_pause,
                playing ? "Pause" : "Play", playPause).build())
            .addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_next, "Next", skipNext).build())
            .addAction(new Notification.Action.Builder(
                android.R.drawable.ic_delete, "Stop", stop).build())
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        return builder.build();
    }

    private PendingIntent servicePendingIntent(int code, String action) {
        Intent intent = new Intent(this, KokoroTtsService.class).setAction(action);
        return PendingIntent.getService(this, code, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Bitmap decodeCover(String dataUrl) {
        if (dataUrl == null) return null;
        int comma = dataUrl.indexOf(',');
        if (comma < 0) return null;
        try {
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) return null;
            int maxSize = 512;
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            if (width <= maxSize && height <= maxSize) return bitmap;
            float scale = maxSize / (float) Math.max(width, height);
            return Bitmap.createScaledBitmap(
                bitmap, Math.round(width * scale), Math.round(height * scale), true);
        } catch (Exception e) {
            Log.w(TAG, "Failed to decode notification cover", e);
            return null;
        }
    }

    private static String userMessage(Exception e) {
        String message = e.getMessage();
        return message != null && !message.isEmpty() ? message : "Read-aloud failed";
    }
}
