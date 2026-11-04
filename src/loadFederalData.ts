import * as d3 from 'd3'
import { capitalCase } from 'change-case'
import { num } from './util'
import { DATA_URL } from './constants'
import { composition } from './staticData'

export interface FederalByAwardTypeRow {
  fiscal_year: number
  award_type: string
  obligations: number
}

export interface FederalByRecipientTypeRow {
  fiscal_year: number
  recipient_type: string
  obligations: number
}

export interface FederalByDepartmentRow {
  fiscal_year: number
  department: string
  obligations: number
}

export interface FederalPerCapitaRow {
  fiscal_year: number
  hi_per_capita: number
  us_per_capita_avg: number
}

export interface FederalCompositionRow {
  name: string
  obligations: number
  // Populated only on the synthetic "Other" rollup slice — lists the names and
  // dollar amounts of the small slices that were merged into it. Drives the
  // hover tooltip's "Includes:" breakdown.
  mergedSegments?: { name: string; value: number }[]
}

export interface FederalCompositionFilters {
  fy: number
  authority?: string
  recipientType?: string
  department?: string
}

function dataPrefix(): string {
  return DATA_URL
}

const cache: Record<string, unknown> = {}

async function loadCsv<T>(
  filename: string,
  expectedKey: keyof T & string,
  parseRow: (raw: d3.DSVRowString) => T
): Promise<T[]> {
  if (cache[filename]) return cache[filename] as T[]
  const path = `${dataPrefix()}/${filename}`
  console.log('[loadFederalData] fetching %s', path)
  const raw = (await d3.csv(path)) as d3.DSVRowArray
  if (raw.columns && !raw.columns.includes(expectedKey)) {
    // Vite's dev server serves the SPA fallback HTML (200) when a static file
    // is missing, which d3.csv parses into a junk row array. Detect that here.
    throw new Error(`${filename}: expected column "${expectedKey}" not found (got: ${raw.columns.join(', ') || 'none'})`)
  }
  const rows = raw.map(parseRow)
  cache[filename] = rows
  return rows
}

// USAspending exports award_type values lowercase ("direct payment", "grant",
// "idv", etc.). Title-case for display, with IDV kept as an acronym, and the
// literal "other" renamed so it can't be confused with a synthetic rollup bucket.
export function formatAwardType(raw: string): string {
  if (!raw) return raw
  const lower = raw.toLowerCase()
  if (lower === 'idv') return 'IDV'
  if (lower === 'other') return 'Other Awards'
  return capitalCase(raw)
}

export function loadFederalByAwardType(): Promise<FederalByAwardTypeRow[]> {
  return loadCsv<FederalByAwardTypeRow>('federal_by_award_type.csv', 'award_type', d => ({
    fiscal_year: num(d.fiscal_year),
    award_type: formatAwardType(d.award_type),
    obligations: num(d.obligations)
  }))
}

export function loadFederalByRecipientType(): Promise<FederalByRecipientTypeRow[]> {
  return loadCsv<FederalByRecipientTypeRow>('federal_by_recipient_type.csv', 'recipient_type', d => ({
    fiscal_year: num(d.fiscal_year),
    // USAspending's literal "Other" recipient_reporting_category is a catch-all
    // for things that don't fit defined buckets. Rename so it doesn't collide
    // with FederalStackedBar's synthetic "Other" rollup label inside the
    // tooltip's breakdown (which was rendering as "Other > Other > $X").
    recipient_type: d.recipient_type === 'Other' ? 'Miscellaneous' : d.recipient_type,
    obligations: num(d.obligations)
  }))
}

export function loadFederalByDepartment(): Promise<FederalByDepartmentRow[]> {
  return loadCsv<FederalByDepartmentRow>('federal_by_department.csv', 'department', d => ({
    fiscal_year: num(d.fiscal_year),
    department: d.department,
    obligations: num(d.obligations)
  }))
}

export function loadFederalPerCapita(): Promise<FederalPerCapitaRow[]> {
  return loadCsv<FederalPerCapitaRow>('federal_per_capita.csv', 'hi_per_capita', d => ({
    fiscal_year: num(d.fiscal_year),
    hi_per_capita: num(d.hi_per_capita),
    us_per_capita_avg: num(d.us_per_capita_avg)
  }))
}

// Composition powers an interactive drill-down: Authority → Recipient Type → Department →
// Award Type. Each level is a filter and sum over federal/summary.json (staticData.ts); we
// cache by filter tuple so re-visits within a session are free.
const compositionCache = new Map<string, FederalCompositionRow[]>()

export async function loadFederalComposition(filters: FederalCompositionFilters): Promise<FederalCompositionRow[]> {
  const cacheKey = JSON.stringify(filters)
  const cached = compositionCache.get(cacheKey)
  if (cached) return cached

  const raw = (await composition(filters)) as unknown as FederalCompositionRow[]

  // Display-time fixes:
  //   - At the leaf level (award type) the API returns lowercase award_category
  //     values; title-case them to match the by-award-type CSV chart.
  //   - At the recipient-type level, USAspending uses a literal "Other"
  //     category; rename to avoid colliding with the synthetic small-slice
  //     rollup which is also labeled "Other".
  const isLeaf = !!filters.department
  const isRecipientType = !!filters.authority && !filters.recipientType
  const rows: FederalCompositionRow[] = raw.map(r => {
    if (isLeaf) return { ...r, name: formatAwardType(r.name) }
    if (isRecipientType && r.name === 'Other') return { ...r, name: 'Other recipients' }
    return r
  })

  compositionCache.set(cacheKey, rows)
  return rows
}
