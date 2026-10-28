import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ProbeProvider } from '../features/probe-status/ProbeProvider'
import { render } from '../test/render'
import Challenges from './Challenges'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.location.hash = '' })

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

const linked = {
  connected: true, missing_permissions: [],
  probes: [
    { id: 1017210, description: 'Casa', is_public: true, status: { id: 1, name: 'Connected', since: null } },
    { id: 1018246, description: null, is_public: true, status: { id: 2, name: 'Disconnected', since: null } },
  ],
  credits: { current_balance: 1214346, estimated_daily_income: 29113 },
}

const round = {
  timestamp: 1793049887, dst_name: '142.250.0.1', dst_addr: '142.250.0.1', from: '203.0.113.77', size: 48, ttl: 117,
  sent: 3, rcvd: 3, min: 14, avg: 15, max: 16, result: [{ rtt: 14 }, { rtt: 15 }, { rtt: 16 }],
}

const detail = { target: 'google.com', type: 'ping', probes: [{ id: 1017210 }], resolve_on_probe: true }

const noChallenges = { count: 0, challenges: [] }

// measurement may be a list of answers given in order, the last one repeating.
function stubBackend(account: unknown, results: unknown[] = [round], challenges: [unknown, number?] = [noChallenges], measurement: unknown = detail) {
  const answers = Array.isArray(measurement) ? [...measurement] : [measurement]
  const mock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/account') return json(account)
    if (url === '/api/challenges') return json(...challenges)
    if (url === '/api/challenges/ping' || url === '/api/challenges/traceroute' || url === '/api/challenges/group-ping') return json({ measurement_id: 123456789 })
    if (url.startsWith('https://atlas.ripe.net/api/v2/probes/?id__in=')) return json({ results: [
      { id: 1017210, country_code: 'BR', asn_v4: 263077 }, { id: 6001, country_code: 'JP', asn_v4: 2516 },
      { id: 6002, country_code: 'DE', asn_v4: 3320 }, { id: 6003, country_code: 'ZA', asn_v4: 37100 },
    ] })
    if (url.startsWith('https://stat.ripe.net/data/network-info/')) return json({ data: { asns: url.includes('142.250.0.1') ? ['15169'] : ['64500'] } })
    if (url.startsWith('https://stat.ripe.net/data/as-overview/')) return json({ data: { holder: url.includes('AS15169') ? 'GOOGLE - Google LLC' : 'EXAMPLE - Provedor Exemplo' } })
    if (url.startsWith('https://atlas.ripe.net/api/v2/measurements/123456789/?')) return json(answers.length > 1 ? answers.shift() : answers[0])
    if (url.startsWith('https://atlas.ripe.net/api/v2/measurements/123456789/results/')) return json(results)
    if (url.startsWith('https://atlas.ripe.net/api/v2/measurements/1001/latest/?probe_ids=1017210')) return json([{ avg: 30, rcvd: 3 }])
    if (url === '/api/probe') return json({ probe_id: null })
    return json({}, init ? 500 : 200)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

// The page has two forms: the single-probe challenge and the group ping.
const single = async () => within(await screen.findByRole('region', { name: 'Desafio: uma medição sua' }))
const renderChallenges = () => render(<ProbeProvider><Challenges /></ProbeProvider>)

it('creates a ping from a connected probe after showing the cost, and explains the result', async () => {
  const mock = stubBackend(linked)
  renderChallenges()
  const destination = (await single()).getByRole('combobox', { name: 'Destino' })
  await userEvent.type(destination, 'Google.com')
  await userEvent.click((await single()).getByRole('radio', { name: '5' }))
  expect(screen.getByLabelText('Descrição (opcional)')).toHaveAttribute('placeholder', 'Sondatlas: ping para google.com')
  await userEvent.click((await single()).getByRole('button', { name: 'Ver o custo' }))
  const dialog = screen.getByRole('dialog', { name: 'Criar este ping?' })
  expect(dialog).toHaveTextContent('Da probe 1017210 até google.com, com 5 pacotes.')
  expect(dialog).toHaveTextContent('Custa cerca de 10 créditos, cobrados nas próximas 4 a 6 horas. Seu saldo: 1.214.346.')
  expect(dialog).toHaveTextContent('A medição fica pública no RIPE Atlas')
  expect(dialog).toHaveTextContent('Ela leva a etiqueta sondatlas')
  expect(mock.mock.calls.some(([url]) => url === '/api/challenges/ping')).toBe(false)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar o ping' }))
  const post = mock.mock.calls.find(([url]) => url === '/api/challenges/ping')
  expect(post?.[1]?.body).toBe(JSON.stringify({ probe_id: 1017210, target: 'google.com', packets: 5, description: null }))
  expect(window.location.hash).toBe('#/desafios/123456789')
  expect(await screen.findByText(/3 enviados, 3 recebidos, 0% de perda/)).toBeInTheDocument()
  expect(screen.getByText(/^ping google\.com \(142\.250\.0\.1\), pacotes de 48 bytes/)).toBeInTheDocument()
  expect(screen.getByText('15 ms')).toBeInTheDocument()
  expect(await screen.findByText(/O ping que a sua probe faz sozinha até o K-root leva cerca de 30 ms, então google.com está mais perto/)).toBeInTheDocument()
  expect(screen.getByText('3 de 3 pacotes')).toBeInTheDocument()
  expect(screen.getByText(/É o endereço de google.com que a probe recebeu ao perguntar ao DNS da rede dela, antes de medir. Serviços grandes costumam ter servidores/)).toBeInTheDocument()
  expect(screen.queryByText(/pode não ser o mais perto da sua probe/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'página dela' })).toHaveAttribute('href', 'https://atlas.ripe.net/measurements/123456789/')
  expect(document.body).not.toHaveTextContent('203.0.113.77')
  expect(screen.getByRole('link', { name: 'Ver no LatencyMON' })).toHaveAttribute('href', 'https://atlas.ripe.net/latencymon/123456789')
  expect(screen.queryByRole('link', { name: 'Ver no Khipu' })).not.toBeInTheDocument()
})

