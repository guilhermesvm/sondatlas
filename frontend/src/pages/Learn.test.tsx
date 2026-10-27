import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../app/App'
import { catalog, history, ping } from '../test/fixtures'
import { mockApi } from '../test/mock-api'
import { render } from '../test/render'

afterEach(() => vi.unstubAllGlobals())

it('links only the ready lessons and points to the free RIPE NCC Academy courses', () => {
  mockApi()
  window.location.hash = '#/aprender'
  render(<App />)
  const basics = within(screen.getByRole('region', { name: 'Fundamentos de redes' }))
  expect(basics.getAllByRole('listitem')).toHaveLength(4)
  expect(basics.getByRole('link', { name: 'Ler a lição Ping' })).toHaveAttribute('href', '#/aprender/ping')
  expect(basics.getByRole('link', { name: 'Ler a lição IP e endereços' })).toHaveAttribute('href', '#/aprender/ip')
  expect(basics.getByRole('link', { name: 'Ler a lição Traceroute' })).toHaveAttribute('href', '#/aprender/traceroute')
  expect(basics.queryByRole('link', { name: /DNS/ })).not.toBeInTheDocument()
  const atlas = within(screen.getByRole('region', { name: 'RIPE Atlas' }))
  expect(atlas.queryByText('Em breve')).not.toBeInTheDocument()
  expect(atlas.getByRole('link', { name: 'Ler a lição Créditos e medições próprias' })).toHaveAttribute('href', '#/aprender/creditos')
  expect(atlas.getByRole('link', { name: 'Ler a lição O que a sua probe mede sozinha' })).toHaveAttribute('href', '#/aprender/medicoes-automaticas')
  const academy = within(screen.getByRole('region', { name: 'Para ir mais fundo: RIPE NCC Academy' }))
  expect(academy.getByRole('link', { name: 'Internet Measurements' })).toHaveAttribute('href', 'https://academy.ripe.net/mod/page/view.php?id=937')
})

it('teaches ping in four parts with the numbers of the followed probe', async () => {
  mockApi(history(), history([ping({ measurement_id: 86206926, target_name: 'Google', rtt_avg_ms: 30, packet_loss_percent: 33.3 })]))
  window.location.hash = '#/aprender/ping'
  render(<App />)
  expect(screen.getByRole('heading', { level: 1, name: 'Ping' })).toBeInTheDocument()
  const contents = within(screen.getByRole('navigation', { name: 'Nesta lição' }))
  expect(contents.getAllByRole('button').map(button => button.textContent)).toEqual(['O que é', 'O seu dado', 'Como ler', 'O que não mostra', 'Para ir mais fundo'])
  expect(await screen.findByText('perda em 1 de 1 rodadas')).toBeInTheDocument()
  const terminal = await screen.findByText(/ping k.root-servers.net \(193.0.14.129\), pacotes de 32 bytes/)
  expect(terminal).toHaveTextContent('resposta de 193.0.14.129: tempo=33 ms')
  expect(terminal).toHaveTextContent('3 enviados, 3 recebidos, 0% de perda')
  expect(document.body).not.toHaveTextContent('203.0.113.77')
  const notes = within(screen.getByRole('region', { name: 'Como ler' }))
  expect(notes.getByText(/é o tempo típico do K-root, o destino mais rápido/)).toHaveTextContent('no máximo uns 2.000 km de cabo')
  expect(notes.getByText(/tiveram alguma perda nas últimas 24 horas, somando os destinos/)).toHaveTextContent('1 de 2 rodadas')
  expect(notes.getByText(/TTL 51/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Voltar ao índice' })).toHaveAttribute('href', '#/aprender')
  expect(screen.queryByRole('link', { name: /^Voltar: / })).not.toBeInTheDocument()
})

it('reads a probe that measured only one destination', async () => {
  mockApi(history(), history([]))
  window.location.hash = '#/aprender/ping'
  render(<App />)
  expect(await screen.findByText('Sem resultados de Google nas últimas 24 horas. Nem toda probe participa de todas as medições automáticas.')).toBeInTheDocument()
  expect(screen.getByText(/é o tempo típico do K-root\. /)).toBeInTheDocument()
  expect(screen.getByText(/Nas últimas 24 horas, ela mediu K-root\./)).toBeInTheDocument()
})

it('keeps the lesson readable without a followed probe and sends unknown lessons to the index', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url === '/api/probe' ? { probe_id: null } : {})))))
  window.location.hash = '#/aprender/ping'
  render(<App />)
  expect(await screen.findByText('Acompanhe uma probe para ver os seus números aqui.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ir para Acompanhar' })).toHaveAttribute('href', '#/acompanhar')
  expect(screen.getByText(/é um exemplo de tempo de ida e volta/)).toBeInTheDocument()
  window.location.hash = '#/aprender/dns'
  expect(await screen.findByRole('heading', { level: 1, name: 'Aprender' })).toBeInTheDocument()
})

