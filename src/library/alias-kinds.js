// What kind of other name an alias is - a nickname, a codename, a title,
// a stage name - and who uses it. The aliases themselves stay in State
// Engine's list (everything that recognises a name in the chat reads it);
// Scenario Builder keeps, per entry, { [alias]: { kind, knownBy: [id] } }
// (entry meta `aliasInfo`). Pure.

export const ALIAS_KINDS = Object.freeze([
    ['', 'Other name'],
    ['nickname', 'Nickname'],
    ['codename', 'Codename / callsign'],
    ['title', 'Title / epithet'],
    ['stage', 'Pen / stage name'],
]);
const KIND_IDS = new Set(ALIAS_KINDS.map(([id]) => id));
const KIND_WORDS = { nickname: 'a nickname', codename: 'a codename', title: 'a title', stage: 'an assumed name' };

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function normalizeAliasInfo(value) {
    const out = {};
    if (!isObject(value)) return out;
    for (const [alias, info] of Object.entries(value)) {
        const a = clean(alias);
        if (!a || !isObject(info)) continue;
        const kind = KIND_IDS.has(info.kind) ? info.kind : '';
        const knownBy = Array.isArray(info.knownBy) ? [...new Set(info.knownBy.filter((x) => typeof x === 'string' && x))] : [];
        if (kind || knownBy.length) out[a] = { kind, knownBy };
    }
    return out;
}

// Only the aliases the entry still has (an alias removed takes its kind
// with it).
export function aliasInfoFor(aliases, info) {
    const keep = new Set((aliases ?? []).map(clean));
    return Object.fromEntries(Object.entries(normalizeAliasInfo(info)).filter(([a]) => keep.has(a)));
}

export const kindLabel = (kind) => ALIAS_KINDS.find(([id]) => id === kind)?.[1] ?? 'Other name';

// "Stitches (nickname)" for the sheet.
export function aliasLabel(alias, info) {
    const kind = info?.[alias]?.kind;
    return kind ? `${alias} (${kindLabel(kind).split(' / ')[0].toLowerCase()})` : alias;
}

const andList = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// The guidance sentence for how someone is known: what each name is and who
// uses it - so a codename stays with the crew that uses it.
// aliases: [string]; info: aliasInfo; nameOf(id) -> name or ''.
// -> '' when there is nothing to say.
export function knownAsText(name, aliases, info, nameOf = () => '') {
    const parts = [];
    for (const alias of (aliases ?? []).map(clean).filter(Boolean)) {
        const i = info?.[alias];
        const kind = KIND_WORDS[i?.kind] ?? '';
        const who = (i?.knownBy ?? []).map(nameOf).filter(Boolean);
        const bits = [`"${alias}"`];
        if (kind) bits.push(`(${kind})`);
        if (who.length) bits.push(`- used only by ${andList(who)}; no one else knows ${clean(name)} by it`);
        parts.push(bits.join(' '));
    }
    if (!parts.length) return '';
    return `${clean(name)} is also known as ${parts.join('; ')}.`;
}
