import * as d3 from 'd3'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Box, CircularProgress, IconButton, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { PALETTE_7, CURRENT_YEAR } from '../../constants'
import { formatCurrency } from '../../util'
import { useTooltipCleanup, useVizSize } from '../../hooks'
import { loadFederalComposition, FederalCompositionRow } from '../../loadFederalData'
import { YearSlider } from '../YearSlider'
import { DownloadDataButton } from '../DownloadDataButton'
import { useTrackInteract } from '../TrackedEmbed'
import { composition, CompositionQuery, useFederalYears } from '../../staticData'

// The year range (FY_MIN to FY_MAX) comes from the data: federal/summary.json's fyMin and
// fyMax, the last complete fiscal year when the files were built. The in-progress FY's
// USAspending snapshot is partial and produces misleading slices.

type Level = 'authority' | 'recipient_type' | 'department' | 'award_type'
type DrillableLevel = Exclude<Level, 'award_type'>

const NEXT_LEVEL: Record<Level, Level | null> = {
  authority: 'recipient_type',
  recipient_type: 'department',
  department: 'award_type',
  award_type: null
}

const LEVEL_LABELS: Record<Level, string> = {
  authority: 'Budget Authority',
  recipient_type: 'Recipient Type',
  department: 'Department/Agency',
  award_type: 'Award Type'
}

// Use the same brand 7-category palette at every drill level so the color
// vocabulary stays consistent — the previous slate ramp at the authority
// level visibly diverged from PALETTE_7 once you drilled in.
const OTHER_COLOR = '#c4c4c4'
// Slices below this share of total get rolled up into a synthetic "Other"
// slice so the chart doesn't fill with leader-line labels for tiny segments.
const OTHER_THRESHOLD_PCT = 5

function rollupSmallSlices(rows: FederalCompositionRow[]): FederalCompositionRow[] {
  if (!rows.length) return rows
  const total = rows.reduce((s, r) => s + r.obligations, 0)
  const cutoff = (total * OTHER_THRESHOLD_PCT) / 100
  const big: FederalCompositionRow[] = []
  const small: { name: string; value: number }[] = []
  for (const r of rows) {
    if (r.obligations >= cutoff) big.push(r)
    else small.push({ name: r.name, value: r.obligations })
  }
  if (small.length === 0) return rows
  // Don't bother rolling up a single small slice — there's nothing to "merge".
  if (small.length === 1) {
    big.push({ name: small[0].name, obligations: small[0].value })
    return big
  }
  big.push({
    name: 'Other',
    obligations: small.reduce((s, x) => s + x.value, 0),
    mergedSegments: small
  })
  return big
}

interface DrillStep {
  level: DrillableLevel
  selectedName: string
  // Snapshot of the donut at the moment the user drilled in. Powers the
  // sidebar mini-donuts without re-fetching, and stays as a navigation history
  // (intentionally not refreshed on fy change — clicking a crumb refetches).
  slices: FederalCompositionRow[]
}

type DrillDirection = 'forward' | 'backward' | 'none'

interface TransitionOrigin {
  direction: DrillDirection
  // Set when a backward nav happens via a crumb click — viewport rect of the
  // crumb at the moment of click. drawMainDonut converts it into svg-local
  // coords so the new donut appears to grow out of the crumb.
  crumbRect?: { left: number; top: number; width: number; height: number }
}

