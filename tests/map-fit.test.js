// The map opens on its places: every one in view, centred - even when they
// lie far to the left of the origin.
import { fitView } from '../src/ui/map-model.js';

const onScreen = (v, x, y) => ({ x: x * v.k + v.tx, y: y * v.k + v.ty });

describe('fitting the map to its places', () => {
    it('centres places far from the origin', () => {
        const b = { x: -2400, y: -300, width: 600, height: 400 };
        const v = fitView({ width: 1000, height: 600 }, b);
        const centre = onScreen(v, b.x + b.width / 2, b.y + b.height / 2);
        expect(centre.x).toBeCloseTo(500);
        expect(centre.y).toBeCloseTo(300);
        const left = onScreen(v, b.x, b.y);
        const right = onScreen(v, b.x + b.width, b.y + b.height);
        expect(left.x).toBeGreaterThanOrEqual(0);
        expect(right.x).toBeLessThanOrEqual(1000);
    });

    it('keeps the zoom within bounds for one place or many', () => {
        expect(fitView({ width: 1000, height: 600 }, { x: 0, y: 0, width: 50, height: 50 }).k).toBe(1.6);
        expect(fitView({ width: 1000, height: 600 }, { x: 0, y: 0, width: 50000, height: 50000 }).k).toBe(0.25);
    });
});
