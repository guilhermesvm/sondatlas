import { ActionIcon, useComputedColorScheme, useMantineColorScheme } from '@mantine/core'

export default function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const dark = useComputedColorScheme('light') === 'dark'
  return <ActionIcon variant="subtle" color="white" size="lg" onClick={() => setColorScheme(dark ? 'light' : 'dark')}
    aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'} title={dark ? 'Usar tema claro' : 'Usar tema escuro'}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {dark
        ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
        : <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />}
    </svg>
  </ActionIcon>
}
