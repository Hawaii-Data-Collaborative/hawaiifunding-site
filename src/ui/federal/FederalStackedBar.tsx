import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Checkbox, FormControlLabel, Typography } from '@mui/material'
import { PALETTE_8, CURRENT_YEAR } from '../../constants'
import { formatCurrency } from '../../util'
import { useTooltipCleanup, useVizSize } from '../../hooks'
import { adjustForInflation } from '../../cpi'
import { DownloadDataButton } from '../DownloadDataButton'

interface FederalStackedBarRow {
  fiscal_year: number
  obligations: number
}

interface Props<Row extends FederalStackedBarRow> {
  rows: Row[]
  keyField: Exclude<keyof Row, 'fiscal_year' | 'obligations'>
  topN?: number
  palette?: string[]
  // When set, within the "Other" tooltip breakdown, sub-entries with |value| below
  // this dollar amount are collapsed into a single "Miscellaneous (N items)" row
  // to keep the tooltip from overflowing the viewport.
  nestedOtherThreshold?: number
}

interface ChartData {
  years: number[]
  keys: string[]        // stack order (pinned key at bottom)
  legendKeys: string[]  // legend display order (always by total descending)
  colorMap: Record<string, string>
  stacks: Record<string, number>[]
  otherBreakdown: Record<number, Record<string, number>>
}

export function FederalStackedBar<Row extends FederalStackedBarRow>({
  rows,
  keyField,
  topN,
  palette = PALETTE_8,
  nestedOtherThreshold
}: Props<Row>) {
  useTooltipCleanup()
  const svgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const [adjustInflation, setAdjustInflation] = useState(true)
  const [pinnedKey, setPinnedKey] = useState<string | null>(null)

  const chartData = useMemo<ChartData>(() => {
    const filtered = rows.filter(r => r.fiscal_year < CURRENT_YEAR)
    const adj = (v: number, year: number) => (adjustInflation ? adjustForInflation(v, year) : v)

    const years = Array.from(new Set(filtered.map(r => r.fiscal_year))).sort((a, b) => a - b)

    const totalsByKey = new Map<string, number>()
    for (const r of filtered) {
      const k = String(r[keyField] ?? 'unknown')
      totalsByKey.set(k, (totalsByKey.get(k) ?? 0) + adj(r.obligations || 0, r.fiscal_year))
    }
    const sortedKeys = Array.from(totalsByKey.keys()).sort(
      (a, b) => (totalsByKey.get(b) ?? 0) - (totalsByKey.get(a) ?? 0)
    )

    let displayKeys = sortedKeys
    let otherKeys: string[] = []
    if (topN && sortedKeys.length > topN) {
      // Defensive: any raw key that's already a catch-all name (case-insensitive
      // "other" or "miscellaneous") must be folded into the synthetic 'Other'
      // bucket regardless of size, so the legend never shows two confusable
      // entries side by side and the sub-entry shows in the breakdown tooltip
      // with its renamed label.
      const isCatchAll = (k: string) => /^(other|miscellaneous)$/i.test(k)
      const literalOther = sortedKeys.filter(isCatchAll)
      const nonLiteral = sortedKeys.filter(k => !isCatchAll(k))
      displayKeys = nonLiteral.slice(0, topN)
      otherKeys = [...nonLiteral.slice(topN), ...literalOther]
      displayKeys = [...displayKeys, 'Other']
    }

    const colorMap: Record<string, string> = {}
    displayKeys.forEach((k, i) => {
      if (k === 'Other') colorMap[k] = palette[palette.length - 1]
      else colorMap[k] = palette[i % (palette.length - (otherKeys.length > 0 ? 1 : 0))]
    })

    // Legend stays in total-descending order; stack order puts the pinned key
    // at the bottom (so clicking moves it visually to the bottom of each bar).
    const legendKeys = displayKeys
    let stackKeys = [...displayKeys]
    if (pinnedKey && stackKeys.includes(pinnedKey)) {
      stackKeys = [pinnedKey, ...stackKeys.filter(k => k !== pinnedKey)]
    }

    const otherBreakdown: Record<number, Record<string, number>> = {}
    const stacks = years.map(year => {
      const row: Record<string, number> = { year }
      for (const k of displayKeys) row[k] = 0
      const sub: Record<string, number> = {}
      for (const r of filtered) {
        if (r.fiscal_year !== year) continue
        const k = String(r[keyField] ?? 'unknown')
        const v = adj(r.obligations || 0, year)
        if (otherKeys.includes(k)) {
          row['Other'] = (row['Other'] || 0) + v
          sub[k] = (sub[k] || 0) + v
        } else if (k in row) {
          row[k] += v
        }
      }
      if (otherKeys.length > 0) otherBreakdown[year] = sub
      return row
    })

    return { years, keys: stackKeys, legendKeys, colorMap, stacks, otherBreakdown }
  }, [rows, keyField, topN, palette, adjustInflation, pinnedKey])

  useEffect(() => {
    if (!svgRef.current || !chartData.stacks.length) return
    drawChart(svgRef.current, chartData, vizSize, pinnedKey, setPinnedKey, nestedOtherThreshold)
  }, [chartData, vizSize, pinnedKey, nestedOtherThreshold])

  return (
    <div className="FederalStackedBar fade-in">
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
          {/* Long format (year × series) so the CSV stays useful however the chart is stacked. */}
          <DownloadDataButton
            filename={`federal-by-${String(keyField)}`}
            scope={`FY ${chartData.years[0]}\u2013${chartData.years[chartData.years.length - 1]}`}
            rows={chartData.stacks.flatMap(row =>
              chartData.legendKeys
                .filter(k => (row[k] || 0) !== 0)
                .map(k => ({
                  fiscal_year: row.year,
                  [String(keyField)]: k,
                  obligations: row[k],
                  inflation_adjusted: adjustInflation ? '2025 dollars' : 'nominal'
                }))
            )}
          />
        </Box>
        <svg ref={svgRef}></svg>
      </Box>
    </div>
  )
}

