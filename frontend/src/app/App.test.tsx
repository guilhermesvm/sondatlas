import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { render } from '../test/render'
import { mockApi } from '../test/mock-api'

beforeEach(() => { window.location.hash = '#/minha-probe' })
afterEach(() => vi.unstubAllGlobals())

it('opens the page named in the address and falls back to the home page', async () => {
  mockApi()
  window.location.hash = '#/rede-global'
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Rede global' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Rede global' })).toHaveAttribute('aria-current', 'page')
  window.location.hash = '#/nao-existe'
  expect(await screen.findByRole('heading', { name: /Participe do RIPE Atlas/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Já tenho uma probe' })).toHaveAttribute('href', '#/ativar')
})

it('switches between light and dark themes from the header', async () => {
  mockApi()
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Usar tema escuro' }))
  expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await userEvent.click(screen.getByRole('button', { name: 'Usar tema claro' }))
  expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'light')
  localStorage.clear()
})
