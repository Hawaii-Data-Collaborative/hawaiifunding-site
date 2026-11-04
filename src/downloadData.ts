/**
 * Client-side CSV export for chart data — the "Download data" affordance.
 *
 * Everything a chart draws is already in memory, so there's nothing to fetch: turn the
 * rows into CSV and hand the browser a blob. Deliberately dependency-free and generic so
 * charts across all three bundles can use it without caring where their rows came from
 * (static CSV, `window._data`, or an API).
 */

/** Escapes per RFC 4180: quote when the value contains a comma, quote, or newline. */
function csvCell(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface CsvColumn<Row> {
  /** Header text. */
  label: string
  value: (row: Row) => unknown
}

/**
 * Build CSV text from rows.
 *
 * Pass `columns` to control header names and order — worth doing, since raw field names
 * ("mof_display", "fy_bucket") aren't what someone opening the file in Excel expects.
 * Without it, the union of keys across all rows is used, so rows with differing shapes
 * don't silently lose columns.
 */
export function toCsv<Row extends object>(rows: Row[], columns?: Array<CsvColumn<Row>>): string {
  if (!rows.length) return ''

  if (!columns) {
    const keys: string[] = []
    for (const row of rows) {
      for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k)
    }
    columns = keys.map(k => ({ label: k, value: (r: Row) => (r as any)[k] }))
  }

  const lines = [columns.map(c => csvCell(c.label)).join(',')]
  for (const row of rows) {
    lines.push(columns.map(c => csvCell(c.value(row))).join(','))
  }
  return lines.join('\r\n')
}

/** Slugify a chart title into a filename stem. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Trigger a download of `rows` as CSV.
 *
 * `filename` is slugified and date-stamped, so a folder of these stays sortable and it's
 * obvious when the data was pulled.
 */
export function downloadCsv<Row extends object>(
  filename: string,
  rows: Row[],
  columns?: Array<CsvColumn<Row>>
): void {
  const csv = toCsv(rows, columns)
  if (!csv) return

  const stamp = new Date().toISOString().slice(0, 10)
  // BOM so Excel opens UTF-8 (Hawaiian diacriticals) correctly instead of mojibake.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(filename)}-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()

  // Revoke on the next tick — Safari needs the URL to still be live when the click is
  // processed, so revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
