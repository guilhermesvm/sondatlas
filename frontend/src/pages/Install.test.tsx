import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { render } from '../test/render'
import Install from './Install'

async function commandsOnEachPath() {
  const { container } = render(<Install />)
  const shown = () => {
    for (const control of screen.queryAllByRole('button', { expanded: false })) fireEvent.click(control)
    return [...container.querySelectorAll('.command code')].map(code => code.textContent ?? '')
  }
  const windows = shown()
  await userEvent.click(screen.getByText('Linux'))
  const unanswered = shown()
  await userEvent.click(screen.getByText('Não'))
  const linuxVm = shown()
  await userEvent.click(screen.getByText('Sim'))
  const debian = shown()
  await userEvent.click(screen.getByText('Máquina virtual'))
  const debianVm = shown()
  await userEvent.click(screen.getByText('Raspberry Pi'))
  const pi = shown()
  return { windows, unanswered, linuxVm, debian, debianVm, pi }
}

it('shows only commands that the kit README also documents, on every path', async () => {
  const readme = readFileSync(resolve('../lab/README.md'), 'utf-8').replaceAll('\\|', '|')
  const paths = await commandsOnEachPath()
  const commands = new Set(Object.values(paths).flat())
  expect(commands).toContain('vagrant reload')
  for (const command of commands) {
    const documented = command
      .replace('https://github.com/guilhermesvm/network-measurement-platform.git', '<URL deste repositório>')
      .replace('network-measurement-platform/', '<pasta do repositório>/')
    expect(readme, command).toContain(documented)
  }
})

it('keeps each system to its own commands', async () => {
  const { windows, unanswered, linuxVm, debian, debianVm, pi } = await commandsOnEachPath()
  expect(unanswered).toEqual([])
  expect(debianVm).toEqual(linuxVm)
  expect(windows).toContain('winget install --id Oracle.VirtualBox --exact')
  expect(windows.some(command => command.startsWith('grep'))).toBe(false)
  expect(linuxVm).toContain("grep -Ec '(vmx|svm)' /proc/cpuinfo")
  expect(linuxVm.some(command => command.startsWith('winget') || command === 'systeminfo')).toBe(false)
  for (const native of [debian, pi]) {
    expect(native).toContain('sudo bash network-measurement-platform/lab/install-probe.sh')
    expect(native.some(command => command.startsWith('vagrant') || command.startsWith('winget'))).toBe(false)
  }
})
