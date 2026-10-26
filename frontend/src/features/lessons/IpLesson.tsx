import { Anchor, Button, List, Text } from '@mantine/core'
import SystemError from '../../lib/SystemError'
import LessonParts from './LessonParts'
import { useAddresses, type Addresses } from './useAddresses'
import './lessons.css'


function YourData({ probeId, addresses, error }: ReturnType<typeof useAddresses>) {
  if (probeId === null) return <>
    <Text size="sm">Acompanhe uma probe para ver os endereços dela aqui.</Text>
    <Button component="a" href="#/acompanhar" variant="light" size="sm" mt="sm">Ir para Acompanhar</Button>
  </>
  if (error) return <SystemError title="Não foi possível ler os dados da sua probe" mt="0">{error}</SystemError>
  if (!addresses) return <Text size="sm">Lendo os dados da sua probe…</Text>
  return <>
    <dl className="lesson-numbers">
      <div>
        <dt>Dentro da sua rede</dt>
        <dd className="lesson-number-value">{addresses.privateAddress ?? 'Sem endereço privado'}</dd>
        <dd>{addresses.privateAddress ? 'Endereço privado. Só vale dentro da sua rede.' : 'A probe não usa um endereço privado. O endereço dela não aparece aqui.'}</dd>
      </div>
      <div>
        <dt>Na Internet</dt>
        <dd className="lesson-number-value">{addresses.asn ? `AS${addresses.asn}` : 'Rede do provedor'}</dd>
        <dd>
          Rede do provedor{addresses.holder ? <> <strong>{addresses.holder}</strong></> : ''}. A probe sai para a Internet com um endereço público dessa rede.
          A Sondatlas não mostra esse endereço, porque ele identifica a sua conexão.
        </dd>
      </div>
      <div>
        <dt>IPv6</dt>
        <dd className="lesson-number-value">{addresses.hasIpv6 ? 'Tem' : 'Não tem'}</dd>
        <dd>{addresses.hasIpv6
          ? 'O RIPE Atlas encontrou IPv6 na sua probe. O endereço não aparece aqui, porque um endereço IPv6 pode identificar o aparelho.'
          : 'O RIPE Atlas não encontrou IPv6 funcionando na sua probe.'}</dd>
      </div>
    </dl>
    {addresses.behindNat && <Text size="sm" mt="md">
      O RIPE Atlas marcou a sua probe com a etiqueta <code>system-ipv4-rfc1918</code>. Ela quer dizer que a probe usa um endereço privado e sai para a Internet por NAT.
    </Text>}
  </>
}

function Reading({ addresses }: { addresses: Addresses | null }) {
  const local = addresses?.privateAddress
  return <ul className="lesson-notes">
    <li>
      <Text size="sm"><code>{local ?? '192.168.0.10'}</code>{' '}
        {local ? 'está' : 'é um exemplo de endereço'} num dos três blocos que a RFC 1918 reservou para redes internas: os que começam com 10, com 172.16 a 172.31 e com 192.168.
        Milhões de casas usam os mesmos endereços sem conflito, porque eles nunca saem da rede de cada uma.
      </Text>
    </li>
    <li>
      <Text size="sm">{addresses?.asn ? <code>AS{addresses.asn}</code> : <strong>AS e um número</strong>}{' '}
        {addresses?.asn
          ? <>é o número da rede da sua provedora {addresses.holder ? <><strong>{addresses.holder}</strong></> : 'do seu provedor'} na Internet.</>
          : 'é como se identifica cada rede da Internet, como a do seu provedor.'}
        {' '}Se a probe vai para outra casa, com outro provedor, esse número muda, e o endereço privado também pode mudar.
      </Text>
    </li>
    <li>
      <Text size="sm"><strong>32 e 128 bits.</strong> Cada bit a mais dobra a quantidade de endereços. Com 32 bits, o IPv4 tem cerca de 4,3 bilhões. O IPv6 tem 2⁹⁶ vezes mais, um número com 29 dígitos.</Text>
    </li>
    {addresses && !addresses.hasIpv6 && <li>
      <Text size="sm"><strong>Sem IPv6</strong>, a sua probe mede só pelo IPv4. Para ter IPv6, o provedor precisa oferecer e o roteador da casa precisa entregar o IPv6 para a probe.</Text>
    </li>}
  </ul>
}

