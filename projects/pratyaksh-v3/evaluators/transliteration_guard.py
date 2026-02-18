"""D7: Transliteration Guard evaluator — Unicode range check.

For translation tasks: if input is Gujarati/Hindi, check output is actual English
not romanized source. If >40% of output chars are from Devanagari/Gujarati
Unicode ranges → score 0.0 (wrong task — model echoed source instead of translating).

Uses unicodedata — no external deps.
"""

import unicodedata


# Unicode block ranges for Indic scripts
DEVANAGARI_RANGE = (0x0900, 0x097F)
DEVANAGARI_EXTENDED_RANGE = (0x0980, 0x09FF)  # Actually Bengali, but keep for safety
GUJARATI_RANGE = (0x0A80, 0x0AFF)
VEDIC_EXTENSIONS = (0x1CD0, 0x1CFF)


def indic_char_fraction(text: str) -> float:
    """Compute what fraction of non-whitespace chars are from Indic Unicode ranges."""
    if not text:
        return 0.0
    
    non_ws = [c for c in text if not c.isspace()]
    if not non_ws:
        return 0.0
    
    indic_count = 0
    for c in non_ws:
        cp = ord(c)
        if (DEVANAGARI_RANGE[0] <= cp <= DEVANAGARI_RANGE[1] or
            GUJARATI_RANGE[0] <= cp <= GUJARATI_RANGE[1] or
            VEDIC_EXTENSIONS[0] <= cp <= VEDIC_EXTENSIONS[1]):
            indic_count += 1
    
    return indic_count / len(non_ws)


def evaluate(output: str, threshold: float = 0.40) -> float:
    """Evaluate transliteration guard.
    
    Args:
        output: The model's translation output (should be English).
        threshold: If Indic char fraction exceeds this, score 0.0.
    
    Returns:
        1.0 if output is actual English (low Indic char ratio)
        0.0 if output has too many Indic characters (model didn't translate)
    """
    fraction = indic_char_fraction(output)
    
    if fraction > threshold:
        return 0.0  # Failed: model echoed source language
    
    return 1.0  # Passed: output is likely English


def evaluate_with_detail(output: str, threshold: float = 0.40) -> dict:
    """Return detailed evaluation including the Indic fraction."""
    fraction = indic_char_fraction(output)
    passed = fraction <= threshold
    
    return {
        "score": 1.0 if passed else 0.0,
        "indic_fraction": fraction,
        "threshold": threshold,
        "passed": passed,
    }
