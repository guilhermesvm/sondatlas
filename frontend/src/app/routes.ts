export type Route = {
  id: string
  label: string
  group: 'home' | 'journey' | 'probe' | 'network'
  summary: string
}

export const routes: Route[] = [
  { id: 'inicio', label: 'Início', group: 'home', summary: 'Apresentação da plataforma e da jornada.' },
  { id: 'conhecer', label: 'Conhecer', group: 'journey', summary: 'O que é o RIPE Atlas, por que participar (o Brasil tem poucas probes), o que fica público e o que você precisa para instalar.' },
  { id: 'instalar', label: 'Instalar', group: 'journey', summary: 'Passo a passo do kit (VM com Vagrant ou Debian/Raspberry Pi), comandos para copiar e problemas comuns.' },
  { id: 'ativar', label: 'Ativar', group: 'journey', summary: 'Cadastro da probe no site do RIPE Atlas e a pergunta principal: sua probe está conectada?' },
  { id: 'acompanhar', label: 'Acompanhar', group: 'journey', summary: 'Escolha a probe que a Sondatlas acompanha para guardar o histórico das medições dela.' },
  { id: 'aprender', label: 'Aprender', group: 'journey', summary: 'Lições com os dados da sua probe: ping, traceroute e DNS, o que cada medição mostra e o que ela não mostra.' },
  { id: 'ir-alem', label: 'Ir além', group: 'journey', summary: 'Créditos, medições automáticas (built-in e well-known), medições próprias, anchors, IPv4 e IPv6.' },
  { id: 'minha-probe', label: 'Minha probe', group: 'probe', summary: 'Histórico de ping da sua probe.' },
  { id: 'desafios', label: 'Desafios', group: 'probe', summary: 'Medições que você cria com os seus créditos, com o custo mostrado antes de confirmar.' },
  { id: 'conquistas', label: 'Conquistas', group: 'probe', summary: 'Marcos da sua jornada, como a primeira probe conectada e o primeiro ping.' },
  { id: 'rede-global', label: 'Rede global', group: 'network', summary: 'Onde estão as probes públicas conectadas do RIPE Atlas.' },
]

export const journey = routes.filter(route => route.group === 'journey')

export function routeFromHash(hash: string) {
  const id = hash.replace(/^#\/?/, '')
  return routes.find(route => route.id === id) ?? routes[0]
}
