export const PRODUCTION = !['dev.hawaiidata.org', 'localhost'].includes(location.hostname)

export const BASE_URL = PRODUCTION ? 'https://dev.hawaiidata.org/fed-funds-charts' : ''

/**
 * Where the data files from State-Budget's build_site_data.py are served: every chart and the
 * Program ID page read them here instead of asking hfp's server. Locally (`npm run dev`),
 * `npm run copy-data` copies them into public/data/, which Vite serves at /data.
 */
export const DATA_URL = PRODUCTION ? `${BASE_URL}/data` : '/data'

export const Chart = {
  FUNDING_OVERVIEW: 'overview',
  FUNDING_FLOW: 'flow',
  FUNDING_BY_SOURCE: 'by-src',
  FUNDING_BY_DEPT: 'by-dept',
  FUNDING_BY_PROGRAM: 'by-prog'
} as const

// Years after the current year are treated as "future sessions"
export const CURRENT_YEAR = new Date().getFullYear()

/**
 * Hawaiʻi's fiscal year runs 1 July – 30 June and is named for the year it ends, so from
 * July onward the current fiscal year is already the next calendar year: August 2026 sits
 * in FY2027.
 *
 * Comparing a fiscal year against CURRENT_YEAR instead mislabels the year we're actually
 * in as a future one — which is what made FY2027 read as "future session" in Program ID.
 */
export const CURRENT_FISCAL_YEAR = new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0)

// HFP color palette — see color-palette.pdf
// Grey (#c4c4c4) is always last and reserved for "Other" only

// 6-group row 1: for Budget Area charts (Viz 2)
export const PALETTE_6 = [
  '#153750', // HDC Dark Blue
  '#008f8c', // Teal
  '#0c5a9a', // Blue 1
  '#5a2a83', // Purple
  '#c44e00', // Burnt Orange
  '#c4c4c4' // Other (Light Gray)
]

// 7-group row 2: for Department charts (Viz 3)
export const PALETTE_7 = [
  '#153750', // HDC Dark Blue
  '#008f8c', // Teal
  '#0c5a9a', // Blue 1
  '#5a2a83', // Purple
  '#c44e00', // Burnt Orange
  '#a67c00', // Mustard
  '#c4c4c4' // Other (Light Gray)
]

// 8-group row 2: default categorical palette (Viz 4 YOY, Viz 5 Donut)
export const PALETTE_8 = [
  '#153750', // HDC Dark Blue
  '#008f8c', // Teal
  '#0c5a9a', // Blue 1
  '#5a2a83', // Purple
  '#9c3d6a', // Dusty Rose
  '#c44e00', // Burnt Orange
  '#a67c00', // Mustard
  '#c4c4c4' // Other (Light Gray)
]

export const COLORS_EVEN_SHORTER_LIST = [
  '#153750', // federal funds (HDC Dark Blue)
  '#008f8c', // state general funds (Teal)
  '#0c5a9a', // special funds (Blue 1)
  '#c4c4c4' // other (Light Gray)
]

export const FEDERAL_COLOR = COLORS_EVEN_SHORTER_LIST[0]
export const STATE_COLOR = COLORS_EVEN_SHORTER_LIST[1]
export const SPECIAL_COLOR = COLORS_EVEN_SHORTER_LIST[2]
export const OTHER_COLOR = COLORS_EVEN_SHORTER_LIST[3]

export const NUMBER_COLS = [
  'year',
  'session_year',
  'budget',
  'base_month',
  'day_offset',
  'fiscal_year',
  'budget_type_rank',
  'process_priority',
  'stage_rank',
  'record_rank_score',
  'item_row',
  'iteration',
  'budget_change_from_prior_final',
  'percent_change_from_prior_final'
]

export const BOOLEAN_COLS = [
  'is_supplemental',
  'is_reporting_final',
  'is_reporting_final_one_per_fy',
  'is_historical',
  'is_in_conference_final'
]

export const TRUE_VALUES = ['true', 'yes', 'y', 't', '1']

export const STATE = 'State General Funds'
export const SPECIAL = 'Special Funds'
export const FEDERAL = 'Federal Funds'
export const OTHER = 'Other'

export const FundingSource = {
  STATE,
  SPECIAL,
  FEDERAL,
  OTHER
} as const

export const FUND_TYPES = [FEDERAL, STATE, SPECIAL, OTHER]
export const FUND_TYPE_TO_COLOR = {
  [FEDERAL]: FEDERAL_COLOR,
  [STATE]: STATE_COLOR,
  [SPECIAL]: SPECIAL_COLOR,
  [OTHER]: OTHER_COLOR
}

