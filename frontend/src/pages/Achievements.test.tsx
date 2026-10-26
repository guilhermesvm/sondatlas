import { screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../test/render'
import Achievements from './Achievements'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
const first = 1791940871

function stubBackend(account: unknown) {
  const mock = vi.fn((url: string) => {
    if (url === '/api/account') return json(account)
    if (url.startsWith('https://atlas.ripe.net/api/v2/probes/?asn_v4=64500')) {
      return json({ next: 'https://atlas.ripe.net/api/v2/probes/?page=2', results: [{ first_connected: first + 60 }] })
    }
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
  }] })
  render(<Achievements />)
  expect(await screen.findByText('4 de 10 conquistadas')).toBeInTheDocument()
  expect(badge('Primeiro contato').getByText(/^Conquistada\. Probe 1017210, em /)).toBeInTheDocument()
  expect(badge('Pioneiro').getByText('Conquistada. Probe 1017210')).toBeInTheDocument()
  expect(badge('24 horas no ar').getByText('Conquistada. Probe 1017210')).toBeInTheDocument()
  expect(badge('7 dias no ar').getByText('Faltam cerca de 6 dias')).toBeInTheDocument()
  expect(badge('7 dias no ar').getByRole('progressbar')).toBeInTheDocument()
  expect(badge('Colecionador').getByText('1 de 2 probes')).toBeInTheDocument()
})

it('keeps the goals visible and points to the settings without a linked account', async () => {
  stubBackend({ connected: false })
  render(<Achievements />)
  expect(await screen.findByRole('link', { name: 'Ir para Configurações' })).toHaveAttribute('href', '#/configuracoes')
  expect(screen.getAllByRole('listitem')).toHaveLength(10)
  expect(badge('Primeiro contato').getByText('Ainda não')).toBeInTheDocument()
  expect(screen.queryByText(/conquistadas$/)).not.toBeInTheDocument()
})
