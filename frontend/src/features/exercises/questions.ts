import type { PingRecord } from '../../lib/api'
import { formatMetric } from '../ping-history/chart'

export interface Question {
  id: string
  prompt: string
  options: string[]
  answer: number
  explanation: string
  // Questions built from the followed probe's own measurements.
  fromData?: boolean
}

const ms = (value: number) => `${formatMetric(value)} ms`

// Answers follow what each lesson teaches, so a question never asks for something the lesson did not explain.
export const conceptQuestions: Record<string, Question[]> = {
  ping: [
    {
      id: 'rtt', prompt: 'O que o RTT de um ping mede?',
      options: ['A velocidade de download da sua Internet', 'O tempo que um pacote leva para ir até o servidor e voltar', 'Quantos roteadores existem no caminho', 'O tamanho do pacote enviado'],
      answer: 1,
      explanation: 'RTT vem do inglês round-trip time, o tempo de ida e volta, medido em milissegundos. O ping não mede velocidade de download nem de upload.',
    },
    {
      id: 'distance', prompt: 'A luz na fibra percorre cerca de 200 km por milissegundo. Se um ping leva 10 ms, o servidor está a no máximo quantos km de cabo?',
      options: ['200 km', '1.000 km', '2.000 km', '10.000 km'],
      answer: 1,
      explanation: 'Os 10 ms são de ida e volta, então a ida leva 5 ms, que cabem em 5 × 200 = 1.000 km de cabo. A distância real costuma ser menor, porque o caminho também gasta tempo em roteadores e filas.',
    },
    {
      id: 'loss', prompt: 'Uma rodada de ping com 100% de perda prova que a sua Internet caiu?',
      options: ['Sim, se nenhum pacote voltou, a conexão caiu', 'Não, o servidor ou um equipamento no caminho pode ter ignorado o ping'],
      answer: 1,
      explanation: 'Muitos servidores e equipamentos ignoram ping. A perda diz que os pacotes não voltaram, não por quê.',
    },
    {
      id: 'missing', prompt: 'Um período sem nenhum resultado de ping é a mesma coisa que perda?',
      options: ['Sim, os dois mostram que os pacotes se perderam', 'Não, sem resultado pode ser que a probe estava desligada'],
      answer: 1,
      explanation: 'Perda é quando a probe mediu e o pacote não voltou. Sem resultado, a medição nem aconteceu, por exemplo com a probe desligada.',
    },
  ],
  ip: [
    {
      id: 'ipv4', prompt: 'Qual destes é um endereço IPv4?',
      options: ['2001:7fd::1', '193.0.14.129', 'k.root-servers.net', 'AS25152'],
      answer: 1,
      explanation: 'O IPv4 é escrito como quatro números separados por pontos. 2001:7fd::1 é IPv6, k.root-servers.net é um nome e AS25152 é o número de uma rede. Os três primeiros são do K-root.',
    },
    {
      id: 'ipv6', prompt: 'Por que o IPv6 foi criado?',
      options: ['Para deixar a Internet mais rápida', 'Porque os endereços IPv4 acabaram', 'Para esconder o endereço das casas', 'Para substituir o DNS'],
      answer: 1,
      explanation: 'O IPv4 tem 32 bits, e os endereços livres acabaram: o RIPE NCC ficou sem IPv4 em 2019, e o LACNIC reservou o último bloco em 2020. O IPv6, com 128 bits, foi criado para resolver essa falta.',
    },
    {
      id: 'nat', prompt: 'O que o NAT faz no roteador da sua casa?',
      options: ['Dá um endereço público para cada aparelho', 'Troca o endereço privado de cada aparelho pelo endereço público da casa, na saída para a Internet', 'Mede o tempo até o provedor', 'Bloqueia o IPv6'],
      answer: 1,
      explanation: 'Dentro de casa, cada aparelho tem um endereço privado. Na saída, o roteador troca esse endereço pelo endereço público que o provedor deu para a casa. Assim muitos aparelhos dividem um endereço só.',
    },
    {
      id: 'private', prompt: 'Outra casa pode usar o mesmo endereço privado que a sua probe, como 192.168.1.5?',
      options: ['Sim, o endereço privado só vale dentro de cada rede', 'Não, cada endereço é único no mundo'],
      answer: 0,
      explanation: 'Endereços privados, como os que começam com 192.168, só valem dentro da rede de cada casa. Na Internet, quem aparece é o endereço público.',
    },
  ],
  traceroute: [
    {
      id: 'ttl', prompt: 'O que acontece quando o TTL de um pacote chega a zero num roteador?',
      options: ['O pacote volta para a casa de quem mandou', 'O roteador descarta o pacote e avisa quem mandou, revelando o próprio endereço', 'O roteador manda o pacote mais rápido', 'O destino responde no lugar do roteador'],
      answer: 1,
      explanation: 'O TTL diminui 1 em cada roteador. Quando chega a zero, o roteador descarta o pacote e avisa quem mandou. O traceroute usa esse aviso para descobrir cada roteador do caminho.',
    },
    {
      id: 'silent', prompt: 'No meio da rota aparece um salto com * * *, e os saltos seguintes respondem. O que isso quer dizer?',
      options: ['Os pacotes se perderam ali', 'A rota acabou ali', 'O roteador não respondeu, mas os pacotes passaram por ele', 'O destino está fora do ar'],
      answer: 2,
      explanation: 'Se os saltos seguintes respondem, os pacotes passaram. Aquele roteador só não mandou o aviso, o que é comum.',
    },
    {
      id: 'return', prompt: 'O traceroute mostra o caminho de volta, do destino até você?',
      options: ['Sim, ele mostra a ida e a volta', 'Não, ele mostra só a ida, e a volta pode ser outra'],
      answer: 1,
      explanation: 'O traceroute descobre os roteadores da ida. O caminho de volta é escolhido pelas redes do outro lado e pode ser diferente.',
    },
    {
      id: 'exchange', prompt: 'O que é um ponto de troca de tráfego, como o IX.br?',
      options: ['O roteador da sua casa', 'Um lugar onde as redes se conectam para trocar tráfego', 'O servidor de destino', 'Um tipo de endereço privado'],
      answer: 1,
      explanation: 'Nos pontos de troca, as redes se conectam diretamente. O IX.br é um projeto do Comitê Gestor da Internet no Brasil (CGI.br).',
    },
  ],
}

