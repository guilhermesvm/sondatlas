import { MantineProvider } from '@mantine/core'
import { render as testingLibraryRender } from '@testing-library/react'
import type { ReactNode } from 'react'
import { theme } from '../app/theme'

export function render(ui: ReactNode) {
  return testingLibraryRender(ui, { wrapper: ({ children }) => <MantineProvider theme={theme} env="test">{children}</MantineProvider> })
}
