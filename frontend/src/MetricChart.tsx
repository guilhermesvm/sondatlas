import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { PingHistory, PingRecord } from './api'
import { formatLocal, formatMetric, nearestRecordIndex, splitSeries, type Metric } from './chart'

export default function MetricChart({ history, metric, onInspect }: { history: PingHistory; metric: Metric; onInspect?: (record: PingRecord) => void }) {
  const rtt = metric === 'rtt_avg_ms'
  const title = rtt ? 'RTT médio por rodada' : 'Perda de pacotes por rodada'
  const unit = rtt ? 'ms' : '%'
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, entries[0].contentRect.width)))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const segments = splitSeries(history.results, metric)
  const values = segments.flat().map(point => point.value)
  const missing = history.results.filter(record => record[metric] === null).length
  const ceiling = rtt ? Math.max(10, Math.ceil(values.reduce((max, value) => Math.max(max, value), 0) / 10) * 10) : 100
  const start = Date.parse(history.start)
  const stop = Date.parse(history.stop)
  const plotWidth = width - 80
  const x = (time: number) => 64 + ((time - start) / (stop - start)) * plotWidth
  const y = (value: number) => 144 - (value / ceiling) * 126
  const ticks = width < 560 ? 2 : 4
  const row = selected === null ? null : history.results[selected]
  const value = row?.[metric]
  const packets = (number: number | null) => number === null ? 'indisponível' : number.toLocaleString('pt-BR')
  function selectRecord(index: number) {
    setSelected(index)
    onInspect?.(history.results[index])
  }
  function inspect(event: PointerEvent<SVGRectElement>) {
    const bounds = event.currentTarget.ownerSVGElement!.getBoundingClientRect()
    if (bounds.width === 0) return
    const position = ((event.clientX - bounds.left) / bounds.width) * width
    const time = start + Math.max(0, Math.min(1, (position - 64) / plotWidth)) * (stop - start)
    selectRecord(nearestRecordIndex(history.results, time))
  }
  return (
    <section className={`chart-panel ${rtt ? 'rtt' : 'loss'}`} aria-label={`${title} (${unit})`}>
      <div className="chart-heading"><h3>{rtt ? 'RTT médio' : 'Perda de pacotes'} <span className="unit">{unit}</span></h3>
        <span className="metric-summary">{(history.count - missing).toLocaleString('pt-BR')} com valor · {missing.toLocaleString('pt-BR')} {missing === 1 ? 'indisponível' : 'indisponíveis'}</span>
      </div>
      <div ref={container} className="chart-canvas">
        {values.length === 0 ? <p className="metric-empty" role="status">Há registros, mas esta métrica está indisponível no período.</p> : (
          <svg viewBox={`0 0 ${width} 196`} role="img" aria-label={`${title} em ${unit}, por data e hora local`}>
            <title>{title}. Linhas interrompidas representam métricas ausentes ou lacunas; não são valores zero.</title>
            {[0, 1, 2].map(index => {
              const tick = (index / 2) * ceiling
              return <g key={index}><line x1="64" x2={width - 16} y1={y(tick)} y2={y(tick)} className="grid-line" />
                <text x="54" y={y(tick) + 4} textAnchor="end" className="axis-label">{tick.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</text></g>
            })}
            {Array.from({ length: ticks + 1 }, (_, index) => {
              const time = start + ((stop - start) * index) / ticks
              const [date, hour] = formatLocal(time).split(', ')
              return <text key={index} x={x(time)} y="165" textAnchor={index === 0 ? 'start' : index === ticks ? 'end' : 'middle'} className="axis-label">
                <tspan x={x(time)}>{date}</tspan><tspan x={x(time)} dy="16">{hour}</tspan>
              </text>
            })}
            {segments.map((points, index) => points.length === 1
              ? <circle key={index} cx={x(points[0].time)} cy={y(points[0].value)} r="3" className="series-dot" />
              : <path key={index} d={points.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ')} className="series-line" />)}
            {row && <line x1={x(Date.parse(row.timestamp))} x2={x(Date.parse(row.timestamp))} y1="18" y2="144" className="selection-guide" />}
            {row && value !== null && value !== undefined && <circle cx={x(Date.parse(row.timestamp))} cy={y(value)} r="5" className="selected-dot" />}
            <text x={width / 2} y="195" textAnchor="middle" className="axis-label">Data e hora local</text>
            <rect x="64" y="18" width={plotWidth} height="126" fill="transparent" onPointerMove={inspect} onPointerDown={inspect} />
          </svg>
        )}
      </div>
      <div className="point-detail" aria-label={`Detalhes da rodada de ${rtt ? 'RTT' : 'perda'}`}>
        {row ? <>
          <strong className="point-value" aria-label={rtt ? 'RTT médio da rodada' : 'Perda da rodada'}>{formatMetric(value!)}{value === null ? '' : rtt ? ' ms' : '%'}</strong>
          <span className="point-time">{formatLocal(row.timestamp, true)}</span>
          {!rtt && <span className="packet-counts">{row.packets_sent !== null && row.packets_received !== null
            ? `${packets(row.packets_received)}/${packets(row.packets_sent)} respostas`
            : `Enviados: ${packets(row.packets_sent)} · recebidos: ${packets(row.packets_received)}`}</span>}
        </> : <span className="point-hint">Passe o mouse, toque ou selecione uma rodada.</span>}
      </div>
      <label className="record-selector"><span>Rodada {selected === null ? '—' : (selected + 1).toLocaleString('pt-BR')}/{history.count.toLocaleString('pt-BR')}</span>
        <input type="range" aria-label={`Rodada no gráfico de ${rtt ? 'RTT' : 'perda'}`} min="0" max={Math.max(0, history.results.length - 1)} step="1" value={selected ?? 0}
          aria-valuetext={row ? `Rodada ${selected! + 1}: ${formatLocal(row.timestamp, true)}, ${formatMetric(value!)}${value === null ? '' : ` ${unit}`}` : undefined}
          onFocus={() => { if (selected === null) selectRecord(0) }} onChange={event => selectRecord(Number(event.target.value))} />
      </label>
    </section>
  )
}
