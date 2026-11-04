import * as d3 from 'd3'
import { formatCurrency } from '../../../util'

const DIMMED_OPACITY = 0.4

export interface DonutData {
  name: string
  value: number
  color?: string
  isHighlighted?: boolean
}

export function createOuterDonut(
  svgEl: SVGSVGElement,
  data: DonutData[],
  onClick: (name: string) => void,
  outerColors: d3.ScaleOrdinal<string, string>,
  width: number = 600,
  height: number = 450,
  chartRadius: number = 200,
  selectedOuterSegment?: string | null,
  initalRender?: boolean,
  onHover?: (name: string | null, event: MouseEvent) => void
) {
  if (!svgEl) return

  const radius = chartRadius
  const outerRadius = radius
  const innerRadius = radius * 0.7

  const svg = d3.select(svgEl).attr('width', width).attr('height', height).style('overflow', 'visible')
  svg.select('g').attr('transform', `translate(${width / 2}, ${Math.min(height / 2, radius + 50)})`)
  const g = svg.select('.outer-donut')

  // Create pie generator
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

  // Create arc generator
  const arc = d3.arc<d3.PieArcDatum<DonutData>>().innerRadius(innerRadius).outerRadius(outerRadius)

  // Prepare display data with original colors (dimming is handled via opacity)
  const displayData: DonutData[] = data.map(d => ({
    ...d,
    color: d.name === 'Other' ? '#c4c4c4' : (outerColors(d.name) as string)
  }))

  // Generate pie data
  const pieData = pie(displayData)

  // Create a key function for data binding
  const keyFn = (d: d3.PieArcDatum<DonutData>) => d.data.name

  // Disable hover interactions during position transition to prevent conflicts
  svg.style('pointer-events', 'none')
  const t = svg.transition('position').duration(750).on('end', () => {
    svg.style('pointer-events', null)
  })

  // Bind data to paths with enter/update/exit transitions
  g.selectAll('path')
    .data(pieData, keyFn)
    .join(
      enter =>
        enter
          .append('path')
          .attr('d', d => arc(d) as string)
          .attr('fill', d => d.data.color as string)
          .attr('stroke', 'white')
          .attr('stroke-width', 2)
          .attr('data-segment', d => d.data.name)
          .attr('data-original-opacity', d =>
            selectedOuterSegment && d.data.name !== selectedOuterSegment ? String(DIMMED_OPACITY) : '1'
          )
          .style('opacity', d => (selectedOuterSegment && d.data.name !== selectedOuterSegment ? DIMMED_OPACITY : 1))
          .style('cursor', 'pointer')
          .on('click', function (event: MouseEvent, d: d3.PieArcDatum<DonutData>) {
            event.stopPropagation()
            if (d.data.name !== 'Other') {
              onClick(d.data.name)
            }
          })
          .on('mouseenter', function (event: MouseEvent, d: d3.PieArcDatum<DonutData>) {
            onHover(d.data.name, event)
          })
          .on('mousemove', function (event: MouseEvent, d: d3.PieArcDatum<DonutData>) {
            // Only update position for "Other" slices to make tooltip follow mouse
            if (d.data.name === 'Other') {
              document.dispatchEvent(new CustomEvent('otherTooltipMouseMove', { detail: event }))
            }
          })
          .on('mouseleave', function (event: MouseEvent, _d: d3.PieArcDatum<DonutData>) {
            onHover(null, event)
          })
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
          .attr('data-original-opacity', d =>
            selectedOuterSegment && d.data.name !== selectedOuterSegment ? String(DIMMED_OPACITY) : '1'
          )
          .transition(t)
          .style('opacity', d => (selectedOuterSegment && d.data.name !== selectedOuterSegment ? DIMMED_OPACITY : 1))
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

  // Outside labels with leader lines
  const totalBudget = d3.sum(data, d => d.value)
  const labelRadius = outerRadius + 15
  const outerLabelArc = d3.arc<d3.PieArcDatum<DonutData>>().innerRadius(labelRadius).outerRadius(labelRadius)

  const midAngle = (d: d3.PieArcDatum<DonutData>) => d.startAngle + (d.endAngle - d.startAngle) / 2

  // Only label non-"Other" segments above threshold
  const labelData = pieData.filter(d => d.data.name !== 'Other' && d.data.value / totalBudget > 0.02)

  // Leader lines
  g.selectAll<SVGPolylineElement, d3.PieArcDatum<DonutData>>('.label-line')
    .data(labelData, keyFn)
    .join(
      enter =>
        enter
          .append('polyline')
          .attr('class', 'label-line')
          .attr('data-segment', d => d.data.name)
          .attr('stroke', '#aaa')
          .attr('fill', 'none')
          .attr('stroke-width', 1)
          .style('opacity', 0)
          .attr('points', d => {
            const posA = arc.centroid(d)
            const posB = outerLabelArc.centroid(d)
            const posC: [number, number] = [(labelRadius + 10) * (midAngle(d) < Math.PI ? 1 : -1), posB[1]]
            return [posA, posB, posC].map(p => p.join(',')).join(' ')
          })
          .call(enter =>
            enter.transition(t).style('opacity', function () {
              const name = d3.select(this).attr('data-segment')
              return selectedOuterSegment && name !== selectedOuterSegment ? DIMMED_OPACITY : 1
            })
          ),
      update =>
        update
          .transition(t)
          .style('opacity', function () {
            const name = d3.select(this).attr('data-segment')
            return selectedOuterSegment && name !== selectedOuterSegment ? DIMMED_OPACITY : 1
          })
          .attr('points', d => {
            const posA = arc.centroid(d)
            const posB = outerLabelArc.centroid(d)
            const posC: [number, number] = [(labelRadius + 10) * (midAngle(d) < Math.PI ? 1 : -1), posB[1]]
            return [posA, posB, posC].map(p => p.join(',')).join(' ')
          }),
      exit => exit.transition(t).style('opacity', 0).remove()
    )

  // Text labels outside the donut
  g.selectAll<SVGTextElement, d3.PieArcDatum<DonutData>>('.outer-label')
    .data(labelData, keyFn)
    .join(
      enter =>
        enter
          .append('text')
          .attr('class', 'outer-label')
          .attr('data-segment', d => d.data.name)
          .attr('dy', '0.35em')
          .style('font-size', 'var(--font-size-sm)')
          .style('pointer-events', 'none')
          .attr('text-anchor', d => (midAngle(d) < Math.PI ? 'start' : 'end'))
          .attr('transform', d => {
            const pos: [number, number] = [
              (labelRadius + 14) * (midAngle(d) < Math.PI ? 1 : -1),
              outerLabelArc.centroid(d)[1]
            ]
            return `translate(${pos})`
          })
          .style('opacity', 0)
          .text(d => `${d.data.name}: ${formatCurrency(d.data.value)}`)
          .call(enter =>
            enter.transition(t).style('opacity', function () {
              const name = d3.select(this).attr('data-segment')
              return selectedOuterSegment && name !== selectedOuterSegment ? DIMMED_OPACITY : 1
            })
          ),
      update =>
        update
          .transition(t)
          .style('opacity', function () {
            const name = d3.select(this).attr('data-segment')
            return selectedOuterSegment && name !== selectedOuterSegment ? DIMMED_OPACITY : 1
          })
          .attr('text-anchor', d => (midAngle(d) < Math.PI ? 'start' : 'end'))
          .attr('transform', d => {
            const pos: [number, number] = [
              (labelRadius + 14) * (midAngle(d) < Math.PI ? 1 : -1),
              outerLabelArc.centroid(d)[1]
            ]
            return `translate(${pos})`
          })
          .text(d => `${d.data.name}: ${formatCurrency(d.data.value)}`),
      exit => exit.transition(t).style('opacity', 0).remove()
    )
}

export function updateOuterDonutHover(
  svgEl: SVGSVGElement,
  hoveredName: string | null,
  selectedSegment?: string | null
) {
  if (!svgEl) return

  const svg = d3.select(svgEl)
  const activeSegment = hoveredName || selectedSegment

  if (activeSegment) {
    // Dim all segments except the active one (hovered or selected)
    svg
      .selectAll('.outer-donut path')
      .transition('hover')
      .duration(200)
      .style('opacity', function () {
        const segmentName = d3.select(this).attr('data-segment')
        return segmentName === activeSegment ? 1 : DIMMED_OPACITY
      })

    // Dim labels and leader lines
    svg
      .selectAll('.outer-donut .outer-label, .outer-donut .label-line')
      .transition('hover')
      .duration(200)
      .style('opacity', function () {
        const segmentName = d3.select(this).attr('data-segment')
        return segmentName === activeSegment ? 1 : DIMMED_OPACITY
      })
  } else {
    // Reset to original opacity
    svg
      .selectAll('.outer-donut path')
      .transition('hover')
      .duration(200)
      .style('opacity', function () {
        return parseFloat(d3.select(this).attr('data-original-opacity'))
      })
    svg.selectAll('.outer-donut .outer-label, .outer-donut .label-line').transition('hover').duration(200).style('opacity', 1)
  }
}
