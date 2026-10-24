import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../test/render'
import Activate from './Activate'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

function stubBackend({ saved = null as number | null, putStatus = 200, isPublic = true, statusId = 1, getStatus = 200 } = {}) {
  const names = ['Never Connected', 'Connected', 'Disconnected', 'Abandoned']
  const mock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/probe' && init?.method === 'PUT') {
      const { probe_id } = JSON.parse(String(init.body)) as { probe_id: number }
      return putStatus === 200 ? json({ probe_id, is_public: isPublic }) : json({ detail: 'error' }, putStatus)
    }
    if (url === '/api/probe') return getStatus === 200 ? json({ probe_id: saved }) : json({ detail: 'Not Found' }, getStatus)
    return json({ id: 1, is_public: isPublic, status: { id: statusId, name: names[statusId], since: '2026-10-23T22:30:24Z' } })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

async function saveId(id: string) {
  await userEvent.type(screen.getByLabelText('ID da probe'), id)
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
}

it('saves the probe ID through the local API and shows its status from RIPE Atlas', async () => {
  const mock = stubBackend()
  render(<Activate />)
  expect(await screen.findByText('Salve o ID no passo 3 para ver o status da probe.')).toBeInTheDocument()
  await saveId('1017210')
  expect(await screen.findByText(/Probe 1017210 salva/)).toBeInTheDocument()
  expect(await screen.findByText('Conectada')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver Minha probe' })).toHaveAttribute('href', '#/minha-probe')
  const put = mock.mock.calls.find(([, init]) => init?.method === 'PUT')
  expect(put?.[1]?.body).toBe(JSON.stringify({ probe_id: 1017210 }))
  expect(mock.mock.calls.some(([url]) => url === 'https://atlas.ripe.net/api/v2/probes/1017210/?fields=status,is_public')).toBe(true)
})

it('explains an unknown probe without showing a status', async () => {
  stubBackend({ putStatus: 404 })
  render(<Activate />)
  await saveId('999999999')
  expect(await screen.findByRole('alert')).toHaveTextContent('Essa probe não existe no RIPE Atlas')
  expect(screen.getByText('Salve o ID no passo 3 para ver o status da probe.')).toBeInTheDocument()
})

it('warns about a non-public probe and guides a probe that never connected', async () => {
  stubBackend({ isPublic: false, statusId: 0 })
  render(<Activate />)
  await saveId('1002642')
  expect(await screen.findByText('Sua probe não é pública')).toBeInTheDocument()
  expect(await screen.findByText(/Você já ligou a probe no passo 2\?/)).toBeInTheDocument()
})

it('asks to rebuild when the running API does not know the probe route yet', async () => {
  stubBackend({ getStatus: 404 })
  render(<Activate />)
  expect(await screen.findByRole('alert')).toHaveTextContent('docker compose up -d --build')
})

it('shows only start commands that the kit README documents', async () => {
  stubBackend()
  const readme = readFileSync(resolve('../lab/README.md'), 'utf-8')
  const { container } = render(<Activate />)
  const shown = () => [...container.querySelectorAll('.command code')].map(code => code.textContent ?? '')
  const commands = [...shown()]
  await userEvent.click(screen.getByText('Direto no sistema'))
  commands.push(...shown())
  expect(commands).toHaveLength(2)
  for (const command of commands) expect(readme, command).toContain(command)
})
