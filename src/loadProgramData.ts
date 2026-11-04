import { capitalCase } from 'change-case'
import { DEPT_CODE_TO_ABBREV } from './constants'
import { programContracts, programDetail, programList } from './staticData'

/**
 * Program ID data loading. Unlike the state vizzes (which pull the whole
 * state_budget.csv into window._data), these read one program's files (program/<ID>.json and
 * program/<ID>.contracts.json, through staticData.ts) — a program page needs one program out
 * of 293, so downloading all of them would be absurd.
 *
 * Display-time normalization lives here rather than in the API so the raw shapes stay
 * queryable: area codes get their "J. " prefix stripped and are title-cased, and
 * SHOUTING recipient/entity names from the bill text are title-cased. Both mirror what
 * loadStateData.ts already does for the state charts.
 */

export interface ProgramSummary {
  program_id: string
  program: string
  department: string
  area: string
  first_fy: number
  last_fy: number
}

export interface ProgramMeta extends ProgramSummary {
  /** From the canonical view, which covers all 293 programs. */
  program_description: string | null
}

export interface OverTimeRow {
  fiscal_year: number
  dollars: number
  perm_positions: number
  temp_positions: number
}

export interface MofRow {
  fiscal_year: number
  mof_description: string
  amount: number
}

/**
 * One of the six canonical legislative stages, in `stage_rank` order: House, Senate,
 * Conf, then House (s), Senate (s), Conf (s) for the following session's supplemental.
 */
export interface StageRow {
  fiscal_year: number
  stage_rank: number
  stage: string
  amount: number
}

/** One bill version that touched a fiscal year — powers the Budget By Stage drill-down. */
export interface BillDetailRow {
  fiscal_year: number
  session_year: number
  stage_rank: number
  stage: string
  is_supplemental: boolean
  enacted: boolean
  amount: number
  /** Committee worksheets cover operating only; this is the figure that ties out to them. */
  operating: number | null
  capital: number | null
  worksheet_link: string | null
  bill_link: string | null
}

export interface GrantRow {
  /**
   * Legislative **session** year, not a fiscal year — the column is labelled "Session
   * Year" for that reason. The other three tables say "Fiscal Year".
   */
  year: number
  recipient: string
  purpose: string
  full_text: string
  amount: number
  /** Deep link into the bill text, anchored on the grantee name. */
  link: string | null
  /** The bill the grant was appropriated in, extension stripped — "HB300 CD1". */
  source_name: string | null
}

/** One capital project line from `hi.hi_state_cip`, deduped to the latest session per FY. */
export interface CipRow {
  fiscal_year: number
  session_year: number
  bill: string | null
  project_title: string
  mof_description: string
  location: string | null
  amount: number
  /** Worksheet PDF, page-anchored. */
  source_link: string | null
}

/**
 * One federal award linked to this program. Already scoped server-side to obligations at
 * state level, which makes (fiscal year, FAIN) unique — so one of these is one award.
 * `amount` can be negative: deobligations are recorded as negative obligations.
 */
export interface FederalAwardRow {
  fiscal_year: number
  cfda_number: string | null
  fain: string | null
  funding_source: string | null
  amount: number
  /** usaspending.gov deep link for this specific award. */
  link: string | null
}

export interface ProgramDocuments {
  requests: Array<{ year: string; report_type: string; source_link: string; source_direct_link: string }>
  /**
   * Budgeted vs actual expenditures. Appropriation bills used to appear here too; QA
   * flagged them as redundant with Appropriations Over Time, so they're gone.
   */
  variance: Array<{ fiscal_year: number; budgeted: number; actual: number; link: string | null }>
  /** Empty for ~81% of programs — only 56 of 293 have any linked federal award. */
  federalAwards: FederalAwardRow[]
}

/**
 * Which legislative sessions the grants and CIP extracts cover, dataset-wide. Drives the
 * coverage notes under those two sections, which describe the dataset rather than this
 * program — see the query comment in server/src/program.ts.
 */
export interface Coverage {
  grantSessions: number[]
  cipSessions: number[]
}

export interface ProgramDetail {
  program: ProgramMeta
  overTime: OverTimeRow[]
  mofByYear: MofRow[]
  byStage: StageRow[]
  billDetail: BillDetailRow[]
  grants: GrantRow[]
  cip: CipRow[]
  documents: ProgramDocuments
  coverage: Coverage
}