export const exerciseLessons = Object.keys(conceptQuestions)

const periods = [
  { name: 'de madrugada', label: 'De madrugada (0h às 6h)' },
  { name: 'de manhã', label: 'De manhã (6h às 12h)' },
  { name: 'à tarde', label: 'À tarde (12h às 18h)' },
  { name: 'à noite', label: 'À noite (18h à 0h)' },
]

// Needs a good part of the day measured: one round every 4 minutes gives 360 in 24 hours.
export function busiestPeriodQuestion(records: readonly PingRecord[], target: string, typical: number | null): Question | null {
  const measured = records.filter(record => record.rtt_avg_ms !== null && Number.isFinite(record.rtt_avg_ms))
  if (measured.length < 60) return null
  const peak = measured.reduce((top, record) => record.rtt_avg_ms! > top.rtt_avg_ms! ? record : top)
  const moment = new Date(peak.timestamp)
  const period = Math.floor(moment.getHours() / 6)
  const time = moment.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return {
    id: 'busiest', fromData: true,
    prompt: `Nas últimas 24 horas, em que parte do dia o ping da sua probe até o ${target} demorou mais?`,
    options: periods.map(item => item.label), answer: period,
    explanation: `O maior tempo médio até o ${target} foi ${ms(peak.rtt_avg_ms!)}, às ${time}, ${periods[period].name}.${typical ? ` O tempo típico do dia foi ${ms(typical)}.` : ''} O ping mostra quando o tempo subiu, mas não diz por quê.`,
  }
}

