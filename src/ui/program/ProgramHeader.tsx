import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Link, Stack, Typography } from '@mui/material'
import { formatCurrencyPrecise } from '../../util'
import { CURRENT_FISCAL_YEAR } from '../../constants'
import type { ProgramDetail, ProgramSummary } from '../../loadProgramData'
import { StatTiles, type Tile } from './chrome'
import { ProgramSearch } from './ProgramSearch'

/**
 * The navy record header and the five headline tiles.
 *
 * Two separate elements, not one that resizes: the full navy header scrolls away as
 * ordinary content, and a compact navy bar (search + which program you're on) slides in
 * over the page once the full header is gone. A full-height sticky header would eat a
 * third of the screen on a page this long.
 *
 * It's written this way because the obvious version — one sticky header that collapses
 * when it sticks — breaks in two ways, both of which QA hit:
 *
 *  1. **It shifts the page under the reader.** A sticky box still occupies its flow space,
 *     so collapsing it yanks ~250px out of the layout at the exact moment it sticks:
 *     everything below jumps up, and the browser's scroll anchoring fights back by
 *     adjusting the scroll position, which can move the collapse trigger back into view
 *     and set the thing oscillating. The compact bar here is *out of flow* (it lives in a
 *     zero-height sticky wrapper and overflows it), so toggling it moves nothing.
 *  2. **It doesn't actually stay stuck.** A sticky element can only travel inside its
 *     containing block, and that used to be this component's own wrapper — so it slid back
 *     off the top the moment the reader passed the stat tiles. The zero-height wrapper is
 *     returned as a *sibling* of the sections (this component renders a fragment, no
 *     wrapper Box), which makes the page container the containing block and the bar
 *     therefore stick for the whole page — and drop away by itself at the end of it.
 *
 * Keep those two properties if you touch this: nothing about the stuck state may change
 * document flow, and the sticky wrapper must not be nested in a box that ends early.
 *
 * "Most recent" throughout means the latest fiscal year with a final appropriation, which is
 * usually the fiscal year we're in or one ahead — the biennium bill enacts FY2026 and FY2027
 * during the 2026 session. FY comparisons use CURRENT_FISCAL_YEAR (state FY, July–June), not
 * the calendar year, so the year we're actually in isn't labelled as a future one.
 */

const DESCRIPTION_CLAMP = 320

/**
 * Teal for text sitting on the navy header.
 *
 * Not the brand `#008f8c` used everywhere else: on `#153750` that measures 3.1:1, under the
 * 4.5:1 needed for text this size. This is the same tint the "more" link already used here,
 * at 7.2:1. Anywhere teal meets white or grey, use the brand teal.
 */
const TEAL_ON_NAVY = '#7fd4d2'

interface Props {
  detail: ProgramDetail
  programs: ProgramSummary[]
  onSelect: (p: ProgramSummary | null) => void
}

