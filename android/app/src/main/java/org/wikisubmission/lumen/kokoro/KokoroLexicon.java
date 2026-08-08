package org.wikisubmission.lumen.kokoro;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * English grapheme-to-phoneme (G2P), ported from Misaki's dictionary lookup
 * and morphological stemming (github.com/hexgrad/misaki, Apache-2.0,
 * misaki/en.py's Lexicon class) — see src/tts/kokoro/g2p.ts for the web-side
 * twin of this port and the full rationale (Misaki's own primary path here
 * is a curated dictionary with eSpeak-NG, GPL-3.0, as an out-of-dictionary
 * fallback only; we port the dictionary/stemming path and, matching
 * Misaki's own documented behavior with no eSpeak fallback configured, drop
 * an out-of-dictionary word's phonemes silently rather than mispronounce or
 * error).
 *
 * Dictionary entries are `String` (a plain pronunciation) or
 * `Map&lt;String, String&gt;` (a heteronym, keyed by POS tag; we always take
 * "DEFAULT" since there is no POS tagger here). Not ported: spaCy-based POS
 * disambiguation, acronym/NNP letter-spelling, Misaki's fuller currency/date
 * handling (a from-scratch cardinal/ordinal number reader is included
 * instead, since numbers are common in book prose).
 */
final class KokoroLexicon {

    private static final Set<Character> US_FLAP_CONTEXT = charSet("AIOWYiuæɑəɛɪɹʊʌ");
    private static final Pattern ALPHA_ONLY = Pattern.compile("^[A-Za-z]+$");
    private static final Pattern WORD_ONLY = Pattern.compile("^[A-Za-z']+$");
    private static final Pattern DOUBLED_CONSONANT_ING =
        Pattern.compile("([bcdgklmnprstvxz])\\1ing$|cking$");
    private static final Pattern NUMBER_PATTERN =
        Pattern.compile("^(\\d[\\d,]*)(st|nd|rd|th)?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern TOKEN_PATTERN = Pattern.compile(
        "\\d[\\d,]*(?:\\.\\d+)?(?:st|nd|rd|th)?\\b|[A-Za-z']+|\\s+|[^\\sA-Za-z0-9]");

    private final Map<String, Object> gold;
    private final Map<String, Object> silver;

    KokoroLexicon(Map<String, Object> gold, Map<String, Object> silver) {
        this.gold = gold;
        this.silver = silver;
    }

    private static Set<Character> charSet(String chars) {
        Set<Character> set = new HashSet<>();
        for (int i = 0; i < chars.length(); i++) set.add(chars.charAt(i));
        return set;
    }

    // --- dictionary lookup + stemming ---

    private boolean isKnownWord(String word) {
        if (gold.containsKey(word) || silver.containsKey(word)) return true;
        if (!ALPHA_ONLY.matcher(word).matches()) return false;
        return word.length() == 1;
    }

    @SuppressWarnings("unchecked")
    private static String resolveEntry(Object entry) {
        if (entry instanceof String) return (String) entry;
        if (entry instanceof Map) {
            Map<String, String> tagged = (Map<String, String>) entry;
            String def = tagged.get("DEFAULT");
            if (def != null) return def;
            for (String value : tagged.values()) {
                if (value != null) return value;
            }
        }
        return null;
    }

    private String lookupWord(String word) {
        Object entry = gold.get(word);
        if (entry == null) entry = silver.get(word);
        return entry == null ? null : resolveEntry(entry);
    }

    private static String suffixS(String stem) {
        if (stem.isEmpty()) return null;
        char last = stem.charAt(stem.length() - 1);
        if ("ptkfθ".indexOf(last) >= 0) return stem + "s";
        if ("szʃʒʧʤ".indexOf(last) >= 0) return stem + "ᵻz";
        return stem + "z";
    }

    private String stemS(String word) {
        if (word.length() < 3 || !word.endsWith("s")) return null;
        String stem = null;
        if (!word.endsWith("ss") && isKnownWord(word.substring(0, word.length() - 1))) {
            stem = word.substring(0, word.length() - 1);
        } else if ((word.endsWith("'s")
                || (word.length() > 4 && word.endsWith("es") && !word.endsWith("ies")))
            && isKnownWord(word.substring(0, word.length() - 2))) {
            stem = word.substring(0, word.length() - 2);
        } else if (word.length() > 4 && word.endsWith("ies")
            && isKnownWord(word.substring(0, word.length() - 3) + "y")) {
            stem = word.substring(0, word.length() - 3) + "y";
        }
        if (stem == null) return null;
        String resolved = lookupWord(stem);
        return resolved == null ? null : suffixS(resolved);
    }

    private static String suffixEd(String stem) {
        if (stem.isEmpty()) return null;
        char last = stem.charAt(stem.length() - 1);
        if ("pkfθʃsʧ".indexOf(last) >= 0) return stem + "t";
        if (last == 'd') return stem + "ᵻd";
        if (last != 't') return stem + "d";
        if (stem.length() < 2) return stem + "ɪd";
        if (US_FLAP_CONTEXT.contains(stem.charAt(stem.length() - 2))) {
            return stem.substring(0, stem.length() - 1) + "ɾᵻd";
        }
        return stem + "ᵻd";
    }

    private String stemEd(String word) {
        if (word.length() < 4 || !word.endsWith("d")) return null;
        String stem = null;
        if (!word.endsWith("dd") && isKnownWord(word.substring(0, word.length() - 1))) {
            stem = word.substring(0, word.length() - 1);
        } else if (word.length() > 4 && word.endsWith("ed") && !word.endsWith("eed")
            && isKnownWord(word.substring(0, word.length() - 2))) {
            stem = word.substring(0, word.length() - 2);
        }
        if (stem == null) return null;
        String resolved = lookupWord(stem);
        return resolved == null ? null : suffixEd(resolved);
    }

    private static String suffixIng(String stem) {
        if (stem.isEmpty()) return null;
        char last = stem.charAt(stem.length() - 1);
        if (stem.length() > 1 && last == 't' && US_FLAP_CONTEXT.contains(stem.charAt(stem.length() - 2))) {
            return stem.substring(0, stem.length() - 1) + "ɾɪŋ";
        }
        return stem + "ɪŋ";
    }

    private String stemIng(String word) {
        if (word.length() < 5 || !word.endsWith("ing")) return null;
        String stem = null;
        if (word.length() > 5 && isKnownWord(word.substring(0, word.length() - 3))) {
            stem = word.substring(0, word.length() - 3);
        } else if (isKnownWord(word.substring(0, word.length() - 3) + "e")) {
            stem = word.substring(0, word.length() - 3) + "e";
        } else if (word.length() > 5 && DOUBLED_CONSONANT_ING.matcher(word).find()
            && isKnownWord(word.substring(0, word.length() - 4))) {
            stem = word.substring(0, word.length() - 4);
        }
        if (stem == null) return null;
        String resolved = lookupWord(stem);
        return resolved == null ? null : suffixIng(resolved);
    }

    /** Dictionary lookup plus -s/-ed/-ing stemming. Null means out-of-dictionary. */
    String getWordPhonemes(String word) {
        String lower = word.toLowerCase(java.util.Locale.US);
        String w = word;
        if (word.length() > 1 && WORD_ONLY.matcher(word).matches() && !word.equals(lower)
            && !gold.containsKey(word) && !silver.containsKey(word)
            && (gold.containsKey(lower) || silver.containsKey(lower)
                || stemS(lower) != null || stemEd(lower) != null || stemIng(lower) != null)) {
            w = lower;
        }

        if (isKnownWord(w)) {
            String direct = lookupWord(w);
            if (direct != null) return direct;
        }
        if (w.endsWith("s'") && isKnownWord(w.substring(0, w.length() - 2) + "'s")) {
            return lookupWord(w.substring(0, w.length() - 2) + "'s");
        }
        if (w.endsWith("'") && isKnownWord(w.substring(0, w.length() - 1))) {
            return lookupWord(w.substring(0, w.length() - 1));
        }
        String s = stemS(w);
        if (s != null) return s;
        String ed = stemEd(w);
        if (ed != null) return ed;
        return stemIng(w);
    }

    // --- number reading (chapter numbers, dates, page numbers in book prose) ---

    private static final String[] ONES = {
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
        "eighteen", "nineteen",
    };
    private static final String[] TENS = {
        "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
    };
    private static final Map<String, String> ORDINAL_WORD = ordinalMap();
    private static final long[] SCALE_VALUES = {1_000_000_000L, 1_000_000L, 1_000L};
    private static final String[] SCALE_NAMES = {"billion", "million", "thousand"};

    private static Map<String, String> ordinalMap() {
        Map<String, String> map = new java.util.HashMap<>();
        map.put("zero", "zeroth"); map.put("one", "first"); map.put("two", "second");
        map.put("three", "third"); map.put("four", "fourth"); map.put("five", "fifth");
        map.put("six", "sixth"); map.put("seven", "seventh"); map.put("eight", "eighth");
        map.put("nine", "ninth"); map.put("ten", "tenth"); map.put("eleven", "eleventh");
        map.put("twelve", "twelfth"); map.put("thirteen", "thirteenth");
        map.put("fourteen", "fourteenth"); map.put("fifteen", "fifteenth");
        map.put("sixteen", "sixteenth"); map.put("seventeen", "seventeenth");
        map.put("eighteen", "eighteenth"); map.put("nineteen", "nineteenth");
        map.put("twenty", "twentieth"); map.put("thirty", "thirtieth");
        map.put("forty", "fortieth"); map.put("fifty", "fiftieth");
        map.put("sixty", "sixtieth"); map.put("seventy", "seventieth");
        map.put("eighty", "eightieth"); map.put("ninety", "ninetieth");
        map.put("hundred", "hundredth"); map.put("thousand", "thousandth");
        map.put("million", "millionth"); map.put("billion", "billionth");
        return map;
    }

    private static List<String> cardinalWords(long n) {
        List<String> words = new ArrayList<>();
        if (n < 20) {
            words.add(ONES[(int) n]);
            return words;
        }
        if (n < 100) {
            int tens = (int) (n / 10);
            int rem = (int) (n % 10);
            words.add(TENS[tens]);
            if (rem != 0) words.add(ONES[rem]);
            return words;
        }
        if (n < 1000) {
            int hundreds = (int) (n / 100);
            long rem = n % 100;
            words.add(ONES[hundreds]);
            words.add("hundred");
            if (rem != 0) words.addAll(cardinalWords(rem));
            return words;
        }
        for (int i = 0; i < SCALE_VALUES.length; i++) {
            long value = SCALE_VALUES[i];
            if (n >= value) {
                long count = n / value;
                long rem = n % value;
                words.addAll(cardinalWords(count));
                words.add(SCALE_NAMES[i]);
                if (rem != 0) words.addAll(cardinalWords(rem));
                return words;
            }
        }
        words.add(String.valueOf(n));
        return words;
    }

    private static List<String> ordinalWords(long n) {
        List<String> words = cardinalWords(n);
        int last = words.size() - 1;
        String word = words.get(last);
        String ordinal = ORDINAL_WORD.get(word);
        words.set(last, ordinal != null ? ordinal : word + "th");
        return words;
    }

    private String phonemizeNumber(String raw) {
        Matcher m = NUMBER_PATTERN.matcher(raw);
        if (!m.matches()) return null;
        String digits = m.group(1).replace(",", "");
        long n;
        try {
            n = Long.parseLong(digits);
        } catch (NumberFormatException e) {
            return null;
        }
        if (n < 0 || n > 999_999_999_999L) return null;
        List<String> words = m.group(2) != null ? ordinalWords(n) : cardinalWords(n);
        StringBuilder out = new StringBuilder();
        for (String word : words) {
            String ps = getWordPhonemes(word);
            if (ps == null) continue;
            if (out.length() > 0) out.append(' ');
            out.append(ps);
        }
        return out.length() > 0 ? out.toString() : null;
    }

    // --- top-level phonemizer ---

    /** Text to a phoneme string in Misaki's alphabet, ready for KokoroVocab. */
    String phonemize(String text) {
        Matcher m = TOKEN_PATTERN.matcher(text);
        StringBuilder out = new StringBuilder();
        boolean pendingSpace = false;
        while (m.find()) {
            String raw = m.group();
            if (raw.trim().isEmpty()) {
                pendingSpace = out.length() > 0;
                continue;
            }
            if (WORD_ONLY.matcher(raw).matches()) {
                String ps = getWordPhonemes(raw);
                if (ps != null) {
                    if (pendingSpace) out.append(' ');
                    out.append(ps);
                    pendingSpace = true;
                }
                continue;
            }
            if (Character.isDigit(raw.charAt(0))) {
                String ps = phonemizeNumber(raw);
                if (ps != null) {
                    if (pendingSpace) out.append(' ');
                    out.append(ps);
                    pendingSpace = true;
                }
                continue;
            }
            // Punctuation: attached directly (no space inserted before it — a
            // following whitespace token, if any, still adds the space ahead
            // of the next word). Unmapped characters are silently dropped
            // later, in KokoroVocab.tokenIds().
            out.append(raw);
            pendingSpace = false;
        }
        return out.toString();
    }
}