it('shows the private address and the provider of the followed probe but never its public address', async () => {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/probe') return json({ probe_id: 1017210 })
    if (url === '/api/targets') return json(catalog)
    if (url.includes('/probes/1017210/?fields=tags')) return json({ id: 1017210, tags: [{ slug: 'system-ipv4-rfc1918' }], asn_v4: 64500, address_v6: null, first_connected: 1787709821 })
    if (url.includes('/measurements/7000/results/')) return json([
      { timestamp: 1790000000, event: 'connect', asn: 64500 }, { timestamp: 1787709821, event: 'connect', asn: 64500 },
      { timestamp: 1788000000, event: 'connect', asn: 64501 }, { timestamp: 1788100000, event: 'disconnect', asn: null },
    ])
    if (url.includes('/measurements/1001/latest/')) return json([{ src_addr: '192.168.1.5', from: '203.0.113.77' }])
    if (url.includes('stat.ripe.net/data/as-overview')) return json({ data: { holder: url.includes('AS64501') ? 'AS64501 - Outra Rede' : 'AS64500 - Provedor Exemplo' } })
    return json({ id: 1017210, is_public: true, status: { id: 1, name: 'Connected', since: null } })
  }))
  window.location.hash = '#/aprender/ip'
  render(<App />)
  expect(screen.getByRole('heading', { level: 1, name: 'IP e endereços' })).toBeInTheDocument()
  const data = within(screen.getByRole('region', { name: 'O seu dado' }))
  expect(await data.findAllByText('192.168.1.5')).toHaveLength(2)
  expect(data.getAllByText('AS64500')).toHaveLength(3)
  expect(within(data.getByRole('list', { name: 'Caminho da probe até o K-root' })).getByText('AS25152')).toBeInTheDocument()
  expect(data.getByText('A sua probe já se conectou por 2 redes')).toBeInTheDocument()
  const [current, previous] = data.getAllByRole('listitem').filter(item => item.closest('.lesson-networks'))
  expect(current).toHaveTextContent('AS64500 Provedor Exemplo2 conexões, a mais recente em')
  expect(previous).toHaveTextContent('AS64501 Outra Rede1 conexão, a última em')
  expect(data.getByText('Não tem')).toBeInTheDocument()
  expect(data.getByText('system-ipv4-rfc1918')).toBeInTheDocument()
  expect(document.body).not.toHaveTextContent('203.0.113.77')
})

it('keeps the IP lesson readable without a followed probe', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url === '/api/probe' ? { probe_id: null } : {})))))
  window.location.hash = '#/aprender/ip'
  render(<App />)
  expect(await screen.findByText('Acompanhe uma probe para ver os endereços dela aqui.')).toBeInTheDocument()
  expect(screen.getByText(/é um exemplo de endereço/)).toBeInTheDocument()
})

