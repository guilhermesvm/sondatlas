import { Badge, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import Loading from '../../lib/Loading'
import { fetchAccount } from '../atlas-account/account'
import { formatMetric } from '../ping-history/chart'
import { fetchGroupResults, fetchMeasurement, type GroupRound, type Measurement } from './challenge'
import './group-result.css'

const ms = (value: number) => `${formatMetric(value)} ms`
const countries = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
const place = (round: GroupRound) => round.country ? countries.of(round.country) ?? round.country : 'País não informado'
const isAddress = (target: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(target)
// Each probe answers on its own time, so the results are read again until all arrive or 3 minutes pass.
const every = 5000
const times = 36

export default function GroupResult({ id, measurement }: { id: number, measurement: Measurement }) {
  const [rounds, setRounds] = useState<GroupRound[] | null>(null)
  const [expected, setExpected] = useState(measurement.scheduled)
  const [gaveUp, setGaveUp] = useState(false)
  const [own, setOwn] = useState<number[]>([])

  useEffect(() => {
    const controller = new AbortController()
    fetchAccount(controller.signal).then(account => setOwn((account.probes ?? []).map(probe => probe.id)), () => setOwn([]))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    // Right after creation RIPE Atlas may not have scheduled the probes yet, so their number is read again with the results.
    const poll = () => Promise.all([fetchGroupResults(id, controller.signal), fetchMeasurement(id, controller.signal).catch(() => null)])
      .then(([found, latest]) => {
        setRounds(found)
        const total = latest?.scheduled ?? 0
        setExpected(total)
        if (total && found.length >= total) return
        if (++tries >= times) setGaveUp(true)
        else timer = setTimeout(poll, every)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        if (++tries >= times) setGaveUp(true)
        else timer = setTimeout(poll, every)
      })
    poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [id])

  if (rounds === null) return <Loading mt="sm">Lendo os resultados…</Loading>
  const arrived = rounds.length
  const complete = expected > 0 && arrived >= expected
  const ranked = [...rounds].sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity))
  const answered = ranked.filter(round => round.avg !== null)
  const named = !isAddress(measurement.target)
  const addresses = new Set(rounds.map(round => round.address).filter(Boolean))
  const yours = ranked.findIndex(round => own.includes(round.probeId))

  return <>
    {!complete && !gaveUp && <Loading mt="sm">{expected ? `Chegaram ${arrived} de ${expected} resultados.` : `Chegaram ${arrived} resultados.`} Cada probe mede no seu tempo…</Loading>}
    {!complete && gaveUp && <Text size="sm" mt="sm">
      Chegaram {arrived}{expected ? ` de ${expected}` : ''} resultados. Alguma probe pode ter desconectado antes de medir. O resto pode aparecer mais tarde na página da medição no RIPE Atlas.
    </Text>}
    {arrived > 0 && <>
      <div className="lesson-table-wrap">
        <table className="group-table">
          <caption>Tempo médio de cada probe até {measurement.target}, do mais rápido ao mais lento</caption>
          <thead><tr>
            <th scope="col">Probe</th><th scope="col">País</th><th scope="col">Rede</th>
            {named && <th scope="col">Endereço recebido</th>}
            <th scope="col">Tempo médio</th>
          </tr></thead>
          <tbody>
            {ranked.map(round => <tr key={round.probeId} data-yours={own.includes(round.probeId)}>
              <td>{round.probeId}{own.includes(round.probeId) && <Badge size="xs" variant="light" tt="none" ml={6}>sua</Badge>}</td>
              <td>{place(round)}</td>
              <td>{round.asn ? `AS${round.asn}` : '—'}</td>
              {named && <td><code>{round.address ?? '—'}</code></td>}
              <td>{round.avg === null ? 'sem resposta' : ms(round.avg)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Title order={3} size="h5" mt="lg" mb="xs">O que o resultado quer dizer</Title>
      <dl className="lesson-reading">
        {answered.length > 1 && <div>
          <dt>De {ms(answered[0].avg!)} a {ms(answered[answered.length - 1].avg!)}</dt>
          <dd>
            A probe mais rápida, em {place(answered[0])}, levou {ms(answered[0].avg!)}. A mais lenta, em {place(answered[answered.length - 1])}, levou {ms(answered[answered.length - 1].avg!)}.
            É o mesmo destino, e o tempo muda com a distância pela rede entre cada probe e o servidor que respondeu.
          </dd>
        </div>}
        {named && addresses.size > 0 && <div>
          <dt>{addresses.size === 1 ? '1 endereço' : `${addresses.size} endereços`}</dt>
          <dd>
            {addresses.size === 1
              ? `Todas as probes receberam o mesmo endereço para ${measurement.target}.`
              : `As probes receberam ${addresses.size} endereços diferentes para ${measurement.target}. Cada uma perguntou o endereço ao DNS da própria rede, e serviços grandes costumam indicar um servidor perto de quem pergunta.`}
          </dd>
        </div>}
        {yours >= 0 && ranked[yours].avg !== null && <div>
          <dt>{yours + 1}º de {answered.length}</dt>
          <dd>A sua probe ficou em {yours + 1}º lugar entre as que responderam. Com outras probes, você mede de lugares onde não está.</dd>
        </div>}
      </dl>
    </>}
  </>
}
