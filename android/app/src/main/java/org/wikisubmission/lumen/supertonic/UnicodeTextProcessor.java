package org.wikisubmission.lumen.supertonic;

import org.json.JSONArray;

import java.text.Normalizer;
import java.util.regex.Pattern;

/**
 * Port of the web runtime's UnicodeProcessor (src/tts/supertonic/runtime.ts),
 * itself ported from Supertonic's official helper.js. Keeps the exact same
 * normalization semantics as the web path (including iterating UTF-16 units
 * when indexing code points) so both engines produce identical model inputs.
 */
final class UnicodeTextProcessor {

    private static final Pattern EMOJI = Pattern.compile(
        "[\\x{1F600}-\\x{1F64F}\\x{1F300}-\\x{1F5FF}\\x{1F680}-\\x{1F6FF}"
            + "\\x{1F700}-\\x{1F77F}\\x{1F780}-\\x{1F7FF}\\x{1F800}-\\x{1F8FF}"
            + "\\x{1F900}-\\x{1F9FF}\\x{1FA00}-\\x{1FA6F}\\x{1FA70}-\\x{1FAFF}"
            + "\\x{2600}-\\x{26FF}\\x{2700}-\\x{27BF}\\x{1F1E6}-\\x{1F1FF}]+");

    private static final String[][] REPLACEMENTS = {
        {"–", "-"}, {"‑", "-"}, {"—", "-"}, {"_", " "},
        {"“", "\""}, {"”", "\""}, {"‘", "'"}, {"’", "'"},
        {"´", "'"}, {"`", "'"}, {"[", " "}, {"]", " "}, {"|", " "}, {"/", " "},
        {"#", " "}, {"→", " "}, {"←", " "},
    };

    private static final String[][] EXPR_REPLACEMENTS = {
        {"@", " at "}, {"e.g.,", "for example, "}, {"i.e.,", "that is, "},
    };

    private static final Pattern STRIP = Pattern.compile("[♥☆♡©\\\\]");
    private static final Pattern SENTENCE_END =
        Pattern.compile("[.!?;:,'\"')\\]}…。」』】〉》›»]$");

    private final int[] indexer;

    UnicodeTextProcessor(String indexerJson) throws Exception {
        JSONArray arr = new JSONArray(indexerJson);
        this.indexer = new int[arr.length()];
        for (int i = 0; i < arr.length(); i++) indexer[i] = arr.getInt(i);
    }

    /** Result of processing a single utterance: model ids plus its mask length. */
    static final class Processed {
        final long[] textIds;
        final int length;

        Processed(long[] textIds, int length) {
            this.textIds = textIds;
            this.length = length;
        }
    }

    Processed process(String text, String lang) {
        String prepared = preprocess(text, lang);
        // Match JS semantics: iterate UTF-16 units, codePointAt per unit.
        int len = prepared.length();
        long[] ids = new long[len];
        for (int j = 0; j < len; j++) {
            int codePoint = prepared.codePointAt(j);
            ids[j] = codePoint < indexer.length ? indexer[codePoint] : -1;
        }
        return new Processed(ids, len);
    }

    private String preprocess(String input, String lang) {
        String text = Normalizer.normalize(input, Normalizer.Form.NFKD);
        text = EMOJI.matcher(text).replaceAll("");
        for (String[] pair : REPLACEMENTS) text = text.replace(pair[0], pair[1]);
        text = STRIP.matcher(text).replaceAll("");
        for (String[] pair : EXPR_REPLACEMENTS) text = text.replace(pair[0], pair[1]);

        text = text
            .replace(" ,", ",").replace(" .", ".").replace(" !", "!")
            .replace(" ?", "?").replace(" ;", ";").replace(" :", ":")
            .replace(" '", "'");

        while (text.contains("\"\"")) text = text.replace("\"\"", "\"");
        while (text.contains("''")) text = text.replace("''", "'");
        while (text.contains("``")) text = text.replace("``", "`");

        text = text.replaceAll("\\s+", " ").trim();

        if (!SENTENCE_END.matcher(text).find()) text = text + ".";

        return "<" + lang + ">" + text + "</" + lang + ">";
    }
}
