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
function stubBackend(account: unknown) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/account') return json(account)
    if (url === '/api/challenges?oldest=true&made=true') return json({ count: 1, challenges: [{ id: 228700000, type: 'ping', target: 'google.com', created: now - 60, probe_id: 1017210 }] })
    if (url.startsWith('/api/challenges')) return json({ count: 0, challenges: [] })
    if (url.startsWith('https://atlas.ripe.net/api/v2/probes/?asn_v4=')) return json({ next: null, results: [{ first_connected: first }] })
    if (url.startsWith('https://atlas.ripe.net/api/v2/measurements/7000/')) return json([])
    return json({})
  }))
}

const renderBell = () => render(<BadgesProvider><AchievementBell /></BadgesProvider>)

it('lights up for a badge unlocked after the bell was last opened, and opening it shows the badge and turns the light off', async () => {
  localStorage.setItem(key, String((now - 3600) * 1000))
  stubBackend(linked)
  renderBell()
  const bell = await screen.findByRole('button', { name: 'Conquistas: 1 nova' })
  expect(bell.querySelector('.bell-dot')).not.toBeNull()
  await userEvent.click(bell)
  expect(await screen.findByText('Conquistas novas')).toBeInTheDocument()
  expect(screen.getByText('Primeira sondagem')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver as conquistas' })).toHaveAttribute('href', '#/conquistas')
  expect(screen.getByRole('button', { name: 'Conquistas: nenhuma nova' }).querySelector('.bell-dot')).toBeNull()
  expect(Number(localStorage.getItem(key))).toBeGreaterThan((now - 3600) * 1000)
})

it('stays quiet on the first use, counting from then on', async () => {
  stubBackend(linked)
  renderBell()
  expect(await screen.findByRole('button', { name: 'Conquistas: nenhuma nova' })).toBeInTheDocument()
  await vi.waitFor(() => expect(localStorage.getItem(key)).not.toBeNull())
  await userEvent.click(screen.getByRole('button', { name: 'Conquistas: nenhuma nova' }))
  expect(await screen.findByText('Nenhuma conquista nova desde a última vez')).toBeInTheDocument()
})

it('still works with blocked storage and hides without a linked account', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  stubBackend(linked)
  const { unmount } = renderBell()
  expect(await screen.findByRole('button', { name: 'Conquistas: nenhuma nova' })).toBeInTheDocument()
  unmount()

  stubBackend({ connected: false })
  renderBell()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/account', expect.anything()))
  expect(screen.queryByRole('button', { name: /^Conquistas/ })).not.toBeInTheDocument()
})