it('reads the latest route hop by hop with each network, the silent hops and the biggest jump', async () => {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
  const packets = (from: string, rtt: number) => [{ from, rtt }, { from, rtt: rtt + 1 }, { from, rtt: rtt + 2 }]
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/probe') return json({ probe_id: 1017210 })
    if (url === '/api/targets') return json(catalog)
    if (url.includes('/measurements/5009/latest/')) return json([{
      timestamp: 1793049887, dst_addr: '198.41.0.4', proto: 'UDP', size: 40, destination_ip_responded: false,
      result: [{ hop: 1, result: packets('192.168.1.1', 4) }, { hop: 2, result: packets('186.208.80.22', 5) }, { hop: 3, result: [{ x: '*' }] }, { hop: 4, result: [{ x: '*' }] }],
    }])
    if (url.includes('/measurements/5001/latest/')) return json([{
      timestamp: 1793049887, dst_addr: '193.0.14.129', proto: 'UDP', size: 40, from: '203.0.113.77', destination_ip_responded: true,
      result: [
        { hop: 1, result: packets('192.168.1.1', 4) },
        { hop: 2, result: packets('186.208.80.22', 5) },
        { hop: 3, result: [{ x: '*' }, { x: '*' }, { x: '*' }] },
        { hop: 4, result: packets('187.16.221.197', 23) },
        { hop: 5, result: packets('193.0.14.129', 134) },
      ],
    }])
    if (url.includes('network-info')) return json({ data: { asns: url.includes('187.16.221.197') ? [] : url.includes('193.0.14.129') ? ['25152'] : ['263077'] } })
    if (url.includes('as-overview')) return json({ data: { holder: url.includes('AS25152') ? 'K-ROOT-SERVER Reseaux IP Europeens Network Coordination Centre (RIPE NCC)' : 'AS263077 - Provedor Exemplo' } })
    if (url.includes('peeringdb.com/api/netixlan')) return json({ data: [{ ipaddr4: '187.16.221.197', name: 'IX.br (PTT.br) São Paulo: ATM/MPLA', asn: 25152, ix_id: 171 }] })
    if (url.includes('peeringdb.com/api/ix?')) return json({ data: [{ id: 171, name: 'IX.br (PTT.br) São Paulo', city: 'São Paulo/SP', country: 'BR' }] })
    return json({ id: 1017210, is_public: true, status: { id: 1, name: 'Connected', since: null } })
  }))
  window.location.hash = '#/aprender/traceroute'
  render(<App />)
  const terminal = await screen.findByText(/traceroute 193.0.14.129 \(K-root\), UDP, pacotes de 40 bytes/)
  expect(terminal).toHaveTextContent('3 * * * 4 187.16.221.197')
  const table = within(screen.getByRole('table', { name: 'Os saltos da rota, com a rede de cada endereço' }))
  const rows = table.getAllByRole('row').slice(1)
  expect(rows[0]).toHaveTextContent('Sua rede (endereço privado)')
  expect(rows[1]).toHaveTextContent('Provedor Exemplo AS263077')
  expect(rows[2]).toHaveTextContent('não respondeu')
  expect(rows[3]).toHaveTextContent('IX.br (PTT.br) São Paulo')
  expect(rows[3]).toHaveTextContent('ponto de troca em São Paulo (Brasil), entrada da rede RIPE NCC')
  expect(rows[4]).toHaveTextContent('K-root, o destino')
  const stages = within(screen.getByRole('list', { name: 'A rota até o K-root, em etapas' })).getAllByRole('listitem')
  expect(stages.map(stage => stage.querySelector('strong')?.textContent)).toEqual(['Na sua casa', 'No seu provedor', 'Ponto de troca', 'No destino'])
  expect(stages[2]).toHaveTextContent('saltos 3 a 4')
  expect(stages[2]).toHaveTextContent('IX.br (PTT.br) São Paulo, em São Paulo (Brasil)')
  expect(stages[2]).toHaveTextContent('O salto 3 não respondeu, mas os pacotes passaram.')
  expect(stages[2]).toHaveTextContent('um projeto do Comitê Gestor da Internet no Brasil')
  expect(stages[3]).toHaveTextContent('O tempo sobe de 24 ms para 135 ms')
  expect(stages[3]).toHaveTextContent('Foi uma cópia perto de São Paulo')
  await userEvent.selectOptions(within(screen.getByRole('region', { name: 'O seu dado' })).getByLabelText('Destino'), '5009')
  const lost = await screen.findByText(/O A-root não respondeu nesta rodada/)
  expect(lost).toHaveTextContent('A rota foi vista até o salto 2, e os seguintes não responderam.')
  expect(document.body).not.toHaveTextContent('203.0.113.77')
})

