package org.wikisubmission.lumen.kokoro;

import java.util.HashMap;
import java.util.Map;

/**
 * Kokoro's phoneme-to-id vocabulary, transcribed from `tokenizer.json` in
 * onnx-community/Kokoro-82M-v1.0-ONNX — see src/tts/kokoro/vocab.ts (the
 * web-side twin) for provenance. The graph takes a sequence of these ids as
 * `input_ids`; every sequence is wrapped with the pad token (id 0, `$`) at
 * both ends, matching the tokenizer's own TemplateProcessing post processor.
 */
final class KokoroVocab {

    static final long PAD_TOKEN_ID = 0;

    private static final Map<Character, Integer> VOCAB = buildVocab();

    private KokoroVocab() {
    }

    private static Map<Character, Integer> buildVocab() {
        Map<Character, Integer> v = new HashMap<>();
        v.put('$', 0); v.put(';', 1); v.put(':', 2); v.put(',', 3); v.put('.', 4);
        v.put('!', 5); v.put('?', 6); v.put('—', 9); v.put('…', 10); v.put('"', 11);
        v.put('(', 12); v.put(')', 13); v.put('“', 14); v.put('”', 15); v.put(' ', 16);
        v.put('ẽ', 17); v.put('ʣ', 18); v.put('ʥ', 19); v.put('ʦ', 20); v.put('ʨ', 21);
        v.put('ᵝ', 22); v.put('ꭧ', 23); v.put('A', 24); v.put('I', 25); v.put('O', 31);
        v.put('Q', 33); v.put('S', 35); v.put('T', 36); v.put('W', 39); v.put('Y', 41);
        v.put('ᵊ', 42); v.put('a', 43); v.put('b', 44); v.put('c', 45); v.put('d', 46);
        v.put('e', 47); v.put('f', 48); v.put('h', 50); v.put('i', 51); v.put('j', 52);
        v.put('k', 53); v.put('l', 54); v.put('m', 55); v.put('n', 56); v.put('o', 57);
        v.put('p', 58); v.put('q', 59); v.put('r', 60); v.put('s', 61); v.put('t', 62);
        v.put('u', 63); v.put('v', 64); v.put('w', 65); v.put('x', 66); v.put('y', 67);
        v.put('z', 68); v.put('ɑ', 69); v.put('ɐ', 70); v.put('ɒ', 71); v.put('æ', 72);
        v.put('β', 75); v.put('ɔ', 76); v.put('ɕ', 77); v.put('ç', 78); v.put('ɖ', 80);
        v.put('ð', 81); v.put('ʤ', 82); v.put('ə', 83); v.put('ɚ', 85); v.put('ɛ', 86);
        v.put('ɜ', 87); v.put('ɟ', 90); v.put('ɡ', 92); v.put('ɥ', 99); v.put('ɨ', 101);
        v.put('ɪ', 102); v.put('ʝ', 103); v.put('ɯ', 110); v.put('ɰ', 111); v.put('ŋ', 112);
        v.put('ɳ', 113); v.put('ɲ', 114); v.put('ɴ', 115); v.put('ø', 116); v.put('ɸ', 118);
        v.put('θ', 119); v.put('œ', 120); v.put('ɹ', 123); v.put('ɾ', 125); v.put('ɻ', 126);
        v.put('ʁ', 128); v.put('ɽ', 129); v.put('ʂ', 130); v.put('ʃ', 131); v.put('ʈ', 132);
        v.put('ʧ', 133); v.put('ʊ', 135); v.put('ʋ', 136); v.put('ʌ', 138); v.put('ɣ', 139);
        v.put('ɤ', 140); v.put('χ', 142); v.put('ʎ', 143); v.put('ʒ', 147); v.put('ʔ', 148);
        v.put('ˈ', 156); v.put('ˌ', 157); v.put('ː', 158); v.put('ʰ', 162); v.put('ʲ', 164);
        v.put('↓', 169); v.put('→', 171); v.put('↗', 172); v.put('↘', 173); v.put('ᵻ', 177);
        return v;
    }

    /** Characters the vocab has no id for are dropped. */
    static long[] tokenIds(String phonemes) {
        long[] buf = new long[phonemes.length() + 2];
        int n = 0;
        buf[n++] = PAD_TOKEN_ID;
        for (int i = 0; i < phonemes.length(); i++) {
            Integer id = VOCAB.get(phonemes.charAt(i));
            if (id != null) buf[n++] = id;
        }
        buf[n++] = PAD_TOKEN_ID;
        long[] out = new long[n];
        System.arraycopy(buf, 0, out, 0, n);
        return out;
    }
}
