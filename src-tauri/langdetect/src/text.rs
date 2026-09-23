//! Text preprocessing and hashing for the `NGramHash` custom op.
//!
//! This is a direct port of MediaPipe's
//! `custom_ops/utils/ngram_hash_ops_utils.{h,cc}` and
//! `custom_ops/utils/hash/murmur.{h,cc}` so that the hash indices fed to the
//! model match the reference implementation byte for byte.

use crate::unicode::{is_alpha_rune, to_lower_rune};

const RUNE_ERROR: i32 = 0xFFFD;
const RUNE_MAX: i32 = 0x10FFFF;

/// Result of [`tokenize`]: the rewritten string plus, for every token, its
/// `(byte offset, byte length)` inside that string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tokenized {
    pub text: Vec<u8>,
    pub tokens: Vec<(usize, usize)>,
}

/// Port of `utf_charntorune`: decode one UTF-8 rune from `bytes`.
///
/// Returns `(rune, consumed)`. A `consumed` of 0 means the sequence is
/// incomplete (the original reports `Runeerror`), while a malformed but
/// complete sequence consumes one byte. This deliberately reproduces the
/// original's lenient handling of overlong forms and surrogates.
fn decode_rune(bytes: &[u8]) -> (i32, usize) {
    if bytes.is_empty() {
        return (RUNE_ERROR, 0);
    }
    let c = bytes[0] as i32;
    if c < 0x80 {
        return (c, 1);
    }
    if bytes.len() <= 1 {
        return (RUNE_ERROR, 0);
    }
    let c1 = (bytes[1] as i32) ^ 0x80;
    if c1 & 0xC0 != 0 {
        return (RUNE_ERROR, 1);
    }
    if c < 0xE0 {
        if c < 0xC0 {
            return (RUNE_ERROR, 1);
        }
        let l = ((c << 6) | c1) & 0x7FF;
        if l <= 0x7F {
            return (RUNE_ERROR, 1);
        }
        return (l, 2);
    }
    if bytes.len() <= 2 {
        return (RUNE_ERROR, 0);
    }
    let c2 = (bytes[2] as i32) ^ 0x80;
    if c2 & 0xC0 != 0 {
        return (RUNE_ERROR, 1);
    }
    if c < 0xF0 {
        let l = ((((c << 6) | c1) << 6) | c2) & 0xFFFF;
        if l <= 0x7FF {
            return (RUNE_ERROR, 1);
        }
        return (l, 3);
    }
    if bytes.len() <= 3 {
        return (RUNE_ERROR, 0);
    }
    let c3 = (bytes[3] as i32) ^ 0x80;
    if c3 & 0xC0 != 0 {
        return (RUNE_ERROR, 1);
    }
    if c < 0xF8 {
        let l = ((((((c << 6) | c1) << 6) | c2) << 6) | c3) & 0x1F_FFFF;
        if l <= 0xFFFF || l > RUNE_MAX {
            return (RUNE_ERROR, 1);
        }
        return (l, 4);
    }
    (RUNE_ERROR, 1)
}

/// Port of `utf_runetochar`: encode `rune` as UTF-8 into `out`.
fn encode_rune(out: &mut Vec<u8>, rune: i32) {
    let mut c = rune as u32;
    if c <= 0x7F {
        out.push(c as u8);
    } else if c <= 0x7FF {
        out.push(0xC0 | (c >> 6) as u8);
        out.push(0x80 | (c & 0x3F) as u8);
    } else {
        if c > RUNE_MAX as u32 {
            c = RUNE_ERROR as u32;
        }
        if c <= 0xFFFF {
            out.push(0xE0 | (c >> 12) as u8);
            out.push(0x80 | ((c >> 6) & 0x3F) as u8);
            out.push(0x80 | (c & 0x3F) as u8);
        } else {
            out.push(0xF0 | (c >> 18) as u8);
            out.push(0x80 | ((c >> 12) & 0x3F) as u8);
            out.push(0x80 | ((c >> 6) & 0x3F) as u8);
            out.push(0x80 | (c & 0x3F) as u8);
        }
    }
}

/// Port of `LowercaseUnicodeStr`: lower-case letters, leave everything else
/// alone, and re-encode the result.
pub fn lowercase_unicode(input: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len());
    let mut i = 0;
    while i < input.len() {
        let (rune, consumed) = decode_rune(&input[i..]);
        if consumed == 0 {
            break;
        }
        let rune = if is_alpha_rune(rune) {
            to_lower_rune(rune)
        } else {
            rune
        };
        encode_rune(&mut out, rune);
        i += consumed;
    }
    out
}

/// Port of `Tokenize`.
///
/// Every rune becomes exactly one token. When `exclude_nonalphaspace_tokens` is
/// set, runes that are not letters are replaced by a single space token, which
/// is why digits and punctuation collapse into whitespace in the CLD3 feature
/// set. A `^` prefix and `$` suffix token bracket the input, and tokenisation
/// stops early so that at most `max_tokens` tokens (including the suffix) are
/// produced.
pub fn tokenize(input: &[u8], max_tokens: usize, exclude_nonalphaspace_tokens: bool) -> Tokenized {
    const PREFIX: &[u8] = b"^";
    const SUFFIX: &[u8] = b"$";
    const REPLACEMENT: &[u8] = b" ";

    let mut text = Vec::with_capacity(input.len() + 2);
    let mut tokens = Vec::with_capacity(input.len() + 2);

    text.extend_from_slice(PREFIX);
    tokens.push((0usize, PREFIX.len()));
    let mut token_start = PREFIX.len();

    let mut i = 0usize;
    while i < input.len() && tokens.len() + 1 < max_tokens {
        let (rune, consumed) = decode_rune(&input[i..]);
        if consumed == 0 {
            break;
        }
        if exclude_nonalphaspace_tokens && !is_alpha_rune(rune) {
            text.extend_from_slice(REPLACEMENT);
            tokens.push((token_start, REPLACEMENT.len()));
            token_start += REPLACEMENT.len();
            i += consumed;
            continue;
        }
        text.extend_from_slice(&input[i..i + consumed]);
        tokens.push((token_start, consumed));
        token_start += consumed;
        i += consumed;
    }

    text.extend_from_slice(SUFFIX);
    tokens.push((token_start, SUFFIX.len()));

    Tokenized { text, tokens }
}

