package org.wikisubmission.lumen.supertonic;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
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
import android.util.Log;

import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Foreground media-playback service that runs the whole read-aloud queue
 * natively: Supertonic inference (onnxruntime-android) on a synthesis thread
 * feeding an AudioTrack playback thread. Because everything lives in this
 * service (with a partial wake lock and a MediaSession), audio keeps playing
 * when the screen is off and the WebView is suspended, which no JS-driven
 * pipeline can do.
 *
 * The queue and listener are handed over through static state set by
 * SupertonicNativePlugin before startForegroundService(); an Intent cannot
 * carry a whole chapter of text plus a callback.
 */
public class SupertonicTtsService extends Service {

    private static final String TAG = "SupertonicTts";
    private static final String CHANNEL_ID = "lumen_tts";
    private static final int NOTIFICATION_ID = 41;
    /** Quality floor for the adaptive step reduction (web engine uses 4 too). */
    private static final int MIN_STEPS = 4;

    static final String ACTION_START = "org.wikisubmission.lumen.tts.START";
    static final String ACTION_PLAY_PAUSE = "org.wikisubmission.lumen.tts.PLAY_PAUSE";
    static final String ACTION_PAUSE = "org.wikisubmission.lumen.tts.PAUSE";
    static final String ACTION_RESUME = "org.wikisubmission.lumen.tts.RESUME";
    static final String ACTION_STOP = "org.wikisubmission.lumen.tts.STOP";

    /** Progress callbacks, delivered on background threads. */
    interface Listener {
        void onChunk(int index);

        void onStateChanged(boolean playing);

        void onComplete();

        void onError(String message);

        /** Model sessions are being created (first play of this process). */
        void onModelLoading();

        /** Model sessions ready; elapsedMs is 0 when already loaded. */
        void onModelReady(long elapsedMs);

        /** Synthesis of chunk `index` started (audio may still be queued). */
        void onSynthesizing(int index);
    }

    static final class Request {
        final List<String> chunks;
        final String voiceId;
        final float rate;
        final int steps;
        final int startIndex;
        final String lang;
        final String title;

        Request(List<String> chunks, String voiceId, float rate, int steps, int startIndex, String lang, String title) {
            this.chunks = chunks;
            this.voiceId = voiceId;
            this.rate = rate;
            this.steps = steps;
            this.startIndex = startIndex;
            this.lang = lang;
            this.title = title;
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

    /** Poison pill signalling the end of the queue to the playback thread. */
    private static final Synthesized END = new Synthesized(-1, new float[0]);

    /**
     * Cancellation token of the CURRENT queue. Each start() installs a fresh
     * token and threads capture the one they were born with: replacing the
     * queue (e.g. a voice change mid-playback) cancels only the old token.
     * Re-using a single flag here was a race — start() would reset it while
     * the old threads were still winding down, re-arming them against the new
     * queue's AudioTrack and runtime.
     */
    private volatile AtomicBoolean cancelled = new AtomicBoolean(false);
    private final Object pauseLock = new Object();
    private volatile boolean paused = false;
    /** Mono frames written to the current AudioTrack, for end-of-queue drain. */
    private long framesWritten = 0;

    private SupertonicRuntime runtime;
    /** 0.3 s of silence written between chunks, like the official pipeline. */
    private float[] interChunkSilence = new float[0];
    private AudioTrack audioTrack;
    private MediaSession mediaSession;
    private PowerManager.WakeLock wakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private Thread synthesisThread;
    private Thread playbackThread;
    private Request request;
    /** Line shown in the notification: the sentence being spoken, or a status. */
    private volatile String currentLine;

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
        // A new queue replaces any current one: cancel the old token, then
        // install a fresh one so the outgoing threads can never be re-armed.
        stopThreads();
        AtomicBoolean token = new AtomicBoolean(false);
        this.cancelled = token;
        this.request = req;
        this.paused = false;
        this.currentLine = null;

        createMediaSession();
        goForeground(true);
        acquireWakeLock();

        synthesisThread = new Thread(() -> runPipeline(req, token), "supertonic-synthesis");
        synthesisThread.start();
    }

