import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { journey } from '../app/routes'
import { render } from '../test/render'
import JourneyPage from './JourneyPage'

afterEach(() => vi.unstubAllGlobals())

function stubDistribution(distribution: object | null) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ distribution })))))
}

it('shows the saved world and Brazil counts and confirms readiness without blocking the next phase', async () => {
  stubDistribution({ finished_at_utc: '2026-10-11T12:01:00Z', total_probes: 14098, brazil: { country_code: 'BR', probes: 123, share_percent: 0.8725 } })
  render(<JourneyPage route={journey[0]} />)
  expect(await screen.findByText('14.098')).toBeInTheDocument()
  expect(screen.getByText('123')).toBeInTheDocument()
  expect(screen.getByText('0,87% das do mundo')).toBeInTheDocument()
  expect(screen.getByText(/coleta de 11\/10\/2026/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Próximo: Instalar' })).toHaveAttribute('href', '#/instalar')
  await userEvent.click(screen.getByRole('checkbox', { name: /Entendi o que fica público/ }))
  expect(screen.getByText('Tudo pronto: siga para Instalar.')).toBeInTheDocument()
})

it('points to the global network page instead of showing zero when there is no saved collection', async () => {
  stubDistribution(null)
  render(<JourneyPage route={journey[0]} />)
  expect((await screen.findAllByRole('link', { name: 'Rede global' }))[0]).toHaveAttribute('href', '#/rede-global')
  expect(screen.queryByText(/coleta de/)).not.toBeInTheDocument()
})
