// "Standing in this story" on a person's sheet (src/state/standing.js):
// how the people who saw them at it see them now - moved by hand with the
// arrows, or by taking a pattern the story shows. Never the player
// character's.

import { h, icon, button } from './dom.js';
import { ws, rerender } from './ws.js';
import { getChatDoc } from '../store/chat-store.js';
import { playerIdOf } from '../library/library.js';
import { syncNow } from '../guidance/sync.js';
import { setStanding, setStandingLine, dismissStanding, openPattern, levelWord, MIN_LEVEL, MAX_LEVEL } from '../state/standing.js';

const done = () => { void syncNow(); rerender({ force: true }); };

export function standingCard(type, entry, all) {
    if (type.id !== 'character' || !entry?.id) return null;
    const { chatKey, settingId } = ws.ctx;
    if (playerIdOf(settingId, all.character ?? []) === entry.id) return null;
    const doc = getChatDoc(chatKey);
    const p = doc.standing?.people?.[entry.id] ?? { level: 0, line: '', by: [], marks: [] };
    const names = new Map((all.character ?? []).map((c) => [c.id, c.name]));
    const holders = p.by.map((id) => names.get(id)).filter(Boolean);
    const pattern = openPattern(p);
    const move = (sign) => { setStanding(chatKey, entry.id, sign, { name: entry.name }); done(); };
    const level = p.level ?? 0;
    return h('div', { class: 'sb-card sb-standing' },
        h('div', { class: 'sb-card-title' }, icon('fa-scale-unbalanced'), ' Standing in this story',
            h('span', { class: 'sb-spacer' }),
            h('span', { class: 'sb-iconbtn', title: 'Lower how they are seen - those who know them weigh their word less', onclick: () => level > MIN_LEVEL && move(-1) }, icon('fa-arrow-down')),
            h('span', { class: `sb-chip sb-standing-${level < 0 ? 'low' : level > 0 ? 'high' : 'even'}` }, level ? `${level > 0 ? '+' : ''}${level} · ${levelWord(level)}` : 'as described'),
            h('span', { class: 'sb-iconbtn', title: 'Raise how they are seen', onclick: () => level < MAX_LEVEL && move(1) }, icon('fa-arrow-up'))),
        level ? h('div', {},
            h('textarea', {
                class: 'text_pole', rows: 2,
                placeholder: `How they are seen now, e.g. "full of wild theories she never tests" - empty: ${levelWord(level)}`,
                value: p.line ?? '',
                onchange: (e) => { setStandingLine(chatKey, entry.id, e.target.value); done(); },
            }),
            h('small', { class: 'sb-hint' }, holders.length
                ? `Held by ${holders.join(', ')} - those who saw it. Others keep the old picture.`
                : 'Held by everyone who knows them. The narrator shows it while one of them is in the scene; the planner gives them fewer moments when they are not taken seriously.'))
            : h('small', { class: 'sb-hint' }, 'Lower it when what they do should cost them others\' trust; the story\'s pattern is offered in Review too.'),
        pattern ? h('div', { class: 'sb-standing-pattern' },
            h('div', {}, h('b', {}, pattern.sign < 0 ? 'The story shows a pattern against them:' : 'The story shows a pattern for them:')),
            h('ul', {}, pattern.marks.slice(-4).map((m) => h('li', {}, h('i', {}, m.kind), ` - ${m.text}`))),
            h('div', { class: 'sb-actions' },
                button(pattern.sign < 0 ? 'Lower their standing' : 'Raise their standing', () => move(pattern.sign), { iconName: pattern.sign < 0 ? 'fa-arrow-down' : 'fa-arrow-up', cls: 'sb-primary' }),
                button('Not now', () => { dismissStanding(chatKey, entry.id); done(); }, { iconName: 'fa-xmark' }))) : null);
}
