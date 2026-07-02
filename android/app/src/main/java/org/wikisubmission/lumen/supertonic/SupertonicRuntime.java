package org.wikisubmission.lumen.supertonic;

import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.atomic.AtomicBoolean;

import org.json.JSONArray;
import org.json.JSONObject;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/**
 * Native Supertonic inference via onnxruntime-android. Port of the web
 * runtime (src/tts/supertonic/runtime.ts). Runs the four-model pipeline
 * (duration predictor, text encoder, iterative vector estimator, vocoder)
 * with multithreaded CPU execution: XNNPACK when it initializes, otherwise
 * the default CPU provider with intra-op threads.
 */
final class SupertonicRuntime implements AutoCloseable {

    /** Cancelled synthesis surfaces as this, so callers can tell it from failures. */
    static final class CancelledException extends Exception {
        CancelledException() {
            super("Synthesis cancelled");
        }
    }

    static final class Style implements AutoCloseable {
        final OnnxTensor ttl;
        final OnnxTensor dp;

        Style(OnnxTensor ttl, OnnxTensor dp) {
            this.ttl = ttl;
            this.dp = dp;
        }

        @Override
        public void close() {
            ttl.close();
            dp.close();
        }
    }

    private final OrtEnvironment env;
    private final OrtSession dpSession;
    private final OrtSession textEncSession;
    private final OrtSession vectorEstSession;
    private final OrtSession vocoderSession;
    private final SupertonicConfig cfg;
    private final UnicodeTextProcessor processor;
    private final SupertonicModelStore store;
    private final Map<String, Style> styleCache = new HashMap<>();
    private final Random random = new Random();

    SupertonicRuntime(SupertonicModelStore store) throws Exception {
        this.store = store;
        this.env = OrtEnvironment.getEnvironment();
        this.cfg = SupertonicConfig.fromJson(store.readText("onnx/tts.json"));
        this.processor = new UnicodeTextProcessor(store.readText("onnx/unicode_indexer.json"));

        OrtSession.SessionOptions options = buildSessionOptions();
        this.dpSession = env.createSession(store.file("onnx/duration_predictor.onnx").getAbsolutePath(), options);
        this.textEncSession = env.createSession(store.file("onnx/text_encoder.onnx").getAbsolutePath(), buildSessionOptions());
        this.vectorEstSession = env.createSession(store.file("onnx/vector_estimator.onnx").getAbsolutePath(), buildSessionOptions());
        this.vocoderSession = env.createSession(store.file("onnx/vocoder.onnx").getAbsolutePath(), buildSessionOptions());
    }

    int sampleRate() {
        return cfg.sampleRate;
    }

