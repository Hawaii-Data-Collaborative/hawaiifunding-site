import { Box } from '@mui/material'
import { Chart } from '../../constants'
import { useUrlParam } from '../../hooks'
import { useSetParam, useParamStore } from '../../embed/ParamContext'
import { FunctionAreaExpenditures } from './viz6_functionArea/FunctionAreaExpenditures'
import { FunctionAreaByAreaOrDept } from './viz7_functionAreaByDept/FunctionAreaByDept'
import { FunctionAreaByProgram } from './viz8_functionAreaByProgram/FunctionAreaByProgram'

export function Viz456() {
  const setParam = useSetParam()
  const store = useParamStore()
  const viz = useUrlParam<string>('viz', 'string', Chart.FUNDING_BY_SOURCE)
  console.log('[Viz456] viz=%s', viz)

  // Use per-instance store stack in embed mode, history.stack in standalone
  const getStack = () => store ? store.stack : history.stack
  const setStack = (newStack: string[]) => {
    if (store) {
      store.stack = newStack
    } else {
      history.stack = newStack
    }
  }

  const onBackClick = () => {
    const stack = getStack()
    let i = 1

    while (true) {
      const url = stack[stack.length - i]
      if (url) {
        console.log('[Viz456] i=%s url=%s', i, url)
        const params = new URLSearchParams(url)
        const tmpviz = params.get('viz')
        if (tmpviz !== viz) {
          setStack(stack.slice(0, stack.length - i))
          setParam(Object.fromEntries(params.entries()), null, { reset: true })
          return
        }
      } else {
        setStack(stack.slice(0, stack.length - i))
        setParam({ tab: 4, viz: Chart.FUNDING_BY_SOURCE }, null, { reset: true })
        return
      }
      i++
    }
  }

  return (
    <Box>
      {viz === Chart.FUNDING_BY_SOURCE || viz === Chart.FUNDING_FLOW ? (
        <FunctionAreaExpenditures />
      ) : (
        <div className="fade-in">
          {viz === Chart.FUNDING_BY_DEPT && <FunctionAreaByAreaOrDept onBackClick={onBackClick} />}
          {viz === Chart.FUNDING_BY_PROGRAM && <FunctionAreaByProgram onBackClick={onBackClick} />}
        </div>
      )}
    </Box>
  )
}
