// Image prompts for catalog entries - text the user copies into an image
// generator of their choice (Midjourney first), or hands to SillyTavern's
// Image Generation extension. Scenario Builder never generates images
// itself. Pure and deterministic: built from the entry, the setting
// overview and the chosen style, with no model call (an AI-refined prompt
// is on the roadmap, docs/ROADMAP.md).
//
// Proper names are left out by default: generators don't know who "Mira"
// is, and a name in the prompt invites lettering in the picture.

export const PROVIDERS = Object.freeze([
    { id: 'midjourney', label: 'Midjourney' },
    { id: 'stable_diffusion', label: 'Stable Diffusion / Flux' },
    { id: 'natural', label: 'DALL·E / natural language' },
]);

// Style presets: a label and the words they add. `custom` uses the user's
// own style text only.
export const STYLES = Object.freeze([
    { id: 'painterly', label: 'Painterly fantasy', text: 'painterly fantasy illustration, rich brushwork, atmospheric light' },
    { id: 'cinematic', label: 'Cinematic still', text: 'cinematic film still, dramatic lighting, shallow depth of field, anamorphic' },
    { id: 'concept', label: 'Concept art', text: 'concept art, matte painting, detailed environment design' },
    { id: 'dark_oil', label: 'Dark oil painting', text: 'dark fantasy oil painting, chiaroscuro, muted palette, heavy texture' },
    { id: 'ink', label: 'Ink & watercolour', text: 'ink and watercolour sketch, loose linework, soft washes, parchment' },
    // A style may also carry: first (its words lead the prompt, where the
    // models weigh them most), sd (Stable Diffusion's tags, for anime
    // checkpoints), sdNegative and mjNo (what pulls it away from the look),
    // natural (the lead of a sentence prompt), niji (Midjourney's anime model),
    // portrait (more words for a character).
    {
        id: 'anime', label: 'Anime key visual',
        text: 'anime key visual, Japanese animation style, cel shading, crisp clean lineart, flat vibrant colours, detailed painted anime background',
        portrait: 'expressive anime eyes',
        first: true,
        sd: 'anime, anime key visual, anime screencap, cel shading, flat color, clean lineart, vibrant colors, detailed background, masterpiece, best quality',
        sdNegative: 'photorealistic, realistic, photo, 3d render, cgi, western cartoon, oil painting, sketch',
        mjNo: 'photorealistic, 3d render',
        natural: 'An anime key visual in Japanese animation style - crisp clean lineart, cel-shaded flat vibrant colours, a detailed painted background -',
        niji: true,
        // How far from a cartoon: each look replaces the words above that it
        // names (options.animeLook; 'classic' is the style as written).
        looks: {
            cartoony: {
                text: 'cartoony anime style, simple rounded shapes, bold clean outlines, flat bright colours, minimal shading, cute stylised proportions, simple anime background',
                portrait: 'big sparkling anime eyes, small nose and mouth',
                sd: 'anime, cartoon, cute, simple shading, flat color, bold outlines, bright colors, simple background, chibi proportions, best quality',
                natural: 'A cartoony anime illustration - simple rounded shapes, bold clean outlines, flat bright colours, cute stylised proportions -',
            },
            detailed: {
                text: 'highly detailed anime illustration, intricate linework, rich cel shading with soft gradients, dramatic lighting, finely rendered hair and clothing folds, detailed painted anime background',
                portrait: 'detailed expressive anime eyes with reflections',
                sd: 'anime, highly detailed, intricate details, detailed eyes, detailed hair, detailed clothes, cel shading, dramatic lighting, detailed background, masterpiece, best quality, absurdres',
                natural: 'A highly detailed anime illustration - intricate linework, rich cel shading, dramatic lighting, finely rendered hair and clothing -',
            },
            semireal: {
                text: 'semi-realistic anime style, realistic proportions and anatomy, detailed painterly rendering, subtle cel shading, soft volumetric lighting, intricate detail, cinematic composition',
                portrait: 'detailed anime eyes, realistic facial structure',
                sd: 'semi-realistic, anime, realistic proportions, detailed painterly shading, soft lighting, intricate details, detailed eyes, detailed face, cinematic, masterpiece, best quality, absurdres',
                // Realism is wanted here: only a photograph and 3D are kept out.
                sdNegative: 'photo, photograph, 3d render, cgi, western cartoon, chibi, sketch',
                mjNo: 'photograph, 3d render',
                natural: 'A semi-realistic anime illustration - realistic proportions, detailed painterly rendering, subtle cel shading, soft volumetric light -',
            },
        },
    },
    { id: 'photo', label: 'Photographic', text: 'photorealistic photograph, 35mm, natural light, high detail' },
    { id: 'engraving', label: 'Woodcut / engraving', text: 'antique woodcut engraving, crosshatching, monochrome, old book plate' },
    { id: 'pixel', label: 'Pixel art', text: 'detailed pixel art, limited palette, 16-bit' },
    { id: 'custom', label: 'Custom only', text: '' },
]);

