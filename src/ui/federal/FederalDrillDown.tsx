import * as d3 from 'd3'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Typography, ButtonGroup, Button, CircularProgress } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { capitalCase } from 'change-case'
import { PALETTE_8, CURRENT_YEAR } from '../../constants'
import { formatCurrency } from '../../util'
import { useTooltipCleanup, useVizSize } from '../../hooks'
import { formatAwardType } from '../../loadFederalData'
import { YearSlider } from '../YearSlider'
import { DownloadDataButton } from '../DownloadDataButton'
import { useTrackInteract } from '../TrackedEmbed'

type GroupBy = 'award_type' | 'recipient_category'

interface Segment {
  group: string
  value: number
}

interface NamedRow {
  name: string
  obligations: number
  segments: Segment[]
}

interface AwardRow {
  award_id: string | null
  // CFDA (a.k.a. ALN) program number, e.g. "96.001". Null for the synthetic
  // "All other awards" rollup and for any award whose source row lacks a CFDA.
  cfda_number: string | null
  label: string
  group: string
  obligations: number
}

const GROUP_BY_LABEL: Record<GroupBy, string> = {
  award_type: 'Award Type',
  recipient_category: 'Recipient'
}

const DEFAULT_FY = 2024
const FY_MIN = 2016
// Cap at the last complete fiscal year — the in-progress FY's USAspending
// snapshot is partial and produces misleading bars.
const FY_MAX = CURRENT_YEAR - 1

