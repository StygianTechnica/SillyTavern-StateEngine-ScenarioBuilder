// What Archivist filed as goals and plans, and Assassins Inc rejected by hand.
import { notAQuest } from '../src/quests/model.js';

const no = (title, text = '', more = {}) => expect(notAQuest({ title, text, ...more })).toBe(true);
const yes = (title, text = '', more = {}) => expect(notAQuest({ title, text, ...more })).toBe(false);

describe('plainly no quest', () => {
    it('a conversation to have', () => {
        no('Discuss Alliance Terms with Vex', 'Discuss alliance terms and consider the offer.');
        no('Contact Zane for Cookout Details', 'Reach out to Zane for cookout details.');
        no("Address Zane's Concerns", 'Talk to Zane about his concerns.');
        no("Talk more about Cyril's desires and tastes");
        no("Embrace Vex's Games");
    });
    it('a night in', () => {
        no('Find Private Location for Intimacy', 'Explore options away from prying eyes.');
        no('Unforgettable Night with Inji', 'Inji and Cyril have a passionate encounter.');
        no('Chemistry and Flirting during Cookout Invitation', 'Their conversation turned flirtatious.');
        no("Join Inji and Vex's Wild Dance", 'Flirt with Zane.');
    });
    it('getting used to things', () => {
        no('Adapt to the New Environment', "Cyril's mind reels as he navigates the streets.");
        no('Gear Up and Practice at the Target Range', 'Cyril decides to suit up.');
    });
    it('something that happened or is so', () => {
        no('Extraction Successful', 'Extract an asset undetected.');
        no("Cyril's Arrival Surprises Delvin 'Ice' Timmers", "Delvin 'Ice' Timmers is a suave and confident thief.");
        no('Cyril is considering using a fake memory to scare Bartin');
    });
    it('a passage of the story, with nothing to do', () => {
        no("Zane's Cooking Style", 'Galice mentioned Zane has an interesting cooking style.');
        no("Cyril's Threat to Delvin and Nichiro", 'Cyril threatened to put Delvin and Nichiro on ice.');
        no("Cyril's Adaptability Challenges", 'Cyril Moriarty stands in the center of a dimly lit training room.');
        no('The Newcomer', "Delvin 'Ice' Timmers is a suave and confident thief.");
    });
});

describe('real quests get through', () => {
    it('in this story', () => {
        yes("Stop Enrique's Heist", 'Cyril, Inji, and the team discuss their plan to thwart the syndicate.');
        yes('Retrieve a Missing Prototype', 'White Cerberus has received intel that a prototype is hidden.');
        yes("Investigate Omicron Innovations' Activities");
        yes('Infiltrate the Museum', 'Extract the pieces without tripping the alarm.');
        yes("Enrique's Obsession", 'Cyril must evade the relentless pursuit.');
    });
    it('across genres', () => {
        yes('Negotiate passage terms with Niamh', 'The fortress will not open without a price.');
        yes('Rescue the Captured Scouts', 'They are held in the crypt beneath the graveyard.');
        yes('Reach the Ceres Relay', 'The relay must be restarted before the fleet arrives.');
        yes('Find the Missing Heir', 'The duke has offered gold for word of her.');
        yes('Win the Duel at Dawn');
    });
    it('a story passage with a goal or steps of its own', () => {
        yes("Cyril's Debt", 'Cyril recalls the deal he made.', { goal: 'Pay Bartin back before the week is out' });
        yes("Cyril's Debt", 'Cyril recalls the deal he made.', { steps: [{ text: 'Raise the money' }] });
    });
    it('one already made a quest', () => {
        yes('Discuss Terms', '', { entity: { type: 'quest' } });
    });
});
