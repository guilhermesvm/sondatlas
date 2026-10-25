import { Anchor, Badge, Text, Title } from '@mantine/core'
import './pages.css'

const groups = [
  {
    title: 'Fundamentos de redes',
    lessons: [
      { title: 'IP e endereços', text: 'Como cada aparelho é encontrado na Internet e por que existem dois tipos de endereço, o IPv4 e o IPv6.' },
      { title: 'Ping', text: 'Quanto tempo um pacote leva para ir e voltar, e quando ele se perde no caminho.' },
      { title: 'Traceroute', text: 'Por quais redes os pacotes passam até chegar ao destino.' },
      { title: 'DNS', text: 'Como um nome como ripe.net vira o endereço de um servidor.' },
    ],
  },
  {
    title: 'RIPE Atlas',
    lessons: [
      { title: 'O que a sua probe mede sozinha', text: 'As medições automáticas que toda probe faz, incluindo a sua.' },
      { title: 'Créditos e medições próprias', text: 'Como a probe ligada gera créditos e como usar esses créditos nas suas próprias medições.' },
    ],
  },
]

const courses = [
  { title: 'Internet Measurements', text: 'Módulos curtos sobre ping, traceroute e comutação de pacotes, e webinars sobre o RIPE Atlas.', href: 'https://academy.ripe.net/mod/page/view.php?id=937' },
  { title: 'IPv6', text: 'Do webinar de introdução ao curso IPv6 Fundamentals.', href: 'https://academy.ripe.net/mod/page/view.php?id=928' },
]

export default function Learn() {
  return <div className="install">
    <Title order={1} size="h2">Aprender</Title>
    <Text size="lg" mt="sm" maw={680}>Entenda o que a sua probe mede, com os dados dela. Cada lição explica o conceito, mostra o seu dado, ensina a ler e diz o que ele não mostra.</Text>

    {groups.map((group, index) => <section key={group.title} className="lesson-group" aria-labelledby={`lessons-${index}`}>
      <Title order={2} size="h4" id={`lessons-${index}`}>{group.title}</Title>
      <ul className="lesson-list">
        {group.lessons.map(lesson => <li key={lesson.title}>
          <div>
            <Text fw={600}>{lesson.title}</Text>
            <Text size="sm">{lesson.text}</Text>
          </div>
          <Badge variant="light" color="gray" tt="none" className="lesson-badge">Em breve</Badge>
        </li>)}
      </ul>
    </section>)}

    <section className="lesson-group academy" aria-labelledby="academy">
      <Title order={2} size="h4" id="academy">Para ir mais fundo: RIPE NCC Academy</Title>
      <Text size="sm" mt={4} maw={680}>
        Cursos gratuitos do RIPE NCC, que mantém o RIPE Atlas. Para se inscrever, use uma conta RIPE NCC Access, a mesma do RIPE Atlas. Os cursos estão em inglês.
      </Text>
      <ul className="lesson-list">
        {courses.map(course => <li key={course.title}>
          <div>
            <Anchor href={course.href} target="_blank" rel="noreferrer" fw={600}>{course.title}</Anchor>
            <Text size="sm">{course.text}</Text>
          </div>
        </li>)}
      </ul>
    </section>
  </div>
}
