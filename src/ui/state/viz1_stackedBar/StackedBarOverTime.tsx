import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, ButtonGroup, Button, Checkbox, FormControlLabel, Typography } from '@mui/material'
import { FUND_TYPES, FUND_TYPE_TO_COLOR, PALETTE_6, PALETTE_7, CURRENT_YEAR } from '../../../constants'
import { formatCurrency } from '../../../util'
import { useTooltipCleanup, useVizSize } from '../../../hooks'
import { adjustForInflation } from '../../../cpi'
import { DownloadDataButton } from '../../DownloadDataButton'

// Returns 'white' or '#153750' depending on background luminance
function labelColor(bgHex: string): string {
  const c = d3.color(bgHex)
  if (!c) return 'white'
  const { r, g, b } = c.rgb()
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#153750' : 'white'
}

export type StackedBarMode = 'source' | 'area' | 'department'

export function StackedBarOverTime({ lockedMode }: { lockedMode?: StackedBarMode } = {}) {
  useTooltipCleanup()

  const svgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const [internalMode, setMode] = useState<StackedBarMode>('source')
  const mode = lockedMode ?? internalMode
  const [adjustInflation, setAdjustInflation] = useState(true)
  const [pinnedKey, setPinnedKey] = useState<string | null>(null)
  const data = window._data

  const chartData = useMemo(() => {
    const years = Array.from(new Set(data.map(d => d.fiscal_year))).sort((a, b) => a - b)

    if (mode === 'source') {
      // Group by year → funding source
      let sourceKeys = [...FUND_TYPES]
      if (pinnedKey && sourceKeys.includes(pinnedKey)) {
        sourceKeys = [pinnedKey, ...sourceKeys.filter(k => k !== pinnedKey)]
      }
      return {
        years,
        keys: sourceKeys,
        legendKeys: [...FUND_TYPES],
        colorMap: { ...FUND_TYPE_TO_COLOR } as Record<string, string>,
        otherKeys: [],
        otherBreakdown: {},
        stacks: years.map(year => {
          const yearData = data.filter(d => d.fiscal_year === year)
          const row: Record<string, number> = { year }
          for (const ft of FUND_TYPES) {
            const raw = d3.sum(
              yearData.filter(d => d.funding_source === ft),
              d => d.budget
            )
            row[ft] = adjustInflation ? adjustForInflation(raw, year) : raw
          }
          return row
        })
      }
    }

    // Group by year → area or department
    const field = mode === 'area' ? 'area' : 'department'
    const allKeys = Array.from(new Set(data.map(d => d[field]))).filter(Boolean)

    // Compute totals for sorting and category limiting
    const totals: Record<string, number> = {}
    for (const key of allKeys) {
      totals[key] = d3.sum(
        data.filter(d => d[field] === key),
        d => d.budget
      )
    }
    const sortedByTotal = [...allKeys].sort((a, b) => totals[b] - totals[a])

    // Limit categories: top N-1 + "Other" (N = palette size)
    const palette = mode === 'area' ? PALETTE_6 : PALETTE_7
    const maxCategories = palette.length - 1 // last slot reserved for "Other"
    const topKeys = sortedByTotal.slice(0, maxCategories)
    const otherKeys = sortedByTotal.slice(maxCategories)
    const displayKeys = otherKeys.length > 0 ? [...topKeys, 'Other'] : topKeys

    // Stable color map: assign by total-descending rank, "Other" always gets last palette color
    const colorMap: Record<string, string> = {}
    topKeys.forEach((key, i) => {
      colorMap[key] = palette[i]
    })
    if (otherKeys.length > 0) {
      colorMap['Other'] = palette[palette.length - 1]
    }

    // Stacking order: sort by total descending, pinned key goes to bottom
    let stackKeys = [...displayKeys].sort((a, b) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return totals[b] - totals[a]
    })
    if (pinnedKey && stackKeys.includes(pinnedKey)) {
      stackKeys = [pinnedKey, ...stackKeys.filter(k => k !== pinnedKey)]
    }

    const otherBreakdown: Record<number, Record<string, number>> = {}
    const stacks = years.map(year => {
      const yearData = data.filter(d => d.fiscal_year === year)
      const row: Record<string, number> = { year }
      for (const key of topKeys) {
        const raw = d3.sum(
          yearData.filter(d => d[field] === key),
          d => d.budget
        )
        row[key] = adjustInflation ? adjustForInflation(raw, year) : raw
      }
      if (otherKeys.length > 0) {
        const raw = d3.sum(
          yearData.filter(d => otherKeys.includes(d[field])),
          d => d.budget
        )
        row['Other'] = adjustInflation ? adjustForInflation(raw, year) : raw
        // Break down "Other" by sub-key
        const sub: Record<string, number> = {}
        for (const ok of otherKeys) {
          const r = d3.sum(
            yearData.filter(d => d[field] === ok),
            d => d.budget
          )
          if (r > 0) sub[ok] = adjustInflation ? adjustForInflation(r, year) : r
        }
        otherBreakdown[year] = sub
      }
      return row
    })

    return {
      years,
      keys: stackKeys,
      legendKeys: displayKeys,
      colorMap,
      otherKeys,
      otherBreakdown,
      stacks
    }
  }, [data, mode, adjustInflation, pinnedKey])

  useEffect(() => {
    if (!svgRef.current || !chartData.stacks.length) return
    createStackedBarChart(svgRef.current, chartData, vizSize, CURRENT_YEAR, pinnedKey, setPinnedKey)
  }, [chartData, vizSize, pinnedKey])

  return (
    <div className="StackedBarOverTime fade-in">
      <Box p={2} display="flex" flexDirection="column" alignItems="center">
        <Box display="flex" alignItems="center" flexWrap="wrap" gap={3} mb={2}>
          {!lockedMode && (
            <ButtonGroup size="small" disableElevation>
              <Button variant={mode === 'source' ? 'contained' : 'outlined'} onClick={() => setMode('source')}>
                Source
              </Button>
              <Button variant={mode === 'area' ? 'contained' : 'outlined'} onClick={() => setMode('area')}>
                Area
              </Button>
              <Button variant={mode === 'department' ? 'contained' : 'outlined'} onClick={() => setMode('department')}>
                Department
              </Button>
            </ButtonGroup>
          )}

          <FormControlLabel
            control={
              <Checkbox checked={adjustInflation} onChange={e => setAdjustInflation(e.target.checked)} size="small" />
            }
            label={<Typography variant="body2">Adjust for inflation (2025 dollars)</Typography>}
          />

          {/* Long format (year × series) so the CSV is usable however the chart is stacked. */}
          <DownloadDataButton
            filename={`state-appropriations-by-${mode}`}
            scope={
              chartData.years.length
                ? `FY ${chartData.years[0]}\u2013${chartData.years[chartData.years.length - 1]}`
                : undefined
            }
            rows={chartData.stacks.flatMap((row: any) =>
              chartData.legendKeys
                .filter((k: string) => (row[k] || 0) !== 0)
                .map((k: string) => ({
                  fiscal_year: row.year,
                  [mode]: k,
                  amount: row[k],
                  inflation_adjusted: adjustInflation ? '2025 dollars' : 'nominal'
                }))
            )}
          />
        </Box>

        <Box display="flex" justifyContent="center">
          <svg ref={svgRef}></svg>
        </Box>
      </Box>
    </div>
  )
}

