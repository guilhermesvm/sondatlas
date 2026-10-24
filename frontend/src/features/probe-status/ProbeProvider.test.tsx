import { act, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../../test/render'
import { ProbeProvider } from './ProbeProvider'
import ProbeStatusCard from './ProbeStatusCard'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function stubBackend(statusId: number) {
  const mock = vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url === '/api/probe'
    ? { probe_id: 1017210 }
    : { id: 1017210, is_public: true, status: { id: statusId, name: 'Status', since: null } }))))
  vi.stubGlobal('fetch', mock)
  return () => mock.mock.calls.filter(([url]) => url.startsWith('https://atlas.ripe.net/')).length
}

it('asks RIPE Atlas once when several parts of the page show the status', async () => {
  const ripeCalls = stubBackend(1)
  render(<ProbeProvider><ProbeStatusCard /><ProbeStatusCard /></ProbeProvider>)
  expect(await screen.findAllByText('Conectada')).toHaveLength(2)
  expect(ripeCalls()).toBe(1)
})

it('does not ask RIPE Atlas again by itself as time passes', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const ripeCalls = stubBackend(0)
  render(<ProbeProvider><ProbeStatusCard /></ProbeProvider>)
  await screen.findByText('Nunca conectou')
  await act(() => vi.advanceTimersByTimeAsync(600000))
  expect(ripeCalls()).toBe(1)
})