export function FederalComposition() {
  useTooltipCleanup()
  const { fyMin: FY_MIN, fyMax: FY_MAX } = useFederalYears()
  const [fy, setFy] = useState(CURRENT_YEAR - 1)
  // Open on the data's last year once it has loaded (it differs from the calendar's once the
  // data stops being refreshed).
  useEffect(() => setFy(FY_MAX), [FY_MAX])
  const [path, setPath] = useState<DrillStep[]>([])
  const report = useTrackInteract()
  const [currentLevel, setCurrentLevel] = useState<Level>('authority')
  const [slices, setSlices] = useState<FederalCompositionRow[] | null>(null)
  const [grandTotal, setGrandTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Origin of the most recent navigation, read by the donut redraw effect to
  // pick which way to slide. Lives in a ref so it doesn't trigger re-renders.
  const transitionOriginRef = useRef<TransitionOrigin>({ direction: 'forward' })

  // Build the API filter set from the current drill path.
  const filters = useMemo(() => {
    const f: { fy: number; authority?: string; recipientType?: string; department?: string } = { fy }
    for (const step of path) {
      if (step.level === 'authority') f.authority = step.selectedName
      else if (step.level === 'recipient_type') f.recipientType = step.selectedName
      else if (step.level === 'department') f.department = step.selectedName
    }
    return f
  }, [fy, path])

  useEffect(() => {
    setLoading(true)
    setError(null)
    let cancelled = false
    // Run the filtered fetch and the unfiltered (FY-only) "grand total" fetch
    // in parallel and batch the state updates. At root they share a cache key;
    // when drilled, the grand total query is a cheap extra round-trip.
    // Both must update together so the donut redraw sees a consistent
    // current-total + grand-total pair (avoids a stale-grand-total flash).
    Promise.all([
      loadFederalComposition(filters),
      loadFederalComposition({ fy })
    ])
      .then(([sliceRows, grandRows]) => {
        if (cancelled) return
        setSlices(rollupSmallSlices(sliceRows))
        setGrandTotal(grandRows.reduce((s, r) => s + r.obligations, 0))
      })
      .catch(e => { if (!cancelled) setError(String(e?.message ?? e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filters, fy])

  const onSliceClick = (slice: FederalCompositionRow) => {
    if (currentLevel === 'award_type') return // leaf — no further drill
    if (slice.name === 'Other') return // synthetic rollup — has no single filter value
    if (!slices) return
    const next = NEXT_LEVEL[currentLevel]
    if (!next) return
    // What was drilled into, not just that a drill happened — the value is the whole point.
    report(`drill-${currentLevel}`, slice.name)
    transitionOriginRef.current = { direction: 'forward' }
    setPath(prev => [...prev, {
      level: currentLevel as DrillableLevel,
      selectedName: slice.name,
      slices
    }])
    setCurrentLevel(next)
  }

  const onCrumbClick = (idx: number, crumbRect: DOMRect | null) => {
    // Click on a sidebar crumb pops the drill back to that level. The crumb at
    // index i represents "I was at level path[i].level when I selected
    // path[i].selectedName" — clicking it returns to viewing that level. We
    // capture the crumb's viewport rect now so the entering donut animation
    // can start at the crumb's position.
    const target = path[idx]
    transitionOriginRef.current = {
      direction: 'backward',
      crumbRect: crumbRect
        ? { left: crumbRect.left, top: crumbRect.top, width: crumbRect.width, height: crumbRect.height }
        : undefined
    }
    report('breadcrumb-back', target.level)
    setPath(prev => prev.slice(0, idx))
    setCurrentLevel(target.level)
  }

  // Append-only breadcrumb segments. First segment establishes the entry point
  // (FY + top-level label); each drill click adds one segment containing only
  // the selected name — the donut's own labels tell users what level they're
  // viewing, so duplicating that here would be visual noise.
  const breadcrumbSegments = useMemo(() => {
    const out: { label: string; isCurrent: boolean }[] = []
    out.push({
      label: `FY ${fy} Budget Authorities`,
      isCurrent: path.length === 0
    })
    for (let i = 0; i < path.length; i++) {
      out.push({
        label: path[i].selectedName,
        isCurrent: i === path.length - 1
      })
    }
    return out
  }, [fy, path])

  return (
    <div className="FederalComposition fade-in">
      <Box p={2} display="flex" flexDirection="column" alignItems="center" gap={2}>
        <Box
          display="flex"
          flexWrap="wrap"
          alignItems="center"
          justifyContent="center"
          rowGap={0.5}
          columnGap={0.75}
          sx={{ maxWidth: 800 }}
        >
          {breadcrumbSegments.map((seg, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <Box component="span" sx={{ color: '#94a3b8', userSelect: 'none', fontWeight: 400 }}>
                  /
                </Box>
              )}
              <Typography
                variant="h6"
                component="span"
                onClick={
                  seg.isCurrent
                    ? undefined
                    : e => onCrumbClick(i, (e.currentTarget as HTMLElement).getBoundingClientRect())
                }
                sx={{
                  color: seg.isCurrent ? '#153750' : '#475569',
                  fontWeight: seg.isCurrent ? 600 : 500,
                  lineHeight: 1.25,
                  cursor: seg.isCurrent ? 'default' : 'pointer',
                  '&:hover': seg.isCurrent
                    ? {}
                    : { color: '#0c5a9a', textDecoration: 'underline' }
                }}
              >
                {seg.label}
              </Typography>
            </Fragment>
          ))}
        </Box>
        {/* Download sits beside the slider rather than on its own row, and to its right as in
            every other chart. The three columns keep the slider centred under the heading and
            the donut — flexed against the button it would drift by half the icon — and
            `flex-end` plus the 3px nudge line the icon up with the track, not the label. */}
        <Box
          display="grid"
          alignItems="flex-end"
          columnGap={2}
          sx={{ gridTemplateColumns: '1fr auto 1fr' }}
        >
          {/* Both explicit: auto-placement would put the slider in column 1 and shove it a
              whole column left of centre. The empty column 1 and the icon's column 3 are
              equal `1fr` tracks, so they balance and the slider lands dead centre. */}
          <Box sx={{ gridColumn: 2 }}>
            <YearSlider
              value={fy}
              onChange={(e: any) => {
                // Year changes preserve the drill path but shouldn't trigger a
                // slide animation (which would imply forward/backward navigation).
                transitionOriginRef.current = { direction: 'none' }
                setFy(Number(e.target.value))
              }}
              min={FY_MIN}
              max={FY_MAX}
              step={1}
              centerLabel
            />
          </Box>
          <Box mb="3px" sx={{ gridColumn: 3, justifySelf: 'start' }}>
            {/* Exports the level currently on screen — the breadcrumb says which that is, so
                the download follows the drill rather than dumping every level — but across
                every year the slider covers: the year is how you browse a hierarchy, not a
                statement about which data you want, and one year here is a couple of rows. */}
            <DownloadDataButton
              filename={`federal-composition-${currentLevel}`}
              scope={`FY ${FY_MIN}\u2013${FY_MAX} \u00b7 ${currentLevel} level`}
              getRows={async () => {
                const q: CompositionQuery = { fy, allYears: true }
                for (const step of path) {
                  if (step.level === 'authority') q.authority = step.selectedName
                  if (step.level === 'recipient_type') q.recipientType = step.selectedName
                  if (step.level === 'department') q.department = step.selectedName
                }
                const rows = await composition(q)
                return rows.map(row => ({
                  fiscal_year: row.fiscal_year,
                  level: currentLevel,
                  path: path.map(pp => pp.selectedName).join(' > '),
                  name: row.name,
                  obligations: row.obligations
                }))
              }}
            />
          </Box>
        </Box>
        <Box
          display="flex"
          sx={{
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'center', md: 'flex-start' }
          }}
          gap={2}
          width="100%"
          justifyContent="center"
        >
          <DrillSidebar path={path} onCrumbClick={onCrumbClick} />
          <MainDonut
            slices={slices}
            grandTotal={grandTotal}
            level={currentLevel}
            fy={fy}
            loading={loading}
            error={error}
            onSliceClick={onSliceClick}
            transitionOriginRef={transitionOriginRef}
          />
        </Box>
      </Box>
    </div>
  )
}

// --- Color mapping ----------------------------------------------------------

function colorFor(name: string, indexInSlices: number): string {
  if (name === 'Other') return OTHER_COLOR
  return PALETTE_7[indexInSlices % (PALETTE_7.length - 1)]
}

// --- DrillSidebar -----------------------------------------------------------

function DrillSidebar({
  path,
  onCrumbClick
}: {
  path: DrillStep[]
  onCrumbClick: (i: number, rect: DOMRect | null) => void
}) {
  // Always rendered (even with an empty path) so a CSS transition can animate
  // its appearance instead of the flex layout reflowing in one instantaneous
  // jump on the first drill click. width animates on desktop (column layout),
  // max-height on mobile (row above the donut).
  const visible = path.length > 0
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'row', md: 'column' },
        alignItems: 'center',
        gap: visible ? 1 : 0,
        background: '#f3f4f6',
        borderRadius: 2,
        flexWrap: 'wrap',
        alignSelf: { xs: 'stretch', md: 'flex-start' },
        overflow: 'hidden',
        flex: { md: visible ? '0 0 140px' : 0 },
        width: { md: visible ? 140 : 0 },
        maxHeight: { xs: visible ? 600 : 0, md: 'none' },
        opacity: visible ? 1 : 0,
        p: visible ? 1.5 : 0,
        transition:
          'width 320ms ease-out, max-height 320ms ease-out, padding 250ms ease-out, opacity 200ms ease-out'
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          color: '#475569',
          width: { md: '100%' },
          textAlign: 'center'
        }}
      >
        Previously Selected
      </Typography>
      {path.map((step, i) => (
        <Fragment key={i}>
          <DrillCrumb step={step} index={i} onClick={rect => onCrumbClick(i, rect)} />
          {i < path.length - 1 && <CrumbArrow />}
        </Fragment>
      ))}
    </Box>
  )
}

