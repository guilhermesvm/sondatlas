import { ActionIcon, Popover, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import LinkBadge from '../../lib/LinkBadge'
import Loading from '../../lib/Loading'
import { statusText, type Badge } from './achievements'
import BadgeMark from './BadgeMark'
import { useBadges } from './BadgesProvider'
import './achievements.css'
import './achievement-bell.css'

// Only the moment the bell was last opened is kept, in this browser. Blocked storage just forgets it.
const key = 'sondatlas.conquistas.sino'

function readOpened() {
  try {
    const value = Number(localStorage.getItem(key))
    return value > 0 ? value : null
  } catch {
    return null
  }
}

function saveOpened(moment: number) {
  try {
    localStorage.setItem(key, String(moment))
  } catch {
    // Blocked storage: the bell still works for this visit.
  }
}

// The latest badges with a date, newest first. Those without one (credit balance, open data, collector) cannot be ordered.
const recent = 5

export default function AchievementBell() {
  const { account, refused, error, linked, settled, badges } = useBadges()
  const [opened, setOpened] = useState<number | null>(readOpened)
  const [open, setOpen] = useState(false)
  // The last opening before this one, so the badges that were new keep their mark while the list stays open.
  const [since, setSince] = useState<number | null>(null)

  // On the first use the badges already earned are old news, so the bell starts counting from now.
  useEffect(() => {
    if (settled && opened === null) {
      const now = Date.now()
      saveOpened(now)
      setOpened(now)
    }
  }, [settled, opened])

  // Opened while the badges were still being checked, the list counts as read once the check ends.
  useEffect(() => {
    if (open && settled) {
      const now = Date.now()
      saveOpened(now)
      setOpened(now)
    }
  }, [open, settled])

  const unlinked = refused || account?.connected === false
  const checking = !unlinked && !error && !settled
  // Every earned badge has a real date and badges do not go away, so a new one lights the bell as soon as its source answers.
  const dated = linked ? badges.filter(badge => badge.earned && badge.on).sort((a, b) => b.on! - a.on!) : []
  const fresh = opened !== null ? dated.filter(badge => badge.on! * 1000 > opened) : []
  const isNew = (badge: Badge) => since !== null && badge.on! * 1000 > since

  function toggle() {
    if (!open) setSince(opened)
    setOpen(!open)
  }

  const label = unlinked ? 'Conquistas' : checking && !fresh.length ? 'Conquistas: conferindo'
    : fresh.length ? `Conquistas: ${fresh.length === 1 ? '1 nova' : `${fresh.length} novas`}` : 'Conquistas: nenhuma nova'

  return <Popover opened={open} onChange={setOpen} position="bottom-end" width={340} shadow="md" withArrow>
    <Popover.Target>
      <ActionIcon variant="subtle" color="white" size="lg" onClick={toggle} className="bell" aria-label={label}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {fresh.length > 0 && <span className="bell-dot" aria-hidden="true" />}
      </ActionIcon>
    </Popover.Target>
    <Popover.Dropdown>
      {unlinked ? <>
        <Text size="sm">Vincule a sua conta do RIPE Atlas para ver as suas conquistas.</Text>
        <div className="bell-more"><LinkBadge href="#/configuracoes">Ir para Configurações</LinkBadge></div>
      </> : error ? <Text size="sm">Não foi possível conferir as suas conquistas agora. Recarregue a página em instantes.</Text> : <>
        <Text fw={600} size="sm">Conquistas recentes</Text>
        {checking && <Loading mt="xs">Conferindo as suas conquistas…</Loading>}
        {!checking && !dated.length && <Text size="sm" mt="xs">Você ainda não tem conquistas. Veja como ganhar a primeira.</Text>}
        {dated.length > 0 && <ul className="bell-list">
          {dated.slice(0, recent).map(badge => <li key={badge.id} data-read={!isNew(badge)}>
            <span className="bell-mark"><BadgeMark mark={badge.mark} /></span>
            <div>
              <Text size="sm" fw={600} className="bell-title">{badge.title}{isNew(badge) && <span className="bell-new">nova</span>}</Text>
              <Text size="xs" className="bell-status">{statusText(badge)}</Text>
            </div>
          </li>)}
        </ul>}
        <div className="bell-more"><LinkBadge href="#/conquistas">Ver as conquistas</LinkBadge></div>
      </>}
    </Popover.Dropdown>
  </Popover>
}
