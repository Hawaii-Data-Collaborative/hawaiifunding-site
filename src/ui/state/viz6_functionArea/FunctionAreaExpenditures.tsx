import './FunctionAreaExpenditures.scss'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef } from 'react'
import { Box, Typography } from '@mui/material'
import { YearSlider } from '../../YearSlider'
import { ViewByDropdown, SortByDropdown } from '../../Dropdown'
import { FundTypeLegend } from '../../FundTypeLegend'
import { formatCurrency } from '../../../util'
import { Chart, FUND_TYPE_TO_COLOR, FUND_TYPES } from '../../../constants'
import { useTooltipCleanup, useUrlParam, useVizSize } from '../../../hooks'
import { useSetParam } from '../../../embed/ParamContext'
import { DownloadDataButton } from '../../DownloadDataButton'
import { labelled, stateBudgetRows } from '../stateDownloadRows'

export function FunctionAreaExpenditures() {
  const setParam = useSetParam()
  useTooltipCleanup()

  const ref = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const year = useUrlParam<number>('year', 'number', 2025)
  const viewBy = useUrlParam('view-by', 'string', 'department') as 'area' | 'department'
  const sortBy = useUrlParam('sort-by', 'string', 'value') as 'label' | 'value'
  const data = window._data
  const [yearMin, yearMax] = d3.extent(data, d => d.fiscal_year)

  const chartData: ChartData = useMemo(() => {
    const filteredData = data.filter(d => d.fiscal_year === year)
    if (viewBy === 'department') {
      filteredData.sort((a, b) => a.department.localeCompare(b.department))
    }

    const grouped = d3.group(
      filteredData,
      d => (viewBy === 'area' ? d.area : d.department),
      d => d.funding_source
    )

    // Convert to array for sorting
    const entries = Array.from(grouped.entries())

    if (sortBy === 'label') {
      // Sort alphabetically by label
      entries.sort((a, b) => a[0].localeCompare(b[0]))
    } else {
      // Sort by total value (descending)
      entries.sort((a, b) => {
        const totalA = d3.sum(Array.from(a[1].values()).flat(), d => d.budget)
        const totalB = d3.sum(Array.from(b[1].values()).flat(), d => d.budget)
        return totalB - totalA
      })
    }

    // Convert back to Map
    return new Map(entries)
  }, [data, year, viewBy, sortBy])

  const onClick = (params: any) => {
    const div = document.querySelector('.FunctionAreaExpenditures') as HTMLElement
    if (!div) {
      return
    }
    div.classList.add('dive-in')
    setTimeout(() => {
      setParam(params)
    }, 300)
  }

  useEffect(() => {
    createBarChart(ref.current, chartData, viewBy, vizSize, onClick)
  }, [ref.current, chartData, vizSize, viewBy])

  return (
    <div className="FunctionAreaExpenditures fade-in">
      <Box p={2}>
        <Typography variant="h6" textAlign="center" mb={0.5}>
          FY{year} {viewBy === 'area' ? 'Budget Area' : 'Department'} by Funding Source
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" mb={2} fontStyle="italic">
          Click any bar to see the {viewBy === 'area' ? 'departments' : 'programs'} within. Hover for exact amounts.
        </Typography>

        <Box display="flex" alignItems="flex-end" justifyContent="center" gap={4} mb={2}>
          <YearSlider
            value={year}
            onChange={e => setParam('year', e.target.value)}
            min={yearMin}
            max={yearMax}
            step={1}
          />
          <Box mb="3px">
            <ViewByDropdown value={viewBy} onChange={e => setParam('view-by', e.target.value)} />
          </Box>
          <Box mb="3px">
            <SortByDropdown value={sortBy} onChange={e => setParam('sort-by', e.target.value)} />
          </Box>
          <Box mb="3px">
            <DownloadDataButton
              filename={`state-expenditures-by-${viewBy}`}
              scope="all fiscal years"
              rows={labelled(stateBudgetRows({ groupBy: viewBy }), viewBy)}
            />
          </Box>
        </Box>

        <Box className="scroll-fade-wrapper">
          <Box
            sx={{
              overflowY: 'auto',
              overflowX: 'hidden',
              height: '50vh',
              display: 'flex',
              justifyContent: 'center'
            }}
          >
            <svg ref={ref}></svg>
          </Box>
        </Box>

        <FundTypeLegend />
      </Box>
    </div>
  )
}

