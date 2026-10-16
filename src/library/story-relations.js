// Relationships the story has established, from Archivist's compiled memory
// (spec SB-112, SB-440): its getEntityDossier() gathers every compiled
// relationship an object is part of - type, polarity (-3 hostile .. +3
// devoted), intensity, trend and a line of text. Read-only (SB-005);
// without Archivist, or before its first compile, there are none (SB-003).

import { LOG_PREFIX } from '../constants.js';

export const POLARITY_LABELS = Object.freeze({ '-3': 'hostile', '-2': 'antagonistic', '-1': 'wary', 0: 'neutral', 1: 'friendly', 2: 'close', 3: 'devoted' });

export function hasArchivist() {
    return typeof window.StateEngineArchivist?.getEntityDossier === 'function';
}

// -> [{ direction: 'out' | 'in', otherId, otherName, type, polarity,
//      polarityLabel, intensity, trend, text }], [] without Archivist.
export async function storyRelationships(entry) {
    if (!hasArchivist() || !entry?.id) return [];
    try {
        const dossier = await window.StateEngineArchivist.getEntityDossier({ id: entry.id, name: entry.name });
        return (dossier?.relationships ?? []).map((r) => {
            const polarity = Math.max(-3, Math.min(3, Math.round(Number(r.polarity) || 0)));
            return {
                direction: r.direction === 'in' ? 'in' : 'out',
                otherId: r.other?.id ?? null,
                otherName: r.other?.name ?? '',
                type: String(r.type ?? ''),
                polarity,
                polarityLabel: POLARITY_LABELS[polarity],
                intensity: String(r.intensity ?? ''),
                trend: String(r.trend ?? ''),
                text: String(r.text ?? ''),
            };
        }).filter((r) => r.otherName || r.otherId);
    } catch (err) {
        console.warn(LOG_PREFIX, 'could not read relationships from Archivist', err);
        return [];
    }
}

// One relationship as a line of prompt text, from `name`'s point of view.
export function relationshipLine(name, r) {
    const signed = r.polarity > 0 ? `+${r.polarity}` : String(r.polarity);
    const who = r.direction === 'out' ? `${name} → ${r.otherName}` : `${r.otherName} → ${name}`;
    return `${who}: ${[r.type, `${r.polarityLabel} (${signed})`, r.intensity && `${r.intensity} intensity`, r.trend].filter(Boolean).join(', ')}${r.text ? ` - ${r.text}` : ''}`;
}
