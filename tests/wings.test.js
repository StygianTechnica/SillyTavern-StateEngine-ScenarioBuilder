// Wings: factions inside a faction, any number, any depth - and the jobs
// they crew. A combat department does not bring the research department
// on a raid, unless it needs one of their specialists, guarded.
import { parentOf, wingsOf, allWingsOf, ancestorsOf, wingOfPerson, sameWing, markOtherWings } from '../src/library/wings.js';
import { libraryMemberships } from '../src/library/faction-sync.js';
import { readOpPlan, shapePlan, buildOpPrompt } from '../src/ops/generate.js';

const tie = (from, to) => ({ id: `${from}-${to}`, from, to, kind: 'part of' });

describe('wings of a faction', () => {
    // Omicron Innovations: three divisions, one with a cell inside it.
    const relations = [tie('combat', 'omicron'), tie('research', 'omicron'), tie('legal', 'omicron'), tie('blackops', 'combat'),
        { id: 'x', from: 'research', to: 'combat', kind: 'rival' }];
    const ids = new Set(['omicron', 'combat', 'research', 'legal', 'blackops']);
    it('has any number of wings, at any depth', () => {
        expect(wingsOf('omicron', relations, ids)).toEqual(['combat', 'research', 'legal']);
        expect(allWingsOf('omicron', relations, ids)).toEqual(['combat', 'research', 'legal', 'blackops']);
        expect(parentOf('blackops', relations, ids)).toBe('combat');
        expect(ancestorsOf('blackops', relations, ids)).toEqual(['combat', 'omicron']);
    });
    it('cuts a loop in the ties', () => {
        const loop = [tie('a', 'b'), tie('b', 'a')];
        expect(allWingsOf('a', loop)).toEqual(['b']);
        expect(ancestorsOf('a', loop)).toEqual(['b']);
    });
    it('a wing\'s people are of the whole', () => {
        const factions = ['omicron', 'combat', 'research', 'legal', 'blackops'].map((id) => ({ id }));
        const m = libraryMemberships(factions, [...relations, { from: 'kade', to: 'blackops', kind: 'member of' }]);
        expect(m.get('kade').sort()).toEqual(['blackops', 'combat', 'omicron']);
        expect(wingOfPerson('kade', 'omicron', m, relations, ids)).toBe('blackops');
    });
    it('a job of a wing takes its own sub-wings, not its sister wings', () => {
        expect(sameWing('blackops', 'combat', relations, ids)).toBe(true);
        expect(sameWing('research', 'combat', relations, ids)).toBe(false);
        expect(sameWing('', 'combat', relations, ids)).toBe(false);
        expect(sameWing('combat', '', relations, ids)).toBe(false);
    });
});

