import './embed-state.scss'

import { createRoot } from 'react-dom/client'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { loadStateData } from '../loadStateData'
import { initAnalytics, track } from '../analytics'
import { TrackedEmbed } from '../ui/TrackedEmbed'
import { ParamContext } from './ParamContext'
import { ParamStore } from './ParamStore'
import { StackedBarOverTime } from '../ui/state/viz1_stackedBar/StackedBarOverTime'
import { FundingChangeOverTime } from '../ui/state/viz3_fundingChangeOverTime/FundingChangeOverTime'
import { RevenueAndExpenditure } from '../ui/state/viz4_revAndExp/RevenueAndExpenditure'
import { Viz456 } from '../ui/state/Viz456'

const theme = createTheme({
  palette: {
    primary: {
      main: '#153750'
    }
  },
  typography: {
    fontFamily:
      '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
  },
  components: {
    MuiButton: {
      styleOverrides: { root: { textTransform: 'none' } }
    },
    MuiButtonBase: {
      styleOverrides: { root: { textTransform: 'none' } }
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: 'none' } }
    },
    MuiToggleButton: {
      styleOverrides: { root: { textTransform: 'none' } }
    }
  }
})

type ChartFactory = () => React.ReactNode

const CHARTS: Record<string, ChartFactory> = {
  'stacked-bar-source': () => <StackedBarOverTime lockedMode="source" />,
  'stacked-bar-area': () => <StackedBarOverTime lockedMode="area" />,
  'stacked-bar-department': () => <StackedBarOverTime lockedMode="department" />,
  'yoy-change': () => <FundingChangeOverTime />,
  'budget-composition': () => <RevenueAndExpenditure />,
  'funding-breakdown': () => <Viz456 />,
}

// Inject DM Sans font if not already present
function ensureFont() {
  if (!document.querySelector('link[href*="DM+Sans"]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap'
    document.head.appendChild(link)
  }
}

let dataPromise: Promise<Row[]> | null = null

async function ensureData() {
  if (window._data) return
  if (!dataPromise) {
    dataPromise = loadStateData()
  }
  window._data = await dataPromise
}

async function renderChart(
  container: string | HTMLElement,
  chartName: string,
  initialParams?: Record<string, string>
) {
  const el = typeof container === 'string' ? document.querySelector(container) : container
  if (!el) {
    console.error('[hfp] container not found:', container)
    return
  }

  const factory = CHARTS[chartName]
  if (!factory) {
    console.error('[hfp] unknown chart:', chartName, '— available:', Object.keys(CHARTS).join(', '))
    return
  }

  ensureFont()
  initAnalytics('state')

  try {
    await ensureData()
  } catch (err: any) {
    track('error', { chart: chartName, detail: `data load failed: ${err?.message ?? err}` })
    throw err
  }

  const store = new ParamStore(initialParams)
  const root = createRoot(el)

  root.render(
    <ThemeProvider theme={theme}>
      <ParamContext.Provider value={store}>
        <TrackedEmbed chart={chartName} className="hfp-embed">
          {factory()}
        </TrackedEmbed>
      </ParamContext.Provider>
    </ThemeProvider>
  )
}

// Expose globally
window.hfp = window.hfp ?? {}
window.hfp.renderChart = renderChart
