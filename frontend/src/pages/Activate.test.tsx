import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../test/render'
import Activate from './Activate'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

function stubRipe({ status = 200, isPublic = true, statusId = 1 } = {}) {
  const names = ['Never Connected', 'Connected', 'Disconnected', 'Abandoned']
  const mock = vi.fn((_url: string) => status === 200
    ? json({ id: 1, is_public: isPublic, status: { id: statusId, name: names[statusId], since: '2026-10-23T22:30:24Z' } })
    : json({ detail: 'Not found' }, status))
  vi.stubGlobal('fetch', mock)
  return mock
}

async function verifyId(id: string) {
  await userEvent.type(screen.getByLabelText('ID da probe'), id)
  await userEvent.click(screen.getByRole('button', { name: 'Verificar' }))
}

it('checks the probe in RIPE Atlas without saving it and points to the next phase', async () => {
  const mock = stubRipe()
  render(<Activate />)
  expect(screen.getByLabelText('ID da probe')).toHaveValue('')
  await verifyId('1017210')
  expect(await screen.findByText('Conectada')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Seguir para Acompanhar' })).toHaveAttribute('href', '#/acompanhar')
  expect(screen.queryByRole('button', { name: 'Verificar de novo' })).not.toBeInTheDocument()
  expect(mock.mock.calls.map(([url]) => url)).toEqual(['https://atlas.ripe.net/api/v2/probes/1017210/?fields=status,is_public'])
})

it('explains an unknown probe without showing a status', async () => {
  stubRipe({ status: 404 })
  render(<Activate />)
  await verifyId('999999999')
  const field = screen.getByLabelText('ID da probe')
  await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
  expect(field).toHaveAccessibleDescription(/Essa probe não existe no RIPE Atlas/)
  expect(screen.queryByText('Verificar de novo')).not.toBeInTheDocument()
})

it('refuses an ID too large to keep every digit without asking RIPE Atlas', async () => {
  const mock = stubRipe()
  render(<Activate />)
  await verifyId('24126347344234234235')
  expect(screen.getByLabelText('ID da probe')).toHaveAccessibleDescription('Digite um ID válido, só com números.')
  expect(mock).not.toHaveBeenCalled()
})

it('warns about a non-public probe and guides a probe that never connected', async () => {
  stubRipe({ isPublic: false, statusId: 0 })
  render(<Activate />)
  await verifyId('1002642')
  expect(await screen.findByText('Sua probe não é pública')).toBeInTheDocument()
  expect(screen.getByText(/Você já ligou a probe no passo 2\?/)).toBeInTheDocument()
})

it('shows only start commands that the kit README documents', async () => {
  stubRipe()
  const readme = readFileSync(resolve('../lab/README.md'), 'utf-8')
  const { container } = render(<Activate />)
  const shown = () => [...container.querySelectorAll('.command code')].map(code => code.textContent ?? '')
  const commands = [...shown()]
  await userEvent.click(screen.getByText('Direto no sistema'))
  commands.push(...shown())
  expect(commands).toHaveLength(2)
  for (const command of commands) expect(readme, command).toContain(command)
})
