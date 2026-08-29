import { theme as antdTheme, type ThemeConfig } from 'antd'
import { fontSize, font, radius, control } from './tokens'
import type { ResolvedTheme } from '../hooks/useTheme'

/**
 * Ant Design theme, built from the same palette as the rest of the app.
 *
 * Ant's tokens are resolved in JS and fed to its style engine, so they cannot
 * be CSS custom properties — a `var()` here reaches Ant's colour maths as an
 * unparseable string and every derived state (hover, disabled, focus ring)
 * collapses. The two palettes are therefore declared here as literals and must
 * stay in step with `theme.css`, which is why both live in this directory.
 *
 * Changing a colour means changing it in both files. That duplication is
 * deliberate and is the only one in the design system.
 */

const LIGHT = {
  ink: '#16130f',
  inkSoft: '#4a443c',
  inkFaint: '#8b8279',
  paper: '#faf7f2',
  paperRaised: '#fffefb',
  line: '#e5ded2',
  accent: '#2f4858',
  success: '#4a6b4f',
  danger: '#8c3a30',
} as const

const DARK = {
  ink: '#f3efe7',
  inkSoft: '#bcb4a8',
  inkFaint: '#877f76',
  paper: '#161513',
  paperRaised: '#1f1d1a',
  line: '#302d29',
  accent: '#7fa8c0',
  success: '#85ad8b',
  danger: '#cf7a6c',
} as const

export function buildAntTheme(mode: ResolvedTheme): ThemeConfig {
  const palette = mode === 'dark' ? DARK : LIGHT

  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.accent,
      colorSuccess: palette.success,
      colorError: palette.danger,
      colorText: palette.ink,
      colorTextSecondary: palette.inkSoft,
      colorTextTertiary: palette.inkFaint,
      colorBgBase: palette.paper,
      colorBgContainer: palette.paperRaised,
      colorBgElevated: palette.paperRaised,
      colorBorder: palette.line,
      colorBorderSecondary: palette.line,
      borderRadius: radius.md,
      fontSize: fontSize.base,
      fontFamily: font.ui,
    },
    components: COMPONENTS,
  }
}

const COMPONENTS: ThemeConfig['components'] = {
  Button: {
    // Squared off. Pill buttons are one of the fastest ways for an interface to
    // read as template-generated, and this app is trying to look edited.
    borderRadius: radius.md,
    controlHeight: control.minTouchTarget,
    fontWeight: 500,
  },
  Input: {
    controlHeight: control.minTouchTarget,
    borderRadius: radius.md,
  },
  Drawer: {
    paddingLG: 20,
  },
  Tag: {
    borderRadiusSM: radius.pill,
  },
  Segmented: {
    borderRadius: radius.md,
  },
}
