// How a person's full name is put together in each naming tradition
// (docs/DESIGN - NAMING.md, section 3.5): patronymics and their genitives,
// a surname's feminine form, the order of the parts.

// Icelandic: the father's name in the genitive. Jón -> Jóns, Ólafur ->
// Ólafs, Sigurður -> Sigurðar, Helgi -> Helga, Þorsteinn -> Þorsteins.
const IS_KEEP_UR = new Set(['pétur', 'baldur', 'arthúr', 'ívar']);
export function icelandicGenitive(name) {
    const n = String(name);
    const lower = n.toLowerCase();
    if (IS_KEEP_UR.has(lower)) return `${n}s`;
    if (/ður$/.test(lower) || /mundur$/.test(lower)) return `${n.slice(0, -2)}ar`;
    if (/ur$/.test(lower)) return `${n.slice(0, -2)}s`;
    if (/nn$/.test(lower) || /ll$/.test(lower)) return `${n.slice(0, -1)}s`;
    if (/ir$/.test(lower)) return `${n.slice(0, -1)}s`;
    if (/[ia]$/.test(lower)) return `${n.slice(0, -1)}a`;
    // Magnús: Magnússon, Magnúsdóttir.
    if (/s$/.test(lower)) return n;
    return `${n}s`;
}

export function icelandicPatronym(father, gender) {
    const gen = icelandicGenitive(father);
    if (gender === 'f') return `${gen}dóttir`;
    return `${gen}son`;
}

// Russian (and Ukrainian) patronymics: Pyotr -> Petrovich / Petrovna,
// Sergey -> Sergeyevich, Nikita -> Nikitich, Ilya -> Ilyich.
export function russianPatronymic(father, gender, suffix = null) {
    const n = String(father);
    const [mEnd, mSoft] = suffix?.m ?? ['ovich', 'yevich'];
    const [fEnd, fSoft] = suffix?.f ?? ['ovna', 'yevna'];
    if (/ya$/i.test(n)) return gender === 'f' ? `${n.slice(0, -1)}inichna` : `${n.slice(0, -1)}ich`;
    if (/a$/i.test(n)) return gender === 'f' ? `${n.slice(0, -1)}ichna` : `${n.slice(0, -1)}ich`;
    if (/[yi]$/i.test(n)) return `${n.slice(0, -1)}${gender === 'f' ? fSoft : mSoft}`;
    // Ukrainian Petro -> Petrovych / Petrivna.
    if (suffix && /o$/i.test(n)) return `${n.slice(0, -1)}${gender === 'f' ? fEnd : mEnd}`;
    if (/yo/i.test(n) && /r$/i.test(n)) return `${n.replace(/yo/i, 'e')}${gender === 'f' ? fEnd : mEnd}`;
    return `${n}${gender === 'f' ? fEnd : mEnd}`;
}

// A surname's feminine form, where the language has one.
export function feminineSurname(family, convention) {
    const f = String(family);
    if (convention === 'russian') {
        if (/(ov|ev|ёв|yov|in|yn)$/i.test(f)) return `${f}a`;
        if (/sky$/i.test(f)) return `${f.slice(0, -1)}aya`;
        if (/skyi$/i.test(f)) return `${f.slice(0, -3)}ka`;
        if (/oy$/i.test(f)) return `${f.slice(0, -2)}aya`;
        return f;
    }
    if (convention === 'slavic') {
        if (/(ski|cki|dzki)$/i.test(f)) return `${f.slice(0, -1)}a`;
        return f;
    }
    if (convention === 'byzantine') {
        if (/enos$/i.test(f)) return `${f.slice(0, -2)}e`;
        if (/as$/i.test(f)) return `${f.slice(0, -2)}aina`;
        if (/[oi]s$/i.test(f)) return `${f.slice(0, -2)}ina`;
        return f;
    }
    if (convention === 'roman') return f.replace(/us$/i, 'a');
    return f;
}

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '').replace(/\s+/g, ' ').trim();

