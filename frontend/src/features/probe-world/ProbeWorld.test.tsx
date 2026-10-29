import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../../test/render'
import { ProbeProvider } from '../probe-status/ProbeProvider'
import ProbeWorld from './ProbeWorld'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

function stubRipe({ statusId = 1, network = 1, failing = false } = {}) {
  const mock = vi.fn((url: string) => {
    if (url === '/api/probe') return json({ probe_id: 1017210 })
    if (url.includes('fields=status')) return json({ id: 1017210, is_public: true, status: { id: statusId, name: statusId === 1 ? 'Connected' : 'Disconnected', since: null } })
    if (failing) return json({}, 503)
    if (url.includes('fields=asn_v4,country_code,tags')) return json({
      asn_v4: 263077, country_code: 'BR', address_v4: '203.0.113.77',
      tags: [{ slug: 'system-ipv4-works' }, { slug: 'system-ipv4-rfc1918' }, { slug: 'system-resolves-a-correctly' }],
    })
    if (url.includes('as-overview')) return json({ data: { holder: 'AS263077 - RazaoInfo Internet Ltda' } })
    if (url.includes('asn_v4=263077')) return json({ count: network })
    if (url.includes('country_code=BR')) return json({ count: 132 })
    return json({ count: 14193 })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const renderWorld = () => render(<ProbeProvider><ProbeWorld /></ProbeProvider>)

it('places the probe in its network, its country and the world, counting only public probes and never showing its address', async () => {
  const mock = stubRipe()
  renderWorld()
  expect(await screen.findByText('É a única probe pública conectada nessa rede agora.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'A probe 1017210 no mundo' })).toBeInTheDocument()
  expect(screen.getByText(/^Na rede RazaoInfo Internet Ltda/)).toHaveTextContent('Na rede RazaoInfo Internet Ltda AS263077')
  expect(screen.getByText('No país: Brasil')).toBeInTheDocument()
  expect(screen.getByText('Uma das 132 probes públicas conectadas no país.')).toBeInTheDocument()
  expect(screen.getByText(/^14\.193 probes públicas conectadas, 0,93% delas no país\./)).toBeInTheDocument()
  expect(screen.getByText(/No último teste: IPv4 funciona, sem IPv6, endereço privado \(atrás de NAT\)\./)).toBeInTheDocument()
  const counts = mock.mock.calls.map(([url]) => url).filter(url => url.includes('status=1'))
  expect(counts).toHaveLength(3)
  expect(counts.every(url => url.includes('is_public=true'))).toBe(true)
  expect(document.body).not.toHaveTextContent('203.0.113')
})

it('counts the other probes of the network when the followed probe is disconnected, and tries again after a failure', async () => {
  stubRipe({ statusId: 2, network: 4 })
  const { unmount } = renderWorld()
  expect(await screen.findByText('4 probes públicas estão conectadas nessa rede agora.')).toBeInTheDocument()
  expect(document.querySelectorAll('.world-sonar .neighbor')).toHaveLength(4)
  unmount()

  stubRipe({ failing: true })
  renderWorld()
  await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
  expect(screen.getByText(/O RIPE Atlas não respondeu agora/)).toBeInTheDocument()
})
