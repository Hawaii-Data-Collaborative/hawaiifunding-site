import { useEffect, useState } from 'react'
import { loadFederalByDepartment, FederalByDepartmentRow } from '../../loadFederalData'
import { FederalStackedBar } from './FederalStackedBar'

export function AnnualObligationsByDepartment() {
  const [rows, setRows] = useState<FederalByDepartmentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadFederalByDepartment().then(setRows).catch(e => setError(String(e)))
  }, [])

  if (error) return <div>Failed to load: {error}</div>
  if (!rows) return <div>Loading…</div>

  return <FederalStackedBar rows={rows} keyField="department" topN={5} nestedOtherThreshold={100_000_000} />
}