it('keeps the traceroute lesson readable without a followed probe', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url === '/api/probe' ? { probe_id: null } : {})))))
  window.location.hash = '#/aprender/traceroute'
  render(<App />)
  expect(await screen.findByText('Acompanhe uma probe para ver a rota dela aqui.')).toBeInTheDocument()
  expect(screen.getByText(/aqui aparece a rota dela contada em etapas/)).toBeInTheDocument()
})

it('warns when RIPEstat or PeeringDB do not answer and tries again on request', async () => {
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))
  const route = vi.fn(() => json([{
    timestamp: 1793049887, dst_addr: '193.0.14.129', proto: 'UDP', size: 40,
    result: [{ hop: 1, result: [{ from: '187.16.221.197', rtt: 23 }] }, { hop: 2, result: [{ from: '193.0.14.129', rtt: 134 }] }],
  }]))
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/probe') return json({ probe_id: 1017210 })
    if (url === '/api/targets') return json(catalog)
    if (url.includes('/measurements/5001/latest/')) return route()
    if (url.includes('network-info')) return json({ data: { asns: url.includes('187.16.221.197') ? [] : ['25152'] } })
    if (url.includes('as-overview') || url.includes('peeringdb.com')) return json({ detail: 'unavailable' }, 503)
    return json({ id: 1017210, is_public: true, status: { id: 1, name: 'Connected', since: null } })
  }))
  window.location.hash = '#/aprender/traceroute'
  render(<App />)
  const warning = await screen.findByRole('alert', { name: 'Não foi possível consultar o PeeringDB e o RIPEstat agora' })
  expect(warning).toHaveTextContent('A rota e os tempos vieram do RIPE Atlas e estão certos.')
  expect(screen.getByText('Rede não identificada')).toBeInTheDocument()
  await userEvent.click(within(warning).getByRole('button', { name: 'Tentar de novo' }))
  await vi.waitFor(() => expect(route).toHaveBeenCalledTimes(2))
})

it('groups what the probe measures on its own and explains the DNS root servers', async () => {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
  const current = [
    { id: 30001001, type: 'ping', description: 'Ping (v4) measurement to google.com', target: 'google.com', interval: 240, tags: ['system-well-known-target'] },
    { id: 30001002, type: 'traceroute', description: 'Traceroute measurement to google.com', target: 'google.com', interval: 900, tags: ['system-well-known-target'] },
    { id: 22684516, type: 'ping', description: 'Anchoring Probes Measurement: Ping IPv4 for anchor br-sao-as36236.anchors.atlas.ripe.net', target: 'x', interval: 240, tags: ['anchoring'] },
    { id: 22684517, type: 'http', description: 'Anchoring Probes Measurement: Http IPv4 for anchor br-bhz-as10417-client.anchors.atlas.ripe.net', target: 'x', interval: 1800, tags: ['anchoring'] },
    { id: 40000001, type: 'dns', description: 'system-resolves-a-correctly: www.ripe.net', target: 'www.ripe.net', interval: 43200, tags: ['system-probe-tagging'] },
    { id: 40000002, type: 'dns', description: 'Someone else', target: 'example.org', interval: 43200, tags: [] },
    { id: 40000003, type: 'traceroute', description: 'Someone else', target: 'example.org', interval: 3600, tags: [] },
  ]
  const builtIn = [
    { id: 1001, type: 'ping', target: 'k.root-servers.net', interval: 240 },
    { id: 1009, type: 'ping', target: 'a.root-servers.net', interval: 240 },
    { id: 5001, type: 'traceroute', target: 'k.root-servers.net', interval: 1800 },
  ]
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/probe') return json({ probe_id: 1017210 })
    if (url === '/api/targets') return json(catalog)
    if (url.includes('/probes/1017210/?fields=tags')) return json({ tags: [{ slug: 'system-ipv4-rfc1918' }] })
    if (url.includes('current_probes=1017210')) return json({ next: null, results: current })
    if (url.includes('id__lt=100000')) return json({ next: null, results: builtIn })
    if (url.includes('/anchors/?search=br-sao-as36236')) return json({ results: [{ fqdn: 'br-sao-as36236.anchors.atlas.ripe.net', city: 'Sao Paulo', country: 'BR' }] })
    if (url.includes('/anchors/?search=br-bhz-as10417')) return json({ results: [{ fqdn: 'br-bhz-as10417.anchors.atlas.ripe.net', city: 'Belo Horizonte', country: 'BR' }] })
    return json({ id: 1017210, is_public: true, status: { id: 1, name: 'Connected', since: null } })
  }))
  window.location.hash = '#/aprender/medicoes-automaticas'
  render(<App />)
  expect(within(screen.getByRole('list', { name: 'Os 13 servidores raiz e quem mantém cada um' })).getAllByRole('listitem')).toHaveLength(13)
  expect(await screen.findByText('10 medições')).toBeInTheDocument()
  const data = within(screen.getByRole('region', { name: 'O seu dado' }))
  expect(data.getByText('Para 2 anchors, todas no Brasil.')).toBeInTheDocument()
  expect(data.getByText('As well-known, para 1 serviço popular.')).toBeInTheDocument()
  await userEvent.click(data.getByRole('button', { name: 'Anchors: 2 anchors' }))
  expect(data.getByText(/Belo Horizonte \(Brasil\)/)).toBeInTheDocument()
  const reading = within(screen.getByRole('region', { name: 'Como ler' }))
  expect(reading.getByText('1 do sistema de etiquetas')).toBeInTheDocument()
  expect(reading.getByText('3 de outras pessoas')).toBeInTheDocument()
})