export function FederalDrillDown() {
  useTooltipCleanup()

  const [fy, setFy] = useState<number>(DEFAULT_FY)
  const [debouncedFy, setDebouncedFy] = useState<number>(DEFAULT_FY)
  const [department, setDepartment] = useState<string | null>(null)
  const [program, setProgram] = useState<string | null>(null)
  const report = useTrackInteract()
  const [groupBy, setGroupBy] = useState<GroupBy>('award_type')

  // The chart renders against `dataLevel`, not `level`. The user's current navigation
  // (level) updates synchronously on click, but the loaded data lags by one fetch cycle —
  // rendering with the new level against the old data shape causes type confusion (e.g. an
  // AwardRow[] renderer accessing .label on NamedRow[]). Tracking `dataLevel` alongside
  // `data` keeps them in lockstep so the chart only switches when both have advanced.
  const [data, setData] = useState<NamedRow[] | AwardRow[] | null>(null)
  const [dataLevel, setDataLevel] = useState<'department' | 'program' | 'award'>('department')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const level: 'department' | 'program' | 'award' =
    !department ? 'department' : !program ? 'program' : 'award'

  // Build a single colorMap for the legend + bar fills, keyed by group name. Order groups
  // by their cross-row total so the largest gets palette[0]; reserve palette[7] for "Other".
  const groupColor = useMemo(() => {
    if (!data) return {} as Record<string, string>
    const totals: Record<string, number> = {}
    if (dataLevel === 'award') {
      for (const r of data as AwardRow[]) {
        totals[r.group] = (totals[r.group] ?? 0) + (r.obligations ?? 0)
      }
    } else {
      for (const r of data as NamedRow[]) {
        for (const s of r.segments) totals[s.group] = (totals[s.group] ?? 0) + s.value
      }
    }
    const groups = Object.keys(totals).sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))
    const colors: Record<string, string> = {}
    let i = 0
    for (const g of groups) {
      if (g === 'Other') {
        colors[g] = PALETTE_8[PALETTE_8.length - 1]
      } else {
        colors[g] = PALETTE_8[i % (PALETTE_8.length - 1)]
        i++
      }
    }
    return colors
  }, [data, dataLevel])

  // Debounce slider drags so a single drag fires one request, not 50.
  // Clicks (department/program/groupBy) fire immediately — no debounce.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFy(fy), 300)
    return () => clearTimeout(t)
  }, [fy])

  useEffect(() => {
    const params = new URLSearchParams({ fy: String(debouncedFy), groupBy })
    if (department) params.set('department', department)
    if (program) params.set('program', program)

    setLoading(true)
    setError(null)
    fetch(`/api/federal/drilldown?${params}`)
      .then(r => {
        if (!r.ok) throw new Error(`API ${r.status}`)
        return r.json()
      })
      .then(rows => {
        // Title-case `group` values for the legend / tooltip / bar segments.
        // The API returns raw `award_category` / `recipient_reporting_category`
        // values which are lowercase for award types; recipient values come in
        // already title-cased (and may contain slashes), so we only run
        // formatAwardType for the award_type groupBy. 'unknown' → 'Unknown'
        // either way.
        const normalizeGroup = (g: string): string => {
          if (groupBy === 'award_type') return formatAwardType(g)
          if (g === 'unknown') return 'Unknown'
          return g
        }
        const normalized = rows.map((r: any) => {
          if (Array.isArray(r.segments)) {
            return { ...r, segments: r.segments.map((s: any) => ({ ...s, group: normalizeGroup(s.group) })) }
          }
          if (typeof r.group === 'string') {
            return { ...r, group: normalizeGroup(r.group) }
          }
          return r
        })
        setData(normalized)
        setDataLevel(level)
      })
      .catch(e => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false))
  }, [debouncedFy, department, program, groupBy, level])

  const onDeptClick = (name: string) => {
    report('drill-department', name)
    setDepartment(name)
    setProgram(null)
  }
  const onProgramClick = (name: string) => {
    report('drill-program', name)
    setProgram(name)
  }
  const onBack = () => {
    report('back', program ? 'program' : department ? 'department' : 'top')
    // Pops one level off the drill stack. Used by the back button below the
    // title. Equivalent to the previous "click the prior breadcrumb segment".
    if (program) setProgram(null)
    else if (department) setDepartment(null)
  }

  // Append-only breadcrumb segments. First segment is the entry anchor
  // ("FY {year} Departments"); each drill adds one selection segment. The
  // groupBy choice (Award Type vs Recipient) lives in the button group below,
  // intentionally not in the title — keeps drill state and slice-by state
  // visually separated.
  const breadcrumbSegments = useMemo(() => {
    const out: { label: string; isCurrent: boolean }[] = []
    out.push({ label: `FY ${fy} Federal Departments/Agencies`, isCurrent: !department })
    if (department) out.push({ label: department, isCurrent: !program })
    if (program) out.push({ label: program, isCurrent: true })
    return out
  }, [fy, department, program])

  const onCrumbClick = (i: number) => {
    report('breadcrumb-back', String(i))
    if (i === 0) { setDepartment(null); setProgram(null) }
    else if (i === 1) { setProgram(null) }
  }

  return (
    <div className="FederalDrillDown fade-in">
      <Box p={2} display="flex" flexDirection="column" alignItems="center" gap={1.5}>
        <Box display="flex" alignItems="center" justifyContent="center" gap={1.5}>
          {(department || program) && (
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={onBack}
              sx={{
                textTransform: 'none',
                whiteSpace: 'nowrap',
                fontWeight: 600,
                borderColor: '#ccc',
                color: '#153750',
                flexShrink: 0,
                '&:hover': { backgroundColor: '#f0f0f0', borderColor: '#999' }
              }}
              style={{ padding: '7px 16px' }}
            >
              Back
            </Button>
          )}
          <Box
            display="flex"
            flexWrap="wrap"
            alignItems="center"
            sx={{ maxWidth: 800, minWidth: 0 }}
          >
            {breadcrumbSegments.map((seg, i) => (
              <Fragment key={i}>
                {i > 0 && (
                  <Box
                    component="span"
                    sx={{ color: '#aaa', px: '7px', fontSize: '1.25rem', userSelect: 'none' }}
                  >
                    ›
                  </Box>
                )}
                <Typography
                  variant="body1"
                  component="span"
                  onClick={seg.isCurrent ? undefined : () => onCrumbClick(i)}
                  sx={{
                    fontSize: '1.25rem',
                    fontWeight: 500,
                    color: '#555',
                    lineHeight: 1.25,
                    cursor: seg.isCurrent ? 'default' : 'pointer',
                    '&:hover': seg.isCurrent ? {} : { color: '#0c5a9a', textDecoration: 'underline' }
                  }}
                >
                  {seg.label}
                </Typography>
              </Fragment>
            ))}
          </Box>
        </Box>

        <Box display="flex" alignItems="flex-end" justifyContent="center" gap={3} flexWrap="wrap">
          <YearSlider
            value={fy}
            onChange={(e: any) => setFy(Number(e.target.value))}
            min={FY_MIN}
            max={FY_MAX}
            step={1}
            centerLabel
          />
          <Box mb="3px">
            <ButtonGroup size="small">
              {(['award_type', 'recipient_category'] as const).map(g => (
                <Button
                  key={g}
                  variant={groupBy === g ? 'contained' : 'outlined'}
                  onClick={() => {
                    report('group-by', g)
                    setGroupBy(g)
                  }}
                >
                  {GROUP_BY_LABEL[g]}
                </Button>
              ))}
            </ButtonGroup>
          </Box>
          {/* Whatever level is on screen (departments, programs, or awards). */}
          <Box mb="3px">
            {/* Current level, all years — see FederalComposition for the reasoning. */}
            <DownloadDataButton
              filename={`federal-drilldown-${dataLevel}`}
              scope={`FY ${FY_MIN}\u2013${FY_MAX} \u00b7 ${dataLevel} level`}
              getRows={async () => {
                const params = new URLSearchParams({
                  fy: String(fy),
                  groupBy,
                  allYears: '1',
                  fyMin: String(FY_MIN),
                  fyMax: String(FY_MAX)
                })
                if (department) params.set('department', department)
                if (program) params.set('program', program)
                const r = await fetch(`/api/federal/drilldown?${params}`)
                if (!r.ok) throw new Error(`API ${r.status}`)
                const rows = (await r.json()) as any[]
                return rows.map(row => ({
                  fiscal_year: row.fiscal_year,
                  level: dataLevel,
                  department: department ?? '',
                  program: program ?? '',
                  group_by: groupBy,
                  name: row.name ?? row.label ?? '',
                  award_id: row.award_id ?? '',
                  cfda_number: row.cfda_number ?? '',
                  group: row.group ?? '',
                  obligations: row.value ?? row.obligations
                }))
              }}
            />
          </Box>
        </Box>

        {error && <Typography color="error">Error loading: {error}</Typography>}

        {/* Initial load (no chart yet to keep in place) */}
        {!data && loading && <Typography variant="body2" color="text.secondary">Loading…</Typography>}

        {data && data.length === 0 && !loading && (
          <Typography variant="body2" color="text.secondary">No data for this selection.</Typography>
        )}

        {data && data.length > 0 && (
          <Box position="relative" width="100%">
            <Box sx={{ opacity: loading ? 0.35 : 1, transition: 'opacity 150ms ease', pointerEvents: loading ? 'none' : 'auto' }}>
              <BarList
                level={dataLevel}
                data={data}
                groupColor={groupColor}
                onDeptClick={onDeptClick}
                onProgramClick={onProgramClick}
              />
              {Object.keys(groupColor).length > 0 && (
                <DrillDownLegend groupColor={groupColor} />
              )}
            </Box>
            {loading && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  pointerEvents: 'none',
                  zIndex: 2
                }}
              >
                <CircularProgress size={32} sx={{ color: '#153750' }} />
              </Box>
            )}
          </Box>
        )}
      </Box>
    </div>
  )
}

