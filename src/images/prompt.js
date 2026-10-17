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
    { id: 'anime', label: 'Anime key visual', text: 'anime key visual, clean cel shading, vivid colour' },
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

export const MJ_VERSIONS = Object.freeze(['7', '6.1', 'niji 6']);

export const DEFAULT_IMAGE_OPTIONS = Object.freeze({
    provider: 'midjourney',
    style: 'painterly',
    customStyle: '',
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

import { normalizeMagic, normalizeTech } from '../library/world-options.js';

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
export function worldExclusions(overview) {
    const o = overview ?? {};
    const magic = normalizeMagic(o.magic);
    const tech = normalizeTech(o.tech);
    const out = [];
    if (magic.presence === 'none') out.push('magic', 'glowing spell effects');
    for (const kind of magic.absent) out.push(/magic|sorcery|craft/i.test(kind) ? kind : `${kind} magic`);
    out.push(...tech.absent);
    const level = Number(String(tech.level).replace(/^tl/, ''));
    if (Number.isFinite(level) && tech.level && tech.spread !== 'imported' && tech.spread !== 'relic') {
        for (const [tl, things] of LATER_TECH) if (Number(tl.slice(2)) > level) out.push(...things);
    }
    return [...new Set(out.map((x) => clean(x).toLowerCase()).filter(Boolean))].slice(0, 12);
}
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Shortens to about `words` words.
function words(text, max) {
    const list = clean(text).split(' ').filter(Boolean);
    return list.length <= max ? list.join(' ') : `${list.slice(0, max).join(' ')}`;
}

// The entry's own names taken out of a text, so they don't reach the prompt.
export function stripNames(text, names) {
    let out = clean(text);
    for (const name of [...names].filter((n) => clean(n).length > 1).sort((a, b) => b.length - a.length)) {
        out = out.replace(new RegExp(`\\b${escapeRe(clean(name))}(['’]s)?\\b`, 'gi'), '');
    }
    return out.replace(/\s+([,.;:])/g, '$1').replace(/([,.;:]){2,}/g, '$1').replace(/^[\s,.;:]+/, '').replace(/\s+/g, ' ').trim();
}

const field = (entry, name) => {
    const v = entry?.base?.[name] ?? entry?.[name];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : (typeof v === 'string' ? v : '');
};

// The subject phrase for each type: what the picture is of.
const article = (noun) => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);

function subjectOf(entry, description) {
    const role = clean(field(entry, 'role'));
    switch (entry.type) {
        case 'character': return [`portrait of ${article(role || 'character')}`, description];
        case 'location': return [description || 'a place', 'establishing shot'];
        case 'faction': return [`heraldic emblem and banner of ${description ? `a faction: ${description}` : 'a faction'}`];
        case 'item': return [`${description || 'an object'}`, 'single object, detailed, isolated'];
        case 'creature': return [`${description || 'a creature'}`, clean(field(entry, 'traits')), 'creature design'];
        case 'lore': return [`illustration of ${description || 'a legend'}`];
        default: return [description || entry.name, 'narrative scene'];
    }
}

// The setting's flavour: era and tone from the overview.
function flavourOf(overview) {
    const o = overview ?? {};
    return [clean(o.era), clean(o.tone) ? `${clean(o.tone)} mood` : ''].filter(Boolean).join(', ');
}

function styleOf(options) {
    const preset = STYLES.find((s) => s.id === options.style);
    return [preset?.text ?? '', clean(options.customStyle)].filter(Boolean).join(', ');
}

// Inputs: entry (State Engine object: type, name, aliases, description,
// fields), `narrative` (the chat's current description, used instead of
// the base one when set), `environment` ({ climate, lighting } values,
// inherited), `overview` (setting overview), `options`
// (DEFAULT_IMAGE_OPTIONS shape). -> { prompt, negative, provider }
export function buildImagePrompt({ entry, narrative = '', environment = {}, overview = {}, options = {} }) {
    const opts = { ...DEFAULT_IMAGE_OPTIONS, ...options, midjourney: { ...DEFAULT_IMAGE_OPTIONS.midjourney, ...(options.midjourney ?? {}) } };
    const names = opts.includeNames ? [] : [entry.name, ...(entry.aliases ?? [])];
    const description = stripNames(words(narrative || entry.description || '', 60), names);
    const env = [clean(environment.climate), clean(environment.lighting)].filter(Boolean).join(', ');
    const parts = [
        opts.includeNames && entry.type === 'character' ? clean(entry.name) : '',
        ...subjectOf(entry, description),
        entry.type === 'location' || entry.type === 'scene' ? env : '',
        flavourOf(overview),
        styleOf(opts),
    ].map(clean).filter(Boolean);
    const subject = parts.join(', ').replace(/\.\s*,/g, ',').replace(/\.+$/, '');

    if (opts.provider === 'midjourney') {
        const mj = opts.midjourney;
        const params = [`--ar ${DEFAULT_ASPECT[entry.type] ?? '1:1'}`];
        if (String(mj.version).startsWith('niji')) params.push(`--niji ${String(mj.version).replace(/^niji\s*/, '')}`);
        else params.push(`--v ${mj.version}`);
        if (Number.isFinite(Number(mj.stylize)) && Number(mj.stylize) !== 100) params.push(`--stylize ${Math.round(Number(mj.stylize))}`);
        if (Number(mj.chaos) > 0) params.push(`--chaos ${Math.round(Number(mj.chaos))}`);
        if (mj.raw) params.push('--style raw');
        const no = [...new Set([...clean(mj.no).split(',').map(clean).filter(Boolean), ...(opts.respectLimits === false ? [] : worldExclusions(overview))])];
        if (no.length) params.push(`--no ${no.join(', ')}`);
        if (clean(mj.sref)) params.push(`--sref ${clean(mj.sref)}`);
        if (clean(mj.extra)) params.push(clean(mj.extra));
        // Midjourney reads "--" as a parameter anywhere in the prompt.
        return { provider: 'midjourney', prompt: `${subject.replace(/--+/g, '-')} ${params.join(' ')}`, negative: '' };
    }
    if (opts.provider === 'stable_diffusion') {
        const negative = [clean(opts.negative), ...(opts.respectLimits === false ? [] : worldExclusions(overview))].filter(Boolean).join(', ');
        return { provider: 'stable_diffusion', prompt: `${subject}, highly detailed`, negative };
    }
    const body = parts.slice(opts.includeNames && entry.type === 'character' ? 1 : 0).filter((p) => p !== styleOf(opts)).join(', ');
    const lead = styleOf(opts) ? `${styleOf(opts).split(',')[0]} of ` : 'An image of ';
    const sentence = `${lead}${body.charAt(0).toLowerCase()}${body.slice(1)}.`;
    return { provider: 'natural', prompt: sentence.charAt(0).toUpperCase() + sentence.slice(1), negative: '' };
}
