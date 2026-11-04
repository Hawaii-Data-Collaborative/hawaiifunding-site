import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Checkbox, FormControlLabel, Typography } from '@mui/material'
import { formatCurrency } from '../../util'
import { useTooltipCleanup, useVizSize } from '../../hooks'
import { loadFederalByAwardType, FederalByAwardTypeRow } from '../../loadFederalData'
import { PALETTE_8, CURRENT_YEAR } from '../../constants'
import { adjustForInflation } from '../../cpi'
import { DownloadDataButton } from '../DownloadDataButton'

const POSITIVE_COLOR = '#09a7a6'
const NEGATIVE_COLOR = '#9c3d6a' // var(--orange-2) — matches state YoY chart
// Brighter, colorblind-safer pair for tooltip text against the near-black background.
// Orange reads distinctly under both red-green and blue-yellow CVD.
const TOOLTIP_POSITIVE_COLOR = '#2dd4bf'
const TOOLTIP_NEGATIVE_COLOR = '#fb923c'

const LINE_COLORS = [
  PALETTE_8[0],
  PALETTE_8[4],
  PALETTE_8[6],
  PALETTE_8[7]
]

interface ChartData {
  allYears: number[] // full domain — lines have data here, x-axis labels span this
  yearsWithPrior: number[] // years that have a YoY bar (excludes first FY)
  totalAbsChangeByYear: Record<number, number> // tooltip context
  totalPctByYear: Record<number, number> // bar height (left axis, %)
  totalAbsByYear: Record<number, number> // tooltip context
  awardTypes: string[] // ordered by lifetime total desc, capped to keep lines readable
  oblByTypeYear: Record<string, Record<number, number>> // line series ($ absolute, right axis)
  pctByTypeYear: Record<string, Record<number, number | null>> // tooltip context
  absChangeByTypeYear: Record<string, Record<number, number | null>> // tooltip context
  colorMap: Record<string, string>
}

const MAX_LINES = 4 // cap trend lines to keep the chart readable