function CrumbArrow() {
  return (
    <Box sx={{ color: '#94a3b8', fontSize: 14, lineHeight: 1, userSelect: 'none' }}>
      <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>↓</Box>
      <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>→</Box>
    </Box>
  )
}

function DrillCrumb({
  step,
  index,
  onClick
}: {
  step: DrillStep
  index: number
  onClick: (rect: DOMRect | null) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!svgRef.current) return
    drawMiniDonut(svgRef.current, step.slices, step.selectedName)
  }, [step])

  // Capture the donut SVG's rect at click time so the main donut's enter
  // animation can grow out of the crumb's actual on-screen position.
  const handleClick = () => {
    onClick(svgRef.current?.getBoundingClientRect() ?? null)
  }

  // Selected slice's share of the parent level — gives "you drilled into 54%
  // of the total" context without needing to remember the parent tooltip.
  const selectedSlice = step.slices.find(s => s.name === step.selectedName)
  const parentTotal = step.slices.reduce((sum, s) => sum + s.obligations, 0)
  const selectedValue = selectedSlice?.obligations ?? 0
  const selectedPct = parentTotal > 0 ? (selectedValue / parentTotal) * 100 : 0
  const pctDisplay = selectedPct >= 10 ? selectedPct.toFixed(0) : selectedPct.toFixed(1)

  return (
    <Box
      data-crumb-index={index}
      onClick={handleClick}
      sx={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.25,
        pt: 0.5,
        '&:hover': { opacity: 0.9 },
        '&:hover .crumb-close': { opacity: 1 }
      }}
    >
      {/* Inner wrapper sized to the SVG so the X stays anchored to the donut,
          not the variable-width text label below it. */}
      <Box sx={{ position: 'relative', width: 70, height: 70 }}>
        <IconButton
          className="crumb-close"
          aria-label="Remove from path"
          size="small"
          onClick={e => {
            e.stopPropagation()
            handleClick()
          }}
          sx={{
            position: 'absolute',
            top: -4,
            right: -4,
            padding: '2px',
            backgroundColor: 'white',
            color: '#94a3b8',
            opacity: 0.7,
            transition: 'opacity 120ms ease-out, color 120ms ease-out, background-color 120ms ease-out',
            boxShadow: '0 0 0 1px #e2e8f0',
            '&:hover': { color: '#475569', backgroundColor: '#f1f5f9' }
          }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
        <svg ref={svgRef} width={70} height={70} aria-hidden />
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          color: '#1e293b',
          textAlign: 'center',
          maxWidth: 150,
          lineHeight: 1.2
        }}
      >
        {step.selectedName}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.7rem',
          color: '#64748b',
          textAlign: 'center',
          lineHeight: 1.2,
          mt: 0.25
        }}
      >
        {formatCurrency(selectedValue)} · {pctDisplay}%
      </Typography>
    </Box>
  )
}