// Midjourney aspect ratio per object type (portraits tall, places wide).
export const DEFAULT_ASPECT = Object.freeze({
    character: '2:3', location: '16:9', faction: '1:1', item: '1:1', creature: '3:2',
    lore: '3:2', quest: '16:9', scene: '16:9', event: '16:9',
});

// The anime style's looks, cartoon to near-real, for the image panel.
export const ANIME_LOOKS = Object.freeze([
    ['cartoony', 'Cartoony - simple shapes, bold outlines'],
    ['classic', 'Classic key visual'],
    ['detailed', 'Detailed - intricate linework and shading'],
    ['semireal', 'Semi-realistic - realistic proportions'],
]);

// A style with its look applied (only the anime style has looks).
export function styleFor(options = {}) {
    const preset = STYLES.find((s) => s.id === options.style);
    const look = preset?.looks?.[options.animeLook];
    return look ? { ...preset, ...look } : preset;
}

export const MJ_VERSIONS = Object.freeze(['7', '6.1', 'niji 6']);
// The niji model an anime style uses when another version is chosen.
const NIJI = 'niji 6';

export const DEFAULT_IMAGE_OPTIONS = Object.freeze({
    provider: 'midjourney',
    style: 'painterly',
    customStyle: '',
    // The anime style's look (ANIME_LOOKS).
    animeLook: 'classic',
    includeNames: false,
    // Leave out of the picture what the world's limits rule out.
    respectLimits: true,
    midjourney: Object.freeze({
        version: '7',
        stylize: 250,
        chaos: 0,
        raw: false,
        no: 'text, watermark, signature, frame',
        sref: '',
        extra: '',
    }),
    negative: 'text, watermark, signature, blurry, lowres, deformed, extra limbs',
});

import { normalizeMagic, normalizeTech, describeLook, isLaterAge } from '../library/world-options.js';
export { isLaterAge, WORLD_LOOKS } from '../library/world-options.js';

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// What the world's limits rule out of a picture: kinds of magic that do not
// exist (or all magic), technologies it does not have, and anything from a
// later age than its tech level - for Midjourney's --no and Stable
// Diffusion's negative prompt, so an image never shows what the guidance
// tells the model does not exist.
const LATER_TECH = [
    ['tl4', ['firearms', 'gunpowder weapons']],
    ['tl5', ['steam engines', 'factories']],
    ['tl6', ['cars', 'electric lights', 'telephones']],
    ['tl7', ['computers', 'screens', 'modern clothing']],
    ['tl8', ['smartphones', 'drones']],
    ['tl9', ['spaceships', 'cybernetic implants']],
];
// A world of a later age than the castle (modern, post-apocalyptic, science
// fiction - or tech level TL6 and up): the storybook look a generator
// falls back on for "fortress", "gate" or "keep" is left out.
const STORYBOOK = ['medieval castle', 'stone turrets', 'fairytale'];

