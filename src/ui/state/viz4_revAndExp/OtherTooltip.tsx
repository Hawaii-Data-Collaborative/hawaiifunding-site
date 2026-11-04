import { useEffect, useRef } from 'react'
import { Box, Typography } from '@mui/material'
import { formatCurrency } from '../../../util'

interface OtherTooltipProps {
  segments: { name: string; value: number }[]
  totalValue: number
  x: number
  y: number
  visible: boolean
}

export function OtherTooltip({ segments, totalValue, x, y, visible }: OtherTooltipProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (event: CustomEvent) => {
      x = event.detail.clientX
      y = event.detail.clientY
      const div = ref.current
      if (div) {
        div.style.left = x + 20 + 'px'
        div.style.top = y - 10 + 'px'
      }
    }
    document.addEventListener('otherTooltipMouseMove', fn)
    return () => {
      document.removeEventListener('otherTooltipMouseMove', fn)
    }
  }, [])

  if (!visible || segments.length === 0) return null

  return (
    <Box
      sx={{
        position: 'fixed',
        left: x + 10,
        top: y - 10,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        zIndex: 1000,
        maxWidth: '300px',
        pointerEvents: 'none',
        lineHeight: '1.3',
        whiteSpace: 'pre-wrap',
        fontSize: 'var(--font-size-sm)'
      }}
      ref={ref}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '12px' }}>
        Other - {formatCurrency(totalValue)}
      </Typography>
      <Box sx={{ maxHeight: '200px', overflowY: 'auto' }}>
        {segments
          .sort((a, b) => b.value - a.value)
          .map((segment, index) => (
            <div key={index} className="labelvalue2 cols-2">
              <span>{segment.name}</span>
              <span>{formatCurrency(segment.value)}</span>
            </div>
          ))}
      </Box>
    </Box>
  )
}
