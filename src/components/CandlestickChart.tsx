import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ECharts, EChartsOption } from 'echarts'
import type { ChartPeriod, RiskProfile, ScoredStock } from '../types/market'

const profileTint = {
  low: '#6bd4ff',
  medium: '#63f5b7',
  high: '#ff8b7b',
} satisfies Record<RiskProfile, string>

const periodLabel = {
  minute: '分时',
  day: '日K',
  week: '周K',
  month: '月K',
} satisfies Record<ChartPeriod, string>

function buildAverage(values: number[], windowSize: number) {
  return values.map((_, index) => {
    if (index < windowSize - 1) {
      return '-'
    }

    const window = values.slice(index - (windowSize - 1), index + 1)
    const total = window.reduce((sum, value) => sum + value, 0)
    return Number((total / window.length).toFixed(2))
  })
}

function formatSignalPrice(value: number) {
  return value >= 100 ? value.toFixed(2) : value.toFixed(3)
}

function signalTone(kind: ScoredStock['tradePlan']['markers'][number]['kind']) {
  if (kind === 'buy') return 'buy'
  if (kind === 'sell') return 'sell'
  return 'risk'
}

export function CandlestickChart({
  stock,
  profile,
  period,
}: {
  stock: ScoredStock
  profile: RiskProfile
  period: ChartPeriod
}) {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<ECharts | null>(null)
  const signalItems = stock.tradePlan.markers.map((marker) => ({
    ...marker,
    time: stock.candles[marker.index]?.label ?? '--',
  }))

  useEffect(() => {
    if (!chartRef.current) {
      return
    }

    instanceRef.current ??= echarts.init(chartRef.current, undefined, {
      renderer: 'canvas',
    })

    const chart = instanceRef.current
    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    const chart = instanceRef.current

    if (!chart) {
      return
    }

    const labels = stock.candles.map((item) => item.label)
    const closes = stock.candles.map((item) => item.close)
    const candlestick = stock.candles.map((item) => [
      item.open,
      item.close,
      item.low,
      item.high,
    ])
    const volumes = stock.candles.map((item) => item.volume)
    const ma5 = buildAverage(closes, 5)
    const ma10 = buildAverage(closes, 10)

    const option: EChartsOption = {
      animationDuration: 300,
      animationDurationUpdate: 220,
      backgroundColor: 'transparent',
      textStyle: {
        color: '#cfd8ec',
        fontFamily:
          '"SF Pro Display", "PingFang SC", "Helvetica Neue", Arial, sans-serif',
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
        backgroundColor: 'rgba(8, 14, 24, 0.92)',
        borderColor: 'rgba(122, 162, 255, 0.24)',
        textStyle: {
          color: '#eff5ff',
        },
      },
      legend: {
        top: 0,
        right: 4,
        itemGap: 18,
        textStyle: {
          color: '#99a8c7',
        },
        data: [periodLabel[period], 'MA5', 'MA10'],
      },
      grid: [
        {
          left: 14,
          right: 16,
          top: 42,
          height: '64%',
        },
        {
          left: 14,
          right: 16,
          top: '78%',
          height: '14%',
        },
      ],
      xAxis: [
        {
          type: 'category',
          data: labels,
          boundaryGap: true,
          axisLine: {
            lineStyle: {
              color: 'rgba(146, 163, 195, 0.22)',
            },
          },
          axisLabel: {
            color: '#7f90b2',
          },
          splitLine: {
            show: false,
          },
        },
        {
          type: 'category',
          gridIndex: 1,
          data: labels,
          boundaryGap: true,
          axisLine: {
            lineStyle: {
              color: 'rgba(146, 163, 195, 0.16)',
            },
          },
          axisLabel: {
            show: false,
          },
          axisTick: {
            show: false,
          },
        },
      ],
      yAxis: [
        {
          scale: true,
          position: 'right',
          splitNumber: 4,
          axisLine: {
            show: false,
          },
          axisLabel: {
            color: '#91a0bc',
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(146, 163, 195, 0.08)',
            },
          },
        },
        {
          scale: true,
          gridIndex: 1,
          position: 'right',
          axisLabel: {
            color: '#6f7e9f',
          },
          splitLine: {
            show: false,
          },
        },
      ],
      series: [
        {
          name: periodLabel[period],
          type: 'candlestick',
          data: candlestick,
          itemStyle: {
            color: '#ff6c82',
            color0: '#2ecfa0',
            borderColor: '#ff8ea0',
            borderColor0: '#44e1b4',
          },
          markArea: {
            silent: true,
            itemStyle: {
              color: 'rgba(101, 213, 255, 0.08)',
            },
            data: [
              [
                {
                  name: '建仓带',
                  yAxis: Math.min(...stock.tradePlan.entries),
                },
                {
                  yAxis: Math.max(...stock.tradePlan.entries),
                },
              ],
            ],
          },
          markLine: {
            symbol: 'none',
            label: {
              position: 'end',
              color: '#324256',
              backgroundColor: 'rgba(255, 255, 255, 0.78)',
              borderRadius: 6,
              padding: [3, 6],
              formatter: '{b}',
              fontSize: 11,
            },
            lineStyle: {
              type: 'dashed',
              width: 1.1,
            },
            data: [
              {
                name: '风控线',
                yAxis: stock.tradePlan.stopLoss,
                lineStyle: {
                  color: '#ff8b7b',
                },
              },
              {
                name: '目标一',
                yAxis: stock.tradePlan.targets[0],
                lineStyle: {
                  color: profileTint[profile],
                },
              },
            ],
          },
          markPoint: {
            symbol: 'circle',
            symbolSize: 10,
            itemStyle: {
              borderColor: 'rgba(255, 255, 255, 0.94)',
              borderWidth: 1.5,
            },
            label: {
              show: false,
            },
            emphasis: {
              label: {
                show: true,
                color: '#f6fbff',
                backgroundColor: 'rgba(20, 32, 43, 0.88)',
                borderRadius: 7,
                padding: [4, 7],
                formatter: ({ name }) => String(name ?? ''),
                fontSize: 11,
              },
            },
            data: stock.tradePlan.markers.map((marker) => ({
              name: marker.label,
              coord: [labels[marker.index], marker.value],
              itemStyle: {
                color:
                  marker.kind === 'buy'
                    ? 'rgba(101, 213, 255, 0.92)'
                    : marker.kind === 'sell'
                      ? 'rgba(99, 245, 183, 0.92)'
                      : 'rgba(255, 139, 123, 0.92)',
              },
            })),
          },
        },
        {
          name: 'MA5',
          type: 'line',
          data: ma5,
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 1.4,
            color: profileTint[profile],
          },
        },
        {
          name: 'MA10',
          type: 'line',
          data: ma10,
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 1,
            color: '#9d8cff',
          },
        },
        {
          name: '量能',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
          itemStyle: {
            color: 'rgba(107, 212, 255, 0.4)',
          },
        },
      ],
    }

    chart.setOption(option, { lazyUpdate: true, notMerge: true })

    return () => {
      chart.resize()
    }
  }, [period, profile, stock])

  useEffect(() => {
    return () => {
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
  }, [])

  return (
    <div className="candlestick-module">
      <div className="candlestick-chart" ref={chartRef} />
      <div className="signal-strip" aria-label="K线操作提示">
        {signalItems.map((marker) => (
          <div
            className={`signal-pill signal-pill--${signalTone(marker.kind)}`}
            key={`${marker.label}-${marker.index}`}
          >
            <span>{marker.label}</span>
            <strong>{formatSignalPrice(marker.value)}</strong>
            <small>{marker.time}</small>
          </div>
        ))}
      </div>
    </div>
  )
}