function drawMiniDonut(
  svgEl: SVGSVGElement,
  slices: FederalCompositionRow[],
  selectedName: string
) {
  const size = 70
  const r = size / 2 - 2
  const innerR = r * 0.55

  const svg = d3.select(svgEl).attr('width', size).attr('height', size)
  svg.selectAll('*').remove()
  const g = svg.append('g').attr('transform', `translate(${size / 2}, ${size / 2})`)

  const pie = d3.pie<FederalCompositionRow>().value(d => d.obligations).sort(null)
  const arc = d3.arc<d3.PieArcDatum<FederalCompositionRow>>().innerRadius(innerR).outerRadius(r)

  g.selectAll('path')
    .data(pie(slices))
    .join('path')
    .attr('d', arc as any)
    .attr('fill', d => {
      if (d.data.name === selectedName) {
        return colorFor(d.data.name, slices.findIndex(s => s.name === selectedName))
      }
      return '#e2e8f0' // ghost the unselected slices
    })
}

// --- MainDonut --------------------------------------------------------------

interface MainDonutProps {
  slices: FederalCompositionRow[] | null
  grandTotal: number | null
  level: Level
  fy: number
  loading: boolean
  error: string | null
  onSliceClick: (slice: FederalCompositionRow) => void
  transitionOriginRef: React.MutableRefObject<TransitionOrigin>
}