export function FederalYoyChange() {
  useTooltipCleanup()
  const svgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const [rows, setRows] = useState<FederalByAwardTypeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adjustInflation, setAdjustInflation] = useState(true)

  useEffect(() => {
    loadFederalByAwardType()
      .then(setRows)
      .catch(e => setError(String(e)))
  }, [])

  const chartData = useMemo<ChartData | null>(() => {
    if (!rows) return null

    // Drop the in-progress FY — the USAspending snapshot doesn't fully cover it,
    // and a partial year produces misleading bars and line points.
    // Also drop the "Other Awards" bucket: it's USAspending's literal "other"
    // catch-all and adds noise without analytical value here.
    const completeRows = rows
      .filter(r => r.fiscal_year < CURRENT_YEAR)
      .filter(r => r.award_type !== 'Other Awards')
    const adj = (v: number, year: number) => (adjustInflation ? adjustForInflation(v, year) : v)
    const allYears = Array.from(new Set(completeRows.map(r => r.fiscal_year))).sort((a, b) => a - b)
    if (allYears.length < 2) return null

    // Lifetime totals per type — pick top N to keep the chart readable.
    // Excluded types still contribute to bar totals (we want the bar % change to
    // reflect the full picture) but are hidden from the trend-line view.
    const EXCLUDED_TREND_TYPES = new Set(['Insurance', 'IDV', 'Loans'])
    const lifetimeByType = new Map<string, number>()
    for (const r of completeRows) {
      lifetimeByType.set(r.award_type, (lifetimeByType.get(r.award_type) ?? 0) + adj(r.obligations || 0, r.fiscal_year))
    }
    const awardTypes = Array.from(lifetimeByType.keys())
      .filter(t => !EXCLUDED_TREND_TYPES.has(t))
      .sort((a, b) => (lifetimeByType.get(b) ?? 0) - (lifetimeByType.get(a) ?? 0))
      .slice(0, MAX_LINES)

    // Pivot: type x year -> obligations
    const oblByTypeYear: Record<string, Record<number, number>> = {}
    for (const t of awardTypes) oblByTypeYear[t] = {}
    for (const r of completeRows) {
      if (!awardTypes.includes(r.award_type)) continue
      oblByTypeYear[r.award_type][r.fiscal_year] = adj(r.obligations || 0, r.fiscal_year)
    }

    const totalAbsByYear: Record<number, number> = {}
    for (const y of allYears) {
      totalAbsByYear[y] = d3.sum(
        completeRows.filter(r => r.fiscal_year === y),
        r => adj(r.obligations || 0, y)
      )
    }

    const yearsWithPrior = allYears.slice(1)
    const totalPctByYear: Record<number, number> = {}
    const totalAbsChangeByYear: Record<number, number> = {}
    for (const y of yearsWithPrior) {
      const prev = totalAbsByYear[y - 1]
      const curr = totalAbsByYear[y]
      totalAbsChangeByYear[y] = curr - prev
      totalPctByYear[y] = prev > 0 ? ((curr - prev) / prev) * 100 : 0
    }

    const pctByTypeYear: Record<string, Record<number, number | null>> = {}
    const absChangeByTypeYear: Record<string, Record<number, number | null>> = {}
    for (const t of awardTypes) {
      pctByTypeYear[t] = {}
      absChangeByTypeYear[t] = {}
      for (const y of yearsWithPrior) {
        const prev = oblByTypeYear[t][y - 1] ?? 0
        const curr = oblByTypeYear[t][y] ?? 0
        absChangeByTypeYear[t][y] = prev || curr ? curr - prev : null
        pctByTypeYear[t][y] = prev > 0 ? ((curr - prev) / prev) * 100 : null
      }
    }

    const colorMap: Record<string, string> = {}
    awardTypes.forEach((t, i) => {
      colorMap[t] = LINE_COLORS[i % LINE_COLORS.length]
    })

    return {
      allYears,
      yearsWithPrior,
      totalAbsChangeByYear,
      totalPctByYear,
      totalAbsByYear,
      awardTypes,
      oblByTypeYear,
      absChangeByTypeYear,
      pctByTypeYear,
      colorMap
    }
  }, [rows, adjustInflation])

  useEffect(() => {
    if (!svgRef.current || !chartData) return
    drawYoy(svgRef.current, chartData, vizSize)
  }, [chartData, vizSize])

  if (error) return <div>Failed to load: {error}</div>
  if (!rows) return <div>Loading…</div>
  if (!chartData) return <div>Need at least two fiscal years to compute YoY change.</div>

  return (
    <div className="FederalYoyChange fade-in">
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
          {/* One row per year: the bar's percent change plus the absolute figures behind
              it, then a column per award-type trend line. */}
          <DownloadDataButton
            filename="federal-year-over-year-change"
            scope={
              chartData?.allYears?.length
                ? `FY ${chartData.allYears[0]}\u2013${chartData.allYears[chartData.allYears.length - 1]}`
                : undefined
            }
            rows={(chartData?.allYears ?? []).map(yr => ({
              fiscal_year: yr,
              total_obligations: chartData?.totalAbsByYear[yr] ?? '',
              change_vs_prior_year: chartData?.totalAbsChangeByYear[yr] ?? '',
              percent_change: chartData?.totalPctByYear[yr] ?? '',
              ...Object.fromEntries(
                (chartData?.awardTypes ?? []).map(t => [t, chartData?.oblByTypeYear[t]?.[yr] ?? ''])
              ),
              inflation_adjusted: adjustInflation ? '2025 dollars' : 'nominal'
            }))}
          />
        </Box>
        <svg ref={svgRef}></svg>
      </Box>
    </div>
  )
}

