import { Button, Loader, Paper, Title } from '@mantine/core'
import SystemError from '../../lib/SystemError'
import { useEffect, useRef, useState } from 'react'
import { fetchDistribution, type ProbeDistribution as Distribution } from '../../lib/api'
import { formatLocal, localTimeZone } from '../../lib/time'
import './probe-distribution.css'

const countries = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
const count = (value: number) => value.toLocaleString('pt-BR')
const percentage = (value: number | null) => value === null ? 'Indisponível' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

export default function ProbeDistribution({ active }: { active: boolean }) {
  const [distribution, setDistribution] = useState<Distribution | null>(null)
  const [reading, setReading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const request = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!active || request.current) return
    const controller = new AbortController()
    setReading(true)
    setError('')
    fetchDistribution(controller.signal).then(data => {
      if (!controller.signal.aborted) { setDistribution(data); setLoaded(true) }
    }).catch((reason: Error) => {
      if (!controller.signal.aborted) setError(reason.message)
    }).finally(() => {
      if (!controller.signal.aborted) setReading(false)
    })
    return () => { controller.abort(); setReading(false) }
  }, [active, attempt])

  useEffect(() => () => request.current?.abort(), [])

  async function refresh() {
    if (request.current || reading) return
    const controller = new AbortController()
    request.current = controller
    setRefreshing(true)
    setError('')
    setNotice('')
    try {
      const data = await fetchDistribution(controller.signal, true)
      if (!controller.signal.aborted) {
        setDistribution(data)
        setLoaded(true)
        setNotice('Distribuição atualizada e salva.')
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError((reason as Error).message)
    } finally {
      request.current = null
      if (!controller.signal.aborted) setRefreshing(false)
    }
  }

  const maximum = Math.max(1, ...distribution?.top_countries.map(row => row.probes) ?? [])
  return <section hidden={!active} aria-label="Distribuição global de probes">
    <div className="distribution-heading">
      <div><Title order={1} size="h2">Rede global</Title><p className="result-count">Onde observamos pontos públicos conectados do RIPE Atlas.</p></div>
      <Button disabled={refreshing || reading} onClick={refresh} leftSection={refreshing && <Loader size={16} color="currentColor" />}>
        {refreshing ? 'Atualizando…' : 'Atualizar distribuição'}
      </Button>
    </div>
    {reading && <p role="status">Lendo a última coleta salva…</p>}
    {refreshing && <p role="status">Coletando todas as páginas e salvando o resumo. Isso pode levar alguns minutos; a coleta anterior permanece visível.</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <SystemError title="Não foi possível carregar a distribuição global" mt="md">{error}
      <Button display="block" mt="sm" variant="default" disabled={refreshing || reading} onClick={() => setAttempt(value => value + 1)}>Ler coleta salva novamente</Button>
    </SystemError>}
    {loaded && !distribution && <div className="message"><h2>Ainda não há uma coleta salva.</h2><p>Use “Atualizar distribuição” para consultar o cadastro público. Ausência de coleta não significa zero probes.</p></div>}
    {distribution && <>
      <p className="result-count">Coleta: {formatLocal(distribution.started_at_utc, true)} → {formatLocal(distribution.finished_at_utc, true)} · Fuso: {localTimeZone()}</p>
      <div className="summary-grid">
        <Paper component="section" withBorder className="target-summary" aria-label="Total global"><h2>IDs únicos observados</h2><p className="point-value">{count(distribution.total_probes)}</p></Paper>
        <Paper component="section" withBorder className="target-summary" aria-label="Participação do Brasil"><h2>Brasil</h2><p className="point-value">{count(distribution.brazil.probes)} probes · {percentage(distribution.brazil.share_percent)}</p><p className="reading-note">Percentual sobre todos os IDs únicos da coleta, incluindo país não informado.</p></Paper>
      </div>
      <Paper component="section" withBorder className="distribution-chart" aria-label="Probes observadas por país">
        <h2>Dez maiores contagens e Brasil</h2>
        <p className="reading-note">Contagens absolutas · Barras na mesma escala, começando em zero.</p>
        <ol className="country-bars">{distribution.top_countries.map(row => {
          const name = row.country_code === 'UNKNOWN' ? 'País não informado' : countries.of(row.country_code) ?? row.country_code
          return <li key={row.country_code} className={row.country_code === 'BR' ? 'brazil' : ''}>
            <span className="country-name">{name} <small>{row.country_code}</small></span>
            <span className="bar-track" aria-hidden="true"><span style={{ width: `${100 * row.probes / maximum}%` }} /></span>
            <span className="country-count">{count(row.probes)}</span>
          </li>
        })}</ol>
      </Paper>
      <p className="reading-note">{count(distribution.duplicate_records)} registros repetidos entre páginas; a primeira observação de cada ID foi conservada. Contagem informada pela API: {distribution.api_count_min === null ? 'indisponível' : `${count(distribution.api_count_min)}–${count(distribution.api_count_max!)}`}.</p>
      {distribution.count_mismatch && <p className="message">As contagens da API variaram ou diferem dos IDs únicos, ou houve duplicações. Deduplicar não recupera possíveis IDs omitidos durante a paginação.</p>}
    </>}
    <details className="measurement-about" open><summary>Sobre esta distribuição</summary><div className="about-content">
      <p>Fonte: <a href="https://atlas.ripe.net/docs/apis/rest-api-manual/probes/listing-probes/" target="_blank" rel="noreferrer">Cadastro oficial de probes RIPE Atlas</a>. Recorte: probes públicas conectadas, incluindo anchors; privadas e desconectadas não entram.</p>
      <p>Consulta paginada durante um intervalo, não um censo instantâneo. País é o código informado pela API. As contagens não medem qualidade da Internet, cobertura territorial nem causas de participação.</p>
    </div></details>
  </section>
}
