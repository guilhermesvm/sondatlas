import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchSelectedProbe } from '../../lib/api'
import { fetchProbeStatus, type ProbeStatus } from './status'

interface ProbeState {
  probeId: number | null | undefined
  loadError: string
  status: ProbeStatus | null
  statusError: boolean
  checking: boolean
  check: () => void
  select: (probeId: number) => void
}

const ProbeContext = createContext<ProbeState | null>(null)

export function useProbe() {
  const probe = useContext(ProbeContext)
  if (!probe) throw new Error('useProbe precisa de um ProbeProvider')
  return probe
}

export function ProbeProvider({ children }: { children: ReactNode }) {
  const [probeId, setProbeId] = useState<number | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState<ProbeStatus | null>(null)
  const [statusError, setStatusError] = useState(false)
  const [checking, setChecking] = useState(false)
  const request = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchSelectedProbe(controller.signal).then(setProbeId).catch((reason: Error) => {
      if (!controller.signal.aborted) setLoadError(reason.message)
    })
    return () => controller.abort()
  }, [])

  const check = useCallback(async () => {
    if (!probeId) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setChecking(true)
    try {
      const result = await fetchProbeStatus(probeId, controller.signal)
      if (!controller.signal.aborted) { setStatus(result); setStatusError(false) }
    } catch {
      if (!controller.signal.aborted) setStatusError(true)
    } finally {
      if (!controller.signal.aborted) setChecking(false)
    }
  }, [probeId])

  useEffect(() => {
    setStatus(null)
    setStatusError(false)
    check()
    return () => request.current?.abort()
  }, [check])

  const select = useCallback((id: number) => {
    setLoadError('')
    if (id === probeId) check()
    else setProbeId(id)
  }, [probeId, check])

  return <ProbeContext value={{ probeId, loadError, status, statusError, checking, check, select }}>{children}</ProbeContext>
}
