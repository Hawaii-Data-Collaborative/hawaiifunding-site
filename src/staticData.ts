import { useEffect, useState } from 'react'
import { CURRENT_YEAR, DATA_URL } from './constants'
import type { ContractSort, ContractsPage, ProgramDetail, ProgramSummary, SortDir } from './loadProgramData'

/**
 * The answers hfp's server gave to /api/program/* and /api/federal/*, computed from the static
 * files State-Budget's build_site_data.py writes (served at DATA_URL). Each function returns
 * exactly what the matching endpoint returned, so the components that called the server only
 * swap one fetch for one call. The file layouts are described in State-Budget's
 * docs/SITE_DATA.md, and build_site_data.py --compare / --compare-federal checked them against
 * the live server on 2026-11-04.
 */

const cache = new Map<string, Promise<any>>()

function getJson<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(`${DATA_URL}/${path}`).then(r => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(path)) // let a later call retry
    cache.set(path, p)
  }
  return p
}

/** {columns, rows} tables in the data files, as objects. */
function objects(t: { columns: string[]; rows: any[][] }): any[] {
  return t.rows.map(r => Object.fromEntries(t.columns.map((c, i) => [c, r[i]])))
}

// ---- Program ID page --------------------------------------------------------------------------

const programFile = (id: string) => encodeURIComponent(id.trim().toUpperCase())

/** /api/program/list */
export const programList = () => getJson<ProgramSummary[]>('program/list.json')

/** /api/program/<ID> */
export const programDetail = (id: string) => getJson<ProgramDetail>(`program/${programFile(id)}.json`)

/**
 * /api/program/<ID>/contracts: 25 rows a page in the requested order, or every row (`all`, for
 * the download). The file holds every row; the sort runs over all of them, as the server's did.
 */
export async function programContracts(
  id: string,
  page = 1,
  sort: ContractSort = 'fy',
  dir: SortDir = 'desc',
  all = false
): Promise<ContractsPage> {
  const d = await getJson<ContractsPage>(`program/${programFile(id)}.contracts.json`)
  const sign = dir === 'asc' ? 1 : -1
  const missingLast = (a: number | null, b: number | null) =>
    a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : 0
  const fy = (r: any): number | null => (r.fy_bucket ? Number(r.fy_bucket) : null)
  const byEntity = (a: any, b: any) => (a.entity ?? '').localeCompare(b.entity ?? '')
  const rows = [...d.rows].sort((a: any, b: any) =>
    sort === 'amount'
      ? missingLast(a.amount_parsed, b.amount_parsed) ||
        sign * ((a.amount_parsed ?? 0) - (b.amount_parsed ?? 0)) ||
        byEntity(a, b)
      : missingLast(fy(a), fy(b)) || sign * ((fy(a) ?? 0) - (fy(b) ?? 0)) || byEntity(a, b)
  )
  const pageSize = all ? 5000 : 25
  const p = all ? 1 : Math.max(1, page)
  return { ...d, page: p, pageSize, sort, dir, rows: rows.slice((p - 1) * pageSize, p * pageSize) }
}

// ---- Federal ----------------------------------------------------------------------------------

interface SummaryRow {
  fiscal_year: number
  awarding_toptier_agency_name: string | null
  program_category: string | null
  award_category: string | null
  recipient_reporting_category: string | null
  budget_authority_type: string
  obligations: number
}

interface Summary {
  fyMin: number
  fyMax: number
  rows: SummaryRow[]
}

let summaryPromise: Promise<Summary> | null = null

/** federal/summary.json: obligations by year x agency x program x award type x recipient x authority. */
export function federalSummary(): Promise<Summary> {
  if (!summaryPromise) {
    summaryPromise = getJson<any>('federal/summary.json').then(s => ({
      fyMin: s.fyMin,
      fyMax: s.fyMax,
      rows: objects(s) as SummaryRow[]
    }))
    summaryPromise.catch(() => (summaryPromise = null))
  }
  return summaryPromise
}

/** The federal charts' year range, from the data once it loads (FY 2016 to last year until then). */
export function useFederalYears(): { fyMin: number; fyMax: number } {
  const [years, setYears] = useState({ fyMin: 2016, fyMax: CURRENT_YEAR - 1 })
  useEffect(() => {
    let live = true
    federalSummary()
      .then(s => live && setYears({ fyMin: s.fyMin, fyMax: s.fyMax }))
      .catch(() => {}) // the chart reports the load error itself
    return () => {
      live = false
    }
  }, [])
  return years
}

// The server's labels for missing values: 'Unknown' or 'unknown' depending on the level, as in
// hfp's server/src/api/federal.ts
const U = (v: string | null) => v || 'Unknown'
const u = (v: string | null) => v || 'unknown'

interface Flat {
  fiscal_year: number
  name: string
  group?: string
  value: number
}

function sumRows(rows: SummaryRow[], name: (r: SummaryRow) => string, group?: (r: SummaryRow) => string): Flat[] {
  const acc = new Map<string, Flat>()
  for (const r of rows) {
    const n = name(r)
    const g = group?.(r)
    const key = JSON.stringify([r.fiscal_year, n, g])
    const e = acc.get(key)
    if (e) e.value += r.obligations
    else acc.set(key, { fiscal_year: r.fiscal_year, name: n, group: g, value: r.obligations })
  }
  return [...acc.values()]
}

