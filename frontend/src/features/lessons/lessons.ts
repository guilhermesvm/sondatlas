export interface Lesson {
  id: string
  title: string
  text: string
  group: 'basics' | 'atlas'
  ready: boolean
}

export const lessons: Lesson[] = [
  { id: 'ip', title: 'IP e endereços', text: 'Como cada aparelho é encontrado na Internet e por que existem dois tipos de endereço, o IPv4 e o IPv6.', group: 'basics', ready: true },
  { id: 'ping', title: 'Ping', text: 'Quanto tempo um pacote leva para ir e voltar, e quando ele se perde no caminho.', group: 'basics', ready: true },
  { id: 'traceroute', title: 'Traceroute', text: 'Por quais redes os pacotes passam até chegar ao destino.', group: 'basics', ready: true },
  { id: 'dns', title: 'DNS', text: 'Como um nome como ripe.net vira o endereço de um servidor.', group: 'basics', ready: false },
  { id: 'medicoes-automaticas', title: 'O que a sua probe mede sozinha', text: 'As medições automáticas que toda probe faz, incluindo a sua.', group: 'atlas', ready: true },
  { id: 'creditos', title: 'Créditos e medições próprias', text: 'Como a probe ligada gera créditos e como usar esses créditos nas suas próprias medições.', group: 'atlas', ready: true },
]

export function lessonFromHash(hash: string) {
  const id = hash.replace(/^#\/?/, '').split('/')[1]
  return lessons.find(lesson => lesson.id === id && lesson.ready) ?? null
}
