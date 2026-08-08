package org.wikisubmission.lumen.kokoro;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import org.json.JSONObject;
import org.wikisubmission.lumen.supertonic.CpuTopology;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/**
 * Native Kokoro (StyleTextToSpeech2) inference via onnxruntime-android. Port
 * of the web runtime (src/tts/kokoro/runtime.ts). Unlike Supertonic's
 * 4-session iterative-denoising pipeline (see SupertonicRuntime), Kokoro is
 * one graph: `input_ids` (phoneme token ids) + `style` (256-dim vector) +
 * `speed` in, a 24kHz mono waveform out. There is no steps/quality knob to
 * adapt at runtime.
 */
final class KokoroRuntime implements AutoCloseable {

    static final class CancelledException extends Exception {
        CancelledException() {
            super("Synthesis cancelled");
        }
    }

    static final int SAMPLE_RATE = 24000;
    private static final int STYLE_DIM = 256;
    private static final int MAX_STYLE_INDEX = 509;

    private final OrtEnvironment env;
    private final OrtSession session;
    private final KokoroLexicon lexicon;
    private final KokoroModelStore store;
    private final Map<String, float[]> bankCache = new HashMap<>();
    private final CpuTopology topology;

    KokoroRuntime(KokoroModelStore store) throws Exception {
        this.store = store;
        this.topology = CpuTopology.detect();
        android.util.Log.i("KokoroTts", "CPU topology " + topology
            + ": " + topology.inferenceThreads() + " intra-op threads");
        this.env = OrtEnvironment.getEnvironment();
        this.lexicon = new KokoroLexicon(
            parseLexicon(store.readText(KokoroModelStore.LEXICON_FILES[0])),
            parseLexicon(store.readText(KokoroModelStore.LEXICON_FILES[1])));

        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        // Same CPU-EP-only choice as SupertonicRuntime: XNNPACK's shape-cache
        // misbehavior on varying tensor shapes is a risk this model shares
        // too (phoneme-sequence length varies per chunk).
        options.setIntraOpNumThreads(topology.inferenceThreads());
        this.session = env.createSession(
            store.file(KokoroModelStore.MODEL_FILE).getAbsolutePath(), options);
    }

    int sampleRate() {
        return SAMPLE_RATE;
    }

    /**
     * Synthesize one chunk to mono float PCM. `cancel` is polled around the
     * (single) graph run so a stop request lands promptly.
     */
    float[] synthesize(String text, String voiceId, float speed, AtomicBoolean cancel) throws Exception {
        String phonemes = lexicon.phonemize(text);
        long[] tokenIds = KokoroVocab.tokenIds(phonemes);
        if (tokenIds.length <= 2) return new float[0];

        throwIfCancelled(cancel);
        float[] bank = styleBank(voiceId);
        float[] style = styleFor(bank, tokenIds.length);

        try (OnnxTensor idsTensor = OnnxTensor.createTensor(
                 env, LongBuffer.wrap(tokenIds), new long[]{1, tokenIds.length});
             OnnxTensor styleTensor = OnnxTensor.createTensor(
                 env, FloatBuffer.wrap(style), new long[]{1, STYLE_DIM});
             OnnxTensor speedTensor = OnnxTensor.createTensor(
                 env, FloatBuffer.wrap(new float[]{speed}), new long[]{1})) {

            Map<String, OnnxTensor> inputs = new HashMap<>();
            inputs.put("input_ids", idsTensor);
            inputs.put("style", styleTensor);
            inputs.put("speed", speedTensor);
            throwIfCancelled(cancel);
            try (OrtSession.Result result = session.run(inputs)) {
                OnnxTensor waveform = (OnnxTensor) result.get("waveform")
                    .orElseThrow(() -> new Exception("waveform output missing"));
                FloatBuffer buf = waveform.getFloatBuffer();
                float[] wav = new float[buf.remaining()];
                buf.get(wav);
                return wav;
            }
        }
    }

    private float[] styleBank(String voiceId) throws Exception {
        float[] cached = bankCache.get(voiceId);
        if (cached != null) return cached;
        byte[] bytes = store.readBytes("voices/" + voiceId + ".bin");
        FloatBuffer floats = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer();
        float[] bank = new float[floats.remaining()];
        floats.get(bank);
        bankCache.put(voiceId, bank);
        return bank;
    }

    /** Picks the style row matching this phoneme-token count, per the model's own convention. */
    private static float[] styleFor(float[] bank, int tokenCount) {
        int index = Math.min(Math.max(tokenCount - 2, 0), MAX_STYLE_INDEX);
        int offset = index * STYLE_DIM;
        float[] out = new float[STYLE_DIM];
        System.arraycopy(bank, offset, out, 0, STYLE_DIM);
        return out;
    }

    /**
     * Lexicon JSON is a flat map of word -&gt; pronunciation, with a small
     * fraction of entries a heteronym map (POS tag -&gt; pronunciation or
     * JSON null). Both shapes are normalized into a plain
     * Map&lt;String, Object&gt; here so KokoroLexicon's lookup logic never
     * touches org.json directly, keeping it host-JVM-testable without it.
     */
    private static Map<String, Object> parseLexicon(String json) throws Exception {
        JSONObject root = new JSONObject(json);
        Map<String, Object> out = new HashMap<>(root.length() * 2);
        Iterator<String> keys = root.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = root.get(key);
            if (value instanceof JSONObject) {
                JSONObject tagged = (JSONObject) value;
                Map<String, String> entry = new HashMap<>();
                Iterator<String> tags = tagged.keys();
                while (tags.hasNext()) {
                    String tag = tags.next();
                    Object v = tagged.get(tag);
                    entry.put(tag, v == JSONObject.NULL ? null : (String) v);
                }
                out.put(key, entry);
            } else if (value != JSONObject.NULL) {
                out.put(key, (String) value);
            }
        }
        return out;
    }

    private static void throwIfCancelled(AtomicBoolean cancel) throws CancelledException {
        if (cancel != null && cancel.get()) throw new CancelledException();
    }

    @Override
    public void close() {
        bankCache.clear();
        try {
            session.close();
        } catch (Exception ignored) {
        }
    }
}