interface Segment {
  group: string
  value: number
}

interface NamedRowWithSegments {
  name: string
  obligations: number
  segments: Segment[]
}

/**
 * From hfp's server/src/api/federal.ts, unchanged: pivot flat (name, group, value) rows into
 * nested rows with a sorted segment list per name, ordered by total obligations desc.
 * Non-positive segments (rare deobligations) are dropped, and `obligations` is the sum of the
 * positive segments, so bar width and label stay consistent with what's actually drawn.
 */
function pivotToSegments(flat: Array<{ name: string; group: string; value: number }>): NamedRowWithSegments[] {
  const byName = new Map<string, Map<string, number>>()
  for (const r of flat) {
    const v = Number(r.value) || 0
    if (v <= 0) continue
    let segs = byName.get(r.name)
    if (!segs) {
      segs = new Map()
      byName.set(r.name, segs)
    }
    segs.set(r.group, (segs.get(r.group) ?? 0) + v)
  }
  const out: NamedRowWithSegments[] = []
  for (const [name, segs] of byName) {
    let obligations = 0
    for (const v of segs.values()) obligations += v
    const segments = Array.from(segs, ([group, value]) => ({ group, value })).sort((a, b) => b.value - a.value)
    out.push({ name, obligations, segments })
  }
  out.sort((a, b) => b.obligations - a.obligations)
  return out
}

export interface CompositionQuery {
  fy: number
  authority?: string
  recipientType?: string
  department?: string
  /** Every year in the charts' range instead of `fy` (the download). */
  allYears?: boolean
}

/**
 * /api/federal/composition: [{fiscal_year, name, obligations}], by year then largest first.
 * Levels: budget authority, then recipient type, then department, then award type.
 */
export async function composition(q: CompositionQuery) {
  const s = await federalSummary()
  const inRange = (y: number) => (q.allYears ? y >= s.fyMin && y <= s.fyMax : y === q.fy)
  let rows = s.rows.filter(r => inRange(r.fiscal_year))
  let name: (r: SummaryRow) => string = r => r.budget_authority_type
  if (q.authority) {
    rows = rows.filter(r => r.budget_authority_type === q.authority)
    name = r => U(r.recipient_reporting_category)
    if (q.recipientType) {
      rows = rows.filter(r => U(r.recipient_reporting_category) === q.recipientType)
      name = r => U(r.awarding_toptier_agency_name)
      if (q.department) {
        rows = rows.filter(r => U(r.awarding_toptier_agency_name) === q.department)
        name = r => u(r.award_category)
      }
    }
  }
  return sumRows(rows, name)
    .map(({ fiscal_year, name, value }) => ({ fiscal_year, name, obligations: value }))
    .sort((a, b) => a.fiscal_year - b.fiscal_year || b.obligations - a.obligations)
}

export interface DrilldownQuery {
  fy: number
  groupBy: 'award_type' | 'recipient_category'
  department?: string | null
  program?: string | null
  /** Every year in the charts' range instead of `fy`, as flat rows (the download). */
  allYears?: boolean
}

interface AwardsIndexEntry {
  department: string | null
  program_category: string | null
  file: string
  download: string
  awards: number
}

/**
 * /api/federal/drilldown: departments, or a department's programs, as stacked rows (flat rows
 * with allYears); or a program's 50 largest awards plus "All other awards".
 */
export async function drilldown(q: DrilldownQuery): Promise<any[]> {
  const s = await federalSummary()
  const inRange = (y: number) => (q.allYears ? y >= s.fyMin && y <= s.fyMax : y === q.fy)
  const groupCol = q.groupBy === 'recipient_category' ? 'recipient_reporting_category' : 'award_category'
  const group = (r: any) => u(r[groupCol])

  if (!q.program) {
    let rows = s.rows.filter(r => inRange(r.fiscal_year))
    let name = (r: SummaryRow) => U(r.awarding_toptier_agency_name)
    if (q.department) {
      // matched as given, as the server does (so 'Unknown' has no programs)
      rows = rows.filter(r => r.awarding_toptier_agency_name === q.department)
      name = r => u(r.program_category)
    }
    const flat = sumRows(rows, name, group) as Array<Flat & { group: string }>
    return q.allYears ? flat : pivotToSegments(flat)
  }

  const index = await getJson<AwardsIndexEntry[]>('federal/awards/index.json')
  const entry = index.find(e => e.department === q.department && u(e.program_category) === q.program)
  if (!entry) return []
  const shape = (r: any, fiscal_year: number) => ({
    award_id: r.award_id,
    cfda_number: r.cfda_number,
    label: r.label,
    group: group(r),
    obligations: r.obligations,
    fiscal_year
  })
  if (q.allYears) {
    const t = await getJson<any>(`federal/${entry.download}`)
    return objects(t)
      .filter(r => inRange(r.fiscal_year))
      .map(r => shape(r, r.fiscal_year))
  }
  const t = await getJson<any>(`federal/${entry.file}`)
  const year = t.years[String(q.fy)]
  if (!year) return []
  const top: any[] = objects({ columns: t.columns, rows: year.rows }).map(r => shape(r, q.fy))
  if (year.other > 0) {
    top.push({ award_id: null, cfda_number: null, label: 'All other awards', group: 'Other', obligations: year.other })
  }
  return top
}
