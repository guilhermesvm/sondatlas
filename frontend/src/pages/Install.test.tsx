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
  await userEvent.click(screen.getByText('Git Bash'))
  const gitBash = shown()
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
  return { windows, gitBash, unanswered, linuxVm, debian, debianVm, pi }
}

it('shows only commands that the kit READMEs also document, on every path', async () => {
  // The start-kit and stop-kit scripts are documented in the project README, with -Probe, -App, --probe and --app as options at the end.
  const readme = ['../lab/README.md', '../README.md'].map(file => readFileSync(resolve(file), 'utf-8')).join('\n').replaceAll('\\|', '|')
  const paths = await commandsOnEachPath()
  const commands = new Set(Object.values(paths).flat())
  expect(commands).toContain('vagrant reload')
  // The page warns about it in plain text, with no copy button, since it deletes the whole history.
  expect(commands).not.toContain('docker compose down -v')
  for (const command of commands) {
    const documented = command
      .replace(/ (-Probe|-App|--probe|--app)$/, '')
      .replace('https://github.com/guilhermesvm/sondatlas.git', '<URL deste repositório>')
      .replace('sondatlas/', '<pasta do repositório>/')
      .replace(/^sudo bash lab\//, 'sudo bash <pasta do repositório>/lab/')
    expect(readme, command).toContain(documented)
  }
})

it('keeps each system to its own commands', async () => {
  const { windows, gitBash, unanswered, linuxVm, debian, debianVm, pi } = await commandsOnEachPath()
  expect(unanswered).toEqual([])
  expect(debianVm).toEqual(linuxVm)
  const ps = (script: string) => `powershell -ExecutionPolicy Bypass -File .\\${script}.ps1`
  expect(windows).toContain('winget install --id Oracle.VirtualBox --exact')
  expect(windows).toEqual(expect.arrayContaining([`${ps('start-kit')} -Probe`, ps('start-kit'), ps('stop-kit'), `${ps('stop-kit')} -App`, `${ps('start-kit')} -App`]))
  // On Windows, Git Bash runs the same .sh scripts as Linux.
  expect(gitBash).toEqual(expect.arrayContaining(['bash start-kit.sh --probe', 'bash stop-kit.sh --app', 'bash start-kit.sh --app']))
  expect(gitBash.some(command => command.startsWith('powershell'))).toBe(false)
  expect(linuxVm).toEqual(expect.arrayContaining(['bash start-kit.sh --probe', 'bash start-kit.sh', 'bash stop-kit.sh', 'bash stop-kit.sh --app', 'bash start-kit.sh --app']))
  expect(linuxVm.some(command => command.startsWith('powershell'))).toBe(false)
  expect(windows).toContain('systeminfo')
  expect(windows.some(command => command.startsWith('grep'))).toBe(false)
  expect(linuxVm).toContain("grep -Ec '(vmx|svm)' /proc/cpuinfo")
  expect(linuxVm.some(command => command.startsWith('winget') || command === 'systeminfo')).toBe(false)
  // Whoever installs straight on Debian already has the project, since start-kit opened this page there. The Pi gets its own copy.
  expect(debian).toEqual(expect.arrayContaining(['sudo bash lab/install-probe.sh', 'bash start-kit.sh', 'bash stop-kit.sh']))
  expect(debian.some(command => command.startsWith('git'))).toBe(false)
  expect(pi).toEqual(expect.arrayContaining(['sudo bash sondatlas/lab/install-probe.sh', ps('start-kit'), 'bash stop-kit.sh']))
  for (const native of [debian, pi]) {
    expect(native.some(command => command.startsWith('vagrant') || command.startsWith('winget') || / (-Probe|-App|--probe|--app)$/.test(command))).toBe(false)
  }
})
