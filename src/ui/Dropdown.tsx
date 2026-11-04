import _ from 'lodash'
import { useEffect, useMemo } from 'react'
import { FormControl, Typography, Select, MenuItem, ButtonGroup, Button } from '@mui/material'
import { useUrlParam } from '../hooks'

interface Props {
  label?: string
  value: string
  options?: { label: string; value: string }[]
  onChange: (e: any) => void
  withBackground?: boolean
  withAll?: boolean
}

export function Dropdown({ label, value, options, onChange, withBackground }: Props) {
  let sx1 = {}
  if (withBackground) {
    sx1 = {
      backgroundColor: '#fafafaaa',
      backdropFilter: 'blur(var(--blur))',
      borderRadius: '4px',
      padding: '10px 15px 15px'
    }
  }

  return (
    <FormControl className="SortDropdown" size="small" sx={{ minWidth: '170px', ...sx1 }}>
      {label && <Typography variant="body2">{label}:</Typography>}
      <Select value={value} onChange={onChange} displayEmpty sx={{ height: 28 }}>
        {options.map((option, i) => (
          <MenuItem key={i} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

export function SortByDropdown({ value, onChange, withBackground }: Props) {
  return (
    <Dropdown
      label="Sort by"
      value={value}
      options={[
        { label: 'Amount', value: 'value' },
        { label: 'Name', value: 'label' }
      ]}
      onChange={onChange}
      withBackground={withBackground}
    />
  )
}

export function ViewByDropdown({ value, onChange }: Props) {
  return (
    <ButtonGroup size="small" disableElevation>
      <Button
        variant={value === 'area' ? 'contained' : 'outlined'}
        onClick={() => onChange({ target: { value: 'area' } })}
      >
        Area
      </Button>
      <Button
        variant={value === 'department' ? 'contained' : 'outlined'}
        onClick={() => onChange({ target: { value: 'department' } })}
      >
        Department
      </Button>
    </ButtonGroup>
  )
}

export function AreaDropdown({ value, onChange, withAll, withBackground }: Props) {
  const options = useMemo(() => {
    const options = _.compact(
      _.uniqBy(
        window._data.map(d => ({ value: d.area, label: d.area })),
        'value'
      )
    )
    options.sort((a, b) => a.label.localeCompare(b.label))
    if (withAll) {
      options.unshift({ value: 'All', label: 'All' })
    }
    return options
  }, [window._data])

  return (
    <Dropdown label="Budget Area" value={value} options={options} onChange={onChange} withBackground={withBackground} />
  )
}

interface DepartmentDropdownProps extends Props {
  filterByYearAndArea?: boolean
}

export function DepartmentDropdown({
  value,
  onChange,
  withAll,
  withBackground,
  filterByYearAndArea
}: DepartmentDropdownProps) {
  const year = useUrlParam<number>('year', 'number', 2025)
  const area = useUrlParam('area')

  const options = useMemo(() => {
    let options = _.compact(
      _.uniqBy(
        window._data.map(d => ({ value: d.department, label: d.department })),
        'value'
      )
    )

    options.sort((a, b) => a.label.localeCompare(b.label))

    if (filterByYearAndArea) {
      const tmp = options
      options = []
      for (const dept of tmp) {
        const match = window._data.find(d => d.fiscal_year === year && d.area === area && d.department === dept.value)
        if (match) {
          options.push(dept)
        }
      }
    }

    if (withAll) {
      options.unshift({ value: 'All', label: 'All' })
    }
    return options
  }, [window._data, year, area, filterByYearAndArea])

  useEffect(() => {
    const f = () => {
      console.log('[DepartmentDropdown] autoselecting first department')
      onChange({ target: { value: options[0].value } })
    }
    document.addEventListener('autoselect-first-department', f)
    return () => {
      document.removeEventListener('autoselect-first-department', f)
    }
  }, [options])

  return (
    <Dropdown label="Department" value={value} options={options} onChange={onChange} withBackground={withBackground} />
  )
}
