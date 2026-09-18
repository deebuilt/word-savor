import { Progress } from '../../screens/Progress'
import { useRefresh } from '../refreshContext'

/** `/progress` — the record across sessions. */
export function ProgressRoute() {
  const { progressToken } = useRefresh()

  return <Progress refreshToken={progressToken} />
}