    private void runPipeline(Request request, AtomicBoolean cancelled) {
        BlockingQueue<Synthesized> buffer = new ArrayBlockingQueue<>(2);
        Listener l = listener;
        try {
            // The runtime is process-wide (SupertonicRuntimeHolder): loading
            // the four ONNX sessions takes seconds, so it must survive this
            // service instance, which stops itself after every queue.
            boolean wasLoaded = SupertonicRuntimeHolder.isLoaded();
            if (!wasLoaded) {
                updateNotificationLine("Loading voice model…");
                if (l != null) l.onModelLoading();
            }
            long loadStart = SystemClock.elapsedRealtime();
            runtime = SupertonicRuntimeHolder.obtain(this, null);
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
                () -> drainAndPlay(buffer, request, cancelled), "supertonic-playback");
            playbackThread.start();

            SupertonicRuntime.Style style = runtime.style(request.voiceId);
            // Adaptive quality: start at the level the detected CPU topology
            // can plausibly hold in realtime, then adapt from measured RTF —
            // when synthesis is slower than playback (RTF above ~0.9,
            // including a margin for the buffer), trade denoising steps for
            // speed instead of leaving gaps between sentences; with clear
            // headroom, claw quality back up to the requested level.
            CpuTopology topology = CpuTopology.detect();
            int steps = debugSteps(topology.initialSteps(request.steps));
            Log.i(TAG, "Strategy for " + topology + ": "
                + topology.inferenceThreads() + " threads, "
                + steps + "/" + request.steps + " initial steps");
            for (int i = request.startIndex; i < request.chunks.size(); i++) {
                if (cancelled.get()) break;
                if (l != null) l.onSynthesizing(i);
                long t0 = SystemClock.elapsedRealtime();
                float[] samples = runtime.synthesize(
                    request.chunks.get(i), request.lang, style, steps, request.rate, cancelled);
                long ms = SystemClock.elapsedRealtime() - t0;
                double audioSec = samples.length / (double) runtime.sampleRate();
                double rtf = audioSec > 0 ? (ms / 1000.0) / audioSec : 0;
                Log.d(TAG, "Synthesized chunk " + i + " ("
                    + request.chunks.get(i).length() + " chars, " + steps + " steps) in "
                    + ms + " ms, rtf=" + String.format(java.util.Locale.US, "%.2f", rtf));
                // Short utterances (headings) and the first-inference warmup
                // both skew RTF upward; only adapt on a meaningful sample.
                if (audioSec >= 3) {
                    if (rtf > 0.9 && steps > MIN_STEPS) {
                        steps = Math.max(MIN_STEPS, steps - 2);
                        Log.i(TAG, "Device slower than realtime, reducing steps to " + steps);
                    } else if (rtf < 0.55 && steps < request.steps) {
                        // Ample headroom (e.g. downgraded by one transient
                        // slow chunk): claw quality back one step at a time.
                        steps += 1;
                        Log.i(TAG, "Device has headroom, raising steps to " + steps);
                    }
                }
                buffer.put(new Synthesized(i, samples));
            }
            buffer.put(END);
        } catch (SupertonicRuntime.CancelledException | InterruptedException e) {
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
                    // A superseded queue must fall silent, not report
                    // completion (which would trigger chapter auto-advance)
                    // or tear the service down under the new queue.
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
                // The official pipeline joins chunks with 0.3 s of silence;
                // without it consecutive sentences run into each other.
                writeFully(interChunkSilence, cancelled);
            }
        } catch (InterruptedException e) {
            // Stopped.
        } catch (Exception e) {
            Log.e(TAG, "Playback failed", e);
            if (!cancelled.get()) fail(userMessage(e), cancelled);
        }
    }

    /** Blocking write, honouring pause (AudioTrack.pause blocks write consumers). */
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

    /** Let the buffered tail of the last chunk play out before finishing. */
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
        // The runtime is owned by SupertonicRuntimeHolder and deliberately
        // survives this service: closing it here forced a multi-second model
        // reload on every play.
        runtime = null;
        super.onDestroy();
    }

    // --- audio plumbing ---

    /**
     * A fresh track per queue run: a stopped/flushed AudioTrack reused across
     * runs is a source of corrupted output, and per-run creation is cheap.
     */
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
        // Inference needs CPU while the screen is off; audio output alone does
        // not keep the app processor awake for our synthesis thread.
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lumen:tts");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(4 * 60 * 60 * 1000L); // safety ceiling: 4 hours
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    // --- media session + notification ---

    private void createMediaSession() {
        if (mediaSession == null) {
            mediaSession = new MediaSession(this, "LumenTts");
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
            });
        }
        mediaSession.setActive(true);
        updatePlaybackState(true);
    }

    private void updatePlaybackState(boolean playing) {
        if (mediaSession == null) return;
        mediaSession.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, 0, 1f)
            .build());
    }

    /**
     * Show `line` (the sentence being spoken, or a status like "Loading voice
     * model…") in the media notification and on the lock screen. Safe from any
     * thread; notification managers are thread-safe.
     */
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
                CHANNEL_ID, "Read aloud", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Read-aloud playback controls");
            manager.createNotificationChannel(channel);
        }

        PendingIntent playPause = servicePendingIntent(1, ACTION_PLAY_PAUSE);
        PendingIntent stop = servicePendingIntent(2, ACTION_STOP);
        PendingIntent open = PendingIntent.getActivity(this, 3,
            getPackageManager().getLaunchIntentForPackage(getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        String line = currentLine;
        builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(request != null && request.title != null ? request.title : "Reading aloud")
            .setContentText(line != null && !line.isEmpty() ? line : (playing ? "Playing" : "Paused"))
            .setContentIntent(open)
            .setOngoing(playing)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_pause,
                playing ? "Pause" : "Play", playPause).build())
            .addAction(new Notification.Action.Builder(
                android.R.drawable.ic_delete, "Stop", stop).build())
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1));
        return builder.build();
    }

    private PendingIntent servicePendingIntent(int code, String action) {
        Intent intent = new Intent(this, SupertonicTtsService.class).setAction(action);
        return PendingIntent.getService(this, code, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** `adb shell setprop debug.lumen.tts.steps N` overrides for experiments. */
    private static int debugSteps(int requested) {
        int forced = CpuTopology.intProp("debug.lumen.tts.steps");
        return forced > 0 ? forced : requested;
    }

    private static String userMessage(Exception e) {
        String message = e.getMessage();
        return message != null && !message.isEmpty() ? message : "Read-aloud failed";
    }
}