export interface ContractRow {
  fy_bucket: string | null
  entity: string | null
  /** Not a table column since v2 — kept for the CSV export only. */
  program_name: string | null
  mof: string
  amount: string | null
  amount_parsed: number | null
  max_value: string | null
  max_value_parsed: number | null
  term_from: string | null
  term_to: string | null
  contract_number: string | null
  pdf_url_with_page: string | null
  /** Source PDF's filename — the only identity the document has in the data. */
  filename: string | null
  dept_code: string | null
}

/** The two sortable columns, per QA. Sorting happens server-side over the whole set. */
export type ContractSort = 'fy' | 'amount'
export type SortDir = 'asc' | 'desc'

export interface ContractsPage {
  total: number
  totalAmount: number
  withAmount: number
  unparsed: number
  /** Span the rows cover, for the "Fiscal Years" tile. Null when no row states an FY. */
  fyMin: number | null
  fyMax: number | null
  /** MOF codes used anywhere in this program's contracts, for the header legend. */
  mofCodes: string[]
  page: number
  pageSize: number
  sort: ContractSort
  dir: SortDir
  rows: ContractRow[]
}

/** "J. INDIVIDUAL RIGHTS" → "Individual Rights" (matches loadStateData.ts). */
export function cleanArea(area: string | null | undefined): string {
  if (!area) return ''
  return capitalCase(area.replace(/^[A-Z]\.\s*/, ''))
}

// Words that stay lowercase inside a title-cased name — without these, "UNIVERSITY OF
// HAWAII" comes out as "University OF Hawaii", since they'd otherwise be caught by the
// short-all-caps acronym rule below.
const LOWERCASE_WORDS = new Set(['of', 'the', 'and', 'for', 'to', 'at', 'in', 'on', 'a', 'an'])

/**
 * Tokens to leave in caps. An explicit list rather than a "short and all-caps" rule,
 * because in this data most short tokens are ordinary or Hawaiian words that *should* be
 * title-cased — SUM, NEW, KA, WAI, LEI, ALA, OLA, IKE — while the genuine acronyms are a
 * minority. The heuristic produced "Lump SUM CIP" and would have shouted place names.
 */
const ACRONYMS = new Set([
  'CIP', 'CCS', 'DCR', 'UHM', 'PSD', 'CC', 'HVAC', 'ADA', 'ROTC', 'STEM',
  'LLC', 'DBA', 'UH', 'HI', 'USA', 'HQ', 'GO', 'II', 'III', 'IV', 'JR', 'SR'
])

function titleSegment(seg: string): string {
  if (!seg) return seg
  if (ACRONYMS.has(seg.toUpperCase())) return seg.toUpperCase()
  if (/^[&.]+$/.test(seg)) return seg
  // Anything with a digit is a code, not a word — 42F, EDN100, HB300, "PHASE 2A" — and
  // lower-casing its tail ("42f", "Edn100") makes it look like a typo.
  if (/\d/.test(seg)) return seg
  return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase()
}

/**
 * Title-case a SHOUTING string from the bill text — program names, grantees, vendors.
 *
 * Splits on hyphens and slashes as well as spaces so "SCHOOL-BASED BUDGETING" keeps its
 * hyphen ("School-Based Budgeting") rather than losing it, which is what a plain
 * capitalCase over the whole string does. Anything already mixed-case is left untouched.
 */
export function titleCaseCaps(name: string | null | undefined): string {
  if (!name) return ''
  if (/[a-z]/.test(name)) return name

  return name
    .split(/\s+/)
    .map((word, i) => {
      const bare = word.replace(/[^A-Za-z]/g, '').toLowerCase()
      if (i > 0 && LOWERCASE_WORDS.has(bare)) return word.toLowerCase()
      // Keep the separators by capturing them in the split.
      return word
        .split(/([-/])/)
        .map(seg => (seg === '-' || seg === '/' ? seg : titleSegment(seg)))
        .join('')
    })
    .join(' ')
}

/**
 * Proper nouns that a sentence-cased grant description should keep capitalised. A short
 * list of the places that recur in the bill text, not an attempt at NER — a miss just
 * leaves a place name in lower case, which reads as a lapse rather than an error.
 */
