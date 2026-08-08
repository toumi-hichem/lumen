package org.wikisubmission.lumen.kokoro;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.HashMap;
import java.util.Map;

import org.junit.Test;

/**
 * Host-side tests for the ported Misaki dictionary lookup + stemming (see
 * src/tts/kokoro/g2p.test.ts for the web-side twin of this fixture — kept in
 * sync so both ports are verified against the same real dictionary entries).
 */
public class KokoroLexiconTest {

    private static Map<String, Object> gold() {
        Map<String, Object> g = new HashMap<>();
        g.put("hello", "həlˈO");
        g.put("world", "wˈɜɹld");
        g.put("cat", "kˈæt");
        g.put("dog", "dˈɔɡ");
        g.put("wait", "wˈAt");
        g.put("walk", "wˈɔk");
        g.put("play", "plˈA");
        g.put("the", "ði");
        g.put("book", "bˈʊk");
        Map<String, String> read = new HashMap<>();
        read.put("DEFAULT", "ɹˈid");
        read.put("ADJ", "ɹˈɛd");
        read.put("VBD", "ɹˈɛd");
        read.put("VBN", "ɹˈɛd");
        read.put("VBP", "ɹˈɛd");
        g.put("read", read);
        g.put("one", "wˈʌn");
        g.put("two", "tˈu");
        g.put("twenty", "twˈɛnti");
        g.put("hundred", "hˈʌndɹəd");
        g.put("first", "fˈɜɹst");
        return g;
    }

    private static KokoroLexicon lexicon() {
        return new KokoroLexicon(gold(), new HashMap<>());
    }

    @Test
    public void resolvesADirectDictionaryHit() {
        assertEquals("həlˈO", lexicon().getWordPhonemes("hello"));
    }

    @Test
    public void isCaseInsensitiveForOrdinaryWords() {
        assertEquals("həlˈO", lexicon().getWordPhonemes("Hello"));
    }

    @Test
    public void resolvesAHeteronymToItsDefaultPronunciation() {
        assertEquals("ɹˈid", lexicon().getWordPhonemes("read"));
    }

    @Test
    public void stemsARegularPlural() {
        assertEquals("bˈʊks", lexicon().getWordPhonemes("books"));
    }

    @Test
    public void stemsPastTenseWithTAfterAVoicelessStop() {
        assertEquals("wˈɔkt", lexicon().getWordPhonemes("walked"));
    }

    @Test
    public void stemsPastTenseWithTheFlapRuleAfterAUsTausPhoneme() {
        // "wait" ends in /At/, so -ed flaps: wˈAt -> wˈAɾᵻd
        assertEquals("wˈAɾᵻd", lexicon().getWordPhonemes("waited"));
    }

    @Test
    public void stemsAGerundDroppingTheSilentE() {
        assertEquals("plˈAɪŋ", lexicon().getWordPhonemes("playing"));
    }

    @Test
    public void returnsNullForAnOutOfDictionaryWordInsteadOfGuessing() {
        assertNull(lexicon().getWordPhonemes("zzyzx"));
    }

    @Test
    public void joinsKnownWordsWithSpaces() {
        assertEquals("həlˈO wˈɜɹld", lexicon().phonemize("hello world"));
    }

    @Test
    public void keepsPunctuationAttachedWithoutAnExtraPrecedingSpace() {
        assertEquals("həlˈO, wˈɜɹld.", lexicon().phonemize("hello, world."));
    }

    @Test
    public void dropsAnOutOfDictionaryWordSilentlyRatherThanMispronouncingIt() {
        assertEquals("ði kˈæt", lexicon().phonemize("the zzyzx cat"));
    }

    @Test
    public void readsACardinalNumberBySpellingItOut() {
        assertEquals("wˈʌn hˈʌndɹəd", lexicon().phonemize("one hundred"));
    }

    @Test
    public void readsAnOrdinalNumberUsingTheOrdinalFormOfItsLastWord() {
        assertEquals("twˈɛnti fˈɜɹst", lexicon().phonemize("21st"));
    }
}
