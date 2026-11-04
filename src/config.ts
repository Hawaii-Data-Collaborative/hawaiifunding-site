interface Config {
  align: string
  zoomTo: string
  rm: number
  em: number
  clear: boolean
  linkColorStyle: 'gradient' | 'solid'
}

export const config: Config = {
  align: 'center',
  zoomTo: '',
  rm: 1.8, // revenueMultiplier
  em: 1.2, // expendituresMultiplier
  clear: false,
  linkColorStyle: 'solid'
}

const initBoolean = (value: string): boolean => value === 'true'

type ConfigKey = keyof Config
type ConfigType = number | string | boolean
type ConfigOptions = string[] | null

interface ConfigKeyDefinition {
  key: ConfigKey
  type: (value: string) => ConfigType
  options?: ConfigOptions
  initFn?: (value: string) => ConfigType
}

const keys: ConfigKeyDefinition[] = [
  { key: 'align', type: String },
  { key: 'zoomTo', type: String, options: ['revenues', 'expenditures'] },
  { key: 'rm', type: Number },
  { key: 'em', type: Number },
  { key: 'clear', type: Boolean, initFn: initBoolean }
]

export function initConfig(): void {
  const params = new URLSearchParams(window.location.search)

  for (const { key, type, options, initFn } of keys) {
    if (params.has(key)) {
      const value = params.get(key)
      if (value !== null) {
        const rawValue = initFn ? initFn(value) : type(value)
        ;(config as any)[key] = rawValue
        if (options && !options.includes(config[key] as string)) {
          throw new Error(`${key} must be one of ${options.join(', ')}`)
        }
      }
    }
  }
}
