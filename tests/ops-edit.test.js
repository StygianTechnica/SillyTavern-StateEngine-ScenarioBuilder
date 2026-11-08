// Changing the other side's plan, and who leads it.
import { startOp, afterBriefing, reviseOp } from '../src/ops/model.js';
import { readOpPlan, opPlanText, tiedFirst, buildOpPrompt } from '../src/ops/generate.js';

const PLAN = `LEADER: Serlos Medina | in the van
AIM: Steal the Ashen Codex
CREW: Marta Quell | safecracker | vault
CREW: Delvin Timmers | drones | roof
STEP: Kill the cameras | done
STEP: Crack the vault
STEP: Get away
BREAK: 2`;

describe('editing a running plan', () => {
    const running = () => afterBriefing(startOp(readOpPlan(PLAN, 'Medina Syndicate'), 10, 'op1'), { fighters: [{ name: 'Marta Quell', condition: 'down' }] }, 10);

    it('a new leader, with the crew\'s states and the step under way kept', () => {
        const op = running();
        const text = opPlanText(op).replace('LEADER: Serlos Medina | in the van', 'LEADER: Enrique Medina | at the loading dock');
        const next = reviseOp(op, readOpPlan(text, op.side), 11);
        expect(next.leader).toEqual({ name: 'Enrique Medina', where: 'at the loading dock', objectId: '' });
        expect(next.crew.map((c) => [c.name, c.state])).toEqual([['Marta Quell', 'down'], ['Delvin Timmers', 'active']]);
        expect([next.current, next.steps[next.current].text, next.stepTurn]).toEqual([op.current, 'Crack the vault', op.stepTurn]);
        expect(next.status).toBe('running');
        expect(next.log.at(-1).text).toBe('The user changed the plan.');
    });

    it('a step marked done moves it on; a new crew member starts active', () => {
        const op = running();
        const text = `${opPlanText(op).replace('STEP: Crack the vault', 'STEP: Crack the vault | done')}\nCREW: Bo Rask | driver | the van`;
        const next = reviseOp(op, readOpPlan(text, op.side), 12);
        expect(next.steps[next.current].text).toBe('Get away');
        expect(next.stepTurn).toBe(12);
        expect(next.crew.find((c) => c.name === 'Bo Rask').state).toBe('active');
    });
});

describe('who leads it', () => {
    const people = [
        { name: 'Serlos Medina', rank: 'Patriarch', head: true },
        { name: 'Enrique Medina', rank: 'Power Brokers, Third in command' },
        { name: 'Delvin Timmers', aliases: ['Ice'] },
    ];
    it('whoever the story ties to the job comes first, not the head', () => {
        const out = tiedFirst(people, "Their mission: disrupting Enrique's art heist.");
        expect(out.map((p) => [p.name, p.tied])).toEqual([['Enrique Medina', true], ['Serlos Medina', false], ['Delvin Timmers', false]]);
        const { user } = buildOpPrompt({ side: { name: 'Medina Syndicate' }, people: out });
        expect(user).toMatch(/- Enrique Medina \(Power Brokers, Third in command; named in the story with this job\)/);
        expect(user).toMatch(/- Serlos Medina \(Patriarch; the head of it all - rarely on a job in person\)/);
        expect(user).toMatch(/Enrique Medina is named in the story with this job: they ordered it or lead it/);
    });
    it('a shared family name ties no one; a nickname does', () => {
        expect(tiedFirst(people, 'The Medina crew moves in.').some((p) => p.tied)).toBe(false);
        expect(tiedFirst(people, 'Ice runs the drones.')[0].name).toBe('Delvin Timmers');
    });
    it('in other settings too', () => {
        const guild = [{ name: 'Mother Ashe', rank: 'Guildmistress', head: true }, { name: 'Corvin Tull', rank: 'Second' }];
        expect(tiedFirst(guild, 'Corvin plans to rob the temple at moonrise.')[0].name).toBe('Corvin Tull');
        const { user } = buildOpPrompt({ side: { name: 'The Grey Hands' }, people: tiedFirst(guild, 'nothing') });
        expect(user).not.toMatch(/named in the story with this job:/);
    });
});
