import { Anchor, Badge, Breadcrumbs, Button, Text, Title } from '@mantine/core'
import type { ComponentType } from 'react'
import Exercises from '../features/exercises/Exercises'
import { lastResult, savedRound } from '../features/exercises/progress'
import { exerciseLessons } from '../features/exercises/questions'
import { lessons, type Lesson } from '../features/lessons/lessons'
import CreditsLesson from '../features/lessons/CreditsLesson'
import IpLesson from '../features/lessons/IpLesson'
import OwnMeasurementsLesson from '../features/lessons/OwnMeasurementsLesson'
import PingLesson from '../features/lessons/PingLesson'
import TracerouteLesson from '../features/lessons/TracerouteLesson'
import './pages.css'

const groups = [
  { id: 'basics', title: 'Fundamentos de redes' },
  { id: 'atlas', title: 'RIPE Atlas' },
] as const

const contents: Record<string, ComponentType> = { ip: IpLesson, ping: PingLesson, traceroute: TracerouteLesson, 'medicoes-automaticas': OwnMeasurementsLesson, creditos: CreditsLesson }

const courses = [
  { title: 'Internet Measurements', text: 'Módulos curtos sobre ping, traceroute e comutação de pacotes, e webinars sobre o RIPE Atlas.', href: 'https://academy.ripe.net/mod/page/view.php?id=937' },
  { title: 'IPv6', text: 'Do webinar de introdução ao curso IPv6 Fundamentals.', href: 'https://academy.ripe.net/mod/page/view.php?id=928' },
]

// True while every ready lesson of the basics group has exercises, which a test checks.
const withExercises = 'As lições de Fundamentos de redes terminam com exercícios, alguns com os dados da sua probe.'

function ExercisesEntry({ lesson }: { lesson: Lesson }) {
  const last = lastResult(lesson.id)
  const round = savedRound(lesson.id)
  return <section className="lesson-exercises" aria-labelledby="lesson-exercises">
    <div>
      <Title order={2} size="h4" id="lesson-exercises">Exercícios</Title>
      <Text size="sm" mt={4}>Perguntas sobre esta lição, e algumas com os dados da sua probe. Responda e veja se acertou.</Text>
      {last && <Text size="sm" mt={4}>Último resultado: <strong>{last.score} de {last.total}</strong>, em {new Date(last.at).toLocaleDateString('pt-BR')}.</Text>}
    </div>
    <Button component="a" href={`#/aprender/${lesson.id}/exercicios`} className="lesson-exercises-button">
      {round ? 'Continuar os exercícios' : last ? 'Refazer os exercícios' : 'Fazer os exercícios'}
    </Button>
  </section>
}

function LessonPage({ lesson }: { lesson: Lesson }) {
  const Content = contents[lesson.id]
  return <div className="install">
    <Breadcrumbs aria-label="Você está em" mb="xs"><Anchor href="#/aprender" size="sm">Aprender</Anchor><Text size="sm">{lesson.title}</Text></Breadcrumbs>
    <Title order={1} className="page-title">{lesson.title}</Title>
    <Text size="lg" mt="sm" maw={680}>{lesson.text}</Text>
    <Content />
    {exerciseLessons.includes(lesson.id) && <ExercisesEntry lesson={lesson} />}
    <Button component="a" href="#/aprender" variant="default" mt="xl">Voltar ao índice</Button>
  </div>
}

export default function Learn({ lesson, exercises = false }: { lesson?: Lesson | null, exercises?: boolean }) {
  if (lesson && exercises && exerciseLessons.includes(lesson.id)) return <Exercises key={lesson.id} lesson={lesson} />
  if (lesson) return <LessonPage lesson={lesson} />
  return <div className="install">
    <Title order={1} className="page-title">Aprender</Title>
    <Text size="lg" mt="sm" maw={1000}>Entenda o que a sua probe mede, com os dados dela. Cada lição explica o conceito, mostra o seu dado, ensina a ler e diz o que ele não mostra.</Text>
    <Text mt="xs" maw={900}>{withExercises}</Text>

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
      <div className="academy-heading">
        <Title order={2} size="h4" id="academy">Para ir mais fundo: RIPE NCC Academy</Title>
        <span className="academy-badge">Em inglês</span>
      </div>
      <Text size="sm" mt={6} maw={760} className="academy-text">
        Cursos gratuitos do RIPE NCC, que mantém o RIPE Atlas. Para se inscrever, use uma conta RIPE NCC Access, a mesma do RIPE Atlas. Os cursos estão em inglês.
      </Text>
      <ul className="academy-courses">
        {courses.map(course => <li key={course.title} className="academy-course">
          <div>
            <a href={course.href} target="_blank" rel="noreferrer">{course.title}</a>
            <p>{course.text}</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </li>)}
      </ul>
    </section>
  </div>
}