function labelColor(bg: string): string {
  const c = d3.color(bg)
  if (!c) return 'white'
  const { r, g, b } = c.rgb()
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#153750' : 'white'
}

function drawChart(
  svgEl: SVGSVGElement,
  data: ChartData,
  vizSize: { width: number; height: number },
  pinnedKey: string | null,
  setPinnedKey: (k: string | null) => void,
  nestedOtherThreshold: number | undefined
) {
  const containerWidth = Math.max(vizSize.width, 550) - 30
  const containerHeight = Math.max(vizSize.height - 130, 400)
  const margin = { top: 20, right: 20, bottom: 90, left: 80 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  const svg = d3.select(svgEl).attr('width', containerWidth).attr('height', containerHeight)

  // Persistent main group — selected (not re-created) across renders so that
  // d3's keyed joins below can animate between states (e.g. when a legend
  // click changes the stack order).
  let g = svg.select<SVGGElement>('.main-group')
  if (g.empty()) {
    g = svg.append('g').attr('class', 'main-group').attr('transform', `translate(${margin.left},${margin.top})`)
  }

  const t = svg.transition().duration(600).ease(d3.easeCubicInOut)

  const xScale = d3.scaleBand().domain(data.years.map(String)).range([0, width]).padding(0.15)
  const maxY = d3.max(data.stacks, row => data.keys.reduce((s, k) => s + (row[k] || 0), 0)) || 0
  const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([height, 0])

  const stack = d3.stack<Record<string, number>>().keys(data.keys).order(d3.stackOrderNone)
  const series = stack(data.stacks)

  let tooltip = d3.select<HTMLDivElement, unknown>('.tooltip-federal-stacked')
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip tooltip-federal-stacked tooltip-stacked-bar')
      .style('opacity', 0) as any
  }

  function positionTooltip(event: { pageX: number; pageY: number }) {
    const node = tooltip.node() as HTMLElement
    const rect = node.getBoundingClientRect()
    const pad = 10
    let left = event.pageX + pad
    let top = event.pageY - pad
    if (left + rect.width > window.scrollX + window.innerWidth) left = event.pageX - rect.width - pad
    if (top + rect.height > window.scrollY + window.innerHeight) top = event.pageY - rect.height - pad
    // Tall tooltips (long Other-breakdown lists) can otherwise extend above the viewport.
    if (top < window.scrollY + pad) top = window.scrollY + pad
    tooltip.style('left', left + 'px').style('top', top + 'px')
  }

  // --- "Miscellaneous" reveal state machine ---------------------------------
  // The cursor-following tooltip can't receive its own mouse events, so we
  // can't put a scroll/expand UI inside it. Instead: after 2s of mouse idle,
  // run a 3-2-1 countdown in the Miscellaneous line, then expand it to the
  // full list of rolled-up entries. Any mousemove cancels and restarts the
  // 2s idle wait.
  type MiscPhase = 'collapsed' | 'countdown-3' | 'countdown-2' | 'countdown-1' | 'expanded'
  type HoveredRow = {
    row: d3.SeriesPoint<Record<string, number>>
    layerKey: string
    year: number
    miscEntries: [string, number][]
  }
  let hovered: HoveredRow | null = null
  let miscPhase: MiscPhase = 'collapsed'
  let miscTimerIds: ReturnType<typeof setTimeout>[] = []
  let lastMouseX = 0
  let lastMouseY = 0

  function clearMiscTimers() {
    for (const t of miscTimerIds) clearTimeout(t)
    miscTimerIds = []
  }

  function buildMiscEntries(year: number): [string, number][] {
    const breakdown = data.otherBreakdown[year]
    if (!breakdown) return []
    const threshold = nestedOtherThreshold ?? 0
    if (threshold <= 0) return []
    return Object.entries(breakdown)
      .filter(([, v]) => Math.abs(v) < threshold)
      .sort((a, b) => b[1] - a[1])
  }

  function renderTooltipHtml() {
    if (!hovered) return
    const { row, layerKey, year, miscEntries } = hovered
    let html = `<div style="padding:5px 0"><strong>FY ${year}</strong></div>`
    for (const k of [...data.legendKeys].reverse()) {
      const v = row.data[k] || 0
      if (v <= 0) continue
      const dim = k !== layerKey ? 'opacity:0.5' : ''
      html += `<div class="labelvalue2 cols-3" style="${dim}"><span style="color:${data.colorMap[k]}">●</span> <span>${k}</span><span>${formatCurrency(v)}</span></div>`
      if (k === 'Other' && data.otherBreakdown[year]) {
        const allSubs = Object.entries(data.otherBreakdown[year]).sort((a, b) => b[1] - a[1])
        const threshold = nestedOtherThreshold ?? 0
        const kept = threshold > 0 ? allSubs.filter(([, v]) => Math.abs(v) >= threshold) : allSubs
        for (const [sk, sv] of kept) {
          html += `<div class="labelvalue2 cols-2" style="${dim};padding-left:30px;"><span>${sk}</span><span style="text-align:right;font-weight:600">${formatCurrency(sv)}</span></div>`
        }
        if (miscEntries.length > 0) {
          const miscTotal = miscEntries.reduce((s, [, v]) => s + v, 0)
          const n = miscPhase === 'countdown-3' ? 3 : miscPhase === 'countdown-2' ? 2 : miscPhase === 'countdown-1' ? 1 : 0
          const suffix = n > 0 ? `, showing in ${n}` : ''
          html += `<div class="labelvalue2 cols-2" style="${dim};padding-left:30px;"><span>Miscellaneous (${miscEntries.length} items${suffix})</span><span style="text-align:right;font-weight:600">${formatCurrency(miscTotal)}</span></div>`
          if (miscPhase === 'expanded') {
            html += `<div class="misc-expand" style="overflow:hidden">`
            // Sub-items keep their sub-list dimming (0.9) only when the row is
            // the hovered layer; otherwise the layer's dim (0.5) takes over so
            // they fade with their siblings.
            const itemOpacity = dim || 'opacity:0.9'
            for (const [sk, sv] of miscEntries) {
              html += `<div class="labelvalue2 cols-2" style="${itemOpacity};padding-left:50px;"><span>${sk}</span><span style="text-align:right;font-weight:600">${formatCurrency(sv)}</span></div>`
            }
            html += `</div>`
          }
        }
      }
    }
    const total = data.keys.reduce((s, kk) => s + (row.data[kk] || 0), 0)
    html += `<div class="labelvalue2 cols-2" style="border-top:1px solid #555;margin-top:4px;padding-top:4px"><span><strong>Total:</strong></span><span style="text-align:right"><strong>${formatCurrency(total)}</strong></span></div>`
    tooltip.html(html)
    // Animate the expansion: render the wrapper open (so positionTooltip flips
    // the tooltip up if needed), then snap it shut (no transition), force a
    // reflow, and re-open it with a transition. The user sees only the final
    // state with the animation kicking in.
    if (miscPhase === 'expanded') {
      const expandEl = tooltip.node()?.querySelector('.misc-expand') as HTMLDivElement | null
      if (expandEl) {
        const natural = expandEl.scrollHeight
        positionTooltip({ pageX: lastMouseX, pageY: lastMouseY })
        expandEl.style.maxHeight = '0px'
        void expandEl.offsetHeight
        expandEl.style.transition = 'max-height 400ms ease-out'
        expandEl.style.maxHeight = `${natural}px`
        return
      }
    }
    positionTooltip({ pageX: lastMouseX, pageY: lastMouseY })
  }

  function startMiscSequence() {
    if (!hovered || hovered.miscEntries.length === 0) return
    // 2s of mouse idle → start the countdown, then reveal.
    miscTimerIds.push(setTimeout(() => { miscPhase = 'countdown-3'; renderTooltipHtml() }, 2000))
    miscTimerIds.push(setTimeout(() => { miscPhase = 'countdown-2'; renderTooltipHtml() }, 3000))
    miscTimerIds.push(setTimeout(() => { miscPhase = 'countdown-1'; renderTooltipHtml() }, 4000))
    miscTimerIds.push(setTimeout(() => { miscPhase = 'expanded'; renderTooltipHtml() }, 5000))
  }

  const DIMMED = 0.3
  function highlightLayer(hoveredKey: string | null) {
    g.selectAll<SVGGElement, d3.Series<Record<string, number>, string>>('.layer')
      .transition().duration(200)
      .style('opacity', d => (!hoveredKey || d.key === hoveredKey ? 1 : DIMMED))
    g.selectAll<SVGGElement, string>('.legend-item')
      .transition().duration(200)
      .style('opacity', d => (!hoveredKey || d === hoveredKey ? 1 : DIMMED))
  }

  // Layers, keyed by stack key so they persist across renders
  const layerGroups = g
    .selectAll<SVGGElement, d3.Series<Record<string, number>, string>>('.layer')
    .data(series, d => d.key)
    .join(
      enter => enter.append('g').attr('class', 'layer'),
      update => update,
      exit => exit.transition(t).attr('opacity', 0).remove()
    )
    .attr('fill', d => data.colorMap[d.key] || '#999')

  layerGroups.each(function (layerData) {
    const layer = d3.select(this)
    const layerKey = layerData.key

    layer
      .selectAll<SVGRectElement, d3.SeriesPoint<Record<string, number>>>('rect')
      .data(layerData, d => String(d.data.year))
      .join(
        enter =>
          enter
            .append('rect')
            .attr('x', d => xScale(String(d.data.year)) || 0)
            .attr('y', height)
            .attr('width', xScale.bandwidth())
            .attr('height', 0)
            .call(sel => sel.transition(t)
              .attr('y', d => yScale(d[1]))
              .attr('height', d => yScale(d[0]) - yScale(d[1]))),
        update =>
          update.call(sel => sel.transition(t)
            .attr('x', d => xScale(String(d.data.year)) || 0)
            .attr('y', d => yScale(d[1]))
            .attr('width', xScale.bandwidth())
            .attr('height', d => yScale(d[0]) - yScale(d[1]))),
        exit => exit.transition(t).attr('height', 0).attr('y', height).remove()
      )
      .on('mouseover', function (event, d) {
        highlightLayer(layerKey)
        lastMouseX = event.pageX
        lastMouseY = event.pageY
        hovered = {
          row: d,
          layerKey,
          year: d.data.year,
          miscEntries: buildMiscEntries(d.data.year)
        }
        miscPhase = 'collapsed'
        clearMiscTimers()
        tooltip.style('opacity', 1).style('pointer-events', 'auto')
        renderTooltipHtml()
        startMiscSequence()
      })
      .on('mousemove', function (event) {
        lastMouseX = event.pageX
        lastMouseY = event.pageY
        clearMiscTimers()
        // If we were mid-countdown or already expanded, revert to collapsed.
        if (miscPhase !== 'collapsed') {
          miscPhase = 'collapsed'
          renderTooltipHtml()
        } else {
          positionTooltip({ pageX: lastMouseX, pageY: lastMouseY })
        }
        startMiscSequence()
      })
      .on('mouseout', () => {
        highlightLayer(null)
        clearMiscTimers()
        hovered = null
        miscPhase = 'collapsed'
        tooltip.style('opacity', 0).style('pointer-events', 'none')
      })

    // Inline value labels for tall enough segments
    const minH = 22
    layer
      .selectAll<SVGTextElement, d3.SeriesPoint<Record<string, number>>>('.bar-label')
      .data(
        layerData.filter(d => yScale(d[0]) - yScale(d[1]) >= minH && xScale.bandwidth() >= 35),
        d => String(d.data.year)
      )
      .join(
        enter =>
          enter
            .append('text')
            .attr('class', 'bar-label')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', labelColor(data.colorMap[layerKey] || '#999'))
            .style('pointer-events', 'none')
            .attr('x', d => (xScale(String(d.data.year)) || 0) + xScale.bandwidth() / 2)
            .attr('y', d => yScale(d[1]) + (yScale(d[0]) - yScale(d[1])) / 2)
            .attr('opacity', 0)
            .text(d => formatCurrency(d[1] - d[0]))
            .call(sel => sel.transition(t).attr('opacity', 1)),
        update =>
          update
            .text(d => formatCurrency(d[1] - d[0]))
            .call(sel => sel.transition(t)
              .attr('opacity', 1)
              .attr('x', d => (xScale(String(d.data.year)) || 0) + xScale.bandwidth() / 2)
              .attr('y', d => yScale(d[1]) + (yScale(d[0]) - yScale(d[1])) / 2)),
        exit => exit.transition(t).attr('opacity', 0).remove()
      )
  })

  // X axis
  g.selectAll<SVGGElement, null>('.x-axis')
    .data([null])
    .join(
      enter =>
        enter.append('g').attr('class', 'x-axis')
          .attr('transform', `translate(0,${height})`)
          .call(d3.axisBottom(xScale) as any),
      update =>
        update.transition(t)
          .attr('transform', `translate(0,${height})`)
          .call(d3.axisBottom(xScale) as any) as any
    )

  // Y axis
  g.selectAll<SVGGElement, null>('.y-axis')
    .data([null])
    .join(
      enter =>
        enter.append('g').attr('class', 'y-axis')
          .call(d3.axisLeft(yScale).ticks(6).tickFormat(formatCurrency as any) as any),
      update =>
        update.transition(t).call(
          d3.axisLeft(yScale).ticks(6).tickFormat(formatCurrency as any) as any
        ) as any
    )

  // Legend (centered, wraps). Clickable: click pins a key to the stack bottom.
  let legendGroup = g.select<SVGGElement>('.legend')
  if (legendGroup.empty()) {
    legendGroup = g.append('g').attr('class', 'legend')
  }
  legendGroup.attr('transform', `translate(0, ${height + 40})`)

  const swatch = 12, gap = 4, itemGap = 16, rowH = 22
  const lockIconWidth = 14

  const tmp = g.append('text').style('visibility', 'hidden')
  const widths = data.legendKeys.map(k => {
    tmp.text(k)
    const textW = (tmp.node() as SVGTextElement).getComputedTextLength()
    const extra = k === pinnedKey ? lockIconWidth : 0
    return swatch + gap + textW + extra + itemGap
  })
  tmp.remove()

  const positions: { x: number; y: number }[] = []
  const rows: { start: number; end: number; w: number }[] = []
  let curX = 0, row = 0, rowStart = 0
  for (let i = 0; i < data.legendKeys.length; i++) {
    if (curX + widths[i] - itemGap > width && curX > 0) {
      rows.push({ start: rowStart, end: i - 1, w: curX - itemGap })
      row++; curX = 0; rowStart = i
    }
    positions.push({ x: curX, y: row * rowH })
    curX += widths[i]
  }
  rows.push({ start: rowStart, end: data.legendKeys.length - 1, w: curX - itemGap })
  for (const r of rows) {
    const offset = (width - r.w) / 2
    for (let i = r.start; i <= r.end; i++) positions[i].x += offset
  }

  const items = legendGroup
    .selectAll<SVGGElement, string>('.legend-item')
    .data(data.legendKeys, d => d)
    .join(
      enter => enter.append('g').attr('class', 'legend-item').attr('opacity', 0)
        .call(sel => sel.transition(t).attr('opacity', 1)),
      update => update,
      exit => exit.transition(t).attr('opacity', 0).remove()
    )
    .attr('transform', (_, i) => `translate(${positions[i].x}, ${positions[i].y})`)
    .style('cursor', 'pointer')
    .on('click', (_, d) => setPinnedKey(pinnedKey === d ? null : d))

  items.selectAll<SVGRectElement, string>('.legend-rect')
    .data(d => [d])
    .join('rect')
    .attr('class', 'legend-rect')
    .attr('width', swatch).attr('height', swatch).attr('rx', 2)
    .attr('fill', d => data.colorMap[d] || '#999')

  items.selectAll<SVGTextElement, string>('.legend-text')
    .data(d => [d])
    .join('text')
    .attr('class', 'legend-text')
    .attr('x', swatch + gap).attr('y', 11)
    .text(d => d)

  // Lock icon for the pinned key (joined per-item so it appears/disappears cleanly)
  items.selectAll<SVGGElement, string>('.lock-icon')
    .data(d => (d === pinnedKey ? [d] : []))
    .join(
      enter => {
        const icon = enter.append('g').attr('class', 'lock-icon')
        icon.append('path')
          .attr('d', 'M4 4V3a3 3 0 0 1 6 0v1h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h1zm1 0h4V3a2 2 0 0 0-4 0v1z')
          .attr('fill', '#697d8e')
        return icon
      },
      update => update,
      exit => exit.remove()
    )
    .attr('transform', function () {
      const textEl = (this.parentNode as SVGGElement).querySelector('.legend-text') as SVGTextElement
      const x = swatch + gap + (textEl ? textEl.getComputedTextLength() : 0) + 5
      return `translate(${x}, 1) scale(0.75)`
    })

  const neededHeight = margin.top + height + 40 + rows.length * rowH + 10
  if (neededHeight > containerHeight) svg.attr('height', neededHeight)
}
