import { useProbe } from './ProbeProvider'
import { statusLook } from './status'
import './probe-status.css'

export function useStatusLook() {
  const { probeId, loadError, status, statusError } = useProbe()
  if (status) return statusLook(status)
  if (loadError || (probeId && statusError)) return { key: null, label: 'Status indisponível' }
  return null
}

export default function StatusLabel({ look }: { look: { key: string | null, label: string } }) {
  return <span className="status-label">
    {look.key && <span className="status-dot" data-status={look.key} aria-hidden="true" />}{look.label}
  </span>
}
