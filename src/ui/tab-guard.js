// One SillyTavern tab at a time. Every tab holds the whole of settings.json
// in memory from when it loaded, and any save writes all of it - so an
// older tab left open (launching SillyTavern opens a fresh one) writes its
// out-of-date copy over the newer tab's work: the clock, the history, a
// rewritten character, all set back. When a newer tab opens, every older
// one is covered by a notice to reload or close it, and saves nothing more.
// The decision is pure (and tested); the rest is the browser's
// BroadcastChannel and a full-page overlay.

const CHANNEL = 'scenario-builder-tabs';

// What a tab does with a message from another tab. me / msg: { id, at }
// (at: when the tab loaded, ms). -> 'stale' (a newer tab has opened: this
// one must stop), 'answer' (an older tab announced itself: tell it a newer
// one is here), or 'ignore'.
export function tabVerdict(me, msg) {
    if (!msg || msg.id === me.id || !Number.isFinite(msg.at)) return 'ignore';
    if (msg.at > me.at || (msg.at === me.at && msg.id > me.id)) return 'stale';
    return 'answer';
}

let stale = false;
// Whether a newer tab has taken over (Scenario Builder saves nothing then).
export function isStaleTab() {
    return stale;
}

// A settings save from the older tab (SillyTavern's own, or any extension
// running in the background) would write its out-of-date copy over the
// newer one: in that tab, SillyTavern's settings saves are dropped.
export function blocksSave(url, init) {
    const u = typeof url === 'string' ? url : url?.url ?? '';
    return /\/api\/settings\/save(?:$|\?)/.test(u) && String(init?.method ?? url?.method ?? 'GET').toUpperCase() === 'POST';
}

function stopSaving() {
    const original = window.fetch;
    window.fetch = function guardedFetch(url, init) {
        if (blocksSave(url, init)) {
            console.warn('[Scenario Builder] a newer SillyTavern tab is open - its settings save from this tab was dropped.');
            return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return original.call(this, url, init);
    };
}

function cover() {
    if (document.getElementById('sb-stale-tab')) return;
    const box = document.createElement('div');
    box.id = 'sb-stale-tab';
    box.className = 'sb-stale-tab';
    box.innerHTML = `
        <div class="sb-stale-card">
            <i class="fa-solid fa-clone"></i>
            <h3>SillyTavern is open in a newer tab</h3>
            <p>This tab loaded its settings earlier. If it keeps running it will save that older copy over the newer tab's work - the clock, the story's history, catalog edits.</p>
            <p>Close this tab, or reload it to make it the one you use.</p>
            <div class="sb-stale-actions">
                <button type="button" class="menu_button" data-act="close">Close this tab</button>
                <button type="button" class="menu_button" data-act="reload">Reload this tab</button>
            </div>
        </div>`;
    box.querySelector('[data-act="reload"]').addEventListener('click', () => location.reload());
    box.querySelector('[data-act="close"]').addEventListener('click', () => {
        window.close();
        // A tab the user opened can refuse to close from a script.
        box.querySelector('p:last-of-type').textContent = 'This tab could not close itself - close it from the browser, or reload it.';
    });
    document.body.appendChild(box);
}

// Starts listening (once). Never throws.
export function startTabGuard() {
    try {
        if (typeof BroadcastChannel !== 'function') return;
        const me = { id: Math.random().toString(36).slice(2), at: Date.now() };
        const channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = (e) => {
            const verdict = tabVerdict(me, e.data);
            if (verdict === 'stale' && !stale) {
                stale = true;
                stopSaving();
                cover();
            } else if (verdict === 'answer') {
                channel.postMessage(me);
            }
        };
        channel.postMessage(me);
    } catch {
        // No channel in this browser: nothing to guard with.
    }
}
