/**
 * Merriam-Webster proxy — the one server-side piece WordSavor has.
 *
 * The whole app is otherwise a static frontend: a request from the browser to
 * a dictionary source carries no secret, because every other source is keyless.
 * Merriam-Webster is not. Its API requires a key, and a key shipped to the
 * browser is a key anyone can read out of the bundle and spend. So this
 * function exists for exactly one reason: to hold the key server-side and add
 * it to the outbound request, so the browser never sees it.
 *
 * It is deliberately thin. It does not parse, reshape, or judge the response —
 * it forwards Merriam-Webster's JSON through untouched. That matters for the
 * same reason the rest of the lookup layer caches raw payloads: a parser
 * improvement later should re-derive every saved word from what MW actually
 * sent, and it only can if what we stored is what MW sent.
 *
 * Runs on Vercel's Edge runtime — no `@vercel/node` types to install, `fetch`
 * and `Request`/`Response` are the standard web ones, and env vars arrive on
 * `process.env` the same as anywhere else on Vercel.
 */

export const config = { runtime: 'edge' }

/**
 * The two references we call, each with its own key.
 *
 * Merriam-Webster issues a separate key per reference — the Collegiate
 * Dictionary and the Collegiate Thesaurus are two registrations, two keys. The
 * env var names here are what you set in Vercel → Settings → Environment
 * Variables. Nothing else in the repo needs to know the key values.
 */
const REFERENCES = {
  dictionary: {
    base: 'https://dictionaryapi.com/api/v3/references/collegiate/json',
    keyVar: 'MW_DICTIONARY_KEY',
  },
  thesaurus: {
    base: 'https://dictionaryapi.com/api/v3/references/thesaurus/json',
    keyVar: 'MW_THESAURUS_KEY',
  },
} as const

type Reference = keyof typeof REFERENCES

/**
 * Browser origins allowed to call this proxy directly.
 *
 * In production the app is served from the same domain as this function, so the
 * browser makes a same-origin request and sends no `Origin` header at all —
 * this list is not consulted for that case. It matters for local development,
 * where `vite` serves the app on :8205 and the deployed proxy is cross-origin.
 *
 * A caveat worth being honest about: CORS is a browser courtesy, not a lock. It
 * stops another *website* from spending our quota through a visitor's browser;
 * it does nothing against a plain `curl`. Real abuse protection (a shared token,
 * or Vercel's rate limiting) is a later hardening step, noted here so it is a
 * decision rather than an oversight. For a non-commercial 1,000/day key on a
 * low-profile app, the edge cache below is the bigger lever anyway.
 */
const ALLOWED_ORIGINS = new Set([
  'https://wordsavor.com',
  'https://www.wordsavor.com',
  'http://localhost:8205',
])

/** Longest word we will forward. Guards against a junk query burning a call. */
const MAX_WORD_LENGTH = 60

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')
  const cors = corsHeaders(origin)

  // Preflight, for the cross-origin dev case.
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, 405, cors)
  }

  const url = new URL(request.url)
  const ref = url.searchParams.get('ref')
  const rawWord = url.searchParams.get('word') ?? ''
  const word = rawWord.trim().toLowerCase()

  if (ref !== 'dictionary' && ref !== 'thesaurus') {
    return json({ error: 'Query `ref` must be "dictionary" or "thesaurus".' }, 400, cors)
  }
  if (!word || word.length > MAX_WORD_LENGTH) {
    return json({ error: 'Query `word` is missing or too long.' }, 400, cors)
  }

  const reference = REFERENCES[ref as Reference]
  const key = process.env[reference.keyVar]
  if (!key) {
    // A configuration problem, not a client one — surfaced clearly so a missing
    // env var reads as "set MW_DICTIONARY_KEY in Vercel", not a silent 500.
    return json({ error: `Server is missing ${reference.keyVar}.` }, 500, cors)
  }

  const target = `${reference.base}/${encodeURIComponent(word)}?key=${encodeURIComponent(key)}`

  let upstream: Response
  try {
    upstream = await fetch(target, { headers: { Accept: 'application/json' } })
  } catch {
    return json({ error: 'Could not reach Merriam-Webster.' }, 502, cors)
  }

  if (!upstream.ok) {
    return json({ error: `Merriam-Webster returned ${upstream.status}.` }, 502, cors)
  }

  const body = await upstream.text()

  /*
   * Cache at the edge. Dictionary entries are effectively static, so letting
   * Vercel's CDN hold each answer for a day means repeat lookups of the same
   * word across all visitors cost one MW call, not one per visitor — the
   * cheapest possible protection for a 1,000/day quota. `stale-while-revalidate`
   * keeps a slightly stale answer serving instantly while a fresh one is
   * fetched in the background.
   */
  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}

/** CORS headers, echoing the origin only when it is one we allow. */
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
  }
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

/** A small JSON response with the CORS headers already merged in. */
function json(payload: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })
}
