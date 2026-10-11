import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { fetchHistory, fetchTargets, type Catalog, type PingHistory, type PingRecord } from './api'
import { formatLocal, formatMetric, localInput, localPeriod, localTimeZone, quickPeriod, summarizePingResults } from './chart'
import MetricChart from './MetricChart'

function initialPeriod() {
  const stop = new Date()
  return {
    start: localInput(new Date(stop.getTime() - 86400000)),
    stop: localInput(stop),
  }
}

export default function App() {
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

  async function consult(event: FormEvent) {
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
    <>
      <header className="topbar"><div className="topbar-inner">
        <a className="brand" href="/" aria-label="Atlas, início">atlas</a>
        <span className="header-label">RIPE Atlas · Projeto TCC</span>
      </div></header>
      <main>
        <h1>Explorador de ping</h1>

        <section className="filters" aria-label="Filtros do histórico">
          <form onSubmit={consult}>
            <div className="quick-controls">
            <label className="target-field">Destino<select value={target} onChange={event => { setTarget(event.target.value); setInspectedRow(null); setError('') }} disabled={catalogLoading || !catalog || loading} required>
              {!catalog && <option value="">{catalogLoading ? 'Carregando alvos…' : 'Catálogo indisponível'}</option>}
              {catalog?.targets.map(item => <option key={item.measurement_id} value={item.measurement_id}>{item.target_name}</option>)}
            </select></label>
            <fieldset className="quick-periods" disabled={loading}><legend>Período rápido</legend>
              <label><input type="radio" name="period" checked={preset === 1} onChange={() => choosePreset(1)} />Últimas 24 horas</label>
              <label><input type="radio" name="period" checked={preset === 7} onChange={() => choosePreset(7)} />Últimos 7 dias</label>
            </fieldset>
            <button className="primary-button" type="submit" disabled={loading || catalogLoading || !target}>{loading ? 'Consultando…' : 'Consultar'}</button>
            </div>
            <button type="button" className="custom-toggle" aria-expanded={preset === 'custom'} disabled={loading} onClick={() => choosePreset(preset === 'custom' ? 1 : 'custom')}>Período personalizado</button>
            {preset === 'custom' && <div className="custom-period"><div className="custom-fields">
              <label>Início (horário local)<input type="text" placeholder="DD/MM/AAAA HH:mm:ss" aria-describedby="period-format" autoComplete="off" value={period.start} onChange={event => { setPeriod({ ...period, start: event.target.value }); setHistories(null) }} disabled={loading || preset !== 'custom'} required={preset === 'custom'} /></label>
              <label>Fim (horário local)<input type="text" placeholder="DD/MM/AAAA HH:mm:ss" aria-describedby="period-format" autoComplete="off" value={period.stop} onChange={event => { setPeriod({ ...period, stop: event.target.value }); setHistories(null) }} disabled={loading || preset !== 'custom'} required={preset === 'custom'} /></label>
              </div><p id="period-format" className="filter-help">DD/MM/AAAA HH:mm:ss · 24 horas · Segundos opcionais · Até 60 dias, em horário local.</p>
            </div>}
          </form>
        </section>
        <div className="measurement-context">{catalog && draftTarget && <strong>Probe {catalog.probe_id} → {draftTarget.target_name} · Ping IPv4</strong>}<span>Fuso: {timeZone}</span></div>

        {error && <div className="message error" role="alert"><strong>Não foi possível consultar.</strong><p>{error}</p>
          {!catalog && <button onClick={() => setCatalogAttempt(value => value + 1)}>Tentar carregar alvos novamente</button>}
        </div>}
        {catalogLoading && <div className="message" role="status">Carregando os alvos da probe…</div>}
        {loading && <div className="message" role="status">Consultando o histórico armazenado…</div>}
        {!catalogLoading && !loading && !histories && !error && <p className="initial-state">Consulte o período para comparar K-root e Google. O destino seleciona o gráfico detalhado.</p>}
        {summaries && <section className="period-comparison" aria-label="Comparação dos pings do período">
          <h2>Resumo do período</h2>
          <p className="result-count">{formatLocal(histories![0].start, true)} → {formatLocal(histories![0].stop, true)} ({timeZone}) · Mesmo período para os dois alvos.</p>
          <div className="summary-grid">{summaries.map(summary => {
            const name = catalog?.targets.find(item => item.measurement_id === summary.history.measurement_id)?.target_name
            return <section className="target-summary" key={summary.history.measurement_id} aria-label={`Resumo de ${name}`}>
              <h3>{name} <span className="metric-summary">{summary.history.count.toLocaleString('pt-BR')} rodadas</span></h3>
              {summary.history.count === 0 ? <p>Sem registros neste período.</p> : <dl>
                <div><dt>RTT típico · mediana</dt><dd className="point-value">{formatMetric(summary.medianRtt)}{summary.medianRtt === null ? '' : ' ms'}</dd>
                  <dd className="summary-detail">{summary.rttCount.toLocaleString('pt-BR')} rodadas com RTT disponível</dd></div>
                <div><dt>Maior RTT médio observado</dt><dd className="point-value">{formatMetric(summary.maxRtt)}{summary.maxRtt === null ? '' : ' ms'}</dd>
                  {summary.maxRttTime && <dd className="summary-detail">{formatLocal(summary.maxRttTime, true)}</dd>}</div>
                <div><dt>Rodadas com perda / calculáveis</dt><dd className="point-value">{summary.lossCount === 0 ? 'Indisponível' : `${summary.lossRounds.toLocaleString('pt-BR')} / ${summary.lossCount.toLocaleString('pt-BR')}`}</dd>
                  <dd className="summary-detail">{summary.lossCount.toLocaleString('pt-BR')} rodadas com perda calculável</dd></div>
              </dl>}
            </section>
          })}</div>
          <p className="reading-note">Mediana dos RTTs médios disponíveis por rodada. Rodadas com perda têm perda acima de zero; a razão não é perda média de pacotes nem disponibilidade.</p>
        </section>}
        {history && history.count === 0 && <div className="message empty" role="status"><h2>Nenhum resultado neste período.</h2><p>A consulta foi concluída, mas não há medições armazenadas para {selected?.target_name} entre {formatLocal(history.start, true)} e {formatLocal(history.stop, true)} ({timeZone}). Experimente outro período.</p><p>Ausência de registros não significa perda de pacotes.</p></div>}
        {history && history.count > 0 && <div className="results">
          <p className="result-count" role="status">{formatLocal(history.start)} → {formatLocal(history.stop)} · {history.count.toLocaleString('pt-BR')} rodadas</p>
          <div className="charts-group" aria-label="RTT e perda no mesmo período">
            <MetricChart key={`${history.measurement_id}-${history.start}-${history.stop}-rtt`} history={history} metric="rtt_avg_ms" onInspect={setInspectedRow} />
            <MetricChart key={`${history.measurement_id}-${history.start}-${history.stop}-loss`} history={history} metric="packet_loss_percent" onInspect={setInspectedRow} />
          </div>
          <p className="reading-note">0 = valor medido · Indisponível = sem valor · Sem registros = sem rodadas no período</p>
        </div>}

        <details className="measurement-about"><summary>Sobre esta medição</summary>
          <div className="about-content">
            {catalog && draftTarget && <p>Probe {catalog.probe_id} · {draftTarget.target_name} · measurement {draftTarget.measurement_id} · {draftTarget.measurement_category}. Ping ICMP IPv4, intervalo nominal de 4 minutos.</p>}
            {history && <p>Período consultado: {formatLocal(history.start, true)} → {formatLocal(history.stop, true)} ({timeZone}).</p>}
            {inspectedRow && history?.results.includes(inspectedRow) && <p>Última rodada inspecionada: {formatLocal(inspectedRow.timestamp, true)}. IP de destino observado: {inspectedRow.destination_address ?? 'indisponível'}.</p>}
            <p>RTT: tempo de ida e volta, em milissegundos; cada ponto mostra a média das respostas daquela rodada. Perda: porcentagem de pacotes enviados sem resposta. A perda de uma rodada não é uma média do período.</p>
            <p>No resumo, a mediana é o valor central dos RTTs médios disponíveis (com quantidade par, a média dos dois centrais). O maior valor também é um RTT médio de rodada, não o RTT máximo dos pacotes; em caso de empate, mostramos o primeiro horário. Métricas indisponíveis são excluídas de cada cálculo. Os alvos podem ter quantidades e horários de observações diferentes mesmo no mesmo período; os resumos não comparam rodadas pareadas.</p>
            <p>Uma métrica indisponível não é zero. A linha para em métricas ausentes ou lacunas maiores que 8 minutos. Perda de 100% significa perda registrada naquela rodada, mas não comprova a causa da falta de respostas. Ausência de registros não comprova interrupção da conexão.</p>
            <p>Horários exibidos no fuso {timeZone}; API e banco em UTC. Períodos rápidos terminam no momento da consulta. No período personalizado, o início é incluído e o fim excluído. Horários locais repetidos em uma mudança de horário de verão usam a primeira ocorrência.</p>
            <p>Passe o mouse ou toque no gráfico para consultar uma rodada. Pelo teclado, use Tab até o seletor de rodada e as setas para navegar. Valores são arredondados apenas na exibição; valores positivos menores que 0,1 aparecem como &lt;0,1. Os dados e posições dos pontos permanecem originais.</p>
            <p>Ping não mede velocidade de download nem representa toda a Internet. Estes registros, isoladamente, não identificam causas nem constituem diagnóstico da conexão.</p>
          </div>
        </details>
      </main>
    </>
  )
}
