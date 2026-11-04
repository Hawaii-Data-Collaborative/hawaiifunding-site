import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import LaunchIcon from '@mui/icons-material/Launch'
import { Box, Button, Checkbox, FormControlLabel, Link, Stack, Typography } from '@mui/material'
import { formatCurrency, formatDollarsExact } from '../../util'
import { useContainerWidth, useTooltipCleanup, useVizSize } from '../../hooks'
import { CURRENT_FISCAL_YEAR } from '../../constants'
import { CPI, adjustForInflation } from '../../cpi'
import { DownloadDataButton } from '../DownloadDataButton'
import type { BillDetailRow, OverTimeRow, StageRow } from '../../loadProgramData'
import { NominalYearsNote, SectionEmpty, SectionPanel, NAVY, GREY_INK, HAIRLINE } from './chrome'

/**
 * Budget By Stage — how each fiscal year's number moved through the legislature, with a
 * per-year drill-down into the individual bill versions.
 *
 * Six bars per year, from the canonical `stage_sequence` in the budget view. Labels and
 * ordering are the QA v3 wording, deliberately NOT the view's raw values:
 *
 *   stage_sequence  →  label                     display order
 *   House               House (Biennium)          1
 *   House (s)           House (Supplemental)      2
 *   Senate              Senate (Biennium)         3
 *   Senate (s)          Senate (Supplemental)     4
 *   Conf                Conference (Biennium)     5
 *   Conf (s)            Conference (Supplemental) 6
 *
 * Both passes are named explicitly. Earlier rounds followed the spec, which marked the
 * original as "(Original)" and left the supplemental plain — so a bar labelled "House" was
 * the *supplemental*, the opposite of what a bare "House" means in the view. v3 replaced
 * that with Biennium / Supplemental, which can't be misread either way. Pairing is by
 * chamber rather than all three biennium bills then all three supplementals.
 *
 * Colour encodes chamber (blue House / orange Senate / purple Conference) and lightness
 * encodes pass: lighter is the biennium bill, full saturation the supplemental. Enacted is
 * navy — the authoritative figure rather than another category — and is labelled "most
 * recent version" because that's what it is: in every one of the 3,110 program-years with
 * an enacted figure, the enacted row is the highest stage_sequence_rank present (Conf (s),
 * or Senate (s) when the year never went to conference). Never an earlier draft.
 *
 * The current and future fiscal years sit in the same shaded band as Budget Over Time
 * draws, per v3; unlike that chart the bars keep full opacity, since lightness already
 * encodes something here.
 *
 * Clicking a bar opens that fiscal year's bill detail beneath the chart. The detail splits
 * each amount into operating and capital because committee worksheets cover operating only:
 * without the split, an amount sitting next to a source link doesn't reconcile with the
 * document it links to.
 */

// Keyed by the view's stage_sequence values; `order` is the spec's chamber-paired order.
const STAGE_META: Record<string, { label: string; chamber: string; order: number; color: string }> = {
  House: { label: 'House (Biennium)', chamber: 'House', order: 1, color: '#7ba3c4' },
  'House (s)': { label: 'House (Supplemental)', chamber: 'House', order: 2, color: '#0c5a9a' },
  Senate: { label: 'Senate (Biennium)', chamber: 'Senate', order: 3, color: '#e0a075' },
  'Senate (s)': { label: 'Senate (Supplemental)', chamber: 'Senate', order: 4, color: '#c44e00' },
  Conf: { label: 'Conference (Biennium)', chamber: 'Conference', order: 5, color: '#a58bc4' },
  'Conf (s)': { label: 'Conference (Supplemental)', chamber: 'Conference', order: 6, color: '#5a2a83' }
}

const FALLBACK_COLOR = '#697d8e'
const ENACTED_COLOR = NAVY
/** Legend and tooltip wording for the dashed line — see the header comment for why. */
const ENACTED_LABEL = 'Enacted (most recent version)'

