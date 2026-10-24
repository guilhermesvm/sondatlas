import { screen, waitFor, within } from '@testing-library/react'
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

function stubProbeBackend(ripe: () => Promise<Response>) {
  let saved: number | null = null
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/probe' && init?.method === 'PUT') {
      saved = (JSON.parse(String(init.body)) as { probe_id: number }).probe_id
      return Promise.resolve(new Response(JSON.stringify({ probe_id: saved, is_public: true })))
    }
    if (url === '/api/probe') return Promise.resolve(new Response(JSON.stringify({ probe_id: saved })))
    if (url.startsWith('https://atlas.ripe.net/')) return ripe()
    return new Promise<Response>(() => {})
  }))
}

it('shows the probe status in the menu as soon as the ID is saved', async () => {
  stubProbeBackend(() => Promise.resolve(new Response(JSON.stringify({ id: 1017210, is_public: true, status: { id: 2, name: 'Disconnected', since: null } }))))
  window.location.hash = '#/ativar'
  render(<App />)
  const menuItem = within(screen.getByRole('navigation', { name: 'Páginas do dashboard' })).getByRole('link', { name: /Minha probe/ })
  expect(menuItem).toHaveTextContent(/^Minha probe$/)
  await userEvent.type(screen.getByLabelText('ID da probe'), '1017210')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await waitFor(() => expect(menuItem).toHaveTextContent('Minha probeDesconectada'))
  expect(screen.getByRole('link', { name: 'Minha probe: Desconectada' })).toHaveAttribute('href', '#/minha-probe')
})

it('says the status is unavailable when RIPE Atlas does not answer', async () => {
  stubProbeBackend(() => Promise.resolve(new Response('', { status: 503 })))
  window.location.hash = '#/ativar'
  render(<App />)
  await userEvent.type(screen.getByLabelText('ID da probe'), '1017210')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  expect(await screen.findByRole('link', { name: 'Minha probe: Status indisponível' })).toBeInTheDocument()
})
