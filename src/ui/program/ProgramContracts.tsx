import { Fragment, useEffect, useState } from 'react'
import { Alert, Box, CircularProgress, Link, Pagination, Stack, Typography } from '@mui/material'
import { formatCurrency } from '../../util'
import { MOF_CODE_TO_DESCRIPTION } from '../../constants'
import {
  contractSourceLabel,
  loadAllProgramContracts,
  loadProgramContracts,
  type ContractsPage,
  type ContractSort,
  type SortDir
} from '../../loadProgramData'
import { DownloadDataButton } from '../DownloadDataButton'
import { InfoTip, SectionEmpty, SectionPanel, StatTiles, TableNote, TABLE_HEADER_COLOR, GREY_INK } from './chrome'
import { Clamp, DataTable, type Column } from './DataTable'

/**
 * Contracts.
 *
 * This is the one section that pages rather than loading whole — the biggest programs
 * have ~2,400 contract rows (JUD310), and the table is the only consumer, so there's no
 * reason to ship them all.
 *
 * Two things about this data shape the presentation:
 *
 *  - Amounts are OCR'd from departmental PDF testimony and many aren't totals at all
 *    ("VARIOUS", "87.93/Unit Rate"). Those are shown verbatim rather than coerced to a
 *    number, and the summary total says how many rows it actually covers — a total that
 *    silently skipped a third of the rows would read as complete.
 *  - `fy_bucket` is the fiscal year the contract was *reported* to the legislature, not
 *    the contract's own term, which has its own column. v2 renames the column to "Fiscal
 *    Year" for consistency with the other three tables; the distinction it used to carry
 *    in the label ("Reported FY") moved into the header's info tooltip, because it's the
 *    thing that makes the point-in-time caveat above the table make sense.
 *
 * **Sorting is server-side** — see loadProgramContracts. Changing sort resets to page 1;
 * without that you can land past the end of the set on a re-sort.
 */

/**
 * A term endpoint, or null if the field is only a placeholder.
 *
 * `term_from` / `term_to` are free text scraped from PDFs, and a missing endpoint is written
 * several different ways: NULL, empty, whitespace, a hyphen, or an em dash. The old render
 * only checked for NULL and substituted "?", so a row whose end date was the literal "-"
 * came out as "NTP NOT YET ISSUED – -" — two dashes and a stray placeholder.
 *
 * Only *pure* punctuation is dropped. Plenty of these fields hold real information rather
 * than a date — "Ongoing", "TBD", "UNTIL MATTERS ARE RESOLVED", "COMPLETION OF
 * CONSTRUCTION" — and that has to survive.
 */
function termPart(value: string | null | undefined): string | null {
  const s = (value ?? '').trim()
  return !s || /^[\s\-–—]+$/.test(s) ? null : s
}

/**
 * Both endpoints, one, or neither — all four occur in quantity (42,129 / 1,585 / 1,107 /
 * 5,108 rows), so none of them can be the fallback case.
 *
 * A lone start date shows on its own; a lone end date keeps a leading dash so it still reads
 * as the far end of a range rather than as a start.
 */
function termRange(from: string | null, to: string | null): string {
  const f = termPart(from)
  const t = termPart(to)
  if (f && t) return `${f} – ${t}`
  if (f) return f
  if (t) return `– ${t}`
  return '—'
}

function mofLabel(mof: string): string {
  const desc = MOF_CODE_TO_DESCRIPTION[mof]
  return desc ? `${desc} (${mof})` : mof
}

/**
 * Tooltip content for the MOF header — only the codes this program actually uses.
 *
 * One code per line, aligned. Run together on a single line separated by middots it was a
 * wall of text: seven codes and their full fund names read as one long sentence, which is
 * the opposite of what a legend is for.
 */
function MofLegend({ codes }: { codes: string[] }) {
  const known = codes.filter(c => MOF_CODE_TO_DESCRIPTION[c])
  return (
    <>
      <Box>Means of financing — the fund the contract is paid from.</Box>
      {known.length > 0 && (
        <Box sx={{ mt: 0.75, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1, rowGap: 0.25 }}>
          {known.map(c => (
            <Fragment key={c}>
              <Box component="span" sx={{ fontWeight: 700 }}>
                {c}
              </Box>
              <Box component="span">{MOF_CODE_TO_DESCRIPTION[c]}</Box>
            </Fragment>
          ))}
        </Box>
      )}
    </>
  )
}

