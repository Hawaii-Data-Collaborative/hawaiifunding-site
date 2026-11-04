import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Checkbox, FormControlLabel, MenuItem, Select, Stack, Typography } from '@mui/material'
import { formatCurrency } from '../../util'
import { useContainerWidth, useTooltipCleanup, useVizSize } from '../../hooks'
import { CURRENT_FISCAL_YEAR, PALETTE_8 } from '../../constants'
import { CPI, adjustForInflation } from '../../cpi'
import { DownloadDataButton } from '../DownloadDataButton'
import type { MofRow, OverTimeRow } from '../../loadProgramData'
import { NominalYearsNote, SectionEmpty, SectionPanel } from './chrome'

/**
 * Budget Over Time — one bar per fiscal year of the program's final appropriation,
 * stacked by funding source.
 *
 * Mirrors the state viz's "Annual Appropriations by Funding Source": a program financed
 * from a single means of financing gets a solid bar, one financed from several gets a
 * stack. The "Filter by" dropdown switches to the two position counts, which have no
 * means-of-financing breakdown and so draw as plain bars.
 *
 * Two honesty details:
 *
 *  - The current and future fiscal years sit in a shaded band behind a dashed divider,
 *    lightened rather than recoloured, since fill already encodes funding source. This
 *    mirrors the state stacked bar, which QA round 2 asked it to match. FY naming is
 *    state-fiscal-year aware via CURRENT_FISCAL_YEAR — FY2027 began in July 2026, so it
 *    is the year we're *in*, not a future one.
 *  - Inflation adjustment can only reach years with published CPI. Later years are left
 *    nominal and named in a caption, rather than quietly mixing real and nominal dollars
 *    in one chart.
 */

type Measure = 'dollars' | 'perm_positions' | 'temp_positions'

const MEASURES: Array<{ value: Measure; label: string }> = [
  { value: 'dollars', label: 'Dollars' },
  { value: 'perm_positions', label: 'Permanent Positions' },
  { value: 'temp_positions', label: 'Temporary Positions' }
]

const POSITIONS_COLOR = '#0c5a9a'
const OTHER_KEY = 'Other'
/** Top N funding sources get their own colour; the rest roll up into "Other". */
const TOP_SOURCES = 7

interface StackYear {
  fiscal_year: number
  values: Record<string, number>
  total: number
}

interface ChartData {
  years: StackYear[]
  keys: string[]
  colorMap: Record<string, string>
  stacked: boolean
}

interface Props {
  rows: OverTimeRow[]
  mofByYear: MofRow[]
}

