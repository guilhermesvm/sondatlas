import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { render } from '../../test/render'
import { mockApi } from '../../test/mock-api'
import type { ProbeDistribution } from '../../lib/api'

beforeEach(() => { window.location.hash = '#/minha-probe' })
afterEach(() => vi.unstubAllGlobals())

const distribution: ProbeDistribution = {
  collection_id: '2026-10-11_12-01-00_UTC', started_at_utc: '2026-10-11T12:00:00Z', finished_at_utc: '2026-10-11T12:01:00Z',
  source: 'https://atlas.ripe.net/api/v2/probes/?is_public=true&status=1', scope: 'public connected probes; anchors included',
  total_probes: 14098, brazil: { country_code: 'BR', probes: 123, share_percent: 100 * 123 / 14098 },
  top_countries: [...['US', 'DE', 'FR', 'GB', 'NL', 'RU', 'JP', 'CA', 'AU', 'IT'].map((country_code, index) => ({ country_code, probes: 2000 - index * 100, share_percent: 10 })),
    { country_code: 'BR', probes: 123, share_percent: 100 * 123 / 14098 }],
  duplicate_records: 2, api_count_min: 14098, api_count_max: 14104, count_mismatch: true,
}

it('reads global data only on opening and distinguishes no collection from zero before manual refresh', async () => {
  const mock = mockApi()
  render(<App />)
  await screen.findByRole('option', { name: 'K-root' })
  expect(mock.mock.calls).toHaveLength(1)
  mock.mockResolvedValueOnce(new Response(JSON.stringify({ distribution: null })))
  await userEvent.click(screen.getByRole('link', { name: 'Rede global' }))
  expect(await screen.findByText('Ainda não há uma coleta salva.')).toBeInTheDocument()
  expect(screen.getByText(/Ausência de coleta não significa zero probes/)).toBeInTheDocument()
  expect(mock.mock.calls[1][0]).toBe('/api/probe-distribution')
  expect(screen.queryByRole('region', { name: 'Total global' })).not.toBeInTheDocument()
  mock.mockResolvedValueOnce(new Response(JSON.stringify({ distribution })))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar distribuição' }))
  expect(await screen.findByText('Distribuição atualizada e salva.')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Total global' })).toHaveTextContent('14.098')
  expect(screen.getByRole('region', { name: 'Participação do Brasil' })).toHaveTextContent('123 probes · 0,87%')
  const rows = within(screen.getByRole('region', { name: 'Probes observadas por país' })).getAllByRole('listitem')
  expect(rows).toHaveLength(11)
  expect(rows.at(-1)).toHaveTextContent('Brasil BR123')
  expect(rows.at(-1)!.querySelector('.bar-track span')).toHaveStyle({ width: `${100 * 123 / 2000}%` })
  expect(screen.getByText(/Coleta: 11\/10\/2026, 09:00:00 GMT-3 → 11\/10\/2026, 09:01:00 GMT-3/)).toHaveTextContent('America/Sao_Paulo')
  expect(screen.getByText(/Deduplicar não recupera/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Atualizar distribuição' })).toBeEnabled()
})

it('keeps dated global data during loading, concurrency and failure, permits retry and leaves ping usable', async () => {
  let complete: (response: Response) => void = () => {}
  const mock = mockApi()
  render(<App />)
  await screen.findByRole('option', { name: 'K-root' })
  mock.mockResolvedValueOnce(new Response(JSON.stringify({ distribution })))
  await userEvent.click(screen.getByRole('link', { name: 'Rede global' }))
  await screen.findByRole('region', { name: 'Total global' })
  mock.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar distribuição' }))
  expect(screen.getByRole('button', { name: 'Atualizando…' })).toBeDisabled()
  expect(screen.getByText(/Coletando todas as páginas/)).toHaveAttribute('role', 'status')
  expect(screen.getByRole('region', { name: 'Total global' })).toHaveTextContent('14.098')
  expect(screen.getByText(/Coleta: 11\/10\/2026/)).toHaveTextContent('09:01:00')
  await userEvent.click(screen.getByRole('link', { name: 'Minha probe' }))
  await userEvent.click(screen.getByRole('button', { name: 'Consultar' }))
  await screen.findByRole('region', { name: 'Resumo de K-root' })
  await userEvent.click(screen.getByRole('link', { name: 'Rede global' }))
  expect(screen.getByRole('button', { name: 'Atualizando…' })).toBeDisabled()
  complete(new Response('raw failure', { status: 409 }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Já há uma coleta global em andamento')
  expect(screen.getByRole('button', { name: 'Atualizar distribuição' })).toBeEnabled()
  mock.mockResolvedValueOnce(new Response('private details', { status: 503 }))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar distribuição' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('A coleta anterior foi preservada')
  expect(screen.getByRole('region', { name: 'Total global' })).toHaveTextContent('14.098')
  mock.mockResolvedValueOnce(new Response(JSON.stringify({ distribution: { ...distribution, total_probes: 14100, finished_at_utc: '2026-10-11T13:01:00Z' } })))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar distribuição' }))
  expect(await screen.findByText('Distribuição atualizada e salva.')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Total global' })).toHaveTextContent('14.100')
  expect(screen.getByText(/Coleta: 11\/10\/2026/)).toHaveTextContent('10:01:00')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
