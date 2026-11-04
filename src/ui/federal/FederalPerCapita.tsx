import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Checkbox, FormControlLabel, Typography } from '@mui/material'
import { useTooltipCleanup, useVizSize } from '../../hooks'
import { loadFederalPerCapita, FederalPerCapitaRow } from '../../loadFederalData'
import { CURRENT_YEAR } from '../../constants'
import { adjustForInflation } from '../../cpi'
import { DownloadDataButton } from '../DownloadDataButton'

// National Average = slate gray (subtle baseline), Hawai'i = brand burnt orange (focus).
const US_BAR_COLOR = '#64748b'
const HI_BAR_COLOR = '#c44e00'
// Ratio overlay (Hawaiʻi ÷ National) — brand navy, distinct from both bars.
// Parity reference line at 1.0 sits behind it in a muted gray.
const RATIO_LINE_COLOR = '#153750'
const PARITY_LINE_COLOR = '#9aa3ad'

export function FederalPerCapita() {
  useTooltipCleanup()
  const svgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const [rows, setRows] = useState<FederalPerCapitaRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adjustInflation, setAdjustInflation] = useState(true)

  useEffect(() => {
    loadFederalPerCapita().then(setRows).catch(e => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!svgRef.current || !rows || rows.length === 0) return
    drawChart(svgRef.current, rows, vizSize, adjustInflation)
  }, [rows, vizSize, adjustInflation])

  // Same adjustment drawChart applies internally, hoisted so the download reflects the
  // checkbox rather than exporting raw rows.
  const displayedRows = useMemo(
    () =>
      (rows ?? []).map(r =>
        adjustInflation
          ? {
              ...r,
              hi_per_capita: adjustForInflation(r.hi_per_capita || 0, r.fiscal_year),
              us_per_capita_avg: adjustForInflation(r.us_per_capita_avg || 0, r.fiscal_year)
            }
          : r
      ),
    [rows, adjustInflation]
  )

  if (error) return <div>Failed to load: {error}</div>
  if (!rows) return <div>Loading…</div>

  return (
    <div className="FederalPerCapita fade-in">
      <Box p={2} display="flex" flexDirection="column" alignItems="center">
        <Box display="flex" alignItems="center" mb={1}>
          <FormControlLabel
            control={
              <Checkbox
                checked={adjustInflation}
                onChange={e => setAdjustInflation(e.target.checked)}
                size="small"
              />
            }
            label={<Typography variant="body2">Adjust for inflation (2025 dollars)</Typography>}
          />
          <DownloadDataButton
            filename="federal-per-capita"
            rows={displayedRows}
            scope={adjustInflation ? '2025 dollars' : 'nominal dollars'}
          />
        </Box>
        <svg ref={svgRef}></svg>
      </Box>
    </div>
  )
}

const fmtUsd0 = d3.format('$,.0f')

