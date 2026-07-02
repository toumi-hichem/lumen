package org.wikisubmission.lumen.supertonic;

import org.json.JSONObject;

/** Parsed tts.json: audio and latent-space parameters the runtime needs. */
final class SupertonicConfig {
    final int sampleRate;
    final int baseChunkSize;
    final int chunkCompressFactor;
    final int latentDim;

    private SupertonicConfig(int sampleRate, int baseChunkSize, int chunkCompressFactor, int latentDim) {
        this.sampleRate = sampleRate;
        this.baseChunkSize = baseChunkSize;
        this.chunkCompressFactor = chunkCompressFactor;
        this.latentDim = latentDim;
    }

    static SupertonicConfig fromJson(String json) throws Exception {
        JSONObject root = new JSONObject(json);
        JSONObject ae = root.getJSONObject("ae");
        JSONObject ttl = root.getJSONObject("ttl");
        return new SupertonicConfig(
            ae.getInt("sample_rate"),
            ae.getInt("base_chunk_size"),
            ttl.getInt("chunk_compress_factor"),
            ttl.getInt("latent_dim")
        );
    }
}
