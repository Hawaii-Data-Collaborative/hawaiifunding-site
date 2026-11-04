/**
 * Per-instance in-memory parameter store for embed mode.
 * Replaces URL search params so multiple charts on one page
 * don't conflict with each other or modify the host page URL.
 *
 * API mirrors setUrlParam(keyOrData, value, options) from util.ts.
 */
export class ParamStore {
  private params: Map<string, string> = new Map()
  private listeners: Set<() => void> = new Set()

  /** Navigation stack for Viz456 back-button support (replaces history.stack). */
  stack: string[] = []

  constructor(initial?: Record<string, string>) {
    if (initial) {
      for (const [k, v] of Object.entries(initial)) {
        this.params.set(k, v)
      }
    }
  }

  get(key: string): string | null {
    return this.params.get(key) ?? null
  }

  /**
   * Set params — same signature as setUrlParam from util.ts.
   * Supports both single key/value and object forms.
   */
  set(
    keyOrData: string | Record<string, any>,
    value?: any,
    options?: { clear?: boolean; reset?: boolean }
  ) {
    const { clear, reset } = options || {}

    if (reset) {
      this.params.clear()
    }

    if (typeof keyOrData === 'string') {
      if (value == null && clear) {
        this.params.delete(keyOrData)
      } else {
        this.params.set(keyOrData, String(value))
      }
    } else {
      for (const [k, v] of Object.entries(keyOrData)) {
        if (v == null && clear) {
          this.params.delete(k)
        } else {
          this.params.set(k, String(v))
        }
      }
    }

    // Push serialized state for back-navigation support
    this.stack.push(this.serialize())

    this.notify()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify() {
    this.listeners.forEach(fn => fn())
  }

  private serialize(): string {
    return new URLSearchParams(this.params as any).toString()
  }
}