function BarList({
  level, data, groupColor, onDeptClick, onProgramClick
}: {
  level: 'department' | 'program' | 'award'
  data: NamedRow[] | AwardRow[]
  groupColor: Record<string, string>
  onDeptClick: (name: string) => void
  onProgramClick: (name: string) => void
}) {
  useTooltipCleanup()
  const svgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()

  useEffect(() => {
    if (!svgRef.current || !data.length) return
    drawBars(svgRef.current, level, data, vizSize, groupColor, onDeptClick, onProgramClick)
  }, [level, data, vizSize, groupColor])

  return (
    <Box className="scroll-fade-wrapper" width="100%">
      <Box
        sx={{
          maxHeight: '50vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          justifyContent: 'center'
        }}
      >
        <svg ref={svgRef}></svg>
      </Box>
    </Box>
  )
}

function DrillDownLegend({ groupColor }: { groupColor: Record<string, string> }) {
  return (
    <Box display="flex" flexWrap="wrap" justifyContent="center" gap="16px" py={1.5}>
      {Object.entries(groupColor).map(([group, color]) => (
        <Box key={group} display="flex" alignItems="center" gap="6px">
          <Box
            width="12px"
            height="12px"
            sx={{ backgroundColor: color, borderRadius: '2px', flexShrink: 0 }}
          />
          <span style={{ fontSize: 'var(--font-size-sm)' }}>{group}</span>
        </Box>
      ))}
    </Box>
  )
}

const USASPENDING_AWARD_URL = (id: string) => `https://www.usaspending.gov/award/${id}`

