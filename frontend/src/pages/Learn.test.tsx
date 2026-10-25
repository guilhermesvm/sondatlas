import { screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../app/App'
import { history, ping } from '../test/fixtures'
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
