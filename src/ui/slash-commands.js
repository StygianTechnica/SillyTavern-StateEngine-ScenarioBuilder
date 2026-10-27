// Scenario Builder's slash commands (docs/DESIGN - GM PLANNER.md §3.5):
//   /sb-request [urgency=soon|today|whenever] [quiet=true] <what you'd like>
//                   queues a request for the game master in the open chat,
//                   as if added in the GM Plan tab; returns its id
//   /sb-requests    lists the open chat's open requests (and returns them)
//   /sb-name [type=...] [culture=...] [count=5] <what it is>
//                   rolls names from the name generator for the open chat's
//                   world - "a tavern", "a smuggler woman" (docs/DESIGN -
//                   NAMING.md); returns them, one per line
// Registered best-effort: the slash command API varies between SillyTavern
// versions, and a failure never stops the extension from loading.

import { LOG_PREFIX } from '../constants.js';
import { getSettings, isActive } from '../settings.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';
import { getChatDoc } from '../store/chat-store.js';
import { getBoundSettingId, getObjectTypes, listEntries } from '../library/library.js';
import { namesForCommand, cultureNamed, byType } from '../naming/run.js';
import { URGENCIES, openRequests } from '../planner/model.js';
import { queueRequest } from '../planner/run.js';
import { toast } from './dom.js';

const URGENCY_IDS = URGENCIES.map(([id]) => id);

// Why a request can't be queued now, or '' when it can.
async function blocked() {
    if (!isActive()) return 'Scenario Builder is off or paused.';
    if (getSettings().planner?.enabled !== true) return 'The GM planner is off (GM Plan tab → Planner).';
    const ref = getCurrentChatRef();
    if (!ref) return 'No chat is open.';
    if (!await getBoundSettingId(ref.chatId)) return 'This chat has no setting yet.';
    return '';
}

// args: { urgency, quiet }; text: the request. -> the request's id, or ''.
export async function requestCommand(args, text) {
    const quiet = String(args?.quiet ?? '').toLowerCase() === 'true';
    const say = (kind, message) => { if (!quiet || kind === 'warning') toast(kind, message); };
    const what = String(text ?? '').trim();
    if (!what) {
        say('warning', 'Usage: /sb-request [urgency=soon|today|whenever] what you would like to happen');
        return '';
    }
    const urgency = String(args?.urgency ?? 'whenever').trim().toLowerCase();
    if (!URGENCY_IDS.includes(urgency)) {
        say('warning', `urgency must be ${URGENCY_IDS.join(', ')}.`);
        return '';
    }
    const why = await blocked();
    if (why) {
        say('warning', `Not queued: ${why}`);
        return '';
    }
    const made = queueRequest(chatKeyFor(getCurrentChatRef()), what, urgency);
    if (!made) {
        say('warning', 'Not queued.');
        return '';
    }
    say('success', `Queued for the game master${urgency === 'whenever' ? '' : ` (${urgency})`}: ${made.text}`);
    return made.id;
}

// -> the open requests, one per line ('' when none or not possible).
export async function listCommand() {
    const why = await blocked();
    if (why) {
        toast('warning', why);
        return '';
    }
    const open = openRequests(getChatDoc(chatKeyFor(getCurrentChatRef())).gm);
    if (!open.length) {
        toast('info', 'No requests are waiting for the game master.');
        return '';
    }
    const text = open.map((r) => `- ${r.text} (${r.urgency}, ${r.status})`).join('\n');
    toast('info', `Requests for the game master:\n${text}`);
    return text;
}

const NAME_TYPES = ['character', 'location', 'faction', 'item', 'creature'];

