import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ProbeProvider } from '../features/probe-status/ProbeProvider'
import { render } from '../test/render'
import Challenges from './Challenges'

afterEach(() => { vi.unstubAllGlobals(); window.location.hash = '' })

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

const linked = {
  connected: true, missing_permissions: [],
  probes: [
    { id: 1017210, description: 'Casa', is_public: true, status: { id: 1, name: 'Connected', since: null } },
    { id: 1018246, description: null, is_public: true, status: { id: 2, name: 'Disconnected', since: null } },
  ],
  credits: { current_balance: 1214346, estimated_daily_income: 29113 },
}

const round = {
  timestamp: 1793049887, dst_name: 'google.com', dst_addr: '142.250.0.1', from: '203.0.113.77', size: 48, ttl: 117,
  sent: 3, rcvd: 3, min: 14, avg: 15, max: 16, result: [{ rtt: 14 }, { rtt: 15 }, { rtt: 16 }],
}

const detail = { target: 'google.com', type: 'ping', probes: [{ id: 1017210 }] }

function stubBackend(account: unknown, results: unknown[] = [round]) {
  const mock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/account') return json(account)
    if (url === '/api/challenges/ping') return json({ measurement_id: 123456789 })
    if (url.startsWith('https://atlas.ripe.net/api/v2/measurements/123456789/?')) return json(detail)
    if (url.startsWith('https://atlas.ripe.net/api/v2/measurements/123456789/results/')) return json(results)
    if (url.startsWith('https://atlas.ripe.net/api/v2/measurements/1001/latest/?probe_ids=1017210')) return json([{ avg: 30, rcvd: 3 }])
    if (url === '/api/probe') return json({ probe_id: null })
    return json({}, init ? 500 : 200)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const renderChallenges = () => render(<ProbeProvider><Challenges /></ProbeProvider>)

it('creates a ping from a connected probe after showing the cost, and explains the result', async () => {
  const mock = stubBackend(linked)
  renderChallenges()
  const destination = await screen.findByRole('combobox', { name: 'Destino' })
  await userEvent.type(destination, 'Google.com')
  await userEvent.click(screen.getByRole('radio', { name: '5' }))
  expect(screen.getByLabelText('Descrição (opcional)')).toHaveAttribute('placeholder', 'Sondatlas: ping para google.com')
  await userEvent.click(screen.getByRole('button', { name: 'Ver o custo' }))
  const dialog = screen.getByRole('dialog', { name: 'Criar este ping?' })
  expect(dialog).toHaveTextContent('Da probe 1017210 até google.com, com 5 pacotes.')
  expect(dialog).toHaveTextContent('Custa cerca de 10 créditos, cobrados nas próximas 4 a 6 horas. Seu saldo: 1.214.346.')
  expect(dialog).toHaveTextContent('A medição fica pública no RIPE Atlas')
  expect(dialog).toHaveTextContent('Ela leva a etiqueta sondatlas')
  expect(mock.mock.calls.some(([url]) => url === '/api/challenges/ping')).toBe(false)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar o ping' }))
  const post = mock.mock.calls.find(([url]) => url === '/api/challenges/ping')
  expect(post?.[1]?.body).toBe(JSON.stringify({ probe_id: 1017210, target: 'google.com', packets: 5, description: null }))
  expect(window.location.hash).toBe('#/desafios/123456789')
  expect(await screen.findByText(/3 enviados, 3 recebidos, 0% de perda/)).toBeInTheDocument()
  expect(screen.getByText('15 ms')).toBeInTheDocument()
  expect(await screen.findByText(/O ping que a sua probe faz sozinha até o K-root leva cerca de 30 ms, então google.com está mais perto/)).toBeInTheDocument()
  expect(screen.getByText('3 de 3 pacotes')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'página dela' })).toHaveAttribute('href', 'https://atlas.ripe.net/measurements/123456789/')
  expect(document.body).not.toHaveTextContent('203.0.113.77')
})

it('checks the destination before showing the cost', async () => {
  const mock = stubBackend(linked)
  renderChallenges()
  await userEvent.click(await screen.findByRole('button', { name: 'Ver o custo' }))
  expect(screen.getByText('Escolha ou digite um destino.')).toBeInTheDocument()
  await userEvent.type(screen.getByRole('combobox', { name: 'Destino' }), '192.168.1.1')
  await userEvent.click(screen.getByRole('button', { name: 'Ver o custo' }))
  expect(screen.getByText('Digite um nome, como google.com, ou um endereço IPv4 público.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(mock.mock.calls.some(([url]) => url === '/api/challenges/ping')).toBe(false)
})

it('asks for the measurement permission or a linked account before any challenge', async () => {
  stubBackend({ ...linked, missing_permissions: ['measurements'] })
  const { unmount } = renderChallenges()
  const alert = await screen.findByText(/Para os desafios, a chave precisa de/)
  expect(within(alert).getByText('Schedule a new measurement').tagName).toBe('STRONG')
  expect(screen.queryByRole('button', { name: 'Ver o custo' })).not.toBeInTheDocument()
  unmount()
  stubBackend({ connected: false })
  renderChallenges()
  expect(await screen.findByText('Vincule a sua conta do RIPE Atlas')).toBeInTheDocument()
})

it('opens a result from its own address and confirms before leaving while the probe still measures', async () => {
  window.location.hash = '#/desafios/123456789'
  const mock = stubBackend({ connected: false }, [])
  renderChallenges()
  expect(await screen.findByText('Ping da probe 1017210 até google.com')).toBeInTheDocument()
  expect(screen.getByText(/A probe está medindo/)).toBeInTheDocument()
  expect(screen.queryByText('Vincule a sua conta do RIPE Atlas')).not.toBeInTheDocument()
  expect(mock.mock.calls.some(([url]) => url === '/api/challenges/ping')).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Fazer outro ping' }))
  const dialog = screen.getByRole('dialog', { name: 'Sair antes do resultado?' })
  expect(dialog).toHaveTextContent('A probe continua medindo, e o resultado fica guardado no RIPE Atlas.')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Esperar o resultado' }))
  expect(window.location.hash).toBe('#/desafios/123456789')
  await userEvent.click(screen.getByRole('button', { name: 'Fazer outro ping' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Sair antes do resultado?' })).getByRole('button', { name: 'Fazer outro ping' }))
  expect(window.location.hash).toBe('#/desafios')
  expect(await screen.findByText('Vincule a sua conta do RIPE Atlas')).toBeInTheDocument()
})