function drawYoy(svgEl: SVGSVGElement, data: ChartData, vizSize: { width: number; height: number }) {
  const containerWidth = Math.max(vizSize.width, 550) - 30
  const containerHeight = Math.max(vizSize.height - 130, 400)
  // Right margin sized to fit dollar tick labels (e.g. "$340M") for the right axis.
  const margin = { top: 20, right: 70, bottom: 90, left: 70 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  const svg = d3.select(svgEl).attr('width', containerWidth).attr('height', containerHeight)
  svg.selectAll('*').remove()
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  // X spans all years; bars only render for yearsWithPrior, lines render across all.
  // Asymmetric on purpose — first year has line points but no bar (no prior year to compare).
  const x = d3.scaleBand().domain(data.allYears.map(String)).range([0, width]).padding(0.2)

  // Left Y: percent change (bars). Symmetric around 0 so the 0% baseline sits at
  // the vertical midline — gives the right-axis lines a clean "upper half" to live in.
  const pctValues = Object.values(data.totalPctByYear)
  const pctAbsMax = Math.max(...pctValues.map(v => Math.abs(v)), 10) * 1.3
  const yLeft = d3
    .scaleLinear()
    .domain([-pctAbsMax, pctAbsMax])
    .nice()
    .range([height, 0])
  const zeroY = yLeft(0)

  // Right Y: absolute obligations per type (lines). $0 anchored at the midline (yLeft(0))
  // so trend lines occupy only the upper half of the chart, above the negative-pct bar region.
  const lineValues: number[] = data.awardTypes.flatMap(t =>
    data.allYears.map(y => data.oblByTypeYear[t][y]).filter((v): v is number => v != null)
  )
  const lineMax = d3.max(lineValues) ?? 0
  const dollarMax = lineMax * 1.1 || 1
  const yRight = d3.scaleLinear().domain([0, dollarMax]).range([zeroY, 0])

  // Zero baseline for the bars (left axis).
  g.append('line')
    .attr('x1', 0)
    .attr('x2', width)
    .attr('y1', yLeft(0))
    .attr('y2', yLeft(0))
    .attr('stroke', '#aab')
    .attr('stroke-width', 1)

  // Tooltip
  let tooltip = d3.select<HTMLDivElement, unknown>('.tooltip-federal-yoy')
  if (tooltip.empty()) {
    tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip tooltip-federal-yoy tooltip-stacked-bar')
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

  // Clip path so trend lines stay inside the chart area when the right-axis domain
  // pushes them past the edges.
  const clipId = 'federal-yoy-clip'
  let defs = svg.select<SVGDefsElement>('defs')
  if (defs.empty()) defs = svg.append('defs')
  defs.selectAll('clipPath').remove()
  defs
    .append('clipPath')
    .attr('id', clipId)
    .append('rect')
    .attr('width', width)
    .attr('height', height)

  const DIMMED = 0.25

  // Highlight a single series (bars or a specific award type), dimming the rest.
  // Matches the state YoY chart's interaction model.
  function highlight(hoveredKey: string | null) {
    g.selectAll('.bar')
      .transition()
      .duration(200)
      .style('opacity', !hoveredKey || hoveredKey === 'bars' ? 1 : DIMMED)

    for (const t of data.awardTypes) {
      const safe = t.replace(/\s+/g, '-')
      g.selectAll(`.line-${safe}, .dot-${safe}`)
        .transition()
        .duration(200)
        .style('opacity', !hoveredKey || hoveredKey === t ? 0.9 : DIMMED)
    }

    g.selectAll('.legend-item')
      .transition()
      .duration(200)
      .style('opacity', function () {
        const key = d3.select(this).attr('data-key')
        return !hoveredKey || key === hoveredKey ? 1 : DIMMED
      })
  }

  // Bars first — drawn under the lines so the trend lines stay visible on top.
  g.selectAll('.bar')
    .data(data.yearsWithPrior)
    .join('rect')
    .attr('class', 'bar')
    .attr('x', d => x(String(d)) || 0)
    .attr('width', x.bandwidth())
    .attr('y', d => {
      const v = data.totalPctByYear[d]
      return v >= 0 ? yLeft(v) : yLeft(0)
    })
    .attr('height', d => {
      const v = data.totalPctByYear[d]
      return Math.abs(yLeft(v) - yLeft(0))
    })
    .attr('fill', d => (data.totalPctByYear[d] >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR))
    .attr('opacity', 1)
    .on('mouseover', function (event, d) {
      highlight('bars')
      const totalChg = data.totalAbsChangeByYear[d]
      const totalPct = data.totalPctByYear[d]
      const totalAbs = data.totalAbsByYear[d]
      const sign = (n: number) => (n >= 0 ? '+' : '')
      const color = totalChg >= 0 ? TOOLTIP_POSITIVE_COLOR : TOOLTIP_NEGATIVE_COLOR
      let html = `<div style="padding:5px 0"><strong>FY ${d}</strong></div>`
      html += `<div class="labelvalue2 cols-2"><span>Overall YoY:</span><span style="text-align:right;font-weight:600;color:${color}">${sign(totalChg)}${formatCurrency(totalChg)} (${sign(totalPct)}${totalPct.toFixed(1)}%)</span></div>`
      html += `<div class="labelvalue2 cols-2" style="opacity:0.7"><span>Total obligations:</span><span style="text-align:right">${formatCurrency(totalAbs)}</span></div>`
      tooltip.style('opacity', 1).html(html)
      positionTooltip(event)
    })
    .on('mousemove', positionTooltip)
    .on('mouseout', () => {
      highlight(null)
      tooltip.style('opacity', 0)
    })

  // Trend lines: per-award-type absolute obligations (right axis).
  // Each line has a visible thin path + an invisible wider hit path for easier hovering.
  const line = d3
    .line<{ year: number; v: number }>()
    .x(d => (x(String(d.year)) || 0) + x.bandwidth() / 2)
    .y(d => yRight(d.v))
    .defined(d => Number.isFinite(d.v))
    .curve(d3.curveMonotoneX)

  for (const t of data.awardTypes) {
    const safe = t.replace(/\s+/g, '-')
    const pts = data.allYears
      .map(yr => ({ year: yr, v: data.oblByTypeYear[t][yr] }))
      .filter((p): p is { year: number; v: number } => p.v != null)

    // Visible line
    g.append('path')
      .datum(pts)
      .attr('class', `line-${safe}`)
      .attr('clip-path', `url(#${clipId})`)
      .attr('fill', 'none')
      .attr('stroke', data.colorMap[t])
      .attr('stroke-width', 1.75)
      .attr('stroke-dasharray', '5 3')
      .attr('opacity', 0.9)
      .attr('pointer-events', 'none')
      .attr('d', line)

    // Dot markers
    g.selectAll(`.dot-${safe}`)
      .data(pts)
      .join('circle')
      .attr('class', `dot-${safe}`)
      .attr('clip-path', `url(#${clipId})`)
      .attr('cx', d => (x(String(d.year)) || 0) + x.bandwidth() / 2)
      .attr('cy', d => yRight(d.v))
      .attr('r', 2.75)
      .attr('fill', data.colorMap[t])
      .attr('opacity', 0.9)
      .attr('pointer-events', 'none')

    // Invisible wider hit path — only this layer receives pointer events,
    // so the bar hover stays clean elsewhere.
    g.append('path')
      .datum(pts)
      .attr('class', `hit-${safe}`)
      .attr('clip-path', `url(#${clipId})`)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 12)
      .attr('d', line)
      .style('cursor', 'pointer')
      .on('mouseover', function (event) {
        highlight(t)
        showLineTooltip(event, t, pts)
      })
      .on('mousemove', function (event) {
        showLineTooltip(event, t, pts)
      })
      .on('mouseout', () => {
        highlight(null)
        tooltip.style('opacity', 0)
      })
  }

  function showLineTooltip(event: MouseEvent, awardType: string, pts: { year: number; v: number }[]) {
    // Snap to the nearest year by x distance.
    const mouseX = event.offsetX - margin.left
    const nearest = pts.reduce((best, pt) => {
      const px = (x(String(pt.year)) || 0) + x.bandwidth() / 2
      const bestPx = (x(String(best.year)) || 0) + x.bandwidth() / 2
      return Math.abs(px - mouseX) < Math.abs(bestPx - mouseX) ? pt : best
    })
    let html = `<div style="padding:5px 0"><strong>${awardType}</strong></div>`
    html += `<div class="labelvalue2 cols-2"><span>FY ${nearest.year}</span><span style="text-align:right;font-weight:600">${formatCurrency(nearest.v)}</span></div>`
    tooltip.style('opacity', 1).html(html)
    positionTooltip(event)
  }

  // X axis
  g.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x) as any)

  // Left Y axis (percent change)
  const yLeftFormat = (v: number) => `${v >= 0 ? '+' : ''}${v}%`
  g.append('g').call(
    d3
      .axisLeft(yLeft)
      .ticks(6)
      .tickFormat(yLeftFormat as any) as any
  )

  // Right Y axis (absolute obligations $) — formatCurrency picks M/B units dynamically.
  g.append('g')
    .attr('transform', `translate(${width},0)`)
    .call(
      d3
        .axisRight(yRight)
        .ticks(6)
        .tickFormat(((v: number) => formatCurrency(v)) as any) as any
    )

  // Legend: two groups, mirroring the state viz YoY chart.
  // Left group ("Obligations Change") = bar swatches; right group ("Award Type")
  // = dashed-line swatches, right-aligned to the chart edge.
  const legend = g.append('g').attr('class', 'legend').attr('transform', `translate(0, ${height + 55})`)

  // --- Left group ---
  const leftLegend = legend.append('g').attr('class', 'legend-left')
  leftLegend
    .append('text')
    .attr('class', 'legend-text')
    .attr('y', -6)
    .style('font-size', 'var(--font-size-sm)')
    .style('font-weight', '600')
    .text('Obligations Change')

  const barItems = [
    { label: 'Positive', color: POSITIVE_COLOR },
    { label: 'Negative', color: NEGATIVE_COLOR }
  ]
  let leftX = 0
  barItems.forEach(item => {
    const itemG = leftLegend
      .append('g')
      .attr('class', 'legend-item')
      .attr('data-key', 'bars')
      .attr('transform', `translate(${leftX}, 8)`)
    itemG.append('rect').attr('width', 12).attr('height', 12).attr('rx', 2).attr('fill', item.color)
    itemG.append('text').attr('x', 16).attr('y', 10).style('font-size', 'var(--font-size-sm)').text(item.label)
    const textNode = itemG.select('text').node() as SVGTextElement
    leftX += 16 + (textNode ? textNode.getComputedTextLength() : 60) + 20
  })

  // --- Right group, right-aligned to the chart edge ---
  const rightLegend = legend.append('g').attr('class', 'legend-right')

  // Pre-measure so we can right-align
  const tempG = legend.append('g').style('visibility', 'hidden')
  let rightTotalWidth = 0
  data.awardTypes.forEach(t => {
    const t2 = tempG.append('text').style('font-size', 'var(--font-size-sm)').text(t)
    rightTotalWidth += 20 + (t2.node() as SVGTextElement).getComputedTextLength() + 20
  })
  rightTotalWidth -= 20
  const titleTemp = tempG.append('text').style('font-size', 'var(--font-size-sm)').style('font-weight', '600').text('Award Type')
  const titleWidth = (titleTemp.node() as SVGTextElement).getComputedTextLength()
  tempG.remove()

  const rightGroupWidth = Math.max(rightTotalWidth, titleWidth)
  rightLegend.attr('transform', `translate(${width - rightGroupWidth}, 0)`)

  rightLegend
    .append('text')
    .attr('class', 'legend-text')
    .attr('y', -6)
    .style('font-size', 'var(--font-size-sm)')
    .style('font-weight', '600')
    .text('Award Type')

  let rightX = 0
  data.awardTypes.forEach(t => {
    const itemG = rightLegend
      .append('g')
      .attr('class', 'legend-item')
      .attr('data-key', t)
      .attr('transform', `translate(${rightX}, 8)`)
    itemG
      .append('line')
      .attr('x1', 0)
      .attr('x2', 14)
      .attr('y1', 6)
      .attr('y2', 6)
      .attr('stroke', data.colorMap[t])
      .attr('stroke-width', 1.75)
      .attr('stroke-dasharray', '5 3')
    itemG.append('text').attr('x', 18).attr('y', 10).style('font-size', 'var(--font-size-sm)').text(t)
    const textNode = itemG.select('text').node() as SVGTextElement
    rightX += 18 + (textNode ? textNode.getComputedTextLength() : 60) + 20
  })

  const neededHeight = margin.top + height + 55 + 24 + 10
  if (neededHeight > containerHeight) svg.attr('height', neededHeight)
}