function MainDonut({ slices, grandTotal, level, fy, loading, error, onSliceClick, transitionOriginRef }: MainDonutProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const vizSize = useVizSize()
  const isLeaf = level === 'award_type'

  // Keep the click handler in a ref so the redraw effect doesn't see it as a
  // changed dep on every parent render. Without this, each `loading` flip and
  // each parent re-render kicks off a fresh exit/enter animation cycle —
  // visually a stuttering ping-pong of donuts.
  const onSliceClickRef = useRef(onSliceClick)
  useEffect(() => {
    onSliceClickRef.current = onSliceClick
  }, [onSliceClick])

  // Redraw ONLY when slices actually change. `level` and `isLeaf` are read via
  // closure but intentionally excluded from deps: between a click and the API
  // response, `level` updates instantly while `slices` lags by one render —
  // including them in deps would cause an extra redraw with stale slices and
  // new colors, producing a visible ping-pong animation.
  useEffect(() => {
    if (!svgRef.current || !slices) return
    const click = isLeaf ? null : (s: FederalCompositionRow) => onSliceClickRef.current(s)
    drawMainDonut(svgRef.current, slices, grandTotal, fy, level, vizSize, click, transitionOriginRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slices, fy, vizSize])

  // While a fresh fetch is in flight but we still have a previous donut showing,
  // dim the SVG and overlay a spinner. Gives instant "ack" feedback on slow API
  // calls; on cache hits the loading flag flips back too fast to flash.
  const showOverlay = loading && !!slices
  return (
    <Box
      flex="1"
      display="flex"
      flexDirection="column"
      alignItems="center"
      minHeight={460}
      sx={{ position: 'relative' }}
    >
      {error && <Typography color="error">Failed to load: {error}</Typography>}
      {loading && !slices && <CircularProgress size={32} sx={{ my: 8 }} />}
      {slices && slices.length === 0 && !loading && (
        <Typography color="text.secondary" sx={{ my: 8 }}>
          No data for this filter in FY {fy}.
        </Typography>
      )}
      <svg
        ref={svgRef}
        style={{
          opacity: showOverlay ? 0.35 : 1,
          transition: 'opacity 150ms ease-out'
        }}
      ></svg>
      {showOverlay && (
        <CircularProgress
          size={40}
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none'
          }}
        />
      )}
    </Box>
  )
}

const ENTER_DURATION = 350
const EXIT_DURATION = 320

