import './embed-program.scss'

import { createRoot } from 'react-dom/client'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { ParamContext } from './ParamContext'
import { ParamStore } from './ParamStore'
import { ProgramPage } from '../ui/program/ProgramPage'
import { initAnalytics } from '../analytics'
import { TrackedEmbed } from '../ui/TrackedEmbed'

/**
 * Program ID embed bundle — `window.hfp.renderProgramPage`.
 *
 * Separate from the federal bundle because Program ID is its own page. It pulls in MUI's
 * Table, Autocomplete, and Pagination, none of which any federal chart uses; bundling the
 * two together made the federal charts page carry ~60KB gzip it never renders. Split, the
 * federal bundle drops from 209KB to 149KB gzip and this one lands at 180KB.
 *
 * The tradeoff accepted here: the shared React/MUI/d3 base is no longer a single cached
 * file across both pages, so someone visiting both downloads it twice. Most visits are to
 * one page, and separate bundles also mean a program-page deploy can't disturb the live
 * federal charts.
 *
 * Exports one function rather than the federal bundle's chart registry — there's a single
 * thing to render here, and it's a whole page rather than a chart.
 */

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
    // Link underlining is NOT set here. MUI's own default is already `underline: 'always'`,
    // so a defaultProps entry would be a no-op — what actually strips the underline is the
    // `a` rule in embed-program.scss, which outspecifies MUI's generated class. See there.
  }
})

function ensureFont() {
  if (!document.querySelector('link[href*="DM+Sans"]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap'
    document.head.appendChild(link)
  }
}

/**
 * @param container   selector or element to render into
 * @param initialParams e.g. `{ program: 'AGR151' }` to land directly on a program
 */
function renderProgramPage(
  container: string | HTMLElement,
  initialParams?: Record<string, string>
) {
  const el = typeof container === 'string' ? document.querySelector(container) : container
  if (!el) {
    console.error('[hfp-program] container not found:', container)
    return
  }

  ensureFont()
  initAnalytics('program')

  const store = new ParamStore(initialParams)
  const root = createRoot(el)

  root.render(
    <ThemeProvider theme={theme}>
      <ParamContext.Provider value={store}>
        {/* No `chart` — the page reports program_view instead of chart_view. Outbound
            delegation is on, since every section links out to source documents. */}
        <TrackedEmbed className="hfp-embed-program" trackOutbound>
          <ProgramPage />
        </TrackedEmbed>
      </ParamContext.Provider>
    </ThemeProvider>
  )
}

// `??=` so this composes with the other bundles if they ever share a page.
window.hfp ??= {}
window.hfp.renderProgramPage = renderProgramPage
