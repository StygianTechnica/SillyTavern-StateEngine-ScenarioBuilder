// A map picture behind a level: its own, or its nearest ancestor's zoomed
// in around where the place lies - all the way down.
import { levelImage, levelKey, placeNewImage, resizeImage, DEFAULT_MAP_ZOOM } from '../src/ui/map-model.js';
import { normalizeSettingDoc } from '../src/store/schema.js';

const world = { src: 'user/images/scenario-builder/alvarand.png', x: -700, y: -500, w: 1400, h: 1000, opacity: 0.6 };
const parents = { loc_fort: 'loc_redhaven', loc_redhaven: null, loc_hall: 'loc_fort' };
const anchors = { loc_redhaven: { x: 100, y: 50 }, loc_fort: { x: -20, y: 10 }, loc_hall: { x: 0, y: 0 } };
const anchorOf = (id) => anchors[id];

describe('the picture a level shows', () => {
    it('is its own when it has one', () => {
        expect(levelImage(null, { images: { world }, parents, anchorOf })).toMatchObject({ ...world, inherited: false, from: null });
    });

    it("is the level above's, zoomed in around the place", () => {
        const img = levelImage('loc_redhaven', { images: { world }, parents, anchorOf });
        const z = DEFAULT_MAP_ZOOM;
        expect(img).toMatchObject({ inherited: true, from: null, zoom: z, x: (-700 - 100) * z, y: (-500 - 50) * z, w: 1400 * z, h: 1000 * z });
        // The place's spot on the world map is the centre (origin) of its level.
        const u = (100 - world.x) / world.w;
        expect(img.x + u * img.w).toBeCloseTo(0);
    });

    it('carries on down, each level with its own zoom', () => {
        const img = levelImage('loc_fort', { images: { world, loc_fort: { zoom: 2 } }, parents, anchorOf });
        expect(img.w).toBe(1400 * DEFAULT_MAP_ZOOM * 2);
    });

    it('stops at a level with a picture of its own', () => {
        const fortMap = { src: 'user/images/fort.png', x: -300, y: -200, w: 600, h: 400, opacity: 0.8 };
        const img = levelImage('loc_hall', { images: { world, loc_fort: fortMap }, parents, anchorOf });
        expect(img).toMatchObject({ inherited: true, from: 'loc_fort', w: 600 * DEFAULT_MAP_ZOOM });
    });

    it('is nothing when no level above has one', () => {
        expect(levelImage('loc_fort', { images: {}, parents, anchorOf })).toBeNull();
        expect(levelKey(null)).toBe('world');
    });
});

describe('placing and sizing a picture', () => {
    it('keeps its shape, centred on the level', () => {
        expect(placeNewImage(2000, 1000)).toEqual({ x: -700, y: -350, w: 1400, h: 700 });
    });

    it('resizes about its centre', () => {
        const r = resizeImage({ x: -100, y: -50, w: 200, h: 100 }, 2);
        expect(r).toMatchObject({ x: -200, y: -100, w: 400, h: 200 });
    });

    it('is stored with the setting, sanely', () => {
        const doc = normalizeSettingDoc({ graph: { images: { world: { src: 'a.png', x: 1, y: 2, w: 3, h: 'x', opacity: 9 }, loc_fort: { zoom: 2 }, junk: { foo: 1 } } } });
        expect(doc.graph.images.world).toEqual({ src: 'a.png', x: 1, y: 2, w: 10, h: 1050, opacity: 1 });
        expect(doc.graph.images.loc_fort).toEqual({ opacity: 0.6, zoom: 2 });
        expect(doc.graph.images.junk).toBeUndefined();
    });
});
