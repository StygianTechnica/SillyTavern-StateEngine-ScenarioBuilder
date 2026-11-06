// "They went all together, without Doc and Galice to the art museum": Doc
// and Galice were taken along, and Inji and Zane left behind.
import { leftOut, namedGoing, goesTogether } from '../src/director/going-along.js';

const people = [{ id: 'z', names: ['Zane'] }, { id: 'i', names: ['Inji Miyama', 'Inji'] }, { id: 'd', names: ['Doc'] }, { id: 'g', names: ['Galice Buckar', 'Galice'] }];
const post = 'They continued to the vehicle Zane had mentioned before.  They went all together, without Doc and Galice to the art museum.';

describe('those the post leaves out', () => {
    it('never go, however the going reads', () => {
        expect(leftOut(post, people).sort()).toEqual(['d', 'g']);
        expect(namedGoing(post, people)).not.toContain('d');
        expect(namedGoing('Inji, Doc and Zane went to the museum, without Doc after all.', people).sort()).toEqual(['i', 'z']);
        expect(goesTogether(post)).toBe(true);
    });
    it('across genres', () => {
        const party = [{ id: 'b', names: ['Ser Brannoc', 'Brannoc'] }, { id: 'm', names: ['Maelis'] }, { id: 't', names: ['Tam'] }];
        expect(leftOut('We rode out at dawn, leaving Maelis behind at the keep.', party)).toEqual(['m']);
        expect(leftOut('Everyone but not Tam climbed aboard the shuttle.', party)).toEqual(['t']);
        expect(leftOut('Brannoc and Tam followed him to the pass.', party)).toEqual([]);
    });
});
