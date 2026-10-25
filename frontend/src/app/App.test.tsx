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

it('keeps the journey in five phases that end in Aprender and sends the old Ir além address home', async () => {
  mockApi()
  window.location.hash = '#/aprender'
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Aprender' })).toBeInTheDocument()
  const phases = within(screen.getByRole('navigation', { name: 'Páginas do dashboard' })).getAllByRole('link', { name: /^\d\. / })
  expect(phases.map(link => link.textContent)).toEqual(['1. Conhecer', '2. Instalar', '3. Ativar', '4. Acompanhar', '5. Aprender'])
  expect(screen.queryByRole('link', { name: /^Próximo/ })).not.toBeInTheDocument()
  window.location.hash = '#/ir-alem'
  expect(await screen.findByRole('heading', { name: /Participe do RIPE Atlas/ })).toBeInTheDocument()
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

const connected = () => Promise.resolve(new Response(JSON.stringify({ id: 1017210, is_public: true, status: { id: 1, name: 'Connected', since: null } })))

function stubProbeBackend(ripe: () => Promise<Response>, saved: number | null = null) {
  const mock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/probe' && init?.method === 'PUT') {
      saved = (JSON.parse(String(init.body)) as { probe_id: number }).probe_id
      return Promise.resolve(new Response(JSON.stringify({ probe_id: saved, is_public: true })))
    }
    if (url === '/api/probe') return Promise.resolve(new Response(JSON.stringify({ probe_id: saved })))
    if (url.startsWith('https://atlas.ripe.net/')) return ripe()
    return new Promise<Response>(() => {})
  })
  vi.stubGlobal('fetch', mock)
  return () => mock.mock.calls.filter(([url]) => url.startsWith('https://atlas.ripe.net/')).length
}

it('shows the probe status in the menu as soon as the ID is saved', async () => {
  stubProbeBackend(() => Promise.resolve(new Response(JSON.stringify({ id: 1017210, is_public: true, status: { id: 2, name: 'Disconnected', since: null } }))))
  window.location.hash = '#/acompanhar'
  render(<App />)
  const menuItem = within(screen.getByRole('navigation', { name: 'Páginas do dashboard' })).getByRole('link', { name: /Minha probe/ })
  expect(menuItem).toHaveTextContent(/^Minha probe$/)
  await userEvent.type(await screen.findByLabelText('ID da probe'), '1017210')
  await userEvent.click(screen.getByRole('button', { name: 'Acompanhar esta probe' }))
  await waitFor(() => expect(menuItem).toHaveTextContent('Minha probeDesconectada'))
  expect(screen.getByRole('link', { name: 'Minha probe: Desconectada' })).toHaveAttribute('href', '#/minha-probe')
})

it('says the status is unavailable when RIPE Atlas does not answer', async () => {
  stubProbeBackend(() => Promise.resolve(new Response('', { status: 503 })))
  window.location.hash = '#/acompanhar'
  render(<App />)
  await userEvent.type(await screen.findByLabelText('ID da probe'), '1017210')
  await userEvent.click(screen.getByRole('button', { name: 'Acompanhar esta probe' }))
  expect(await screen.findByRole('link', { name: 'Minha probe: Status indisponível' })).toBeInTheDocument()
})

it('shows an empty Minha probe with both ways in when no probe is followed, without locking any page', async () => {
  stubProbeBackend(connected)
  window.location.hash = '#/minha-probe'
  render(<App />)
  expect(await screen.findByText(/A Sondatlas ainda não acompanha nenhuma probe/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Começar pela fase Conhecer' })).toHaveAttribute('href', '#/conhecer')
  expect(screen.getByRole('link', { name: 'Já tenho uma probe' })).toHaveAttribute('href', '#/acompanhar')
  const menu = within(screen.getByRole('navigation', { name: 'Páginas do dashboard' }))
  expect(menu.getByRole('link', { name: /^Minha probe/ })).toHaveAccessibleName('Minha probe')
  expect(screen.queryByRole('heading', { name: 'Explorador de ping' })).not.toBeInTheDocument()
})

it('opens Minha probe with a fresh status before the ping history', async () => {
  const ripeCalls = stubProbeBackend(connected, 1017210)
  window.location.hash = '#/acompanhar'
  render(<App />)
  await screen.findByText('A Sondatlas acompanha a probe 1017210.')
  await waitFor(() => expect(ripeCalls()).toBe(1))
  window.location.hash = '#/minha-probe'
  expect(await screen.findByRole('heading', { name: 'Minha probe 1017210' })).toBeInTheDocument()
  await waitFor(() => expect(ripeCalls()).toBe(2))
  expect(within(screen.getByRole('main')).getByText('Conectada')).toBeInTheDocument()
  expect(within(screen.getByRole('main')).queryByRole('link', { name: /Minha probe/ })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Explorador de ping' })).toBeInTheDocument()
})
