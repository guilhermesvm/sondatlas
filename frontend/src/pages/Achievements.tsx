import { Alert, Button, Progress, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { computeBadges, findPioneers, type Badge, type Pioneers } from '../features/achievements/achievements'
import BadgeMark from '../features/achievements/BadgeMark'
import '../features/achievements/achievements.css'
import { fetchAccount, KeyRefusedError, type Account } from '../features/atlas-account/account'
import SystemError from '../lib/SystemError'
import './pages.css'

const groups = [
  { id: 'first', title: 'Primeiros passos', text: null },
  { id: 'uptime', title: 'Tempo no ar', text: 'Somando todo o tempo conectada, mesmo com quedas no meio.' },
  { id: 'credits', title: 'Créditos', text: 'Estimados pelo tempo conectado. Cada minuto conectada rende 15 créditos.' },
] as const

function BadgeTile({ badge }: { badge: Badge }) {
  return <li className="badge" data-earned={badge.earned} aria-labelledby={`badge-${badge.id}`}>
    <BadgeMark mark={badge.mark} />
    <h3 className="badge-title" id={`badge-${badge.id}`}>{badge.title}</h3>
    <p className="badge-rule">{badge.rule}</p>
    {badge.progress !== undefined && <Progress className="badge-progress" value={Math.min(badge.progress, 1) * 100} color="orange.7" size="sm"
      aria-label={`Progresso de ${badge.title}`} />}
    <p className="badge-status">{badge.earned ? `Conquistada. ${badge.status}` : badge.status}</p>
  </li>
}

export default function Achievements() {
  const [account, setAccount] = useState<Account | null>(null)
  const [refused, setRefused] = useState(false)
  const [error, setError] = useState('')
  const [pioneers, setPioneers] = useState<Pioneers>('checking')

  useEffect(() => {
    const controller = new AbortController()
    fetchAccount(controller.signal)
      .then(result => {
        setAccount(result)
        return findPioneers(result.probes ?? [], controller.signal).then(setPioneers, () => {
          if (!controller.signal.aborted) setPioneers('failed')
        })
      })
      .catch((reason: Error) => {
        if (controller.signal.aborted) return
        if (reason instanceof KeyRefusedError) setRefused(true)
        else setError(reason.message)
      })
    return () => controller.abort()
  }, [])

  const linked = account?.connected === true
  const badges = computeBadges(linked ? account.probes ?? [] : [], pioneers)
  const earned = badges.filter(badge => badge.earned).length

  return <div className="install">
    <Title order={1} size="h2">Conquistas</Title>
    <Text size="lg" mt="sm" maw={680}>Marcos das suas probes no RIPE Atlas, calculados com os dados do próprio RIPE.</Text>
    {linked && <Text fw={600} mt="md">{earned} de {badges.length} conquistadas</Text>}

    {error && <SystemError title="Não foi possível consultar a sua conta">{error}</SystemError>}
    {(account?.connected === false || refused) && <Alert variant="light" mt="lg" maw={720}
      title={refused ? 'O RIPE Atlas recusou a chave salva' : 'Vincule a sua conta do RIPE Atlas'}>
      {refused
        ? 'Sem uma chave válida, a Sondatlas não sabe quais probes são suas. Vincule uma chave nova em Configurações.'
        : 'As conquistas contam só as probes da sua conta. Vincule a conta em Configurações para ver as suas.'}
      <div><Button component="a" href="#/configuracoes" size="sm" mt="sm">Ir para Configurações</Button></div>
    </Alert>}
    {!account && !refused && !error && <Text size="sm" mt="lg">Consultando a sua conta…</Text>}

    {(account || refused) && groups.map(group => <section key={group.id} className="badge-group" aria-labelledby={`badges-${group.id}`}>
      <Title order={2} size="h4" id={`badges-${group.id}`}>{group.title}</Title>
      {group.text && <Text size="sm" mt={4}>{group.text}</Text>}
      <ul className="badge-grid">
        {badges.filter(badge => badge.group === group.id).map(badge => <BadgeTile key={badge.id} badge={badge} />)}
      </ul>
    </section>)}
  </div>
}