export function BudgetOverTime({ rows, mofByYear }: Props) {
  useTooltipCleanup()
  const svgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const [wrapRef, containerWidth] = useContainerWidth<HTMLDivElement>()
  const [measure, setMeasure] = useState<Measure>('dollars')
  // On by default, as on every state and federal chart — a decade of nominal dollars
  // overstates growth, and someone comparing pages shouldn't get different dollars.
  const [adjustInflation, setAdjustInflation] = useState(true)

  const isMoney = measure === 'dollars'

  const chartData = useMemo<ChartData>(() => {
    const adj = (v: number, year: number) => (adjustInflation ? adjustForInflation(v, year) : v)

    if (!isMoney) {
      const years = rows
        .filter(r => r[measure] > 0)
        .map(r => ({ fiscal_year: r.fiscal_year, values: { [measure]: r[measure] }, total: r[measure] }))
      return { years, keys: [measure], colorMap: { [measure]: POSITIONS_COLOR }, stacked: false }
    }

    // Rank funding sources by total across all years so colours stay stable per program,
    // then fold everything past the top N into a single "Other" band.
    const totals = new Map<string, number>()
    for (const m of mofByYear) {
      totals.set(m.mof_description, (totals.get(m.mof_description) ?? 0) + adj(m.amount, m.fiscal_year))
    }
    const ranked = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)
    const top = ranked.slice(0, TOP_SOURCES)
    const rolled = ranked.length > TOP_SOURCES

    const byYear = new Map<number, StackYear>()
    for (const m of mofByYear) {
      const key = top.includes(m.mof_description) ? m.mof_description : OTHER_KEY
      let entry = byYear.get(m.fiscal_year)
      if (!entry) {
        entry = { fiscal_year: m.fiscal_year, values: {}, total: 0 }
        byYear.set(m.fiscal_year, entry)
      }
      const v = adj(m.amount, m.fiscal_year)
      entry.values[key] = (entry.values[key] ?? 0) + v
      entry.total += v
    }

    const keys = rolled ? [...top, OTHER_KEY] : top
    const colorMap: Record<string, string> = {}
    keys.forEach((k, i) => {
      colorMap[k] = k === OTHER_KEY ? PALETTE_8[PALETTE_8.length - 1] : PALETTE_8[i % (PALETTE_8.length - 1)]
    })

    return {
      years: Array.from(byYear.values())
        .filter(y => y.total > 0)
        .sort((a, b) => a.fiscal_year - b.fiscal_year),
      keys,
      colorMap,
      stacked: true
    }
  }, [rows, mofByYear, measure, isMoney, adjustInflation])

  useEffect(() => {
    if (!svgRef.current || !chartData.years.length || !containerWidth) return
    draw(svgRef.current, chartData, measure, containerWidth, vizSize.height)
  }, [chartData, measure, containerWidth, vizSize.height])

  const fyRange = rows.length ? `FY ${rows[0].fiscal_year}–${rows[rows.length - 1].fiscal_year}` : ''

  // Long-format download: one row per year × funding source, which stays useful in a
  // spreadsheet regardless of how the chart happened to be stacked.
  const downloadRows = useMemo(
    () =>
      chartData.years.flatMap(y =>
        chartData.keys
          .filter(k => (y.values[k] ?? 0) !== 0)
          .map(k => ({
            fiscal_year: y.fiscal_year,
            measure: MEASURES.find(m => m.value === measure)!.label,
            // Both columns are dropped rather than left blank when they don't apply: only
            // the dollar measures split by funding source, and only dollars can be
            // inflation-adjusted. A "nominal" column on a headcount export invites the
            // reader to wonder what the adjusted headcount would have been.
            ...(chartData.stacked ? { funding_source: k } : {}),
            amount: y.values[k],
            ...(isMoney ? { inflation_adjusted: adjustInflation ? '2025 dollars' : 'nominal' } : {})
          }))
      ),
    [chartData, measure, isMoney, adjustInflation]
  )

  // Years the CPI table can't reach, so the caption can name them instead of the chart
  // quietly mixing real and nominal dollars.
  const unadjustedYears = useMemo(
    () => (isMoney && adjustInflation ? chartData.years.filter(y => !CPI[y.fiscal_year]).map(y => y.fiscal_year) : []),
    [chartData, isMoney, adjustInflation]
  )

  return (
    // Just "Final Appropriations", per v3 — the year range used to follow it, and still
    // names the download's scope, but the axis already says which years these are.
    <SectionPanel title="Budget Over Time" meta="Final Appropriations">
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="center"
        gap={1.5}
        mb={1}
        flexWrap="wrap"
        rowGap={0.5}
      >
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Filter by</Typography>
          <Select
            value={measure}
            onChange={e => setMeasure(e.target.value as Measure)}
            size="small"
            sx={{ height: 30, background: 'white', minWidth: 200, fontSize: 14 }}
          >
            {MEASURES.map(m => (
              <MenuItem key={m.value} value={m.value} sx={{ fontSize: 14 }}>
                {m.label}
              </MenuItem>
            ))}
          </Select>
        </Stack>
        {isMoney && (
          <FormControlLabel
            control={
              <Checkbox
                checked={adjustInflation}
                onChange={e => setAdjustInflation(e.target.checked)}
                size="small"
              />
            }
            label={<Typography sx={{ fontSize: 13.5 }}>Adjust for inflation (2025 dollars)</Typography>}
          />
        )}
        <DownloadDataButton
          filename="program-budget-over-time"
          rows={downloadRows}
          scope={fyRange}
        />
      </Stack>

      {/* The wrapper stays mounted even with nothing to draw: it holds the ResizeObserver
          ref, and unmounting it on an empty measure left the observer watching a detached
          node, so switching back to a measure that *does* have data drew nothing. */}
      <Box ref={wrapRef} sx={{ width: '100%', display: 'flex', justifyContent: 'center', minHeight: 8 }}>
        {chartData.years.length > 0 && <svg ref={svgRef} />}
      </Box>

      {chartData.years.length === 0 && (
        <SectionEmpty>
          <Box component="span" sx={{ fontSize: 15 }}>
            No {MEASURES.find(m => m.value === measure)!.label.toLowerCase()} recorded for this program.
          </Box>
        </SectionEmpty>
      )}

      {/* The shaded band no longer gets a sentence of its own — its "Current FY" label
          carries that — so the only caption is the inflation caveat, boxed per v3. */}
      {chartData.years.length > 0 && <NominalYearsNote years={unadjustedYears} />}
    </SectionPanel>
  )
}

