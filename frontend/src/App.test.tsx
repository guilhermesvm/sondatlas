import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import MetricChart from './MetricChart'
import { catalog, history, ping } from './fixtures'
import { localInput } from './chart'

afterEach(() => vi.unstubAllGlobals())

function mockApi(result = history(), google = result) {
  const mock = vi.fn((path: string) => {
    if (path === '/api/targets') return Promise.resolve(new Response(JSON.stringify(catalog)))
    const params = new URL(path, 'http://localhost').searchParams
    const id = Number(params.get('measurement_id'))
    const data = id === 1001 ? result : google
    return Promise.resolve(new Response(JSON.stringify({ ...data, measurement_id: id, start: params.get('start'), stop: params.get('stop') })))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

async function fillPeriod() {
  await screen.findByRole('option', { name: /K-root/ })
  await userEvent.click(screen.getByRole('button', { name: 'Período personalizado' }))
  fireEvent.change(screen.getByLabelText('Início (horário local)'), { target: { value: localInput(new Date('2026-08-26T02:03:41Z')) } })
  fireEvent.change(screen.getByLabelText('Fim (horário local)'), { target: { value: localInput(new Date('2026-10-10T19:13:27Z')) } })
}

it('keeps Brazilian input and queried bounds consistent for the reported ambiguous date', async () => {
  const mock = mockApi(history([]))
  render(<App />)
  await fillPeriod()
  const start = screen.getByLabelText('Início (horário local)')
  const stop = screen.getByLabelText('Fim (horário local)')
  for (const field of [start, stop]) {
    expect(field).toHaveAttribute('type', 'text')
    expect(field).toHaveAttribute('placeholder', 'DD/MM/AAAA HH:mm:ss')
    expect(field).toHaveAccessibleDescription(expect.stringContaining('24 horas'))
  }
  fireEvent.change(start, { target: { value: '09/10/2026 00:00:00' } })
  fireEvent.change(stop, { target: { value: '09/10/2026 18:00:00' } })
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  await screen.findByRole('region', { name: 'Comparação dos pings do período' })
  const summary = screen.getByRole('region', { name: 'Comparação dos pings do período' })
  expect(summary).toHaveTextContent('09/10/2026, 00:00:00 GMT-3 → 09/10/2026, 18:00:00 GMT-3')
  expect(summary).not.toHaveTextContent('10/09/2026')
  expect(start).toHaveValue('09/10/2026 00:00:00')
  expect(stop).toHaveValue('09/10/2026 18:00:00')
  for (const [path] of mock.mock.calls.slice(1)) {
    const params = new URL(path, 'http://localhost').searchParams
    expect(params.get('start')).toBe('2026-10-09T03:00:00.000Z')
    expect(params.get('stop')).toBe('2026-10-09T21:00:00.000Z')
  }
})

it('reports invalid custom format before requesting either target', async () => {
  const mock = mockApi()
  render(<App />)
  await fillPeriod()
  fireEvent.change(screen.getByLabelText('Início (horário local)'), { target: { value: '2026-10-09T00:00:00' } })
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Use DD/MM/AAAA HH:mm:ss')
  expect(mock.mock.calls).toHaveLength(1)
  expect(screen.queryByRole('region', { name: 'Comparação dos pings do período' })).not.toBeInTheDocument()
})

it('loads the catalog and queries both targets with identical UTC bounds', async () => {
  const mock = mockApi(history([ping(), ping({ timestamp: '2026-08-26T02:08:43Z', rtt_avg_ms: null, packet_loss_percent: null })]))
  render(<App />)
  await fillPeriod()
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  expect(await screen.findByRole('img', { name: /RTT médio/ })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /Perda de pacotes/ })).toBeInTheDocument()
  expect(screen.getAllByText(/1 com valor · 1 indisponível/)).toHaveLength(2)
  expect(screen.getByText(/Probe 1017210 → K-root/)).toBeInTheDocument()
  expect(screen.getAllByText(/America\/Sao_Paulo/).length).toBeGreaterThan(0)
  const requests = mock.mock.calls.slice(1).map(([path]) => new URL(path, 'http://localhost').searchParams)
  expect(requests.map(params => params.get('measurement_id'))).toEqual(['1001', '86206926'])
  for (const params of requests) {
    expect(params.get('start')).toBe('2026-08-26T02:03:41.000Z')
    expect(params.get('stop')).toBe('2026-10-10T19:13:27.000Z')
  }
})

it('switches the detailed target without querying again or clearing the comparison', async () => {
  const mock = mockApi({ ...history([ping({ measurement_id: 86206926, target_name: 'Google' })]), measurement_id: 86206926 })
  render(<App />)
  await fillPeriod()
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  await screen.findByRole('region', { name: 'Resumo de Google' })
  await userEvent.selectOptions(screen.getByLabelText('Destino'), '86206926')
  expect(mock.mock.calls).toHaveLength(3)
  expect(screen.getByText(/Probe 1017210 → Google/)).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Resumo de K-root' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /RTT médio/ })).toBeInTheDocument()
})

it('distinguishes an empty successful period from an error', async () => {
  mockApi(history([]))
  render(<App />)
  await fillPeriod()
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  expect(await screen.findByText('Nenhum resultado neste período.')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByText('Ausência de registros não significa perda de pacotes.')).toBeInTheDocument()
})

it('shows a loading state and prevents duplicate requests', async () => {
  const complete: ((response: Response) => void)[] = []
  vi.stubGlobal('fetch', vi.fn((path: string) => path === '/api/targets'
    ? Promise.resolve(new Response(JSON.stringify(catalog)))
    : new Promise<Response>(resolve => { complete.push(resolve) })))
  render(<App />)
  await fillPeriod()
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  expect(screen.getByText('Consultando o histórico armazenado…')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Consultando/ })).toBeDisabled()
  complete[0](new Response(JSON.stringify(history())))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Resumo de K-root' })).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: /Consultando/ })).toBeDisabled()
  complete[1](new Response(JSON.stringify({ ...history(), measurement_id: 86206926 })))
  await screen.findByRole('img', { name: /RTT médio/ })
})

