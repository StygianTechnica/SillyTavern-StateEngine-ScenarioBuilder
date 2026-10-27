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

// The names kept to a few, for the director: [{ alias, kind, people:
// [name], groups: [name] }] - an alias with users. isGroup(id): a faction.
export function keptNames(aliases, info, nameOf = () => '', isGroup = () => false) {
    const out = [];
    for (const alias of (aliases ?? []).map(clean).filter(Boolean)) {
        const users = info?.[alias]?.knownBy ?? [];
        if (!users.length) continue;
        const people = users.filter((u) => !isGroup(u)).map(nameOf).filter(Boolean);
        const groups = users.filter(isGroup).map(nameOf).filter(Boolean);
        if (people.length || groups.length) out.push({ alias, kind: info[alias].kind ?? '', people, groups });
    }
    return out;
}

// For the director: who here does not know someone's kept name, so it is
// never in their mouths. cast: [{ name, keptNames, factions?: [name] }]
// (factions: the groups they belong to). -> [line]
export function keptNameLines(cast = []) {
    const lines = [];
    const here = cast.filter((c) => clean(c?.name));
    for (const c of here) {
        for (const k of c.keptNames ?? []) {
            const knows = (p) => k.people.some((n) => clean(n).toLowerCase() === clean(p.name).toLowerCase()) || (p.factions ?? []).some((f) => k.groups.includes(f));
            const unaware = here.filter((p) => p !== c && !knows(p)).map((p) => clean(p.name));
            if (!unaware.length) continue;
            const users = andList([...k.people, ...k.groups.map((g) => `members of ${g}`)]);
            lines.push(`"${k.alias}" is ${clean(c.name)}'s ${(KIND_WORDS[k.kind] ?? 'other name').replace(/^an? /, '')}, used only by ${users}. ${andList(unaware)} ${unaware.length === 1 ? 'does' : 'do'} not know it: to them it is ${clean(c.name)}, and no one says "${k.alias}" in front of them unless the story has them learn it.`);
        }
    }
    return lines;
}
