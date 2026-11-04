import * as d3 from 'd3'
import { formatCurrency } from '../../../util'

export interface DonutData {
  name: string
  value: number
  color?: string
  isHighlighted?: boolean
}

const DIMMED_OPACITY = 0.4

export function createInnerDonut(
  svgEl: SVGSVGElement,
  data: DonutData[],
  _onClick: (name: string) => void,
  colorScale: d3.ScaleOrdinal<string, string>,
  chartRadius: number = 200,
  selectedOuterSegment?: string | null,
  splitData?: { [fundingSourceName: string]: { related: number; total: number } },
  initalRender?: boolean,
  onHover?: (name: string | null, event: MouseEvent) => void,
  rotationOffset: number = 0
) {
  if (!svgEl) return

  const outerRadius = chartRadius * 0.59
  const innerRadius = outerRadius * 0.54

  const svg = d3.select(svgEl)
  const g = svg.select('.inner-donut')

  // Create pie generator with custom sort to ensure dimmed segment appears last
  const pie = d3
    .pie<DonutData>()
    .value(d => d.value)
    .sort((a, b) => {
      // If one is 'Other' (dimmed), it should come last
      if (a.name === 'Other' && b.name !== 'Other') return 1
      if (b.name === 'Other' && a.name !== 'Other') return -1
      // Otherwise sort by value (descending)
      return b.value - a.value
    })
    .startAngle(selectedOuterSegment && splitData ? rotationOffset : 0)
    .endAngle(selectedOuterSegment && splitData ? rotationOffset + 2 * Math.PI : 2 * Math.PI)

  // Create arc generator
  const arc = d3.arc<d3.PieArcDatum<DonutData>>().innerRadius(innerRadius).outerRadius(outerRadius)

  // Prepare data based on current state
  let displayData: DonutData[]
  let pieData: d3.PieArcDatum<DonutData>[]

  if (selectedOuterSegment && splitData) {
    // Reorganize data: group highlighted segments together, create one dimmed segment
    const highlightedSegments: DonutData[] = []
    let totalDimmedValue = 0

    // Collect highlighted segments and calculate total dimmed value
    for (const d of data) {
      const fundingSourceName = d.name
      const relatedValue = splitData[fundingSourceName]?.related || 0
      const unrelatedValue = d.value - relatedValue

      if (relatedValue > 0) {
        highlightedSegments.push({
          name: fundingSourceName,
          value: relatedValue,
          color: colorScale(fundingSourceName) as string
        })
      }

      totalDimmedValue += unrelatedValue
    }

    // Create new pie data with highlighted segments first, then one dimmed segment
    displayData = [
      ...highlightedSegments,
      ...(totalDimmedValue > 0 ? [{ name: 'Other', value: totalDimmedValue, color: '#ddd' }] : [])
    ]
  } else {
    // Normal case - use original data
    displayData = data.map(d => ({
      ...d,
      color: colorScale(d.name) as string
    }))
  }

  // Generate pie data
  pieData = pie(displayData)

  // Create a key function for data binding
  const keyFn = (d: d3.PieArcDatum<DonutData>) => d.data.name

  svg.style('pointer-events', 'none')
  const t = svg.transition('position').duration(750).on('end', () => {
    svg.style('pointer-events', null)
  })

  // Bind data to paths
  g.selectAll('path')
    .data(pieData, keyFn)
    .join(
      enter =>
        enter
          .append('path')
          .attr('d', d => arc(d) as string)
          .attr('fill', d => d.data.color as string)
          .attr('stroke', 'white')
          .attr('stroke-width', 1)
          .attr('data-segment', d => d.data.name)
          .attr('data-original-opacity', '1')
          .style('cursor', 'default')
          .each(function (d) {
            // start collapsed at its own startAngle
            // @ts-expect-error it's fine
            this._current = { startAngle: d.startAngle, endAngle: initalRender ? d.endAngle : d.startAngle }
          })
          .attr('d', d => arc({ ...d, endAngle: initalRender ? d.endAngle : d.startAngle }))
          .call(enter =>
            enter
              .transition(t)
              .attrTween('d', function (d) {
                // @ts-expect-error it's fine
                const d0 = this._current
                const i = d3.interpolate(d0, d)
                return t => arc(i(t))
              })
              .on('end', function (d) {
                // @ts-expect-error it's fine
                this._current = d
              })
          ),
      update =>
        update
          .each(function (d) {
            // if for any reason _current is missing (e.g., DOM recycled), init it
            // @ts-expect-error it's fine
            this._current = this._current || {
              startAngle: d.startAngle,
              endAngle: initalRender ? d.endAngle : d.startAngle
            }
          })
          .transition(t)
          .style('opacity', 1)
          .attrTween('d', function (d) {
            // @ts-expect-error it's fine
            const d0 = this._current
            const i = d3.interpolate(d0, d)
            return t => arc(i(t))
          })
          .on('end', function (d) {
            // @ts-expect-error it's fine
            this._current = { startAngle: d.startAngle, endAngle: d.endAngle }
          }),
      exit => exit.transition(t).style('opacity', 0).remove()
    )

  // Handle labels with smooth transitions
  const totalBudget = d3.sum(data, d => d.value)
  const labelKeyFn = (d: d3.PieArcDatum<DonutData>) => d.data.name

  // Bind data to text elements
  const texts = g.selectAll('text').data(pieData, labelKeyFn)

  // Handle entering text elements
  const enteringTexts = texts
    .enter()
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .style('font-size', 'var(--font-size-sm)')
    .style('fill', 'white')
    .style('pointer-events', 'none')
    .style('opacity', 0)

  // Set initial position for entering texts
  enteringTexts
    .attr('transform', d => `translate(${arc.centroid(d)})`)
    .text(d => {
      const percentage = (d.data.value / totalBudget) * 100
      return percentage > 3 ? formatCurrency(d.data.value) : ''
    })

  // Handle updating text elements
  texts
    .merge(enteringTexts)
    .transition()
    .duration(1000)
    .ease(d3.easeCubicOut)
    .attr('transform', d => `translate(${arc.centroid(d)})`)
    .style('opacity', d => {
      const percentage = (d.data.value / totalBudget) * 100
      return percentage > 3 ? 1 : 0
    })
    .text(d => {
      const percentage = (d.data.value / totalBudget) * 100
      return percentage > 3 ? formatCurrency(d.data.value) : ''
    })

  // Handle exiting text elements
  texts.exit().transition().duration(1000).ease(d3.easeCubicOut).style('opacity', 0).remove()
}

