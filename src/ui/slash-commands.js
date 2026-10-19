// Scenario Builder's slash commands (docs/DESIGN - GM PLANNER.md §3.5):
//   /sb-request [urgency=soon|today|whenever] [quiet=true] <what you'd like>
//                   queues a request for the game master in the open chat,
//                   as if added in the GM Plan tab; returns its id
//   /sb-requests    lists the open chat's open requests (and returns them)
// Registered best-effort: the slash command API varies between SillyTavern
// versions, and a failure never stops the extension from loading.

import { LOG_PREFIX } from '../constants.js';
import { getSettings, isActive } from '../settings.js';
import { getCurrentChatRef, chatKeyFor } from '../store/chat-ref.js';
import { getChatDoc } from '../store/chat-store.js';
import { getBoundSettingId } from '../library/library.js';
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
            name: 'sb-requests',
            callback: () => listCommand(),
            returns: 'the open requests, one per line',
            helpString: 'List the requests still waiting for the Scenario Builder game master in this chat.',
        }));
    } catch (err) {
        console.warn(LOG_PREFIX, 'slash command registration skipped', err);
    }
}