it('reports failure of either target without showing a partial comparison, then permits retry', async () => {
  const mock = mockApi()
  render(<App />)
  await fillPeriod()
  mock.mockResolvedValueOnce(new Response(JSON.stringify(history())))
  mock.mockResolvedValueOnce(new Response('upstream secret', { status: 503 }))
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('temporariamente indisponível')
  expect(screen.queryByText('Nenhum resultado neste período.')).not.toBeInTheDocument()
  expect(screen.queryByText('upstream secret')).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Comparação dos pings do período' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  await screen.findByRole('img', { name: /RTT médio/ })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('renders distinct summaries and removes both when the period changes', async () => {
  mockApi(history([
    ping({ rtt_avg_ms: 10 }), ping({ rtt_avg_ms: 30, packet_loss_percent: 100, timestamp: '2026-08-26T02:08:43Z' }),
    ping({ rtt_avg_ms: null, packet_loss_percent: null }),
  ]), history([ping({ rtt_avg_ms: 0, packet_loss_percent: 0 })]))
  render(<App />)
  await fillPeriod()
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  const root = await screen.findByRole('region', { name: 'Resumo de K-root' })
  expect(root).toHaveTextContent('20 ms')
  expect(root).toHaveTextContent('30 ms')
  expect(root).toHaveTextContent('25/08/2026, 23:08:43 GMT-3')
  expect(root).toHaveTextContent('2 rodadas com RTT disponível')
  expect(root).toHaveTextContent('1 / 2')
  const google = screen.getByRole('region', { name: 'Resumo de Google' })
  expect(within(google).getAllByText('0 ms')).toHaveLength(2)
  expect(google).toHaveTextContent('0 / 1')
  await userEvent.click(screen.getByLabelText('Últimos 7 dias'))
  expect(screen.queryByRole('region', { name: 'Comparação dos pings do período' })).not.toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('distinguishes an empty target from a recorded target with unavailable metrics', async () => {
  mockApi(history([]), history([ping({ rtt_avg_ms: null, packet_loss_percent: null })]))
  render(<App />)
  await fillPeriod()
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  const root = await screen.findByRole('region', { name: 'Resumo de K-root' })
  expect(root).toHaveTextContent('Sem registros neste período.')
  expect(root).not.toHaveTextContent('0 ms')
  const google = screen.getByRole('region', { name: 'Resumo de Google' })
  expect(within(google).getAllByText('Indisponível')).toHaveLength(3)
  expect(google).toHaveTextContent('0 rodadas com RTT disponível')
  expect(google).toHaveTextContent('0 rodadas com perda calculável')
  expect(google).not.toHaveTextContent('0 / 0')
  await userEvent.selectOptions(screen.getByLabelText('Destino'), '86206926')
  expect(screen.queryByText('Nenhum resultado neste período.')).not.toBeInTheDocument()
  expect(screen.getAllByText('Há registros, mas esta métrica está indisponível no período.')).toHaveLength(2)
})

it('validates period order locally before querying ping', async () => {
  const mock = mockApi()
  render(<App />)
  await fillPeriod()
  fireEvent.change(screen.getByLabelText('Fim (horário local)'), { target: { value: '25/08/2026 00:00:00' } })
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('anterior ao fim')
  expect(mock.mock.calls.every(([path]) => path === '/api/targets')).toBe(true)
})

it('allows retry when the catalog cannot be loaded', async () => {
  const mock = mockApi()
  mock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  render(<App />)
  await screen.findByRole('alert')
  await userEvent.click(screen.getByRole('button', { name: 'Tentar carregar alvos novamente' }))
  await screen.findByRole('option', { name: /K-root/ })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('does not draw a zero line when a recorded metric is wholly unavailable', () => {
  const result = history([ping({ rtt_avg_ms: null })])
  render(<MetricChart history={result} metric="rtt_avg_ms" />)
  expect(screen.getByText('Há registros, mas esta métrica está indisponível no período.')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it.each([["Últimas 24 horas", 1], ["Últimos 7 dias", 7]] as const)('queries %s relative to the current instant only on submit', async (label, days) => {
  const mock = mockApi()
  render(<App />)
  await screen.findByRole('option', { name: /K-root/ })
  expect(screen.queryByLabelText('Início (horário local)')).not.toBeInTheDocument()
  await userEvent.click(screen.getByLabelText(label))
  expect(mock.mock.calls).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  await waitFor(() => expect(mock.mock.calls).toHaveLength(3))
  const params = new URL(mock.mock.calls[1][0], 'http://localhost').searchParams
  const stop = Date.parse(params.get('stop')!)
  expect(stop - Date.parse(params.get('start')!)).toBe(days * 86400000)
  expect(Math.abs(stop - Date.now())).toBeLessThan(10000)
  const other = new URL(mock.mock.calls[2][0], 'http://localhost').searchParams
  expect(other.get('start')).toBe(params.get('start'))
  expect(other.get('stop')).toBe(params.get('stop'))
})

it('inspects actual loss and packet counts, with causal caveats in the secondary section', async () => {
  const result = history([ping({ packets_received: 0, packet_loss_percent: 100, rtt_avg_ms: null })])
  mockApi(result)
  render(<App />)
  await fillPeriod()
  await userEvent.click(screen.getByRole('button', { name: /^Consultar$/ }))
  await screen.findByRole('img', { name: /Perda de pacotes/ })
  fireEvent.focus(screen.getByLabelText('Rodada no gráfico de perda'))
  const detail = screen.getByLabelText('Detalhes da rodada de perda')
  expect(detail).toHaveTextContent('100%')
  expect(detail).toHaveTextContent('0/3 respostas')
  const summary = screen.getByText('Sobre esta medição')
  expect(summary.closest('details')).not.toHaveAttribute('open')
  expect(detail).not.toHaveTextContent('não comprova a causa')
  await userEvent.click(summary)
  expect(summary.closest('details')).toHaveAttribute('open')
  expect(summary.closest('details')).toHaveTextContent('não comprova a causa')
  expect(summary.closest('details')).toHaveTextContent('IP de destino observado: 193.0.14.129')
})

it('keeps separate same-timestamp records selectable and displays null as unavailable', () => {
  const result = history([ping(), ping({ rtt_avg_ms: null, destination_address: '193.0.14.130' })])
  const inspect = vi.fn()
  render(<MetricChart history={result} metric="rtt_avg_ms" onInspect={inspect} />)
  fireEvent.change(screen.getByLabelText('Rodada no gráfico de RTT'), { target: { value: '1' } })
  const detail = screen.getByLabelText('Detalhes da rodada de RTT')
  expect(screen.getByText('Rodada 2/2')).toBeInTheDocument()
  expect(detail).toHaveTextContent('Indisponível')
  expect(inspect).toHaveBeenCalledWith(result.results[1])
  expect(screen.getByLabelText('Rodada no gráfico de RTT')).toHaveAttribute('aria-valuetext', expect.stringContaining('Indisponível'))
  expect(detail).not.toHaveTextContent('0 ms')
})

it('selects the real nearest record on chart pointer interaction, including an unavailable metric', () => {
  const result = { ...history([ping(), ping({ timestamp: '2026-08-26T02:08:43Z', rtt_avg_ms: null })]), start: '2026-08-26T02:04:43Z', stop: '2026-08-26T02:12:43Z' }
  render(<MetricChart history={result} metric="rtt_avg_ms" />)
  const svg = screen.getByRole('img')
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 800 } as DOMRect)
  fireEvent(svg.querySelector('rect')!, new MouseEvent('pointerdown', { clientX: 780, bubbles: true }))
  expect(screen.getByText('Rodada 2/2')).toBeInTheDocument()
  expect(screen.getByLabelText('Detalhes da rodada de RTT')).toHaveTextContent('Indisponível')
})

it('formats values compactly without rounding chart coordinates or converting small positives to zero', () => {
  const record = Object.freeze(ping({ rtt_avg_ms: 0.04 }))
  render(<MetricChart history={history([record])} metric="rtt_avg_ms" />)
  fireEvent.focus(screen.getByLabelText('Rodada no gráfico de RTT'))
  expect(screen.getByLabelText('RTT médio da rodada')).toHaveTextContent('<0,1 ms')
  const marker = screen.getByRole('img').querySelector('.selected-dot')!
  expect(Number(marker.getAttribute('cy'))).toBeCloseTo(144 - 0.04 / 10 * 126)
  expect(record.rtt_avg_ms).toBe(0.04)
})
