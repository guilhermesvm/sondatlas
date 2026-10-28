import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { catalog, history, ping } from '../../test/fixtures'
import { mockApi } from '../../test/mock-api'
import { render } from '../../test/render'
import { busiestPeriodQuestion, fastestTargetQuestion, hopCountQuestion, nearestRootQuestion } from './questions'

afterEach(() => { vi.unstubAllGlobals(); window.location.hash = '' })

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))

it('offers the exercises from the index and from the end of the lessons that have them', async () => {
  mockApi()
  window.location.hash = '#/aprender'
  const { unmount } = render(<App />)
  expect(screen.getByRole('link', { name: 'Fazer os exercícios de Ping' })).toHaveAttribute('href', '#/aprender/ping/exercicios')
  expect(screen.getByRole('link', { name: 'Fazer os exercícios de Traceroute' })).toHaveAttribute('href', '#/aprender/traceroute/exercicios')
  expect(screen.queryByRole('link', { name: /exercícios de Créditos/ })).not.toBeInTheDocument()
  unmount()
  window.location.hash = '#/aprender/ip'
  render(<App />)
  expect(within(screen.getByRole('region', { name: 'Exercícios' })).getByRole('link', { name: 'Fazer os exercícios' })).toHaveAttribute('href', '#/aprender/ip/exercicios')
})

it('asks one question at a time, explains every answer and shows the score at the end, without a followed probe', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => json(url === '/api/probe' ? { probe_id: null } : {})))
  window.location.hash = '#/aprender/ip/exercicios'
  render(<App />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Exercícios: IP e endereços' })).toBeInTheDocument()
  expect(screen.getByText(/Acompanhe uma probe para ganhar perguntas com os dados dela/)).toBeInTheDocument()
  expect(screen.getByText('Pergunta 1 de 4')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '2001:7fd::1' }))
  expect(screen.getByText('Não é essa. A resposta é: 193.0.14.129.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '2001:7fd::1' })).toHaveAttribute('data-state', 'wrong')
  expect(screen.getByRole('button', { name: '193.0.14.129' })).toHaveAttribute('data-state', 'right')
  for (const answer of ['Porque os endereços IPv4 acabaram', /Troca o endereço privado/, 'Sim, o endereço privado só vale dentro de cada rede']) {
    await userEvent.click(screen.getByRole('button', { name: /Próxima pergunta|Ver o resultado/ }))
    await userEvent.click(screen.getByRole('button', { name: answer }))
    expect(screen.getByText('Isso.')).toBeInTheDocument()
  }
  await userEvent.click(screen.getByRole('button', { name: 'Ver o resultado' }))
  expect(screen.getByText('3 de 4')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Voltar à lição' })).toHaveAttribute('href', '#/aprender/ip')
  await userEvent.click(screen.getByRole('button', { name: 'Refazer os exercícios' }))
  expect(screen.getByText('Pergunta 1 de 4')).toBeInTheDocument()
})

it('adds questions from the followed probe on the traceroute: the nearest root server and the hop of the K-root', async () => {
  const averages: Record<number, number> = { 1001: 12, 1004: 13, 1009: 150, 1010: 180, 1011: 140, 1005: 40 }
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/probe') return json({ probe_id: 1017210 })
    if (url === '/api/targets') return json(catalog)
    if (url.startsWith('/api/')) return json(history())
    if (url.includes('/measurements/5001/latest/')) return json([{ dst_addr: '193.0.14.129', result: [
      { hop: 1, result: [{ from: '192.168.1.1' }] }, { hop: 2, result: [{ x: '*' }] }, { hop: 3, result: [{ from: '193.0.14.129' }] },
    ] }])
    const id = Number(url.match(/measurements\/(\d+)\/latest/)?.[1])
    if (id) return json(averages[id] ? [{ avg: averages[id], rcvd: 3 }] : [])
    return json({ id: 1017210, is_public: true, status: { id: 1, name: 'Connected', since: null } })
  }))
  window.location.hash = '#/aprender/traceroute/exercicios'
  render(<App />)
  expect(await screen.findByText(/4 perguntas sobre a lição e 2 com os dados da sua probe/)).toBeInTheDocument()
  for (let index = 0; index < 4; index++) {
    await userEvent.click(screen.getAllByRole('button').find(button => button.classList.contains('exercise-option'))!)
    await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }))
  }
  expect(screen.getByText('Pergunta 5 de 6, com os dados da sua probe')).toBeInTheDocument()
  expect(screen.getAllByRole('button').filter(button => button.classList.contains('exercise-option')).map(button => button.textContent))
    .toEqual(['A-root', 'B-root', 'I-root', 'K-root'])
  await userEvent.click(screen.getByRole('button', { name: 'K-root' }))
  expect(screen.getByText(/Do mais perto ao mais longe: K-root 12 ms, F-root 13 ms, I-root 40 ms/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }))
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  expect(screen.getByText('Isso.')).toBeInTheDocument()
})

it('builds the data questions only when the data is enough to answer them', () => {
  const at = (hour: number, rtt: number) => ping({ timestamp: new Date(2026, 9, 27, hour, 30).toISOString(), rtt_avg_ms: rtt })
  const day = Array.from({ length: 80 }, (_, index) => at(index % 24, 20))
  const busiest = busiestPeriodQuestion([...day, at(14, 95)], 'K-root', 20)
  expect(busiest?.options[busiest.answer]).toBe('À tarde (12h às 18h)')
  expect(busiest?.explanation).toMatch(/^O maior tempo médio até o K-root foi 95 ms, às 14:30, à tarde\. O tempo típico do dia foi 20 ms\./)
  expect(busiestPeriodQuestion(day.slice(0, 10), 'K-root', 20)).toBeNull()

  expect(fastestTargetQuestion([{ name: 'K-root', typical: 20 }, { name: 'Google', typical: 58 }])?.answer).toBe(0)
  expect(fastestTargetQuestion([{ name: 'K-root', typical: 20 }, { name: 'Google', typical: null }])).toBeNull()

  expect(nearestRootQuestion([{ name: 'K-root', avg: 12 }, { name: 'F-root', avg: 12.3 }, { name: 'I-root', avg: 13 }, { name: 'A-root', avg: 150 }])).toBeNull()
  const hops = hopCountQuestion(2)
  expect(hops.options).toEqual(['2', '5', '9'])
  expect(hops.options[hops.answer]).toBe('2')
})
