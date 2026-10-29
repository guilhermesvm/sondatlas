import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../../test/render'
import AchievementBell from './AchievementBell'
import { BadgesProvider } from './BadgesProvider'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
const key = 'sondatlas.conquistas.sino'
const now = Math.floor(Date.now() / 1000)
const first = now - 86400 * 60

const linked = {
  connected: true, missing_permissions: [],
  probes: [{ id: 1017210, description: null, is_public: true, status: { id: 1, name: 'Connected', since: null }, first_connected: first, total_uptime: 3600, asn_v4: 64500 }],
  credits: { current_balance: 1000, estimated_daily_income: 25000 },
}

// The first challenge was created a minute ago, so "Primeira sondagem" is the only badge with a recent date.
// pending holds back the answers whose address starts with it, to show what the bell does before they arrive.
function stubBackend(account: unknown, pending?: string) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (pending && url.startsWith(pending)) return new Promise<Response>(() => {})
    if (url === '/api/account') return json(account)
    if (url === '/api/challenges?oldest=true&made=true') return json({ count: 1, challenges: [{ id: 228700000, type: 'ping', target: 'google.com', created: now - 60, probe_id: 1017210 }] })
    if (url.startsWith('/api/challenges')) return json({ count: 0, challenges: [] })
    if (url.startsWith('https://atlas.ripe.net/api/v2/probes/?asn_v4=')) return json({ next: null, results: [{ first_connected: first }] })
    if (url.startsWith('https://atlas.ripe.net/api/v2/measurements/7000/')) return json([])
    return json({})
  }))
}

const renderBell = () => render(<BadgesProvider><AchievementBell /></BadgesProvider>)
const row = (name: string) => screen.getByText(name).closest('li')!

it('lists a badge unlocked after the last opening as new, and shows it read the next time', async () => {
  localStorage.setItem(key, String((now - 3600) * 1000))
  stubBackend(linked)
  renderBell()
  const bell = await screen.findByRole('button', { name: 'Conquistas: 1 nova' })
  expect(bell.querySelector('.bell-dot')).not.toBeNull()
  await userEvent.click(bell)
  expect(await screen.findByText('Conquistas recentes')).toBeInTheDocument()
  expect(row('Primeira sondagem')).toHaveAttribute('data-read', 'false')
  expect(row('Primeira sondagem')).toHaveTextContent('nova')
  expect(row('Primeiro contato')).toHaveAttribute('data-read', 'true')
  expect(screen.getByRole('link', { name: 'Ver as conquistas' })).toHaveAttribute('href', '#/conquistas')
  await vi.waitFor(() => expect(Number(localStorage.getItem(key))).toBeGreaterThan((now - 3600) * 1000))

  await userEvent.click(screen.getByRole('button', { name: 'Conquistas: nenhuma nova' }))
  await userEvent.click(screen.getByRole('button', { name: 'Conquistas: nenhuma nova' }))
  expect(screen.getByRole('button', { name: 'Conquistas: nenhuma nova' }).querySelector('.bell-dot')).toBeNull()
  expect(row('Primeira sondagem')).toHaveAttribute('data-read', 'true')
  expect(row('Primeira sondagem')).not.toHaveTextContent('nova')
})

it('shows the bell while the account is read, saying the badges are being checked', async () => {
  stubBackend(linked, '/api/account')
  renderBell()
  await userEvent.click(screen.getByRole('button', { name: 'Conquistas: conferindo' }))
  expect(await screen.findByText('Conferindo as suas conquistas…')).toBeInTheDocument()
})

it('lights up as soon as the new badge is known, without waiting for the slowest source', async () => {
  localStorage.setItem(key, String((now - 3600) * 1000))
  stubBackend(linked, 'https://atlas.ripe.net/api/v2/probes/?asn_v4=')
  renderBell()
  expect(await screen.findByRole('button', { name: 'Conquistas: 1 nova' })).toBeInTheDocument()
})

it('stays quiet on the first use, listing the badges already earned as read', async () => {
  stubBackend(linked)
  renderBell()
  await userEvent.click(await screen.findByRole('button', { name: 'Conquistas: nenhuma nova' }))
  await vi.waitFor(() => expect(localStorage.getItem(key)).not.toBeNull())
  expect(row('Primeira sondagem')).toHaveAttribute('data-read', 'true')
  expect(screen.queryByText('nova')).not.toBeInTheDocument()
})

it('invites to link the account when there is none, and still works with blocked storage', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  stubBackend(linked)
  const { unmount } = renderBell()
  expect(await screen.findByRole('button', { name: 'Conquistas: nenhuma nova' })).toBeInTheDocument()
  unmount()

  stubBackend({ connected: false })
  renderBell()
  await userEvent.click(await screen.findByRole('button', { name: 'Conquistas' }))
  expect(await screen.findByText('Vincule a sua conta do RIPE Atlas para ver as suas conquistas.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ir para Configurações' })).toHaveAttribute('href', '#/configuracoes')
  expect(document.querySelector('.bell-dot')).toBeNull()
})

it('closes the list when a link in it opens another page', async () => {
  stubBackend(linked)
  renderBell()
  await userEvent.click(await screen.findByRole('button', { name: 'Conquistas: nenhuma nova' }))
  await userEvent.click(await screen.findByRole('link', { name: 'Ver as conquistas' }))
  await vi.waitFor(() => expect(window.location.hash).toBe('#/conquistas'))
  await vi.waitFor(() => expect(screen.queryByText('Conquistas recentes')).not.toBeInTheDocument())
  window.location.hash = ''
})
