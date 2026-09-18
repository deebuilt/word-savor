import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { Library } from '../../screens/Library'
import { useRefresh } from '../refreshContext'

/**
 * `/library` — the collection.
 *
 * A thin adapter, and every route in this folder is the same shape: read the
 * address and the refresh signals, hand the screen the props it already takes.
 * The screens themselves know nothing about routing, which keeps them testable
 * without a router and means the conversion did not touch them.
 */
export function LibraryRoute() {
  const { libraryToken } = useRefresh()
  const navigate = useNavigate()

  const openWord = useCallback(
    (id: string) => {
      void navigate(`/library/${id}`)
    },
    [navigate],
  )

  return <Library refreshToken={libraryToken} onOpenWord={openWord} />
}