const KEEP_CASE = [
  'Hawaii Revised Statutes',
  'Hawaii',
  'Hawaiian',
  'Hawaiians',
  'Oahu',
  'Maui',
  'Kauai',
  'Molokai',
  'Lanai',
  'Niihau',
  'Honolulu',
  'Hilo',
  'Kona',
  'Waikiki',
  'Leeward',
  'Windward',
  'Kaneohe',
  'Kailua',
  'Kapolei',
  'Waianae',
  'Waipahu',
  'Waimanalo',
  'Lahaina',
  'Kahului',
  'Lihue',
  'Puna',
  'Hamakua',
  'Kohala',
  'Kau'
]

const SENTENCE_ACRONYMS = new Set([...ACRONYMS].filter(a => !['GO', 'HI', 'CC', 'NO'].includes(a)))

/** Abbreviations whose trailing period doesn't end a sentence. */
const NOT_SENTENCE_END = /\b(inc|ltd|llc|co|corp|st|dr|jr|sr|mr|mrs|ms|no|vs)\.$/i

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Sentence-case a SHOUTING passage of bill text — the grant descriptions, which are whole
 * sentences ("CHAPTER 42F, HAWAII REVISED STATUTES, FOR X, FOR COSTS RELATED TO …") rather
 * than names, so title-casing them the way `titleCaseCaps` does the recipients reads as a
 * headline. QA v3 asked for the case to be normalised.
 *
 * Three things survive the lower-casing: tokens with digits (42F, EDN100, HB300), the
 * recurring proper nouns in KEEP_CASE, and any `keep` phrases the caller passes — the
 * grantee's own title-cased name, so it appears in the description exactly as it does in
 * the Recipient column. Anything already mixed-case is left untouched, as with
 * `titleCaseCaps`.
 */
