import { ActionIcon, CopyButton } from '@mantine/core'
import './pages.css'

export default function Command({ children }: { children: string }) {
  return <div className="command">
    <pre><code>{children}</code></pre>
    <CopyButton value={children}>
      {({ copied, copy }) => <ActionIcon variant="subtle" onClick={copy} aria-label={copied ? 'Copiado' : 'Copiar comando'} title={copied ? 'Copiado' : 'Copiar comando'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {copied ? <path d="M5 12l5 5L20 7" /> : <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>}
        </svg>
      </ActionIcon>}
    </CopyButton>
  </div>
}
