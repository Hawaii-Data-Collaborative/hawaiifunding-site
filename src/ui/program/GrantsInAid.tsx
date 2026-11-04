import { useMemo } from 'react'
import { Box, Link } from '@mui/material'
import { formatCurrency, formatCurrencyPrecise } from '../../util'
import type { GrantRow } from '../../loadProgramData'
import { listYears, SectionEmpty, SectionPanel, StatTiles, TableNote, TABLE_HEADER_COLOR } from './chrome'
import { Clamp, DataTable, useTableSort, type Column } from './DataTable'

/**
 * Grants-in-Aid — chapter 42F grants appropriated through this program.
 *
 * Coverage is genuinely partial: the source extract only covers the 2023 and 2025
 * sessions — 42 of 293 programs, so ~86% of programs show an empty panel. That caveat
 * used to appear only in the empty state, which meant it vanished exactly when there was
 * data to qualify. It now shows in both places, and the sessions it names come from the
 * dataset (`sessions`) rather than the copy, so it stays true when another lands.
 *
 * The year here is a **session** year, not a fiscal year. The other three tables in this
 * section say "Fiscal Year"; this one says "Session Year", per the team's follow-up to the
 * v2 deck — chapter 42F grants are appropriated by session. v3's tile list asked for
 * "Fiscal Years*" here, but the grants extract carries no fiscal year at all, only
 * `session_year`, so the tile is "Session Year*" (singular, as the project lead asked) to
 * match the column. The asterisk leads
 * to the coverage note. (If the team wants fiscal years, the mapping would be
 * session + 1 — HB300 CD1 of the 2023 session appropriates 42F grants for FY 2023–24 —
 * but that belongs in the extract, not inferred here.)
 */

export function GrantsInAid({ grants, sessions }: { grants: GrantRow[]; sessions: number[] }) {
  const summary = useMemo(() => {
    const total = grants.reduce((s, g) => s + (g.amount || 0), 0)
    const years = Array.from(new Set(grants.map(g => g.year))).sort()
    return { total, average: grants.length ? total / grants.length : 0, yearList: years }
  }, [grants])

  const { sorted, sort, onSort } = useTableSort<GrantRow>(
    grants,
    { year: g => g.year, amount: g => g.amount },
    { key: 'year', dir: 'desc' }
  )

  const columns: Array<Column<GrantRow>> = [
    { key: 'year', label: 'Session Year', width: '13%', render: g => g.year, sortKey: 'year' },
    {
      key: 'recipient',
      label: 'Recipient',
      width: '20%',
      // Deliberately not a link, per v2: the bill deep-link moved to its own Source column,
      // where it can name the bill instead of hiding behind the grantee's name.
      render: g => <Clamp lines={3}>{g.recipient}</Clamp>,
      title: g => g.recipient
    },
    {
      key: 'purpose',
      // No width — this column absorbs the table's slack (see DataTable).
      label: 'Description',
      width: '39%',
      render: g => <Clamp lines={3}>{g.purpose}</Clamp>,
      title: g => g.full_text || g.purpose
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      width: '12%',
      render: g => formatCurrency(g.amount),
      sortKey: 'amount'
    },
    {
      key: 'source',
      label: 'Source',
      width: '16%',
      // `source_name` is the bill the grant was appropriated in ("HB300 CD1"), from
      // `source_file`; the link is the deep link into that bill's text, anchored on the
      // grantee. Falls back to naming the link generically if the extract ever lands a row
      // with a link but no filename.
      render: g =>
        g.link ? (
          <Link href={g.link} target="_blank" rel="noopener" data-hfp-kind="grant-in-aid" sx={{ fontSize: 13 }}>
            {g.source_name || 'Bill text'}
          </Link>
        ) : (
          g.source_name || '—'
        )
    }
  ]

  return (
    // No "Sessions 2023, 2025" subtitle any more, per v3 — the tile and the note cover it.
    <SectionPanel title="Grants-in-Aid">
      {grants.length ? (
        <>
          <Box mb={2}>
            <StatTiles
              tiles={[
                { label: 'Total Appropriated (All FYs)', value: formatCurrencyPrecise(summary.total) },
                { label: 'Total Grants (All FYs)', value: grants.length.toLocaleString() },
                { label: 'Session Year*', value: summary.yearList.join(', ') },
                { label: 'Average Grant', value: formatCurrencyPrecise(summary.average) }
              ]}
            />
          </Box>
          <DataTable
            columns={columns}
            rows={sorted}
            rowKey={(g, i) => `${g.year}-${g.recipient}-${i}`}
            headerColor={TABLE_HEADER_COLOR}
            sort={sort}
            onSort={onSort}
          />
          <TableNote>
            *Grant extracts currently cover the {listYears(sessions)} legislative sessions only, so a program may have
            made grants in other years that aren&rsquo;t in this dataset yet.
          </TableNote>
        </>
      ) : (
        <SectionEmpty>
          No grants-in-aid recorded for this program. Grant extracts currently cover the {listYears(sessions)}{' '}
          sessions only, so an absence here isn&rsquo;t evidence the program made no grants in other years.
        </SectionEmpty>
      )}
    </SectionPanel>
  )
}
