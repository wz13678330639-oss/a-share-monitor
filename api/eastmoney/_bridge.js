const QUOTE_BASE_URL = 'https://push2delay.eastmoney.com/api/qt/clist/get'
const KLINE_BASE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const BRIDGE_CALLBACK = '__eastmoney_bridge__'

function unwrapJsonp(body) {
  const match = body.match(/^[\w$]+\(([\s\S]*)\);\s*$/)
  return match?.[1] ?? body
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

async function fetchWithTimeout(url, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        Referer: 'https://quote.eastmoney.com/',
      },
    })

    if (!response.ok) {
      throw new Error(`EastMoney responded ${response.status}`)
    }

    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

export async function handleEastMoneyRequest(req, res, type) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }

  try {
    const host = req.headers.host ?? 'localhost'
    const requestUrl = new URL(req.url ?? '/', `https://${host}`)
    const target = new URL(type === 'kline' ? KLINE_BASE_URL : QUOTE_BASE_URL)
    target.search = requestUrl.search

    if (type === 'quote') {
      target.searchParams.set('cb', BRIDGE_CALLBACK)
    }

    const body = unwrapJsonp(await fetchWithTimeout(target.toString()))
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(body)
  } catch (error) {
    sendJson(res, 502, {
      error:
        error instanceof Error
          ? error.message
          : 'EastMoney bridge request failed',
    })
  }
}
