import * as d3 from 'd3'
import { capitalCase } from 'change-case'
import { cleanName, num } from './util'
import {
  BOOLEAN_COLS,
  MOFCODE_TO_SPENDING_TYPE,
  MOFCODE_TO_FUNDING_SOURCE,
  NUMBER_COLS,
  TRUE_VALUES,
  FundingSource,
  SpendingType,
  BASE_URL,
  PRODUCTION
} from './constants'

let cache: Row[] | null = null

/**
 * Loads state_budget.csv once and returns the rows the state charts draw from
 * (dollars only, final appropriation per fiscal year). Callers put the result on
 * `window._data`; see the comment in loadProgramData.ts for why the Program ID page
 * doesn't do the same.
 */
export async function loadStateData(): Promise<Row[]> {
  if (cache) {
    return cache
  }

  let prefix: string
  if (PRODUCTION) {
    prefix = BASE_URL
  } else if (location.hostname === 'dev.hawaiidata.org') {
    prefix = '/fed-funds-charts'
  } else {
    prefix = '/data'
  }

  const csvPath = `${prefix}/state_budget.csv`
  console.log('[loadStateData] csvPath=%s', csvPath)
  const data = (await d3.csv(csvPath)) as unknown as Row[]

  for (const [i, d] of data.entries()) {
    d.id = i + 10

    // Strip letter code prefix (e.g. "G. FORMAL EDUCATION" → "Formal Education")
    d.area = capitalCase(d.area.replace(/^[A-Z]\.\s*/, ''))

    // Strip "Department of" / "Department of the" prefix
    d.department = (d.department ?? '').replace(/^Department of (the )?/i, '')

    for (const col of NUMBER_COLS) {
      d[col] = num(d[col])
    }

    for (const col of BOOLEAN_COLS) {
      const value = (d[col] ?? '').toLowerCase()
      d[col] = TRUE_VALUES.includes(value)
    }

    d.program_clean = d.program_clean ?? cleanName(d.program)
    d.funding_source = MOFCODE_TO_FUNDING_SOURCE[d.mof] ?? FundingSource.STATE
    d.spending_type = MOFCODE_TO_SPENDING_TYPE[d.mof] ?? SpendingType.UNKNOWN
  }

  window._rawdata = data

  cache = data.filter(d => d.type === 'Dollars' && d.is_reporting_final && d.is_reporting_final_one_per_fy)

  return cache
}
