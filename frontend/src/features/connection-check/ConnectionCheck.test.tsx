import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../../test/render'
import ConnectionCheck from './ConnectionCheck'

afterEach(() => vi.unstubAllGlobals())

function stubRipe(ip: string, probes: number, local: { probe?: number | null, account?: unknown, connected?: number[] } = {}) {
  const mock = vi.fn((url: string) => {
    if (url === '/api/probe') return local.probe === undefined ? Promise.reject(new TypeError('offline')) : Promise.resolve(new Response(JSON.stringify({ probe_id: local.probe })))
    if (url === '/api/account') return local.account === undefined ? Promise.reject(new TypeError('offline')) : Promise.resolve(new Response(JSON.stringify(local.account)))
    const body = url.includes('id__in=') ? { results: (local.connected ?? []).map(id => ({ id })) }
      : url.includes('whats-my-ip') ? { data: { ip } }
      : url.includes('network-info') ? { data: { asns: ['263077'], prefix: '203.0.113.0/24' } }
      : url.includes('as-overview') ? { data: { holder: 'AS263077 - RazaoInfo Internet Ltda' } }
      : { count: probes, results: [] }
    return Promise.resolve(new Response(JSON.stringify(body)))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

it('shows the provider and its public probes without showing the IP', async () => {
  const mock = stubRipe('203.0.113.7', 0)
  render(<ConnectionCheck />)
  await userEvent.click(screen.getByRole('button', { name: 'Verificar minha conexão' }))
  expect(await screen.findByText('RazaoInfo Internet Ltda')).toBeInTheDocument()
  expect(screen.getByText('AS263077, conexão IPv4')).toBeInTheDocument()
  expect(screen.getByText(/A sua seria a primeira/)).toBeInTheDocument()
  expect(screen.queryByText(/203\.0\.113\.7/)).not.toBeInTheDocument()
  const urls = mock.mock.calls.map(([url]) => url)
  expect(urls.filter(url => url.startsWith('https://stat.ripe.net/')).every(url => url.includes('sourceapp=sondatlas'))).toBe(true)
  expect(urls).toContain('https://atlas.ripe.net/api/v2/probes/?asn_v4=263077&status=1&is_public=true&page_size=1&fields=id')
  expect(urls.some(url => url.includes('id__in='))).toBe(false)
  expect(document.querySelector('.probe-dot.yours')).toBeInTheDocument()
})

it('counts probes by the IPv6 network when the connection uses IPv6', async () => {
  const mock = stubRipe('2001:db8::1', 3)
  render(<ConnectionCheck />)
  await userEvent.click(screen.getByRole('button', { name: 'Verificar minha conexão' }))
  expect(await screen.findByText(/Já existem 3 probes públicas conectadas/)).toBeInTheDocument()
  expect(mock.mock.calls.map(([url]) => url)).toContain('https://atlas.ripe.net/api/v2/probes/?asn_v6=263077&status=1&is_public=true&page_size=1&fields=id')
})

it('explains the failure instead of showing a count when a query fails', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 500 }))))
  render(<ConnectionCheck />)
  await userEvent.click(screen.getByRole('button', { name: 'Verificar minha conexão' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar agora')
  expect(screen.queryByText(/probes? públicas? conectadas? nessa rede/)).not.toBeInTheDocument()
})

it('calls yours only the probes of the linked account and names a followed probe that is not in it', async () => {
  const account = { connected: true, probes: [{ id: 1017210 }, { id: 1018246 }] }
  const mock = stubRipe('203.0.113.7', 1, { probe: 1017210, account, connected: [1017210] })
  const { unmount } = render(<ConnectionCheck />)
  await userEvent.click(screen.getByRole('button', { name: 'Verificar minha conexão' }))
  expect(await screen.findByText(/^A única probe pública conectada nessa rede é a sua\. Outra probe aqui mediria a partir da mesma rede/)).toBeInTheDocument()
  expect(mock.mock.calls.map(([url]) => url)).toContain('https://atlas.ripe.net/api/v2/probes/?asn_v4=263077&status=1&is_public=true&id__in=1017210,1018246&page_size=100&fields=id')
  expect(document.querySelectorAll('.probe-dot.mine')).toHaveLength(1)
  expect(document.querySelector('.probe-dot.yours')).not.toBeInTheDocument()
  unmount()

  stubRipe('203.0.113.7', 3, { probe: 1018246, account, connected: [1017210, 1018246] })
  const second = render(<ConnectionCheck />)
  await userEvent.click(screen.getByRole('button', { name: 'Verificar minha conexão' }))
  expect(await screen.findByText('Já existem 3 probes públicas conectadas nessa rede, e 2 delas são suas.')).toBeInTheDocument()
  second.unmount()

  stubRipe('203.0.113.7', 2, { probe: 1017210, account: { connected: true, probes: [{ id: 1018246 }] }, connected: [1017210, 1018246] })
  const third = render(<ConnectionCheck />)
  await userEvent.click(screen.getByRole('button', { name: 'Verificar minha conexão' }))
  expect(await screen.findByText('Já existem 2 probes públicas conectadas nessa rede. Uma delas é sua, e outra é a 1017210, que você acompanha na Sondatlas.')).toBeInTheDocument()
  third.unmount()

  stubRipe('203.0.113.7', 1, { probe: 1017210, account: { connected: false }, connected: [1017210] })
  render(<ConnectionCheck />)
  await userEvent.click(screen.getByRole('button', { name: 'Verificar minha conexão' }))
  expect(await screen.findByText('Já existe 1 probe pública conectada nessa rede: a 1017210, que você acompanha na Sondatlas. Mais uma acrescenta outro ponto de medição nela.')).toBeInTheDocument()
  expect(document.querySelector('.probe-dot.mine')).not.toBeInTheDocument()
  expect(document.querySelector('.probe-dot.yours')).toBeInTheDocument()
})