export function fastestTargetQuestion(targets: { name: string, typical: number | null }[]): Question | null {
  const measured = targets.filter((target): target is { name: string, typical: number } => target.typical !== null)
  if (measured.length < 2) return null
  const fastest = measured.reduce((best, target) => target.typical < best.typical ? target : best)
  return {
    id: 'fastest', fromData: true,
    prompt: 'Nas últimas 24 horas, qual destino respondeu mais rápido para a sua probe?',
    options: measured.map(target => target.name), answer: measured.indexOf(fastest),
    explanation: `Tempo típico de cada um: ${measured.map(target => `${target.name}, ${ms(target.typical)}`).join('. ')}. O menor tempo quer dizer mais perto pela rede, não necessariamente no mapa.`,
  }
}

export function privateAddressQuestion(privateAddress: string | null): Question {
  return {
    id: 'your-private', fromData: true,
    prompt: 'A sua probe usa um endereço privado?',
    options: ['Sim', 'Não'], answer: privateAddress ? 0 : 1,
    explanation: privateAddress
      ? `Sim, ${privateAddress}. Ele só vale dentro da sua rede, e o roteador faz o NAT na saída para a Internet.`
      : 'Não. A probe tem um endereço público direto, que a Sondatlas não mostra porque ele identifica a sua conexão.',
  }
}

export function ipv6Question(hasIpv6: boolean): Question {
  return {
    id: 'your-ipv6', fromData: true,
    prompt: 'A sua probe consegue medir pelo IPv6?',
    options: ['Sim', 'Não'], answer: hasIpv6 ? 0 : 1,
    explanation: hasIpv6
      ? 'Sim. O RIPE Atlas encontrou IPv6 funcionando na sua probe, então ela mede pelos dois formatos.'
      : 'Não. O RIPE Atlas não encontrou IPv6 funcionando na sua probe. Para ter IPv6, o provedor precisa oferecer e o roteador da casa precisa entregar o IPv6 para a probe.',
  }
}

// Distractors are clearly farther (20% or more), so a tie of a few tenths of a millisecond never decides the answer.
export function nearestRootQuestion(roots: { name: string, avg: number }[]): Question | null {
  const ranked = [...roots].sort((a, b) => a.avg - b.avg)
  if (ranked.length < 4) return null
  const nearest = ranked[0]
  const farther = ranked.filter(root => root.avg >= nearest.avg * 1.2)
  if (farther.length < 3) return null
  const picks = [farther[0], farther[Math.floor(farther.length / 2)], farther[farther.length - 1]]
  const options = [nearest, ...new Set(picks)].sort((a, b) => a.name.localeCompare(b.name))
  if (options.length < 4) return null
  return {
    id: 'nearest-root', fromData: true,
    prompt: 'Qual destes servidores raiz está mais perto da sua probe, pela rede?',
    options: options.map(root => root.name), answer: options.indexOf(nearest),
    explanation: `No último ping automático da sua probe, o ${nearest.name} respondeu em ${ms(nearest.avg)}. Do mais perto ao mais longe: ${ranked.map(root => `${root.name} ${ms(root.avg)}`).join(', ')}.`,
  }
}

export function hopCountQuestion(hops: number): Question {
  const options = [...new Set([hops - 3, hops, hops + 3, hops + 7].filter(value => value > 0))].sort((a, b) => a - b)
  return {
    id: 'hops', fromData: true,
    prompt: 'Na última rota da sua probe até o K-root, em que salto o K-root respondeu?',
    options: options.map(String), answer: options.indexOf(hops),
    explanation: `O K-root respondeu no salto ${hops}. Cada salto é um roteador do caminho, a começar pelo da sua casa. A lição de traceroute mostra essa rota salto por salto.`,
  }
}
