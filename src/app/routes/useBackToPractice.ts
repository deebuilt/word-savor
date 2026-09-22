import { useCallback } from 'react'
import { useNavigate } from 'react-router'

/**
 * Back to the practice menu, as one stable callback.
 *
 * Four screens live under `/practice` and every one of them leaves the same
 * way, so the handler was written out four times as an inline arrow. That was
 * harmless while it fed an on-page button and stopped being harmless when the
 * button moved into the app bar: a fresh closure each render is a changed
 * dependency each render, and the header effect that depends on it would fire
 * on every render, set shell state, re-render the shell, and re-render the
 * screen that started it.
 *
 * `useCallback` on `navigate`, which React Router keeps stable, so the identity
 * holds for the life of the screen and the effect runs once.
 */
export function useBackToPractice(): () => void {
  const navigate = useNavigate()

  return useCallback(() => {
    void navigate('/practice')
  }, [navigate])
}
