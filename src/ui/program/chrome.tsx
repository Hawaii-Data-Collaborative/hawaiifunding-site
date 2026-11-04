import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { Box, Tooltip, Typography, useMediaQuery } from '@mui/material'

/**
 * Shared page chrome for Program ID, matching the live site rather than the concept deck.
 *
 * The deck drew each section as a solid blue title bar over a grey body, and the tiles as
 * hard-bordered boxes with a navy→light-blue header ramp. On hawaiidata.org every chart is
 * instead a **centered teal heading** with a grey subtitle beneath it and the chart sitting
 * on a plain ground, and major groups of charts sit inside a soft grey band with a centered
 * navy heading. Program ID is the first embed that renders its own section titles — every
 * other chart takes its `<h2>` from the host page — so it has to reproduce that idiom here
 * or it reads as a different design system bolted onto the site.
 *
 * Kept from the deck: the navy record header (ProgramHeader) and the stat tiles, both of
 * which do jobs nothing else on the site does. The tiles are lightened to suit — teal
 * label, navy figure, hairline rule instead of a filled bar and a hard border.
 */

const TEAL = '#008f8c'
const NAVY = '#153750'
const GREY_INK = '#697d8e'
const HAIRLINE = '#e3e6ea'

/** Band ground. Mirrors the light grey section on the live trend pages. */
const BAND_BG = '#f2f4f5'

export interface Tile {
  label: string
  value: string
  /** Small print under the value — units, caveats, the year a figure is from. */
  note?: string
  /**
   * Tooltip on an info icon beside the label, for when the figure needs a sentence rather
   * than a fragment. Used where a tile deliberately doesn't match the table under it —
   * CIP counts appropriation lines, which is more than the number of distinct projects.
   */
  info?: string
}

/**
 * A row of headline figures.
 *
 * Each row is one grid of four *grid rows* (labels, rules, values, notes) rather than N
 * independent tile boxes, so every label shares a row and therefore a height. That keeps
 * the figures on a common baseline however many lines a label wraps to — a fixed
 * min-height can't, since "Total Appropriated (All FYs)" takes two lines when there's room
 * and three when there isn't.
 *
 * **That structure only aligns if the tile count divides evenly into the column count**,
 * which is why the tiles are chunked into rows here rather than left to wrap. All 4N cells
 * flow through one grid, so with 3 tiles in 2 columns the cells land as
 * `[L1 L2][L3 R1][R2 R3][V1 V2]…` — labels sitting under values, rules floating between
 * unrelated figures. It looked fine for a long time only because every set had 4 tiles;
 * the 5-tile header was already breaking below 900px, and v2's 3-tile Contracts summary
 * made it obvious. Chunking keeps each rendered row's cell count equal to its column
 * count, so the four groups stay in their own grid rows at every width.
 */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  // Viewport-based, like the MUI breakpoints this replaces — see the note in CLAUDE.md
  // about breakpoints not tracking the embed container.
  const atLeastMd = useMediaQuery('(min-width:900px)')
  const atLeastSm = useMediaQuery('(min-width:600px)')
  const perRow = atLeastMd ? tiles.length : atLeastSm ? Math.min(tiles.length, 3) : 2

  const rows: Tile[][] = []
  for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow))

  return (
    <Box className="StatTiles" display="grid" sx={{ rowGap: 3 }}>
      {rows.map((row, i) => (
        <StatTileRow key={i} tiles={row} columns={perRow} />
      ))}
    </Box>
  )
}

/**
 * One aligned row of tiles.
 *
 * `columns` is the row width for the whole set, not this row's tile count, so a short final
 * row keeps the column positions of the rows above it. The empty slots are padded with real
 * cells — without them the same flow bug returns in miniature: one tile in a two-column grid
 * lays out as `[label rule][value note]`.
 */