export function sentenceCaseCaps(text: string | null | undefined, keep: string[] = []): string {
  if (!text) return ''
  if (/[a-z]/.test(text)) return text

  let out = text.toLowerCase()

  // Capital at the start and after a sentence-ending period — but not after "Inc." or
  // "Co.", which is most of the periods in this text.
  out = out.replace(/(^|\.\s+)([a-z])/g, (m, lead: string, ch: string, offset: number) => {
    const before = out.slice(0, offset + lead.length).trimEnd()
    return offset > 0 && NOT_SENTENCE_END.test(before) ? m : lead + ch.toUpperCase()
  })

  // Codes back to caps. The source is all-caps, so upper-casing the whole token is exact.
  out = out.replace(/\b[a-z0-9]*\d[a-z0-9]*\b/g, m => m.toUpperCase())
  // Acronyms too ("pop-up labs for STEM"), minus the ones that are also ordinary words
  // in running text — GO, HI, CC, NO — which the name-oriented list can afford and a
  // sentence can't.
  out = out.replace(/\b[a-z]{2,4}\b/g, m => (SENTENCE_ACRONYMS.has(m.toUpperCase()) ? m.toUpperCase() : m))

  // Matched word-by-word with any punctuation between, because the description doesn't
  // always punctuate the grantee the way the recipient field does ("ROBOTICS INC." vs
  // "ROBOTICS, INC."). The match is re-cased in place, so the description keeps its own
  // punctuation. Lookarounds rather than \b: a phrase ending in "Inc." has no word
  // boundary after the period when a comma follows it.
  for (const phrase of [...keep, ...KEEP_CASE]) {
    const words = phrase.split(/[^A-Za-z0-9']+/).filter(Boolean)
    if (!words.length) continue
    const re = new RegExp(
      `(?<![A-Za-z0-9])${words.map(escapeRegExp).join('[^A-Za-z0-9]{1,3}')}(?![A-Za-z0-9])`,
      'gi'
    )
    out = out.replace(re, m => titleCaseCaps(m.toUpperCase()))
  }
  return out
}

let programListPromise: Promise<ProgramSummary[]> | null = null

/**
 * Every program, for the search box. Cached as the in-flight promise so several
 * mounted instances on one page share a single request.
 */
export function loadProgramList(): Promise<ProgramSummary[]> {
  if (!programListPromise) {
    programListPromise = programList()
      .then(rows =>
        rows.map(r => ({ ...r, program: titleCaseCaps(r.program), area: cleanArea(r.area) }))
      )
      .catch(err => {
        programListPromise = null // let a later mount retry
        throw err
      })
  }
  return programListPromise
}

const detailCache = new Map<string, ProgramDetail>()

export async function loadProgramDetail(programId: string): Promise<ProgramDetail> {
  const id = programId.trim().toUpperCase()
  const cached = detailCache.get(id)
  if (cached) return cached

  const d = await programDetail(id)
  const detail: ProgramDetail = {
    ...d,
    program: {
      ...d.program,
      program: titleCaseCaps(d.program.program),
      area: cleanArea(d.program.area)
    },
    grants: d.grants.map(g => {
      const recipient = titleCaseCaps(g.recipient)
      return {
        ...g,
        recipient,
        purpose: sentenceCaseCaps(g.purpose, [recipient]),
        full_text: sentenceCaseCaps(g.full_text, [recipient])
      }
    }),
    cip: d.cip.map(c => ({ ...c, project_title: titleCaseCaps(c.project_title) }))
  }
  detailCache.set(id, detail)
  return detail
}

/**
 * Name the source document behind a contract row — "DOE 2024 Report".
 *
 * `hi_state_contracts` has no title field, so the label is assembled from the department
 * code and the report's year. The year is taken from the **filename**, not the row's
 * fiscal year: one report covers several fiscal years (`EDN-Libraries_2025.pdf` carries
 * FY2024–FY2026 rows), and the label names the document, not the row. `fy_bucket` is the
 * fallback for the 1,809 rows whose filename has no year in it.
 *
 * Deliberately not derived from the filename itself — see DEPT_CODE_TO_ABBREV for why
 * (six spellings of one library report).
 */
export function contractSourceLabel(row: {
  filename: string | null
  dept_code: string | null
  fy_bucket: string | null
}): string {
  const dept = (row.dept_code && DEPT_CODE_TO_ABBREV[row.dept_code]) || row.dept_code || ''
  // Four consecutive digits, so "HRD20-18.pdf" correctly finds no year and falls back.
  const fromName = row.filename?.match(/(?:19|20)\d{2}/)?.[0]
  const year = fromName ?? row.fy_bucket ?? ''
  return [dept, year, 'Report'].filter(Boolean).join(' ')
}

/** Every contract row for a program, for the download — the table itself still pages. */
export async function loadAllProgramContracts(programId: string): Promise<ContractRow[]> {
  const id = programId.trim().toUpperCase()
  const d = await programContracts(id, 1, 'fy', 'desc', true)
  return d.rows.map(r => ({ ...r, entity: titleCaseCaps(r.entity) }))
}

export async function loadProgramContracts(
  programId: string,
  page: number,
  sort: ContractSort = 'fy',
  dir: SortDir = 'desc'
): Promise<ContractsPage> {
  const id = programId.trim().toUpperCase()
  // Sorted over the program's whole contract file rather than in the table: only 25 of up to
  // ~2,400 rows are on screen, so sorting the table would reorder the page, not the dataset.
  const d = await programContracts(id, page, sort, dir)
  return { ...d, rows: d.rows.map(r => ({ ...r, entity: titleCaseCaps(r.entity) })) }
}

/**
 * Search over the program list. Matches program ID prefix first (typing "AGR1" should
 * surface AGR101 before a program whose *name* happens to contain "agr"), then name,
 * department, and area substrings.
 */
export function searchPrograms(programs: ProgramSummary[], query: string): ProgramSummary[] {
  const q = query.trim().toLowerCase()
  if (!q) return programs

  const scored: Array<{ p: ProgramSummary; score: number }> = []
  for (const p of programs) {
    const id = p.program_id.toLowerCase()
    const name = (p.program ?? '').toLowerCase()
    let score = -1
    if (id === q) score = 0
    else if (id.startsWith(q)) score = 1
    else if (name.startsWith(q)) score = 2
    else if (name.includes(q)) score = 3
    else if (id.includes(q)) score = 4
    else if ((p.department ?? '').toLowerCase().includes(q)) score = 5
    else if ((p.area ?? '').toLowerCase().includes(q)) score = 6
    if (score >= 0) scored.push({ p, score })
  }

  scored.sort((a, b) => a.score - b.score || a.p.program_id.localeCompare(b.p.program_id))
  return scored.map(s => s.p)
}