export function worldExclusions(overview) {
    const o = overview ?? {};
    const magic = normalizeMagic(o.magic);
    const tech = normalizeTech(o.tech);
    const out = [];
    if (isLaterAge(o)) out.push(...STORYBOOK);
    if (magic.presence === 'none') out.push('magic', 'glowing spell effects');
    for (const kind of magic.absent) out.push(/magic|sorcery|craft/i.test(kind) ? kind : `${kind} magic`);
    out.push(...tech.absent);
    const level = Number(String(tech.level).replace(/^tl/, ''));
    if (Number.isFinite(level) && tech.level && tech.spread !== 'imported' && tech.spread !== 'relic') {
        // A post-apocalyptic world is the ruin of a more advanced one: dead
        // screens and modern rags belong in its pictures, so only what lies
        // beyond the information age is ruled out by its level.
        const floor = o.worldType === 'post_apocalyptic' ? Math.max(level, 8) : level;
        for (const [tl, things] of LATER_TECH) if (Number(tl.slice(2)) > floor) out.push(...things);
    }
    return [...new Set(out.map((x) => clean(x).toLowerCase()).filter(Boolean))].slice(0, 12);
}
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Shortens to about `words` words.
function words(text, max) {
    const list = clean(text).split(' ').filter(Boolean);
    return list.length <= max ? list.join(' ') : `${list.slice(0, max).join(' ')}`;
}

