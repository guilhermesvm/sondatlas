import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ProbeProvider } from '../features/probe-status/ProbeProvider'
import { probeStatus } from '../test/fixtures'
import { render } from '../test/render'
import Settings from './Settings'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

const probes = [
  { ...probeStatus, description: 'Casa', first_connected: 1787709821, total_uptime: 2815592 },
  { id: 1018246, description: null, is_public: true, status: { id: 2, name: 'Disconnected', since: null }, first_connected: 1791940871, total_uptime: 86896 },
]

function stubBackend(saved: 'none' | 'good-key' | 'refused') {
  const mock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/account' && init?.method === 'PUT') {
      const { key } = JSON.parse(String(init.body)) as { key: string }
      if (key !== 'good-key') return json({ detail: 'RIPE Atlas refused the key' }, 422)
      saved = 'good-key'
      return json({ connected: true, probes })
    }
    if (url === '/api/account' && init?.method === 'DELETE') {
      saved = 'none'
      return json({ connected: false })
    }
    if (url === '/api/account') {
      if (saved === 'refused') return json({ detail: 'RIPE Atlas refused the saved key' }, 403)
      return json(saved === 'none' ? { connected: false } : { connected: true, probes })
    }
    if (url === '/api/probe') return json({ probe_id: 1017210 })
    return json(probeStatus)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const renderSettings = () => render(<ProbeProvider><Settings /></ProbeProvider>)

it('links the account, lists its probes, hides the key and the guide and keeps it when a new key is refused', async () => {
  const mock = stubBackend('none')
  renderSettings()
  expect(await screen.findByText('Não vinculada')).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: 'Como criar a chave' })).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Chave de API do RIPE Atlas'), 'good-key')
  await userEvent.click(screen.getByRole('button', { name: 'Vincular' }))
  expect(await screen.findByText('Vinculada')).toBeInTheDocument()
  const [followed, other] = within(screen.getByText('Suas probes').nextElementSibling as HTMLElement).getAllByRole('listitem')
  expect(followed).toHaveTextContent('Probe 1017210')
  expect(within(followed).getByRole('link', { name: 'Ver Minha probe' })).toHaveAttribute('href', '#/minha-probe')
  expect(other).toHaveTextContent('Probe 1018246')
  expect(other).not.toHaveTextContent('Acompanhada')
  expect(screen.queryByRole('complementary', { name: 'Como criar a chave' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Chave de API do RIPE Atlas')).not.toBeInTheDocument()
  expect(document.body).not.toHaveTextContent('good-key')
  const put = mock.mock.calls.find(([, init]) => init?.method === 'PUT')
  expect(put?.[1]?.body).toBe(JSON.stringify({ key: 'good-key' }))
  await userEvent.click(screen.getByRole('button', { name: 'Trocar chave' }))
  const dialog = screen.getByRole('dialog', { name: 'Trocar a chave de API' })
  await userEvent.type(within(dialog).getByLabelText('Chave nova'), 'wrong-key')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Trocar chave' }))
  expect(await within(dialog).findByText(/O RIPE Atlas recusou esta chave/)).toBeInTheDocument()
  expect(screen.getByText('Vinculada')).toBeInTheDocument()
})

it('explains a refused key in the field and a saved key refused later', async () => {
  stubBackend('refused')
  renderSettings()
  expect(await screen.findByText('O RIPE Atlas recusou a chave salva')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Vincular' }))
  expect(screen.getByText('Cole a chave que você criou no RIPE Atlas.')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Chave de API do RIPE Atlas'), 'wrong-key')
  await userEvent.click(screen.getByRole('button', { name: 'Vincular' }))
  expect(await screen.findByText(/O RIPE Atlas recusou esta chave/)).toBeInTheDocument()
})

it('unlinks after confirming and reminds to delete the key on the RIPE Atlas site', async () => {
  const mock = stubBackend('good-key')
  renderSettings()
  await userEvent.click(await screen.findByRole('button', { name: 'Desvincular' }))
  const dialog = screen.getByRole('dialog', { name: 'Desvincular a conta RIPE?' })
  expect(within(dialog).getByRole('link', { name: 'Chaves de API' })).toHaveAttribute('href', 'https://atlas.ripe.net/keys/')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Sim, desvincular' }))
  expect(await screen.findByLabelText('Chave de API do RIPE Atlas')).toBeInTheDocument()
  expect(mock.mock.calls.some(([url, init]) => url === '/api/account' && init?.method === 'DELETE')).toBe(true)
})
