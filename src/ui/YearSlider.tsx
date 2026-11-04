import { FormControl, Typography, Slider } from '@mui/material'
import { CURRENT_YEAR } from '../constants'
import { useTrackInteract } from './TrackedEmbed'

interface Props {
  value: number
  onChange: (e: any) => void
  min: number
  max: number
  step: number
  // When true, centers the "Fiscal Year: X" label above the slider track.
  // Default (left-aligned) is intended for state vizzes where the slider sits
  // in a horizontal row of controls; standalone usages (donut, drill-down)
  // look orphaned without it.
  centerLabel?: boolean
}

export function YearSlider({ value, onChange, min, max, step, centerLabel }: Props) {
  // Reported through the shared debounce: a drag fires onChange per step, and one gesture
  // should be one event. The chart name comes from the embed root's context, so this
  // single call covers every chart that mounts a slider.
  const report = useTrackInteract()

  const futureMarks = []
  for (let y = min; y <= max; y += step) {
    if (y > CURRENT_YEAR) futureMarks.push({ value: y })
  }

  const isFuture = value > CURRENT_YEAR

  return (
    <FormControl size="small" onClick={e => e.stopPropagation()} sx={{ minWidth: '180px' }}>
      <Typography
        variant="body2"
        sx={{
          position: 'relative',
          top: '-1px',
          fontSize: 'calc(var(--font-size-sm) + 2px)',
          whiteSpace: 'nowrap',
          display: 'inline-block',
          width: 'fit-content',
          alignSelf: centerLabel ? 'center' : 'flex-start'
        }}
      >
        Fiscal Year: {value}
        {isFuture && (
          <span
            style={{
              position: 'absolute',
              left: 'calc(100% + 6px)',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '10px',
              fontWeight: 600,
              backgroundColor: '#f0f0f0',
              color: '#697d8e',
              padding: '2px 6px',
              borderRadius: '4px',
              lineHeight: '1',
              whiteSpace: 'nowrap'
            }}
          >
            Current FY
          </span>
        )}
      </Typography>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        marks={futureMarks}
        onChange={(e, v) => {
          report('year', Array.isArray(v) ? v[0] : v)
          onChange(e)
        }}
        sx={{ '& .MuiSlider-thumb': { width: 16, height: 16 } }}
      />
    </FormControl>
  )
}
