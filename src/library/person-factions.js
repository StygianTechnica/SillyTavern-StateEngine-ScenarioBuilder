// A person's factions and where they stand in each - the other side of a
// faction's chain of command (src/library/roster.js), for the person's own
// sheet. Pure.

import { libraryMemberships } from './faction-sync.js';
import { rosterOf, placeIn } from './roster.js';

// factions: library faction entries (with meta); relations: the setting's.
// -> [{ faction, place }] - place: { tier, tierName, title } or null (they
// belong with no rank yet) - in name order.
export function factionsOf(personId, factions = [], relations = []) {
    const mine = new Set(libraryMemberships(factions, relations).get(personId) ?? []);
    return (factions ?? []).filter((f) => mine.has(f.id))
        .map((f) => ({ faction: f, place: placeIn(rosterOf(f), personId) }))
        .sort((a, b) => String(a.faction.name).localeCompare(String(b.faction.name)));
}
