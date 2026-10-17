// The sheet's Image tab: the entry's picture, and two ways to get one -
//   1. bring your own: upload, paste (Ctrl+V or the Paste button), drop a
//      file, or give a URL - with a prompt written for the generator you
//      use (Midjourney first, src/images/prompt.js) to copy out;
//   2. ask SillyTavern's Image Generation extension, when it is enabled.
// Scenario Builder makes no images itself.

import { LOG_PREFIX } from '../constants.js';
import { getSettings, saveSettings } from '../settings.js';
import { updateEntry } from '../library/library.js';
import { buildImagePrompt, PROVIDERS, STYLES, MJ_VERSIONS } from '../images/prompt.js';
import { importImage, safeImageSrc, readClipboardImage, hasImageGenerator, generateWithImageGenerator } from '../images/attach.js';
import { ws, rerender } from './ws.js';
import { h, icon, button, select, field, toast } from './dom.js';

async function setImage(entry, image) {
    const { chatId, settingId } = ws.ctx;
    const updated = await updateEntry(chatId, settingId, entry.id, { image });
    if (!updated) throw new Error('State Engine refused the change');
    rerender();
}

async function useFile(entry, file) {
    try {
        const path = await importImage(file);
        await setImage(entry, path);
        toast('success', 'Image added.');
    } catch (err) {
        console.warn(LOG_PREFIX, 'image import failed', err);
        toast('error', `Could not add the image: ${err?.message ?? err}`);
    }
}

