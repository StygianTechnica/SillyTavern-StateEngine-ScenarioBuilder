// Comparing and tidying names.

// A name folded for comparison: lower case, no accents, letters only.
export function fold(name) {
    return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// The words of a name that tell it apart - not "the", "of", particles.
const LINK_WORDS = new Set(['the', 'of', 'and', 'de', 'la', 'le', 'du', 'des', 'da', 'dos', 'das', 'van', 'der', 'den', 'von', 'zu', 'ter', 'ten', 'mac', 'mc', 'nic', 'o', 'ni', 'ap', 'ferch', 'ibn', 'bint', 'ben', 'bat', 'al', 'el', 'sa', 'sat', 'mar', 'marat', 'son', 'daughter', 'house', 'clan']);
export function nameTokens(name) {
    return String(name ?? '').split(/[\s\-']+/).map(fold).filter((t) => t.length > 1 && !LINK_WORDS.has(t));
}

export function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[b.length];
}

// Too close to tell apart at a glance: Kael / Kaelen, Vodmund / Vodmunt.
export function tooClose(a, b) {
    const x = fold(a);
    const y = fold(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const shorter = Math.min(x.length, y.length);
    if (shorter >= 4 && levenshtein(x, y) <= (shorter >= 8 ? 2 : 1)) return true;
    // Kael / Kaelen / Kaelis: the same start, and one is the other plus a little.
    return shorter >= 3 && (x.startsWith(y) || y.startsWith(x)) && Math.abs(x.length - y.length) <= 3;
}

export const capitalize = (w) => (w ? w[0].toLocaleUpperCase() + w.slice(1) : w);

// Each word capitalized, keeping particles and apostrophes as written.
export function titleCase(name) {
    return String(name).split(' ').map((w) => (/^(of|the|and|de|la|du|da|van|von|der|den|ter|al|el|ibn|bint|ben|bat|ap|ferch|mac|nic|sa|sat|mar)$/i.test(w) ? w : w.split('-').map(capitalize).join('-'))).join(' ').replace(/^./, (c) => c.toLocaleUpperCase());
}

export const VOWELS = 'aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿāēīōūǫœəıąęįųőű';
export const isVowel = (ch) => VOWELS.includes(String(ch).toLowerCase());
