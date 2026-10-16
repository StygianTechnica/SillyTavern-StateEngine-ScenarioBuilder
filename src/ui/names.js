// Qualified variable names without importing the State Engine wrappers -
// for the pure UI models.

import { NAMESPACE } from '../constants.js';

export const qualifiedNameOf = (variableName) => `${NAMESPACE}__${variableName}`;
