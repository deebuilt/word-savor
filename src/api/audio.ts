import { fetchJson, normaliseWord, TIMEOUT } from './http'

/**
 * dictionaryapi.dev — spoken pronunciation, and nothing else.
 *
 * This source is deliberately demoted to one job. Measured against the live
 * endpoint it answered in roughly twenty seconds on every call, and returned
 * HTTP 522 (Cloudflare: origin unreachable) for one word while answering
 * another correctly in the same minute. It is not down — it is unreliable per
 * word, and slow even when it works.
 *
 * The build plan had it as a co-equal layer in one merged lookup. Wired that
 * way, every save would wait on the weakest of the three sources. So: it
 * contributes only `audioUrl`, it runs on a four-second timeout, and a save
 * never waits for it or fails because of it. `SavedWord.audioUrl` is already
 * optional, and a word with no audio is a word with no audio.
 */

interface WirePhonetic {
  text?: string
  audio?: string
}

interface WireEntry {
  word?: string
  phonetics?: WirePhonetic[]
}

/**
 * The URL of a spoken pronunciation, or `undefined`.
 *
 * Never throws and never rejects. Every failure mode — offline, timeout, 522,
 * a word this source has never heard of, entries with silent phonetics — is
 * the same answer: no audio.
 */
export async function lookupAudio(rawWord: string): Promise<string | undefined> {
  const word = normaliseWord(rawWord)
  if (!word) return undefined

  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  const payload = await fetchJson<WireEntry[]>(url, {
    timeout: TIMEOUT.audio,
    source: 'dictionaryapi',
  })
  if (!Array.isArray(payload)) return undefined

  /*
   * Many `phonetics` entries carry a `text` transcription with `audio: ""` —
   * present but empty. The first entry with a genuinely non-empty audio URL
   * wins; regional accent is not worth choosing between here, since having any
   * recording at all is the improvement over having none.
   */
  for (const entry of payload) {
    for (const phonetic of entry.phonetics ?? []) {
      const audio = phonetic.audio?.trim()
      if (audio) return audio
    }
  }

  return undefined
}
