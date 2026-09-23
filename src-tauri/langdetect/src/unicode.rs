//! Rune classification helpers ported from MediaPipe's `custom_ops/utils/utf`
//! (a fork of Rob Pike and Ken Thompson's Plan 9 `runetype` code).
//!
//! `NGramHash` lower-cases and tokenises text with these exact tables, so
//! deviating from them would change the hashes that reach the model.

use crate::unicode_tables::{
    IS_ALPHAR_RANGES, IS_ALPHAS_SINGLES, TO_LOWER_PAIRS, TO_LOWER_RANGES, TO_LOWER_SINGLES,
};

/// Offset bias stored in the lower-case tables (`1 << 20`).
const LOWER_OFFSET: i32 = 1_048_576;

/// Binary search over a table of fixed-size records, mirroring the original
/// `rbsearch`: it returns the last record whose first element is `<= c`.
///
/// Returns the record's index into `table` (always a multiple of `width`).
fn rbsearch(c: i32, table: &[i32], count: usize, width: usize) -> Option<usize> {
    let mut n = count;
    let mut base = 0usize;
    while n > 1 {
        let half = n >> 1;
        let probe = base + half * width;
        if c >= table[probe] {
            base = probe;
            n -= half;
        } else {
            n = half;
        }
    }
    if n != 0 && c >= table[base] {
        Some(base)
    } else {
        None
    }
}

/// `utf_isalpharune`: is `c` a Unicode letter (including ideographs)?
///
/// Note that digits, punctuation and whitespace are *not* alphabetic, which is
/// why `NGramHash` maps them to a replacement token.
pub fn is_alpha_rune(c: i32) -> bool {
    if let Some(p) = rbsearch(c, IS_ALPHAR_RANGES, IS_ALPHAR_RANGES.len() / 2, 2) {
        if c >= IS_ALPHAR_RANGES[p] && c <= IS_ALPHAR_RANGES[p + 1] {
            return true;
        }
    }
    if let Some(p) = rbsearch(c, IS_ALPHAS_SINGLES, IS_ALPHAS_SINGLES.len(), 1) {
        if c == IS_ALPHAS_SINGLES[p] {
            return true;
        }
    }
    false
}

/// `utf_tolowerrune`: the single-rune Unicode lower-case mapping.
///
/// Runes without a mapping are returned unchanged.
pub fn to_lower_rune(c: i32) -> i32 {
    if let Some(p) = rbsearch(c, TO_LOWER_RANGES, TO_LOWER_RANGES.len() / 3, 3) {
        if c >= TO_LOWER_RANGES[p] && c <= TO_LOWER_RANGES[p + 1] {
            return c + TO_LOWER_RANGES[p + 2] - LOWER_OFFSET;
        }
    }
    if let Some(p) = rbsearch(c, TO_LOWER_PAIRS, TO_LOWER_PAIRS.len() / 3, 3) {
        if c >= TO_LOWER_PAIRS[p] && c <= TO_LOWER_PAIRS[p + 1] && ((c - TO_LOWER_PAIRS[p]) & 1) == 0
        {
            return c + TO_LOWER_PAIRS[p + 2] - LOWER_OFFSET;
        }
    }
    if let Some(p) = rbsearch(c, TO_LOWER_SINGLES, TO_LOWER_SINGLES.len() / 2, 2) {
        if c == TO_LOWER_SINGLES[p] {
            return c + TO_LOWER_SINGLES[p + 1] - LOWER_OFFSET;
        }
    }
    c
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_letters_are_alphabetic() {
        assert!(is_alpha_rune('a' as i32));
        assert!(is_alpha_rune('Z' as i32));
    }

    #[test]
    fn digits_and_space_are_not_alphabetic() {
        for c in ['0', '9', ' ', ',', '-', '.'] {
            assert!(!is_alpha_rune(c as i32), "{c:?} must not be alphabetic");
        }
    }

    #[test]
    fn cjk_and_cyrillic_are_alphabetic() {
        for c in ['中', 'あ', 'ア', '한', 'Я', 'ب', 'א'] {
            assert!(is_alpha_rune(c as i32), "{c:?} must be alphabetic");
        }
    }

    #[test]
    fn lowers_ascii_and_unicode() {
        assert_eq!(to_lower_rune('A' as i32), 'a' as i32);
        assert_eq!(to_lower_rune('Z' as i32), 'z' as i32);
        assert_eq!(to_lower_rune('Ж' as i32), 'ж' as i32);
        assert_eq!(to_lower_rune('İ' as i32), 'i' as i32);
        // Unmapped runes pass through.
        assert_eq!(to_lower_rune('中' as i32), '中' as i32);
        assert_eq!(to_lower_rune('a' as i32), 'a' as i32);
    }
}