export function ProgramHeader({ detail, programs, onSelect }: Props) {
  const { program, overTime, mofByYear } = detail
  const [expanded, setExpanded] = useState(false)
  const [stuck, setStuck] = useState(false)
  const fullHeaderRef = useRef<HTMLDivElement>(null)

  // Show the compact bar once the full header has left the top of the viewport. Watching
  // the header itself (rather than a sentinel) means the trigger follows its real height,
  // so expanding the description doesn't put the handoff in the wrong place. The `top < 0`
  // test distinguishes "scrolled off the top" from "not reached yet", which matters in an
  // embed: the whole page can sit below the fold, and that isn't stuck.
  useEffect(() => {
    const el = fullHeaderRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const tiles = useMemo<Tile[]>(() => {
    const withDollars = overTime.filter(r => r.dollars > 0)
    const latest = withDollars[withDollars.length - 1]
    const prior = withDollars[withDollars.length - 2]

    const total = overTime.reduce((s, r) => s + (r.dollars || 0), 0)
    const positions = latest ? (latest.perm_positions || 0) + (latest.temp_positions || 0) : 0
    const sources = latest
      ? new Set(mofByYear.filter(m => m.fiscal_year === latest.fiscal_year).map(m => m.mof_description)).size
      : 0

    let yoy = '—'
    let yoyNote: string | undefined
    if (latest && prior && prior.dollars > 0) {
      const pct = ((latest.dollars - prior.dollars) / prior.dollars) * 100
      const sign = pct > 0 ? '+' : ''
      yoy = `${sign}${pct.toFixed(1)}%`
      yoyNote = `${sign}${formatCurrencyPrecise(latest.dollars - prior.dollars)} vs FY ${prior.fiscal_year}`
    }

    const fmtPositions = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
    const fyNote = latest
      ? `FY ${latest.fiscal_year}${
          latest.fiscal_year === CURRENT_FISCAL_YEAR
            ? ' (current FY)'
            : latest.fiscal_year > CURRENT_FISCAL_YEAR
              ? ' (enacted, future FY)'
              : ''
        }`
      : undefined

    // Order per QA: headline figure, then how it changed, then the operational detail,
    // then the all-years total last.
    return [
      {
        label: 'Most Recent Appropriation',
        value: latest ? formatCurrencyPrecise(latest.dollars) : '—',
        note: fyNote
      },
      { label: 'Gain/Loss from Previous FY', value: yoy, note: yoyNote },
      {
        label: 'Most Recent Positions',
        value: latest ? fmtPositions(positions) : '—',
        note:
          latest && positions > 0
            ? `${fmtPositions(latest.perm_positions || 0)} permanent · ${fmtPositions(
                latest.temp_positions || 0
              )} temporary`
            : undefined
      },
      {
        label: 'Most Recent Funding Sources',
        value: sources ? String(sources) : '—',
        note: latest ? `means of financing, FY ${latest.fiscal_year}` : undefined
      },
      {
        label: 'Total Appropriated (All FYs)',
        value: formatCurrencyPrecise(total),
        note: overTime.length
          ? `FY ${overTime[0].fiscal_year}–${overTime[overTime.length - 1].fiscal_year}`
          : undefined
      }
    ]
  }, [overTime, mofByYear])

  const fiscalYears =
    program.first_fy === program.last_fy ? `${program.first_fy}` : `${program.first_fy}–${program.last_fy}`

  const description = program.program_description?.replace(/\s*\n\s*/g, ' ').trim() ?? ''
  const isLong = description.length > DESCRIPTION_CLAMP
  const shown = isLong && !expanded ? description.slice(0, DESCRIPTION_CLAMP).trimEnd() + '…' : description

  const selected = programs.find(p => p.program_id === program.program_id) ?? null

  return (
    <>
      {/* Zero-height so it adds nothing to the flow; the bar inside simply overflows it.
          `top: 0` sticks it for the length of the containing block, which — because this
          is a fragment — is the whole program page. */}
      <Box
        className="ProgramHeaderStickyBar"
        aria-hidden={!stuck}
        sx={{ position: 'sticky', top: 0, height: '0px', zIndex: 20 }}
      >
        <Box
          sx={{
            background: '#153750',
            color: 'white',
            px: 2,
            py: 1.25,
            boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
            // Slides up out of sight rather than unmounting, so the search box inside keeps
            // its state and the handoff from the full header reads as one movement.
            transform: stuck ? 'none' : 'translateY(-100%)',
            opacity: stuck ? 1 : 0,
            visibility: stuck ? 'visible' : 'hidden',
            pointerEvents: stuck ? 'auto' : 'none',
            transition: 'transform 0.18s ease, opacity 0.18s ease, visibility 0.18s'
          }}
        >
          {/* Row one, unchanged from the full header. */}
          <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap" rowGap={1}>
            <Typography sx={{ fontSize: 16, whiteSpace: 'nowrap', fontWeight: 700 }}>Program ID</Typography>
            <Box sx={{ flex: '1 1 240px', minWidth: 0, maxWidth: 460 }}>
              <ProgramSearch programs={programs} value={selected} onChange={onSelect} variant="header" />
            </Box>
            {/* On a narrow screen the field row below is hidden, so the bar would no longer
                say which program you're on — this is the one-line stand-in for it, and the
                reason the compact treatment survives at all. It truncates rather than wraps
                so the bar stays one row. */}
            <Typography
              sx={{
                display: { xs: 'block', md: 'none' },
                fontSize: 15,
                color: TEAL_ON_NAVY,
                fontWeight: 600,
                flex: '1 1 auto',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {program.program_id} · {program.program}
            </Typography>
          </Stack>

          {/* Row two, as-is from the full header — but only where there's width for it.
              QA asked for the stuck bar to keep the first two rows rather than collapse to
              a summary line, and separately confirmed the compact single-row treatment is
              right on small screens, so this is a display toggle rather than a rewrite of
              the bar. Hidden with CSS instead of unmounted so the bar has no JS-measured
              breakpoint to get wrong, and so the search above keeps its state either way. */}
          <Box
            display={{ xs: 'none', md: 'grid' }}
            gap={2}
            mt={1.5}
            sx={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
          >
            <Field truncate label="Program ID" value={program.program_id} />
            <Field truncate label="Program" value={program.program} />
            <Field truncate label="Department" value={program.department} />
            <Field truncate label="Budget Area" value={program.area || '—'} />
            <Field truncate label="Fiscal Years" value={fiscalYears} />
          </Box>
        </Box>
      </Box>

      <Box
        className="ProgramHeader"
        ref={fullHeaderRef}
        sx={{ background: '#153750', color: 'white', px: 2, py: 2 }}
      >
        <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap" rowGap={1}>
          <Typography sx={{ fontSize: 16, whiteSpace: 'nowrap', fontWeight: 700 }}>Program ID</Typography>
          <ProgramSearch programs={programs} value={selected} onChange={onSelect} variant="header" />
        </Stack>

        <Box
          display="grid"
          gap={2}
          mt={2}
          sx={{ gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(5, auto)' } }}
        >
          <Field label="Program ID" value={program.program_id} />
          <Field label="Program" value={program.program} />
          <Field label="Department" value={program.department} />
          <Field label="Budget Area" value={program.area || '—'} />
          <Field label="Fiscal Years" value={fiscalYears} />
        </Box>

        {description ? (
          <Typography sx={{ fontSize: 15, lineHeight: 1.6, mt: 2, color: '#ffffff' }}>
            {shown}
            {isLong && (
              <Link
                component="button"
                onClick={() => setExpanded(e => !e)}
                sx={{ color: TEAL_ON_NAVY, ml: 1, fontSize: 14, verticalAlign: 'baseline' }}
              >
                {expanded ? 'less' : 'more'}
              </Link>
            )}
            <Typography component="span" sx={{ fontSize: 13, opacity: 0.7, display: 'block', mt: 0.75 }}>
              Program objective as stated in the executive budget request.
            </Typography>
          </Typography>
        ) : (
          <Typography sx={{ fontSize: 14, mt: 2, opacity: 0.7, fontStyle: 'italic' }}>
            No program description on file.
          </Typography>
        )}
      </Box>

      {/* QA asked for air between the navy header and the figures below it. */}
      <Box mt={4} mb={3}>
        <StatTiles tiles={tiles} />
      </Box>
    </>
  )
}

/**
 * Header field: white label above a teal value, per QA.
 *
 * `truncate` is for the stuck bar only, where the five fields are forced onto a single row
 * and a long program name would otherwise push that row wider than the viewport. The full
 * header keeps wrapping, since there it has the height to spare and nothing to gain from
 * hiding the end of a name.
 */
function Field({ label, value, truncate = false }: { label: string; value: string; truncate?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#ffffff', lineHeight: 1.4 }}>{label}</Typography>
      <Typography
        title={truncate ? value : undefined}
        sx={{
          fontSize: 16,
          lineHeight: 1.35,
          color: TEAL_ON_NAVY,
          fontWeight: 600,
          ...(truncate && { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
        }}
      >
        {value}
      </Typography>
    </Box>
  )
}