function fyNote(year: number): string {
  if (year === CURRENT_FISCAL_YEAR) return ' (Current FY)'
  if (year > CURRENT_FISCAL_YEAR) return ' (Future FY)'
  return ''
}

function draw(
  svgEl: SVGSVGElement,
  data: ChartData,
  measure: Measure,
  availableWidth: number,
  availableHeight: number
) {
  const isMoney = measure === 'dollars'
  const fmt = (v: number) => (isMoney ? formatCurrency(v) : d3.format(',.4~f')(v))

  const containerWidth = Math.max(availableWidth, 320)
  const containerHeight = Math.min(Math.max(availableHeight - 200, 300), 400)
  // `top` leaves room for the "Current FY" label, which sits above the plot area.
  const margin = { top: 30, right: 16, bottom: data.stacked ? 96 : 52, left: 78 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  const svg = d3.select(svgEl).attr('width', containerWidth).attr('height', containerHeight)
  let g = svg.select<SVGGElement>('.main-group')
  if (g.empty()) {
    g = svg.append('g').attr('class', 'main-group').attr('transform', `translate(${margin.left},${margin.top})`)
  }
  const t = svg.transition().duration(500).ease(d3.easeCubicInOut)

  const x = d3
    .scaleBand<string>()
    .domain(data.years.map(d => String(d.fiscal_year)))
    .range([0, width])
    .padding(0.2)
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data.years, d => d.total) || 0])
    .nice()
    .range([height, 0])

  let tooltip = d3.select<HTMLDivElement, unknown>('.tooltip-program-over-time')
  if (tooltip.empty()) {
    tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip tooltip-program-over-time tooltip-stacked-bar')
      .style('opacity', 0) as any
  }

  function position(event: { pageX: number; pageY: number }) {
    const rect = (tooltip.node() as HTMLElement).getBoundingClientRect()
    let left = event.pageX + 10
    let top = event.pageY - 10
    if (left + rect.width > window.scrollX + window.innerWidth) left = event.pageX - rect.width - 10
    if (top + rect.height > window.scrollY + window.innerHeight) top = event.pageY - rect.height - 10
    if (top < window.scrollY + 10) top = window.scrollY + 10
    tooltip.style('left', left + 'px').style('top', top + 'px')
  }

  function tooltipHtml(yr: StackYear): string {
    let html = `<div style="padding:2px 0"><strong>FY ${yr.fiscal_year}</strong><span style="opacity:.75">${fyNote(
      yr.fiscal_year
    )}</span></div>`
    if (data.stacked) {
      for (const k of data.keys) {
        const v = yr.values[k]
        if (!v) continue
        html += `<div class="labelvalue2 cols-3"><span style="color:${data.colorMap[k]}">●</span><span>${k}</span><span>${fmt(
          v
        )}</span></div>`
      }
      html += `<div class="labelvalue2 cols-2" style="border-top:1px solid #555;margin-top:4px;padding-top:4px"><span><strong>Total</strong></span><span><strong>${fmt(
        yr.total
      )}</strong></span></div>`
    } else {
      html += `<div class="labelvalue2 cols-2"><span>${
        MEASURES.find(m => m.value === measure)!.label
      }</span><span>${fmt(yr.total)}</span></div>`
    }
    return html
  }

  const series = d3
    .stack<StackYear>()
    .keys(data.keys)
    .value((d, key) => d.values[key] ?? 0)(data.years)

  const layers = g
    .selectAll<SVGGElement, d3.Series<StackYear, string>>('.layer')
    .data(series, d => d.key)
    .join(
      enter => enter.append('g').attr('class', 'layer'),
      update => update,
      exit => exit.remove()
    )
    .attr('fill', d => data.colorMap[d.key] || '#999')

  layers.each(function (layer) {
    d3.select(this)
      .selectAll<SVGRectElement, d3.SeriesPoint<StackYear>>('rect')
      .data(layer, d => String(d.data.fiscal_year))
      .join(
        enter =>
          enter
            .append('rect')
            .attr('x', d => x(String(d.data.fiscal_year)) || 0)
            .attr('width', x.bandwidth())
            .attr('y', height)
            .attr('height', 0)
            .style('opacity', d => (d.data.fiscal_year >= CURRENT_FISCAL_YEAR ? 0.6 : 1))
            .call(sel =>
              sel
                .transition(t)
                .attr('y', d => y(d[1]))
                .attr('height', d => Math.max(0, y(d[0]) - y(d[1])))
            ),
        update =>
          update.style('opacity', d => (d.data.fiscal_year >= CURRENT_FISCAL_YEAR ? 0.6 : 1)).call(sel =>
            sel
              .transition(t)
              .attr('x', d => x(String(d.data.fiscal_year)) || 0)
              .attr('width', x.bandwidth())
              .attr('y', d => y(d[1]))
              .attr('height', d => Math.max(0, y(d[0]) - y(d[1])))
          ),
        exit => exit.transition(t).attr('height', 0).attr('y', height).remove()
      )
      .on('mouseover', (event, d) => {
        tooltip.html(tooltipHtml(d.data)).style('opacity', 1)
        position(event)
      })
      .on('mousemove', event => position(event))
      .on('mouseout', () => tooltip.style('opacity', 0))
  })

  // Current / future fiscal years: shaded band, dashed divider and a "Current FY" label —
  // the same treatment as the state stacked bar (`viz1_stackedBar`), which QA round 2 asked
  // this chart to mirror. Bars inside the band are drawn at 0.6 opacity, as they are there.
  // Redrawn from scratch each pass rather than joined: there is at most one of each.
  g.selectAll('.current-fy-bg, .current-fy-divider, .current-fy-label').remove()

  const currentYears = data.years.filter(d => d.fiscal_year >= CURRENT_FISCAL_YEAR)
  const pastYears = data.years.filter(d => d.fiscal_year < CURRENT_FISCAL_YEAR)

  if (currentYears.length > 0 && pastYears.length > 0) {
    // Midway between the last past bar's right edge and the first current bar's left edge.
    const lastPast = x(String(pastYears[pastYears.length - 1].fiscal_year)) || 0
    const firstCurrent = x(String(currentYears[0].fiscal_year)) || 0
    const dividerX = (lastPast + x.bandwidth() + firstCurrent) / 2
    const bgX = dividerX - 1

    g.append('rect')
      .attr('class', 'current-fy-bg')
      .attr('x', bgX)
      .attr('y', -24)
      .attr('width', width - bgX + 8)
      .attr('height', height + 28)
      // A shade darker than viz1's `#f5f6f8`, which would vanish against the section band's
      // own `#f2f4f5` ground. This reads on both a banded section and a plain white one.
      .attr('fill', '#e8ebee')
      .attr('rx', 6)
      .lower()

    g.append('line')
      .attr('class', 'current-fy-divider')
      .attr('x1', dividerX)
      .attr('x2', dividerX)
      .attr('y1', -24)
      .attr('y2', height + 4)
      .attr('stroke', '#9ab')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '6,4')

    g.append('text')
      .attr('class', 'current-fy-label')
      .attr('x', bgX + 6)
      .attr('y', -12)
      .attr('text-anchor', 'start')
      .style('font-size', '10px')
      .style('fill', '#697d8e')
      .style('font-weight', '500')
      .style('letter-spacing', '0.03em')
      .text('Current FY')
  }

  g.selectAll<SVGGElement, null>('.x-axis')
    .data([null])
    .join(
      enter =>
        enter
          .append('g')
          .attr('class', 'x-axis')
          .attr('transform', `translate(0,${height})`)
          .call(d3.axisBottom(x).tickFormat(d => `FY ${d}`) as any),
      update =>
        update
          .transition(t)
          .attr('transform', `translate(0,${height})`)
          .call(d3.axisBottom(x).tickFormat(d => `FY ${d}`) as any) as any
    )
    .selectAll('text')
    .attr('transform', x.bandwidth() < 46 ? 'rotate(-40)' : null)
    .style('text-anchor', x.bandwidth() < 46 ? 'end' : 'middle')
    .attr('dx', x.bandwidth() < 46 ? '-0.5em' : null)
    .attr('dy', x.bandwidth() < 46 ? '0.15em' : '0.71em')

  g.selectAll<SVGGElement, null>('.y-axis')
    .data([null])
    .join(
      enter =>
        enter
          .append('g')
          .attr('class', 'y-axis')
          .call(d3.axisLeft(y).ticks(6).tickFormat(fmt as any) as any),
      update => update.transition(t).call(d3.axisLeft(y).ticks(6).tickFormat(fmt as any) as any) as any
    )

  g.selectAll<SVGTextElement, null>('.y-label')
    .data([null])
    .join('text')
    .attr('class', 'y-label axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('y', -margin.left + 14)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px')
    .text(isMoney ? 'Appropriation' : 'Positions (FTE)')

  // Legend, only when stacked — a single measure needs no key.
  let legend = g.select<SVGGElement>('.legend')
  if (legend.empty()) legend = g.append('g').attr('class', 'legend')
  legend.attr('transform', `translate(0,${height + (x.bandwidth() < 46 ? 56 : 38)})`)

  const entries = data.stacked ? data.keys : []
  const swatch = 12
  const gap = 4
  const itemGap = 14
  const rowH = 18

  const probe = g.append('text').style('visibility', 'hidden')
  const widths = entries.map(e => {
    probe.text(e)
    return swatch + gap + (probe.node() as SVGTextElement).getComputedTextLength() + itemGap
  })
  probe.remove()

  const positions: Array<{ x: number; y: number }> = []
  const rowsMeta: Array<{ start: number; end: number; w: number }> = []
  let curX = 0
  let row = 0
  let rowStart = 0
  for (let i = 0; i < entries.length; i++) {
    if (curX + widths[i] - itemGap > width && curX > 0) {
      rowsMeta.push({ start: rowStart, end: i - 1, w: curX - itemGap })
      row++
      curX = 0
      rowStart = i
    }
    positions.push({ x: curX, y: row * rowH })
    curX += widths[i]
  }
  if (entries.length) rowsMeta.push({ start: rowStart, end: entries.length - 1, w: curX - itemGap })
  for (const r of rowsMeta) {
    const offset = (width - r.w) / 2
    for (let i = r.start; i <= r.end; i++) positions[i].x += offset
  }

  const items = legend
    .selectAll<SVGGElement, string>('.legend-item')
    .data(entries, d => d)
    .join(
      enter => enter.append('g').attr('class', 'legend-item'),
      update => update,
      exit => exit.remove()
    )
    .attr('transform', (_, i) => `translate(${positions[i].x},${positions[i].y})`)

  items.selectAll('*').remove()
  items.each(function (d) {
    const item = d3.select(this)
    item.append('rect').attr('width', swatch).attr('height', swatch).attr('rx', 2).attr('fill', data.colorMap[d])
    item.append('text').attr('class', 'legend-text').attr('x', swatch + gap).attr('y', 10).text(d)
  })

  const needed = margin.top + height + (x.bandwidth() < 46 ? 56 : 38) + rowsMeta.length * rowH + 12
  if (needed > containerHeight) svg.attr('height', needed)
}
