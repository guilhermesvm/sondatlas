import { Alert, Button, Loader, Progress, Text, Title } from '@mantine/core'
import { useEffect } from 'react'
import { checking, statusText, type Badge } from '../features/achievements/achievements'
import BadgeMark from '../features/achievements/BadgeMark'
import '../features/achievements/achievements.css'
import { useBadges } from '../features/achievements/BadgesProvider'
import Loading from '../lib/Loading'
import SystemError from '../lib/SystemError'
import './pages.css'

const groups = [
  { id: 'first', title: 'Primeiros passos', text: null },
  { id: 'uptime', title: 'Tempo no ar', text: 'Somando todo o tempo conectada, mesmo com quedas no meio.' },
  { id: 'history', title: 'Histórico de conexão', text: 'Calculadas pelos registros de conexão e queda que o RIPE Atlas guarda de cada probe.' },
  { id: 'credits', title: 'Créditos', text: 'Os créditos ficam na sua conta e somam todas as suas probes. Cada probe rende 15 por minuto conectada e 1 por resultado de medição. Estes badges olham o saldo atual.' },
  { id: 'challenges', title: 'Desafios', text: 'Medições que você criou pela Sondatlas, com os seus créditos. Contam as que o RIPE Atlas fez, mesmo sem resposta do destino.' },
] as const

function BadgeTile({ badge }: { badge: Badge }) {
  return <li className="badge" data-earned={badge.earned} aria-labelledby={`badge-${badge.id}`}>
    <BadgeMark mark={badge.mark} />
    <h3 className="badge-title" id={`badge-${badge.id}`}>{badge.title}</h3>
    <p className="badge-rule">{badge.rule}</p>
    {badge.progress !== undefined && <Progress className="badge-progress" value={Math.min(badge.progress, 1) * 100} color="orange.7" size="sm"
      aria-label={`Progresso de ${badge.title}`} />}
    <p className="badge-status">{badge.status === checking && <Loader size={10} aria-hidden="true" className="badge-loader" />}{statusText(badge)}</p>
  </li>
}

export default function Achievements() {
  const { account, refused, error, linked, badges, refresh } = useBadges()
  useEffect(refresh, [refresh])
  const earned = badges.filter(badge => badge.earned).length

  return <div className="install">
    <Title order={1} size="h2">Conquistas</Title>
    <Text size="lg" mt="sm" maw={680}>Marcos das suas probes no RIPE Atlas, calculados com os dados do próprio RIPE.</Text>
    {linked && <Text fw={600} mt="md">{earned} de {badges.length} conquistadas</Text>}

    {linked && (account?.missing_permissions ?? []).some(permission => ['probes', 'credits', 'my_measurements'].includes(permission)) && <Alert color="yellow" mt="lg" maw={720} title="Falta uma permissão na chave">
      Algumas conquistas precisam de uma permissão que a chave não tem. Veja o que falta em Configurações.
      <div><Button component="a" href="#/configuracoes" size="sm" mt="sm">Ir para Configurações</Button></div>
    </Alert>}
    {error && <SystemError title="Não foi possível consultar a sua conta">{error}</SystemError>}
    {(account?.connected === false || refused) && <Alert variant="light" mt="lg" maw={720}
      title={refused ? 'O RIPE Atlas recusou a chave salva' : 'Vincule a sua conta do RIPE Atlas'}>
      {refused
        ? 'Sem uma chave válida, a Sondatlas não sabe quais probes são suas. Vincule uma chave nova em Configurações.'
        : 'As conquistas contam só as probes da sua conta. Vincule a conta em Configurações para ver as suas.'}
      <div><Button component="a" href="#/configuracoes" size="sm" mt="sm">Ir para Configurações</Button></div>
    </Alert>}
    {!account && !refused && !error && <Loading mt="lg">Consultando a sua conta…</Loading>}

    {(account || refused) && groups.map(group => <section key={group.id} className="badge-group" aria-labelledby={`badges-${group.id}`}>
      <Title order={2} size="h4" id={`badges-${group.id}`}>{group.title}</Title>
      {group.text && <Text size="sm" mt={4}>{group.text}</Text>}
      <ul className="badge-grid">
        {badges.filter(badge => badge.group === group.id).map(badge => <BadgeTile key={badge.id} badge={badge} />)}
      </ul>
    </section>)}
  </div>
}