// Internal uniform shape used by drawBars. Award-level rows are normalized into a single-segment
// shape so the rendering path is identical for all three levels.
interface UniformRow {
  label: string
  obligations: number
  segments: Segment[]
  raw: NamedRow | AwardRow
}

function drawBars(
  svgEl: SVGSVGElement,
  level: 'department' | 'program' | 'award',
  data: NamedRow[] | AwardRow[],
  vizSize: { width: number; height: number },
  groupColor: Record<string, string>,
  onDeptClick: (name: string) => void,
  onProgramClick: (name: string) => void
) {
  const containerWidth = Math.max(vizSize.width, 600) - 30
  const rowH = 30
  const rowGap = 10
  // Right margin sized to keep the largest bar's value label (e.g. "$1.2B")
  // safely inside the visible region — the SVG itself is window-based and may
  // overflow the embed container's overflowX: hidden, so labels need slack.
  const margin = { top: 10, right: 160, bottom: 20, left: 220 }
  const innerH = data.length * (rowH + rowGap)
  const containerHeight = margin.top + margin.bottom + innerH
  const width = containerWidth - margin.left - margin.right

  const svg = d3.select(svgEl).attr('width', containerWidth).attr('height', containerHeight)
  svg.selectAll('*').remove()
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  // Normalize to a single shape — award-level rows become single-segment rows.
  // Award labels are formatted "{cfda_number}: {Title Case Label}" when CFDA is
  // available; CFDA titles in the source DB are all-caps and need title-casing
  // for readability (the synthetic "All other awards" rollup has no CFDA — it
  // keeps its title-cased label unchanged via capitalCase being idempotent).
  const rows: UniformRow[] = level === 'award'
    ? (data as AwardRow[]).map(d => {
        const titled = capitalCase(d.label)
        const label = d.cfda_number ? `${d.cfda_number}: ${titled}` : titled
        return {
          label,
          obligations: d.obligations,
          segments: [{ group: d.group, value: d.obligations }],
          raw: d
        }
      })
    : (data as NamedRow[]).map(d => ({
        label: d.name,
        obligations: d.obligations,
        segments: d.segments,
        raw: d
      }))

  const maxV = d3.max(rows, d => d.obligations) || 0
  const x = d3.scaleLinear().domain([0, maxV]).range([0, width])

  const tooltip = ensureTooltip()
  function positionTooltip(event: MouseEvent) {
    const node = tooltip.node() as HTMLElement
    const rect = node.getBoundingClientRect()
    const pad = 10
    let left = event.pageX + pad
    let top = event.pageY - pad
    if (left + rect.width > window.scrollX + window.innerWidth) left = event.pageX - rect.width - pad
    if (top + rect.height > window.scrollY + window.innerHeight) top = event.pageY - rect.height - pad
    tooltip.style('left', left + 'px').style('top', top + 'px')
  }

  // At every level a row click does *something* — drill down, or open USASpending for awards
  // that have an award_id. Award-level rollups (label === 'All other awards', award_id === null)
  // still render a hover tooltip but no click action.
  const isClickable = (raw: any): boolean => {
    if (level === 'department' || level === 'program') return true
    if (level === 'award') return !!raw.award_id
    return false
  }

  const onRowClick = (raw: any) => {
    if (level === 'department') onDeptClick(raw.name)
    else if (level === 'program') onProgramClick(raw.name)
    else if (level === 'award' && raw.award_id) {
      window.open(USASPENDING_AWARD_URL(raw.award_id), '_blank', 'noopener')
    }
  }

  const rowGroups = g.selectAll('.row')
    .data(rows)
    .join('g')
    .attr('class', 'row')
    .attr('transform', (_d, i) => `translate(0, ${i * (rowH + rowGap)})`)

  // Stacked segments — one rect per segment, x-positioned by running offset within the row.
  // Pointer events go on the transparent overlay below; segments are visual-only.
  rowGroups.each(function (d) {
    const sel = d3.select(this)
    let cursor = 0
    for (const seg of d.segments) {
      const x0 = x(cursor)
      const x1 = x(cursor + seg.value)
      sel.append('rect')
        .attr('class', 'segment')
        .attr('x', x0)
        .attr('y', 0)
        .attr('width', Math.max(0, x1 - x0))
        .attr('height', rowH)
        .attr('fill', groupColor[seg.group] ?? '#999')
        .attr('opacity', 0.95)
        .attr('pointer-events', 'none')
      cursor += seg.value
    }
  })

  // Tooltip / click logic — shared across the bar overlay AND the row label, so labels
  // behave just like the bars (clickable + same hover tooltip).
  function showTooltip(event: MouseEvent, d: UniformRow) {
    const raw = d.raw as any
    const isAward = level === 'award'
    let html = `<div style="padding:5px 0"><strong>${d.label}</strong></div>`
    html += `<div class="labelvalue2 cols-2"><span>Obligations:</span><span style="text-align:right;font-weight:600">${formatCurrency(d.obligations)}</span></div>`
    if (!isAward && d.segments.length > 0) {
      html += `<div style="border-top:1px solid #555;margin-top:6px;padding-top:6px;font-size:11px;opacity:0.85">Breakdown:</div>`
      for (const seg of d.segments) {
        const swatch = groupColor[seg.group] ?? '#999'
        html += `<div class="labelvalue2 cols-3"><span style="color:${swatch}">●</span><span>${seg.group}</span><span style="text-align:right">${formatCurrency(seg.value)}</span></div>`
      }
    } else if (isAward && raw.group) {
      const swatch = groupColor[raw.group] ?? '#999'
      html += `<div class="labelvalue2 cols-3"><span style="color:${swatch}">●</span><span>Group:</span><span style="text-align:right">${raw.group}</span></div>`
    }
    if (level === 'award' && raw.award_id) {
      html += `<div style="opacity:0.7;font-size:11px;margin-top:4px">Click to open on USASpending.gov</div>`
    } else if (level !== 'award') {
      html += `<div style="opacity:0.7;font-size:11px;margin-top:4px">Click to drill down</div>`
    }
    tooltip.style('opacity', 1).html(html)
    positionTooltip(event)
  }

  // Row label (truncated). Clickable wherever the bar is clickable — same handler, same
  // tooltip. Underline on hover gives the affordance without bloat.
  rowGroups.append('text')
    .attr('class', 'row-label')
    .attr('x', -8)
    .attr('y', rowH / 2)
    .attr('dominant-baseline', 'central')
    .attr('text-anchor', 'end')
    .style('font-size', '13px')
    .style('fill', '#153750')
    .style('cursor', d => (isClickable(d.raw) ? 'pointer' : 'default'))
    .text(d => truncate(d.label, 32))
    .on('mouseover', function (event, d) {
      if (isClickable(d.raw)) d3.select(this).style('text-decoration', 'underline')
      showTooltip(event, d)
    })
    .on('mousemove', positionTooltip)
    .on('mouseout', function () {
      d3.select(this).style('text-decoration', null)
      tooltip.style('opacity', 0)
    })
    .on('click', (_event, d) => {
      if (isClickable(d.raw)) onRowClick(d.raw)
    })

  // Hover / click target — one transparent rect spanning the row's bar. Sits above the
  // segments so it captures all bar-area pointer events.
  rowGroups.append('rect')
    .attr('class', 'hover-target')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', d => x(d.obligations))
    .attr('height', rowH)
    .attr('fill', 'transparent')
    .style('cursor', d => (isClickable(d.raw) ? 'pointer' : 'default'))
    .on('mouseover', function (event, d) { showTooltip(event, d) })
    .on('mousemove', positionTooltip)
    .on('mouseout', () => tooltip.style('opacity', 0))
    .on('click', (_event, d) => {
      if (isClickable(d.raw)) onRowClick(d.raw)
    })

  // Value label always sits to the right of the bar in dark text — matches the
  // state drill-down chart. Right margin above is sized to fit "$1.2B".
  rowGroups.append('text')
    .attr('x', d => x(d.obligations) + 6)
    .attr('y', rowH / 2)
    .attr('dominant-baseline', 'central')
    .attr('text-anchor', 'start')
    .style('font-size', '13px')
    .style('fill', '#153750')
    .style('pointer-events', 'none')
    .text(d => formatCurrency(d.obligations))

}

function ensureTooltip() {
  let tip = d3.select<HTMLDivElement, unknown>('.tooltip-federal-drilldown')
  if (tip.empty()) {
    tip = d3.select('body').append('div')
      .attr('class', 'tooltip tooltip-federal-drilldown tooltip-stacked-bar')
      .style('opacity', 0) as any
  }
  return tip
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
