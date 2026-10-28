import { ActionIcon, Popover, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import LinkBadge from '../../lib/LinkBadge'
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

export default function AchievementBell() {
  const { linked, settled, badges } = useBadges()
  const [opened, setOpened] = useState<number | null>(readOpened)
  const [shown, setShown] = useState<Badge[] | null>(null)

  // On the first use the badges already earned are old news, so the bell starts counting from now.
  useEffect(() => {
    if (settled && opened === null) {
      const now = Date.now()
      saveOpened(now)
      setOpened(now)
    }
  }, [settled, opened])

  if (!linked) return null
  const fresh = settled && opened !== null ? badges.filter(badge => badge.earned && badge.on && badge.on * 1000 > opened).sort((a, b) => b.on! - a.on!) : []

  function toggle() {
    if (shown) return setShown(null)
    setShown(fresh)
    const now = Date.now()
    saveOpened(now)
    setOpened(now)
  }

  return <Popover opened={shown !== null} onChange={open => { if (!open) setShown(null) }} position="bottom-end" width={320} shadow="md" withArrow>
    <Popover.Target>
      <ActionIcon variant="subtle" color="white" size="lg" onClick={toggle} className="bell"
        aria-label={fresh.length ? `Conquistas: ${fresh.length === 1 ? '1 nova' : `${fresh.length} novas`}` : 'Conquistas: nenhuma nova'}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {fresh.length > 0 && <span className="bell-dot" aria-hidden="true" />}
      </ActionIcon>
    </Popover.Target>
    <Popover.Dropdown>
      <Text fw={600} size="sm">{shown?.length ? 'Conquistas novas' : 'Nenhuma conquista nova desde a última vez'}</Text>
      {shown && shown.length > 0 && <ul className="bell-list">
        {shown.map(badge => <li key={badge.id}>
          <span className="bell-mark"><BadgeMark mark={badge.mark} /></span>
          <div><Text size="sm" fw={600}>{badge.title}</Text><Text size="xs" c="dimmed">{statusText(badge)}</Text></div>
        </li>)}
      </ul>}
      <div className="bell-more"><LinkBadge href="#/conquistas">Ver as conquistas</LinkBadge></div>
    </Popover.Dropdown>
  </Popover>
}
