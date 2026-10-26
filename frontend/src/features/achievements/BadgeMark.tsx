import type { ReactNode } from 'react'

const icons: Record<string, ReactNode> = {
  signal: <><circle cx="12" cy="12" r="2" /><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  probes: <><rect x="3" y="9" width="11" height="11" rx="2" /><path d="M10 9V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-5" /></>,
}

export default function BadgeMark({ mark }: { mark: string }) {
  const icon = icons[mark]
  const [number, unit] = mark.split(' ')
  return <div className="badge-mark" aria-hidden="true">
    {icon
      ? <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      : <span className="badge-number">{number}<small>{unit}</small></span>}
  </div>
}
