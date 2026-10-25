import { Anchor, Badge, Breadcrumbs, Button, Text, Title } from '@mantine/core'
import type { ComponentType } from 'react'
import { lessons, type Lesson } from '../features/lessons/lessons'
import PingLesson from '../features/lessons/PingLesson'
import './pages.css'

const groups = [
  { id: 'basics', title: 'Fundamentos de redes' },
  { id: 'atlas', title: 'RIPE Atlas' },
] as const

const contents: Record<string, ComponentType> = { ping: PingLesson }

const courses = [
  { title: 'Internet Measurements', text: 'Módulos curtos sobre ping, traceroute e comutação de pacotes, e webinars sobre o RIPE Atlas.', href: 'https://academy.ripe.net/mod/page/view.php?id=937' },
  { title: 'IPv6', text: 'Do webinar de introdução ao curso IPv6 Fundamentals.', href: 'https://academy.ripe.net/mod/page/view.php?id=928' },
]

function LessonPage({ lesson }: { lesson: Lesson }) {
  const Content = contents[lesson.id]
  return <div className="install">
    <Breadcrumbs aria-label="Você está em" mb="xs"><Anchor href="#/aprender" size="sm">Aprender</Anchor><Text size="sm">{lesson.title}</Text></Breadcrumbs>
    <Title order={1} size="h2">{lesson.title}</Title>
    <Text size="lg" mt="sm" maw={680}>{lesson.text}</Text>
    <Content />
    <Button component="a" href="#/aprender" variant="default" mt="xl">Voltar ao índice</Button>
  </div>
}

export default function Learn({ lesson }: { lesson?: Lesson | null }) {
  if (lesson) return <LessonPage lesson={lesson} />
  return <div className="install">
    <Title order={1} size="h2">Aprender</Title>
    <Text size="lg" mt="sm" maw={680}>Entenda o que a sua probe mede, com os dados dela. Cada lição explica o conceito, mostra o seu dado, ensina a ler e diz o que ele não mostra.</Text>

    {groups.map((group, index) => <section key={group.id} className="lesson-group" aria-labelledby={`lessons-${index}`}>
      <Title order={2} size="h4" id={`lessons-${index}`}>{group.title}</Title>
      <ul className="lesson-list">
        {lessons.filter(item => item.group === group.id).map(item => <li key={item.id}>
          <div className="lesson-row">
            <div><Text fw={600}>{item.title}</Text><Text size="sm">{item.text}</Text></div>
            {item.ready
              ? <Badge component="a" href={`#/aprender/${item.id}`} size="lg" tt="none" className="lesson-badge lesson-ready" aria-label={`Ler a lição ${item.title}`}>Ler lição</Badge>
              : <Badge size="lg" variant="light" color="gray" tt="none" className="lesson-badge">Em breve</Badge>}
          </div>
        </li>)}
      </ul>
    </section>)}

    <section className="lesson-group academy" aria-labelledby="academy">
      <Title order={2} size="h4" id="academy">Para ir mais fundo: RIPE NCC Academy</Title>
      <Text size="sm" mt={4} maw={680}>
        Cursos gratuitos do RIPE NCC, que mantém o RIPE Atlas. Para se inscrever, use uma conta RIPE NCC Access, a mesma do RIPE Atlas. Os cursos estão em inglês.
      </Text>
      <ul className="lesson-list">
        {courses.map(course => <li key={course.title} className="lesson-row">
          <div>
            <Anchor href={course.href} target="_blank" rel="noreferrer" fw={600}>{course.title}</Anchor>
            <Text size="sm">{course.text}</Text>
          </div>
        </li>)}
      </ul>
    </section>
  </div>
}
