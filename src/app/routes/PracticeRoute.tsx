import { Practice } from '../../screens/Practice'
import { useRefresh } from '../refreshContext'

/**
 * `/practice` — the drill session.
 *
 * Deliberately still one route. The landing page, the session, the end screen,
 * and the results view are four destinations that belong under this path, but
 * they do not exist yet — adding the addresses before the screens would be
 * guessing at their shape. `docs/progress-stats-plan.md` has what they are.
 *
 * What this session was for is that they can be added as children here when
 * they are built, instead of as a fifth kind of state inside the screen.
 */
export function PracticeRoute() {
  const { onProgressed } = useRefresh()

  return <Practice onProgress={onProgressed} />
}
