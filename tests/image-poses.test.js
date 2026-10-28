import { describe, it, expect } from 'vitest';
import { buildImagePrompt, poseFamilyOf, poseFor, POSES } from '../src/images/prompt.js';

const anime = { provider: 'midjourney', style: 'anime' };
const person = (id, role, description) => ({ id, type: 'character', name: 'Someone', role, description });

describe('a character is posed by what they do', () => {
    it('reads the pose family from the role, else the first sentence, across genres', () => {
        // Cyberpunk
        expect(poseFamilyOf('Elite Agent')).toBe('shadow');
        expect(poseFamilyOf('netrunner for hire')).toBe('tech');
        expect(poseFamilyOf('Boss of White Cerberus')).toBe('leader');
        // Fantasy
        expect(poseFamilyOf('Knight of the Silver Order')).toBe('fighter');
        expect(poseFamilyOf('Court wizard')).toBe('caster');
        expect(poseFamilyOf('Innkeeper')).toBe('social');
        // Sci-fi
        expect(poseFamilyOf('Admiral of the Ninth Fleet')).toBe('leader');
        expect(poseFamilyOf('', 'A ship\'s engineer with oil-stained hands. She hums while she works.')).toBe('tech');
        // Real world
        expect(poseFamilyOf('NYPD detective')).toBe('fighter');
        expect(poseFamilyOf('Librarian')).toBe('scholar');
        expect(poseFamilyOf('', 'A quiet woman with grey eyes.')).toBe('');
    });

    it('frames the picture with the pose instead of a flat portrait', () => {
        const p = buildImagePrompt({ entry: person('chr_inji', 'Elite Agent', 'Inji is lean and athletic, with close-cropped white hair.'), options: anime }).prompt;
        expect(p).toContain('cinematic shot of an elite agent');
        expect(p).not.toContain('portrait of');
        expect(POSES.find((x) => x.id === 'shadow').poses.some((pose) => p.includes(pose))).toBe(true);
        // A plain portrait when asked for.
        const plain = buildImagePrompt({ entry: person('chr_inji', 'Elite Agent', 'Inji is lean.'), options: { ...anime, pose: 'portrait' } }).prompt;
        expect(plain).toContain('portrait of an elite agent');
        // Anyone else still gets a pose.
        expect(buildImagePrompt({ entry: person('chr_x', '', 'A quiet woman with grey eyes.'), options: anime }).prompt).toContain('cinematic shot of a character');
    });

    it('rolls another pose of the same kind, and keeps magic out of a world without it', () => {
        const e = person('chr_k', 'Knight', 'A tall knight.');
        const poses = new Set([0, 1, 2, 3].map((v) => poseFor(e, { role: 'Knight', variant: v }).pose));
        expect(poses.size).toBe(4);
        expect(poseFor(e, { role: 'Knight' })).toEqual(poseFor(e, { role: 'Knight' }));
        const priest = poseFor(person('chr_p', 'Priestess'), { role: 'Priestess', noMagic: true });
        expect(POSES.find((x) => x.id === 'caster').plain).toContain(priest.pose);
        expect(poseFor(e, { choice: 'leader', role: 'Knight' }).framing).toBe('cinematic shot');
    });
});