describe('a combat division raid', () => {
    const people = [
        { name: 'Director Halvorsen', head: true },
        { name: 'Captain Rhee', wing: 'combat', wingName: 'Combat Division', tied: true },
        { name: 'Sergeant Okafor', wing: 'combat', wingName: 'Combat Division' },
        { name: 'Dr. Lisbeth Varga', wing: 'research', wingName: 'Research Division' },
        { name: 'Dr. Amon Teague', wing: 'research', wingName: 'Research Division' },
    ];
    const marked = markOtherWings(people, { sideName: 'Omicron Innovations' });
    it('is crewed from the combat division', () => {
        expect(marked.ownerWing).toBe('combat');
        expect(marked.people.filter((p) => p.otherWing).map((p) => p.name)).toEqual(['Director Halvorsen', 'Dr. Lisbeth Varga', 'Dr. Amon Teague']);
    });
    const plan = readOpPlan(`ORDERED BY: Captain Rhee | at the tower
LEADER: Dr. Amon Teague | at the lab door
AIM: Recover the stolen prototype
CREW: Sergeant Okafor | breaching | front door
CREW: Dr. Lisbeth Varga | prototype handling | inside the lab
CREW: Dr. Amon Teague | | rear
STEP: Okafor breaches the front door
STEP: Varga safely powers down the prototype
STEP: Teague carries crates
STEP: Drive off in the van`, 'Omicron Innovations');
    const shaped = shapePlan(plan, { people: marked.people });
    it('brings a research specialist the job needs - guarded - and not one to make up the numbers', () => {
        expect(shaped.crew.map((c) => [c.name, c.post])).toEqual([['Sergeant Okafor', 'front door'], ['Dr. Lisbeth Varga', 'inside the lab; guarded by the crew']]);
        expect(shaped.steps[2].text).toBe('One of the crew carries crates');
    });
    it('never has the research division lead it', () => {
        expect(shaped.leader.name).toBe('Sergeant Okafor');
    });
    it('tells the model how parts of a side work', () => {
        const { user } = buildOpPrompt({ side: { name: 'Omicron Innovations' }, people: marked.people });
        expect(user).toMatch(/Dr\. Lisbeth Varga \(of Research Division; another part of the side/);
        expect(user).toMatch(/A job is crewed from the part whose job it is/);
    });
});

describe('a crime family\'s wings', () => {
    // Enrique's museum job: a Moriarty man is not on it.
    const people = [
        { name: 'Serlos Medina', head: true },
        { name: 'Enrique Medina', tied: true, away: 'later' },
        { name: 'Randrés Moriarty', wing: 'mor', wingName: 'Moriarty Family', head: true },
        { name: 'Nichiro Fukudo', wing: 'mor', wingName: 'Moriarty Family' },
        { name: 'Delvin Timmers' },
    ];
    const marked = markOtherWings(people, { sideName: 'Medina Syndicate' });
    it('crews it from the core, where Enrique stands', () => {
        expect(marked.people.find((p) => p.name === 'Nichiro Fukudo').otherWing).toBe('Moriarty Family');
        expect(marked.people.find((p) => p.name === 'Delvin Timmers').otherWing).toBeUndefined();
    });
    it('does not draft him from a step that names him', () => {
        const shaped = shapePlan({ ...readOpPlan('LEADER: Delvin Timmers | inside\nAIM: relics\nSTEP: Nichiro watches the hall\nSTEP: Grab the relics\nSTEP: Leave on foot', 'Medina Syndicate') }, { people: marked.people });
        expect(shaped.crew.map((c) => c.name)).toEqual([]);
        expect(shaped.steps[0].text).toBe('One of the crew watches the hall');
    });
});

describe('Enrique heading a wing of his own', () => {
    const people = [
        { name: 'Serlos Medina', head: true, tied: true },
        { name: 'Enrique Medina', wing: 'enr', wingName: "Enrique's Crew", head: true, wingHead: true, tied: true },
        { name: 'Delvin Timmers', wing: 'enr', wingName: "Enrique's Crew" },
        { name: 'Marco Vane', wing: '', wingName: '' },
        { name: 'Nichiro Fukudo', wing: 'mor', wingName: 'Moriarty Family' },
    ];
    it('owns the job - crewed from his wing, not Serlos\'s core or the Moriarty family', () => {
        const marked = markOtherWings(people, { sideName: 'Medina Syndicate' });
        expect(marked.ownerWing).toBe('enr');
        expect(marked.people.filter((p) => p.otherWing).map((p) => [p.name, p.otherWing])).toEqual([['Marco Vane', 'the core of Medina Syndicate'], ['Nichiro Fukudo', 'Moriarty Family']]);
    });
});

describe('a knightly order\'s chapters, with no one tied to the job', () => {
    it('marks no one - any chapter may serve', () => {
        const people = [{ name: 'Ser Aldric', wing: 'ash', wingName: 'Chapter of Ash' }, { name: 'Dame Wren', wing: 'thorn', wingName: 'Chapter of Thorns' }];
        const marked = markOtherWings(people, { sideName: 'Order of the Lantern' });
        expect(marked.ownerWing).toBe('');
        expect(marked.people.some((p) => p.otherWing)).toBe(false);
    });
});