// Means-of-financing code → the label the budget data spells out for it. The budget
// tables carry both, but the contracts data only has the bare code, so program pages
// use this to render "A" as "General Funds".
export const MOF_CODE_TO_DESCRIPTION: Record<string, string> = {
  A: 'General Funds',
  B: 'Special Funds',
  C: 'General Obligation Bond Fund',
  D: 'General Obligation Bond Fund (debt service from special funds)',
  E: 'Revenue Bond Funds',
  N: 'Federal Funds',
  P: 'Other Federal Funds',
  R: 'Private Contributions',
  S: 'County Funds',
  T: 'Trust Funds',
  U: 'Interdepartmental Transfers',
  V: 'Federal Stimulus Funds',
  W: 'Revolving Funds',
  X: 'Other Funds'
}

export const MOFCODE_TO_FUNDING_SOURCE = {
  A: STATE,
  B: SPECIAL,
  C: STATE,
  D: STATE,
  E: STATE,
  N: FEDERAL,
  P: FEDERAL,
  R: OTHER,
  S: OTHER,
  T: STATE,
  U: STATE,
  V: FEDERAL,
  W: STATE,
  X: STATE,

  '-1': FEDERAL,
  '10': FEDERAL,
  '11': FEDERAL,
  '2': FEDERAL,
  '3': FEDERAL,
  '4': FEDERAL,
  '5': FEDERAL,
  '6': FEDERAL,
  '9': FEDERAL,
  F: FEDERAL,
  IDV_A: FEDERAL,
  IDV_B: FEDERAL,
  IDV_B_A: FEDERAL,
  IDV_B_B: FEDERAL,
  IDV_B_C: FEDERAL,
  IDV_C: FEDERAL,
  IDV_D: FEDERAL,
  IDV_E: FEDERAL
} as const

const DISCRETIONARY = 'Discretionary'
const MANDATORY = 'Mandatory'
const UNKNOWN = 'Mixed or Unknown'

export const SpendingType = {
  DISCRETIONARY,
  MANDATORY,
  UNKNOWN
}

export const MOFCODE_TO_SPENDING_TYPE = {
  A: DISCRETIONARY,
  B: DISCRETIONARY,
  C: DISCRETIONARY,
  D: DISCRETIONARY,
  E: DISCRETIONARY,
  N: MANDATORY,
  P: MANDATORY,
  R: MANDATORY,
  S: DISCRETIONARY, // assumed
  T: MANDATORY,
  U: MANDATORY,
  V: MANDATORY,
  W: DISCRETIONARY,
  X: UNKNOWN
}

/**
 * Department code → short name, for naming the source document behind a contract row.
 *
 * `hi.hi_state_contracts` has no document title — only `filename`, and the filenames are
 * too inconsistent to clean up into a label. The Hawaii State Public Library System's
 * annual report alone arrives as `EDN-HSPLS_2024.pdf`, `EDN-Libraries_2025.pdf`,
 * `EDN-LIB-2019.pdf`, `EDN_HSPLS.pdf`, `HSPLS_2015.pdf` and `EDN-Libraries.pdf` — six
 * spellings of one recurring document, so a cleaned filename would read as six sources.
 * Labels are therefore built from `dept_code` + the report year instead ("DOE 2024
 * Report"), which stays stable across years.
 *
 * ⚠️ These abbreviations are NOT in the data — they're the conventional Hawaii short
 * forms, entered by hand and pending Amanda's confirmation (see
 * docs/program-id-open-decisions.md). Four codes have no state budget rows to check
 * against at all: JUD, OHA, DCR and WAM. WAM is the Senate Ways and Means committee
 * rather than a department — it appears because four 2012 `INFO_TESTIMONY_WAM_*` files
 * carry contract tables.
 *
 * Unknown codes fall back to the raw code, which is honest and still sorts sensibly.
 */
export const DEPT_CODE_TO_ABBREV: Record<string, string> = {
  AGR: 'HDOA',           // Agriculture
  AGS: 'DAGS',           // Accounting and General Services
  ATG: 'AG',             // Attorney General
  BED: 'DBEDT',          // Business, Economic Development & Tourism
  BUF: 'B&F',            // Budget and Finance
  CCA: 'DCCA',           // Commerce and Consumer Affairs
  DCR: 'DCR',            // Corrections and Rehabilitation
  DEF: 'HI-DOD',         // Hawaii Dept. of Defense — disambiguated from the federal DoD
  EDN: 'DOE',            // Education
  GOV: 'Governor',       // Office of the Governor
  HHL: 'DHHL',           // Hawaiian Home Lands
  HMS: 'DHS',            // Human Services
  HRD: 'DHRD',           // Human Resources Development
  HTH: 'DOH',            // Health
  JUD: 'Judiciary',
  LAW: 'Legislature',
  LBR: 'DLIR',           // Labor and Industrial Relations
  LNR: 'DLNR',           // Land and Natural Resources
  LTG: 'Lt. Governor',   // Office of the Lieutenant Governor
  OHA: 'OHA',            // Office of Hawaiian Affairs
  PSD: 'PSD',            // Public Safety (predecessor of DCR)
  TAX: 'DOTAX',          // Taxation
  TRN: 'HDOT',           // Transportation
  UOH: 'UH',             // University of Hawaii
  WAM: 'Senate WAM'      // Senate Ways and Means committee
}
