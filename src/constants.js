// Scenario Builder's identity toward the State Engine API, shared by every
// module that makes State Engine calls.

// Must be unique across every extension that talks to the State Engine
// API on this SillyTavern install - it is how the State Engine tells
// Scenario Builder's calls apart from anyone else's. Matches the
// folder/repo name.
export const EXTENSION_ID = 'SillyTavern-StateEngine-ScenarioBuilder';

// Prefixes every variable and preset Scenario Builder creates through the
// State Engine (e.g. a variable named "guidance" is stored as
// "sb__guidance"). Letters and digits only, starting with a letter - see
// the State Engine API Reference, "Namespace Model".
export const NAMESPACE = 'sb';

// Prefix for Scenario Builder's console output.
export const LOG_PREFIX = '[ScenarioBuilder]';

// The first line of every output variable (spec SB-303), as State Engine
// and Archivist blocks do.
export const REFERENCE_HEADER = 'REFERENCE ONLY — DO NOT CONTINUE';
