import { useEffect, useState } from 'react'
import { loadFederalByRecipientType, FederalByRecipientTypeRow } from '../../loadFederalData'
import { FederalStackedBar } from './FederalStackedBar'

export function AnnualObligationsByRecipientType() {
  const [rows, setRows] = useState<FederalByRecipientTypeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadFederalByRecipientType().then(setRows).catch(e => setError(String(e)))
  }, [])

  if (error) return <div>Failed to load: {error}</div>
  if (!rows) return <div>Loading…</div>

  return <FederalStackedBar rows={rows} keyField="recipient_type" topN={4} />
}
