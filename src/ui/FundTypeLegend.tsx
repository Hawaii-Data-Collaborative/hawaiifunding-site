import { Box } from '@mui/material'
import { FUND_TYPES, FUND_TYPE_TO_COLOR } from '../constants'

export function FundTypeLegend() {
  return (
    <Box display="flex" flexWrap="wrap" justifyContent="center" gap="16px" py={1.5}>
      {FUND_TYPES.map(ft => (
        <Box key={ft} display="flex" alignItems="center" gap="6px">
          <Box
            width="12px"
            height="12px"
            sx={{ backgroundColor: FUND_TYPE_TO_COLOR[ft], borderRadius: '2px', flexShrink: 0 }}
          />
          <span style={{ fontSize: 'var(--font-size-sm)' }}>{ft}</span>
        </Box>
      ))}
    </Box>
  )
}