// A person's name in a tradition. parts: { given, family, family2, father,
// prefix, byname, praenomen, middle } - whatever the tradition uses; missing
// parts are left out. -> { name, aliases }
export function composePerson(convention, gender, parts, { patronym = null, patronymSuffix = null, era = '' } = {}) {
    const { given = '', family = '', family2 = '', father = '', prefix = '', byname = '', praenomen = '', middle = '' } = parts;
    const fam = [prefix, family].filter(Boolean).join(' ');
    switch (convention) {
        case 'icelandic':
            return { name: father ? `${given} ${icelandicPatronym(father, gender)}` : given, aliases: [] };
        case 'patronym': {
            const t = patronym?.[gender === 'f' ? 'f' : 'm'] ?? '{given}, child of {father}';
            if (!father) return { name: byname ? `${given} ${byname}` : given, aliases: [] };
            // "{father}sson" is a surname on its own; "{given} ap {father}" is the whole name.
            const whole = t.includes('{given}') ? fill(t, { given, father }) : `${given} ${fill(t, { father })}`;
            return { name: whole, aliases: byname ? [`${given} ${byname}`] : [] };
        }
        case 'russian': {
            const pat = father ? russianPatronymic(father, gender, patronymSuffix) : '';
            const surname = family ? (gender === 'f' ? feminineSurname(family, 'russian') : family) : '';
            return { name: [given, surname].filter(Boolean).join(' '), aliases: pat ? [`${given} ${pat}`, [given, pat, surname].filter(Boolean).join(' ')] : [] };
        }
        case 'slavic':
            return { name: [given, gender === 'f' ? feminineSurname(family, 'slavic') : family].filter(Boolean).join(' '), aliases: [] };
        case 'spanish':
            return { name: [given, fam, family2 && family2 !== family ? family2 : ''].filter(Boolean).join(' '), aliases: family ? [`${given} ${fam}`] : [] };
        case 'portuguese':
            // Mother's surname first, father's last - and known by the last.
            return { name: [given, family2 && family2 !== family ? family2 : '', fam].filter(Boolean).join(' '), aliases: family ? [`${given} ${fam}`] : [] };
        case 'family_first':
            return { name: [family, given].filter(Boolean).join(' '), aliases: [] };
        case 'vietnamese':
            return { name: [family, middle, given].filter(Boolean).join(' '), aliases: [] };
        case 'tamil':
            return { name: [given, father].filter(Boolean).join(' '), aliases: father ? [`${father[0]}. ${given}`] : [] };
        case 'roman': {
            if (gender === 'f') return { name: [feminineSurname(family, 'roman'), byname ? feminineSurname(byname, 'roman') : ''].filter(Boolean).join(' '), aliases: [] };
            return { name: [praenomen, family, byname].filter(Boolean).join(' '), aliases: byname ? [byname] : [] };
        }
        case 'greek':
            return { name: given, aliases: father ? [`${given}, ${gender === 'f' ? 'daughter' : 'son'} of ${father}`] : [] };
        case 'byzantine':
            return { name: [given, gender === 'f' ? feminineSurname(family, 'byzantine') : family].filter(Boolean).join(' '), aliases: [] };
        case 'arabic': {
            if (era === 'modern') return { name: [given, father, family].filter(Boolean).join(' '), aliases: [] };
            const nasab = father ? `${gender === 'f' ? 'bint' : 'ibn'} ${father}` : '';
            return { name: [given, nasab, byname].filter(Boolean).join(' '), aliases: byname ? [`${given} ${byname}`] : [] };
        }
        case 'single':
            return { name: byname ? `${given} ${byname}` : given, aliases: byname ? [given] : [] };
        default:
            return { name: [given, fam].filter(Boolean).join(' '), aliases: [] };
    }
}

// Which parts a tradition needs rolled.
export function partsNeeded(convention, era = '') {
    switch (convention) {
        case 'icelandic': case 'patronym': case 'greek': case 'tamil': return ['given', 'father'];
        case 'russian': return ['given', 'father', 'family'];
        case 'spanish': case 'portuguese': return ['given', 'family', 'family2'];
        case 'roman': return ['praenomen', 'family', 'byname'];
        case 'arabic': return era === 'modern' ? ['given', 'father', 'family'] : ['given', 'father', 'byname?'];
        case 'single': return ['given', 'byname?'];
        case 'vietnamese': return ['family', 'middle', 'given'];
        default: return ['given', 'family'];
    }
}
