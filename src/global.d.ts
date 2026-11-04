declare global {
  interface Window {
    _data: Row[]
    _rawdata: Row[]
    hfp?: {
      init?: (selector?: string | HTMLElement) => void
      renderChart?: (container: string | HTMLElement, chartName: string, initialParams?: Record<string, string>) => Promise<void>
      renderFederalChart?: (container: string | HTMLElement, chartName: string, initialParams?: Record<string, string>) => void
      renderProgramPage?: (container: string | HTMLElement, initialParams?: Record<string, string>) => void
    }
  }
  interface History {
    stack: string[]
  }
}

export {}

interface VizSize {
  width: number
  height: number
}
