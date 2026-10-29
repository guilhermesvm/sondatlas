import { vi } from 'vitest'
import { catalog, history, latestPing, probeStatus } from './fixtures'

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))

export function mockApi(result = history(), google = result) {
  const mock = vi.fn((path: string, _init?: RequestInit) => {
    if (path === '/api/targets') return json(catalog)
    const params = new URL(path, 'http://localhost').searchParams
    const id = Number(params.get('measurement_id'))
    const data = id === 1001 ? result : google
    return json({ ...data, measurement_id: id, start: params.get('start'), stop: params.get('stop') })
  })
  // The probe status shown in the menu and the account read for the badges bell stay out of `mock`, so tests count only the page's own requests.
  vi.stubGlobal('fetch', (path: string, init?: RequestInit) => {
    if (path === '/api/probe') return json({ probe_id: catalog.probe_id })
    if (path === '/api/account') return json({ connected: false })
    if (path.startsWith('https://atlas.ripe.net/api/v2/measurements/')) return json(latestPing)
    if (path.startsWith('https://atlas.ripe.net/')) return json(probeStatus)
    return mock(path, init)
  })
  return mock
}
