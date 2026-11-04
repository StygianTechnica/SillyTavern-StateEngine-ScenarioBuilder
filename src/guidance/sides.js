// Whose side someone here is on, when the sides present are at odds.
// Dr. Adrigo Tole, of Omicron Innovations, met Cyril at White Cerberus's
// safehouse with two of its agents; White Cerberus distrusts Omicron. The
// narrator - and Archivist's notes after it - made him "a consultant for
// White Cerberus" who spoke of "our recent dealings": nothing said whose
// man he was. Read from the library alone, no model call. Pure.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// Factions that do not work together: one distrusts, opposes or fights the other.
const AT_ODDS = /distrust|mistrust|enem|rival|hostil|\bwar\b|at war|oppos|hate|feud|against|suspic|wary|targets?\b|hunts?\b|competit/i;

// people: [{ name, factionIds: [id], player }] - those present;
// relations: [{ from, to, kind }]; nameOf(id) -> name.
// -> [{ name, of, apart, why }] - one for each person whose factions none of
//    the others share and one of the others' factions is at odds with.
export function sidesApart(people = [], relations = [], nameOf = () => '') {
    const here = people.filter((p) => clean(p?.name));
    const out = [];
    for (const p of here) {
        if (p.player) continue;
        const mine = new Set(p.factionIds ?? []);
        if (!mine.size) continue;
        const theirs = new Set(here.filter((o) => o !== p).flatMap((o) => o.factionIds ?? []).filter((f) => !mine.has(f)));
        if (!theirs.size) continue;
        // Only the one who shares a side with no one here: the outsider
        // (Vex, with Inji and Cyril of White Cerberus, needs no reminder).
        if (here.some((o) => o !== p && (o.factionIds ?? []).some((f) => mine.has(f)))) continue;
        for (const r of relations ?? []) {
            const kind = clean(r?.kind);
            if (!AT_ODDS.test(kind)) continue;
            const pair = mine.has(r.from) && theirs.has(r.to) ? [r.from, r.to] : mine.has(r.to) && theirs.has(r.from) ? [r.to, r.from] : null;
            if (!pair) continue;
            const of = nameOf(pair[0]);
            const apart = nameOf(pair[1]);
            if (!of || !apart) continue;
            out.push({ name: clean(p.name), of, apart, why: `${nameOf(r.from)} ${kind.toLowerCase()} ${nameOf(r.to)}` });
            break;
        }
    }
    return out;
}

// One sentence each, for the narrator.
export function sidesText(sides = []) {
    return (sides ?? []).map((s) => `${s.name} is of ${s.of}, not of ${s.apart} (${s.why}): ${s.name} works for ${s.of} and their own aims, never for ${s.apart}'s benefit, and never speaks as one of ${s.apart}.`).join(' ');
}
