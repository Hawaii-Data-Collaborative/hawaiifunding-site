import { useMemo } from 'react'
import { Box, Link, Stack } from '@mui/material'
import { formatCurrency, formatCurrencyPrecise } from '../../util'
import { DownloadDataButton } from '../DownloadDataButton'
import type { CipRow } from '../../loadProgramData'
import { listYears, SectionEmpty, SectionPanel, StatTiles, TableNote, TABLE_HEADER_COLOR } from './chrome'
import { Clamp, DataTable, useTableSort, type Column } from './DataTable'

/**
 * Capital Improvement Projects — project-level, as the spec drew it.
 *
 * This was previously a program-level reshape (fiscal year × means of financing) because no
 * per-project data existed. `hi.hi_state_cip` has since landed with real project titles, so
 * the table is now Year / Project Title / MOF / Amount / Source.
 *
 * Coverage is the sessions extracted so far — 2022, 2024, 2025 and 2026 at the time of
 * writing, passed in as `sessions` from the dataset rather than hard-coded — so a program
 * can have capital appropriations outside those years that don't appear here. The note
 * names the dataset's sessions, not this program's: the v3 deck's wording listed "2022,
 * 2024, 2026", which is what a program with no 2025 lines would have shown under the old
 * per-program list, and would have misstated what the dataset holds (358 funded 2025-session
 * lines, 18 of them EDN100's). The project lead confirmed on 9 Sep 2026 that 2025 belongs in
 * the note, so it stays data-driven rather than the deck's typed three. The server pins each
 * fiscal year to its most recent session, because every session re-lists the same projects
 * and summing across them double-counts (EDN100: $2.97B vs $2.48B).
 *
 * **The Projects tile counts rows, not distinct projects.** A multi-year project is one
 * appropriation line per fiscal year, so the two figures differ — EDN407 is 19 lines across
 * 13 projects. QA asked for the tile to match the table it sits above, with the
 * distinct-project count moved into the tooltip, rather than the other way round. The
 * Average Project tile (v3, replacing Funding Sources) divides by the same row count, so
 * the three money/count tiles agree with each other.
 */

export function CapitalProjects({ cip, sessions }: { cip: CipRow[]; sessions: number[] }) {
  const summary = useMemo(() => {
    const total = cip.reduce((s, r) => s + (r.amount || 0), 0)
    const distinctProjects = new Set(cip.map(r => r.project_title)).size
    const years = new Set(cip.map(r => r.fiscal_year))
    return { total, distinctProjects, average: cip.length ? total / cip.length : 0, yearList: Array.from(years).sort() }
  }, [cip])

  const { sorted, sort, onSort } = useTableSort<CipRow>(
    cip,
    { fy: r => r.fiscal_year, amount: r => r.amount },
    { key: 'fy', dir: 'desc' }
  )

  const columns: Array<Column<CipRow>> = [
    {
      key: 'fy',
      label: 'Fiscal Year',
      width: '12%',
      render: r => `FY ${r.fiscal_year}`,
      sortKey: 'fy'
    },
    {
      key: 'project',
      // No width — this column absorbs the table's slack. Giving it to "Means of
      // Financing" instead is what left the wide gap QA flagged to the left of Amount.
      label: 'Project Title',
      width: '34%',
      render: r => <Clamp lines={3}>{r.project_title}</Clamp>,
      title: r => [r.project_title, r.location].filter(Boolean).join(' · ')
    },
    { key: 'mof', label: 'Means of Financing', width: '21%', render: r => r.mof_description },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      width: '13%',
      render: r => formatCurrency(r.amount),
      sortKey: 'amount'
    },
    {
      key: 'source',
      label: 'Source',
      width: '20%',
      render: r =>
        r.source_link ? (
          <Link href={r.source_link} target="_blank" rel="noopener" data-hfp-kind="cip-worksheet" sx={{ fontSize: 13 }}>
            {r.bill ? `${r.bill} worksheet` : 'Worksheet'}
          </Link>
        ) : (
          '—'
        )
    }
  ]

  const fyRange = summary.yearList.length
    ? summary.yearList.length === 1
      ? `FY ${summary.yearList[0]}`
      : `FY ${summary.yearList[0]}–${summary.yearList[summary.yearList.length - 1]}`
    : undefined

  const downloadRows = useMemo(
    () =>
      cip.map(r => ({
        fiscal_year: r.fiscal_year,
        session_year: r.session_year,
        bill: r.bill ?? '',
        project_title: r.project_title,
        means_of_financing: r.mof_description,
        location: r.location ?? '',
        amount: r.amount,
        source: r.source_link ?? ''
      })),
    [cip]
  )

  return (
    // The fiscal-year range moved from this subtitle into its own tile, per v2, so the
    // section heading now stands alone.
    <SectionPanel title="Capital Improvement Projects">
      {cip.length ? (
        <>
          <Box mb={2}>
            <StatTiles
              tiles={[
                { label: 'Total Appropriated (All FYs)', value: formatCurrencyPrecise(summary.total) },
                {
                  label: 'Total Projects (All FYs)',
                  value: cip.length.toLocaleString(),
                  info: `${cip.length.toLocaleString()} capital appropriation lines across ${summary.distinctProjects.toLocaleString()} distinct project${
                    summary.distinctProjects === 1 ? '' : 's'
                  } — a project funded in more than one fiscal year is listed once per year.`
                },
                { label: 'Fiscal Years*', value: fyRange ?? '—' },
                { label: 'Average Project', value: formatCurrencyPrecise(summary.average) }
              ]}
            />
          </Box>

          <Stack direction="row" justifyContent="flex-end" mb={0.5}>
            <DownloadDataButton filename="program-capital-projects" rows={downloadRows} scope={fyRange} />
          </Stack>

          <DataTable
            columns={columns}
            rows={sorted}
            rowKey={(r, i) => `${r.fiscal_year}-${r.project_title}-${i}`}
            headerColor={TABLE_HEADER_COLOR}
            maxHeight={520}
            sort={sort}
            onSort={onSort}
          />

          <TableNote>
            *Extracted from the capital improvement worksheets for the {listYears(sessions)} session
            {sessions.length === 1 ? '' : 's'} &mdash; a program may have capital appropriations in other years that
            aren&rsquo;t yet in this dataset. Where a fiscal year appears in more than one session, the most recent one
            is shown. Project lines appropriated $0 in a given year are omitted.
          </TableNote>
        </>
      ) : (
        <SectionEmpty>
          <Box component="span" sx={{ fontSize: 15 }}>
            No capital improvement projects recorded for this program. The capital worksheets extracted so far cover the{' '}
            {listYears(sessions)} sessions.
          </Box>
        </SectionEmpty>
      )}
    </SectionPanel>
  )
}
