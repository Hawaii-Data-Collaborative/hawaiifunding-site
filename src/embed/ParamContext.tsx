import { createContext, useContext, useCallback } from 'react'
import { ParamStore } from './ParamStore'
import { setUrlParam } from '../util'

export const ParamContext = createContext<ParamStore | null>(null)

/**
 * Returns a setParam function that writes to the embed ParamStore
 * when in embed mode, or falls back to setUrlParam for standalone mode.
 *
 * Same call signature as setUrlParam(keyOrData, value?, options?).
 */
export function useSetParam() {
  const store = useContext(ParamContext)

  return useCallback(
    (
      keyOrData: string | Record<string, any>,
      value?: any,
      options?: { clear?: boolean; reset?: boolean }
    ) => {
      if (store) {
        store.set(keyOrData, value, options)
      } else {
        setUrlParam(keyOrData, value, options)
      }
    },
    [store]
  )
}

/**
 * Returns the ParamStore from context (null in standalone mode).
 * Used by Viz456 to access the per-instance navigation stack.
 */
export function useParamStore(): ParamStore | null {
  return useContext(ParamContext)
}