it('shows the balance, what the probes earn and what the balance pays for in the credits lesson', async () => {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/probe') return json({ probe_id: 1017210 })
    if (url === '/api/targets') return json(catalog)
    if (url === '/api/account') return json({
      connected: true, probes: [], missing_permissions: [],
      credits: { current_balance: 1214346, estimated_daily_income: 29113 },
      income: [{ probe_id: 1017210, estimated_daily_income: 29113, yesterday_results_reward: 7513 }],
    })
    return json({ id: 1017210, is_public: true, status: { id: 1, name: 'Connected', since: null } })
  }))
  window.location.hash = '#/aprender/creditos'
  render(<App />)
  const data = within(screen.getByRole('region', { name: 'O seu dado' }))
  expect(await data.findByText('1.214.346')).toBeInTheDocument()
  expect(data.getByText('7.513')).toBeInTheDocument()
  expect(data.getByText(/Com esse saldo, você poderia criar cerca de/)).toHaveTextContent('202 mil pings ou 20 mil traceroutes')
  expect(within(screen.getByRole('region', { name: 'Como ler' })).getByText('7.513 ontem')).toBeInTheDocument()
})

it('points to the settings in the credits lesson without a linked account', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url === '/api/account' ? { connected: false } : url === '/api/probe' ? { probe_id: null } : {})))))
  window.location.hash = '#/aprender/creditos'
  render(<App />)
  expect(await screen.findByText('Vincule a sua conta do RIPE Atlas em Configurações para ver o seu saldo aqui.')).toBeInTheDocument()
  expect(screen.getByText('Com a conta vinculada, aqui aparece o que os seus números querem dizer.')).toBeInTheDocument()
})

it('explains in the credits lesson that the balance belongs to the account when no probe is followed', async () => {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/probe') return json({ probe_id: null })
    if (url === '/api/account') return json({ connected: true, probes: [], missing_permissions: [], credits: { current_balance: 1000, estimated_daily_income: 21600 }, income: [] })
    return json({})
  }))
  window.location.hash = '#/aprender/creditos'
  render(<App />)
  expect(await screen.findByText(/A Sondatlas não acompanha nenhuma probe agora, mas os créditos são da sua conta/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Acompanhar' })).toHaveAttribute('href', '#/acompanhar')
  expect(screen.getByText('1.000')).toBeInTheDocument()
})
