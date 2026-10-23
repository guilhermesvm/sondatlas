import '@mantine/core/styles.css'
import './styles/global.css'
import { MantineProvider } from '@mantine/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { theme } from './app/theme'

createRoot(document.getElementById('root')!).render(
  <StrictMode><MantineProvider theme={theme} defaultColorScheme="light"><App /></MantineProvider></StrictMode>,
)