interface SeriesDef {
  /** The view's stage_sequence value — the key the data is grouped under. */
  key: string
  label: string
  order: number
  color: string
}

interface YearGroup {
  fiscal_year: number
  values: Record<string, number>
  enacted: number | null
}

interface Props {
  rows: StageRow[]
  overTime: OverTimeRow[]
  billDetail: BillDetailRow[]
}

export function BudgetByStage({ rows, overTime, billDetail }: Props) {
  useTooltipCleanup()
  const svgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const [wrapRef, containerWidth] = useContainerWidth<HTMLDivElement>()
  // On by default, matching the state and federal charts (and BudgetOverTime above it).
  const [adjustInflation, setAdjustInflation] = useState(true)
  const [selectedFy, setSelectedFy] = useState<number | null>(null)

  const adj = (v: number, year: number) => (adjustInflation ? adjustForInflation(v, year) : v)

  const groups = useMemo<YearGroup[]>(() => {
    const enactedByYear = new Map(overTime.map(r => [r.fiscal_year, r.dollars]))
    const byYear = new Map<number, YearGroup>()

    for (const r of rows) {
      let group = byYear.get(r.fiscal_year)
      if (!group) {
        const enacted = enactedByYear.get(r.fiscal_year)
        group = {
          fiscal_year: r.fiscal_year,
          values: {},
          enacted: enacted == null ? null : adj(enacted, r.fiscal_year)
        }
        byYear.set(r.fiscal_year, group)
      }
      group.values[r.stage] = (group.values[r.stage] ?? 0) + adj(r.amount, r.fiscal_year)
    }

    return Array.from(byYear.values()).sort((a, b) => a.fiscal_year - b.fiscal_year)
  }, [rows, overTime, adjustInflation])

  // Series come from the data, so only the stages this program actually reached are drawn
  // or legended — plenty of years never went to conference, and not every program gets a
  // supplemental. Ordered by the spec's chamber pairing, not the view's stage_rank.
  const activeSeries = useMemo<SeriesDef[]>(() => {
    const keys = new Set<string>()
    for (const r of rows) if (r.amount > 0) keys.add(r.stage)
    return Array.from(keys)
      .map(key => {
        const meta = STAGE_META[key]
        return {
          key,
          label: meta?.label ?? key,
          order: meta?.order ?? 99,
          color: meta?.color ?? FALLBACK_COLOR
        }
      })
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
  }, [rows])

  const detailRows = useMemo(
    () =>
      selectedFy == null
        ? []
        : billDetail
            .filter(r => r.fiscal_year === selectedFy)
            .sort((a, b) => a.session_year - b.session_year || a.stage_rank - b.stage_rank),
    [billDetail, selectedFy]
  )

  // Drop the open panel if the program changes and the year no longer exists.
  useEffect(() => {
    if (selectedFy != null && !groups.some(g => g.fiscal_year === selectedFy)) setSelectedFy(null)
  }, [groups, selectedFy])

  useEffect(() => {
    if (!svgRef.current || !groups.length || !containerWidth) return
    draw(svgRef.current, groups, activeSeries, containerWidth, vizSize.height, selectedFy, fy =>
      setSelectedFy(prev => (prev === fy ? null : fy))
    )
  }, [groups, activeSeries, containerWidth, vizSize.height, selectedFy])

  const fyRange = groups.length ? `FY ${groups[0].fiscal_year}–${groups[groups.length - 1].fiscal_year}` : ''

  const downloadRows = useMemo(
    () =>
      groups.flatMap(gr =>
        activeSeries
          .filter(s => gr.values[s.key] != null)
          .map(s => ({
            fiscal_year: gr.fiscal_year,
            stage: s.label,
            amount: gr.values[s.key],
            enacted: gr.enacted ?? '',
            inflation_adjusted: adjustInflation ? '2025 dollars' : 'nominal'
          }))
      ),
    [groups, activeSeries, adjustInflation]
  )

  const unadjustedYears = useMemo(
    () => (adjustInflation ? groups.filter(g => !CPI[g.fiscal_year]).map(g => g.fiscal_year) : []),
    [groups, adjustInflation]
  )

  return (
    // The click hint is the subtitle now, per v3; the year range and the "$2.16B enacted
    // for FY 2027" line that used to sit here are gone (the header tiles carry the latter).
    <SectionPanel title="Budget By Stage" meta="Click a bar to see the bill versions behind that fiscal year.">
      <Stack direction="row" alignItems="center" justifyContent="center" gap={1.5} mb={1} flexWrap="wrap">
        <FormControlLabel
          control={
            <Checkbox checked={adjustInflation} onChange={e => setAdjustInflation(e.target.checked)} size="small" />
          }
          label={<Typography sx={{ fontSize: 13.5 }}>Adjust for inflation (2025 dollars)</Typography>}
        />
        <DownloadDataButton filename="program-budget-by-stage" rows={downloadRows} scope={fyRange} />
      </Stack>

      {/* Wrapper stays mounted — it holds the ResizeObserver ref. */}
      <Box ref={wrapRef} sx={{ width: '100%', display: 'flex', justifyContent: 'center', minHeight: 8 }}>
        {groups.length > 0 && <svg ref={svgRef} />}
      </Box>

      {groups.length === 0 ? (
        <SectionEmpty>
          <Box component="span" sx={{ fontSize: 15 }}>
            No stage-by-stage figures recorded for this program.
          </Box>
        </SectionEmpty>
      ) : (
        <>
          <NominalYearsNote years={unadjustedYears} />
          {selectedFy != null && (
            <BillDetail
              fiscalYear={selectedFy}
              rows={detailRows}
              adjustInflation={adjustInflation}
              onClose={() => setSelectedFy(null)}
            />
          )}
        </>
      )}
    </SectionPanel>
  )
}