// args: { type, culture, count, quiet }; text: what it is for. -> names, one per line.
export async function nameCommand(args, text) {
    const quiet = String(args?.quiet ?? '').toLowerCase() === 'true';
    const say = (kind, message) => { if (!quiet || kind === 'warning') toast(kind, message); };
    const brief = String(text ?? '').trim();
    const ref = getCurrentChatRef();
    const settingId = ref ? await getBoundSettingId(ref.chatId) : null;
    if (!isActive() || !settingId) {
        say('warning', 'Names come from a world: open a chat with a setting (Scenario Builder on).');
        return '';
    }
    const typeId = String(args?.type ?? '').trim().toLowerCase();
    if (typeId && !NAME_TYPES.includes(typeId)) {
        say('warning', `type must be ${NAME_TYPES.join(', ')}.`);
        return '';
    }
    const cultureId = args?.culture ? cultureNamed(settingId, String(args.culture)) : '';
    if (args?.culture && !cultureId) {
        say('warning', `No culture called "${args.culture}" in this world (Naming tab).`);
        return '';
    }
    const count = Math.max(1, Math.min(12, Number.parseInt(args?.count ?? '5', 10) || 5));
    const all = [];
    for (const t of await getObjectTypes().catch(() => [])) all.push(...(await listEntries(ref.chatId, settingId, t.id).catch(() => [])).map((x) => ({ ...x, type: t.id })));
    const { names, typeId: rolledAs } = namesForCommand(settingId, byType(all), { brief, typeId, cultureId, count, placeId: getChatDoc(chatKeyFor(ref)).canonical.locationId || null });
    if (!names.length) {
        say('info', `Nothing to roll for "${brief || 'that'}" - a room, a quest or an object is named in plain words.`);
        return '';
    }
    const lines = names.map((n) => (n.meaning ? `${n.name} ("${n.meaning}")` : n.name));
    say('info', `Names (${rolledAs}${brief ? `: ${brief}` : ''}):\n${lines.join('\n')}`);
    return names.map((n) => n.name).join('\n');
}

export function registerSlashCommands() {
    try {
        const context = SillyTavern.getContext();
        const { SlashCommandParser, SlashCommand, SlashCommandNamedArgument, ARGUMENT_TYPE } = context;
        if (!SlashCommandParser?.addCommandObject || !SlashCommand?.fromProps) return;
        const named = (props) => (SlashCommandNamedArgument?.fromProps ? SlashCommandNamedArgument.fromProps(props) : null);
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'sb-request',
            callback: (args, value) => requestCommand(args, value),
            returns: 'the request\'s id',
            namedArgumentList: [
                named({ name: 'urgency', description: 'soon, today or whenever (the default)', typeList: ARGUMENT_TYPE ? [ARGUMENT_TYPE.STRING] : undefined, enumList: URGENCY_IDS, defaultValue: 'whenever' }),
                named({ name: 'quiet', description: 'true: no toast', typeList: ARGUMENT_TYPE ? [ARGUMENT_TYPE.BOOLEAN] : undefined, defaultValue: 'false' }),
            ].filter(Boolean),
            helpString: 'Queue a request for the Scenario Builder game master in this chat - what you would like to happen. It shapes the next scenes (GM Plan tab → Your requests). Examples: <code>/sb-request add an NPC - a rival smuggler</code>, <code>/sb-request urgency=soon a quiet scene by the fire</code>.',
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'sb-name',
            callback: (args, value) => nameCommand(args, value),
            returns: 'the names, one per line',
            namedArgumentList: [
                named({ name: 'type', description: 'character, location, faction, item or creature (guessed from the text when left out)', typeList: ARGUMENT_TYPE ? [ARGUMENT_TYPE.STRING] : undefined, enumList: NAME_TYPES }),
                named({ name: 'culture', description: 'a culture of this world, by name (the Naming tab); the scene’s place or the world default when left out', typeList: ARGUMENT_TYPE ? [ARGUMENT_TYPE.STRING] : undefined }),
                named({ name: 'count', description: 'how many, 1 to 12 (5)', typeList: ARGUMENT_TYPE ? [ARGUMENT_TYPE.NUMBER] : undefined, defaultValue: '5' }),
                named({ name: 'quiet', description: 'true: no toast', typeList: ARGUMENT_TYPE ? [ARGUMENT_TYPE.BOOLEAN] : undefined, defaultValue: 'false' }),
            ].filter(Boolean),
            helpString: 'Roll names from the Scenario Builder name generator for this chat’s world - never the model, never one already used. Examples: <code>/sb-name a tavern</code>, <code>/sb-name culture=Vaskari count=3 a smuggler woman</code>, <code>/sb-name type=faction a mercenary company</code>.',
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'sb-requests',
            callback: () => listCommand(),
            returns: 'the open requests, one per line',
            helpString: 'List the requests still waiting for the Scenario Builder game master in this chat.',
        }));
    } catch (err) {
        console.warn(LOG_PREFIX, 'slash command registration skipped', err);
    }
}
