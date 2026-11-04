import { useMemo } from 'react'
import SearchIcon from '@mui/icons-material/Search'
import { Autocomplete, Box, InputAdornment, TextField, Typography } from '@mui/material'
import { searchPrograms, type ProgramSummary } from '../../loadProgramData'
import { trackDebounced } from '../../analytics'

/**
 * Search by program ID or keyword.
 *
 * An Autocomplete over the full 293-program list rather than a submit-then-search box:
 * the list is small enough to hold client-side, and "search by program ID" only works if
 * you can see AGR151 resolve to a name before committing. `filterOptions` is handed
 * straight to searchPrograms so ID-prefix matches win over name substring matches.
 *
 * Renders on navy in the page header (`variant="header"`) and on white on the landing
 * screen, hence the two colour treatments.
 *
 * **`disableClearable` on the header variant is a bug fix, not a style choice.** MUI clears
 * the selected value whenever the input goes empty — `if (newValue === '') handleValue(null,
 * 'clear')` — and since `selectOnFocus` highlights the whole label when you click in, a
 * single backspace emptied the box, fired `onChange(null)`, and dropped the reader back to
 * the landing screen mid-page, losing focus with it (QA hit exactly this). `disableClearable`
 * fails that guard, so backspace now just edits the text and `clearOnBlur` restores the
 * label if you tab away. It also removes the ✕, which only did the same unwanted thing;
 * going back to the landing screen is the browser's back button, since selection lives
 * in `?program=`.
 */

interface Props {
  programs: ProgramSummary[]
  value: ProgramSummary | null
  onChange: (program: ProgramSummary | null) => void
  variant?: 'header' | 'landing'
  autoFocus?: boolean
  disabled?: boolean
}

export function ProgramSearch({ programs, value, onChange, variant = 'header', autoFocus, disabled }: Props) {
  const onHeader = variant === 'header'

  const fieldSx = useMemo(
    () =>
      onHeader
        ? {
            background: 'white',
            borderRadius: 0,
            '& .MuiOutlinedInput-root': { borderRadius: 0 }
          }
        : {
            background: 'white',
            '& .MuiOutlinedInput-root': { borderRadius: 0 }
          },
    [onHeader]
  )

  return (
    <Autocomplete
      options={programs}
      value={value}
      disabled={disabled}
      onChange={(_, v) => onChange(v)}
      onInputChange={(_, input, reason) => {
        // Only real typing. `reason` is 'reset' when selecting an option or when the
        // value is programmatically restored, which would otherwise log the chosen
        // program's full label as if someone had searched for it.
        if (reason !== 'input') return
        const q = input.trim()
        if (q.length < 2) return
        trackDebounced(
          'program-search',
          'program_search',
          // `value` carries the result count; 0 is the signal the dashboard ranks on.
          { detail: q, value: searchPrograms(programs, q).length },
          700
        )
      }}
      disableClearable={onHeader}
      openOnFocus
      autoHighlight
      size="small"
      sx={{ width: '100%', maxWidth: onHeader ? 460 : 'none' }}
      getOptionLabel={p => `${p.program_id} — ${p.program}`}
      isOptionEqualToValue={(a, b) => a.program_id === b.program_id}
      filterOptions={(opts, state) => searchPrograms(opts, state.inputValue).slice(0, 60)}
      noOptionsText="No matching program"
      renderOption={(props, p) => (
        <Box component="li" {...props} key={p.program_id} sx={{ display: 'block !important', py: 0.75 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#153750' }}>
            {p.program_id} — {p.program}
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#697d8e' }}>
            {p.department}
            {p.area ? ` · ${p.area}` : ''} · FY {p.first_fy}–{p.last_fy}
          </Typography>
        </Box>
      )}
      renderInput={params => (
        <TextField
          {...params}
          autoFocus={autoFocus}
          placeholder={onHeader ? 'Program ID or keyword' : 'e.g. AGR151, or “agriculture”'}
          sx={fieldSx}
          InputProps={{
            ...params.InputProps,
            startAdornment: onHeader ? (
              params.InputProps.startAdornment
            ) : (
              <>
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 20, color: '#697d8e' }} />
                </InputAdornment>
                {params.InputProps.startAdornment}
              </>
            ),
            endAdornment: (
              <>
                {params.InputProps.endAdornment}
                {onHeader && <SearchIcon sx={{ fontSize: 20, color: '#697d8e', mr: 0.5 }} />}
              </>
            )
          }}
        />
      )}
    />
  )
}
