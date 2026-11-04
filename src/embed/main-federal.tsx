import './embed-federal.scss'

import { createRoot } from 'react-dom/client'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { ParamContext } from './ParamContext'
import { ParamStore } from './ParamStore'
import { initAnalytics } from '../analytics'
import { TrackedEmbed } from '../ui/TrackedEmbed'
import { AnnualObligationsByAwardType } from '../ui/federal/AnnualObligationsByAwardType'
import { AnnualObligationsByRecipientType } from '../ui/federal/AnnualObligationsByRecipientType'
import { AnnualObligationsByDepartment } from '../ui/federal/AnnualObligationsByDepartment'
import { FederalYoyChange } from '../ui/federal/FederalYoyChange'
import { FederalPerCapita } from '../ui/federal/FederalPerCapita'
import { FederalComposition } from '../ui/federal/FederalComposition'
import { FederalDrillDown } from '../ui/federal/FederalDrillDown'

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
  'federal-by-award-type': () => <AnnualObligationsByAwardType />,
  'federal-by-recipient-type': () => <AnnualObligationsByRecipientType />,
  'federal-by-department': () => <AnnualObligationsByDepartment />,
  'federal-yoy': () => <FederalYoyChange />,
  'federal-per-capita': () => <FederalPerCapita />,
  'federal-composition': () => <FederalComposition />,
  'federal-drilldown': () => <FederalDrillDown />
}
// Program ID lives in its own bundle (src/embed/main-program.tsx) — it's a whole page rather than
// a chart, and it drags in MUI Table/Autocomplete/Pagination that nothing here uses.

function ensureFont() {
  if (!document.querySelector('link[href*="DM+Sans"]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap'
    document.head.appendChild(link)
  }
}

function renderFederalChart(
  container: string | HTMLElement,
  chartName: string,
  initialParams?: Record<string, string>
) {
  const el = typeof container === 'string' ? document.querySelector(container) : container
  if (!el) {
    console.error('[hfp-federal] container not found:', container)
    return
  }

  const factory = CHARTS[chartName]
  if (!factory) {
    console.error('[hfp-federal] unknown chart:', chartName, '— available:', Object.keys(CHARTS).join(', '))
    return
  }

  ensureFont()
  initAnalytics('federal')

  const store = new ParamStore(initialParams)
  const root = createRoot(el)

  root.render(
    <ThemeProvider theme={theme}>
      <ParamContext.Provider value={store}>
        <TrackedEmbed chart={chartName} className="hfp-embed-federal">
          {factory()}
        </TrackedEmbed>
      </ParamContext.Provider>
    </ThemeProvider>
  )
}

window.hfp ??= {}
window.hfp.renderFederalChart = renderFederalChart
