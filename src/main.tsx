import './main.scss'

import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { App } from './ui/App'
import { PRODUCTION } from './constants'

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
      styleOverrides: {
        root: {
          textTransform: 'none'
        }
      }
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          textTransform: 'none'
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none'
        }
      }
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none'
        }
      }
    }
  }
})

history.stack = []
const pushState = history.pushState
// @ts-ignore
history.pushState = function (state, title, url) {
  history.stack.push(url as string)
  const result = pushState.apply(this, arguments)
  window.dispatchEvent(new Event('urlchange'))
  return result
}

window.addEventListener('popstate', () => {
  window.dispatchEvent(new Event('urlchange'))
})

function init(selector: string | HTMLElement = '#root') {
  console.log('[init] selector=%s', selector)
  let el = typeof selector === 'string' ? document.querySelector(selector) : selector
  if (!el) {
    console.log('[init] selector not found, creating root', selector)
    el = document.createElement('div')
    el.id = 'root'
    document.body.appendChild(el)
  }

  const root = createRoot(el)

  root.render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  )
}

if (PRODUCTION) {
  window.hfp = window.hfp ?? {}
  window.hfp.init = init
} else {
  init()
}
