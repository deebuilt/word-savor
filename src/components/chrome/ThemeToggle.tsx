import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Segmented } from 'antd'
import type { ThemePreference } from '../../hooks/useTheme'

/**
 * Theme control.
 *
 * A three-way Segmented rather than a two-state switch, because the preference
 * genuinely has three values and `system` is the default. A switch would have
 * to either hide `system` or lie about which state it is in once the OS
 * switches at sunset.
 *
 * Icons carry labels rather than standing alone — a sun and a moon are
 * guessable, a monitor meaning "follow my phone" is not.
 */

interface ThemeToggleProps {
  preference: ThemePreference
  onChange: (next: ThemePreference) => void
}

export function ThemeToggle({ preference, onChange }: ThemeToggleProps) {
  return (
    <Segmented<ThemePreference>
      value={preference}
      onChange={onChange}
      block
      options={[
        { value: 'system', label: 'Auto', icon: <DesktopOutlined /> },
        { value: 'light', label: 'Light', icon: <SunOutlined /> },
        { value: 'dark', label: 'Dark', icon: <MoonOutlined /> },
      ]}
    />
  )
}
