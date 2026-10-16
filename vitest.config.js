import { defineConfig } from 'vitest/config';

// Only the pure-logic modules are unit-tested (spec SB-804): they import
// nothing from SillyTavern or State Engine, so no stand-ins are needed.
export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.js'],
    },
});
