import { Text, Title } from '@mantine/core'
import { useId, type ReactNode } from 'react'
import './lessons.css'

export interface LessonPart {
  title: string
  content: ReactNode
}

export default function LessonParts({ parts }: { parts: LessonPart[] }) {
  const prefix = useId()
  const go = (index: number) => document.getElementById(`${prefix}-part-${index}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  return <div className="lesson-layout">
    <nav className="lesson-toc" aria-label="Nesta lição">
      <Text size="sm" fw={600} c="dimmed" mb={6}>Nesta lição</Text>
      <ul>
        {parts.map((part, index) => <li key={part.title}>
          <button type="button" onClick={() => go(index)}>{part.title}</button>
        </li>)}
      </ul>
    </nav>
    <div className="lesson-parts">
      {parts.map((part, index) => <section key={part.title} id={`${prefix}-part-${index}`} className="lesson-part" aria-labelledby={`${prefix}-${index}`}>
        <Title order={2} size="h4" id={`${prefix}-${index}`} mb="xs">{part.title}</Title>
        {part.content}
      </section>)}
    </div>
  </div>
}
