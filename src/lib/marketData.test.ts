import { describe, expect, it } from 'vitest'
import {
  buildEastMoneyJsonpUrl,
  buildEastMoneyKlineUrl,
  buildEastMoneyListUrl,
  buildEastMoneyPageBatches,
  filterByWatchOnly,
  normalizeEastMoneyKlines,
  normalizeEastMoneyPage,
} from './marketData'

describe('marketData', () => {
  it('normalizes EastMoney full-market quote rows', () => {
    const page = normalizeEastMoneyPage({
      data: {
        total: 5846,
        diff: [
          {
            f2: 444.9,
            f3: 1.37,
            f4: 6,
            f5: 39542497,
            f6: 17517374359.15,
            f7: 2.38,
            f8: 0.93,
            f9: 32.4,
            f12: '300750',
            f13: 0,
            f14: '宁德时代',
            f15: 448.45,
            f16: 438,
            f17: 442,
            f18: 438.9,
            f20: 123456789000,
            f21: 98765432100,
            f23: 6.18,
            f62: 180000000,
            f100: '电池',
          },
        ],
      },
    })

    expect(page.total).toBe(5846)
    expect(page.stocks[0]).toMatchObject({
      symbol: '300750',
      secid: '0.300750',
      name: '宁德时代',
      sector: '电池',
      price: 444.9,
      changePct: 1.37,
      turnoverBillion: 17.52,
    })
    expect(page.stocks[0].dataSource).toBe('东方财富公开行情')
  })

  it('normalizes EastMoney daily kline strings into candles', () => {
    const candles = normalizeEastMoneyKlines([
      '2026-04-23,443.50,438.90,443.60,435.00,354310,15566836621.00,1.97,0.58,2.55,0.83',
      '2026-04-24,442.00,444.90,448.45,438.00,395425,17517374359.15,2.38,1.37,6.00,0.93',
    ])

    expect(candles).toEqual([
      {
        label: '04/23',
        open: 443.5,
        close: 438.9,
        low: 435,
        high: 443.6,
        volume: 354310,
      },
      {
        label: '04/24',
        open: 442,
        close: 444.9,
        low: 438,
        high: 448.45,
        volume: 395425,
      },
    ])
  })

  it('builds full-market URLs and supports watch-only filtering', () => {
    const url = buildEastMoneyListUrl({ page: 2, pageSize: 500 })
    const directUrl = buildEastMoneyListUrl({
      page: 1,
      pageSize: 200,
      baseUrl: 'https://push2.eastmoney.com/api/qt/clist/get',
    })
    const jsonpUrl = buildEastMoneyJsonpUrl(directUrl, '__eastmoney_test__')
    const klineUrl = buildEastMoneyKlineUrl(
      '0.300750',
      30,
      'https://push2his.eastmoney.com/api/qt/stock/kline/get',
    )
    const minuteUrl = buildEastMoneyKlineUrl(
      '0.300750',
      120,
      'https://push2his.eastmoney.com/api/qt/stock/kline/get',
      'minute',
    )
    const weekUrl = buildEastMoneyKlineUrl(
      '0.300750',
      120,
      'https://push2his.eastmoney.com/api/qt/stock/kline/get',
      'week',
    )
    const monthUrl = buildEastMoneyKlineUrl(
      '0.300750',
      120,
      'https://push2his.eastmoney.com/api/qt/stock/kline/get',
      'month',
    )
    const filtered = filterByWatchOnly(
      [
        { symbol: '600519', name: '贵州茅台' },
        { symbol: '300750', name: '宁德时代' },
      ],
      ['300750'],
      true,
    )

    expect(url).toContain('pn=2')
    expect(url).toContain('pz=500')
    expect(url).toContain('fs=')
    expect(jsonpUrl).toContain('cb=__eastmoney_test__')
    expect(jsonpUrl).toContain('https://push2.eastmoney.com/api/qt/clist/get')
    expect(klineUrl).toContain(
      'https://push2his.eastmoney.com/api/qt/stock/kline/get',
    )
    expect(klineUrl).toContain('secid=0.300750')
    expect(klineUrl).toContain('klt=101')
    expect(minuteUrl).toContain('klt=1')
    expect(weekUrl).toContain('klt=102')
    expect(monthUrl).toContain('klt=103')
    expect(filtered).toEqual([{ symbol: '300750', name: '宁德时代' }])
  })

  it('plans full-market quote pages in small throttled batches', () => {
    const batches = buildEastMoneyPageBatches(5846, 100, 4)

    expect(batches[0]).toEqual([2, 3, 4, 5])
    expect(batches[batches.length - 1]).toEqual([58, 59])
    expect(batches.flat()).toHaveLength(58)
  })
})
