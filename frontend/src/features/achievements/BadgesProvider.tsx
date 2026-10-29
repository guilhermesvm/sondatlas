import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchAccount, KeyRefusedError, type Account } from '../atlas-account/account'
import { ChallengeError, fetchChallenges } from '../challenges/challenge'
import { checking, computeBadges, findPioneers, uptimeGoals, type Badge, type ChallengeHistory, type Pioneers } from './achievements'
import { findHistories, type Histories } from './connections'

interface BadgesState {
  account: Account | null
  refused: boolean
  error: string
  linked: boolean
  badges: Badge[]
  challenges: ChallengeHistory
  // True once every source answered, so no badge is still being checked.
  settled: boolean
  refresh: () => void
}

const BadgesContext = createContext<BadgesState | null>(null)

export function useBadges() {
  const badges = useContext(BadgesContext)
  if (!badges) throw new Error('useBadges precisa de um BadgesProvider')
  return badges
}

// A page asking again right after the dashboard opened reuses the reading that just started.
const recent = 10000

// The account and every source of the badges, read once when the dashboard opens and shared by the bell, Conquistas and Explorar.
export function BadgesProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [refused, setRefused] = useState(false)
  const [error, setError] = useState('')
  const [pioneers, setPioneers] = useState<Pioneers>('checking')
  const [histories, setHistories] = useState<Histories>('checking')
  const [challenges, setChallenges] = useState<ChallengeHistory>('checking')
  const [traceroutes, setTraceroutes] = useState<ChallengeHistory>('checking')
  const [groupPings, setGroupPings] = useState<ChallengeHistory>('checking')
  const [attempt, setAttempt] = useState(0)
  const started = useRef(0)

  useEffect(() => {
    started.current = Date.now()
    const controller = new AbortController()
    fetchAccount(controller.signal)
      .then(result => {
        setAccount(result)
        setRefused(false)
        setError('')
        const probes = result.probes ?? []
        findHistories(probes, uptimeGoals, controller.signal).then(setHistories, () => {
          if (!controller.signal.aborted) setHistories('failed')
        })
        const history = (set: typeof setChallenges, kind?: 'traceroute', group = false) => {
          if (result.missing_permissions?.includes('my_measurements')) set('missing')
          else if (result.connected) fetchChallenges(controller.signal, true, kind, group, true).then(list => set({ count: list.count, oldest: list.challenges }), (reason: Error) => {
            if (!controller.signal.aborted) set(reason instanceof ChallengeError && reason.missing.length ? 'missing' : 'failed')
          })
        }
        history(setChallenges)
        history(setTraceroutes, 'traceroute')
        history(setGroupPings, undefined, true)
        return findPioneers(probes, controller.signal).then(setPioneers, () => {
          if (!controller.signal.aborted) setPioneers('failed')
        })
      })
      .catch((reason: Error) => {
        if (controller.signal.aborted) return
        if (reason instanceof KeyRefusedError) setRefused(true)
        else setError(reason.message)
      })
    return () => controller.abort()
  }, [attempt])

  const refresh = useCallback(() => {
    if (Date.now() - started.current > recent) setAttempt(value => value + 1)
  }, [])

  const linked = account?.connected === true
  const badges = computeBadges(linked ? account.probes ?? [] : [], pioneers, linked ? account.credits ?? null : undefined, histories, linked ? challenges : undefined, linked ? traceroutes : undefined, linked ? groupPings : undefined)
  const settled = linked && !badges.some(badge => badge.status === checking)
  return <BadgesContext.Provider value={{ account, refused, error, linked, badges, challenges, settled, refresh }}>{children}</BadgesContext.Provider>
}
