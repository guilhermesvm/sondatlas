import { Alert, createTheme, type MantineColorsTuple } from '@mantine/core'

// Signal: the single accent. Shade 7 is used on light paper, shade 4 on the dark ink.
const signal: MantineColorsTuple = ['#e6f7f3', '#c9eee5', '#9fe3d2', '#7de9d0', '#4fe3c1', '#22bfa0', '#0f9a81', '#0a7a68', '#075e50', '#054a3f']

// Ink: the dark shell (header and menu) and the dark theme's surfaces.
const dark: MantineColorsTuple = ['#e8eef3', '#bccad6', '#8fa3b5', '#5e7387', '#2c3f52', '#1e3245', '#12263a', '#0f1e2e', '#0b1724', '#08111b']

export const theme = createTheme({
  colors: { signal, dark },
  primaryColor: 'signal',
  primaryShade: { light: 7, dark: 4 },
  autoContrast: true,
  defaultRadius: 'md',
  radius: { md: '12px', lg: '20px' },
  fontFamily: "'Hanken Grotesk Variable', system-ui, sans-serif",
  fontFamilyMonospace: "'JetBrains Mono Variable', ui-monospace, monospace",
  components: {
    // Yellow alerts are the amber notice of the visual system, in both themes.
    Alert: Alert.extend({
      defaultProps: { radius: 14 },
      vars: (_theme, props) => props.color === 'yellow'
        ? { root: { '--alert-bg': 'var(--notice-bg)', '--alert-color': 'var(--notice-text)', '--alert-bd': '1px solid var(--notice-line)' } }
        : { root: {} },
    }),
  },
  headings: {
    fontFamily: "'Bricolage Grotesque Variable', system-ui, sans-serif",
    fontWeight: '700',
    sizes: { h2: { fontSize: '1.75rem', lineHeight: '1.2' }, h3: { fontSize: '1.3rem', lineHeight: '1.3' } },
  },
})
