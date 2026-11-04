import React, { useEffect, useState } from 'react'
import { Tabs, Tab, Box, CircularProgress, Stack, IconButton } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import MenuIcon from '@mui/icons-material/Menu'
import BarChartIcon from '@mui/icons-material/BarChart'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import DonutLargeIcon from '@mui/icons-material/DonutLarge'
import ViewStreamIcon from '@mui/icons-material/ViewStream'
import { StackedBarOverTime } from './state/viz1_stackedBar/StackedBarOverTime'
import { FundingChangeOverTime } from './state/viz3_fundingChangeOverTime/FundingChangeOverTime'
import { RevenueAndExpenditure } from './state/viz4_revAndExp/RevenueAndExpenditure'
import { Viz456 } from './state/Viz456'
import { FunctionAreaByAreaOrDept } from './state/viz7_functionAreaByDept/FunctionAreaByDept'
import { FunctionAreaByProgram } from './state/viz8_functionAreaByProgram/FunctionAreaByProgram'
import { setUrlParam } from '../util'
import { useUrlParam } from '../hooks'
import { Chart } from '../constants'
import { loadStateData } from '../loadStateData'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  const show = value === index

  return (
    <div role="tabpanel" hidden={!show} id={`viz-tabpanel-${index}`} aria-labelledby={`viz-tab-${index}`} {...other}>
      {show && <Box>{children}</Box>}
    </div>
  )
}

function a11yProps(index: number) {
  return {
    id: `viz-tab-${index}`,
    'aria-controls': `viz-tabpanel-${index}`
  }
}

const TABS = [
  { icon: <BarChartIcon />, label: 'Budget Over Time', Component: StackedBarOverTime },
  { icon: <ShowChartIcon />, label: 'Year-Over-Year Change', Component: FundingChangeOverTime },
  { icon: <DonutLargeIcon />, label: 'Budget Composition', Component: RevenueAndExpenditure },
  { icon: <ViewStreamIcon />, label: 'Funding Breakdown', Component: Viz456 },
  { label: 'Function Area By Dept', Component: FunctionAreaByAreaOrDept, hidden: true },
  { label: 'Function Area By Program', Component: FunctionAreaByProgram, hidden: true }
]

export function App() {
  const [loading, setLoading] = useState(true)
  const value = useUrlParam<number>('tab', 'number', 1) - 1
  const viz = useUrlParam<string>('viz', 'string')

  const [open, setOpen] = useState(false)

  useEffect(() => {
    const fn = async () => {
      const data = await loadStateData()
      window._data = data
      setLoading(false)
    }
    fn()
  }, [])

  const onTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    const params: any = {
      tab: newValue + 1
    }
    if (params.tab === 4) {
      params.viz = Chart.FUNDING_FLOW
    }
    setUrlParam(params, null, { reset: true })
  }

  const onTabClick = (index: number) => {
    if (index === value && index === 3 && viz !== Chart.FUNDING_FLOW) {
      setUrlParam('viz', Chart.FUNDING_FLOW)
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" pt="10vh">
        <Stack direction="row" alignItems="center" spacing={2}>
          <CircularProgress />
          <span>Loading data...</span>
        </Stack>
      </Box>
    )
  }

  return (
    <Box className="App" sx={{ width: '100%', maxWidth: '1300px', margin: '0 auto', display: 'flex', py: '10vh' }}>
      <Box
        sx={{
          borderRight: 2,
          borderColor: 'divider',
          minWidth: open ? '200px' : '57px',
          transition: 'min-width 0.3s ease-in-out',
          position: 'sticky',
          left: 0
        }}
      >
        <Box
          height="48px"
          display="flex"
          alignItems="center"
          justifyContent={open ? 'flex-start' : 'center'}
          pl={open ? 1 : 0}
        >
          <IconButton onClick={() => setOpen(!open)}>{open ? <ChevronLeftIcon /> : <MenuIcon />}</IconButton>
        </Box>
        <Tabs
          value={value}
          onChange={onTabChange}
          orientation="vertical"
          variant="scrollable"
          scrollButtons="auto"
          aria-label="viz tabs"
          sx={{
            minHeight: '2.5rem',
            '& .MuiTab-root': {
              py: 0.5,
              minHeight: '2.2rem',
              fontSize: '0.74rem',
              alignItems: 'flex-start',
              textAlign: 'left'
            }
          }}
        >
          {TABS.filter(tab => !tab.hidden).map((tab, index) => (
            <Tab
              key={index}
              icon={tab.icon}
              iconPosition="start"
              label={open ? <span>{tab.label}</span> : null}
              {...a11yProps(index)}
              sx={{
                whiteSpace: 'nowrap',
                justifyContent: 'flex-start',
                alignItems: 'center !important',
                minWidth: open ? '100px' : '30px',
                transition: 'min-width 0.3s ease-in-out'
              }}
              onClick={() => onTabClick(index)}
            />
          ))}
        </Tabs>
      </Box>
      <Box sx={{ flex: 1 }}>
        {TABS.map(({ Component }, index) => (
          <TabPanel key={index} value={value} index={index}>
            <Component />
          </TabPanel>
        ))}
      </Box>
    </Box>
  )
}
