import './FunctionAreaByProgram.scss'

import * as d3 from 'd3'
import _ from 'lodash'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Popover, Stack, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { useTooltipCleanup, useUrlParam, useVizSize } from '../../../hooks'
import { FUND_TYPE_TO_COLOR, FUND_TYPES } from '../../../constants'
import { formatCurrency } from '../../../util'
import { YearSlider } from '../../YearSlider'
import { SortByDropdown } from '../../Dropdown'
import { FundTypeLegend } from '../../FundTypeLegend'
import { NoData } from '../../NoData'
import { useSetParam } from '../../../embed/ParamContext'
import { DownloadDataButton } from '../../DownloadDataButton'
import { labelled, stateBudgetRows } from '../stateDownloadRows'

export function FunctionAreaByProgram({ onBackClick }: { onBackClick?: () => void } = {}) {
  const setParam = useSetParam()
  useTooltipCleanup()

  const year = useUrlParam<number>('year', 'number', 2025)
  const [hasData, setHasData] = useState(true)
  const area: string = useUrlParam('area')
  const department: string = useUrlParam('dept')
  const sortBy = useUrlParam('sort-by', 'string', 'value') as 'label' | 'value'
  const svgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const [popupInfo, setPopupInfo] = useState<{ el: any; billUrl: string; worksheetUrl: string }>({
    el: null,
    billUrl: '',
    worksheetUrl: ''
  })

  const [yearMin, yearMax] = useMemo(() => d3.extent(window._data, d => d.fiscal_year), [])

  const onClick = (e: PointerEvent, d: any) => {
    const rows: Row[] = d.rows
    const row = rows.find(r => !!r.source_direct_link || !!r.worksheet_direct_link)
    if (row) {
      setPopupInfo({
        el: e.currentTarget,
        billUrl: row.source_direct_link || '',
        worksheetUrl: row.worksheet_direct_link || ''
      })
    }
  }

  useEffect(() => {
    const data = window._data.filter(
      d => d.fiscal_year === year && d.department === department && (area ? d.area === area : true)
    )
    data.sort((a, b) => a.program_clean.localeCompare(b.program_clean))

    let chartData = d3.group(
      data,
      d => (d.program_id ? `${d.program_id}: ${d.program_clean}` : d.program_clean),
      d => d.funding_source
    )

    // If sortBy is 'value', sort the chart data by total budget
    if (sortBy === 'value') {
      chartData = new Map(
        Array.from(chartData.entries()).sort((a, b) => {
          const totalA = d3.sum(Array.from(a[1].values()).flat(), d => d.budget)
          const totalB = d3.sum(Array.from(b[1].values()).flat(), d => d.budget)
          return totalB - totalA
        })
      )
    }

    if (chartData.size) {
      createChart(svgRef.current, chartData, vizSize, onClick)
      setHasData(true)
    } else {
      const svg = d3.select(svgRef.current)
      svg.selectAll('*').remove()
      setHasData(false)
    }
  }, [window._data, area, year, department, sortBy, vizSize])

  return (
    <div className="FunctionAreaByProgram fade-in">
      <Box p={2} display="flex" flexDirection="column" sx={{ height: '100%' }}>
        {/* Breadcrumb + Back button */}
        <Box display="flex" alignItems="center" justifyContent="center" mb={1} className="breadcrumbs">
          <Box
            display="flex"
            alignItems="center"
            gap={1.5}
            className="breadcrumbs-inner"
            sx={{ transform: 'translateX(-100px)' }}
          >
            {onBackClick && (
              <Button
                variant="outlined"
                startIcon={<ArrowBackIcon />}
                onClick={onBackClick}
                sx={{
                  mr: 2,
                  textTransform: 'none',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  borderColor: '#ccc',
                  color: '#153750',
                  '&:hover': { backgroundColor: '#f0f0f0', borderColor: '#999' }
                }}
                style={{ padding: '7px 16px' }}
              >
                Back
              </Button>
            )}
            <Typography variant="body1" sx={{ fontSize: '1.25rem', fontWeight: 500, color: '#555' }}>
              {area ? (
                <>
                  {area} <span style={{ color: '#aaa', display: 'inline-block', padding: '0 7px' }}>&rsaquo;</span>{' '}
                  {department}{' '}
                  <span style={{ color: '#aaa', display: 'inline-block', padding: '0 7px' }}>&rsaquo;</span> Programs
                </>
              ) : (
                <>
                  {department}{' '}
                  <span style={{ color: '#aaa', display: 'inline-block', padding: '0 7px' }}>&rsaquo;</span> Programs
                </>
              )}
            </Typography>
          </Box>
        </Box>

        {/* Controls */}
        <Box display="flex" alignItems="flex-end" justifyContent="center" gap={4} mb={2}>
          <YearSlider
            value={year}
            onChange={e => setParam('year', e.target.value)}
            min={yearMin}
            max={yearMax}
            step={1}
          />
          <Box mb="3px">
            <SortByDropdown value={sortBy} onChange={e => setParam('sort-by', e.target.value)} />
          </Box>
          <Box mb="3px">
            <DownloadDataButton
              filename="state-expenditures-by-program"
              scope={`all fiscal years \u00b7 ${department}`}
              rows={labelled(stateBudgetRows({ groupBy: 'program', area, department }), 'program')}
            />
          </Box>
        </Box>

        {/* Scrollable chart area */}
        {!hasData && (
          <Box display="flex" alignItems="center" justifyContent="center" color="#888" fontSize="0.9rem">
            <NoData width={300} />
          </Box>
        )}
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
            <svg ref={svgRef}></svg>
          </Box>
        </Box>

        {/* Legend outside scroll area */}
        <FundTypeLegend />
      </Box>

      <Popover
        open={!!popupInfo.el}
        anchorEl={popupInfo.el}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center'
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center'
        }}
        onClose={() => setPopupInfo({ el: null, billUrl: '', worksheetUrl: '' })}
      >
        <Stack px={1} py={0.5} gap={0.25}>
          {popupInfo.billUrl && (
            <a href={popupInfo.billUrl} target="_blank">
              <Stack direction="row" alignItems="center" gap={0.5} px={1} py={0.5}>
                <span style={{ fontSize: 13 }}>View Bill</span>
                <OpenInNewIcon fontSize="small" sx={{ transform: 'scale(0.8)' }} />
              </Stack>
            </a>
          )}
          {popupInfo.worksheetUrl && (
            <a href={popupInfo.worksheetUrl} target="_blank">
              <Stack direction="row" alignItems="center" gap={0.5} px={1} py={0.5}>
                <span style={{ fontSize: 13 }}>View Worksheet</span>
                <OpenInNewIcon fontSize="small" sx={{ transform: 'scale(0.8)' }} />
              </Stack>
            </a>
          )}
        </Stack>
      </Popover>
    </div>
  )
}