/// Lower-case then tokenise, matching how `NGramHash` preprocesses its input.
///
/// Note that the reference implementation hands `Tokenize` the *original* byte
/// length even though lower-casing can shorten the string (e.g. `U+0130` maps to
/// a single byte `i`). Bytes past the end of the lower-cased buffer are read as
/// NUL there, so they are modelled here as explicit padding to keep the result
/// deterministic.
pub fn lowercase_and_tokenize(input: &[u8], max_tokens: usize) -> Tokenized {
    let mut lowered = lowercase_unicode(input);
    if lowered.len() < input.len() {
        lowered.resize(input.len(), 0);
    }
    tokenize(&lowered, max_tokens, true)
}

const MURMUR_MUL: u64 = 0xc6a4_a793_5bd1_e995;

#[inline]
fn shift_mix(val: u64) -> u64 {
    val ^ (val >> 47)
}

#[inline]
fn murmur_step(hash: u64, data: u64) -> u64 {
    let mixed = shift_mix(data.wrapping_mul(MURMUR_MUL)).wrapping_mul(MURMUR_MUL);
    (hash ^ mixed).wrapping_mul(MURMUR_MUL)
}

/// Port of `MurmurHash64WithSeed`, the seeded MurmurHash 2.0 variant used by
/// MediaPipe's language detector to turn n-gram byte strings into vocab indices.
pub fn murmur_hash64_with_seed(buf: &[u8], seed: u64) -> u64 {
    let len = buf.len();
    let len_aligned = len & !0x7;
    let mut hash = seed ^ (len as u64).wrapping_mul(MURMUR_MUL);

    let mut i = 0;
    while i < len_aligned {
        let mut chunk = [0u8; 8];
        chunk.copy_from_slice(&buf[i..i + 8]);
        hash = murmur_step(hash, u64::from_le_bytes(chunk));
        i += 8;
    }

    let remainder = len & 0x7;
    if remainder != 0 {
        let mut data = 0u64;
        for (shift, byte) in buf[len_aligned..].iter().enumerate() {
            data |= (*byte as u64) << (8 * shift);
        }
        hash ^= data;
        hash = hash.wrapping_mul(MURMUR_MUL);
    }

    shift_mix(shift_mix(hash).wrapping_mul(MURMUR_MUL))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tok(s: &str) -> (String, Vec<(usize, usize)>) {
        let t = tokenize(s.as_bytes(), 128, true);
        (String::from_utf8(t.text).unwrap(), t.tokens)
    }

    #[test]
    fn brackets_input_and_spaces_out_non_letters() {
        let (text, tokens) = tok("hi there!");
        // ^ h i ' ' t h e r e ' ' $
        assert_eq!(text, "^hi there $");
        assert_eq!(tokens.len(), 11);
        assert_eq!(tokens[0], (0, 1));
        assert_eq!(tokens[1], (1, 1)); // h
        assert_eq!(tokens[2], (2, 1)); // i
        assert_eq!(tokens[3], (3, 1)); // space
        assert_eq!(tokens[9], (9, 1)); // the replacement space for '!'
        assert_eq!(tokens[10], (10, 1)); // $
    }

    #[test]
    fn digits_become_space_tokens() {
        let (text, tokens) = tok("a1b");
        assert_eq!(text, "^a b$");
        assert_eq!(tokens.len(), 5);
    }

    #[test]
    fn keeps_multibyte_letters() {
        let (text, tokens) = tok("中文");
        assert_eq!(text, "^中文$");
        assert_eq!(tokens.len(), 4);
        assert_eq!(tokens[1], (1, 3));
        assert_eq!(tokens[2], (4, 3));
    }

    #[test]
    fn respects_max_tokens() {
        let t = tokenize(b"abcdefghij", 5, true);
        // ^ a b c $ -- the suffix always fits.
        assert_eq!(t.tokens.len(), 5);
        assert_eq!(&t.text, b"^abc$");
    }

    #[test]
    fn lowercase_maps_letters_only() {
        assert_eq!(lowercase_unicode("HeLLo 1! Ж".as_bytes()), "hello 1! ж".as_bytes());
    }

    #[test]
    fn murmur_matches_reference_vectors() {
        // Cross-checked against an independent transcription of MediaPipe's
        // murmur.cc, covering the short, aligned and trailing-bytes paths.
        assert_eq!(murmur_hash64_with_seed(b"hello", 0), 2191231550387646743);
        assert_eq!(murmur_hash64_with_seed(b"hello", 1), 5983625672228268878);
        assert_eq!(murmur_hash64_with_seed(b"^hi there $", 0), 12961423570943672250);
        assert_eq!(murmur_hash64_with_seed(b"^hi there $", 1), 9788546157301770872);
        assert_eq!(murmur_hash64_with_seed("中文".as_bytes(), 0), 2290682341259438202);
        assert_eq!(murmur_hash64_with_seed(b"", 0), 0);
        assert_eq!(murmur_hash64_with_seed(b"", 7), 7962528000681819666);
    }
}