// What a named thing is, from the last word of its name: "Niamh's
// Fortress" is a fortress, "The Blackened Bridge" a bridge. '' for a name
// with nothing generic in it.
export function kindWord(name) {
    const last = clean(name).split(/\s+/).pop()?.toLowerCase().replace(/[^a-z'-]/g, '') ?? '';
    return last.length >= 3 && /^[a-z]/.test(last) && !/['’]s$/.test(last) && clean(name).split(/\s+/).length > 1 ? last : '';
}

// The entry's own names taken out of a text, so they don't reach the
// prompt - replaced by `kind` ("the fortress") when given.
export function stripNames(text, names, kind = '') {
    let out = clean(text);
    for (const name of [...names].filter((n) => clean(n).length > 1).sort((a, b) => b.length - a.length)) {
        out = out.replace(new RegExp(`\\b${escapeRe(clean(name))}(['’]s)?\\b`, 'gi'), (_m, poss) => {
            if (!kind) return '';
            return `the ${kind}${poss ?? ''}`;
        });
    }
    out = out.replace(/\s+([,.;:])/g, '$1').replace(/([,.;:]){2,}/g, '$1').replace(/^[\s,.;:]+/, '').replace(/\s+/g, ' ').trim();
    return kind ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

// ---- what a picture can show
// An image generator answers to what can be seen - looks, clothes, colours,
// materials, light - and is confused by story: a role ("responsible for
// maintaining order"), a history ("a memento from a brutal encounter"),
// the names of other people, factions and gods. So the description is cut
// down to its visual sentences, story clauses and every known name taken
// out, whole sentences only (never cut mid-phrase).

const VISUAL = /\b(?:hair|eyes?|skin|face|features|beard|stubble|scars?|scarred|tattoos?|freckles|brow|jaw|lips|teeth|horns?|wings?|tail|fur|scales|feathers|claws?|build|frame|physique|tall|short|lean|slender|stocky|muscular|broad|wiry|towering|hulking|wears?|wearing|worn|dressed|clad|garbed|armou?r|cloak|robes?|coat|leathers?|boots|gloves|bracers|sash|hood|mask|helm(?:et)?|belt|jewel(?:le)?ry|amulet|rings?|blade|sword|bow|staff|spear|shield|rifle|carries|wields|holds|walls?|windows?|towers?|gates?|roofs?|doors?|floors?|stairs?|stone|metal|wood(?:en)?|iron|steel|rust(?:ing|ed|y)?|concrete|brick|glass|scrap|ruins?|rubble|dust|moss|vines|smoke|fog|mist|candles?|torch(?:es|light)?|lamps?|lit|glow(?:s|ing)?|gleam(?:s|ing)?|shadows?|light|dark|dim(?:ly)?|bright|pale|black|white|grey|gray|silver|gold(?:en)?|bronze|copper|red|crimson|scarlet|blue|azure|green|emerald|brown|amber|orange|purple|violet|colou?r(?:ed)?|ornate|carved|engraved|etched|painted|tattered|ragged|polished|shattered|cracked|jagged|twisted|towering|looms?|sprawl(?:s|ing)?|perched|hall|chamber|room|courtyard|banners?|sigils?|emblem|symbols?)\b/gi;
const STORY = /\b(?:responsible|must|seeks?|seeking|goals?|wants?|wishes|believes?|knows?|known|history|past|once|after|because|since|leader|leads|protector|serves?|serving|ally|allies|enemy|enemies|war|battles?|tale|tales|memento|invaluable|asset|conflict|influence|mission|duty|loyal(?:ty)?|trust(?:ed)?|betray(?:al|ed)?|role|order|people|community|resources|balance|reputation|feared|respected|decades|years of|journey|quest|plans?|secretly|rumou?red|result|speaks?|testament|survival|skills|hasty|desperate)\b/gi;
const count = (re, text) => (String(text).match(re) ?? []).length;

// Whether a sentence can be pictured: no story in it ("A burnt forest of
// ash and blackened stumps"), or more of what is seen than of story.
export function isVisual(sentence) {
    if (!clean(sentence)) return false;
    const story = count(STORY, sentence);
    return story === 0 || count(VISUAL, sentence) >= story;
}

// A sentence with its story clauses dropped: a clause (between commas, or
// from "that", "which", "while", "making", "marking"...) that tells story
// rather than looks goes, with the separator before it.
const CLAUSE = /(,\s+|;\s+|\s+(?=(?:that|which|while|whereas|making|marking|telling|as if|a memento|a reminder|a testament)\b))/i;
function visualClauses(sentence) {
    const bits = sentence.split(CLAUSE);
    let out = '';
    for (let i = 0; i < bits.length; i += 2) {
        const part = bits[i];
        const seen = count(VISUAL, part);
        const story = count(STORY, part);
        // After the first, a clause stays only for what it shows (a short
        // neutral one - "and a crimson sash" - too).
        const keep = i === 0 ? story <= seen
            : seen > story || (story === 0 && !/^(?:that|which)\b/i.test(part) && part.split(/\s+/).length <= 4);
        if (keep) out += (i === 0 ? '' : bits[i - 1]) + part;
    }
    return out.replace(/^[,;\s]+/, '');
}

// Whether a description has something to picture at all.
const isVisualEnough = (text) => clean(text).split(/(?<=[.!?])\s+/).map(visualClauses).some(isVisual);

// Every known name (the entry's own, people, factions, gods, places) out of
// a text, with the "of"/"for"/"by" that tied it on; the entry's own
// replaced by its kind when given ("the fortress").
export function withoutNames(text, { own = [], others = [], kind = '' } = {}) {
    let out = stripNames(text, own, kind);
    // "Ferunox, the Sovereign of the Unbound Ember" is "Ferunox" too.
    const short = others.flatMap((n) => [n, clean(n).split(/,|\s+the\s+/i)[0]]);
    const list = [...new Set(short.map(clean).filter((n) => n.length > 2))].sort((a, b) => b.length - a.length);
    for (const name of list) {
        const n = escapeRe(name);
        out = out.replace(new RegExp(`\\s*\\b(?:of|for|from|by|to|with|at|in)\\s+(?:the\\s+)?${n}(?:['’]s)?\\b`, 'gi'), (m) => (/\s(?:of|for|from|by|to|with|at|in)\s+an?\s/i.test(` ${m}`) ? m : ''))
            .replace(new RegExp(`\\b${n}['’]s\\s+`, 'gi'), '')
            .replace(new RegExp(`\\b(?:the\\s+)?${n}\\b`, 'gi'), (m, at, whole) => (/\ban?\s+(?:[\w-]+\s+)?$/i.test(whole.slice(0, at)) ? m : ''));
    }
    return out.replace(/\s+([,.;:])/g, '$1').replace(/([,;:])\s*([,.;:])/g, '$2').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}

// The description as a picture: its visual sentences (story clauses and
// names out), whole sentences, about `max` words; "He has"/"is a" made a
// plain description. Falls back to the first sentence when none is visual.
export function visualDescription(text, { own = [], others = [], kind = '', max = 60 } = {}) {
    const sentences = clean(text).split(/(?<=[.!?])\s+/).filter(Boolean);
    const visual = sentences.map(visualClauses).filter(isVisual);
    const chosen = visual.length ? visual : sentences.slice(0, 1);
    const out = [];
    let used = 0;
    for (const s of chosen) {
        let t = withoutNames(s, { own, others, kind })
            .replace(/^(?:is|was)\s+/i, '')
            .replace(/^(?:now|once|today|still|yet),?\s+/i, '')
            .replace(/[.!?]+$/, '');
        if (!t) continue;
        // A later sentence starts with a capital again ("he appears" -> "He appears").
        if (out.length) t = t.charAt(0).toUpperCase() + t.slice(1);
        const n = t.split(/\s+/).length;
        if (used && used + n > max) break;
        out.push(t);
        used += n;
    }
    return out.join('. ');
}

// A role as a picture's subject: a short archetype ("Veteran fighter and
// scout", "powerful Death Knight"), never a sentence about duties. '' when
// the role is all story.
export function roleArchetype(role, names = []) {
    let r = clean(role);
    if (!r) return '';
    const as = r.match(/\b(?:serves|acts|works|stands)\s+as\s+(?:an?\s+|the\s+)?([^,.;]+)/i);
    if (as) r = as[1];
    if (/^(?:as|he|she|they|it|his|her|their)\b/i.test(r)) return '';
    r = withoutNames(r.split(/[,.;:(]|\s+(?:who|which|that|for|of|to|in|from|serving|responsible)\b/i)[0], { others: names }).trim();
    if (!r || r.split(/\s+/).length > 5 || count(STORY, r)) return '';
    return r.toLowerCase();
}

const field = (entry, name) => {
    const v = entry?.base?.[name] ?? entry?.[name];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : (typeof v === 'string' ? v : '');
};

// The subject phrase for each type: what the picture is of.
const article = (noun) => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);

function subjectOf(entry, description, names = [], overview = {}) {
    const role = roleArchetype(field(entry, 'role'), [entry.name, ...(entry.aliases ?? []), ...names]);
    switch (entry.type) {
        case 'character': return [role ? `portrait of ${article(role)}` : 'character portrait', description];
        case 'location': return [description || 'a place', 'establishing shot'];
        // Heraldry belongs to the castle age; a later world brands its factions.
        case 'faction': return [`${isLaterAge(overview) ? 'logo and branding' : 'heraldic emblem and banner'} of ${description ? `a faction: ${description}` : 'a faction'}`];
        case 'item': return [`${description || 'an object'}`, 'single object, detailed, isolated'];
        case 'creature': return [`${description || 'a creature'}`, clean(field(entry, 'traits')), 'creature design'];
        case 'lore': return [`illustration of ${description || 'a legend'}`];
        default: return [description || entry.name, 'narrative scene'];
    }
}

// The genre word a style preset's "fantasy" stands for in this world.
const GENRES = Object.freeze({ post_apocalyptic: 'post-apocalyptic', modern: 'modern', science_fiction: 'science fiction', urban_fantasy: 'urban fantasy', cosmic_horror: 'cosmic horror', historical: 'historical' });

// The setting's look: its kind of world and technology first (what the
// picture is set in), then its era and tone.
export function flavourOf(overview) {
    const o = overview ?? {};
    return [
        describeLook(o).look,
        clean(o.era),
        clean(o.tone) ? `${clean(o.tone)} mood` : '',
    ].map(clean).filter(Boolean).join(', ');
}

// The style's words - its "fantasy" made this world's genre ("dark fantasy
// oil painting" is "dark post-apocalyptic oil painting" in a wasteland).
export function styleOf(options, overview = {}, { provider = '' } = {}) {
    const preset = styleFor(options);
    const genre = GENRES[overview?.worldType];
    const own = provider === 'stable_diffusion' && preset?.sd ? preset.sd : (preset?.text ?? '');
    const text = genre ? own.replace(/\bfantasy\b/gi, genre) : own;
    return [text, clean(options.customStyle)].filter(Boolean).join(', ');
}

// Inputs: entry (State Engine object: type, name, aliases, description,
// fields), `narrative` (the chat's current description, used instead of
// the base one when set), `environment` ({ climate, lighting } values,
// inherited), `overview` (setting overview), `options`
// (DEFAULT_IMAGE_OPTIONS shape). -> { prompt, negative, provider }
// knownNames: every name in the library (people, factions, gods, places) -
// none of them reaches the picture.
export function buildImagePrompt({ entry, narrative = '', environment = {}, overview = {}, options = {}, knownNames = [] }) {
    const opts = { ...DEFAULT_IMAGE_OPTIONS, ...options, midjourney: { ...DEFAULT_IMAGE_OPTIONS.midjourney, ...(options.midjourney ?? {}) } };
    const names = opts.includeNames ? [] : [entry.name, ...(entry.aliases ?? [])];
    // A place's (or thing's) name taken out leaves its kind in its stead
    // ("Niamh's Fortress looms" - "The fortress looms"), so the picture
    // still knows what it is of. People's names just go.
    // What can be seen, and nothing of the story: no other names, no role
    // or history - whole sentences only. The chat's current description
    // (a place burnt since) when it has anything to picture, else the base.
    const ownNames = [entry.name, ...(entry.aliases ?? [])];
    const others = (knownNames ?? []).filter((n) => !ownNames.some((o) => clean(o).toLowerCase() === clean(n).toLowerCase()));
    const source = isVisualEnough(narrative) ? narrative : (entry.description || narrative || '');
    const description = visualDescription(source, { own: names, others, kind: entry.type === 'character' ? '' : kindWord(entry.name) });
    const env = [clean(environment.climate), clean(environment.lighting)].filter(Boolean).join(', ');
    const preset = styleFor(opts);
    const styleText = styleOf(opts, overview, { provider: opts.provider });
    // A style that leads (anime) goes first, where the models weigh it most.
    const leads = preset?.first && opts.provider !== 'natural';
    const parts = [
        leads ? styleText : '',
        opts.includeNames && entry.type === 'character' ? clean(entry.name) : '',
        ...subjectOf(entry, description, others, overview),
        entry.type === 'character' ? clean(preset?.portrait) : '',
        entry.type === 'location' || entry.type === 'scene' ? env : '',
        flavourOf(overview),
        leads ? '' : styleText,
    ].map(clean).filter(Boolean);
    const subject = parts.join(', ').replace(/\.\s*,/g, ',').replace(/\.+$/, '');

    if (opts.provider === 'midjourney') {
        const mj = opts.midjourney;
        const params = [`--ar ${DEFAULT_ASPECT[entry.type] ?? '1:1'}`];
        // An anime style draws on Midjourney's anime model, niji.
        const version = preset?.niji && !String(mj.version).startsWith('niji') ? NIJI : String(mj.version);
        if (version.startsWith('niji')) params.push(`--niji ${version.replace(/^niji\s*/, '')}`);
        else params.push(`--v ${version}`);
        if (Number.isFinite(Number(mj.stylize)) && Number(mj.stylize) !== 100) params.push(`--stylize ${Math.round(Number(mj.stylize))}`);
        if (Number(mj.chaos) > 0) params.push(`--chaos ${Math.round(Number(mj.chaos))}`);
        if (mj.raw) params.push('--style raw');
        const no = [...new Set([...clean(mj.no).split(',').map(clean).filter(Boolean), ...clean(preset?.mjNo).split(',').map(clean).filter(Boolean), ...(opts.respectLimits === false ? [] : worldExclusions(overview))])];
        if (no.length) params.push(`--no ${no.join(', ')}`);
        if (clean(mj.sref)) params.push(`--sref ${clean(mj.sref)}`);
        if (clean(mj.extra)) params.push(clean(mj.extra));
        // Midjourney reads "--" as a parameter anywhere in the prompt.
        return { provider: 'midjourney', prompt: `${subject.replace(/--+/g, '-')} ${params.join(' ')}`, negative: '' };
    }
    if (opts.provider === 'stable_diffusion') {
        const negative = [clean(opts.negative), clean(preset?.sdNegative), ...(opts.respectLimits === false ? [] : worldExclusions(overview))].filter(Boolean).join(', ');
        return { provider: 'stable_diffusion', prompt: `${subject}, highly detailed`, negative };
    }
    const style = styleText;
    const body = parts.slice(opts.includeNames && entry.type === 'character' ? 1 : 0).filter((p) => p !== style).join(', ');
    const lead = preset?.natural ? `${preset.natural} of ` : style ? `${style.split(',')[0]} of ` : 'An image of ';
    const sentence = `${lead}${body.charAt(0).toLowerCase()}${body.slice(1)}.`;
    return { provider: 'natural', prompt: sentence.charAt(0).toUpperCase() + sentence.slice(1), negative: '' };
}
