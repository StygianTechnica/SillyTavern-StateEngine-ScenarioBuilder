// A rival crew at work, found in the chat without the model's OPPOSED line.
import { rivalAtWork } from '../src/ops/detect.js';
import { startOp, opGuidance, opFacts, afterBriefing } from '../src/ops/model.js';
import { readOpPlan } from '../src/ops/generate.js';

const factions = [{ id: 'f_wc', name: 'White Cerberus' }, { id: 'f_med', name: 'Medina Syndicate' }, { id: 'f_om', name: 'Omicron Innovations' }];
const members = new Map([['f_med', [{ id: 'enr', name: 'Enrique Medina' }, { id: 'dt', name: 'Delvin Timmors', aliases: ['Ice'] }]]]);
const relations = [{ from: 'f_wc', to: 'f_med', kind: 'enemy of' }];

describe('a rival crew at work, from the chat', () => {
    it('Enrique\'s heist, named in passing', () => {
        const found = rivalAtWork({
            texts: ['"I think I know what entrance they\'re using now."', 'As they set out into the fog, the trio followed the drone. Their mission to disrupt Enrique\'s heist remained paramount.'],
            factions, relations, mine: ['f_wc'], members,
        });
        expect(found).toEqual({ who: 'Medina Syndicate', what: 'Their mission to disrupt Enrique\'s heist remained paramount.' });
    });

    it('by the faction\'s own name, in other settings', () => {
        const fantasy = [{ id: 'g', name: 'The Silver Wardens' }, { id: 'h', name: 'The Grey Hands' }];
        expect(rivalAtWork({ texts: ['Word came that the Grey Hands are robbing the temple tonight.'], factions: fantasy, relations: [{ from: 'g', to: 'h', kind: 'sworn enemies' }], mine: ['g'] })?.who).toBe('The Grey Hands');
        const scifi = [{ id: 'n', name: 'Navy' }, { id: 'p', name: 'Red Comet Corsairs' }];
        expect(rivalAtWork({ texts: ['The Red Comet Corsairs are boarding the Halcyon - a hijacking in progress.'], factions: scifi, relations: [{ from: 'p', to: 'n', kind: 'hunted by' }], mine: ['n'] })?.who).toBe('Red Comet Corsairs');
    });

    it('not without a job, a quarrel with the player\'s side, or a side of their own', () => {
        expect(rivalAtWork({ texts: ['Enrique smiled at the gala.'], factions, relations, mine: ['f_wc'], members })).toBeNull();
        expect(rivalAtWork({ texts: ['Omicron Innovations is planning a raid.'], factions, relations, mine: ['f_wc'], members })).toBeNull();
        expect(rivalAtWork({ texts: ['White Cerberus planned the heist.'], factions, relations, mine: ['f_wc'], members })).toBeNull();
        expect(rivalAtWork({ texts: ['Enrique\'s heist is on.'], factions, relations, mine: [], members })).toBeNull();
    });
});

describe('a crew that does not know who is there', () => {
    const op = startOp({ ...readOpPlan('AIM: the Ashen Codex\nCREW: Marta Quell | safecracker | vault\nSTEP: crack the vault\nSTEP: get away', 'Medina Syndicate'), against: 'Cyril and White Cerberus' }, 10, 'op1');
    it('sets no trap for them - the director and the narrator are told', () => {
        expect(opFacts(op)).toMatch(/no trap, no ambush, no one lying in wait/);
        expect(opGuidance(op)).toMatch(/not waiting for them - no trap, no ambush/);
    });
    it('a trick staged as an accident is taken for one', () => {
        expect(opFacts(op)).toMatch(/made to look like an accident or a malfunction is taken for one/);
        expect(opFacts(op)).not.toMatch(/feed goes dead/);
    });
    it('once spotted, the narrator is no longer told so', () => {
        const spotted = afterBriefing(op, { report: { status: 'spotted' } }, 10);
        expect(opGuidance(spotted)).not.toMatch(/no trap/);
    });
});

describe('the museum heist as it really went', () => {
    // No faction-level tie: only Enrique as Cyril's rival. The chat says
    // "Enrique's operatives"; the heist is in the director's own briefing.
    const people = new Map([['f_med', [{ id: 'enr', name: 'Enrique Medina' }, { id: 'dt', name: 'Delvin "Ice" Timmers' }]], ['f_wc', [{ id: 'inji', name: 'Inji Miyama' }]]]);
    const ties = [{ from: 'enr', to: 'cyril', kind: 'rival' }];
    const briefing = "Inji's mind is set on completing their objective: disrupting Enrique's art heist. He trusts his partner and leader.\n\nAs Cyril reports difficulties with counting the opposition, Inji presses on.";
    const chat = ['Cyril shifted back. "I\'m having trouble getting a count."', '"I count five, maybe six," he whispered. "Looks like they\'re headed straight for the Vault. We need to be ready to engage before they breach it."'];
    it('finds the Medina Syndicate from a personal rivalry and the briefing', () => {
        expect(rivalAtWork({ texts: [briefing, ...chat], factions, relations: ties, mine: ['f_wc'], playerId: 'cyril', members: people }))
            .toEqual({ who: 'Medina Syndicate', what: "Inji's mind is set on completing their objective: disrupting Enrique's art heist." });
    });
    it('not from a passage that names no one of theirs', () => {
        expect(rivalAtWork({ texts: chat, factions, relations: ties, mine: ['f_wc'], playerId: 'cyril', members: people })).toBeNull();
    });
    it('a player with no faction still has rivals of their own', () => {
        expect(rivalAtWork({ texts: [briefing], factions, relations: ties, mine: [], playerId: 'cyril', members: people })?.who).toBe('Medina Syndicate');
    });
});
