import { vi } from 'vitest'
import { catalog, history } from './fixtures'

export function mockApi(result = history(), google = result) {
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
