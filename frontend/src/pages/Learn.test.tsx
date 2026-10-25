import { screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { render } from '../test/render'
import Learn from './Learn'

it('lists the planned lessons by group and points to the free RIPE NCC Academy courses', () => {
  render(<Learn />)
  const basics = within(screen.getByRole('region', { name: 'Fundamentos de redes' }))
  expect(basics.getAllByRole('listitem').map(item => item.querySelector('p')?.textContent)).toEqual(['IP e endereços', 'Ping', 'Traceroute', 'DNS'])
  expect(within(screen.getByRole('region', { name: 'RIPE Atlas' })).getAllByRole('listitem')).toHaveLength(2)
  const academy = within(screen.getByRole('region', { name: 'Para ir mais fundo: RIPE NCC Academy' }))
  expect(academy.getByRole('link', { name: 'Internet Measurements' })).toHaveAttribute('href', 'https://academy.ripe.net/mod/page/view.php?id=937')
  expect(academy.getByRole('link', { name: 'IPv6' })).toHaveAttribute('href', 'https://academy.ripe.net/mod/page/view.php?id=928')
})
