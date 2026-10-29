import { screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BadgesProvider } from '../features/achievements/BadgesProvider'
import { finishRound } from '../features/exercises/progress'
import { ProbeProvider } from '../features/probe-status/ProbeProvider'
import { render } from '../test/render'
import Achievements from './Achievements'
import Explore from './Explore'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
const first = 1791940871

const linked = {
  connected: true, missing_permissions: [],
  probes: [{ id: 1017210, description: null, is_public: true, status: { id: 1, name: 'Connected', since: null }, first_connected: first, total_uptime: 86896, asn_v4: 64500 }],
  credits: { current_balance: 150000, estimated_daily_income: 25000 },
}

function stubBackend(account: unknown, followed: number | null = 1017210, challenges = 13) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/account') return json(account)
    if (url === '/api/probe') return json({ probe_id: followed })
    if (url.startsWith('/api/challenges')) return json({ count: challenges, challenges: [] })
    if (url.startsWith('https://atlas.ripe.net/api/v2/probes/?asn_v4=')) return json({ next: null, results: [{ first_connected: first }] })
    if (url.startsWith('https://atlas.ripe.net/api/v2/measurements/7000/')) return json([])
    if (url.startsWith('https://atlas.ripe.net/api/v2/probes/1017210/')) return json(linked.probes[0])
    return json({})
  }))
}

const milestone = (name: RegExp) => within(screen.getByText(name).closest('li')!)
const renderExplore = () => render(<ProbeProvider><BadgesProvider><Explore /></BadgesProvider></ProbeProvider>)

it('shows what the person already did with real data, and where to finish the rest', async () => {
  finishRound('ip', 4, 5)
  finishRound('ping', 3, 4)
  stubBackend(linked)
  const { unmount } = renderExplore()
  expect(await screen.findByText(`A 1017210 está conectada. A primeira conexão foi em ${new Date(first * 1000).toLocaleDateString('pt-BR')}.`)).toBeInTheDocument()
  expect(milestone(/^Probe no ar/).getByText('Feito', { exact: false })).toBeInTheDocument()
  expect(await screen.findByText('A Sondatlas guarda o histórico de ping da 1017210.')).toBeInTheDocument()
  expect(screen.getByText('2 de 3 lições com exercícios respondidos neste navegador.')).toBeInTheDocument()
  expect(milestone(/^Exercícios/).getByRole('link', { name: 'Ir para Aprender' })).toHaveAttribute('href', '#/aprender')
  expect(await screen.findByText('Você criou 13 medições com os seus créditos.')).toBeInTheDocument()
  const earned = (await screen.findByText(/^\d+ de \d+ conquistadas\.$/)).textContent!.replace('.', '')
  expect(milestone(/^Conquistas/).getByRole('link', { name: 'Ver as conquistas' })).toHaveAttribute('href', '#/conquistas')
  unmount()

  render(<BadgesProvider><Achievements /></BadgesProvider>)
  expect(await screen.findByText(earned)).toBeInTheDocument()
})

it('turns each missing step into a link to where it is done', async () => {
  stubBackend({ connected: false }, null)
  renderExplore()
  const probe = milestone(/^Probe no ar/)
  expect(await probe.findByText(/Vincule a sua conta do RIPE Atlas/)).toBeInTheDocument()
  expect(probe.getByText('Falta', { exact: false })).toBeInTheDocument()
  expect(probe.getByRole('link', { name: 'Ir para Configurações' })).toHaveAttribute('href', '#/configuracoes')
  expect(await milestone(/^Probe acompanhada/).findByRole('link', { name: 'Ir para Acompanhar' })).toHaveAttribute('href', '#/acompanhar')
  expect(milestone(/^Exercícios/).getByRole('link', { name: 'Ir para Aprender' })).toHaveAttribute('href', '#/aprender')
  expect(milestone(/^Desafios/).getByRole('link', { name: 'Ir para Configurações' })).toBeInTheDocument()
  expect(milestone(/^Conquistas/).getByRole('link', { name: 'Ir para Configurações' })).toBeInTheDocument()
})

it('groups what comes next by intent, with the Path Analysis of the own probe, without saying that other probes measure it', async () => {
  stubBackend(linked)
  renderExplore()
  const ahead = within(screen.getByRole('region', { name: 'Daqui para a frente' }))
  expect(ahead.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual([
    'Quer medir mais?', 'Quer ver os dados de outro jeito?', 'Quer programar?', 'Quer estudar mais?',
  ])
  expect(ahead.getByRole('link', { name: 'Ir para Desafios' })).toHaveAttribute('href', '#/desafios')
  expect(ahead.getByRole('link', { name: 'Abrir Anchors' })).toHaveAttribute('href', 'https://atlas.ripe.net/docs/howtos/anchors/')
  expect(await ahead.findByText(/Está na página da 1017210 no RIPE Atlas, na aba Results/)).toBeInTheDocument()
  expect(ahead.getByRole('link', { name: 'Abrir Path Analysis' })).toHaveAttribute('href', 'https://atlas.ripe.net/probes/1017210/results')
  expect(document.body).not.toHaveTextContent(/medem a sua probe/)
})
