import { Loader, Text, Title, VisuallyHidden } from '@mantine/core'
import { useEffect, type ReactNode } from 'react'
import { checking } from '../features/achievements/achievements'
import { useBadges } from '../features/achievements/BadgesProvider'
import { lastResult } from '../features/exercises/progress'
import { exerciseLessons } from '../features/exercises/questions'
import { useProbe } from '../features/probe-status/ProbeProvider'
import LinkBadge from '../lib/LinkBadge'
import './pages.css'

type State = 'done' | 'pending' | 'loading'

interface Milestone {
  title: string
  state: State
  text: ReactNode
  link?: { href: string, label: string }
}

const day = (first: number | string) => new Date(typeof first === 'number' ? first * 1000 : first).toLocaleDateString('pt-BR')
const toSettings = { href: '#/configuracoes', label: 'Ir para Configurações' }
const notLinked = 'Vincule a sua conta do RIPE Atlas para a Sondatlas saber quais probes são suas.'
const stateNames: Record<State, string> = { done: 'Feito', pending: 'Falta', loading: 'Conferindo' }

interface Item {
  title: string
  text: string
  href: string
  action?: string
}

// Next steps grouped by what the person wants to do. Every claim was checked on the official page it links to.
function tracks(probeId: number | null): { title: string, text: string, items: Item[] }[] {
  return [
    {
      title: 'Quer medir mais?',
      text: 'Os seus créditos medem muito além de um ping.',
      items: [
        { title: 'Probes de outras pessoas', text: 'As probes públicas medem para quem tem créditos, em qualquer país onde exista uma. O ping de várias probes já faz isso.', href: '#/desafios', action: 'Ir para Desafios' },
        { title: 'Outros tipos de medição', text: 'DNS, certificados TLS dos sites e NTP, o protocolo que acerta o relógio dos computadores.', href: 'https://atlas.ripe.net/docs/getting-started/user-defined-measurements/' },
        { title: 'Medições periódicas', text: 'Uma medição que se repete em intervalos, com cada resultado pela metade do preço. Ela para de receber resultados se o saldo zerar.', href: 'https://atlas.ripe.net/measurements/form/' },
        { title: 'Anchors', text: 'Probes mais fortes, mantidas por organizações, que também servem de destino. Com elas, dá para medir o caminho até a rede do seu provedor.', href: 'https://atlas.ripe.net/docs/howtos/anchors/' },
      ],
    },
    {
      title: 'Quer ver os dados de outro jeito?',
      text: 'Ferramentas do RIPE NCC que desenham as medições.',
      items: [
        { title: 'LatencyMON', text: 'Gráficos da latência ao longo do tempo, para comparar probes lado a lado em medições periódicas.', href: 'https://atlas.ripe.net/docs/tools-and-code/latencymon/' },
        { title: 'Khipu', text: 'O caminho dos traceroutes desenhado como uma árvore, por endereço, rede ou país.', href: 'https://atlas.ripe.net/docs/tools-and-code/khipu/' },
        probeId
          ? { title: 'Path Analysis', text: `Compara os traceroutes ao longo do tempo e marca as mudanças de rota. Está na página da ${probeId} no RIPE Atlas, na aba Results.`, href: `https://atlas.ripe.net/probes/${probeId}/results` }
          : { title: 'Path Analysis', text: 'Compara os traceroutes ao longo do tempo e marca as mudanças de rota.', href: 'https://atlas.ripe.net/pathanalysis' },
      ],
    },
    {
      title: 'Quer programar?',
      text: 'Para buscar e analisar os dados nos seus próprios programas.',
      items: [
        { title: 'API do RIPE Atlas', text: 'Tudo o que a Sondatlas mostra vem dela: probes, medições e resultados.', href: 'https://atlas.ripe.net/docs/apis/' },
        { title: 'Linha de comando', text: 'Cria e consulta medições pelo terminal. Precisa de Python.', href: 'https://atlas.ripe.net/docs/tools-and-code/cli/' },
        { title: 'Sagan', text: 'Biblioteca Python do RIPE Atlas que transforma os resultados em dados prontos para usar.', href: 'https://atlas.ripe.net/docs/tools-and-code/sagan/' },
      ],
    },
    {
      title: 'Quer estudar mais?',
      text: 'Material para ir além da Sondatlas.',
      items: [
        { title: 'RIPE NCC Academy', text: 'Cursos gratuitos do RIPE NCC, em inglês, com certificado.', href: 'https://academy.ripe.net/' },
        { title: 'RIPE Labs', text: 'Artigos do RIPE NCC e da comunidade sobre a Internet e as medições dela.', href: 'https://labs.ripe.net/' },
      ],
    },
  ]
}

function Mark({ state }: { state: State }) {
  if (state === 'loading') return <Loader size={14} className="explore-mark" aria-hidden="true" />
  return <svg className="explore-mark" data-state={state} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    {state === 'done' && <path d="m7.5 12.5 3 3 6-6.5" />}
  </svg>
}

