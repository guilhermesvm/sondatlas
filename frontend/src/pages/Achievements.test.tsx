import { screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../test/render'
import { BadgesProvider } from '../features/achievements/BadgesProvider'
import Achievements from './Achievements'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
const first = 1791940871

function stubBackend(account: unknown) {
  const mock = vi.fn((url: string) => {
    if (url === '/api/account') return json(account)
    if (url === '/api/challenges?oldest=true&type=traceroute') return json({ count: 0, challenges: [] })
    if (url === '/api/challenges?oldest=true&group=true') return json({ count: 1, challenges: [{ id: 228400000, type: 'ping', target: 'google.com', created: first + 86400 * 20, probe_id: 1017210, group: true, probes: 11 }] })
    if (url === '/api/challenges?oldest=true') return json({ count: 12, challenges: Array.from({ length: 12 }, (_, index) => ({
      id: 228248657 + index, type: 'ping', target: 'google.com', created: first + 86400 * index, probe_id: 1017210,
    })) })
    if (url.startsWith('https://atlas.ripe.net/api/v2/probes/?asn_v4=64500')) {
      return json({ next: 'https://atlas.ripe.net/api/v2/probes/?page=2', results: [{ first_connected: first + 60 }] })
    }
    if (url.startsWith('https://atlas.ripe.net/api/v2/measurements/7000/results/?probe_ids=1017210')) return json([
      { timestamp: first + 44400, event: 'connect' }, { timestamp: first, event: 'connect' },
      { timestamp: first + 43200, event: 'disconnect' }, { timestamp: first + 94400, event: 'disconnect' },
    ])
    if (url === 'https://atlas.ripe.net/api/v2/probes/?page=2') return json({ next: null, results: [{ first_connected: first }, { first_connected: null }] })
    return json({})
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const badge = (name: string) => within(screen.getByRole('listitem', { name }))

it('shows the badges of the linked probes, the progress of the next ones and the pioneer check', async () => {
  stubBackend({ connected: true, probes: [{
    id: 1017210, description: null, is_public: true, status: { id: 1, name: 'Connected', since: null },
    first_connected: first, total_uptime: 86896, asn_v4: 64500,
  }], credits: { current_balance: 150000, estimated_daily_income: 25000 }, missing_permissions: [] })
  render(<BadgesProvider><Achievements /></BadgesProvider>)
  expect(await screen.findByText('9 de 18 conquistadas')).toBeInTheDocument()
  expect(badge('Primeiro contato').getByText(/^Conquistada em \d\d\/10\/2026 pela probe 1017210$/)).toBeInTheDocument()
  expect(badge('Pioneiro').getByText(/^Conquistada em \d\d\/10\/2026 pela probe 1017210$/)).toBeInTheDocument()
  expect(badge('24 horas no ar').getByText('Conquistada em 14/10/2026 pela probe 1017210')).toBeInTheDocument()
  expect(badge('Resiliente').getByText('Conquistada em 14/10/2026 pela probe 1017210')).toBeInTheDocument()
  expect(badge('Maratona').getByText('Recorde: 14 horas')).toBeInTheDocument()
  expect(badge('7 dias no ar').getByText('Faltam cerca de 6 dias')).toBeInTheDocument()
  expect(badge('7 dias no ar').getByRole('progressbar')).toBeInTheDocument()
  expect(badge('Colecionador').getByText('1 de 2 probes')).toBeInTheDocument()
  expect(badge('100 mil créditos').getByText('Conquistada. Saldo de 150.000')).toBeInTheDocument()
  expect(badge('1 milhão de créditos').getByText('Faltam cerca de 34 dias')).toBeInTheDocument()
  expect(badge('Primeira sondagem').getByText(/^Conquistada em \d\d\/10\/2026 pela probe 1017210$/)).toBeInTheDocument()
  expect(badge('Explorador').getByText(`Conquistada em ${new Date((first + 86400 * 9) * 1000).toLocaleDateString('pt-BR')} pela probe 1017210`)).toBeInTheDocument()
  expect(badge('Navegador').getByText('Faltam 13 desafios')).toBeInTheDocument()
  expect(badge('Navegador').getByRole('progressbar')).toBeInTheDocument()
  expect(badge('Primeiro caminho').getByText('Ainda não')).toBeInTheDocument()
  expect(badge('Volta ao mundo').getByText(`Conquistada em ${new Date((first + 86400 * 20) * 1000).toLocaleDateString('pt-BR')} pela probe 1017210`)).toBeInTheDocument()
})

it('keeps the goals visible and points to the settings without a linked account', async () => {
  stubBackend({ connected: false })
  render(<BadgesProvider><Achievements /></BadgesProvider>)
  expect(await screen.findByRole('link', { name: 'Ir para Configurações' })).toHaveAttribute('href', '#/configuracoes')
  expect(screen.getAllByRole('listitem')).toHaveLength(18)
  expect(badge('Primeiro contato').getByText('Ainda não')).toBeInTheDocument()
  expect(screen.queryByText(/conquistadas$/)).not.toBeInTheDocument()
  expect(badge('Cartógrafo').getByText('Ainda não')).toBeInTheDocument()
})
