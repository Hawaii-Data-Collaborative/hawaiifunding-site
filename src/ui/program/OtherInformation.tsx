import { useMemo, useState } from 'react'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Box, Link, Typography } from '@mui/material'
import { formatCurrency } from '../../util'
import type { FederalAwardRow, ProgramDocuments } from '../../loadProgramData'
import { SectionEmpty, SectionPanel, TableNote, TABLE_HEADER_COLOR, TEAL } from './chrome'
import { DataTable, type Column, type SortState } from './DataTable'

/**
 * Other Associated Information — the source documents behind everything above.
 *
 * Names and descriptions come from Amanda's `QA_Program.xlsx` ("Other Associated
 * Information" tab), which is the reference for this section; they are not ours to
 * paraphrase. The column formerly called "Document" is "Information Type" per the v2 deck.
 *
 * Four kinds of row:
 *
 *  - **Budget request PDFs** (P61-A, P62, S61-A) the program appears in.
 *  - **Variance reports.** Amanda's sheet gives these a static description; the live
 *    budgeted-vs-actual figures are kept in its place because they're the useful part,
 *    with her wording as the Information Type. Coverage is FY2016–2025.
 *  - **Federal Award Summary**, one row per fiscal year, expanding to the individual
 *    awards underneath — each with its own usaspending.gov deep link. Summarised rather
 *    than listed flat because HMS301 alone would otherwise add 177 rows to a 4-row
 *    section; expandable rather than aggregate-only so the award links stay reachable.
 *
 * Appropriation bills used to be listed here as well. QA flagged them as redundant — the
 * same bill and worksheet links are already reachable from Appropriations Over Time — so
 * they've been dropped.
 *
 * ⚠️ The Federal Award Summary description ("contracts, grants, and loans") is Amanda's,
 * used as-is at Kyle's direction pending team review. It doesn't match the linked data:
 * all 2,850 linked rows are assistance awards, none are contracts, and `funding_source` is
 * only grant / direct payment / other. Flagged in docs/program-id-open-decisions.md.
 */

/**
 * Item and Description, verbatim from the "Other Associated Information" tab of Amanda's
 * `QA_Program.xlsx`. That sheet is the specification for this table, so both columns are
 * static text copied from it rather than anything derived here — keyed together so they
 * can't drift apart.
 *
 * The variance row in particular used to show live figures ("Budgeted $140M vs. actual
 * $50M -$89M"), which read well but wasn't what the sheet asks for. The numbers are still
 * available in Appropriations Over Time; this table is a list of source documents.
 */
const EXCEL = {
  'P61-A': {
    item: 'Operating and Capital Expenditures (P61-A)',
    description: 'Program expenditures by fiscal year, operating and capital.'
  },
  'S61-A': {
    item: 'Executive Supplemental Budget (S61-A)',
    description: "Governor's supplemental budget request: current vs. recommended appropriations by program."
  },
  P62: {
    item: 'Performance Measures and Program Revenues (P62)',
    description: 'Program performance metrics and revenue by fiscal year.'
  },
  variance: {
    item: 'Variance Report (V61)',
    description: 'Budgeted vs. actual expenditures, positions, and performance, with variance explanations.'
  },
  federal: {
    item: 'Federal Award Summary',
    description: 'Federal spending data covering contracts, grants, and loans for this program.'
  }
} as const

const BUDGET_AND_FINANCE = 'Budget & Finance'
const USA_SPENDING = 'USA Spending'

/**
 * The table's column widths, in one place because the award drill-down lays itself out on
 * the same grid — see AwardDetail. They must still sum to 100% (see DataTable).
 */
const COLS = { year: '10%', type: '26%', description: '44%', source: '20%' } as const
const GRID_TEMPLATE = `${COLS.year} ${COLS.type} ${COLS.description} ${COLS.source}`

interface DocRow {
  key: string
  year: number
  item: string
  description: string
  sourceName: string
  link: string | null
  /** Present only on Federal Award Summary rows; drives the expandable detail. */
  awards?: FederalAwardRow[]
  /** Sorts requests before the variance report before the federal summary within a year. */
  rank: number
}

