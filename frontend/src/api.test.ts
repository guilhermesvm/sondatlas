import { afterEach, expect, it, vi } from 'vitest'
import { fetchHistory, fetchTargets } from './api'
import { catalog, history } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

it('uses the relative backend proxy without credentials or database inputs', async () => {
  const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(history())))
  vi.stubGlobal('fetch', mock)
  await fetchHistory(1017210, 1001, '2026-08-26T02:03:41Z', '2026-10-10T19:13:27Z', new AbortController().signal)
  const path = mock.mock.calls[0][0] as string
  const params = new URL(path, 'http://localhost').searchParams
  expect(path).toMatch(/^\/api\/ping\?/)
  expect([...params.keys()]).toEqual(['probe_id', 'measurement_id', 'start', 'stop'])
  expect(params.get('start')).toBe('2026-08-26T02:03:41Z')
})

it('reads target IDs and names from the backend', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog))))
  expect(await fetchTargets(new AbortController().signal)).toEqual(catalog)
})

it.each([404, 422, 503, 500])('reports HTTP %s without showing a raw error body', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream details', { status })))
  await expect(fetchTargets(new AbortController().signal)).rejects.toThrow()
  try { await fetchTargets(new AbortController().signal) } catch (error) {
    expect((error as Error).message).not.toContain('private upstream details')
  }
})

it('explains a network failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  await expect(fetchTargets(new AbortController().signal)).rejects.toThrow('Verifique se o backend está em execução')
})

it('rejects a malformed JSON response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')))
  await expect(fetchTargets(new AbortController().signal)).rejects.toThrow('resposta inválida')
})
