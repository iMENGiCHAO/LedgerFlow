// echarts 按需注册:只打包项目实际用到的图表与组件(主包体积 -60%)
// 需要新图表类型时在此追加 import 并加入 use() 即可
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
])

export * from 'echarts/core'
export { echarts }
export default echarts

/** init 返回的实例类型(替代全量包的 echarts.ECharts) */
export type EChartsInstance = ReturnType<typeof echarts.init>
