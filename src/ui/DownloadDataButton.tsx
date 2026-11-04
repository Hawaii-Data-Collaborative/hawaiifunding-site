import { useState } from 'react'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import { CircularProgress, IconButton, Tooltip } from '@mui/material'
import { downloadCsv, type CsvColumn } from '../downloadData'
import { track } from '../analytics'
import { useChartName } from './TrackedEmbed'

/**
 * "Download data" control — shared across all three bundles so every chart offers the same
 * affordance in the same place.
 *
 * Icon only, with the scope spelled out in the tooltip. The scope matters more than it
 * sounds: a chart with a year *slider* shows one year but sits on a decade of data, so
 * without being told, someone downloading from it reasonably expects the decade. Saying
 * "FY 2016–2025 · 779 rows" up front removes the surprise, and keeps the control small
 * enough to sit in a crowded row of chart toggles.
 */

interface Props<Row extends object> {
  /** Chart name — becomes the filename stem, date-stamped on download. */
  filename: string
  /** Rows already in hand. Omit when using `getRows`. */
  rows?: Row[]
  /**
   * Fetch rows on click instead — for tables that paginate or charts whose export covers
   * more than the view (see `scope`).
   */
  getRows?: () => Promise<Row[]>
  /** What the file covers, e.g. "FY 2016–2025" or "all 393 contracts". */
  scope?: string
  /** Header names and order. Worth passing so the CSV isn't raw field names. */
  columns?: Array<CsvColumn<Row>>
  size?: 'small' | 'medium'
}

export function DownloadDataButton<Row extends object>({
  filename,
  rows,
  getRows,
  scope,
  columns,
  size = 'small'
}: Props<Row>) {
  const [busy, setBusy] = useState(false)
  const empty = !getRows && !rows?.length
  // Instrumenting here covers all sixteen usages at once. Prefer the embed's registry
  // name; `filename` is the fallback for a button rendered outside a TrackedEmbed (the
  // Program ID sections, where the panel is the meaningful unit rather than the page).
  const chartName = useChartName()

  async function onClick() {
    track('download', { chart: chartName ?? filename, detail: scope ?? filename })
    if (getRows) {
      setBusy(true)
      try {
        downloadCsv(filename, await getRows(), columns)
      } finally {
        setBusy(false)
      }
      return
    }
    downloadCsv(filename, rows ?? [], columns)
  }

  const parts = ['Download data as CSV']
  if (scope) parts.push(scope)
  // Only count rows we already hold — with getRows the count isn't known until fetched.
  if (!getRows && rows?.length) parts.push(`${rows.length.toLocaleString()} rows`)

  return (
    <Tooltip title={empty ? 'No data to download' : parts.join(' · ')}>
      <span>
        <IconButton
          size={size}
          disabled={empty || busy}
          onClick={onClick}
          aria-label={empty ? 'No data to download' : parts.join(' · ')}
          sx={{ color: '#0c5a9a' }}
        >
          {busy ? <CircularProgress size={16} /> : <DownloadIcon sx={{ fontSize: 19 }} />}
        </IconButton>
      </span>
    </Tooltip>
  )
}