export function ProgramContracts({ programId }: { programId: string }) {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<ContractSort>('fy')
  const [dir, setDir] = useState<SortDir>('desc')
  const [data, setData] = useState<ContractsPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Reset to the first page whenever the program changes, or page 3 of the previous
  // program would be requested for one that may only have a single page.
  useEffect(() => {
    setPage(1)
  }, [programId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadProgramContracts(programId, page, sort, dir)
      .then(d => {
        if (!cancelled) setData(d)
      })
      .catch(err => {
        if (!cancelled) setError(err.message ?? String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [programId, page, sort, dir])

  function onSort(key: string) {
    const k = key as ContractSort
    if (k === sort) {
      setDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(k)
      setDir('desc')
    }
    setPage(1)
  }

  const columns: Array<Column<ContractsPage['rows'][number]>> = [
    {
      key: 'fy',
      label: 'Fiscal Year',
      width: '14%',
      render: r => r.fy_bucket ?? '—',
      sortKey: 'fy',
      headerAdornment: (
        <InfoTip
          onNavy
          title="The fiscal year the contract was reported to the Legislature, which is not necessarily when the work happened — the contract's own dates are in the Term column."
        />
      )
    },
    {
      key: 'entity',
      // No width — the recipient column absorbs the table's slack, which is what evens
      // out the gaps between the fixed columns to its right (see DataTable).
      label: 'Recipient',
      width: '21%',
      render: r => <Clamp lines={3}>{r.entity || '—'}</Clamp>,
      title: r => r.entity ?? undefined
    },
    // The Program column is gone, per v2 — every row on this page belongs to the program
    // in the header, so naming it again in each row said nothing.
    {
      key: 'mof',
      label: 'Means of Financing',
      width: '18%',
      render: r => mofLabel(r.mof),
      headerAdornment: <InfoTip onNavy title={<MofLegend codes={data?.mofCodes ?? []} />} />
    },
    {
      key: 'term',
      label: 'Term',
      width: '15%',
      render: r => termRange(r.term_from, r.term_to)
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      width: '16%',
      sortKey: 'amount',
      // QA's disclaimer, used verbatim as requested. It deliberately says "Some" rather
      // than a count: the previous version filled in the live number, which the team
      // replaced with the general form.
      headerAdornment: (
        <InfoTip
          onNavy
          title={
            <>
              Some of these contracts state a unit rate or &ldquo;various&rdquo; rather than a fixed total, so they
              are shown as written and excluded from the total above.
            </>
          }
        />
      ),
      // A stated dollar figure wins. Failing that, many of these rows record only a
      // ceiling in max_value ("$-" in the amount column of the original PDF), which is
      // shown as "up to X" so it can't be mistaken for an amount obligated. Anything
      // else — a unit rate, "VARIOUS" — is passed through as written.
      render: r => {
        if (r.amount_parsed != null) return formatCurrency(r.amount_parsed)
        if (r.max_value_parsed != null) {
          return <span style={{ color: '#697d8e' }}>up to {formatCurrency(r.max_value_parsed)}</span>
        }
        const stated = (r.amount ?? '').trim()
        return stated && stated !== '$-' && stated !== '-' ? stated : '—'
      },
      title: r => {
        if (r.amount_parsed != null && r.amount) return `As stated: ${r.amount}`
        if (r.max_value_parsed != null) return `No amount stated; contract maximum is ${r.max_value}`
        return undefined
      }
    },
    {
      key: 'source',
      label: 'Source',
      width: '16%',
      // Named from the department and the report's year rather than a bare "PDF", per v2.
      // There is no title field in the data — see contractSourceLabel.
      render: r =>
        r.pdf_url_with_page ? (
          <Link href={r.pdf_url_with_page} target="_blank" rel="noopener" data-hfp-kind="contract-pdf" sx={{ fontSize: 13 }}>
            {contractSourceLabel(r)}
          </Link>
        ) : (
          contractSourceLabel(r) || '—'
        ),
      title: r => (r.filename ? `Source document: ${r.filename}` : undefined)
    }
  ]

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const fyRange =
    data?.fyMin != null && data?.fyMax != null
      ? data.fyMin === data.fyMax
        ? `FY ${data.fyMin}`
        : `FY ${data.fyMin}–${data.fyMax}`
      : '—'

  return (
    // The contract count moved out of the subtitle and into its own tile, per v2.
    <SectionPanel title="Contracts">
      {error && (
        <Alert severity="warning" sx={{ mb: 2, fontSize: 13 }}>
          Couldn&rsquo;t load contracts: {error}
        </Alert>
      )}

      {!error && data && data.total === 0 && (
        <SectionEmpty>No contracts recorded for this program.</SectionEmpty>
      )}

      {!error && data && data.total > 0 && (
        <>
          <Typography
            sx={{
              fontSize: 13,
              color: GREY_INK,
              mb: 3,
              lineHeight: 1.5,
              maxWidth: 900,
              mx: 'auto',
              textAlign: 'center'
            }}
          >
            {/* One sentence, per v3 — the "difficult to provide a systemic, continuous
                capture" sentence that used to follow was cut. */}
            These amounts show a &ldquo;point-in-time&rdquo; capture, meaning they reflect what has already been paid
            to entities at the time of reporting and not necessarily the maximum possible value of the contract as
            those shift year to year.
          </Typography>
          <Box mb={2}>
            <StatTiles
              tiles={[
                {
                  label: 'Total of Reported Amounts',
                  value: formatCurrency(data.totalAmount),
                  note:
                    data.unparsed > 0
                      ? `${data.withAmount.toLocaleString()} of ${data.total.toLocaleString()} contracts state a fixed amount`
                      : undefined
                },
                { label: 'Number of Contracts', value: data.total.toLocaleString() },
                { label: 'Fiscal Years', value: fyRange }
              ]}
            />
          </Box>

          <Stack direction="row" justifyContent="flex-end" mb={0.5}>
            {/* Fetches every row rather than the 25 on screen — a partial export of a
                paginated table is the kind of thing nobody notices until the totals
                don't match. */}
            <DownloadDataButton
              filename="program-contracts"
              scope={`all ${data.total.toLocaleString()} contracts`}
              getRows={async () =>
                (await loadAllProgramContracts(programId)).map(r => ({
                  fiscal_year: r.fy_bucket ?? '',
                  recipient: r.entity ?? '',
                  // Not a column in the table any more, but worth exporting: where a raw
                  // program_id concatenated two programs, this says which one the source
                  // document named.
                  program: r.program_name ?? '',
                  means_of_financing: r.mof,
                  term_from: r.term_from ?? '',
                  term_to: r.term_to ?? '',
                  amount_as_stated: r.amount ?? '',
                  amount_parsed: r.amount_parsed ?? '',
                  max_value: r.max_value ?? '',
                  contract_number: r.contract_number ?? '',
                  source_document: contractSourceLabel(r),
                  source_file: r.filename ?? '',
                  source: r.pdf_url_with_page ?? ''
                }))
              }
            />
          </Stack>

          <Box sx={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
            <DataTable
              columns={columns}
              rows={data.rows}
              rowKey={(r, i) => `${r.contract_number ?? r.entity ?? 'row'}-${data.page}-${i}`}
              headerColor={TABLE_HEADER_COLOR}
              maxHeight={520}
              sort={{ key: data.sort, dir: data.dir }}
              onSort={onSort}
            />
          </Box>

          <TableNote>
            These are government PDFs, and their quality varies. Some older documents are image-based scans that cannot
            be read automatically. Our process identifies and flags these so they are not skipped, but some data they
            contain may be missing or be formatted inconsistently until those PDFs are manually transcribed or
            re-scanned.
          </TableNote>

          {pageCount > 1 && (
            <Stack direction="row" justifyContent="center" mt={2}>
              <Pagination
                count={pageCount}
                page={data.page}
                onChange={(_, p) => setPage(p)}
                size="small"
                siblingCount={0}
              />
            </Stack>
          )}
        </>
      )}

      {loading && !data && (
        <Stack direction="row" justifyContent="center" py={3}>
          <CircularProgress size={22} />
        </Stack>
      )}
    </SectionPanel>
  )
}