export function OtherInformation({ documents }: { documents: ProgramDocuments }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo<DocRow[]>(() => {
    const out: DocRow[] = []

    for (const r of documents.requests ?? []) {
      out.push({
        key: `req-${r.year}-${r.report_type}`,
        year: Number(r.year),
        // Falls back to the raw report_type for a type the sheet doesn't cover. Only
        // P61-A, P62 and S61-A exist in hi_state_request today, so this is defensive.
        item: EXCEL[r.report_type as keyof typeof EXCEL]?.item ?? r.report_type,
        description: EXCEL[r.report_type as keyof typeof EXCEL]?.description ?? '',
        sourceName: BUDGET_AND_FINANCE,
        link: r.source_direct_link || r.source_link,
        rank: 0
      })
    }

    for (const v of documents.variance ?? []) {
      out.push({
        key: `var-${v.fiscal_year}`,
        year: v.fiscal_year,
        item: EXCEL.variance.item,
        description: EXCEL.variance.description,
        sourceName: BUDGET_AND_FINANCE,
        link: v.link,
        rank: 1
      })
    }

    // One row per fiscal year. The server has already scoped these to obligations at state
    // level, which makes one row per award — so grouping by year here can't double-count.
    const byYear = new Map<number, FederalAwardRow[]>()
    for (const a of documents.federalAwards ?? []) {
      const list = byYear.get(a.fiscal_year)
      if (list) list.push(a)
      else byYear.set(a.fiscal_year, [a])
    }
    for (const [year, awards] of byYear) {
      out.push({
        key: `fed-${year}`,
        year,
        item: EXCEL.federal.item,
        description: EXCEL.federal.description,
        sourceName: USA_SPENDING,
        link: null,
        awards,
        rank: 2
      })
    }

    return out
  }, [documents])

  // Year is the only sortable column here — there's no amount column to sort. Sorted
  // directly rather than through useTableSort because the tie-break is fixed: within a
  // year the order is always requests → variance → federal, so a year reads "what was
  // asked for", "what actually happened", "what came from Washington", whichever
  // direction the years run in.
  const [sort, setSort] = useState<SortState>({ key: 'year', dir: 'desc' })
  const ordered = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => dir * (a.year - b.year) || a.rank - b.rank)
  }, [rows, sort.dir])

  function onSort() {
    setSort(s => ({ key: 'year', dir: s.dir === 'asc' ? 'desc' : 'asc' }))
  }

  const columns: Array<Column<DocRow>> = [
    { key: 'year', label: 'Year', width: COLS.year, render: d => d.year, sortKey: 'year' },
    { key: 'type', label: 'Item', width: COLS.type, render: d => d.item },

    { key: 'description', label: 'Description', width: COLS.description, render: d => d.description },
    {
      key: 'source',
      label: 'Source',
      width: COLS.source,
      // Federal rows have many awards and therefore many links, so the cell expands the
      // row instead of pretending to be one link. Everything else links straight out.
      render: d => {
        if (d.awards) {
          const open = expanded === d.key
          return (
            <Link
              component="button"
              onClick={() => setExpanded(open ? null : d.key)}
              sx={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 0.25, textAlign: 'left' }}
            >
              {USA_SPENDING} ({d.awards.length})
              <ExpandMoreIcon
                sx={{ fontSize: 16, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
              />
            </Link>
          )
        }
        return d.link ? (
          <Link href={d.link} target="_blank" rel="noopener" data-hfp-kind="document" sx={{ fontSize: 13 }}>
            {d.sourceName}
          </Link>
        ) : (
          d.sourceName
        )
      }
    }
  ]

  const hasFederal = (documents.federalAwards ?? []).length > 0

  return (
    <SectionPanel title="Other Associated Information">
      {ordered.length ? (
        <>
          <DataTable
            columns={columns}
            rows={ordered}
            rowKey={d => d.key}
            headerColor={TABLE_HEADER_COLOR}
            maxHeight={520}
            sort={sort}
            onSort={onSort}
            expandedKey={expanded}
            renderDetail={d => (d.awards ? <AwardDetail awards={d.awards} /> : null)}
          />
          {hasFederal && (
            <TableNote>
              Federal award figures are obligations recorded in USAspending at the state level, which is one row per
              award — a negative figure is a deobligation of money awarded in an earlier year. Only awards that could
              be linked to a state program ID appear here.
            </TableNote>
          )}
        </>
      ) : (
        <SectionEmpty>No associated documents found for this program.</SectionEmpty>
      )}
    </SectionPanel>
  )
}

/**
 * The individual awards behind one Federal Award Summary row.
 *
 * Laid out on the *parent table's* column grid rather than as a free-standing list, so the
 * panel reads as a continuation of the row it hangs off: the award's identity sits under
 * Information Type and its link under Source, lining up with the "Budget & Finance" and
 * "USA Spending" links in the rows above and below.
 *
 * Text styling is deliberately the parent's — no bold, no colour of its own. An earlier pass
 * bolded the FAIN and greyed the CFDA line, which made the panel read as a third kind of
 * content sitting inside the table rather than as more rows of it. The only styled thing is
 * the caption above, which is a caption.
 *
 * The amount rides in the Description column as another `·`-separated fact rather than in a
 * right-aligned column of its own. That does cost vertical comparability between amounts —
 * they run $25M to -$130 here — but it keeps the panel to the parent's four columns and
 * reads as one sentence per award, which is the call QA made after seeing both.
 *
 * Still a grid rather than a nested `<table>`: this lives inside a table cell, and a real
 * table-in-a-table fights the outer column widths on every resize.
 */
function AwardDetail({ awards }: { awards: FederalAwardRow[] }) {
  const total = awards.reduce((s, a) => s + (a.amount || 0), 0)
  const cfdas = new Set(awards.map(a => a.cfda_number).filter(Boolean)).size

  return (
    <Box sx={{ py: 1.5 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: TEAL, mb: 1, px: 1.5, pl: `calc(${COLS.year} + 12px)` }}>
        {awards.length} award{awards.length === 1 ? '' : 's'} · {formatCurrency(total)} obligated · {cfdas} CFDA
        program{cfdas === 1 ? '' : 's'}
      </Typography>
      {awards.map((a, i) => (
        <Box
          key={`${a.fain}-${i}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: GRID_TEMPLATE,
            alignItems: 'baseline',
            fontSize: 13,
            borderTop: i ? '1px solid #e3e6ea' : 'none',
            py: 0.6
          }}
        >
          {/* Empty cell under Year — the indent that makes the panel read as nested. */}
          <Box />
          <Box sx={{ px: 1.5 }}>{a.fain ?? '—'}</Box>
          <Box sx={{ px: 1.5 }}>
            {[`CFDA ${a.cfda_number ?? '—'}`, a.funding_source, formatCurrency(a.amount)]
              .filter(Boolean)
              .join(' · ')}
          </Box>
          <Box sx={{ px: 1.5 }}>
            {a.link && (
              <Link href={a.link} target="_blank" rel="noopener" data-hfp-kind="usaspending-award" sx={{ fontSize: 13 }}>
                View on USAspending
              </Link>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  )
}
