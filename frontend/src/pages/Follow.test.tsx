import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ProbeProvider } from '../features/probe-status/ProbeProvider'
import { render } from '../test/render'
import Follow from './Follow'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

function stubBackend({ saved = null as number | null, getStatus = 200, putStatus = 200 } = {}) {
  const mock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/probe' && init?.method === 'PUT') {
      if (putStatus !== 200) return json({ detail: 'error' }, putStatus)
      saved = (JSON.parse(String(init.body)) as { probe_id: number }).probe_id
      return json({ probe_id: saved, is_public: true })
    }
    if (url === '/api/probe' && init?.method === 'DELETE') {
      saved = null
      return json({ probe_id: null })
    }
    if (url === '/api/probe') return getStatus === 200 ? json({ probe_id: saved }) : json({ detail: 'Not Found' }, getStatus)
    return json({ id: saved, is_public: true, status: { id: 1, name: 'Connected', since: null } })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const renderFollow = () => render(<ProbeProvider><Follow /></ProbeProvider>)

it('follows the probe through the local API and shows which one is followed', async () => {
  const mock = stubBackend()
  renderFollow()
  await userEvent.type(await screen.findByLabelText('ID da probe'), '1017210')
  await userEvent.click(screen.getByRole('button', { name: 'Acompanhar esta probe' }))
  expect(await screen.findByText('A Sondatlas acompanha a probe 1017210.')).toBeInTheDocument()
  expect(await screen.findByText('Conectada')).toBeInTheDocument()
  const put = mock.mock.calls.find(([, init]) => init?.method === 'PUT')
  expect(put?.[1]?.body).toBe(JSON.stringify({ probe_id: 1017210 }))
})

it('asks before it stops following and then offers to follow again', async () => {
  const mock = stubBackend({ saved: 1017210 })
  renderFollow()
  await userEvent.click(await screen.findByRole('button', { name: 'Parar de acompanhar' }))
  const dialog = await screen.findByRole('dialog', { name: 'Parar de acompanhar a probe 1017210?' })
  expect(within(dialog).getByText(/os dados já coletados continuam guardados/)).toBeInTheDocument()
  expect(mock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Sim, parar' }))
  expect(await screen.findByRole('button', { name: 'Acompanhar esta probe' })).toBeInTheDocument()
  expect(mock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true)
})

it('changes the followed probe from a dialog', async () => {
  stubBackend({ saved: 1017210 })
  renderFollow()
  await userEvent.click(await screen.findByRole('button', { name: 'Trocar probe' }))
  const dialog = await screen.findByRole('dialog', { name: 'Trocar a probe acompanhada' })
  expect(within(dialog).getByText(/Os dados da probe 1017210 continuam guardados/)).toBeInTheDocument()
  await userEvent.type(within(dialog).getByLabelText('ID da nova probe'), '1018246')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Trocar probe' }))
  expect(await screen.findByText('A Sondatlas acompanha a probe 1018246.')).toBeInTheDocument()
})

it('marks the field for an unknown probe and shows a titled alert when RIPE Atlas is down', async () => {
  const mock = stubBackend({ putStatus: 404 })
  renderFollow()
  const field = await screen.findByLabelText('ID da probe')
  await userEvent.type(field, '999999999')
  await userEvent.click(screen.getByRole('button', { name: 'Acompanhar esta probe' }))
  await waitFor(() => expect(field).toHaveAccessibleDescription(/Essa probe não existe no RIPE Atlas/))
  mock.mockImplementation(() => json({ detail: 'error' }, 503))
  await userEvent.click(screen.getByRole('button', { name: 'Acompanhar esta probe' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Não foi possível acompanhar a probe')
  expect(alert).toHaveTextContent('O RIPE Atlas não respondeu agora')
  expect(field).not.toHaveAttribute('aria-invalid', 'true')
})

it('asks to rebuild when the running API does not know the probe route yet', async () => {
  stubBackend({ getStatus: 404 })
  renderFollow()
  expect(await screen.findByRole('alert')).toHaveTextContent('docker compose up -d --build')
})