type GroupedRows = d3.InternMap<Row['funding_source'], Row[]>
type ChartData = Map<string, GroupedRows> // key is either area or department

// Function to wrap text after a specified width
function wrapText(text: string, width: number, fontSize: number = 12): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = words[0]

  for (let i = 1; i < words.length; i++) {
    const word = words[i]
    const testLine = currentLine + ' ' + word
    // Approximate text width (rough estimation - you might want to use canvas for more accurate measurement)
    const testWidth = testLine.length * fontSize * 0.6 // Rough approximation

    if (testWidth > width && currentLine !== '') {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  lines.push(currentLine)
  return lines
}

export function createBarChart(
  svgEl: SVGSVGElement,
  data: ChartData,
  viewBy: 'area' | 'department',
  vizSize: { width: number; height: number },
  onClick: (params: any) => void
) {
  const barHeight = 30
  const width = vizSize.width - 30
  const legendOffsetScale = d3.scaleLinear().domain([0, data.size]).range([100, 60])
  const height = data.size * (barHeight + 10) + legendOffsetScale(data.size)
  const margin = { top: 20, right: 100, bottom: 60, left: 220 } // Increased bottom margin for legend

  const svg = d3.select(svgEl).attr('width', width).attr('height', height)

  // Get or create the main group
  let mainGroup = svg.select('.main-group')
  if (mainGroup.empty()) {
    mainGroup = svg.append('g').attr('class', 'main-group')
  }

  // Get or create tooltip div
  let tooltip = d3.selectAll('.tooltip-viz6')
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('class', 'tooltip tooltip-viz6').style('opacity', 0)
  }

  const max = d3.max(data, group => {
    let total = 0
    for (const [_, rows] of group[1].entries()) {
      total += d3.sum(rows, d => d.budget)
    }
    return total
  })

  const xScale = d3
    .scaleLinear()
    .domain([0, max])
    .range([0, width - margin.left - margin.right])

  // Create transition
  const t = svg.transition().duration(600).ease(d3.easeCubicInOut)

  // Convert data to array for easier manipulation
  const dataArray = Array.from(data.entries()).map(([group, groupedRows], i) => ({
    group,
    groupedRows,
    y: i * (barHeight + 10),
    total: d3.sum(Array.from(groupedRows.values()).flat(), d => d.budget)
  }))

  // Update bar groups with transitions
  const barGroups = mainGroup
    .selectAll<SVGGElement, (typeof dataArray)[0]>('.bar-group')
    .data(dataArray, d => d.group)
    .join(
      enter =>
        enter
          .append('g')
          .attr('class', 'bar-group')
          .attr('opacity', 0)
          .attr('transform', d => `translate(${margin.left}, ${d.y})`)
          .transition(t)
          .attr('opacity', 1),
      update =>
        update
          .attr('opacity', 1)
          .transition(t)
          .attr('transform', d => `translate(${margin.left}, ${d.y})`),
      exit => exit.transition(t).attr('opacity', 0).remove()
    )

  // Update bars within each group
  barGroups.each(function (d) {
    const g = d3.select(this)

    // Calculate segment data and sort by FUND_TYPES order
    const segments = Array.from(d.groupedRows.entries())
      .map(([fundType, rows]) => ({
        fundType,
        rows,
        color: FUND_TYPE_TO_COLOR[fundType],
        budget: d3.sum(rows, row => row.budget),
        offset: 0 // Will be set below
      }))
      .sort((a, b) => {
        const indexA = FUND_TYPES.indexOf(a.fundType)
        const indexB = FUND_TYPES.indexOf(b.fundType)
        return indexA - indexB
      })

    // Calculate cumulative offset for positioning
    let offset = 0
    segments.forEach(segment => {
      segment.offset = offset
      offset += segment.budget
    })

    // Update rectangles
    const rects = g
      .selectAll<SVGRectElement, (typeof segments)[0]>('rect')
      .data(segments, (segment: any) => segment.fundType)
      .join(
        enter =>
          enter
            .append('rect')
            .attr('rx', 1)
            .attr('ry', 1)
            .attr('x', d => xScale(d.offset))
            .attr('y', 0)
            .attr('width', d => xScale(d.budget))
            .attr('height', barHeight)
            .attr('fill', d => d.color)
            .attr('data-original-color', d => d.color)
            .style('cursor', 'pointer')
            .style('transition', 'fill 0.2s ease')
            .attr('opacity', 0)
            .transition(t)
            .attr('opacity', 1),
        update =>
          update
            .transition(t)
            .attr('x', d => xScale(d.offset))
            .attr('y', 0)
            .attr('width', d => xScale(d.budget))
            .attr('height', barHeight)
            .attr('fill', d => d.color)
            .attr('data-original-color', d => d.color)
            .attr('opacity', 1),
        exit => exit.transition(t).attr('opacity', 0).remove()
      )

    // Re-attach event handlers
    rects
      .on('mouseover', function (event) {
        const tooltipContent = generateTooltipContent(d.groupedRows)
        tooltip
          .style('opacity', 1)
          .html(tooltipContent)
          .style('left', event.pageX + 5 + 'px')
          .style('top', event.pageY + 20 + 'px')

        // Darken all segments in this stack on hover
        g.selectAll('rect').each(function () {
          const originalColor = d3.select(this).attr('data-original-color')
          const darkenedColor = d3.color(originalColor)?.darker(0.3)
          if (darkenedColor) {
            d3.select(this).attr('fill', darkenedColor.toString())
          }
        })
      })
      .on('mousemove', function (event) {
        tooltip.style('left', event.pageX + 5 + 'px').style('top', event.pageY + 20 + 'px')
      })
      .on('mouseout', function () {
        tooltip.style('opacity', 0)

        // Restore original colors for all segments in this stack
        g.selectAll('rect').each(function () {
          const originalColor = d3.select(this).attr('data-original-color')
          d3.select(this).attr('fill', originalColor)
        })
      })
      .on('mousedown', function () {
        // Apply even darker color to all segments in this stack on mousedown
        g.selectAll('rect').each(function () {
          const originalColor = d3.select(this).attr('data-original-color')
          const darkerColor = d3.color(originalColor)?.darker(0.6)
          if (darkerColor) {
            d3.select(this).attr('fill', darkerColor.toString())
          }
        })
      })
      .on('mouseup', function () {
        // Restore hover color to all segments in this stack on mouseup
        g.selectAll('rect').each(function () {
          const originalColor = d3.select(this).attr('data-original-color')
          const hoverColor = d3.color(originalColor)?.darker(0.3)
          if (hoverColor) {
            d3.select(this).attr('fill', hoverColor.toString())
          }
        })
      })
      .on('click', function () {
        if (viewBy === 'area') {
          onClick({ viz: Chart.FUNDING_BY_DEPT, area: d.group })
        } else {
          // Department path: go directly to program level
          onClick({ viz: Chart.FUNDING_BY_PROGRAM, dept: d.group })
        }
      })

    // Update total value text
    g.selectAll<SVGTextElement, number>('.total-text')
      .data([d.total])
      .join(
        enter =>
          enter
            .append('text')
            .attr('class', 'total-text')
            .style('font-size', '13px')
            .attr('opacity', 0)
            .attr('x', xScale(d.total) + 10)
            .attr('y', barHeight / 2 + 5)
            .text(formatCurrency(d.total))
            .transition(t)
            .attr('opacity', 1),
        update =>
          update
            .transition(t)
            .attr('x', xScale(d.total) + 10)
            .attr('y', barHeight / 2 + 5)
            .text(formatCurrency(d.total))
            .attr('opacity', 1),
        exit => exit.remove()
      )

    // Update label text
    const wrappedLines = wrapText(d.group, 220, 11)
    const lineHeight = 13

    const labelGroup = g
      .selectAll<SVGGElement, { lines: string[]; group: string }>('.label-group')
      .data([{ lines: wrappedLines, group: d.group }])
      .join(
        enter => enter.append('g').attr('class', 'label-group').attr('opacity', 0),
        update => update,
        exit => exit.remove()
      )

    labelGroup
      .attr(
        'transform',
        wrappedLines.length === 1
          ? `translate(-10, ${barHeight / 2 + 4})`
          : `translate(-10, ${barHeight / 2 - ((wrappedLines.length - 1) * lineHeight) / 2 + 4})`
      )
      .transition(t)
      .attr('opacity', 1)

    // Add tooltip events to label group
    labelGroup
      .on('mouseover', function (event: MouseEvent) {
        const tooltipContent = generateTooltipContent(d.groupedRows)
        tooltip
          .style('opacity', 1)
          .html(tooltipContent)
          .style('left', event.pageX + 5 + 'px')
          .style('top', event.pageY + 20 + 'px')

        g.selectAll('rect').each(function () {
          const originalColor = d3.select(this).attr('data-original-color')
          const darkenedColor = d3.color(originalColor)?.darker(0.3)
          if (darkenedColor) {
            d3.select(this).attr('fill', darkenedColor.toString())
          }
        })
      })
      .on('mousemove', function (event: MouseEvent) {
        tooltip.style('left', event.pageX + 5 + 'px').style('top', event.pageY + 20 + 'px')
      })
      .on('mouseout', function () {
        tooltip.style('opacity', 0)

        g.selectAll('rect').each(function () {
          const originalColor = d3.select(this).attr('data-original-color')
          d3.select(this).attr('fill', originalColor)
        })
      })

    // Update individual label lines
    labelGroup
      .selectAll<SVGTextElement, string>('.label-line')
      .data(wrappedLines, (line: any) => line)
      .join(
        enter =>
          enter
            .append('text')
            .attr('class', 'label-line link')
            .attr('text-anchor', 'end')
            .style('font-size', 'var(--font-size-sm)')
            .attr('x', 0)
            .attr('y', (_, i) => i * lineHeight)
            .text(d => d)
            .attr('opacity', 0)
            .on('click', function () {
              if (viewBy === 'area') {
                onClick({ viz: Chart.FUNDING_BY_DEPT, area: d.group })
              } else {
                onClick({ viz: Chart.FUNDING_BY_PROGRAM, dept: d.group })
              }
            })
            .transition(t)
            .attr('opacity', 1),
        update =>
          update
            .transition(t)
            .attr('x', 0)
            .attr('y', (_, i) => i * lineHeight)
            .text(d => d)
            .attr('opacity', 1),
        exit => exit.remove()
      )
  })

  // Update legend with transitions
  let legendGroup = svg.select('.legend')
  if (legendGroup.empty()) {
    legendGroup = svg
      .append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${margin.left}, ${height - margin.bottom + 10})`)
  } else {
    legendGroup.transition(t).attr('transform', `translate(${margin.left}, ${height - margin.bottom + 10})`)
  }

  const legendData = FUND_TYPES.map((fundType, i) => ({ fundType, color: FUND_TYPE_TO_COLOR[fundType], index: i }))

  // Measure text widths to compute dynamic legend layout
  const swatchSize = 15
  const swatchGap = 5
  const itemGap = 16
  const tempText = legendGroup.append('text').style('font-size', 'var(--font-size-sm)').style('visibility', 'hidden')
  const positions: number[] = []
  let curX = 0
  legendData.forEach(d => {
    positions.push(curX)
    tempText.text(d.fundType)
    const textWidth = (tempText.node() as SVGTextElement).getComputedTextLength()
    curX += swatchSize + swatchGap + textWidth + itemGap
  })
  tempText.remove()

  const legendItems = legendGroup
    .selectAll<SVGGElement, (typeof legendData)[0]>('.legend-item')
    .data(legendData, d => d.fundType)
    .join(
      enter =>
        enter
          .append('g')
          .attr('class', 'legend-item')
          .attr('transform', d => `translate(${positions[d.index]}, 0)`)
          .attr('opacity', 0)
          .transition(t)
          .attr('opacity', 1),
      update =>
        update
          .attr('opacity', 1)
          .transition(t)
          .attr('transform', d => `translate(${positions[d.index]}, 0)`),
      exit => exit.transition(t).attr('opacity', 0).remove()
    )

  // Update legend rectangles
  legendItems
    .selectAll<SVGRectElement, (typeof legendData)[0]>('.legend-rect')
    .data(d => [d])
    .join('rect')
    .attr('class', 'legend-rect')
    .attr('width', swatchSize)
    .attr('height', swatchSize)
    .attr('rx', 2)
    .attr('ry', 2)
    .attr('fill', d => d.color)

  // Update legend text
  legendItems
    .selectAll<SVGTextElement, (typeof legendData)[0]>('.legend-text')
    .data(d => [d])
    .join('text')
    .attr('class', 'legend-text')
    .attr('x', swatchSize + swatchGap)
    .attr('y', 12)
    .style('font-size', 'var(--font-size-sm)')
    .text(d => d.fundType)

  // Function to generate tooltip content
  function generateTooltipContent(groupedRows: d3.InternMap<Row['funding_source'], Row[]>): string {
    let content = ''

    for (const [fundType, rows] of groupedRows.entries()) {
      const totalBudget = d3.sum(rows, d => d.budget)
      content += `<div class="labelvalue2 cols-2"><span>${fundType}:</span><span>${formatCurrency(totalBudget)}</span></div>`
    }

    return content
  }
}
