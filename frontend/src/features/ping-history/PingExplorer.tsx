import { Button, NativeSelect, Paper, SegmentedControl, TextInput, Title } from '@mantine/core'
import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react'
import Loading from '../../lib/Loading'
import SystemError from '../../lib/SystemError'
import { fetchHistory, fetchTargets, type Catalog, type PingHistory, type PingRecord } from '../../lib/api'
import { formatLocal, localInput, localPeriod, localTimeZone, quickPeriod } from '../../lib/time'
import { formatMetric, summarizePingResults } from './chart'
import './ping-history.css'
import MetricChart from './MetricChart'

const FIELD_HELP = 'DD/MM/AAAA HH:mm:ss · 24 horas · Segundos opcionais'
const periods = [
  { value: '1', label: 'Últimas 24 horas' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: 'custom', label: 'Período personalizado' },
]

function initialPeriod() {
  const stop = new Date()
  return {
    start: localInput(new Date(stop.getTime() - 86400000)),
    stop: localInput(stop),
  }
}

export default function PingExplorer({ active }: { active: boolean }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [target, setTarget] = useState('')
  const [period, setPeriod] = useState(initialPeriod)
  const [preset, setPreset] = useState<1 | 7 | 'custom'>(1)
  const [histories, setHistories] = useState<PingHistory[] | null>(null)
  const [inspectedRow, setInspectedRow] = useState<PingRecord | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const request = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setCatalogLoading(true)
    setError('')
    fetchTargets(controller.signal).then(data => {
      if (controller.signal.aborted) return
      setCatalog(data)
      setTarget(String(data.targets[0]?.measurement_id ?? ''))
    }).catch((reason: Error) => {
      if (!controller.signal.aborted) setError(reason.message)
    }).finally(() => {
      if (!controller.signal.aborted) setCatalogLoading(false)
    })
    return () => controller.abort()
  }, [catalogAttempt])

  useEffect(() => () => request.current?.abort(), [])

  async function consult(event: SubmitEvent) {
    event.preventDefault()
    if (!catalog || !target) return
    setError('')
    request.current?.abort()
    setHistories(null)
    setInspectedRow(null)
    setLoading(false)
    let bounds: { start: string; stop: string }
    try {
      bounds = preset === 'custom' ? localPeriod(period.start, period.stop) : quickPeriod(preset)
    } catch (reason) {
      setError((reason as Error).message)
      return
    }
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    try {
      const data = await Promise.all(catalog.targets.map(item =>
        fetchHistory(catalog.probe_id, item.measurement_id, bounds.start, bounds.stop, controller.signal)))
      if (!controller.signal.aborted) setHistories(data)
    } catch (reason) {
      if (!controller.signal.aborted) setError((reason as Error).message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  const history = histories?.find(item => String(item.measurement_id) === target) ?? null
  const summaries = useMemo(() => histories?.map(item => ({ history: item, ...summarizePingResults(item.results) })), [histories])
  const selected = catalog?.targets.find(item => item.measurement_id === history?.measurement_id)
  const draftTarget = catalog?.targets.find(item => String(item.measurement_id) === target)
  const timeZone = localTimeZone()
  function choosePreset(value: 1 | 7 | 'custom') {
    setPreset(value)
    setHistories(null)
    setError('')
  }
  return (
    <div hidden={!active}>
    <Title order={2} className="section-title">Explorador de ping</Title>

    <section className="filters" aria-label="Filtros do histórico">
      <form onSubmit={consult}>
        <div className="quick-controls">
        <NativeSelect className="target-field" label="Destino" value={target} onChange={event => { setTarget(event.target.value); setInspectedRow(null); setError('') }} disabled={catalogLoading || !catalog || loading} required withAsterisk={false}>
          {!catalog && <option value="">{catalogLoading ? 'Carregando alvos…' : 'Catálogo indisponível'}</option>}
          {catalog?.targets.map(item => <option key={item.measurement_id} value={item.measurement_id}>{item.target_name}</option>)}
        </NativeSelect>
        <div className="quick-periods">
          <span className="field-label" id="period-label">Período</span>
          <SegmentedControl aria-labelledby="period-label" value={String(preset)} disabled={loading} data={periods}
            onChange={value => choosePreset(value === 'custom' ? 'custom' : value === '7' ? 7 : 1)} />
        </div>
        <Button className="primary-button" type="submit" disabled={loading || catalogLoading || !target}>{loading ? 'Consultando…' : 'Consultar'}</Button>
        </div>
        {preset === 'custom' && <div className="custom-period"><div className="custom-fields">
          <TextInput type="text" label="Início (horário local)" description={FIELD_HELP} inputWrapperOrder={['label', 'input', 'description']} placeholder="DD/MM/AAAA HH:mm:ss" autoComplete="off" value={period.start} onChange={event => { setPeriod({ ...period, start: event.target.value }); setHistories(null) }} disabled={loading || preset !== 'custom'} required={preset === 'custom'} withAsterisk={false} />
          <TextInput type="text" label="Fim (horário local)" description={FIELD_HELP} inputWrapperOrder={['label', 'input', 'description']} placeholder="DD/MM/AAAA HH:mm:ss" autoComplete="off" value={period.stop} onChange={event => { setPeriod({ ...period, stop: event.target.value }); setHistories(null) }} disabled={loading || preset !== 'custom'} required={preset === 'custom'} withAsterisk={false} />
          </div><p className="filter-help">Até 60 dias, em horário local.</p>
        </div>}
      </form>
    </section>
    <div className="measurement-context">{catalog && draftTarget && <strong>Probe {catalog.probe_id} → {draftTarget.target_name} · Ping IPv4</strong>}<span>Fuso: {timeZone}</span></div>

    {error && <SystemError title="Não foi possível consultar o histórico" mt="md">{error}
      {!catalog && <Button display="block" mt="sm" variant="default" onClick={() => setCatalogAttempt(value => value + 1)}>Tentar carregar alvos novamente</Button>}
    </SystemError>}
    {catalogLoading && <div className="message"><Loading>Carregando os alvos da probe…</Loading></div>}
    {loading && <div className="message"><Loading>Consultando o histórico armazenado…</Loading></div>}
    {!catalogLoading && !loading && !histories && !error && <p className="initial-state">Consulte o período para comparar K-root e Google. O destino seleciona o gráfico detalhado.</p>}
    {summaries && <section className="period-comparison" aria-label="Comparação dos pings do período">
      <div className="comparison-heading">
        <h2>Resumo do período</h2>
        <p className="result-count">{formatLocal(histories![0].start)} → {formatLocal(histories![0].stop)} · Mesmo período para os dois alvos.</p>
      </div>
      <Paper withBorder className="comparison">
        <div className="comparison-head" aria-hidden="true">
          <span>Destino</span><span>RTT típico · mediana</span><span>Maior RTT médio observado</span><span>Rodadas com perda / calculáveis</span>
        </div>
        {summaries.map(summary => {
          const name = catalog?.targets.find(item => item.measurement_id === summary.history.measurement_id)?.target_name
          return <section className="comparison-row" key={summary.history.measurement_id} aria-label={`Resumo de ${name}`}>
            <h3>{name} <span className="metric-summary">{summary.history.count.toLocaleString('pt-BR')} rodadas</span></h3>
            {summary.history.count === 0 ? <p className="comparison-empty">Sem registros neste período.</p> : <dl>
              <div><dt>RTT típico · mediana</dt><dd className="point-value rtt">{formatMetric(summary.medianRtt)}{summary.medianRtt === null ? '' : ' ms'}</dd>
                <dd className="summary-detail">{summary.rttCount.toLocaleString('pt-BR')} rodadas com RTT disponível</dd></div>
              <div><dt>Maior RTT médio observado</dt><dd className="point-value rtt">{formatMetric(summary.maxRtt)}{summary.maxRtt === null ? '' : ' ms'}</dd>
                {summary.maxRttTime && <dd className="summary-detail">{formatLocal(summary.maxRttTime, true)}</dd>}</div>
              <div><dt>Rodadas com perda / calculáveis</dt><dd className="point-value loss">{summary.lossCount === 0 ? 'Indisponível' : `${summary.lossRounds.toLocaleString('pt-BR')} / ${summary.lossCount.toLocaleString('pt-BR')}`}</dd>
                <dd className="summary-detail">{summary.lossCount.toLocaleString('pt-BR')} rodadas com perda calculável</dd></div>
            </dl>}
          </section>
        })}
      </Paper>
      <details className="reading-help">
        <summary>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" /></svg>
          <span>Como ler estes números</span>
          <svg className="reading-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </summary>
        <p>Mediana dos RTTs médios disponíveis por rodada. Rodadas com perda têm perda acima de zero; a razão não é perda média de pacotes nem disponibilidade.</p>
        <p>0 = valor medido · Indisponível = sem valor · Sem registros = sem rodadas no período</p>
      </details>
    </section>}
    {history && history.count === 0 && <div className="message empty" role="status"><h2>Nenhum resultado neste período.</h2><p>A consulta foi concluída, mas não há medições armazenadas para {selected?.target_name} entre {formatLocal(history.start, true)} e {formatLocal(history.stop, true)} ({timeZone}). Experimente outro período.</p><p>Ausência de registros não significa perda de pacotes.</p></div>}
    {history && history.count > 0 && <div className="results">
      <p className="result-count" role="status">{formatLocal(history.start)} → {formatLocal(history.stop)} · {history.count.toLocaleString('pt-BR')} rodadas</p>
      <Paper withBorder className="charts-group" aria-label="RTT e perda no mesmo período">
        <MetricChart key={`${history.measurement_id}-${history.start}-${history.stop}-rtt`} history={history} metric="rtt_avg_ms" onInspect={setInspectedRow} />
        <MetricChart key={`${history.measurement_id}-${history.start}-${history.stop}-loss`} history={history} metric="packet_loss_percent" onInspect={setInspectedRow} />
      </Paper>
    </div>}

    <details className="measurement-about">
      <summary>
        <svg className="about-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" /></svg>
        <span className="about-text"><span className="about-title">Sobre esta medição</span><span className="about-hint">Ficha técnica, como ler os números e limites da leitura</span></span>
        <svg className="about-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="about-content">
        <dl className="about-facts">
          {catalog && draftTarget && <>
            <div><dt>Probe</dt><dd>{catalog.probe_id}</dd></div>
            <div><dt>Destino</dt><dd>{draftTarget.target_name}</dd></div>
            <div><dt>Measurement</dt><dd>{draftTarget.measurement_id} · {draftTarget.measurement_category}</dd></div>
            <div><dt>Tipo</dt><dd>Ping ICMP IPv4, intervalo nominal de 4 minutos</dd></div>
          </>}
          {history && <div className="about-wide"><dt>Período consultado</dt><dd>{formatLocal(history.start, true)} → {formatLocal(history.stop, true)} ({timeZone})</dd></div>}
          {inspectedRow && history?.results.includes(inspectedRow) && <>
            <div><dt>Última rodada inspecionada</dt><dd>{formatLocal(inspectedRow.timestamp, true)}</dd></div>
            <div><dt>IP de destino observado</dt><dd>{inspectedRow.destination_address ?? 'indisponível'}</dd></div>
          </>}
        </dl>
        <div className="about-sections">
          <section><h3>O que cada número significa</h3>
            <p>RTT: tempo de ida e volta, em milissegundos; cada ponto mostra a média das respostas daquela rodada. Perda: porcentagem de pacotes enviados sem resposta. A perda de uma rodada não é uma média do período.</p>
            <p>No resumo, a mediana é o valor central dos RTTs médios disponíveis (com quantidade par, a média dos dois centrais). O maior valor também é um RTT médio de rodada, não o RTT máximo dos pacotes; em caso de empate, mostramos o primeiro horário. Métricas indisponíveis são excluídas de cada cálculo. Os alvos podem ter quantidades e horários de observações diferentes mesmo no mesmo período; os resumos não comparam rodadas pareadas.</p>
          </section>
          <section><h3>Limites da leitura</h3>
            <p>Uma métrica indisponível não é zero. A linha para em métricas ausentes ou lacunas maiores que 8 minutos. Perda de 100% significa perda registrada naquela rodada, mas não comprova a causa da falta de respostas. Ausência de registros não comprova interrupção da conexão.</p>
            <p>Ping não mede velocidade de download nem representa toda a Internet. Estes registros, isoladamente, não identificam causas nem constituem diagnóstico da conexão.</p>
          </section>
          <section><h3>Horários</h3>
            <p>Horários exibidos no fuso {timeZone}; API e banco em UTC. Períodos rápidos terminam no momento da consulta. No período personalizado, o início é incluído e o fim excluído. Horários locais repetidos em uma mudança de horário de verão usam a primeira ocorrência.</p>
          </section>
          <section><h3>Como usar o gráfico</h3>
            <p>Passe o mouse ou toque no gráfico para consultar uma rodada. Pelo teclado, use Tab até o seletor de rodada e as setas para navegar. Valores são arredondados apenas na exibição; valores positivos menores que 0,1 aparecem como &lt;0,1. Os dados e posições dos pontos permanecem originais.</p>
          </section>
        </div>
      </div>
    </details>
    </div>
  )
}