export function renderImagePanel({ type, entry, narrative, environment, overview }) {
    const settings = getSettings();
    const opts = settings.imagePrompts;
    const src = safeImageSrc(entry.image);

    // ---- the picture
    const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/bmp', hidden: true, onchange: (e) => e.target.files?.[0] && void useFile(entry, e.target.files[0]) });
    const urlInput = h('input', { class: 'text_pole', type: 'url', placeholder: 'https://… image address' });
    const stage = h('div', {
        class: `sb-stage${src ? '' : ' sb-stage-empty'}`,
        tabindex: '0',
        title: 'Drop an image here, or click and paste (Ctrl+V)',
        style: `--sb-accent: ${type.color}`,
        ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('sb-drop'); },
        ondragleave: (e) => e.currentTarget.classList.remove('sb-drop'),
        ondrop: (e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('sb-drop');
            const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
            if (file) void useFile(entry, file);
        },
        onpaste: (e) => {
            const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
            if (file) { e.preventDefault(); void useFile(entry, file); return; }
            const text = e.clipboardData?.getData('text/plain')?.trim();
            if (/^https?:\/\/\S+$/i.test(text ?? '')) { e.preventDefault(); void setImage(entry, text).catch((err) => toast('error', err.message)); }
        },
    }, src ? h('img', { src, alt: entry.name }) : h('div', { class: 'sb-stage-hint' }, h('i', { class: `fa-solid ${type.icon}` }), h('span', {}, 'Drop, paste or upload a picture')));

    const generator = hasImageGenerator();
    const pictureCol = h('div', { class: 'sb-image-col' },
        stage,
        h('div', { class: 'sb-actions' },
            button('Upload', () => fileInput.click(), { iconName: 'fa-upload' }),
            button('Paste', async () => {
                try {
                    const got = await readClipboardImage();
                    if (got?.file) await useFile(entry, got.file);
                    else if (got?.url) await setImage(entry, got.url);
                    else toast('info', 'No image on the clipboard. You can also click the picture area and press Ctrl+V.');
                } catch (err) {
                    toast('info', 'The browser did not allow reading the clipboard - click the picture area and press Ctrl+V instead.');
                }
            }, { iconName: 'fa-paste' }),
            src ? button('Remove', () => void setImage(entry, '').catch((err) => toast('error', err.message)), { iconName: 'fa-trash', cls: 'sb-danger' }) : null,
            fileInput),
        h('div', { class: 'sb-row' }, urlInput, button('Use URL', () => {
            const url = urlInput.value.trim();
            if (!/^https?:\/\/\S+$/i.test(url)) return toast('warning', 'That does not look like an image address.');
            void setImage(entry, url).catch((err) => toast('error', err.message));
        }, { iconName: 'fa-link' })),
        h('div', { class: 'sb-card sb-generator' },
            h('div', { class: 'sb-card-title' }, icon('fa-wand-magic-sparkles'), ' Image Generation extension'),
            generator
                ? [h('small', { class: 'sb-hint' }, 'Sends a Stable Diffusion-style version of the prompt to SillyTavern\'s Image Generation extension, quietly, and uses the picture it returns.'),
                    button('Generate', async (e) => {
                        const btn = e.currentTarget;
                        if (btn.dataset.busy) return;
                        btn.dataset.busy = '1';
                        btn.classList.add('sb-busy');
                        try {
                            const { prompt } = buildImagePrompt({ entry, narrative, environment, overview, options: { ...opts, provider: 'stable_diffusion' } });
                            const path = await generateWithImageGenerator(prompt);
                            await setImage(entry, path);
                            toast('success', 'Image generated.');
                        } catch (err) {
                            toast('error', err?.message ?? String(err));
                        } finally {
                            delete btn.dataset.busy;
                            btn.classList.remove('sb-busy');
                        }
                    }, { iconName: 'fa-wand-magic-sparkles' })]
                : h('small', { class: 'sb-hint' }, 'Not enabled. Turn on SillyTavern\'s Image Generation extension to generate from here - or use the prompt with your own generator.')));

    // ---- the prompt
    const promptBox = h('textarea', { class: 'text_pole sb-prompt', rows: 6, spellcheck: 'false' });
    const negativeBox = h('textarea', { class: 'text_pole', rows: 2, spellcheck: 'false' });
    const refresh = () => {
        const result = buildImagePrompt({ entry, narrative, environment, overview, options: opts });
        promptBox.value = result.prompt;
        negativeBox.value = result.negative;
        negativeWrap.hidden = opts.provider !== 'stable_diffusion';
        mjWrap.hidden = opts.provider !== 'midjourney';
    };
    const save = () => { saveSettings(); refresh(); };
    const mj = opts.midjourney;
    const num = (key, min, max) => h('input', {
        class: 'text_pole', type: 'number', min, max, value: mj[key],
        onchange: (e) => { const v = Number(e.target.value); mj[key] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : mj[key]; save(); },
    });
    const text = (obj, key, placeholder) => h('input', { class: 'text_pole', value: obj[key] ?? '', placeholder, onchange: (e) => { obj[key] = e.target.value; save(); } });

    const mjWrap = h('details', { class: 'sb-mj' },
        h('summary', {}, 'Midjourney parameters'),
        h('div', { class: 'sb-fieldgrid' },
            field('Version', select(MJ_VERSIONS.map((v) => ({ value: v, label: v.startsWith('niji') ? `Niji ${v.slice(5)}` : `v${v}` })), mj.version, { onchange: (e) => { mj.version = e.target.value; save(); } })),
            field('Stylize', num('stylize', 0, 1000), '0-1000; 100 is the default.'),
            field('Chaos', num('chaos', 0, 100), 'Variety between the four images.'),
            field('Avoid (--no)', text(mj, 'no', 'text, watermark')),
            field('Style reference (--sref)', text(mj, 'sref', 'image URL or style code')),
            field('Extra parameters', text(mj, 'extra', 'e.g. --q 2 --weird 50'))),
        h('label', { class: 'checkbox_label' }, h('input', { type: 'checkbox', checked: mj.raw, onchange: (e) => { mj.raw = e.target.checked; save(); } }), h('span', {}, '--style raw (less Midjourney flourish)')));
    const negativeWrap = field('Negative prompt', negativeBox);
    negativeBox.addEventListener('change', () => { opts.negative = negativeBox.value; saveSettings(); });

    const promptCol = h('div', { class: 'sb-prompt-col' },
        h('div', { class: 'sb-section-title' }, icon('fa-pen-fancy'), ' Image prompt'),
        h('small', { class: 'sb-hint' }, `Written from ${narrative ? 'the current description' : 'the description'}, the setting's era and tone, and your style. Names are left out unless you include them.`),
        h('div', { class: 'sb-row' },
            field('For', select(PROVIDERS.map((p) => ({ value: p.id, label: p.label })), opts.provider, { onchange: (e) => { opts.provider = e.target.value; save(); } })),
            field('Style', select(STYLES.map((s) => ({ value: s.id, label: s.label })), opts.style, { onchange: (e) => { opts.style = e.target.value; save(); } }))),
        field('Your style words', text(opts, 'customStyle', 'e.g. muted autumn palette, by candlelight')),
        h('label', { class: 'checkbox_label' }, h('input', { type: 'checkbox', checked: opts.includeNames, onchange: (e) => { opts.includeNames = e.target.checked; save(); } }), h('span', {}, 'Include the name')),
        h('label', { class: 'checkbox_label', title: 'Adds what the world\'s magic and technology limits rule out (arcane magic, firearms, cars...) to --no or the negative prompt.' },
            h('input', { type: 'checkbox', checked: opts.respectLimits !== false, onchange: (e) => { opts.respectLimits = e.target.checked; save(); } }), h('span', {}, 'Leave out what the world rules out')),
        mjWrap,
        promptBox,
        negativeWrap,
        h('div', { class: 'sb-actions' },
            button('Copy prompt', async () => {
                try {
                    await navigator.clipboard.writeText(promptBox.value);
                    toast('success', 'Prompt copied.');
                } catch {
                    promptBox.select();
                    toast('info', 'Select-all done - press Ctrl+C to copy.');
                }
            }, { iconName: 'fa-copy', cls: 'sb-primary' }),
            button('Rewrite', refresh, { iconName: 'fa-arrows-rotate', title: 'Rebuild the prompt (undoes your edits to it)' })),
        h('small', { class: 'sb-hint' }, 'Edit the prompt freely before copying. Then paste or upload the picture on the left.'));

    refresh();
    return h('div', { class: 'sb-tabpane sb-image-tab' }, pictureCol, promptCol);
}
