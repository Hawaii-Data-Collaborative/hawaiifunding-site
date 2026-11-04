import * as d3 from 'd3'

export function addChartTitle(
  parent: d3.Selection<SVGGElement, unknown, SVGElement, unknown>,
  title: string,
  y: number | string
) {
  parent
    .append('foreignObject')
    .attr('x', '-50%')
    .attr('y', y)
    .attr('width', '100%')
    .attr('height', 18)
    .style('pointer-events', 'none')
    .append('xhtml:div')
    .style('display', 'flex')
    .style('align-items', 'center')
    .style('justify-content', 'center')
    .append('xhtml:div')
    .style('padding', '3px 7px')
    .style('line-height', '1')
    .style('background-color', '#dceb')
    .style('border-radius', '3px')
    .style('font-size', '0.7rem')
    .text(title)
}
