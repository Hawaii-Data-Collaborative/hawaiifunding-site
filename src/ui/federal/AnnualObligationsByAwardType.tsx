import { useEffect, useState } from 'react'
import { loadFederalByAwardType, FederalByAwardTypeRow } from '../../loadFederalData'
import { FederalStackedBar } from './FederalStackedBar'

export function AnnualObligationsByAwardType() {
  const [rows, setRows] = useState<FederalByAwardTypeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadFederalByAwardType().then(setRows).catch(e => setError(String(e)))
  }, [])

  if (error) return <div>Failed to load: {error}</div>
  if (!rows) return <div>Loading…</div>

  return <FederalStackedBar rows={rows} keyField="award_type" topN={3} />
}