function StatTileRow({ tiles, columns }: { tiles: Tile[]; columns: number }) {
  const slots: Array<Tile | null> = [...tiles, ...Array(Math.max(0, columns - tiles.length)).fill(null)]

  return (
    <Box
      display="grid"
      sx={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: 2 }}
    >
      {slots.map((t, i) =>
        !t ? (
          <Box key={`label-pad-${i}`} />
        ) : (
        <Typography
          key={`label-${t.label}`}
          sx={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: TEAL,
            lineHeight: 1.4,
            textAlign: 'center',
            alignSelf: 'end',
            px: 1
          }}
        >
          {t.label}
          {t.info && <InfoTip title={t.info} />}
        </Typography>
        )
      )}
      {slots.map((t, i) =>
        !t ? (
          <Box key={`rule-pad-${i}`} />
        ) : (
          <Box key={`rule-${t.label}`} sx={{ borderTop: `2px solid ${TEAL}`, opacity: 0.25, my: 0.75, mx: 1 }} />
        )
      )}
      {slots.map((t, i) =>
        !t ? (
          <Box key={`value-pad-${i}`} />
        ) : (
        <Typography
          key={`value-${t.label}`}
          sx={{
            // Figures are short ($154M, 19), but a couple of tiles now hold a fiscal-year
            // range — "FY 2022–2027" broke onto two lines at 27px and read as a wrapped
            // mistake next to its neighbours. Stepped down rather than wrapped.
            fontSize: t.value.length > 9 ? 21 : 27,
            fontWeight: 700,
            lineHeight: 1.15,
            color: NAVY,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            px: 1
          }}
        >
          {t.value}
        </Typography>
        )
      )}
      {slots.map((t, i) =>
        !t ? (
          <Box key={`note-pad-${i}`} />
        ) : (
          <Typography
            key={`note-${t.label}`}
            sx={{ fontSize: 13, color: GREY_INK, mt: 0.5, lineHeight: 1.4, textAlign: 'center', px: 1 }}
          >
            {t.note ?? ''}
          </Typography>
        )
      )}
    </Box>
  )
}

interface SectionPanelProps {
  title: string
  /** Centered grey subtitle — the deck's right-aligned "Final Appropriations" / "FY 2016-2027". */
  meta?: string
  children: React.ReactNode
}

/** One chart or table: centered teal heading, grey subtitle, content on plain ground. */
export function SectionPanel({ title, meta, children }: SectionPanelProps) {
  return (
    <Box className="SectionPanel" mb={6}>
      <Typography
        component="h3"
        sx={{
          fontSize: '1.35rem',
          fontWeight: 600,
          color: TEAL,
          textAlign: 'center',
          textWrap: 'balance',
          mb: meta ? 0.5 : 2
        }}
      >
        {title}
      </Typography>
      {meta && (
        <Typography
          sx={{ fontSize: 13.5, color: GREY_INK, textAlign: 'center', maxWidth: 700, mx: 'auto', mb: 2 }}
        >
          {meta}
        </Typography>
      )}
      {children}
    </Box>
  )
}

interface SectionBandProps {
  title: string
  subtitle?: string
  /** `true` gives the light grey band; `false` leaves it on the page ground. */
  banded?: boolean
  children: React.ReactNode
}

/**
 * A group of sections under one centered navy heading — the live pages' "10 Year Budget
 * Trends" (grey band) and "Fiscal Year Breakdown" (plain) rhythm.
 *
 * The band paints its own ground, so if the host Squarespace section also has a grey
 * background the two will stack. Flip `banded` off if that happens.
 */
export function SectionBand({ title, subtitle, banded = false, children }: SectionBandProps) {
  return (
    <Box
      className="SectionBand"
      sx={{
        background: banded ? BAND_BG : 'transparent',
        borderRadius: banded ? '24px' : 0,
        px: { xs: 2, sm: 3 },
        py: { xs: 4, sm: 5 },
        mb: 4
      }}
    >
      <Typography
        component="h2"
        sx={{
          fontSize: { xs: '1.7rem', sm: '2rem' },
          fontWeight: 600,
          color: NAVY,
          textAlign: 'center',
          textWrap: 'balance',
          mb: subtitle ? 1 : 4
        }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography
          sx={{
            fontSize: 15,
            color: NAVY,
            textAlign: 'center',
            maxWidth: 720,
            mx: 'auto',
            mb: 4,
            lineHeight: 1.5
          }}
        >
          {subtitle}
        </Typography>
      )}
      {children}
    </Box>
  )
}

/** Consistent empty state for the sections whose source data doesn't cover every program. */
export function SectionEmpty({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: 13,
        color: GREY_INK,
        fontStyle: 'italic',
        textAlign: 'center',
        maxWidth: 640,
        mx: 'auto',
        py: 1
      }}
    >
      {children}
    </Typography>
  )
}