it('checks the destination before showing the cost', async () => {
  const mock = stubBackend(linked)
  renderChallenges()
  await userEvent.click((await single()).getByRole('button', { name: 'Ver o custo' }))
  expect(screen.getByText('Escolha ou digite um destino.')).toBeInTheDocument()
  await userEvent.type((await single()).getByRole('combobox', { name: 'Destino' }), '192.168.1.1')
  await userEvent.click((await single()).getByRole('button', { name: 'Ver o custo' }))
  expect(screen.getByText('Digite um nome, como google.com, ou um endereço IPv4 público.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(mock.mock.calls.some(([url]) => url === '/api/challenges/ping')).toBe(false)
})

it('asks for the measurement permission or a linked account before any challenge', async () => {
  stubBackend({ ...linked, missing_permissions: ['measurements'] })
  const { unmount } = renderChallenges()
  const alert = await screen.findByText(/Para os desafios, falta na chave a permissão/)
  expect(within(alert).getByText('Schedule a new measurement').tagName).toBe('STRONG')
  expect(screen.queryByRole('button', { name: 'Ver o custo' })).not.toBeInTheDocument()
  unmount()
  stubBackend({ connected: false })
  renderChallenges()
  expect(await screen.findByText('Vincule a sua conta do RIPE Atlas')).toBeInTheDocument()
})

it('opens a result from its own address and confirms before leaving while the probe still measures', async () => {
  window.location.hash = '#/desafios/123456789'
  const mock = stubBackend({ connected: false }, [])
  renderChallenges()
  expect(screen.getByText('Consultando a medição 123456789…')).toBeInTheDocument()
  expect(await screen.findByText(/A probe está medindo/)).toBeInTheDocument()
  expect(screen.getByText('Ping da probe 1017210 até google.com')).toBeInTheDocument()
  expect(screen.queryByText('Vincule a sua conta do RIPE Atlas')).not.toBeInTheDocument()
  expect(mock.mock.calls.some(([url]) => url === '/api/challenges/ping')).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Fazer outro desafio' }))
  const dialog = screen.getByRole('dialog', { name: 'Sair antes do resultado?' })
  expect(dialog).toHaveTextContent('A probe continua medindo, e o resultado fica guardado no RIPE Atlas.')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Esperar o resultado' }))
  expect(window.location.hash).toBe('#/desafios/123456789')
  await userEvent.click(screen.getByRole('button', { name: 'Fazer outro desafio' }))
  await userEvent.click(screen.getByRole('link', { name: 'Voltar para Desafios' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Sair antes do resultado?' })).getByRole('button', { name: 'Sair agora' }))
  expect(window.location.hash).toBe('#/desafios')
  expect(await screen.findByText('Vincule a sua conta do RIPE Atlas')).toBeInTheDocument()
})

it('keeps the result card in place and says the probe is measuring before the first result is read, without a leftover caret', async () => {
  const leftover = document.body.appendChild(document.createElement('p'))
  leftover.textContent = 'Criar o ping'
  getSelection()!.collapse(leftover.firstChild, 0)
  window.location.hash = '#/desafios/123456789'
  const backend = stubBackend({ connected: false }, [])
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.includes('/results/') ? new Promise(() => {}) : backend(url, init)))
  renderChallenges()
  expect(screen.getByText('Medição 123456789')).toBeInTheDocument()
  expect(getSelection()!.rangeCount).toBe(0)
  expect(await screen.findByText(/A probe está medindo/)).toBeInTheDocument()
  expect(screen.getByText('Ping da probe 1017210 até google.com')).toBeInTheDocument()
  expect(screen.queryByText(/Consultando a medição/)).not.toBeInTheDocument()
  leftover.remove()
})

it('lists the challenges of the account, each opening its result, or says what the key lacks', async () => {
  stubBackend(linked, [round], [{ count: 61, challenges: [
    { id: 228260804, type: 'ping', target: 'github.com', created: 1793110783, probe_id: 1017210 },
    { id: 228255791, type: 'ping', target: '1.1.1.1', created: 1793107000, probe_id: 1017210 },
  ] }])
  const { unmount } = renderChallenges()
  const list = await screen.findByRole('region', { name: 'Seus desafios' })
  expect(await within(list).findByText(/Você criou 61 desafios pela Sondatlas. Aqui estão os 2 mais recentes./)).toBeInTheDocument()
  expect(within(list).getByRole('link', { name: 'Ping até github.com' })).toHaveAttribute('href', '#/desafios/228260804')
  expect(within(list).getAllByText('Da probe 1017210')).toHaveLength(2)
  unmount()

  stubBackend(linked)
  const second = renderChallenges()
  expect(await screen.findByText(/Você ainda não criou nenhum desafio/)).toBeInTheDocument()
  second.unmount()

  const mock = stubBackend({ ...linked, missing_permissions: ['my_measurements'] })
  renderChallenges()
  const alert = await screen.findByText(/Para listar os seus desafios aqui, falta na chave a permissão/)
  expect(within(alert).getByText('List your measurements').tagName).toBe('STRONG')
  expect((await single()).getByRole('button', { name: 'Ver o custo' })).toBeInTheDocument()
  expect(mock.mock.calls.some(([url]) => url === '/api/challenges')).toBe(false)
})

it('explains a name the probe could not resolve instead of counting packets', async () => {
  window.location.hash = '#/desafios/123456789'
  stubBackend({ connected: false }, [{
    timestamp: 1793113398, dst_name: 'google.com', sent: 0, rcvd: 0, min: -1, avg: -1, max: -1,
    result: [{ error: 'dns resolution failed: non-recoverable failure in name resolution' }],
  }])
  renderChallenges()
  expect(await screen.findByText(/ping: dns resolution failed: non-recoverable failure in name resolution/)).toBeInTheDocument()
  expect(screen.getByText('Nenhum pacote enviado')).toBeInTheDocument()
  expect(screen.getByText(/A probe não conseguiu descobrir o endereço de google.com pelo DNS da rede dela/)).toBeInTheDocument()
  expect(screen.queryByText(/Todos voltaram/)).not.toBeInTheDocument()
  expect(screen.queryByText(/de perda/)).not.toBeInTheDocument()
})

it('says when the name was resolved by RIPE Atlas, in a challenge made before the probe resolved it, and skips addresses', async () => {
  window.location.hash = '#/desafios/123456789'
  stubBackend({ connected: false }, [round], [noChallenges], { ...detail, resolve_on_probe: false })
  const { unmount } = renderChallenges()
  expect(await screen.findByText(/É o endereço de google.com que o RIPE Atlas encontrou nos servidores dele e mandou para a probe/)).toBeInTheDocument()
  expect(screen.getByText(/este endereço pode não ser o mais perto da sua probe/)).toBeInTheDocument()
  unmount()

  stubBackend({ connected: false }, [round], [noChallenges], { ...detail, target: '8.8.8.8' })
  renderChallenges()
  expect(await screen.findByText('3 de 3 pacotes')).toBeInTheDocument()
  expect(screen.queryByText(/Serviços grandes costumam ter servidores/)).not.toBeInTheDocument()
})

const route = {
  timestamp: 1793049887, dst_addr: '142.250.0.1', proto: 'ICMP', size: 48, destination_ip_responded: true,
  result: [
    { hop: 1, result: [{ from: '192.168.0.1', rtt: 1 }, { from: '192.168.0.1', rtt: 1 }, { from: '192.168.0.1', rtt: 1 }] },
    { hop: 2, result: [{ x: '*' }, { x: '*' }, { x: '*' }] },
    { hop: 3, result: [{ from: '203.0.113.9', rtt: 8 }, { from: '203.0.113.9', rtt: 9 }, { from: '203.0.113.9', rtt: 8 }] },
    { hop: 4, result: [{ from: '142.250.0.1', rtt: 15 }, { from: '142.250.0.1', rtt: 16 }, { from: '142.250.0.1', rtt: 15 }] },
  ],
}

it('creates a traceroute with the cost of the packets per hop and reads the route like the lesson', async () => {
  const mock = stubBackend(linked, [route], [noChallenges], { ...detail, type: 'traceroute' })
  renderChallenges()
  await userEvent.click((await single()).getByRole('radio', { name: 'Traceroute' }))
  expect((await single()).getAllByRole('radio').map(radio => radio.getAttribute('value'))).toEqual(['ping', 'traceroute', '3', '10'])
  await userEvent.type((await single()).getByRole('combobox', { name: 'Destino' }), 'google.com')
  await userEvent.click((await single()).getByRole('radio', { name: '10' }))
  expect(screen.getByLabelText('Descrição (opcional)')).toHaveAttribute('placeholder', 'Sondatlas: traceroute para google.com')
  await userEvent.click((await single()).getByRole('button', { name: 'Ver o custo' }))
  const dialog = screen.getByRole('dialog', { name: 'Criar este traceroute?' })
  expect(dialog).toHaveTextContent('Da probe 1017210 até google.com, com 10 pacotes por salto.')
  expect(dialog).toHaveTextContent('Custa cerca de 200 créditos')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar o traceroute' }))
  const post = mock.mock.calls.find(([url]) => url === '/api/challenges/traceroute')
  expect(post?.[1]?.body).toBe(JSON.stringify({ probe_id: 1017210, target: 'google.com', packets: 10, description: null }))
  expect(window.location.hash).toBe('#/desafios/123456789')

  expect(await screen.findByText('Traceroute da probe 1017210 até google.com')).toBeInTheDocument()
  expect(await screen.findByText(/^traceroute google\.com \(142\.250\.0\.1\), ICMP, pacotes de 48 bytes/)).toBeInTheDocument()
  expect(screen.getAllByRole('row')[4]).toHaveTextContent('google.com, o destino')
  const stages = within(screen.getByRole('list', { name: 'A rota até google.com, em etapas' })).getAllByRole('listitem')
  expect(stages.map(stage => stage.getAttribute('data-kind'))).toEqual(['home', 'provider', 'destination'])
  expect(stages[2]).toHaveTextContent('O destino google.com, 142.250.0.1, respondeu em cerca de 15 ms.')
  expect(screen.getByText(/É o endereço de google.com que a probe recebeu ao perguntar ao DNS da rede dela/)).toBeInTheDocument()
  expect(screen.queryByText(/cópia perto/)).not.toBeInTheDocument()
  expect(mock.mock.calls.some(([url]) => String(url).includes('/measurements/1001/'))).toBe(false)
  expect(screen.getByRole('link', { name: 'Ver no Khipu' })).toHaveAttribute('href', 'https://atlas.ripe.net/khipu/123456789/asn')
})

it('explains a traceroute that did not reach the destination or could not resolve the name', async () => {
  window.location.hash = '#/desafios/123456789'
  stubBackend({ connected: false }, [{ ...route, destination_ip_responded: false, result: route.result.slice(0, 3) }], [noChallenges], { ...detail, type: 'traceroute' })
  const { unmount } = renderChallenges()
  const lost = await screen.findByText(/O destino google.com não respondeu\./)
  expect(lost).toHaveTextContent('Muitos servidores não respondem aos pacotes do traceroute, e isso não quer dizer que estejam fora do ar.')
  expect(lost).not.toHaveTextContent('30 minutos')
  unmount()

  stubBackend({ connected: false }, [{ timestamp: 1793123230, proto: 'ICMP', size: 48, destination_ip_responded: false,
    result: [{ error: 'name resolution failed: non-recoverable failure in name resolution' }] }], [noChallenges], { ...detail, type: 'traceroute' })
  renderChallenges()
  expect(await screen.findByText(/traceroute: name resolution failed: non-recoverable failure in name resolution/)).toBeInTheDocument()
  expect(screen.getByText('Nenhum pacote enviado')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

it('does not call a private address in the middle of the route your home', async () => {
  window.location.hash = '#/desafios/123456789'
  stubBackend({ connected: false }, [{ ...route, result: [
    { hop: 1, result: [{ from: '203.0.113.9', rtt: 1 }] },
    { hop: 2, result: [{ from: '172.25.138.2', rtt: 8 }] },
    { hop: 3, result: [{ from: '142.250.0.1', rtt: 15 }] },
  ] }], [noChallenges], { ...detail, type: 'traceroute' })
  renderChallenges()
  expect(await screen.findByText('Endereço privado dentro de outra rede')).toBeInTheDocument()
  const stages = within(screen.getByRole('list', { name: 'A rota até google.com, em etapas' })).getAllByRole('listitem')
  expect(stages.map(stage => stage.getAttribute('data-kind'))).toEqual(['provider', 'transit', 'destination'])
  expect(stages[1]).toHaveTextContent('Um roteador com endereço privado, 172.25.138.2, usado dentro da rede de algum provedor.')
  expect(screen.queryByText(/Na sua casa/)).not.toBeInTheDocument()
})

const groupRounds = [
  { prb_id: 6001, avg: 180.5, sent: 3, rcvd: 3, dst_addr: '142.250.1.1', from: '198.51.100.1' },
  { prb_id: 1017210, avg: 58.7, sent: 3, rcvd: 3, dst_addr: '172.217.172.46', from: '203.0.113.77' },
  { prb_id: 6002, avg: 12.2, sent: 3, rcvd: 3, dst_addr: '142.250.2.2', from: '198.51.100.2' },
  { prb_id: 6003, avg: -1, sent: 3, rcvd: 0, dst_addr: '142.250.3.3', from: '198.51.100.3' },
]

it('creates a ping from probes on every continent, with the cost of each probe and the own probe optional', async () => {
  const mock = stubBackend(linked)
  renderChallenges()
  const group = within(await screen.findByRole('region', { name: 'Desafio: ping de várias probes' }))
  await userEvent.type(group.getByRole('combobox', { name: 'Destino' }), 'google.com')
  expect(group.getByRole('img', { name: '1 probe em cada continente, mais a sua probe 1017210' })).toBeInTheDocument()
  await userEvent.click(within(group.getByRole('radiogroup', { name: 'Probes' })).getByRole('radio', { name: '10' }))
  expect(group.getByRole('img', { name: '2 probes em cada continente, mais a sua probe 1017210' })).toBeInTheDocument()
  expect(group.getByRole('checkbox', { name: 'Incluir a minha probe, para comparar' })).toBeChecked()
  await userEvent.click(group.getByRole('button', { name: 'Ver o custo' }))
  let dialog = screen.getByRole('dialog', { name: 'Criar este ping de várias probes?' })
  expect(dialog).toHaveTextContent('De 10 probes, divididas entre os cinco continentes, e da sua probe 1017210, até google.com, com 3 pacotes cada.')
  expect(dialog).toHaveTextContent('Custa cerca de 66 créditos, 6 por probe')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  await userEvent.click(group.getByRole('checkbox', { name: 'Incluir a minha probe, para comparar' }))
  await userEvent.click(group.getByRole('button', { name: 'Ver o custo' }))
  dialog = screen.getByRole('dialog', { name: 'Criar este ping de várias probes?' })
  expect(dialog).toHaveTextContent('Custa cerca de 60 créditos')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar o ping' }))
  const post = mock.mock.calls.find(([url]) => url === '/api/challenges/group-ping')
  expect(post?.[1]?.body).toBe(JSON.stringify({ target: 'google.com', total: 10, probe_id: null, packets: 3 }))
  expect(window.location.hash).toBe('#/desafios/123456789')
})

it('warns in the group ping when no own probe is connected, and still pings from the continents', async () => {
  const offline = { ...linked, probes: linked.probes.map(probe => ({ ...probe, status: { id: 2, name: 'Disconnected', since: null } })) }
  const mock = stubBackend(offline)
  renderChallenges()
  const group = within(await screen.findByRole('region', { name: 'Desafio: ping de várias probes' }))
  expect(group.getByText('Nenhuma probe sua está conectada agora')).toBeInTheDocument()
  expect(group.getByRole('checkbox', { name: 'Incluir a minha probe, para comparar' })).not.toBeChecked()
  expect(group.getByRole('checkbox', { name: 'Incluir a minha probe, para comparar' })).toBeDisabled()
  expect(group.getByRole('img', { name: '1 probe em cada continente' })).toBeInTheDocument()
  await userEvent.type(group.getByRole('combobox', { name: 'Destino' }), 'google.com')
  await userEvent.click(group.getByRole('button', { name: 'Ver o custo' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Criar este ping de várias probes?' })).getByRole('button', { name: 'Criar o ping' }))
  const post = mock.mock.calls.find(([url]) => url === '/api/challenges/group-ping')
  expect(post?.[1]?.body).toBe(JSON.stringify({ target: 'google.com', total: 5, probe_id: null, packets: 3 }))
})

it('waits while RIPE Atlas prepares a new measurement before choosing how to show it', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  window.location.hash = '#/desafios/123456789'
  const synchronizing = { id: 123456789, type: 'ping', status: { id: null, name: 'synchronizing' } }
  stubBackend(linked, groupRounds, [noChallenges], [synchronizing, { ...detail, tags: ['sondatlas', 'sondatlas-grupo'], participant_count: 4 }])
  renderChallenges()
  expect(await screen.findByText('O RIPE Atlas está preparando a medição 123456789…')).toBeInTheDocument()
  await vi.advanceTimersByTimeAsync(2000)
  expect(await screen.findByRole('heading', { name: 'Ping de 4 probes até google.com' })).toBeInTheDocument()
  expect(document.body).not.toHaveTextContent('undefined')
  expect(screen.queryByText(/enviados, .* recebidos/)).not.toBeInTheDocument()
})

it('compares the probes of a group ping as they arrive, marks your probe and never shows their addresses', async () => {
  window.location.hash = '#/desafios/123456789'
  const group = { ...detail, tags: ['sondatlas', 'sondatlas-grupo'], participant_count: 6 }
  stubBackend(linked, groupRounds, [noChallenges], group)
  renderChallenges()
  expect(await screen.findByRole('heading', { name: 'Ping de 6 probes até google.com' })).toBeInTheDocument()
  expect(await screen.findByText('Chegaram 4 de 6 resultados. Cada probe mede no seu tempo…')).toBeInTheDocument()
  const rows = screen.getAllByRole('row').slice(1)
  expect(rows.map(row => [...row.children].slice(0, 2).map(cell => cell.textContent))).toEqual([
    ['1º', 'AlemanhaAS3320, probe 6002, recebeu 142.250.2.2'],
    ['2º', 'BrasilsuaAS263077, probe 1017210, recebeu 172.217.172.46'],
    ['3º', 'JapãoAS2516, probe 6001, recebeu 142.250.1.1'],
    ['–', 'África do SulAS37100, probe 6003, recebeu 142.250.3.3'],
  ])
  expect(rows[3]).toHaveTextContent('sem resposta')
  expect(rows[3].querySelector('.group-rank-bar')).toBeNull()
  expect(screen.getByText('De 12,2 ms a 180,5 ms')).toBeInTheDocument()
  expect(screen.getByText(/A 6002 \(Alemanha\) foi a mais rápida, com 12,2 ms. A 6001 \(Japão\) foi a mais lenta, com 180,5 ms./)).toBeInTheDocument()
  expect(screen.getByText(/As probes receberam 4 endereços diferentes para google.com/)).toBeInTheDocument()
  expect(screen.getByText(/A sua probe ficou em 2º lugar entre as que responderam/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver no Khipu' })).toHaveAttribute('href', 'https://atlas.ripe.net/khipu/123456789/country')
  expect(screen.getByRole('link', { name: 'Ver no LatencyMON' })).toHaveAttribute('href', 'https://atlas.ripe.net/latencymon/123456789')
  expect(document.body).not.toHaveTextContent('198.51.100')
  expect(document.body).not.toHaveTextContent('203.0.113.77')
})