interface ChartData {
  years: number[]
  keys: string[] // stacking order (pinned key at bottom)
  legendKeys: string[] // display order for legend (always by total descending)
  colorMap: Record<string, string>
  otherKeys: string[] // individual items lumped into "Other"
  stacks: Record<string, number>[]
  otherBreakdown: Record<number, Record<string, number>> // year → { subKey → value }
}

function createStackedBarChart(
  svgEl: SVGSVGElement,
  data: ChartData,
  vizSize: { width: number; height: number },
  currentYear: number,
  pinnedKey: string | null,
  setPinnedKey: (key: string | null) => void
) {
  const containerWidth = Math.max(vizSize.width, 550) - 30
  const containerHeight = Math.max(vizSize.height - 130, 400)
  const margin = { top: 30, right: 20, bottom: 100, left: 80 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  const svg = d3.select(svgEl).attr('width', containerWidth).attr('height', containerHeight)

  let g = svg.select<SVGGElement>('.main-group')
  if (g.empty()) {
    g = svg.append('g').attr('class', 'main-group').attr('transform', `translate(${margin.left},${margin.top})`)
  }

  const t = svg.transition().duration(600).ease(d3.easeCubicInOut)

  // Scales
  const xScale = d3.scaleBand().domain(data.years.map(String)).range([0, width]).padding(0.15)

  const maxY =
    d3.max(data.stacks, row => {
      let sum = 0
      for (const key of data.keys) sum += row[key] || 0
      return sum
    }) || 0

  const yScale = d3.scaleLinear().domain([0, maxY]).range([height, 0])

  // Current session treatment: background, divider, and label for years >= currentYear
  const currentSessionYears = data.years.filter(y => y > currentYear)
  const pastYears = data.years.filter(y => y <= currentYear)

  // Remove old current-session elements before redrawing
  g.selectAll('.current-session-bg, .current-session-divider, .current-session-label').remove()

  if (currentSessionYears.length > 0 && pastYears.length > 0) {
    const firstCurrentYear = currentSessionYears[0]
    const lastPastYear = pastYears[pastYears.length - 1]

    const dividerX = (xScale(String(lastPastYear))! + xScale.bandwidth() + xScale(String(firstCurrentYear))!) / 2
    const bgX = dividerX - 1
    const bgWidth = width - bgX + 8

    // Light background behind current/future bars
    g.append('rect')
      .attr('class', 'current-session-bg')
      .attr('x', bgX)
      .attr('y', -25)
      .attr('width', bgWidth)
      .attr('height', height + 30)
      .attr('fill', '#f5f6f8')
      .attr('rx', 6)
      .lower() // send behind everything

    // Vertical divider line — thin, subtle
    g.append('line')
      .attr('class', 'current-session-divider')
      .attr('x1', dividerX)
      .attr('x2', dividerX)
      .attr('y1', -25)
      .attr('y2', height + 5)
      .attr('stroke', '#9ab')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '6,4')

    // Label in top-left corner of the background
    g.append('text')
      .attr('class', 'current-session-label')
      .attr('x', bgX + 6)
      .attr('y', -12)
      .attr('text-anchor', 'start')
      .style('font-size', '10px')
      .style('fill', '#697d8e')
      .style('font-weight', '500')
      .style('letter-spacing', '0.03em')
      .text('Current FY')
  }

  // Stack generator
  const stack = d3.stack<Record<string, number>>().keys(data.keys).order(d3.stackOrderNone)

  const series = stack(data.stacks)

  // Tooltip
  let tooltip = d3.select('.tooltip-stacked-bar')
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('class', 'tooltip tooltip-stacked-bar').style('opacity', 0)
  }

  const DIMMED = 0.3

  // Highlight a single layer key (or restore all if null)
  function highlightLayer(hoveredKey: string | null) {
    g.selectAll<SVGGElement, d3.Series<Record<string, number>, string>>('.layer')
      .transition()
      .duration(200)
      .style('opacity', d => (!hoveredKey || d.key === hoveredKey ? 1 : DIMMED))

    g.selectAll<SVGGElement, string>('.legend-item')
      .transition()
      .duration(200)
      .style('opacity', d => (!hoveredKey || d === hoveredKey ? 1 : DIMMED))
  }

  // Position tooltip so it never overflows the viewport
  function positionTooltip(tip: d3.Selection<any, any, any, any>, event: MouseEvent) {
    const node = tip.node() as HTMLElement
    const rect = node.getBoundingClientRect()
    const pad = 10

    let left = event.pageX + pad
    let top = event.pageY - pad

    // Flip left if overflowing right edge
    if (left + rect.width > window.scrollX + window.innerWidth) {
      left = event.pageX - rect.width - pad
    }
    // Flip up if overflowing bottom edge
    if (top + rect.height > window.scrollY + window.innerHeight) {
      top = event.pageY - rect.height - pad
    }
    // Clamp to left/top edges
    if (left < window.scrollX + pad) left = window.scrollX + pad
    if (top < window.scrollY + pad) top = window.scrollY + pad

    tip.style('left', left + 'px').style('top', top + 'px')
  }

  // Draw stacked bars
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
            .style('opacity', d => (d.data.year > currentYear ? 0.6 : 1))
            .transition(t)
            .attr('y', d => yScale(d[1]))
            .attr('height', d => yScale(d[0]) - yScale(d[1])),
        update =>
          update
            .style('opacity', d => (d.data.year > currentYear ? 0.6 : 1))
            .transition(t)
            .attr('x', d => xScale(String(d.data.year)) || 0)
            .attr('y', d => yScale(d[1]))
            .attr('width', xScale.bandwidth())
            .attr('height', d => yScale(d[0]) - yScale(d[1])),
        exit => exit.transition(t).attr('height', 0).attr('y', height).remove()
      )
      .on('mouseover', function (event, d) {
        highlightLayer(layerKey)

        const year = d.data.year
        let html = `<div style="padding:5px 0"><strong>FY ${year}</strong></div>`
        // Show all categories for this year
        for (const key of [...data.legendKeys].reverse()) {
          const val = d.data[key] || 0
          if (val > 0) {
            const color = data.colorMap[key] || '#999'
            const dimStyle = key !== layerKey ? 'opacity:0.5' : ''
            html += `<div class="labelvalue2 cols-3" style="${dimStyle}"><span style="color:${color}">\u25CF</span> <span>${key}</span><span>${formatCurrency(val)}</span></div>`
            // Show "Other" sub-items indented
            if (key === 'Other' && data.otherBreakdown[year]) {
              const subs = Object.entries(data.otherBreakdown[year]).sort((a, b) => b[1] - a[1])
              for (const [subKey, subVal] of subs) {
                html += `<div class="labelvalue2 cols-2" style="${dimStyle};padding-left:30px;"></span> <span>${subKey}</span><span style="text-align:right;font-weight:600">${formatCurrency(subVal)}</span></div>`
              }
            }
          }
        }
        const total = data.keys.reduce((sum, k) => sum + (d.data[k] || 0), 0)
        html += `<div class="labelvalue2 cols-2" style="border-top:1px solid #555;margin-top:4px;padding-top:4px"><span><strong>Total:</strong></span><span style="text-align:right"><strong>${formatCurrency(total)}</strong></span></div>`
        tooltip.style('opacity', 1).html(html)
        positionTooltip(tooltip, event)
      })
      .on('mousemove', function (event) {
        positionTooltip(tooltip, event)
      })
      .on('mouseout', function () {
        highlightLayer(null)
        tooltip.style('opacity', 0)
      })

    // Add $ labels inside bars if there's room
    const minHeightForLabel = 22
    layer
      .selectAll<SVGTextElement, d3.SeriesPoint<Record<string, number>>>('.bar-label')
      .data(
        layerData.filter(d => {
          const barHeight = yScale(d[0]) - yScale(d[1])
          return barHeight >= minHeightForLabel && xScale.bandwidth() >= 35
        }),
        d => String(d.data.year)
      )
      .join(
        enter =>
          enter
            .append('text')
            .attr('class', 'bar-label')
            .attr('text-anchor', 'middle')
            .attr('fill', labelColor(data.colorMap[layerKey] || '#999'))
            .style('pointer-events', 'none')
            .attr('dominant-baseline', 'central')
            .attr('x', d => (xScale(String(d.data.year)) || 0) + xScale.bandwidth() / 2)
            .attr('y', d => yScale(d[1]) + (yScale(d[0]) - yScale(d[1])) / 2)
            .attr('opacity', 0)
            .text(d => formatCurrency(d[1] - d[0]))
            .transition(t)
            .attr('opacity', 1),
        update =>
          update
            .transition(t)
            .attr('opacity', 1)
            .attr('x', d => (xScale(String(d.data.year)) || 0) + xScale.bandwidth() / 2)
            .attr('y', d => yScale(d[1]) + (yScale(d[0]) - yScale(d[1])) / 2)
            .text(d => formatCurrency(d[1] - d[0])),
        exit => exit.transition(t).attr('opacity', 0).remove()
      )
  })

  // Total labels above each bar (QA)
  // const totals = data.stacks.map(row => {
  //   let sum = 0
  //   for (const key of data.keys) sum += row[key] || 0
  //   return { year: row.year, total: sum }
  // })

  // g.selectAll<SVGTextElement, { year: number; total: number }>('.total-label')
  //   .data(totals, d => String(d.year))
  //   .join('text')
  //   .attr('class', 'total-label')
  //   .attr('text-anchor', 'middle')
  //   .attr('x', d => (xScale(String(d.year)) || 0) + xScale.bandwidth() / 2)
  //   .attr('y', d => yScale(d.total) - 6)
  //   .text(d => {
  //     const fmt = d3.format('$.3s')
  //     return fmt(d.total).toUpperCase().replace('G', 'B')
  //   })

  // X axis
  g.selectAll<SVGGElement, null>('.x-axis')
    .data([null])
    .join(
      enter =>
        enter
          .append('g')
          .attr('class', 'x-axis')
          .attr('transform', `translate(0,${height})`)
          .call(d3.axisBottom(xScale) as any),
      update =>
        update
          .transition(t)
          .attr('transform', `translate(0,${height})`)
          .call(d3.axisBottom(xScale) as any)
    )

  // Y axis
  const yFmt = (n: number) => formatCurrency(n)
  g.selectAll<SVGGElement, null>('.y-axis')
    .data([null])
    .join(
      enter =>
        enter
          .append('g')
          .attr('class', 'y-axis')
          .call(
            d3
              .axisLeft(yScale)
              .ticks(6)
              .tickFormat(yFmt as any) as any
          ),
      update =>
        update.transition(t).call(
          d3
            .axisLeft(yScale)
            .ticks(6)
            .tickFormat(yFmt as any) as any
        )
    )

  // Legend
  const legendY = height + 40
  let legendGroup = g.select<SVGGElement>('.legend')
  if (legendGroup.empty()) {
    legendGroup = g.append('g').attr('class', 'legend')
  }
  legendGroup.attr('transform', `translate(0, ${legendY})`)

  // Measure text widths to compute dynamic legend layout
  const swatchSize = 12
  const lockIconWidth = 14
  const swatchGap = 4 // gap between swatch and text
  const itemGap = 16 // gap between legend items
  const rowHeight = 20

  // Create a temporary text element to measure widths
  const tempText = g.append('text').style('font-size', 'var(--font-size-sm)').style('visibility', 'hidden')
  const itemWidths = data.legendKeys.map(key => {
    tempText.text(key)
    const textWidth = (tempText.node() as SVGTextElement).getComputedTextLength()
    const extra = key === pinnedKey ? lockIconWidth : 0
    return swatchSize + swatchGap + textWidth + extra + itemGap
  })
  tempText.remove()

  // Lay items out row by row, wrapping when width is exceeded — then center each row
  const positions: { x: number; y: number }[] = []
  const rows: { start: number; end: number; totalWidth: number }[] = []
  let curX = 0
  let curRow = 0
  let rowStart = 0
  for (let i = 0; i < data.legendKeys.length; i++) {
    if (curX + itemWidths[i] - itemGap > width && curX > 0) {
      rows.push({ start: rowStart, end: i - 1, totalWidth: curX - itemGap })
      curRow++
      curX = 0
      rowStart = i
    }
    positions.push({ x: curX, y: curRow * rowHeight })
    curX += itemWidths[i]
  }
  rows.push({ start: rowStart, end: data.legendKeys.length - 1, totalWidth: curX - itemGap })

  // Center each row
  for (const row of rows) {
    const offset = (width - row.totalWidth) / 2
    for (let i = row.start; i <= row.end; i++) {
      positions[i].x += offset
    }
  }

  const legendItems = legendGroup
    .selectAll<SVGGElement, string>('.legend-item')
    .data(data.legendKeys, d => d)
    .join(
      enter => enter.append('g').attr('class', 'legend-item').attr('opacity', 0).transition(t).attr('opacity', 1),
      update => update,
      exit => exit.transition(t).attr('opacity', 0).remove()
    )
    .attr('transform', (_, i) => `translate(${positions[i].x}, ${positions[i].y})`)
    .style('cursor', 'pointer')
    .on('click', function (_, d) {
      setPinnedKey(pinnedKey === d ? null : d)
    })

  legendItems
    .selectAll<SVGRectElement, string>('.legend-rect')
    .data(d => [d])
    .join('rect')
    .attr('class', 'legend-rect')
    .attr('width', swatchSize)
    .attr('height', swatchSize)
    .attr('rx', 2)
    .attr('fill', d => data.colorMap[d] || '#999')

  legendItems
    .selectAll<SVGTextElement, string>('.legend-text')
    .data(d => [d])
    .join('text')
    .attr('class', 'legend-text')
    .attr('x', swatchSize + swatchGap)
    .attr('y', 10)
    .style('font-size', 'var(--font-size-sm)')
    .text(d => d)

  // Lock icon for pinned key (SVG path)
  legendItems
    .selectAll<SVGGElement, string>('.lock-icon')
    .data(d => (d === pinnedKey ? [d] : []))
    .join(
      enter => {
        const icon = enter.append('g').attr('class', 'lock-icon')
        icon
          .append('path')
          .attr(
            'd',
            'M4 4V3a3 3 0 0 1 6 0v1h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h1zm1 0h4V3a2 2 0 0 0-4 0v1z'
          )
          .attr('fill', '#697d8e')
        icon.attr('transform', 'scale(0.85)')
        return icon
      },
      update => update,
      exit => exit.remove()
    )
    .attr('transform', function () {
      const textEl = (this as SVGGElement).parentNode!.querySelector('.legend-text') as SVGTextElement
      const x = textEl ? swatchSize + swatchGap + textEl.getComputedTextLength() + 5 : 0
      return `translate(${x}, 0) scale(0.85)`
    })

  // Resize SVG height to fit all legend rows
  const legendRows = rows.length
  const neededHeight = margin.top + height + 40 + legendRows * rowHeight + 10
  if (neededHeight > containerHeight) {
    svg.attr('height', neededHeight)
  }
}
