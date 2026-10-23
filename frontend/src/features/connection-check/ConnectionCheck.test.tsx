import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../../test/render'
import ConnectionCheck from './ConnectionCheck'

afterEach(() => vi.unstubAllGlobals())

function stubRipe(ip: string, probes: number) {
  const mock = vi.fn((url: string) => {
    const body = url.includes('whats-my-ip') ? { data: { ip } }
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
  expect(urls).toContain('https://atlas.ripe.net/api/v2/probes/?asn_v4=263077&status=1&page_size=1&fields=id')
})

it('counts probes by the IPv6 network when the connection uses IPv6', async () => {
  const mock = stubRipe('2001:db8::1', 3)
  render(<ConnectionCheck />)
  await userEvent.click(screen.getByRole('button', { name: 'Verificar minha conexão' }))
  expect(await screen.findByText(/Já existem 3 probes públicas conectadas/)).toBeInTheDocument()
  expect(mock.mock.calls.map(([url]) => url)).toContain('https://atlas.ripe.net/api/v2/probes/?asn_v6=263077&status=1&page_size=1&fields=id')
})

it('explains the failure instead of showing a count when a query fails', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 500 }))))
  render(<ConnectionCheck />)
  await userEvent.click(screen.getByRole('button', { name: 'Verificar minha conexão' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar agora')
  expect(screen.queryByText(/probes? públicas? conectadas? nessa rede/)).not.toBeInTheDocument()
})
