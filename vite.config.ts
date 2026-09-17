import { defineConfig, loadEnv, type Plugin } from 'vite'
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

/**
 * Serve `/api/mw` locally during `npm run dev`.
 *
 * The dev server is a static file server with no functions, so the app used to
 * reach the *deployed* proxy instead, via `VITE_MW_PROXY_BASE`. That works only
 * while the deployment is public — and with Vercel's deployment protection on,
 * every lookup gets a 302 to an SSO login page rather than a dictionary entry.
 * The app reads the silence as "no such word", so real words come back as
 * "No entry for precipitate". Nothing in the app is wrong; it simply never
 * reached Merriam-Webster.
 *
 * Serving the proxy here removes the hop entirely: no deployed origin, no SSO
 * wall, no CORS, and dev keeps working with the deployment private. The keys are
 * read through vite's `loadEnv` rather than `import.meta.env`, so they stay in
 * the Node process and never enter the browser bundle — the same guarantee the
 * real function gives, which is the whole reason a proxy exists.
 *
 * Deliberately `apply: 'serve'`. In production the real function at `api/mw.ts`
 * handles this route, and this plugin does not exist in the build.
 */
function merriamDevProxy(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  const REFERENCES = {
    dictionary: {
      base: 'https://dictionaryapi.com/api/v3/references/collegiate/json',
      key: env.MW_DICTIONARY_KEY,
    },
    thesaurus: {
      base: 'https://dictionaryapi.com/api/v3/references/thesaurus/json',
      key: env.MW_THESAURUS_KEY,
    },
  }

  return {
    name: 'wordsavor-merriam-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/mw', (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }

        const url = new URL(req.url ?? '', 'http://localhost')
        const ref = url.searchParams.get('ref')
        const word = (url.searchParams.get('word') ?? '').trim().toLowerCase()

        if (ref !== 'dictionary' && ref !== 'thesaurus') {
          return send(400, { error: 'Query `ref` must be "dictionary" or "thesaurus".' })
        }
        if (!word) return send(400, { error: 'Query `word` is missing.' })

        const reference = REFERENCES[ref]
        if (!reference.key) {
          // Named explicitly: a blank key is a setup problem, and "set
          // MW_DICTIONARY_KEY in .env" is an answer, where a 500 is a puzzle.
          return send(500, {
            error: `Missing ${ref === 'dictionary' ? 'MW_DICTIONARY_KEY' : 'MW_THESAURUS_KEY'} in .env.`,
          })
        }

        const target = `${reference.base}/${encodeURIComponent(word)}?key=${encodeURIComponent(reference.key)}`
        fetch(target, { headers: { Accept: 'application/json' } })
          .then(async (upstream) => {
            if (!upstream.ok) {
              return send(502, { error: `Merriam-Webster returned ${upstream.status}.` })
            }
            const body = await upstream.text()
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(body)
          })
          .catch(() => send(502, { error: 'Could not reach Merriam-Webster.' }))
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
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
    merriamDevProxy(mode),
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
        // Keep the service worker's app-shell navigation fallback off the API.
        // The worker answers navigations with index.html so the app opens
        // offline — but the Merriam-Webster proxy lives at `/api/*` on this same
        // origin, and a request there must reach the function, never the shell.
        // Without this, opening or fetching an `/api` URL is served the app.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
    // Last, so `dist/index.html` is final before it is copied.
    spaFallback(),
  ],
}))
