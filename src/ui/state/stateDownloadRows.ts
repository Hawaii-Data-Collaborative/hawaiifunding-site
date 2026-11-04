/**
 * Shared CSV row builder for the state charts that drill through
 * area → department → program (Viz456).
 *
 * All three levels aggregate the same `window._data` the same way, so they share one
 * function rather than three near-copies that could drift.
 *
 * The exports deliberately span **every fiscal year**, not the one on the year slider.
 * Picking an area or a department is the user saying what they care about, so those filter
 * the file; dragging the year slider is how you browse a hierarchy, so it doesn't. A
 * single year at these levels is a handful of rows and no use to anyone in a spreadsheet.
 */

type GroupBy = 'area' | 'department' | 'program'

interface Options {
  groupBy: GroupBy
  /** Drill context — applied as filters so the file matches what you drilled into. */
  area?: string | null
  department?: string | null
}

export interface StateDownloadRow {
  fiscal_year: number
  group: string
  funding_source: string
  amount: number
}

function groupValue(row: any, groupBy: GroupBy): string {
  if (groupBy === 'area') return row.area ?? 'Unknown'
  if (groupBy === 'department') return row.department ?? 'Unknown'
  // Programs are shown as "AGR151: Quality and Price Assurance" in the chart; match that
  // so a downloaded row is recognisable against what was on screen.
  return row.program_id ? `${row.program_id}: ${row.program_clean}` : (row.program_clean ?? 'Unknown')
}

export function stateBudgetRows({ groupBy, area, department }: Options): StateDownloadRow[] {
  const data: any[] = (window as any)._data ?? []
  const totals = new Map<string, StateDownloadRow>()

  for (const d of data) {
    if (area && d.area !== area) continue
    if (department && d.department !== department) continue

    const group = groupValue(d, groupBy)
    const key = `${d.fiscal_year}|${group}|${d.funding_source}`
    const entry = totals.get(key)
    if (entry) {
      entry.amount += d.budget || 0
    } else {
      totals.set(key, {
        fiscal_year: d.fiscal_year,
        group,
        funding_source: d.funding_source,
        amount: d.budget || 0
      })
    }
  }

  return Array.from(totals.values())
    .filter(r => r.amount !== 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year || a.group.localeCompare(b.group))
}

/** Renames the generic `group` column to the dimension it actually holds. */
export function labelled(rows: StateDownloadRow[], groupBy: GroupBy) {
  return rows.map(r => ({
    fiscal_year: r.fiscal_year,
    [groupBy]: r.group,
    funding_source: r.funding_source,
    amount: r.amount
  }))
}
