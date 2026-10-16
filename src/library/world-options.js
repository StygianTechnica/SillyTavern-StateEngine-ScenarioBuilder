// The choices offered on a setting's front page (spec SB-139a/b world
// definition): world type, capability level, tone, themes and era.
// Suggested defaults, not a closed schema (OPEN-15): every list also takes
// the user's own values. Stored on the overview as plain text (multi-select
// values joined with ", ") so the guidance and prompts read them as-is.

export const WORLD_TYPES = Object.freeze([
    ['fantasy', 'Fantasy'], ['science_fiction', 'Science fiction'], ['modern', 'Modern'], ['historical', 'Historical'],
    ['post_apocalyptic', 'Post-apocalyptic'], ['urban_fantasy', 'Urban fantasy'], ['cosmic_horror', 'Cosmic horror'], ['multiverse', 'Multiverse'],
]);

export const CAPABILITY_LEVELS = Object.freeze([
    ['none', 'None - mundane'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['cosmic', 'Cosmic'],
]);

// Multi-select (OPEN-15: decided yes for tone).
export const TONES = Object.freeze([
    'serious', 'whimsical', 'gritty', 'romantic', 'dark', 'heroic', 'comedic',
    'melancholy', 'hopeful', 'mysterious', 'bleak', 'epic', 'cozy', 'tense', 'satirical', 'dreamlike', 'brutal', 'noir',
]);

export const THEMES = Object.freeze([
    'power and corruption', 'redemption', 'survival', 'identity', 'love and loss', 'revenge', 'faith and doubt', 'freedom',
    'family', 'betrayal', 'ambition', 'coming of age', 'war and its cost', 'the unknown', 'debt and obligation',
    'tradition vs change', 'class and inequality', 'nature vs civilisation', 'memory', 'forbidden knowledge', 'found family', 'sacrifice',
]);

// Eras, grouped by the world type they suit best (all are offered; the
// chosen world type's group comes first).
export const ERAS = Object.freeze({
    fantasy: ['age of myth', 'ancient empires', 'early medieval', 'high medieval', 'late medieval', 'renaissance', 'age of sail', 'gunpowder and sorcery', 'industrial magic', 'twilight of an age'],
    science_fiction: ['near future', 'first colonies', 'interstellar age', 'galactic empire', 'post-singularity', 'generation ship', 'far future decline'],
    modern: ['present day', '1920s', '1950s', '1970s', '1980s', '1990s', 'early 2000s'],
    historical: ['bronze age', 'classical antiquity', 'viking age', 'feudal japan', 'crusades', 'age of exploration', 'victorian', 'wild west', 'world war era'],
    post_apocalyptic: ['days after the fall', 'a generation after', 'centuries after', 'rebuilding'],
    urban_fantasy: ['present day', 'a hidden age', 'gaslight', 'near future'],
    cosmic_horror: ['1920s', 'victorian', 'present day', 'timeless'],
    multiverse: ['all eras at once', 'shifting'],
});

export const splitList = (text) => String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean);
export const joinList = (list) => [...new Set(list.map((s) => String(s).trim()).filter(Boolean))].join(', ');

// The era groups in the order to show them: the world type's first.
export function eraGroups(worldType) {
    const keys = Object.keys(ERAS);
    const first = keys.includes(worldType) ? [worldType] : [];
    return [...first, ...keys.filter((k) => k !== worldType)].map((k) => ({
        key: k,
        label: WORLD_TYPES.find(([id]) => id === k)?.[1] ?? k,
        eras: ERAS[k],
    }));
}

// A random pick for the dice buttons, constrained by what is already set:
// eras come from the world type's group; a 'none' capability level is not
// rolled for a fantasy world unless chosen. `random` is injectable for tests.
export function randomFor(field, overview = {}, random = Math.random) {
    const pick = (list) => list[Math.floor(random() * list.length)];
    const pickSome = (list, n) => {
        const pool = [...list];
        const out = [];
        while (out.length < n && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
        return out;
    };
    switch (field) {
        case 'worldType': return pick(WORLD_TYPES)[0];
        case 'magicLevel': {
            const levels = CAPABILITY_LEVELS.map(([id]) => id);
            const allowed = ['fantasy', 'urban_fantasy', 'cosmic_horror', 'multiverse'].includes(overview.worldType) ? levels.filter((l) => l !== 'none')
                : overview.worldType === 'historical' || overview.worldType === 'modern' ? ['none', 'low'] : levels;
            return pick(allowed);
        }
        case 'tone': return joinList(pickSome(TONES, 2));
        case 'themes': return joinList(pickSome(THEMES, 2));
        case 'era': return pick(ERAS[overview.worldType] ?? Object.values(ERAS).flat());
        default: return '';
    }
}
