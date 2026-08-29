/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * The running app's version, baked in from package.json at build time by the
 * `define` block in vite.config.ts. Declared here so TypeScript knows about a
 * global that has no import.
 */
declare const __APP_VERSION__: string