/**
 * The drill-down panel. Each row is one bill version; the badges carry what the amounts
 * alone can't — which figure was a supplemental revision, and which one took effect.
 */
function BillDetail({
  fiscalYear,
  rows,
  adjustInflation,
  onClose
}: {
  fiscalYear: number
  rows: BillDetailRow[]
  adjustInflation: boolean
  onClose: () => void
}) {
  const adj = (v: number) => (adjustInflation ? adjustForInflation(v, fiscalYear) : v)
  const hasCapital = rows.some(r => (r.capital ?? 0) > 0)

  const downloadRows = rows.map(r => ({
    fiscal_year: r.fiscal_year,
    session_year: r.session_year,
    stage: STAGE_META[r.stage]?.label ?? r.stage,
    total: adj(r.amount),
    operating: r.operating == null ? '' : adj(r.operating),
    capital: r.capital == null ? '' : adj(r.capital),
    supplemental: r.is_supplemental ? 'yes' : 'no',
    enacted: r.enacted ? 'yes' : 'no',
    bill_link: r.bill_link ?? ''
  }))

  return (
    <Box className="fade-in" mt={2} sx={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: '8px' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.25} flexWrap="wrap">
        <Typography sx={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.4, color: NAVY }}>
          FY {fiscalYear} — BILL DETAIL
        </Typography>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <DownloadDataButton
            filename={`program-bill-detail-fy${fiscalYear}`}
            rows={downloadRows}
            scope={`FY ${fiscalYear} bill versions`}
          />
          <Button size="small" onClick={onClose} startIcon={<CloseIcon sx={{ fontSize: 16 }} />} sx={{ fontSize: 13 }}>
            Close
          </Button>
        </Stack>
      </Stack>

      {rows.length === 0 ? (
        <Box px={2} pb={2}>
          <Typography sx={{ fontSize: 14, color: GREY_INK, fontStyle: 'italic' }}>
            No bill versions recorded for FY {fiscalYear}.
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
              <Box component="thead">
                <Box component="tr" sx={{ borderTop: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}` }}>
                  <HeadCell>Bill Version</HeadCell>
                  <HeadCell align="right">Total Amount</HeadCell>
                  <HeadCell align="right">Operating</HeadCell>
                  {hasCapital && <HeadCell align="right">Investment Capital</HeadCell>}
                  <HeadCell>Source</HeadCell>
                </Box>
              </Box>
              <Box component="tbody">
                {rows.map(r => {
                  const color = STAGE_META[r.stage]?.color ?? FALLBACK_COLOR
                  return (
                    <Box
                      component="tr"
                      key={`${r.session_year}-${r.stage_rank}`}
                      sx={{
                        borderBottom: `1px solid ${HAIRLINE}`,
                        background: r.enacted ? 'rgba(0,143,140,0.06)' : 'transparent'
                      }}
                    >
                      <BodyCell>
                        <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                          {/* Dot carries the same colour as the bar it came from. */}
                          <Box
                            component="span"
                            sx={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }}
                          />
                          <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, color: NAVY }}>
                            session{r.session_year}
                          </Typography>
                          <Typography component="span" sx={{ fontSize: 14, color: GREY_INK }}>
                            ({STAGE_META[r.stage]?.chamber ?? r.stage})
                          </Typography>
                          {r.is_supplemental && <Badge label="SUPP" color="#a67c00" />}
                          {r.enacted && <Badge label="ENACTED" color={NAVY} filled />}
                        </Stack>
                      </BodyCell>
                      <BodyCell align="right">
                        <Typography
                          component="span"
                          sx={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: r.enacted ? 700 : 400 }}
                        >
                          {formatDollarsExact(adj(r.amount))}
                        </Typography>
                      </BodyCell>
                      <BodyCell align="right">
                        <Typography component="span" sx={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                          {r.operating == null ? '—' : formatDollarsExact(adj(r.operating))}
                        </Typography>
                      </BodyCell>
                      {hasCapital && (
                        <BodyCell align="right">
                          <Typography
                            component="span"
                            sx={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: GREY_INK }}
                          >
                            {r.capital == null ? '—' : formatDollarsExact(adj(r.capital))}
                          </Typography>
                        </BodyCell>
                      )}
                      <BodyCell>
                        {r.bill_link ? (
                          <Link
                            href={r.bill_link}
                            target="_blank"
                            rel="noopener"
                            data-hfp-kind="bill"
                            sx={{ fontSize: 13.5, display: 'inline-flex', alignItems: 'center', gap: 0.4 }}
                          >
                            <LaunchIcon sx={{ fontSize: 14 }} />
                            session{r.session_year} bill
                          </Link>
                        ) : (
                          <Typography component="span" sx={{ fontSize: 14, color: GREY_INK }}>
                            —
                          </Typography>
                        )}
                      </BodyCell>
                    </Box>
                  )
                })}
              </Box>
            </Box>
          </Box>
          {hasCapital && (
            <Typography sx={{ fontSize: 13, color: GREY_INK, px: 2, py: 1.25, lineHeight: 1.5 }}>
              Committee worksheets cover operating costs only, so the <strong>Operating</strong> column is the figure
              that ties out to them. Investment capital is appropriated in the same bill but reported separately.
            </Typography>
          )}
        </>
      )}
    </Box>
  )
}

function HeadCell({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <Box
      component="th"
      sx={{
        textAlign: align,
        px: 2,
        py: 1,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: GREY_INK,
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </Box>
  )
}

function BodyCell({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <Box component="td" sx={{ textAlign: align, px: 2, py: 1 }}>
      {children}
    </Box>
  )
}

function Badge({ label, color, filled }: { label: string; color: string; filled?: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        px: 0.6,
        py: '2px',
        borderRadius: '3px',
        border: `1px solid ${color}`,
        color: filled ? 'white' : color,
        background: filled ? color : 'transparent',
        whiteSpace: 'nowrap'
      }}
    >
      {label}
    </Box>
  )
}

function draw(
  svgEl: SVGSVGElement,
  groups: YearGroup[],
  series: SeriesDef[],
  availableWidth: number,
  availableHeight: number,
  selectedFy: number | null,
  onSelect: (fy: number) => void
) {
  // Panel width, not window width — six bars per year plus a seven-item legend is the
  // widest thing on the page, so it's the first to get clipped if this is wrong.
  const containerWidth = Math.max(availableWidth, 320)
  const containerHeight = Math.min(Math.max(availableHeight - 180, 320), 440)
  // `top` leaves room for the "Current FY" label, which sits above the plot area.
  const margin = { top: 30, right: 16, bottom: 92, left: 78 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  const svg = d3.select(svgEl).attr('width', containerWidth).attr('height', containerHeight)

  let g = svg.select<SVGGElement>('.main-group')
  if (g.empty()) {
    g = svg.append('g').attr('class', 'main-group').attr('transform', `translate(${margin.left},${margin.top})`)
  }

  const t = svg.transition().duration(500).ease(d3.easeCubicInOut)

  const x0 = d3
    .scaleBand<string>()
    .domain(groups.map(d => String(d.fiscal_year)))
    .range([0, width])
    .paddingInner(0.25)
    .paddingOuter(0.1)
  const x1 = d3
    .scaleBand<string>()
    .domain(series.map(s => s.key))
    .range([0, x0.bandwidth()])
    .padding(0.08)

  const maxY = d3.max(groups, gr => Math.max(...series.map(s => gr.values[s.key] ?? 0), gr.enacted ?? 0)) || 0
  const y = d3.scaleLinear().domain([0, maxY]).nice().range([height, 0])

  let tooltip = d3.select<HTMLDivElement, unknown>('.tooltip-program-stage')
  if (tooltip.empty()) {
    tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip tooltip-program-stage tooltip-stacked-bar')
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

  function tooltipHtml(gr: YearGroup, hoveredKey?: string) {
    let html = `<div style="padding:2px 0"><strong>FY ${gr.fiscal_year}</strong></div>`
    for (const s of series) {
      const v = gr.values[s.key]
      if (v == null) continue
      const dim = hoveredKey && s.key !== hoveredKey ? 'opacity:0.5' : ''
      html += `<div class="labelvalue2 cols-3" style="${dim}"><span style="color:${s.color}">●</span><span>${s.label}</span><span>${formatCurrency(
        v
      )}</span></div>`
    }
    if (gr.enacted != null) {
      html += `<div class="labelvalue2 cols-3" style="border-top:1px solid #555;margin-top:4px;padding-top:4px"><span style="color:#9fb6c9">▬</span><span><strong>${ENACTED_LABEL}</strong></span><span><strong>${formatCurrency(
        gr.enacted
      )}</strong></span></div>`
    }
    html += `<div style="opacity:.7;margin-top:4px">Click for bill detail</div>`
    return html
  }

  // Current / future fiscal years: shaded band, dashed divider and a "Current FY" label,
  // the same treatment as Budget Over Time above (v3 asked for the two to match). Redrawn
  // from scratch each pass rather than joined: there is at most one of each.
  g.selectAll('.current-fy-bg, .current-fy-divider, .current-fy-label').remove()

  const currentYears = groups.filter(d => d.fiscal_year >= CURRENT_FISCAL_YEAR)
  const pastYears = groups.filter(d => d.fiscal_year < CURRENT_FISCAL_YEAR)

  if (currentYears.length > 0 && pastYears.length > 0) {
    // Midway between the last past group's right edge and the first current group's left.
    const lastPast = x0(String(pastYears[pastYears.length - 1].fiscal_year)) || 0
    const firstCurrent = x0(String(currentYears[0].fiscal_year)) || 0
    const dividerX = (lastPast + x0.bandwidth() + firstCurrent) / 2
    const bgX = dividerX - 1

    g.append('rect')
      .attr('class', 'current-fy-bg')
      .attr('x', bgX)
      .attr('y', -24)
      .attr('width', width - bgX + 8)
      .attr('height', height + 28)
      // Same shade as Budget Over Time: dark enough to read on the section band's ground.
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

  // Selected-year backdrop, so the open drill-down is visibly tied to a bar.
  g.selectAll<SVGRectElement, YearGroup>('.year-highlight')
    .data(
      groups.filter(gr => gr.fiscal_year === selectedFy),
      d => String(d.fiscal_year)
    )
    .join('rect')
    .attr('class', 'year-highlight')
    .attr('fill', 'rgba(21,55,80,0.07)')
    .style('pointer-events', 'none')
    .attr('x', d => (x0(String(d.fiscal_year)) || 0) - 3)
    .attr('width', x0.bandwidth() + 6)
    .attr('y', -6)
    .attr('height', height + 6)

  const yearGroups = g
    .selectAll<SVGGElement, YearGroup>('.year-group')
    .data(groups, d => String(d.fiscal_year))
    .join(
      enter => enter.append('g').attr('class', 'year-group'),
      update => update,
      exit => exit.remove()
    )
    .attr('transform', d => `translate(${x0(String(d.fiscal_year)) || 0},0)`)

  yearGroups.each(function (gr) {
    const cells = series.filter(s => gr.values[s.key] != null)
    d3.select(this)
      .selectAll<SVGRectElement, SeriesDef>('rect')
      .data(cells, d => d.key)
      .join(
        enter =>
          enter
            .append('rect')
            .attr('x', d => x1(d.key) || 0)
            .attr('width', x1.bandwidth())
            .attr('y', height)
            .attr('height', 0)
            .attr('fill', d => d.color)
            .call(sel =>
              sel
                .transition(t)
                .attr('y', d => y(gr.values[d.key]))
                .attr('height', d => Math.max(0, height - y(gr.values[d.key])))
            ),
        update =>
          update.attr('fill', d => d.color).call(sel =>
            sel
              .transition(t)
              .attr('x', d => x1(d.key) || 0)
              .attr('width', x1.bandwidth())
              .attr('y', d => y(gr.values[d.key]))
              .attr('height', d => Math.max(0, height - y(gr.values[d.key])))
          ),
        exit => exit.transition(t).attr('height', 0).attr('y', height).remove()
      )
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        tooltip.html(tooltipHtml(gr, d.key)).style('opacity', 1)
        position(event)
      })
      .on('mousemove', event => position(event))
      .on('mouseout', () => tooltip.style('opacity', 0))
      .on('click', () => {
        tooltip.style('opacity', 0)
        onSelect(gr.fiscal_year)
      })
  })

  // Enacted line — drawn over the bars, only across years that have a value.
  const enactedPoints = groups.filter(gr => gr.enacted != null)
  const line = d3
    .line<YearGroup>()
    .x(gr => (x0(String(gr.fiscal_year)) || 0) + x0.bandwidth() / 2)
    .y(gr => y(gr.enacted as number))

  g.selectAll<SVGPathElement, YearGroup[]>('.enacted-line')
    .data(enactedPoints.length > 1 ? [enactedPoints] : [])
    .join('path')
    .attr('class', 'enacted-line')
    .attr('fill', 'none')
    .attr('stroke', ENACTED_COLOR)
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '6 4')
    .style('pointer-events', 'none')
    .transition(t)
    .attr('d', d => line(d))

  g.selectAll<SVGCircleElement, YearGroup>('.enacted-dot')
    .data(enactedPoints, d => String(d.fiscal_year))
    .join('circle')
    .attr('class', 'enacted-dot')
    .attr('r', 5)
    .attr('fill', ENACTED_COLOR)
    .style('cursor', 'pointer')
    .on('mouseover', (event, gr) => {
      tooltip.html(tooltipHtml(gr)).style('opacity', 1)
      position(event)
    })
    .on('mousemove', event => position(event))
    .on('mouseout', () => tooltip.style('opacity', 0))
    .on('click', (_, gr) => {
      tooltip.style('opacity', 0)
      onSelect(gr.fiscal_year)
    })
    .transition(t)
    .attr('cx', gr => (x0(String(gr.fiscal_year)) || 0) + x0.bandwidth() / 2)
    .attr('cy', gr => y(gr.enacted as number))

  g.selectAll<SVGGElement, null>('.x-axis')
    .data([null])
    .join(
      enter =>
        enter
          .append('g')
          .attr('class', 'x-axis')
          .attr('transform', `translate(0,${height})`)
          .call(d3.axisBottom(x0).tickFormat(d => `FY ${d}`) as any),
      update =>
        update
          .transition(t)
          .attr('transform', `translate(0,${height})`)
          .call(d3.axisBottom(x0).tickFormat(d => `FY ${d}`) as any) as any
    )
    .selectAll('text')
    .attr('transform', x0.bandwidth() < 60 ? 'rotate(-40)' : null)
    .style('text-anchor', x0.bandwidth() < 60 ? 'end' : 'middle')
    .attr('dx', x0.bandwidth() < 60 ? '-0.5em' : null)
    .attr('dy', x0.bandwidth() < 60 ? '0.15em' : '0.71em')

  g.selectAll<SVGGElement, null>('.y-axis')
    .data([null])
    .join(
      enter =>
        enter
          .append('g')
          .attr('class', 'y-axis')
          .call(d3.axisLeft(y).ticks(6).tickFormat(formatCurrency as any) as any),
      update => update.transition(t).call(d3.axisLeft(y).ticks(6).tickFormat(formatCurrency as any) as any) as any
    )

  // Legend: the stage swatches plus a dashed sample for Enacted, wrapped to width.
  let legend = g.select<SVGGElement>('.legend')
  if (legend.empty()) legend = g.append('g').attr('class', 'legend')
  legend.attr('transform', `translate(0,${height + (x0.bandwidth() < 60 ? 58 : 40)})`)

  const entries: Array<{ key: string; label: string; color: string; dashed: boolean }> = [
    ...series.map(s => ({ key: s.key, label: s.label, color: s.color, dashed: false })),
    { key: 'Enacted', label: ENACTED_LABEL, color: ENACTED_COLOR, dashed: true }
  ]

  const swatch = 12
  const gap = 4
  const itemGap = 14
  const rowH = 18

  const probe = g.append('text').style('visibility', 'hidden')
  const widths = entries.map(e => {
    probe.text(e.label)
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
  rowsMeta.push({ start: rowStart, end: entries.length - 1, w: curX - itemGap })
  for (const r of rowsMeta) {
    const offset = (width - r.w) / 2
    for (let i = r.start; i <= r.end; i++) positions[i].x += offset
  }

  const items = legend
    .selectAll<SVGGElement, { key: string; label: string; color: string; dashed: boolean }>('.legend-item')
    .data(entries, d => d.key)
    .join(
      enter => enter.append('g').attr('class', 'legend-item'),
      update => update,
      exit => exit.remove()
    )
    .attr('transform', (_, i) => `translate(${positions[i].x},${positions[i].y})`)

  items.selectAll('*').remove()
  items.each(function (d) {
    const item = d3.select(this)
    if (d.dashed) {
      item
        .append('line')
        .attr('x1', 0)
        .attr('x2', swatch)
        .attr('y1', swatch / 2)
        .attr('y2', swatch / 2)
        .attr('stroke', d.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4 3')
      item.append('circle').attr('cx', swatch / 2).attr('cy', swatch / 2).attr('r', 3).attr('fill', d.color)
    } else {
      item.append('rect').attr('width', swatch).attr('height', swatch).attr('rx', 2).attr('fill', d.color)
    }
    item.append('text').attr('class', 'legend-text').attr('x', swatch + gap).attr('y', 10).text(d.label)
  })

  const needed = margin.top + height + (x0.bandwidth() < 60 ? 58 : 40) + rowsMeta.length * rowH + 10
  if (needed > containerHeight) svg.attr('height', needed)
}
