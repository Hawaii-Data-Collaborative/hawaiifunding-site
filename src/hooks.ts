import * as d3 from 'd3'
import { useContext, useEffect, useRef, useState } from 'react'
import { getVizSize } from './util'
import { debounce } from '@mui/material'
import { ParamContext } from './embed/ParamContext'

function cast(value: any, type: 'number' | 'string' | 'boolean') {
  if (type === 'number') {
    return Number(value)
  }
  if (type === 'boolean') {
    return value === 'true'
  }
  return value
}

export function useUrlParam<T>(key: string, type: 'number' | 'string' | 'boolean' = 'string', defaultValue?: any) {
  const store = useContext(ParamContext)

  // Embed mode: read from per-instance ParamStore
  if (store) {
    return useUrlParamFromStore<T>(store, key, type, defaultValue)
  }

  // Standalone mode: read from URL search params
  return useUrlParamFromUrl<T>(key, type, defaultValue)
}

type ParamType = 'number' | 'string' | 'boolean'

function useUrlParamFromStore<T>(store: any, key: string, type: ParamType, defaultValue: any): T {
  const [value, setValue] = useState<T>(
    cast(store.get(key) ?? defaultValue, type)
  )

  useEffect(() => {
    return store.subscribe(() => {
      const raw = store.get(key)
      setValue(cast(raw ?? defaultValue, type))
    })
  }, [store, key])

  return value
}

function useUrlParamFromUrl<T>(key: string, type: ParamType, defaultValue: any): T {
  const [value, setValue] = useState<T>(
    cast(new URLSearchParams(window.location.search).get(key) ?? defaultValue, type)
  )

  const valueRef = useRef<T>(value)

  useEffect(() => {
    const onUrlChange = (e: Event) => {
      const params = new URLSearchParams(window.location.search)
      if (params.has(key)) {
        const rawvalue = params.get(key)
        const parsedValue = cast(rawvalue, type)
        valueRef.current = parsedValue
        setValue(parsedValue)
      } else if (e.type === 'popstate') {
        setValue(valueRef.current)
      }
    }
    window.addEventListener('urlchange', onUrlChange)
    window.addEventListener('popstate', onUrlChange)
    return () => {
      window.removeEventListener('urlchange', onUrlChange)
      window.removeEventListener('popstate', onUrlChange)
    }
  }, [])

  return value
}

export function useVizSize() {
  const [vizSize, setVizSize] = useState<VizSize>(getVizSize())
  useEffect(() => {
    setVizSize(getVizSize())
    const setVizSizeDebounced = debounce(() => {
      setVizSize(getVizSize())
    }, 100)
    window.addEventListener('resize', setVizSizeDebounced)
    return () => {
      window.removeEventListener('resize', setVizSizeDebounced)
    }
  }, [])
  return vizSize
}

/**
 * Width of the element the chart actually sits in, via ResizeObserver.
 *
 * `useVizSize` measures the *window*, which is fine for a chart that owns the page but
 * clips one that's inside a narrower column — the Program ID sections are panels with
 * padding, so a window-width SVG loses its last bar and part of its legend. Returns 0
 * until the first measurement; callers should skip drawing until it's non-zero.
 */
export function useContainerWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => setWidth(el.clientWidth)
    measure()

    const observer = new ResizeObserver(debounce(measure, 100))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

export function useTooltipCleanup() {
  useEffect(() => {
    function cleanup() {
      const selection = d3.selectAll('.tooltip')
      selection.remove()
    }
    return cleanup
  }, [])
}
