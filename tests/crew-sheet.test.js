// Tadam Chi, on Enrique's crew, came out of the fill loyal to White Cerberus.
import { crewJobOf, isJobNote } from '../src/ops/model.js';

describe('a description that is only the job', () => {
    it('the lines a job makes its people with', () => {
        expect(isJobNote("One of Enrique's Posse's crew on Amparna Tiangguan's job at Museum corridors, answering to Jiang Ead. One of Amparna Tiangguan's own people, not anyone else's in Enrique's Posse.")).toBe(true);
        expect(isJobNote('Of Omicron Innovations; runs Raquelo Arnett\'s job at Museum corridors on site: Steal the prototype. A trusted lieutenant of Raquelo Arnett\'s')).toBe(true);
        expect(isJobNote('Of Omicron Innovations; ordered the operation at the museum and keeps well away from it.')).toBe(true);
        expect(isJobNote("Safecracker, of The Pale Choir's crew on the job at the crypt.")).toBe(true);
    });
    it('not a real description', () => {
        expect(isJobNote('Yiranza is a wiry woman in her thirties with a shaved head and a burn along one arm.')).toBe(false);
        expect(isJobNote("Born of the Pale Choir's crew on the northern ships, she never learned to swim.")).toBe(false);
        expect(isJobNote('')).toBe(false);
        expect(isJobNote(undefined)).toBe(false);
    });
});

const job = {
    side: 'Medina Syndicate', sideId: 'f1', placeName: "Saint Aora's Museum", against: 'Cyril and White Cerberus',
    boss: { name: 'Enrique Medina' }, leader: { name: 'Delvin "Ice" Timmers' }, crew: [{ name: 'Tadam Chi' }, { name: 'Nichiro Fukudo' }],
};

describe('a sheet written for someone on a job', () => {
    it('holds them to the crew they are on', () => {
        const got = crewJobOf([job], 'Tadam Chi');
        expect(got).toMatchObject({ side: 'Medina Syndicate', sideId: 'f1' });
        expect(got.brief).toContain("one of Medina Syndicate's people, on Enrique Medina's job at Saint Aora's Museum, answering to Delvin \"Ice\" Timmers");
        expect(got.brief).toContain('against Cyril and White Cerberus and were never one of them');
    });
    it('the leader answers to no one here', () => {
        expect(crewJobOf([job], 'Delvin "Ice" Timmers').brief).not.toContain('answering to');
    });
    it('the newest job they are on', () => {
        const later = { ...job, side: 'The Quiet Hand', sideId: 'f2' };
        expect(crewJobOf([job, later, null], 'Tadam Chi').side).toBe('The Quiet Hand');
    });
    it('no one who is not on one', () => {
        expect(crewJobOf([job], 'Zane')).toBeNull();
        expect(crewJobOf([], 'Tadam Chi')).toBeNull();
    });
    it('across genres, and with no boss or place', () => {
        const raid = { side: 'The Pale Choir', leader: { name: 'Morvath' }, crew: [{ name: 'Sister Ilse' }] };
        expect(crewJobOf([raid], 'Sister Ilse').brief).toContain("one of The Pale Choir's people, on its job at the scene, answering to Morvath.");
        const boarding = { side: 'Ceres Salvagers', leader: { name: 'Oren' }, crew: [{ name: 'Dak' }], against: 'Vance' };
        expect(crewJobOf([boarding], 'Dak').brief).toContain('against Vance');
    });
});