function drawChart(svgEl: SVGSVGElement, rawRows: FederalPerCapitaRow[], vizSize: { width: number; height: number }, adjustInflation: boolean) {
  const rows: FederalPerCapitaRow[] = adjustInflation
    ? rawRows.map(r => ({
      ...r,
      hi_per_capita: adjustForInflation(r.hi_per_capita || 0, r.fiscal_year),
      us_per_capita_avg: adjustForInflation(r.us_per_capita_avg || 0, r.fiscal_year)
    }))
    : rawRows
  const containerWidth = Math.max(vizSize.width, 550) - 30
  const containerHeight = Math.max(vizSize.height - 130, 540)
  const margin = { top: 20, right: 30, bottom: 90, left: 110 }
  const width = containerWidth - margin.left - margin.right
  const drawableHeight = containerHeight - margin.top - margin.bottom

  // Two stacked panels sharing the same year domain.
  // Top: side-by-side bars (per-capita $). Bottom: parity ratio line with a 1.0 reference.
  // Gap accommodates the ratio panel's axis label + breathing room between panels.
  const panelGap = 50
  const topHeight = Math.round((drawableHeight - panelGap) * 0.65)
  const bottomHeight = drawableHeight - panelGap - topHeight

  const svg = d3.select(svgEl).attr('width', containerWidth).attr('height', containerHeight)
  svg.selectAll('*').remove()
  const root = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
  const topG = root.append('g').attr('class', 'panel-top')
  const bottomG = root.append('g').attr('class', 'panel-bottom').attr('transform', `translate(0,${topHeight + panelGap})`)

  const sorted = [...rows].filter(r => r.fiscal_year < CURRENT_YEAR).sort((a, b) => a.fiscal_year - b.fiscal_year)
  const years = sorted.map(r => r.fiscal_year)

  const x = d3.scaleBand().domain(years.map(String)).range([0, width]).padding(0.2)
  const xSub = d3.scaleBand<'us' | 'hi'>().domain(['us', 'hi']).range([0, x.bandwidth()]).padding(0.08)
  const maxY = d3.max(sorted, r => Math.max(r.hi_per_capita || 0, r.us_per_capita_avg || 0)) || 0
  const y = d3.scaleLinear().domain([0, maxY]).nice().range([topHeight, 0])

  // Bottom panel: parity ratio (Hawaiʻi ÷ National). Domain always includes 1.0
  // with some breathing room so the parity reference line is visible.
  const ratios = sorted
    .map(r => (r.us_per_capita_avg ? r.hi_per_capita / r.us_per_capita_avg : null))
    .filter((v): v is number => v != null && Number.isFinite(v))
  const ratioMin = Math.min(0.9, (d3.min(ratios) ?? 1) - 0.05)
  const ratioMax = Math.max(1.1, (d3.max(ratios) ?? 1) + 0.05)
  const yRatio = d3.scaleLinear().domain([ratioMin, ratioMax]).nice().range([bottomHeight, 0])

  // Tooltip
  let tooltip = d3.select<HTMLDivElement, unknown>('.tooltip-federal-per-capita')
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip tooltip-federal-per-capita tooltip-stacked-bar')
      .style('opacity', 0) as any
  }

  function positionTooltip(event: MouseEvent) {
    const node = tooltip.node() as HTMLElement
    const rect = node.getBoundingClientRect()
    const pad = 10
    let left = event.pageX + pad
    let top = event.pageY - pad
    if (left + rect.width > window.scrollX + window.innerWidth) left = event.pageX - rect.width - pad
    if (top + rect.height > window.scrollY + window.innerHeight) top = event.pageY - rect.height - pad
    tooltip.style('left', left + 'px').style('top', top + 'px')
  }

  function showBarTooltip(event: MouseEvent, d: FederalPerCapitaRow) {
    let html = `<div style="padding:5px 0"><strong>FY ${d.fiscal_year}</strong></div>`
    html += `<div class="labelvalue2 cols-3"><span style="color:${US_BAR_COLOR}">●</span><span>National Average</span><span style="text-align:right;font-weight:600">${fmtUsd0(d.us_per_capita_avg || 0)}</span></div>`
    html += `<div class="labelvalue2 cols-3"><span style="color:${HI_BAR_COLOR}">●</span><span>Hawaiʻi</span><span style="text-align:right;font-weight:600">${fmtUsd0(d.hi_per_capita || 0)}</span></div>`
    tooltip.style('opacity', 1).html(html)
    positionTooltip(event)
  }

  function showRatioTooltip(event: MouseEvent, d: { year: number; ratio: number }) {
    const aboveBelow = d.ratio >= 1 ? 'above parity' : 'below parity'
    let html = `<div style="padding:5px 0"><strong>FY ${d.year}</strong></div>`
    html += `<div class="labelvalue2 cols-2"><span>Hawaiʻi ÷ National</span><span style="text-align:right;font-weight:600">${d.ratio.toFixed(2)}×</span></div>`
    html += `<div style="opacity:0.7;font-size:11px;margin-top:4px">(${(d.ratio * 100).toFixed(0)}% of National — ${aboveBelow})</div>`
    tooltip.style('opacity', 1).html(html)
    positionTooltip(event)
  }

  // === TOP PANEL: side-by-side bars ===

  topG.selectAll('.us-bar')
    .data(sorted)
    .join('rect')
    .attr('class', 'us-bar')
    .attr('x', d => (x(String(d.fiscal_year)) || 0) + (xSub('us') || 0))
    .attr('y', d => y(d.us_per_capita_avg || 0))
    .attr('width', xSub.bandwidth())
    .attr('height', d => topHeight - y(d.us_per_capita_avg || 0))
    .attr('fill', US_BAR_COLOR)
    .on('mouseover', (event, d) => showBarTooltip(event as MouseEvent, d))
    .on('mousemove', positionTooltip)
    .on('mouseout', () => tooltip.style('opacity', 0))

  topG.selectAll('.hi-bar')
    .data(sorted)
    .join('rect')
    .attr('class', 'hi-bar')
    .attr('x', d => (x(String(d.fiscal_year)) || 0) + (xSub('hi') || 0))
    .attr('y', d => y(d.hi_per_capita || 0))
    .attr('width', xSub.bandwidth())
    .attr('height', d => topHeight - y(d.hi_per_capita || 0))
    .attr('fill', HI_BAR_COLOR)
    .on('mouseover', (event, d) => showBarTooltip(event as MouseEvent, d))
    .on('mousemove', positionTooltip)
    .on('mouseout', () => tooltip.style('opacity', 0))

  // Top panel: Y axis ($) and label. No x tick labels here — the shared x axis
  // lives at the bottom of the lower panel to avoid visual repetition.
  const yAxis = topG.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(fmtUsd0 as any) as any)
  yAxis.append('text')
    .attr('class', 'axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('y', 0 - margin.left + 20)
    .attr('x', 0 - topHeight / 2)
    .attr('dy', '1em')
    .style('text-anchor', 'middle')
    .style('font-size', 'var(--font-size-sm)')
    .text('Per Capita Funding')

  // Top panel: tick marks on its baseline (no labels — labels are on the bottom panel).
  topG.append('g')
    .attr('transform', `translate(0,${topHeight})`)
    .call((d3.axisBottom(x).tickFormat(() => '') as any))

  // === BOTTOM PANEL: parity ratio line ===

  // Parity reference line at 1.0 — drawn first so the ratio line sits on top.
  if (ratioMin <= 1 && ratioMax >= 1) {
    bottomG.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', yRatio(1))
      .attr('y2', yRatio(1))
      .attr('stroke', PARITY_LINE_COLOR)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 4')
      .attr('pointer-events', 'none')

    bottomG.append('text')
      .attr('x', width - 4)
      .attr('y', yRatio(1) - 4)
      .attr('text-anchor', 'end')
      .style('font-size', '11px')
      .style('fill', PARITY_LINE_COLOR)
      .text('Parity (1.0×)')
  }

  const ratioPts = sorted
    .map(r => ({
      year: r.fiscal_year,
      ratio: r.us_per_capita_avg ? r.hi_per_capita / r.us_per_capita_avg : null
    }))
    .filter((p): p is { year: number; ratio: number } => p.ratio != null && Number.isFinite(p.ratio))

  const ratioLine = d3.line<{ year: number; ratio: number }>()
    .x(d => (x(String(d.year)) || 0) + x.bandwidth() / 2)
    .y(d => yRatio(d.ratio))
    .curve(d3.curveMonotoneX)

  bottomG.append('path')
    .datum(ratioPts)
    .attr('fill', 'none')
    .attr('stroke', RATIO_LINE_COLOR)
    .attr('stroke-width', 2)
    .attr('pointer-events', 'none')
    .attr('d', ratioLine)

  // Visible dots
  bottomG.selectAll('.ratio-dot')
    .data(ratioPts)
    .join('circle')
    .attr('class', 'ratio-dot')
    .attr('cx', d => (x(String(d.year)) || 0) + x.bandwidth() / 2)
    .attr('cy', d => yRatio(d.ratio))
    .attr('r', 3.5)
    .attr('fill', RATIO_LINE_COLOR)
    .attr('pointer-events', 'none')

  // Larger invisible hit-areas per year for hover (so users don't have to land
  // on the 3.5px dots exactly).
  bottomG.selectAll('.ratio-hit')
    .data(ratioPts)
    .join('circle')
    .attr('class', 'ratio-hit')
    .attr('cx', d => (x(String(d.year)) || 0) + x.bandwidth() / 2)
    .attr('cy', d => yRatio(d.ratio))
    .attr('r', 12)
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('mouseover', (event, d) => showRatioTooltip(event as MouseEvent, d))
    .on('mousemove', positionTooltip)
    .on('mouseout', () => tooltip.style('opacity', 0))

  // Bottom panel: shared X axis (labels live here) + ratio Y axis.
  bottomG.append('g')
    .attr('transform', `translate(0,${bottomHeight})`)
    .call(d3.axisBottom(x) as any)

  const yRatioAxis = bottomG.append('g')
    .call(d3.axisLeft(yRatio).ticks(4).tickFormat(((v: number) => `${v.toFixed(2)}×`) as any) as any)
  yRatioAxis.append('text')
    .attr('class', 'axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('y', 0 - margin.left + 20)
    .attr('x', 0 - bottomHeight / 2)
    .attr('dy', '1em')
    .style('text-anchor', 'middle')
    .style('font-size', 'var(--font-size-sm)')
    .text('Hawaiʻi ÷ National')

  // === LEGEND ===

  const legend = root.append('g').attr('transform', `translate(0, ${topHeight + panelGap + bottomHeight + 40})`)
  type LegendItem = { label: string; color: string; kind: 'bar' | 'line' }
  const items: LegendItem[] = [
    { label: 'National Average', color: US_BAR_COLOR, kind: 'bar' },
    { label: 'Hawaiʻi', color: HI_BAR_COLOR, kind: 'bar' },
    { label: 'Hawaiʻi ÷ National', color: RATIO_LINE_COLOR, kind: 'line' }
  ]
  const itemGap = 24
  const positions: number[] = []
  const tmp = root.append('text').style('font-size', 'var(--font-size-sm)').style('visibility', 'hidden')
  const widths = items.map(it => {
    tmp.text(it.label)
    return 16 + 4 + (tmp.node() as SVGTextElement).getComputedTextLength()
  })
  tmp.remove()
  const totalWidth = widths.reduce((s, w) => s + w, 0) + itemGap * (items.length - 1)
  let cursor = (width - totalWidth) / 2
  for (let i = 0; i < items.length; i++) {
    positions.push(cursor)
    cursor += widths[i] + itemGap
  }

  const itemGroups = legend.selectAll('.legend-item').data(items).join('g')
    .attr('class', 'legend-item')
    .attr('transform', (_, i) => `translate(${positions[i]}, 0)`)

  itemGroups.each(function (d) {
    const sel = d3.select(this)
    if (d.kind === 'bar') {
      sel.append('rect').attr('width', 12).attr('height', 12).attr('rx', 2).attr('fill', d.color)
    } else {
      sel.append('line')
        .attr('x1', 0).attr('x2', 14).attr('y1', 6).attr('y2', 6)
        .attr('stroke', d.color).attr('stroke-width', 2)
      sel.append('circle')
        .attr('cx', 7).attr('cy', 6).attr('r', 3).attr('fill', d.color)
    }
  })
  itemGroups.append('text').attr('x', 16).attr('y', 10).attr('class', 'legend-text')
    .style('font-size', 'var(--font-size-sm)').text(d => d.label)
}
