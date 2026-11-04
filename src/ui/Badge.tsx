import { Box, Stack } from '@mui/material'

interface Props {
  label: string
  value: string
  backgroundColor?: string
  color?: string
}

export function Badge({ label, value, backgroundColor, color }: Props) {
  return (
    <Stack
      className="Badge"
      direction="row"
      borderRadius="4px"
      sx={{
        display: 'inline-flex',
        fontSize: '0.7rem',
        color: color ?? 'white'
      }}
    >
      <Box
        px={1.5}
        py="7px"
        sx={{
          opacity: 0.5,
          lineHeight: 1,
          backgroundColor: backgroundColor ?? 'var(--color-primary)',
          borderTopLeftRadius: '4px',
          borderBottomLeftRadius: '4px'
        }}
      >
        {label}
      </Box>
      <Box
        px={1.5}
        py="7px"
        sx={{
          lineHeight: 1,
          backgroundColor: backgroundColor ?? 'var(--color-primary)',
          borderTopRightRadius: '4px',
          borderBottomRightRadius: '4px'
        }}
      >
        {value}
      </Box>
    </Stack>
  )
}