export default function Explore() {
  const { account, refused, error, linked, badges, challenges, refresh } = useBadges()
  useEffect(refresh, [refresh])
  const { probeId, loadError } = useProbe()
  const reading = !account && !refused && !error
  const unlinked = refused || account?.connected === false
  const failed = (what: string) => `Não foi possível consultar ${what} agora. Recarregue a página em instantes.`

  const probes = account?.probes ?? []
  const online = probes.filter(probe => probe.status.id === 1)
  const first = online.find(probe => probe.first_connected)?.first_connected
  const probe: Milestone = reading ? { title: 'Probe no ar', state: 'loading', text: 'Conferindo a sua conta…' }
    : error ? { title: 'Probe no ar', state: 'pending', text: error }
    : unlinked ? { title: 'Probe no ar', state: 'pending', text: notLinked, link: toSettings }
    : !probes.length ? { title: 'Probe no ar', state: 'pending', text: 'A sua conta ainda não tem probe. Instale e cadastre a sua.', link: { href: '#/instalar', label: 'Ir para Instalar' } }
    : !online.length ? { title: 'Probe no ar', state: 'pending', text: 'Nenhuma probe sua está conectada agora.', link: { href: '#/minha-probe', label: 'Ver o que fazer em Minha probe' } }
    : { title: 'Probe no ar', state: 'done', text: `${online.length === 1 ? `A ${online[0].id} está conectada` : `${online.length} probes suas estão conectadas`}.${first ? ` A primeira conexão foi em ${day(first)}.` : ''}`, link: { href: '#/minha-probe', label: 'Ver Minha probe' } }

  const followed: Milestone = probeId === undefined
    ? loadError ? { title: 'Probe acompanhada', state: 'pending', text: loadError } : { title: 'Probe acompanhada', state: 'loading', text: 'Conferindo…' }
    : probeId === null ? { title: 'Probe acompanhada', state: 'pending', text: 'A Sondatlas ainda não guarda o histórico de nenhuma probe.', link: { href: '#/acompanhar', label: 'Ir para Acompanhar' } }
    : { title: 'Probe acompanhada', state: 'done', text: `A Sondatlas guarda o histórico de ping da ${probeId}.`, link: { href: '#/minha-probe', label: 'Ver o histórico' } }

  const answered = exerciseLessons.filter(id => lastResult(id))
  const missing = answered.length < exerciseLessons.length
  const exercises: Milestone = {
    title: 'Exercícios',
    state: missing ? 'pending' : 'done',
    text: `${answered.length} de ${exerciseLessons.length} lições com exercícios respondidos neste navegador.`,
    link: { href: '#/aprender', label: 'Ir para Aprender' },
  }

  const made: Milestone = reading ? { title: 'Desafios', state: 'loading', text: 'Conferindo…' }
    : unlinked ? { title: 'Desafios', state: 'pending', text: notLinked, link: toSettings }
    : error || challenges === 'failed' ? { title: 'Desafios', state: 'pending', text: failed('os seus desafios') }
    : challenges === 'missing' ? { title: 'Desafios', state: 'pending', text: 'Falta na chave a permissão para listar as suas medições.', link: toSettings }
    : challenges === 'checking' ? { title: 'Desafios', state: 'loading', text: 'Conferindo…' }
    : !challenges.count ? { title: 'Desafios', state: 'pending', text: 'Você ainda não criou nenhuma medição.', link: { href: '#/desafios', label: 'Criar o primeiro desafio' } }
    : { title: 'Desafios', state: 'done', text: challenges.count === 1 ? 'Você criou 1 medição com os seus créditos.' : `Você criou ${challenges.count.toLocaleString('pt-BR')} medições com os seus créditos.`, link: { href: '#/desafios', label: 'Ver os desafios' } }

  const earned = badges.filter(badge => badge.earned).length
  const won: Milestone = reading || (linked && badges.some(badge => badge.status === checking)) ? { title: 'Conquistas', state: 'loading', text: 'Conferindo no RIPE Atlas…' }
    : unlinked || error ? { title: 'Conquistas', state: 'pending', text: notLinked, link: toSettings }
    : { title: 'Conquistas', state: earned ? 'done' : 'pending', text: `${earned} de ${badges.length} conquistadas.`, link: { href: '#/conquistas', label: 'Ver as conquistas' } }

  const milestones = [probe, followed, exercises, made, won]

  return <div className="install">
    <Title order={1} className="page-title">Explorar</Title>
    <Text size="lg" mt="sm" maw={1000}>Você chegou à última fase. Veja o que já fez com a sua probe e por onde continuar no RIPE Atlas.</Text>

    <section className="explore-section" aria-labelledby="explore-done">
      <Title order={2} size="h4" id="explore-done">O que você já fez</Title>
      <ul className="explore-steps">
        {milestones.map(item => <li key={item.title} data-state={item.state}>
          <Mark state={item.state} />
          <div>
            <Text fw={600}>{item.title}<VisuallyHidden>: {stateNames[item.state]}</VisuallyHidden></Text>
            <Text size="sm">{item.text}</Text>
          </div>
          {item.link && <LinkBadge href={item.link.href}>{item.link.label}</LinkBadge>}
        </li>)}
      </ul>
    </section>

    <section className="explore-section" aria-labelledby="explore-ahead">
      <Title order={2} size="h4" id="explore-ahead">Daqui para a frente</Title>
      <Text size="sm" mt={4} maw={680}>O RIPE Atlas vai além do que a Sondatlas mostra. Escolha por onde seguir. Tudo leva a material oficial.</Text>
      <div className="explore-tracks">
        {tracks(online[0]?.id ?? probes[0]?.id ?? null).map((track, index) => <section key={track.title} className="explore-track" aria-labelledby={`track-${index}`}>
          <div>
            <Title order={3} size="h5" id={`track-${index}`}>{track.title}</Title>
            <Text size="sm" c="dimmed" mt={4}>{track.text}</Text>
          </div>
          <ul className="explore-items">
            {track.items.map(item => <li key={item.title}>
              <div>
                <Text size="sm" fw={600}>{item.title}</Text>
                <Text size="sm">{item.text}</Text>
              </div>
              <LinkBadge href={item.href} label={item.action ? undefined : `Abrir ${item.title}`}>{item.action ?? 'Abrir'}</LinkBadge>
            </li>)}
          </ul>
        </section>)}
      </div>
    </section>
  </div>
}