export function updateInnerDonutHover(svgEl: SVGSVGElement, hoveredName: string | null) {
  if (!svgEl) return

  const svg = d3.select(svgEl)

  if (hoveredName) {
    // Dim all segments except the hovered one
    svg
      .selectAll('.inner-donut path')
      .transition('hover')
      .duration(200)
      .style('opacity', function () {
        const path = d3.select(this)
        const segmentName = path.attr('data-segment')
        return segmentName === hoveredName ? 1 : DIMMED_OPACITY
      })

    // Handle text labels - check if we're in split mode by looking for text elements without data
    const textElements = svg.selectAll('.inner-donut text')
    const hasDataAttribute = textElements.nodes().some(node => d3.select(node).datum() !== null)

    if (hasDataAttribute) {
      // Normal mode - text elements have data
      textElements
        .transition('hover')
        .duration(200)
        .style('opacity', (d: any) => (d.data.name === hoveredName ? 1 : DIMMED_OPACITY))
    } else {
      // Split mode - text elements don't have data, dim all text when hovering
      textElements.transition('hover').duration(200).style('opacity', DIMMED_OPACITY)
    }
  } else {
    // Reset to original opacity
    svg
      .selectAll('.inner-donut path')
      .transition('hover')
      .duration(200)
      .style('opacity', function () {
        const path = d3.select(this)
        return parseFloat(path.attr('data-original-opacity'))
      })
    svg.selectAll('.inner-donut text').transition('hover').duration(200).style('opacity', 1)
  }
}
