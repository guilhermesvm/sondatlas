import { Anchor, Breadcrumbs, Button, Group, Progress, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import Loading from '../../lib/Loading'
import type { Lesson } from '../lessons/lessons'
import { finishRound, saveRound, savedRound } from './progress'
import { conceptQuestions } from './questions'
import { useDataQuestions } from './useDataQuestions'
import './exercises.css'

// One question at a time. Concept questions first, then the ones from the followed probe's data.
export default function Exercises({ lesson }: { lesson: Lesson }) {
  const { probeId, questions: fromData } = useDataQuestions(lesson.id)
  // A reload or a visit later continues the round where it stopped.
  const [saved] = useState(() => savedRound(lesson.id))
  const [index, setIndex] = useState(saved?.index ?? 0)
  const [picked, setPicked] = useState<number | null>(saved?.picked ?? null)
  const [score, setScore] = useState(saved?.score ?? 0)
  const lessonHref = `#/aprender/${lesson.id}`
  const total = fromData === null ? null : conceptQuestions[lesson.id].length + fromData.length
  const finished = total !== null && index >= total

  useEffect(() => {
    if (total === null) return
    if (finished) finishRound(lesson.id, score, total)
    else saveRound(lesson.id, index > 0 || picked !== null ? { index, score, picked } : null)
  }, [lesson.id, index, score, picked, total, finished])

  const header = <>
    <Breadcrumbs aria-label="Você está em" mb="xs">
      <Anchor href="#/aprender" size="sm">Aprender</Anchor>
      <Anchor href={lessonHref} size="sm">{lesson.title}</Anchor>
      <Text size="sm">Exercícios</Text>
    </Breadcrumbs>
    <Title order={1} className="page-title">Exercícios: {lesson.title}</Title>
  </>
  if (fromData === null) return <div className="install">{header}<Loading mt="lg">Preparando as perguntas com os dados da sua probe…</Loading></div>

  const questions = [...conceptQuestions[lesson.id], ...fromData]
  const restart = () => { saveRound(lesson.id, null); setIndex(0); setPicked(null); setScore(0) }

  if (finished) return <div className="install">
    {header}
    <section className="exercise-end" aria-live="polite">
      <Text className="exercise-score">{score} de {questions.length}</Text>
      <Text size="lg">{score === questions.length ? 'Você acertou todas.' : `Você acertou ${score} de ${questions.length} perguntas.`} A lição continua aqui para rever o que quiser.</Text>
      <Group mt="lg">
        <Button onClick={restart}>Refazer os exercícios</Button>
        <Button component="a" href={lessonHref} variant="default">Voltar à lição</Button>
      </Group>
    </section>
  </div>

  const question = questions[index]
  const answered = picked !== null && picked < question.options.length
  const choose = (option: number) => {
    if (answered) return
    setPicked(option)
    if (option === question.answer) setScore(value => value + 1)
  }
  const state = (option: number) => !answered ? undefined : option === question.answer ? 'right' : option === picked ? 'wrong' : 'other'

  return <div className="install">
    {header}
    <Text size="lg" mt="sm" maw={680}>
      {conceptQuestions[lesson.id].length} perguntas sobre a lição{fromData.length ? ` e ${fromData.length} com os dados da sua probe` : ''}.
      {!probeId ? ' Acompanhe uma probe para ganhar perguntas com os dados dela.' : ''}
    </Text>
    <section className="exercise" aria-labelledby="exercise-prompt">
      <div className="exercise-progress">
        <Text size="sm" c="dimmed">Pergunta {index + 1} de {questions.length}{question.fromData ? ', com os dados da sua probe' : ''}{score ? `. Acertos até agora: ${score}` : ''}</Text>
        <Progress value={(index + (answered ? 1 : 0)) / questions.length * 100} size="sm" aria-hidden="true" />
      </div>
      <Text className="exercise-prompt" id="exercise-prompt">{question.prompt}</Text>
      <ul className="exercise-options">
        {question.options.map((option, position) => <li key={option}>
          <button type="button" className="exercise-option" data-state={state(position)} disabled={answered && position !== picked && position !== question.answer}
            aria-pressed={picked === position} onClick={() => choose(position)}>
            {option}
          </button>
        </li>)}
      </ul>
      <div aria-live="polite">
        {answered && <div className="exercise-feedback" data-right={picked === question.answer}>
          <Text fw={700}>{picked === question.answer ? 'Isso.' : `Não é essa. A resposta é: ${question.options[question.answer]}.`}</Text>
          <Text size="sm" mt={4}>{question.explanation}</Text>
        </div>}
      </div>
      {answered && <Button mt="md" onClick={() => { setIndex(value => value + 1); setPicked(null) }}>
        {index + 1 < questions.length ? 'Próxima pergunta' : 'Ver o resultado'}
      </Button>}
    </section>
  </div>
}