function createChart(
  svgEl: SVGSVGElement,
  data: d3.InternMap<string, d3.InternMap<string, Row[]>>,
  vizSize: { width: number; height: number },
  onClick: (e: PointerEvent, d: any) => void
) {
  const barHeight = 30
  const width = vizSize.width - 30
  const legendOffsetScale = d3.scaleLinear().domain([0, data.size]).range([100, 60])
  const height = data.size * (barHeight + 10) + legendOffsetScale(data.size)
  const margin = { top: 20, right: 60, bottom: 60, left: 300 }

  const svg = d3.select(svgEl).attr('width', width).attr('height', height)

  // Get or create the main group
  let mainGroup = svg.select('.main-group')
  if (mainGroup.empty()) {
    mainGroup = svg.append('g').attr('class', 'main-group')
  }

  // Get or create tooltip div
  let tooltip = d3.selectAll('.viz8-tooltip')
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('class', 'tooltip viz8-tooltip').style('opacity', 0)
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

  // const FUND_TYPE_TO_COLOR = {
  //   [FEDERAL]: '#153750',
  //   [STATE]: '#a72a5d',
  //   [COUNTY]: '#027397',
  //   [SPECIAL]: '#6da4cb',
  //   [PRIVATE]: '#cfd5db'
  // }

  // Update bars within each group
  barGroups.each(function (d) {
    const g = d3.select(this)

    // Calculate segment data
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
            .on('click', onClick)
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
    const wrappedLines = wrapText(d.group, 340, 11)
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
      .on('click', function (event: PointerEvent) {
        const allRows = Array.from(d.groupedRows.values()).flat()
        onClick(event, { rows: allRows })
      })
      .style('cursor', 'pointer')

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
          .transition(t)
          .attr('transform', d => `translate(${positions[d.index]}, 0)`)
          .attr('opacity', 1),
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
  function generateTooltipContent(groupedRows: d3.InternMap<string, Row[]>): string {
    let content = ''

    for (const [fundType, rows] of groupedRows.entries()) {
      const totalBudget = d3.sum(rows, d => d.budget)
      content += `<div class="labelvalue2 cols-2"><span>${fundType}:</span><span>${formatCurrency(totalBudget)}</span></div>`
    }

    return content
  }

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
}
