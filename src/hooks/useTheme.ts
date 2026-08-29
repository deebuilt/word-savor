import { useCallback, useEffect, useState } from 'react'

/**
 * Theme preference.
 *
 * Three states rather than two: `system` follows the OS and is the default,
 * while `light` and `dark` are explicit overrides. A two-state toggle silently
 * breaks the common case of a phone that switches at sunset.
 *
 * Stored in localStorage rather than IndexedDB — it is one short string, and it
 * must be readable synchronously before first paint to avoid a flash of the
 * wrong theme. Everything else the app owns lives in IndexedDB; this is the one
 * deliberate exception, and `main.tsx` reads the same key inline in `<head>`.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'wordsavor:theme'

function readStored(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
  } catch {
    // Private browsing and blocked site data both throw on access rather than
    // returning null. Falling back to `system` is correct in every such case.
    return 'system'
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface UseThemeResult {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (next: ThemePreference) => void
  /** Cycles system → light → dark → system, for a single-button control. */
  cycle: () => void
}

export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Track OS changes so `system` stays live rather than sampled once at boot.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  // `system` removes the attribute entirely so the media query governs, rather
  // than pinning a value that would then ignore an OS change.
  useEffect(() => {
    const root = document.documentElement
    if (preference === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', preference)
    }
  }, [preference])

  const persist = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage can be unavailable. The preference still applies for this
      // session; only its persistence is lost, which is not worth an error.
    }
  }, [])

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next)
      persist(next)
    },
    [persist],
  )

  const cycle = useCallback(() => {
    setPreferenceState((current) => {
      const next: ThemePreference =
        current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'
      persist(next)
      return next
    })
  }, [persist])

  return { preference, resolved, setPreference, cycle }
}
