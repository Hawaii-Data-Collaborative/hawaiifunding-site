import * as d3 from 'd3'
import { formatCurrency, slug } from '../../../util'

export interface DetailData {
  name: string
  value: number
  color: string
}

export async function createDetailDonut(
  svgEl: SVGSVGElement,
  data: DetailData[],
  width: number = 300,
  height: number = 300,
  detailRadius: number = 100,
  onClick: (name: string) => void
) {
  if (!svgEl) return

  // Create or get SVG
  let svg = d3.select(svgEl)

  // If no data, clear and return
  if (data.length === 0) {
    svg.selectAll('*').remove()
    return
  }

  // Initialize SVG if it doesn't exist
  if (svg.select('g').empty()) {
    svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2}, ${Math.min(height / 2, detailRadius + 50)})`)
  }

  svg = svg.select('g')

  // Create pie generator for detail chart
  const detailPie = d3
    .pie<DetailData>()
    .value(d => d.value)
    .sort((a, b) => {
      // "Other" (merged small slices) should come last
      if (a.name === 'Other' && b.name !== 'Other') return 1
      if (b.name === 'Other' && a.name !== 'Other') return -1
      // Otherwise sort by value (descending)
      return b.value - a.value
    })

  const detailArc = d3
    .arc<d3.PieArcDatum<DetailData>>()
    .innerRadius(detailRadius * 0.4)
    .outerRadius(detailRadius)

  // Get or create detail group
  let detailGroup = svg.select('.detail-donut')
  if (detailGroup.empty()) {
    detailGroup = svg.append('g').attr('class', 'detail-donut')
  }

  // Update paths with transition
  const paths = detailGroup.selectAll('path').data(detailPie(data), (d: any) => d.data.name)

  // Add new paths and store initial angles
  const pathsEnter = paths
    .enter()
    .append('path')
    .attr('class', d => `slice slice-${slug(d.data.name)}`)
    .attr('fill', d => d.data.color)
    .attr('stroke', 'white')
    .attr('stroke-width', 2)
    .style('opacity', 0)
    .style('cursor', d => d.data.name === 'Other' ? 'default' : 'pointer')
    .style('transition', 'opacity 0.2s ease')
    .each(function (d) {
      // @ts-expect-error it's fine
      this._current = d // store the initial angles
    })
    .on('mouseenter', function (_e, d: d3.PieArcDatum<DetailData>) {
      if (d.data.name === 'Other') return
      d3.selectAll('.detail-donut .slice').style('opacity', 0.5)
      d3.selectAll(`.detail-donut .slice.slice-${slug(d.data.name)}`).style('opacity', 1)
    })
    .on('mouseleave', function () {
      d3.selectAll('.detail-donut .slice').style('opacity', 1)
    })
    .on('click', function (event: MouseEvent, d: d3.PieArcDatum<DetailData>) {
      event.stopPropagation()
      if (d.data.name !== 'Other') {
        onClick(d.data.name)
      }
    })

  // Merge enter and update selections
  const pathsUpdate = pathsEnter.merge(paths as any)

  // Animate all paths to new values
  pathsUpdate
    .attr('fill', d => d.data.color)
    .transition()
    .duration(750)
    .ease(d3.easeCubicInOut)
    .attrTween('d', function (d) {
      // @ts-expect-error it's fine
      const i = d3.interpolate(this._current, d)
      // @ts-expect-error it's fine
      this._current = i(0)
      return (t: number) => detailArc(i(t)) as string
    })
    .style('opacity', 1)

  // Remove old paths after transition completes
  paths.exit().transition().duration(300).style('opacity', 0).remove()

  // Update labels with transition
  const labels = detailGroup.selectAll('text').data(detailPie(data), (d: any) => d.data.name)

  // Remove old labels
  labels.exit().remove()

  // Add new labels
  const labelsEnter = labels
    .enter()
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .style('font-size', 'var(--font-size-sm)')
    .style('fill', 'white')
    .style('pointer-events', 'none')
    .style('opacity', 0)

  // Merge enter and update selections
  const labelsUpdate = labelsEnter.merge(labels as any)

  // Update label text and animate
  labelsUpdate
    .text(d => formatCurrency(d.data.value))
    .transition()
    .duration(750)
    .ease(d3.easeCubicInOut)
    .attr('transform', d => `translate(${detailArc.centroid(d)})`)
    .style('opacity', 1)
}
