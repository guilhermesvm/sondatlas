import { screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../app/App'
import { catalog, history, ping } from '../test/fixtures'
import { mockApi } from '../test/mock-api'
import { render } from '../test/render'

afterEach(() => vi.unstubAllGlobals())

it('links only the ready lessons and points to the free RIPE NCC Academy courses', () => {
  mockApi()
  window.location.hash = '#/aprender'
  render(<App />)
  const basics = within(screen.getByRole('region', { name: 'Fundamentos de redes' }))
  expect(basics.getAllByRole('listitem')).toHaveLength(4)
  expect(basics.getByRole('link', { name: 'Ler a lição Ping' })).toHaveAttribute('href', '#/aprender/ping')
  expect(basics.getByRole('link', { name: 'Ler a lição IP e endereços' })).toHaveAttribute('href', '#/aprender/ip')
  expect(basics.queryByRole('link', { name: /DNS/ })).not.toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'RIPE Atlas' })).getAllByText('Em breve')).toHaveLength(2)
  const academy = within(screen.getByRole('region', { name: 'Para ir mais fundo: RIPE NCC Academy' }))
  expect(academy.getByRole('link', { name: 'Internet Measurements' })).toHaveAttribute('href', 'https://academy.ripe.net/mod/page/view.php?id=937')
})

it('teaches ping in four parts with the numbers of the followed probe', async () => {
  mockApi(history(), history([ping({ measurement_id: 86206926, target_name: 'Google', rtt_avg_ms: 30, packet_loss_percent: 33.3 })]))
  window.location.hash = '#/aprender/ping'
  render(<App />)
  expect(screen.getByRole('heading', { level: 1, name: 'Ping' })).toBeInTheDocument()
  const contents = within(screen.getByRole('navigation', { name: 'Nesta lição' }))
  expect(contents.getAllByRole('button').map(button => button.textContent)).toEqual(['O que é', 'O seu dado', 'Como ler', 'O que não mostra', 'Para ir mais fundo'])
  expect(await screen.findByText('perda em 1 de 1 rodadas')).toBeInTheDocument()
  const terminal = await screen.findByText(/ping k.root-servers.net \(193.0.14.129\), pacotes de 32 bytes/)
  expect(terminal).toHaveTextContent('resposta de 193.0.14.129: tempo=33 ms')
  expect(terminal).toHaveTextContent('3 enviados, 3 recebidos, 0% de perda')
  expect(document.body).not.toHaveTextContent('203.0.113.77')
  const notes = within(screen.getByRole('region', { name: 'Como ler' }))
  expect(notes.getByText(/é o tempo típico do K-root, o destino mais rápido/)).toHaveTextContent('no máximo uns 2.000 km de cabo')
  expect(notes.getByText(/tiveram alguma perda nas últimas 24 horas, somando os destinos/)).toHaveTextContent('1 de 2 rodadas')
  expect(notes.getByText(/TTL 51/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Voltar ao índice' })).toHaveAttribute('href', '#/aprender')
  expect(screen.queryByRole('link', { name: /^Voltar: / })).not.toBeInTheDocument()
})

it('reads a probe that measured only one destination', async () => {
  mockApi(history(), history([]))
  window.location.hash = '#/aprender/ping'
  render(<App />)
  expect(await screen.findByText('Sem resultados de Google nas últimas 24 horas. Nem toda probe participa de todas as medições automáticas.')).toBeInTheDocument()
  expect(screen.getByText(/é o tempo típico do K-root\. /)).toBeInTheDocument()
  expect(screen.getByText(/Nas últimas 24 horas, ela mediu K-root\./)).toBeInTheDocument()
})

it('keeps the lesson readable without a followed probe and sends unknown lessons to the index', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url === '/api/probe' ? { probe_id: null } : {})))))
  window.location.hash = '#/aprender/ping'
  render(<App />)
  expect(await screen.findByText('Acompanhe uma probe para ver os seus números aqui.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ir para Acompanhar' })).toHaveAttribute('href', '#/acompanhar')
  expect(screen.getByText(/é um exemplo de tempo de ida e volta/)).toBeInTheDocument()
  window.location.hash = '#/aprender/dns'
  expect(await screen.findByRole('heading', { level: 1, name: 'Aprender' })).toBeInTheDocument()
})

it('shows the private address and the provider of the followed probe but never its public address', async () => {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/probe') return json({ probe_id: 1017210 })
    if (url === '/api/targets') return json(catalog)
    if (url.includes('/probes/1017210/?fields=tags')) return json({ id: 1017210, tags: [{ slug: 'system-ipv4-rfc1918' }], asn_v4: 64500, address_v6: null, first_connected: 1787709821 })
    if (url.includes('/measurements/7000/results/')) return json([
      { timestamp: 1790000000, event: 'connect', asn: 64500 }, { timestamp: 1787709821, event: 'connect', asn: 64500 },
      { timestamp: 1788000000, event: 'connect', asn: 64501 }, { timestamp: 1788100000, event: 'disconnect', asn: null },
    ])
    if (url.includes('/measurements/1001/latest/')) return json([{ src_addr: '192.168.1.5', from: '203.0.113.77' }])
    if (url.includes('stat.ripe.net/data/as-overview')) return json({ data: { holder: url.includes('AS64501') ? 'AS64501 - Outra Rede' : 'AS64500 - Provedor Exemplo' } })
    return json({ id: 1017210, is_public: true, status: { id: 1, name: 'Connected', since: null } })
  }))
  window.location.hash = '#/aprender/ip'
  render(<App />)
  expect(screen.getByRole('heading', { level: 1, name: 'IP e endereços' })).toBeInTheDocument()
  const data = within(screen.getByRole('region', { name: 'O seu dado' }))
  expect(await data.findAllByText('192.168.1.5')).toHaveLength(2)
  expect(data.getAllByText('AS64500')).toHaveLength(3)
  expect(within(data.getByRole('list', { name: 'Caminho da probe até o K-root' })).getByText('AS25152')).toBeInTheDocument()
  expect(data.getByText('A sua probe já se conectou por 2 redes')).toBeInTheDocument()
  const [current, previous] = data.getAllByRole('listitem').filter(item => item.closest('.lesson-networks'))
  expect(current).toHaveTextContent('AS64500 Provedor Exemplo2 conexões, a mais recente em')
  expect(previous).toHaveTextContent('AS64501 Outra Rede1 conexão, a última em')
  expect(data.getByText('Não tem')).toBeInTheDocument()
  expect(data.getByText('system-ipv4-rfc1918')).toBeInTheDocument()
  expect(document.body).not.toHaveTextContent('203.0.113.77')
})

it('keeps the IP lesson readable without a followed probe', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url === '/api/probe' ? { probe_id: null } : {})))))
  window.location.hash = '#/aprender/ip'
  render(<App />)
  expect(await screen.findByText('Acompanhe uma probe para ver os endereços dela aqui.')).toBeInTheDocument()
  expect(screen.getByText(/é um exemplo de endereço/)).toBeInTheDocument()
})
