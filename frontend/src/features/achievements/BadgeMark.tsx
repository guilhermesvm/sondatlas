import type { ReactNode } from 'react'

const icons: Record<string, ReactNode> = {
  signal: <><circle cx="12" cy="12" r="2" /><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  reconnect: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m8.5 15 2.5 2.5 4.5-4.5" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></>,
  route: <><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /><path d="M7 19h8a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h8" /></>,
  pins: <><circle cx="12" cy="12" r="9" /><path d="M3.5 9h17M3.5 15h17" /><circle cx="8" cy="6.5" r="1.4" /><circle cx="16" cy="11" r="1.4" /><circle cx="10" cy="17.5" r="1.4" /></>,
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
