import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { render } from '../test/render'
import Install from './Install'

it('shows only commands that the kit README also documents, on both paths', async () => {
  const readme = readFileSync(resolve('../lab/README.md'), 'utf-8').replaceAll('\\|', '|')
  const { container } = render(<Install />)
  const shown = () => [...container.querySelectorAll('.command code')].map(code => code.textContent ?? '')
  for (const control of screen.getAllByRole('button', { expanded: false })) fireEvent.click(control)
  const commands = new Set(shown())
  await userEvent.click(screen.getByText('Debian ou Raspberry Pi'))
  shown().forEach(command => commands.add(command))

  expect(commands).toContain('vagrant up')
  expect(commands).toContain('sudo bash network-measurement-platform/lab/install-probe.sh')
  for (const command of commands) {
    const documented = command
      .replace('https://github.com/guilhermesvm/network-measurement-platform.git', '<URL deste repositório>')
      .replace('network-measurement-platform/', '<pasta do repositório>/')
    expect(readme, command).toContain(documented)
  }
})