/**
 * An info icon with an explanatory tooltip.
 *
 * MUI's default tooltip is 11px, which QA called out as too small to read on the Amount
 * column — and these carry real caveats, not hints, so they need to be legible. Every
 * tooltip on this page goes through here so the size is set once.
 *
 * `onNavy` switches the icon for a table header, where it sits on the navy header band
 * rather than on white.
 */
export function InfoTip({ title, onNavy = false }: { title: React.ReactNode; onNavy?: boolean }) {
  return (
    <Tooltip
      title={title}
      slotProps={{
        tooltip: {
          sx: {
            fontSize: 13,
            lineHeight: 1.55,
            maxWidth: 360,
            p: 1.25,
            // Solid, not MUI's default rgba(97,97,97,0.92). These tooltips open over a
            // dense table, and at 92% the rows underneath showed through the text — the
            // legend in particular read as if it were printed on the data.
            backgroundColor: NAVY,
            boxShadow: '0 4px 14px rgba(0,0,0,0.3)'
          }
        }
      }}
    >
      <InfoOutlinedIcon
        sx={{
          fontSize: onNavy ? 13 : 14,
          color: onNavy ? 'rgba(255,255,255,0.85)' : TEAL,
          opacity: onNavy ? 1 : 0.75,
          verticalAlign: onNavy ? 'middle' : '-2px',
          ml: onNavy ? 0 : 0.4,
          flexShrink: 0
        }}
      />
    </Tooltip>
  )
}

/**
 * The caveat under a table or chart — data coverage, OCR quality, what a total does and
 * doesn't include.
 *
 * QA asked for these to stand out rather than trail off as 11.5px grey text against the
 * page: centered, in a box, at a readable size. The box is grey on the page ground (the
 * tables in Associated Funding & Records) and **white inside a grey SectionBand** (the two
 * charts in Appropriations Over Time), where a grey box would vanish into the band — v3
 * asked for "a white box around the disclaimer" there for exactly that reason.
 */
export function TableNote({ children, onBand = false }: { children: React.ReactNode; onBand?: boolean }) {
  return (
    <Box
      className="TableNote"
      sx={{
        background: onBand ? 'white' : BAND_BG,
        border: `1px solid ${HAIRLINE}`,
        borderRadius: '8px',
        px: 2,
        py: 1.25,
        mt: 1.5,
        mx: 'auto',
        // Nearly the full width of the table/chart above it, inset a hair on each side so
        // the box reads as a note *about* that content rather than another row of it.
        // `boxSizing` is not optional here: the embed mounts no CssBaseline, so a Box is
        // content-box and the padding and border add back onto the width — without this
        // the note comes out 2px *wider* than the table it sits under.
        boxSizing: 'border-box',
        width: 'calc(100% - 2rem)'
      }}
    >
      <Typography sx={{ fontSize: 13, color: GREY_INK, lineHeight: 1.55, textAlign: 'center' }}>
        {children}
      </Typography>
    </Box>
  )
}

/**
 * "2023 and 2025", "2022, 2024, 2025 and 2026" — how the coverage notes list sessions.
 * The years come from the data (see `coverage` on the detail response) rather than being
 * typed into the copy, so the note stays true when Amanda loads another session.
 */
export function listYears(years: number[]): string {
  if (years.length <= 1) return years.join('')
  return `${years.slice(0, -1).join(', ')} and ${years[years.length - 1]}`
}

/**
 * The inflation caveat under Budget Over Time and Budget By Stage, in the wording QA v3
 * supplied. Inflation adjustment only reaches years with a published full-year CPI; the
 * years it can't reach are drawn in nominal dollars and named here rather than quietly
 * mixed in. Renders nothing when every year is adjusted (or adjustment is off).
 */
export function NominalYearsNote({ years }: { years: number[] }) {
  if (!years.length) return null
  const one = years.length === 1
  return (
    <TableNote onBand>
      FY {listYears(years)} {one ? 'is' : 'are'} not adjusted for inflation as a full year CPI has not been published
      yet for {one ? 'that year' : 'those years'} &ndash; {one ? 'it is' : 'those are'} shown in nominal dollars.
    </TableNote>
  )
}

/** Shared by the four data tables so their headers read as one family. */
export const TABLE_HEADER_COLOR = NAVY

export { TEAL, NAVY, GREY_INK, HAIRLINE }