export default function IpLesson() {
  const data = useAddresses()
  return <LessonParts parts={[
    {
      title: 'O que é',
      content: <>
        <Text size="sm">
          Todo aparelho conectado à Internet precisa de um endereço para receber dados, como uma casa precisa de um número na rua. Esse endereço é o IP, do inglês Internet Protocol.
        </Text>
        <Text size="sm" mt="sm">
          Existem dois formatos. O IPv4 tem 32 bits e é escrito como quatro números separados por pontos, como <code>193.0.14.129</code>. O IPv6 tem 128 bits e é escrito em grupos separados por dois-pontos, como <code>2001:7fd::1</code>. Os dois são endereços do K-root, o servidor que a sua probe mede na lição de ping.
        </Text>
        <Text size="sm" mt="sm">
          Os endereços IPv4 acabaram. O RIPE NCC, que distribui endereços na Europa, ficou sem IPv4 livre em novembro de 2019. O LACNIC, que distribui na América Latina e no Brasil, reservou o último bloco disponível em agosto de 2020. O IPv6 foi criado para resolver essa falta.
        </Text>
        <Text size="sm" mt="sm">
          Enquanto isso, as casas economizam endereços com o NAT. Dentro de casa, cada aparelho recebe um endereço privado, que só vale ali. Na saída para a Internet, o roteador troca esse endereço pelo endereço público que o provedor deu para a casa.
        </Text>
      </>,
    },
    { title: 'O seu dado', content: <YourData {...data} /> },
    { title: 'Como ler', content: <Reading addresses={data.addresses} /> },
    {
      title: 'O que não mostra',
      content: <ul className="lesson-limits">
        <li><Text size="sm">O IP não diz o endereço da sua rua. A localização a partir de um IP é aproximada.</Text></li>
        <li><Text size="sm">O endereço público pode mudar. Muitos provedores trocam o endereço da casa de tempos em tempos.</Text></li>
        <li><Text size="sm">Com CGNAT, várias casas dividem o mesmo endereço público. Esta lição não tem como saber se é o seu caso.</Text></li>
        <li><Text size="sm">O endereço privado só vale dentro da sua rede. Outra casa pode usar o mesmo sem problema.</Text></li>
      </ul>,
    },
    {
      title: 'Para ir mais fundo',
      content: <List size="sm" spacing={4}>
        <List.Item><Anchor href="https://ipv6.br/" target="_blank" rel="noreferrer">IPv6.br</Anchor>, do NIC.br (em português)</List.Item>
        <List.Item><Anchor href="https://academy.ripe.net/mod/page/view.php?id=928" target="_blank" rel="noreferrer">RIPE NCC Academy: IPv6</Anchor> (em inglês, gratuito)</List.Item>
        <List.Item><Anchor href="https://www.rfc-editor.org/rfc/rfc1918" target="_blank" rel="noreferrer">RFC 1918</Anchor>, os endereços privados (em inglês)</List.Item>
        <List.Item><Anchor href="https://www.ripe.net/publications/news/the-ripe-ncc-has-run-out-of-ipv4-addresses/" target="_blank" rel="noreferrer">Anúncio do RIPE NCC sobre o fim do IPv4</Anchor> e <Anchor href="https://blog.lacnic.net/en/the-new-normal-for-ipv4-exhaustion/" target="_blank" rel="noreferrer">texto do LACNIC</Anchor> (em inglês)</List.Item>
      </List>,
    },
  ]} />
}
