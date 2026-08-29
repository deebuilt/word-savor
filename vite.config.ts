import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, readFileSync } from 'node:fs'

/*
 * Served from the root of its own domain — wordsavor.com.
 *
 * One constant, because it is not only the asset prefix: the PWA `start_url`,
 * `scope`, and every icon path are built from it below. Moving the app means
 * changing this line and nothing else.
 *
 * If this ever becomes a route under a shared apex instead, this becomes
 * `/word-savor/` and the rest follows automatically.
 */
const BASE = '/'

/*
 * The version the running app reports, read from package.json at build time.
 *
 * Read here rather than imported, because importing package.json into the
 * bundle would pull the whole file — dependency list included — into shipped
 * JavaScript. This takes the one field and bakes it in as a literal.
 *
 * It has to be baked rather than fetched. The service worker caches the app
 * shell, so anything fetched at runtime is subject to that cache and could
 * report a version other than the one actually running — which is precisely
 * the question this exists to answer.
 */
const APP_VERSION = JSON.parse(readFileSync('./package.json', 'utf-8')).version as string

/**
 * Serve the app for any path GitHub Pages does not have a file for.
 *
 * Pages is a static host with no rewrite rules, so a request for `/share` —
 * the share-target route the manifest registers — looks for `share/index.html`,
 * finds nothing, and returns its 404 page. The share sheet would open a "file
 * not found" instead of the app.
 *
 * Pages does serve `404.html` for those requests, so making that file a copy of
 * `index.html` turns the miss into an app load. The app reads the path itself
 * and shows the right screen.
 *
 * Note this is a real 404 status, not a redirect: the URL stays intact, which
 * is what lets `readSharedCapture` see the query string.
 */
function spaFallback(): Plugin {
  return {
    name: 'wordsavor-spa-fallback',
    apply: 'build',
    closeBundle() {
      copyFileSync('dist/index.html', 'dist/404.html')
    },
  }
}

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    port: 8205,
    strictPort: true,
    // Listen on the LAN, not just localhost, so the dev server opens on a
    // phone. This app is mobile-first and several of its layout rules — the
    // `dvh` shell, the bottom bar clearing the home indicator — cannot be
    // exercised in a desktop browser at all, because there is no URL bar to
    // collapse. Vite prints the Network URL on startup once this is set.
    host: true,
  },
  preview: {
    port: 8205,
    strictPort: true,
    host: true,
  },
  plugins: [
    react(),
    VitePWA({
      /*
       * `autoUpdate`, not `prompt`. An update banner cannot say what is in the
       * update — release notes ship inside the bundle, so a running build holds
       * its own notes and not the incoming one's. Under `autoUpdate` the new
       * worker activates by itself and the app can report afterwards, at which
       * point it IS the new build and can say what changed without guessing.
       *
       * This is also what people expect: the app reloads quietly, then tells
       * you what arrived while you were gone.
       */
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'WordSavor',
        short_name: 'WordSavor',
        description:
          'Catch a word in the wild, keep it, and practise using it until it is yours.',
        theme_color: '#16130f',
        background_color: '#faf7f2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        // Icon paths carry the base prefix explicitly. A bare filename resolves
        // against the manifest's own URL, which happens to work at the root —
        // but an absolute path is unambiguous and survives a move to a
        // subdirectory.
        icons: [
          { src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${BASE}icon-512-maskable.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        /*
         * Registers WordSavor as a share destination, so a word highlighted in
         * any app can be sent straight here via the OS share sheet. This is the
         * single most important capture path in the product: the window between
         * meeting a word and losing it is a few seconds long, and every step
         * removed from that path is a word kept.
         *
         * Declared now, at scaffold time, because a share target must be in the
         * manifest the installed app was installed with. Adding it later means
         * every early installer has to reinstall to get it. The handler route
         * is stubbed until the capture flow is built.
         */
        share_target: {
          action: `${BASE}share`,
          method: 'GET',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
          },
        },
      },
      workbox: {
        // Everything the app owns is text in IndexedDB, so the service worker
        // only needs the app shell. Dictionary responses are cached in the
        // database at save time, not by the worker — a saved word must survive
        // a cache eviction.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
    // Last, so `dist/index.html` is final before it is copied.
    spaFallback(),
  ],
})
