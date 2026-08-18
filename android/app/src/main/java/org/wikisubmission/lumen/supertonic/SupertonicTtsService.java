package org.wikisubmission.lumen.supertonic;

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
    /** Speaking rate assumed before any audio exists to measure, at rate 1.0. */
    private static final float DEFAULT_CHARS_PER_SECOND = 14f;
    /** Characters of real audio needed before the measured rate is trusted. */
    private static final int MIN_CHARS_FOR_ESTIMATE = 200;

    static final String ACTION_START = "org.wikisubmission.lumen.tts.START";
    static final String ACTION_PLAY_PAUSE = "org.wikisubmission.lumen.tts.PLAY_PAUSE";
    static final String ACTION_PAUSE = "org.wikisubmission.lumen.tts.PAUSE";
    static final String ACTION_RESUME = "org.wikisubmission.lumen.tts.RESUME";
    static final String ACTION_STOP = "org.wikisubmission.lumen.tts.STOP";
    static final String ACTION_SKIP_NEXT = "org.wikisubmission.lumen.tts.SKIP_NEXT";
    static final String ACTION_SKIP_PREVIOUS = "org.wikisubmission.lumen.tts.SKIP_PREVIOUS";

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

        /**
         * Skip requested from the notification, a headset/Bluetooth button, or
         * Android Auto. The service has no chapter model, so it forwards the
         * request instead of acting on it.
         */
        void onSkipNext();

        void onSkipPrevious();
    }

    static final class Request {
        final List<String> chunks;
        final String voiceId;
        final float rate;
        final int steps;
        final int startIndex;
        final String lang;
        final String title;
        /** Notification large-icon art: a data: URL, or null for none. */
        final String cover;

        Request(List<String> chunks, String voiceId, float rate, int steps, int startIndex, String lang, String title, String cover) {
            this.chunks = chunks;
            this.voiceId = voiceId;
            this.rate = rate;
            this.steps = steps;
            this.startIndex = startIndex;
            this.lang = lang;
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
    private volatile long framesWritten = 0;
    /** Characters of the whole queue, from the start index to the last chunk. */
    private volatile long queuedChars = 0;
    /** Characters whose audio has been fully written, and the frames it took. */
    private volatile long spokenChars = 0;
    private volatile long spokenFrames = 0;
    /** Output rate of the current AudioTrack, for frame → millisecond maths. */
    private volatile int sampleRate = 0;

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
    /** Decoded once per queue start; reused by every notification rebuild. */
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
        // A new queue replaces any current one: cancel the old token, then
        // install a fresh one so the outgoing threads can never be re-armed.
        stopThreads();
        AtomicBoolean token = new AtomicBoolean(false);
        this.cancelled = token;
        this.request = req;
        this.paused = false;
        this.currentLine = null;
        this.coverBitmap = decodeCover(req.cover);
        this.queuedChars = countChars(req);
        this.spokenChars = 0;
        this.spokenFrames = 0;

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
                // Chunk fully rendered: its characters and the frames they
                // took are now a measured sample of this voice's speed.
                spokenChars += request.chunks.get(chunk.index).length();
                spokenFrames = framesWritten;
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
        this.sampleRate = sampleRate;
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

    /**
     * Publish transport state plus the elapsed position. The position is real
     * (frames the AudioTrack has actually played), and the playback speed tells
     * the system media controls to keep the seek bar moving between updates —
     * without both, the notification shows no progress at all.
     */
    private void updatePlaybackState(boolean playing) {
        if (mediaSession == null) return;
        mediaSession.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
            .setState(
                playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                positionMs(),
                playing ? 1f : 0f)
            .build());
    }

    /** Milliseconds of audio the device has actually played in this queue. */
    private long positionMs() {
        AudioTrack track = audioTrack;
        if (track == null || sampleRate <= 0) return 0;
        long frames = track.getPlaybackHeadPosition() & 0xFFFFFFFFL;
        return frames * 1000L / sampleRate;
    }

    /**
     * Expected length of the whole queue, used as the seek bar's maximum.
     * Audio already rendered gives an exact milliseconds-per-character figure
     * for this voice and rate, and the rest of the queue is projected from it,
     * so the estimate converges as reading goes on. Until enough audio exists
     * to measure, a nominal speaking rate stands in.
     */
    private long durationMs() {
        long position = positionMs();
        Request req = request;
        if (req == null || sampleRate <= 0 || queuedChars <= 0) return position;
        long chars = spokenChars;
        long renderedMs = spokenFrames * 1000L / sampleRate;
        double msPerChar = chars >= MIN_CHARS_FOR_ESTIMATE && renderedMs > 0
            ? renderedMs / (double) chars
            : 1000.0 / (DEFAULT_CHARS_PER_SECOND * Math.max(0.1f, req.rate));
        long remaining = Math.max(0, queuedChars - chars);
        return Math.max(position, renderedMs + Math.round(remaining * msPerChar));
    }

    /** Characters left to read in `req`, from its start index to the end. */
    private static long countChars(Request req) {
        long total = 0;
        for (int i = Math.max(0, req.startIndex); i < req.chunks.size(); i++) {
            total += req.chunks.get(i).length();
        }
        return total;
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
                // Without a duration the media controls draw no seek bar at all.
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs())
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
        Intent intent = new Intent(this, SupertonicTtsService.class).setAction(action);
        return PendingIntent.getService(this, code, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Decode the book cover (a data: URL forwarded from JS) into a Bitmap
     * sized for a notification's large icon. Downscaled because a cover can
     * be a few megapixels and this only runs once per queue start, not per
     * notification rebuild.
     */
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
