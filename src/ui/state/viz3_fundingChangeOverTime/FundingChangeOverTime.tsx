import './FundingChangeOverTime.scss'

import _ from 'lodash'
import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, MenuItem, Select, FormControl, Checkbox, FormControlLabel, Typography } from '@mui/material'
import { ViewByDropdown } from '../../Dropdown'
import { useTooltipCleanup, useUrlParam, useVizSize } from '../../../hooks'
import { FUND_TYPES, FUND_TYPE_TO_COLOR, FundingSource } from '../../../constants'
import { formatCurrency } from '../../../util'
import { adjustForInflation } from '../../../cpi'
import { useSetParam } from '../../../embed/ParamContext'
import { DownloadDataButton } from '../../DownloadDataButton'

export function FundingChangeOverTime() {
  const setParam = useSetParam()
  useTooltipCleanup()

  const svgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const [adjustInflation, setAdjustInflation] = useState(true)
  const viewBy = useUrlParam('view-by', 'string', 'department') as 'area' | 'department'
  const selectedArea = useUrlParam('area', 'string', 'All')
  const selectedDepartment = useUrlParam('dept', 'string', 'All')

  const { areas, departments } = useMemo(() => {
    const areas = _.compact(_.uniq(window._data.map(d => d.area)))
    const departments = _.compact(_.uniq(window._data.map(d => d.department)))
    areas.sort()
    departments.sort()
    areas.unshift('All')
    departments.unshift('All')
    return { areas, departments }
  }, [window._data])

  // Hoisted out of the effect so the download exports exactly the rows the chart drew —
  // i.e. respecting the area/department selection.
  const filteredData = useMemo(() => {
    const isAll = viewBy === 'area' ? selectedArea === 'All' : selectedDepartment === 'All'
    return isAll
      ? window._data
      : window._data.filter(d => (viewBy === 'area' ? d.area === selectedArea : d.department === selectedDepartment))
  }, [viewBy, selectedArea, selectedDepartment, window._data])

  useEffect(() => {
    createChart(svgRef.current, filteredData, vizSize, adjustInflation)
  }, [filteredData, vizSize, adjustInflation])

  const selected = (viewBy === 'area' ? selectedArea : selectedDepartment) as string
  const download = useMemo(
    () => buildDownloadRows(filteredData, viewBy, selected, adjustInflation),
    [filteredData, adjustInflation, viewBy, selected]
  )

  return (
    <div className="FundingChangeOverTime fade-in">
      <Box p={2} display="flex" flexDirection="column" alignItems="center">
        <Box display="flex" alignItems="center" flexWrap="wrap" gap={3} mb={2}>
          <ViewByDropdown
            value={viewBy}
            onChange={e => {
              const value = e.target.value
              const params: any = {}
              if (value === 'area') {
                params.area = 'All'
                params.dept = null
              } else {
                params.area = null
                params.dept = 'All'
              }
              params['view-by'] = value
              setParam(params, null, { clear: true })
            }}
          />

          <FormControl size="small">
            <Select
              sx={{ height: 28, fontSize: '0.8125rem' }}
              value={viewBy === 'area' ? selectedArea : selectedDepartment}
              onChange={e => {
                const value = e.target.value
                const params: any = {}
                if (viewBy === 'area') {
                  params.area = value
                  params.dept = null
                } else {
                  params.area = null
                  params.dept = value
                }
                setParam(params, null, { clear: true })
              }}
              displayEmpty
            >
              {(viewBy === 'area' ? areas : departments).map(d => (
                <MenuItem key={d} value={d}>
                  {d === 'All' ? (viewBy === 'area' ? 'All Areas' : 'All Departments') : d}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox checked={adjustInflation} onChange={e => setAdjustInflation(e.target.checked)} size="small" />
            }
            label={<Typography variant="body2">Adjust for inflation (2025 dollars)</Typography>}
          />

          <DownloadDataButton
            filename={`state-funding-change-by-${viewBy}`}
            scope={download.scope}
            rows={download.rows}
          />
        </Box>
        <svg ref={svgRef}></svg>
      </Box>
    </div>
  )
}

/**
 * Total budget per fiscal year plus the year-over-year percent change — what the bars
 * encode. Exported shape is shared with the download so the CSV can't drift from the chart.
 */
export function aggregateByYear(data: Row[], adjustInflationFlag: boolean) {
  const years = Array.from(new Set(data.map(d => d.fiscal_year))).sort()

  const budgetData = years.map(year => {
    const yearData = data.filter(d => d.fiscal_year === year)
    const raw = d3.sum(yearData, d => d.budget)
    const totalBudget = adjustInflationFlag ? adjustForInflation(raw, year) : raw
    return { year, budget: totalBudget }
  })

  return budgetData.map((d, i) => {
    const prevBudget = i > 0 ? budgetData[i - 1].budget : 0
    const change = i > 0 && prevBudget > 0 ? ((d.budget - prevBudget) / prevBudget) * 100 : 0
    return { year: d.year, budget: d.budget, change }
  })
}

/** Fund type → CSV column name. */
const FUND_COLUMN: Record<string, string> = {
  [FundingSource.FEDERAL]: 'federal_funds',
  [FundingSource.STATE]: 'state_general_funds',
  [FundingSource.SPECIAL]: 'special_funds',
  [FundingSource.OTHER]: 'other_funds'
}

/**
 * CSV rows: one per fiscal year × group, carrying **both** encodings on screen — the bar
 * (total and its percent change) and the funding-source trend lines, as columns.
 *
 * Two things it does that the chart doesn't:
 *
 *  - **Breaks out every group when the dropdown is on "All".** Selecting a department is
 *    the user saying what they care about, so that filters the file; "All" is the *absence*
 *    of a choice, and collapsing it to one statewide total per year yields twelve rows that
 *    nobody can do anything with. The statewide rows the bars actually draw are kept too,
 *    labelled "All departments" / "All areas". That means totals and their parts share a
 *    column, so summing it naively double-counts — the label is the only guard, and it's
 *    worth it to keep what's on screen inside the file.
 *  - **Includes `other_funds`,** which the chart deliberately leaves out of the trend lines.
 *    It's part of the bar total, so without it the four source columns wouldn't sum to
 *    `total_budget` — and someone will check.
 *
 * Percent change is per group against its own prior year, and blank in the first year
 * rather than 0 (there's no prior year to have not changed from).
 */
export function buildDownloadRows(
  data: Row[],
  viewBy: 'area' | 'department',
  selected: string,
  adjustInflationFlag: boolean
) {
  const showAll = selected === 'All'
  const allLabel = viewBy === 'area' ? 'All areas' : 'All departments'

  // One pass: every row lands in its own group and, when nothing is selected, in the
  // statewide bucket as well.
  const byGroup = new Map<string, Map<number, { total: number; bySource: Record<string, number> }>>()
  for (const d of data) {
    const groups = showAll ? [allLabel, d[viewBy] || 'Unknown'] : [selected]
    for (const group of groups) {
      let years = byGroup.get(group)
      if (!years) byGroup.set(group, (years = new Map()))
      let totals = years.get(d.fiscal_year)
      if (!totals) years.set(d.fiscal_year, (totals = { total: 0, bySource: {} }))
      totals.total += d.budget || 0
      totals.bySource[d.funding_source] = (totals.bySource[d.funding_source] || 0) + (d.budget || 0)
    }
  }

  const order = showAll
    ? [allLabel, ..._.sortBy(Array.from(byGroup.keys()).filter(g => g !== allLabel))]
    : [selected]
  const adjust = (v: number, year: number) => (adjustInflationFlag ? adjustForInflation(v, year) : v)

  const rows = order.flatMap(group => {
    const years = byGroup.get(group)
    if (!years) return []
    let prior: number | null = null
    return _.sortBy(Array.from(years.keys())).map(year => {
      const totals = years.get(year)!
      const total = adjust(totals.total, year)
      const change = prior && prior > 0 ? ((total - prior) / prior) * 100 : ''
      prior = total
      return {
        fiscal_year: year,
        [viewBy]: group,
        total_budget: total,
        percent_change_vs_prior_year: change,
        ...Object.fromEntries(
          FUND_TYPES.map(ft => [FUND_COLUMN[ft], adjust(totals.bySource[ft] || 0, year)])
        ),
        inflation_adjusted: adjustInflationFlag ? '2025 dollars' : 'nominal'
      }
    })
  })

  const groupCount = order.length - (showAll ? 1 : 0)
  const scope = showAll
    ? `all ${groupCount} ${viewBy === 'area' ? 'areas' : 'departments'}, plus statewide totals`
    : `${viewBy}: ${selected}`

  return { rows, scope }
}

const POSITIVE_COLOR = '#09a7a6'
const NEGATIVE_COLOR = 'var(--orange-2)'

function createChart(
  svgEl: SVGSVGElement,
  data: Row[],
  vizSize: { width: number; height: number },
  adjustInflationFlag: boolean
) {
  // Set dimensions using vizSize
  const containerWidth = Math.max(vizSize.width, 550) - 30
  const containerHeight = vizSize.height - 130
  const margin = { top: 20, right: 100, bottom: 100, left: 80 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  const svg = d3.select(svgEl).attr('width', containerWidth).attr('height', containerHeight)

  // Get or create the main group
  let g = svg.select('.main-group')
  if (g.empty()) {
    g = svg.append('g').attr('class', 'main-group').attr('transform', `translate(${margin.left},${margin.top})`)
  } else {
    g.attr('transform', `translate(${margin.left},${margin.top})`)
  }

  const years = Array.from(new Set(data.map(d => d.fiscal_year))).sort()
  const changeData = aggregateByYear(data, adjustInflationFlag)

  // Calculate per-funding-source dollar amounts for trend lines (right Y axis)
  // Exclude "Other" fund type
  const trendFundTypes = FUND_TYPES.filter(ft => ft !== 'Other')
  const sourceDollarData = trendFundTypes.map(fundType => {
    const byYear = years.map(year => {
      const yearData = data.filter(d => d.fiscal_year === year && d.funding_source === fundType)
      const raw = d3.sum(yearData, d => d.budget)
      return { year, budget: adjustInflationFlag ? adjustForInflation(raw, year) : raw }
    })
    return { fundType, byYear }
  })

  // Create scales
  const xScale = d3.scaleBand().domain(years.map(String)).range([0, width]).padding(0.1)

  // Left Y axis: % change (symmetric around 0) for bars
  const barMax = Math.max(...changeData.map(d => Math.abs(d.change)), 10) * 1.3
  const yChangeScale = d3.scaleLinear().domain([-barMax, barMax]).range([height, 0])

  // Right Y axis: dollar amounts for trend lines — $0 aligns with 0% on left axis
  const allDollars = sourceDollarData.flatMap(s => s.byYear.map(d => d.budget))
  const dollarMax = (d3.max(allDollars) || 1) * 1.1
  const zeroY = yChangeScale(0)
  const yDollarScale = d3.scaleLinear().domain([0, dollarMax]).range([zeroY, 0])

  const t = svg.transition().duration(600).ease(d3.easeCubicInOut)

  // Remove old elements that are no longer needed
  g.selectAll('.budget-line').remove()
  g.selectAll('.budget-dot').remove()

  // Add clip path so trend lines are clipped to the chart area
  const clipId = 'chart-clip'
  let defs = svg.select<SVGDefsElement>('defs')
  if (defs.empty()) defs = svg.append('defs')
  defs.selectAll('clipPath').remove()
  defs
    .append('clipPath')
    .attr('id', clipId)
    .append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height)

  const DIMMED = 0.3

  // Highlight a specific element type, dimming everything else
  function highlight(hoveredKey: string | null) {
    // hoveredKey: 'bars' for bar hover, fundType string for trend line hover, null to reset
    g.selectAll('.change-bar')
      .transition()
      .duration(200)
      .style('opacity', !hoveredKey || hoveredKey === 'bars' ? 0.7 : DIMMED)

    trendFundTypes.forEach(ft => {
      const cls = `source-line-${ft.replace(/\s+/g, '-')}`
      const dotCls = `source-dot-${ft.replace(/\s+/g, '-')}`
      g.selectAll(`.${cls}`)
        .transition()
        .duration(200)
        .style('opacity', !hoveredKey || hoveredKey === ft ? 0.8 : DIMMED)
      g.selectAll(`.${dotCls}`)
        .transition()
        .duration(200)
        .style('opacity', !hoveredKey || hoveredKey === ft ? 0.8 : DIMMED)
      // Hit area matches visible line
      g.selectAll(`.${cls}-hit`)
        .transition()
        .duration(200)
        .style('opacity', !hoveredKey || hoveredKey === ft ? 0 : 0)
    })

    g.selectAll('.legend-item')
      .transition()
      .duration(200)
      .style('opacity', function () {
        const key = d3.select(this).attr('data-key')
        return !hoveredKey || key === hoveredKey ? 1 : DIMMED
      })
  }

  // Tooltip (ensure it exists)
  let tooltip = d3.select('body').select('.tooltip-yoy')
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('class', 'tooltip tooltip-yoy').style('opacity', 0)
  }

  // Add bars for budget changes
  g.selectAll('.change-bar')
    .data(changeData)
    .join(
      enter =>
        enter
          .append('rect')
          .attr('class', 'change-bar')
          .attr('x', d => xScale(String(d.year)) || 0)
          .attr('y', d => (d.change >= 0 ? yChangeScale(d.change) : yChangeScale(0)))
          .attr('width', xScale.bandwidth())
          .attr('height', d => Math.abs(yChangeScale(0) - yChangeScale(d.change)))
          .attr('fill', d => (d.change >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR))
          .attr('opacity', 0.7),
      update =>
        update
          .transition(t)
          .attr('x', d => xScale(String(d.year)) || 0)
          .attr('y', d => (d.change >= 0 ? yChangeScale(d.change) : yChangeScale(0)))
          .attr('width', xScale.bandwidth())
          .attr('height', d => Math.abs(yChangeScale(0) - yChangeScale(d.change)))
          .attr('fill', d => (d.change >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR)),
      exit => exit.transition(t).attr('opacity', 0).remove()
    )

  // Bar hover handlers
  g.selectAll('.change-bar')
    .on('mouseover', function (event, d: any) {
      highlight('bars')
      tooltip.transition().duration(200).style('opacity', 0.9)
      tooltip
        .html(
          `<strong>FY ${d.year}</strong><br/><div class="labelvalue2 cols-2"><span>Budget Change</span><span style="text-align:right;font-weight:600">${d3.format('.1f')(d.change)}%</span></div>`
        )
        .style('left', event.pageX + 10 + 'px')
        .style('top', event.pageY - 28 + 'px')
    })
    .on('mousemove', function (event) {
      tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 28 + 'px')
    })
    .on('mouseout', function () {
      highlight(null)
      tooltip.transition().duration(300).style('opacity', 0)
    })

  // Add funding source trend lines (dollar amounts, right Y axis)
  for (const { fundType, byYear } of sourceDollarData) {
    const color = FUND_TYPE_TO_COLOR[fundType] || '#999'
    const lineGen = d3
      .line<{ year: number; budget: number }>()
      .x(d => (xScale(String(d.year)) || 0) + xScale.bandwidth() / 2)
      .y(d => yDollarScale(d.budget))
      .curve(d3.curveMonotoneX)

    const className = `source-line-${fundType.replace(/\s+/g, '-')}`

    // Visible line
    g.selectAll(`.${className}`)
      .data([byYear])
      .join(
        enter =>
          enter
            .append('path')
            .attr('class', className)
            .attr('clip-path', `url(#${clipId})`)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4,3')
            .attr('opacity', 0.8)
            .attr('d', lineGen),
        update => update.transition(t).attr('d', lineGen).attr('stroke', color).attr('clip-path', `url(#${clipId})`),
        exit => exit.remove()
      )

    // Invisible wider hit area for easier hovering
    g.selectAll(`.${className}-hit`)
      .data([byYear])
      .join(
        enter =>
          enter
            .append('path')
            .attr('class', `${className}-hit`)
            .attr('clip-path', `url(#${clipId})`)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('d', lineGen),
        update => update.attr('d', lineGen),
        exit => exit.remove()
      )
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        highlight(fundType)
        // Find the nearest year to show its value
        const mouseX = event.offsetX - margin.left
        const nearest = d.reduce((best, pt) => {
          const px = (xScale(String(pt.year)) || 0) + xScale.bandwidth() / 2
          return Math.abs(px - mouseX) < Math.abs((xScale(String(best.year)) || 0) + xScale.bandwidth() / 2 - mouseX)
            ? pt
            : best
        })
        tooltip.transition().duration(200).style('opacity', 0.9)
        tooltip
          .html(
            `<strong>${fundType}</strong><br/><div class="labelvalue2 cols-2"><span>FY ${nearest.year}</span><span style="text-align:right;font-weight:600">${formatCurrency(nearest.budget)}</span></div>`
          )
          .style('left', event.pageX + 10 + 'px')
          .style('top', event.pageY - 28 + 'px')
      })
      .on('mousemove', function (event, d) {
        const mouseX = event.offsetX - margin.left
        const nearest = d.reduce((best, pt) => {
          const px = (xScale(String(pt.year)) || 0) + xScale.bandwidth() / 2
          return Math.abs(px - mouseX) < Math.abs((xScale(String(best.year)) || 0) + xScale.bandwidth() / 2 - mouseX)
            ? pt
            : best
        })
        tooltip
          .html(
            `<strong>${fundType}</strong><br/><div class="labelvalue2 cols-2"><span>FY ${nearest.year}</span><span style="text-align:right;font-weight:600">${formatCurrency(nearest.budget)}</span></div>`
          )
          .style('left', event.pageX + 10 + 'px')
          .style('top', event.pageY - 28 + 'px')
      })
      .on('mouseout', function () {
        highlight(null)
        tooltip.transition().duration(300).style('opacity', 0)
      })

    // Dot markers on trend lines
    const dotClass = `source-dot-${fundType.replace(/\s+/g, '-')}`
    g.selectAll(`.${dotClass}`)
      .data(byYear)
      .join(
        enter =>
          enter
            .append('circle')
            .attr('class', dotClass)
            .attr('clip-path', `url(#${clipId})`)
            .attr('cx', d => (xScale(String(d.year)) || 0) + xScale.bandwidth() / 2)
            .attr('cy', d => yDollarScale(d.budget))
            .attr('r', 2.5)
            .attr('fill', color)
            .attr('opacity', 0.8),
        update =>
          update
            .transition(t)
            .attr('cx', d => (xScale(String(d.year)) || 0) + xScale.bandwidth() / 2)
            .attr('cy', d => yDollarScale(d.budget))
            .attr('fill', color),
        exit => exit.remove()
      )
  }

  // Add x-axis
  g.selectAll('.x-axis')
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
          .call(d3.axisBottom(xScale) as any),
      exit => exit.transition(t).attr('opacity', 0).remove()
    )

  // Add left y-axis for % change
  const pctFmt = (n: number) => d3.format('+.0f')(n) + '%'

  g.selectAll('.y-axis-left')
    .data([null])
    .join(
      enter => {
        const axis = enter.append('g').attr('class', 'y-axis-left')
        axis.call(
          d3
            .axisLeft(yChangeScale)
            .ticks(6)
            .tickFormat(pctFmt as any)
        )
        axis
          .append('text')
          .attr('class', 'axis-label')
          .style('font-size', 'var(--font-size-sm)')
          .attr('transform', 'rotate(-90)')
          .attr('y', 0 - margin.left + 20)
          .attr('x', 0 - height / 2)
          .attr('dy', '1em')
          .style('text-anchor', 'middle')
          .text('% Change')
        return axis
      },
      update => {
        update.transition(t).call(
          d3
            .axisLeft(yChangeScale)
            .ticks(6)
            .tickFormat(pctFmt as any) as any
        )
        update
          .select('.axis-label')
          .transition(t)
          .attr('y', 0 - margin.left + 20)
          .attr('x', 0 - height / 2)
        return update
      }
    )

  // Add right y-axis for dollar amounts
  const dollarFmt = (n: number) => formatCurrency(n)

  g.selectAll('.y-axis-right')
    .data([null])
    .join(
      enter => {
        const axis = enter.append('g').attr('class', 'y-axis-right').attr('transform', `translate(${width}, 0)`)
        axis.call(
          d3
            .axisRight(yDollarScale)
            .ticks(6)
            .tickFormat(dollarFmt as any)
        )
        axis
          .append('text')
          .attr('class', 'axis-label')
          .style('font-size', 'var(--font-size-sm)')
          .attr('transform', 'rotate(90)')
          .attr('y', 0 - margin.right + 25)
          .attr('x', height / 2)
          .attr('dy', '1em')
          .style('text-anchor', 'middle')
          .text('Funding Amount $')
        return axis
      },
      update => {
        update
          .transition(t)
          .attr('transform', `translate(${width}, 0)`)
          .call(
            d3
              .axisRight(yDollarScale)
              .ticks(6)
              .tickFormat(dollarFmt as any) as any
          )
        update
          .select('.axis-label')
          .transition(t)
          .attr('y', 0 - margin.right + 25)
          .attr('x', height / 2)
        return update
      }
    )

  // Legend: bar legend on the left, line legend on the right
  g.selectAll('.legend').remove()

  const legendY = height + 55
  const legend = g.append('g').attr('class', 'legend').attr('transform', `translate(0, ${legendY})`)

  // Left side: "Budget Change" legend
  const leftLegend = legend.append('g').attr('class', 'legend-left')

  leftLegend
    .append('text')
    .attr('class', 'legend-text')
    .attr('y', -6)
    .style('font-size', 'var(--font-size-sm)')
    .style('font-weight', '600')
    .text('Budget Change')

  const barItems = [
    { label: 'Positive', color: POSITIVE_COLOR, key: 'bars' },
    { label: 'Negative', color: NEGATIVE_COLOR, key: 'bars' }
  ]
  let leftX = 0
  barItems.forEach(item => {
    const itemG = leftLegend
      .append('g')
      .attr('class', 'legend-item')
      .attr('data-key', item.key)
      .attr('transform', `translate(${leftX}, 8)`)
    itemG
      .append('rect')
      .attr('width', 12)
      .attr('height', 12)
      .attr('rx', 2)
      .attr('fill', item.color)
      .attr('opacity', 0.7)
    itemG.append('text').attr('x', 16).attr('y', 10).style('font-size', 'var(--font-size-sm)').text(item.label)
    // Measure for next item
    const textNode = itemG.select('text').node() as SVGTextElement
    leftX += 16 + (textNode ? textNode.getComputedTextLength() : 60) + 20
  })

  // Right side: "Funding Source" legend
  const rightLegend = legend.append('g').attr('class', 'legend-right')

  // Measure right legend total width first so we can right-align
  const tempG = legend.append('g').style('visibility', 'hidden')
  let rightTotalWidth = 0
  trendFundTypes.forEach(ft => {
    const t2 = tempG.append('text').style('font-size', 'var(--font-size-sm)').text(ft)
    rightTotalWidth += 20 + (t2.node() as SVGTextElement).getComputedTextLength() + 20
  })
  rightTotalWidth -= 20 // remove trailing gap
  tempG.remove()

  // Measure "Funding Source" title
  const titleTemp = legend
    .append('text')
    .style('font-size', 'var(--font-size-sm)')
    .style('font-weight', '600')
    .text('Funding Source')
    .style('visibility', 'hidden')
  const titleWidth = (titleTemp.node() as SVGTextElement).getComputedTextLength()
  titleTemp.remove()

  const rightGroupWidth = Math.max(rightTotalWidth, titleWidth)
  const rightStartX = width - rightGroupWidth

  rightLegend.attr('transform', `translate(${rightStartX}, 0)`)

  rightLegend
    .append('text')
    .attr('class', 'legend-text')
    .attr('y', -6)
    .style('font-size', 'var(--font-size-sm)')
    .style('font-weight', '600')
    .text('Funding Source')

  let rightX = 0
  trendFundTypes.forEach(ft => {
    const itemG = rightLegend
      .append('g')
      .attr('class', 'legend-item')
      .attr('data-key', ft)
      .attr('transform', `translate(${rightX}, 8)`)
    itemG
      .append('line')
      .attr('x1', 0)
      .attr('x2', 14)
      .attr('y1', 6)
      .attr('y2', 6)
      .attr('stroke', FUND_TYPE_TO_COLOR[ft])
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,3')
    itemG.append('text').attr('x', 18).attr('y', 10).style('font-size', 'var(--font-size-sm)').text(ft)
    const textNode = itemG.select('text').node() as SVGTextElement
    rightX += 18 + (textNode ? textNode.getComputedTextLength() : 60) + 20
  })
}
