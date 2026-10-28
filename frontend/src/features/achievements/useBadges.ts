import { useEffect, useState } from 'react'
import { fetchAccount, KeyRefusedError, type Account } from '../atlas-account/account'
import { ChallengeError, fetchChallenges } from '../challenges/challenge'
import { computeBadges, findPioneers, uptimeGoals, type ChallengeHistory, type Pioneers } from './achievements'
import { findHistories, type Histories } from './connections'

// The account and every source of the badges, shared by Conquistas and Explorar so both count the same.
export function useBadges() {
  const [account, setAccount] = useState<Account | null>(null)
  const [refused, setRefused] = useState(false)
  const [error, setError] = useState('')
  const [pioneers, setPioneers] = useState<Pioneers>('checking')
  const [histories, setHistories] = useState<Histories>('checking')
  const [challenges, setChallenges] = useState<ChallengeHistory>('checking')
  const [traceroutes, setTraceroutes] = useState<ChallengeHistory>('checking')
  const [groupPings, setGroupPings] = useState<ChallengeHistory>('checking')

  useEffect(() => {
    const controller = new AbortController()
    fetchAccount(controller.signal)
      .then(result => {
        setAccount(result)
        const probes = result.probes ?? []
        findHistories(probes, uptimeGoals, controller.signal).then(setHistories, () => {
          if (!controller.signal.aborted) setHistories('failed')
        })
        const history = (set: typeof setChallenges, kind?: 'traceroute', group = false) => {
          if (result.missing_permissions?.includes('my_measurements')) set('missing')
          else if (result.connected) fetchChallenges(controller.signal, true, kind, group).then(list => set({ count: list.count, oldest: list.challenges }), (reason: Error) => {
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
  }, [])

  const linked = account?.connected === true
  const badges = computeBadges(linked ? account.probes ?? [] : [], pioneers, linked ? account.credits ?? null : undefined, histories, linked ? challenges : undefined, linked ? traceroutes : undefined, linked ? groupPings : undefined)
  return { account, refused, error, linked, badges, challenges }
}
