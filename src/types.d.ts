interface Row {
  id: number

  // int64 fields
  year: number
  session_year: number
  base_month: number
  day_offset: number
  fiscal_year: number
  budget_type_rank: number
  process_priority: number
  stage_rank: number
  record_rank_score: number

  // float64 fields
  item_row: number
  iteration: number
  budget_change_from_prior_final: number
  percent_change_from_prior_final: number

  // boolean fields
  is_supplemental: boolean
  is_reporting_final: boolean
  is_reporting_final_one_per_fy: boolean
  is_revised: boolean
  is_historical: boolean

  // string fields
  source_file: string
  area: string
  itemno: string
  program_id: string
  program: string
  program_clean: string
  category: string
  agency: string
  agency_name: string
  type: 'Dollars' | 'Permanent Positions' | 'Temporary Positions'
  program_prefix: string
  department: string
  process: string
  stage: string
  budget: number
  mof: string
  mof_description: string
  budget_type: string
  base_date: string
  sequence_date: string
  biennium: string
  biennium_range: string
  is_in_conference_final: boolean
  budget_group: string
  bill_prefix: string
  source_link: string
  source_direct_link: string
  worksheet_link: string
  worksheet_direct_link: string
  mof_display: string
  markup: string
  revision_type: string
  release_date: string
  release_note: string

  // derived fields
  funding_source: 'Federal Funds' | 'State General Funds' | 'Special Funds' | 'Other'
  spending_type: 'Discretionary' | 'Mandatory' | 'Mixed or Unknown'
}

interface VizNode {
  id: string | number
  name: string
  column: number
  color: string
  data?: any
}

interface VizLink {
  source: string | number
  target: string | number
  value: number
  data?: any
  sourceColor?: string
  targetColor?: string
}

interface VizSize {
  width: number
  height: number
}