    /**
     * Multithreaded default CPU provider. XNNPACK was tried first (ORT's
     * recommendation for fp32 mobile models) but produced garbled audio from
     * the second utterance on: the first inference was correct and later ones
     * with different tensor shapes were noise, consistent with XNNPACK
     * shape-cache misbehavior on this model. sherpa-onnx ships the plain CPU
     * provider for all its Android TTS models (including Supertonic) for the
     * same reason; it is the proven-correct multithreaded path.
     */
    private OrtSession.SessionOptions buildSessionOptions() throws Exception {
        int threads = Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() - 1));
        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        options.setIntraOpNumThreads(threads);
        return options;
    }

    Style style(String voiceId) throws Exception {
        Style cached = styleCache.get(voiceId);
        if (cached != null) return cached;
        JSONObject json = new JSONObject(store.readText("voice_styles/" + voiceId + ".json"));
        Style style = new Style(
            tensorFromJson(json.getJSONObject("style_ttl")),
            tensorFromJson(json.getJSONObject("style_dp"))
        );
        styleCache.put(voiceId, style);
        return style;
    }

    private OnnxTensor tensorFromJson(JSONObject spec) throws Exception {
        JSONArray dimsArr = spec.getJSONArray("dims");
        long[] dims = new long[dimsArr.length()];
        long count = 1;
        for (int i = 0; i < dims.length; i++) {
            dims[i] = dimsArr.getLong(i);
            count *= dims[i];
        }
        float[] data = new float[(int) count];
        flattenInto(spec.get("data"), data, 0);
        return OnnxTensor.createTensor(env, FloatBuffer.wrap(data), dims);
    }

    /** Voice style JSON nests arrays arbitrarily; flatten in document order. */
    private static int flattenInto(Object node, float[] out, int offset) throws Exception {
        if (node instanceof JSONArray) {
            JSONArray arr = (JSONArray) node;
            for (int i = 0; i < arr.length(); i++) {
                offset = flattenInto(arr.get(i), out, offset);
            }
            return offset;
        }
        out[offset] = (float) ((Number) node).doubleValue();
        return offset + 1;
    }

    /**
     * Synthesize one utterance to mono float PCM. `cancel` is polled between
     * model runs (dominantly the denoising steps) to interrupt promptly.
     */
    float[] synthesize(String text, String lang, Style style, int totalStep, float speed, AtomicBoolean cancel)
        throws Exception {
        UnicodeTextProcessor.Processed processed = processor.process(text, lang);
        int textLen = processed.length;

        float[] textMask = new float[textLen];
        java.util.Arrays.fill(textMask, 1f);

        try (OnnxTensor textIds = OnnxTensor.createTensor(env, LongBuffer.wrap(processed.textIds), new long[]{1, textLen});
             OnnxTensor textMaskTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(textMask), new long[]{1, 1, textLen})) {

            // 1. Duration predictor.
            float durationSec;
            Map<String, OnnxTensor> dpInputs = new HashMap<>();
            dpInputs.put("text_ids", textIds);
            dpInputs.put("style_dp", style.dp);
            dpInputs.put("text_mask", textMaskTensor);
            try (OrtSession.Result result = dpSession.run(dpInputs)) {
                OnnxTensor duration = (OnnxTensor) result.get("duration")
                    .orElseThrow(() -> new Exception("duration output missing"));
                durationSec = duration.getFloatBuffer().get(0) / speed;
            }
            throwIfCancelled(cancel);

            // 2. Text encoder.
            Map<String, OnnxTensor> encInputs = new HashMap<>();
            encInputs.put("text_ids", textIds);
            encInputs.put("style_ttl", style.ttl);
            encInputs.put("text_mask", textMaskTensor);
            try (OrtSession.Result encResult = textEncSession.run(encInputs)) {
                OnnxTensor textEmb = (OnnxTensor) encResult.get("text_emb")
                    .orElseThrow(() -> new Exception("text_emb output missing"));
                throwIfCancelled(cancel);

                // 3. Iterative denoising in flat float[] form.
                int chunkSize = cfg.baseChunkSize * cfg.chunkCompressFactor;
                int wavLen = (int) Math.floor(durationSec * cfg.sampleRate);
                int latentLen = (wavLen + chunkSize - 1) / chunkSize;
                if (latentLen < 1) latentLen = 1;
                int latentDim = cfg.latentDim * cfg.chunkCompressFactor;

                float[] latentMask = new float[latentLen];
                java.util.Arrays.fill(latentMask, 1f);

                float[] xt = new float[latentDim * latentLen];
                for (int i = 0; i < xt.length; i++) {
                    xt[i] = (float) random.nextGaussian();
                }

                float[] wav;
                try (OnnxTensor latentMaskTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(latentMask), new long[]{1, 1, latentLen});
                     OnnxTensor totalStepTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(new float[]{totalStep}), new long[]{1})) {

                    for (int step = 0; step < totalStep; step++) {
                        throwIfCancelled(cancel);
                        try (OnnxTensor xtTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(xt), new long[]{1, latentDim, latentLen});
                             OnnxTensor currentStepTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(new float[]{step}), new long[]{1})) {
                            Map<String, OnnxTensor> estInputs = new HashMap<>();
                            estInputs.put("noisy_latent", xtTensor);
                            estInputs.put("text_emb", textEmb);
                            estInputs.put("style_ttl", style.ttl);
                            estInputs.put("latent_mask", latentMaskTensor);
                            estInputs.put("text_mask", textMaskTensor);
                            estInputs.put("current_step", currentStepTensor);
                            estInputs.put("total_step", totalStepTensor);
                            try (OrtSession.Result estResult = vectorEstSession.run(estInputs)) {
                                OnnxTensor denoised = (OnnxTensor) estResult.get("denoised_latent")
                                    .orElseThrow(() -> new Exception("denoised_latent output missing"));
                                FloatBuffer buf = denoised.getFloatBuffer();
                                buf.get(xt);
                            }
                        }
                    }

                    // 4. Vocoder.
                    throwIfCancelled(cancel);
                    try (OnnxTensor finalXt = OnnxTensor.createTensor(env, FloatBuffer.wrap(xt), new long[]{1, latentDim, latentLen})) {
                        Map<String, OnnxTensor> vocInputs = new HashMap<>();
                        vocInputs.put("latent", finalXt);
                        try (OrtSession.Result vocResult = vocoderSession.run(vocInputs)) {
                            OnnxTensor wavTensor = (OnnxTensor) vocResult.get("wav_tts")
                                .orElseThrow(() -> new Exception("wav_tts output missing"));
                            FloatBuffer buf = wavTensor.getFloatBuffer();
                            wav = new float[buf.remaining()];
                            buf.get(wav);
                        }
                    }
                }

                int keep = Math.min(wav.length, (int) Math.floor(cfg.sampleRate * durationSec));
                if (keep < wav.length) {
                    float[] trimmed = new float[keep];
                    System.arraycopy(wav, 0, trimmed, 0, keep);
                    return trimmed;
                }
                return wav;
            }
        }
    }

    private static void throwIfCancelled(AtomicBoolean cancel) throws CancelledException {
        if (cancel != null && cancel.get()) throw new CancelledException();
    }

    @Override
    public void close() {
        for (Style style : styleCache.values()) style.close();
        styleCache.clear();
        closeQuietly(dpSession);
        closeQuietly(textEncSession);
        closeQuietly(vectorEstSession);
        closeQuietly(vocoderSession);
    }

    private static void closeQuietly(OrtSession session) {
        try {
            session.close();
        } catch (Exception ignored) {
        }
    }
}