function drawMainDonut(
  svgEl: SVGSVGElement,
  slices: FederalCompositionRow[],
  grandTotal: number | null,
  fy: number,
  level: Level,
  vizSize: { width: number; height: number },
  onSliceClick: ((slice: FederalCompositionRow) => void) | null,
  origin: TransitionOrigin
) {
  const containerWidth = Math.max(Math.min(vizSize.width, 800), 480) - 30
  const containerHeight = Math.max(vizSize.height - 200, 460)
  const margin = { top: 10, right: 110, bottom: 30, left: 110 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom
  const cx = margin.left + width / 2
  const cy = margin.top + height / 2

  // overflow: visible lets the leader-line labels extend past the SVG's natural
  // bounding box. Long department names ("Department of Health and Human Services")
  // are wider than a single side-margin can hold; without this they get clipped
  // by the SVG's default hidden overflow.
  const svg = d3
    .select(svgEl)
    .attr('width', containerWidth)
    .attr('height', containerHeight)
    .style('overflow', 'visible')
  // Cap the donut radius so leader-line labels (which extend ~280px past the
  // ring for long department names) stay near the center and don't run into
  // the sidebar.
  const outerR = Math.min(Math.min(width, height) / 2 - 10, 165)
  const innerR = outerR * 0.6

  // Pick exit destination + enter origin based on navigation direction.
  // Forward (drilling) → old slides toward the just-added crumb (so the
  //   direction depends on where that crumb sits in the sidebar — first
  //   crumb is upper-left, later ones farther down). Falls back to plain
  //   off-left if no crumb element is found.
  // Backward (popping) → old slides off-right; new enters from the clicked
  //   crumb's actual position when known.
  const direction = origin.direction
  const svgRect = svgEl.getBoundingClientRect()

  let exitTransform: string
  if (direction === 'forward') {
    // The new crumb has already mounted by the time this runs (React rendered
    // it on the click → state update; the redraw fires later when API data
    // arrives). Highest data-crumb-index === most recently added.
    const crumbs = document.querySelectorAll<HTMLElement>('[data-crumb-index]')
    const targetCrumb = crumbs[crumbs.length - 1] ?? null
    if (targetCrumb) {
      const r = targetCrumb.getBoundingClientRect()
      const tx = r.left + r.width / 2 - svgRect.left
      const ty = r.top + r.height / 2 - svgRect.top
      const ts = r.width / (2 * outerR)
      exitTransform = `translate(${tx}, ${ty}) scale(${ts})`
    } else {
      exitTransform = `translate(${-margin.left}, ${cy}) scale(0.4)`
    }
  } else {
    exitTransform = `translate(${containerWidth + margin.right}, ${cy}) scale(0.4)`
  }

  let enterFromX = direction === 'forward' ? cx + 60 : cx - 60
  let enterFromY = cy
  let enterFromScale = 0.95
  if (direction === 'backward' && origin.crumbRect) {
    enterFromX = origin.crumbRect.left + origin.crumbRect.width / 2 - svgRect.left
    enterFromY = origin.crumbRect.top + origin.crumbRect.height / 2 - svgRect.top
    enterFromScale = origin.crumbRect.width / (2 * outerR)
  }

  const animate = direction !== 'none'

  if (animate) {
    // Animate the previous donut out: shrink and slide off, then remove.
    // Disable pointer-events immediately so a mid-flight donut can't intercept
    // hovers intended for the incoming one.
    svg.selectAll<SVGGElement, unknown>('.donut-content')
      .interrupt('enter')
      .style('pointer-events', 'none')
      .transition('exit')
      .duration(EXIT_DURATION)
      .ease(d3.easeCubicIn)
      .attr('transform', exitTransform)
      .style('opacity', 0)
      .remove()
  } else {
    // Non-drill update (e.g. year change) — snap, no slide.
    svg.selectAll<SVGGElement, unknown>('.donut-content').interrupt().remove()
  }

  if (!slices.length) return // empty state — JSX renders the "No data" message

  const total = d3.sum(slices, s => s.obligations)
  const pie = d3.pie<FederalCompositionRow>().value(d => d.obligations).sort(null)
  const arcs = pie(slices)

  const arc = d3.arc<d3.PieArcDatum<FederalCompositionRow>>()
    .innerRadius(innerR)
    .outerRadius(outerR)
    .padAngle(0.005)

  // Incoming donut. With animation, starts at the entry origin (forward: right
  // of center; backward: at the clicked crumb's position) and slides into
  // place. Without animation (e.g. year change), it just appears at its final
  // position. The .donut-content class is what the next render's exit
  // animation targets.
  const g = svg.append('g').attr('class', 'donut-content')
  if (animate) {
    g.attr('transform', `translate(${enterFromX}, ${enterFromY}) scale(${enterFromScale})`)
      .style('opacity', 0)
    g.transition('enter')
      .duration(ENTER_DURATION)
      .ease(d3.easeCubicOut)
      .attr('transform', `translate(${cx}, ${cy}) scale(1)`)
      .style('opacity', 1)
  } else {
    g.attr('transform', `translate(${cx}, ${cy})`)
  }

  // Tooltip
  let tooltip = d3.select<HTMLDivElement, unknown>('.tooltip-federal-composition')
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip tooltip-federal-composition tooltip-stacked-bar')
      .style('opacity', 0) as any
  }

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

  // Slices
  g.selectAll('.slice')
    .data(arcs)
    .join('path')
    .attr('class', 'slice')
    .attr('d', arc as any)
    .attr('fill', d => colorFor(d.data.name, slices.indexOf(d.data)))
    .style('cursor', d => (onSliceClick && d.data.name !== 'Other' ? 'pointer' : 'default'))
    .on('mouseover', function (event, d) {
      const pct = total > 0 ? (d.data.obligations / total) * 100 : 0
      const dotColor = colorFor(d.data.name, slices.indexOf(d.data))
      const isOther = d.data.name === 'Other' && d.data.mergedSegments && d.data.mergedSegments.length > 0
      let html = `<div style="padding:5px 0"><span style="color:${dotColor}">●</span> <strong>${d.data.name}</strong></div>`
      html += `<div class="labelvalue2 cols-2"><span>Obligations:</span><span style="text-align:right;font-weight:600">${formatCurrency(d.data.obligations)}</span></div>`
      html += `<div class="labelvalue2 cols-2"><span>Share of FY ${fy}:</span><span style="text-align:right">${pct.toFixed(1)}%</span></div>`
      if (isOther) {
        html += `<div style="border-top:1px solid #555;margin-top:6px;padding-top:6px;font-size:11px;opacity:0.85">Includes:</div>`
        const sorted = [...d.data.mergedSegments!].sort((a, b) => b.value - a.value)
        for (const seg of sorted) {
          html += `<div class="labelvalue2 cols-2" style="opacity:0.85"><span>${seg.name}</span><span style="text-align:right">${formatCurrency(seg.value)}</span></div>`
        }
      } else if (onSliceClick) {
        html += `<div style="border-top:1px solid #555;margin-top:6px;padding-top:6px;font-size:11px;opacity:0.75">Click to drill in →</div>`
      }
      tooltip.style('opacity', 1).html(html)
      positionTooltip(event as MouseEvent)
    })
    .on('mousemove', positionTooltip)
    .on('mouseout', () => tooltip.style('opacity', 0))
    .on('click', (_event, d) => {
      if (onSliceClick && d.data.name !== 'Other') onSliceClick(d.data)
    })

  // Inline leader-line labels. Small slices were already merged into "Other"
  // upstream, so the slices reaching this point are all comfortably visible.
  const labelRadius = outerR + 15
  const labelArc = d3.arc<d3.PieArcDatum<FederalCompositionRow>>()
    .innerRadius(labelRadius)
    .outerRadius(labelRadius)
  const midAngle = (d: d3.PieArcDatum<FederalCompositionRow>) =>
    d.startAngle + (d.endAngle - d.startAngle) / 2

  // Resolve label collisions: if two adjacent slices (e.g. small slivers at the
  // top) would have nearly the same Y, labels overlap. Walk each side
  // top-to-bottom and enforce a minimum vertical gap between consecutive labels.
  const minLabelGap = 18
  const labelY = new Map<d3.PieArcDatum<FederalCompositionRow>, number>()
  for (const side of [-1, 1] as const) {
    // -1 = left side (mid >= π), 1 = right side (mid < π)
    const sideArcs = arcs
      .filter(a => (midAngle(a) < Math.PI ? 1 : -1) === side)
      .map(a => ({ a, y: labelArc.centroid(a)[1] }))
      .sort((p, q) => p.y - q.y)
    for (let i = 0; i < sideArcs.length; i++) {
      if (i > 0 && sideArcs[i].y - sideArcs[i - 1].y < minLabelGap) {
        sideArcs[i].y = sideArcs[i - 1].y + minLabelGap
      }
    }
    for (const p of sideArcs) labelY.set(p.a, p.y)
  }

  g.selectAll('.leader')
    .data(arcs)
    .join('polyline')
    .attr('class', 'leader')
    .attr('stroke', '#aaa')
    .attr('fill', 'none')
    .attr('stroke-width', 1)
    .style('pointer-events', 'none')
    .attr('points', d => {
      const posA = arc.centroid(d)
      const yAdj = labelY.get(d) ?? labelArc.centroid(d)[1]
      const posB: [number, number] = [labelArc.centroid(d)[0], yAdj]
      const posC: [number, number] = [(labelRadius + 10) * (midAngle(d) < Math.PI ? 1 : -1), yAdj]
      return [posA, posB, posC].map(p => p.join(',')).join(' ')
    })

  g.selectAll('.label')
    .data(arcs)
    .join('text')
    .attr('class', 'label')
    .attr('dy', '0.35em')
    .style('font-size', 'var(--font-size-sm)')
    .style('pointer-events', 'none')
    .attr('text-anchor', d => (midAngle(d) < Math.PI ? 'start' : 'end'))
    .attr('transform', d => {
      const yAdj = labelY.get(d) ?? labelArc.centroid(d)[1]
      const pos: [number, number] = [(labelRadius + 14) * (midAngle(d) < Math.PI ? 1 : -1), yAdj]
      return `translate(${pos})`
    })
    .text(d => `${d.data.name}: ${formatCurrency(d.data.obligations)}`)

  // Center label. Two-line orientation header ("Breakdown by" / "[Level]") on
  // top, current total below, with an inline "of $X" continuation when drilled
  // in. FY isn't shown here — it's already in the breadcrumb and year slider
  // above.
  // Center label uses three typographic roles:
  //  - caption (gray, regular) — "Breakdown by", "of $X"
  //  - label   (gray, bold)    — the level name
  //  - hero    (navy, bold)    — the current total
  // FY isn't shown here — it's already in the breadcrumb and year slider above.
  const hasComparison = grandTotal != null && Math.round(grandTotal) > Math.round(total)
  const CAPTION_COLOR = '#697d8e'
  const CAPTION_SIZE = '12px'
  g.append('text')
    .attr('text-anchor', 'middle')
    .attr('y', -26)
    .style('font-size', CAPTION_SIZE)
    .style('fill', CAPTION_COLOR)
    .text('Breakdown by')
  g.append('text')
    .attr('text-anchor', 'middle')
    .attr('y', -10)
    .style('font-size', CAPTION_SIZE)
    .style('font-weight', '600')
    .style('fill', CAPTION_COLOR)
    .text(LEVEL_LABELS[level])
  const totalText = g.append('text')
    .attr('text-anchor', 'middle')
    .attr('y', 14)
    .style('font-size', '20px')
    .style('font-weight', '600')
    .style('fill', '#153750')
    .text(formatCurrency(total))
  if (hasComparison) {
    totalText.append('tspan')
      .attr('dx', '5')
      .style('font-size', CAPTION_SIZE)
      .style('fill', CAPTION_COLOR)
      .text(`of ${formatCurrency(grandTotal!)}`)
  }
}
