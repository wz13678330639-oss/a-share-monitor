const QUOTE_BASE_URL = 'https://push2delay.eastmoney.com/api/qt/clist/get'
const KLINE_BASE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const BRIDGE_CALLBACK = '__eastmoney_bridge__'

function unwrapJsonp(body) {
  const match = body.match(/^[\w$]+\(([\s\S]*)\);\s*$/)
  return match?.[1] ?? body
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
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

export async function handleEastMoneyRequest(context, type) {
  const request = context.request

  if (request.method !== 'GET') {
    return json({ error: 'Method Not Allowed' }, 405)
  }

  try {
    const requestUrl = new URL(request.url)
    const target = new URL(type === 'kline' ? KLINE_BASE_URL : QUOTE_BASE_URL)
    target.search = requestUrl.search

    if (type === 'quote') {
      target.searchParams.set('cb', BRIDGE_CALLBACK)
    }

    const body = unwrapJsonp(await fetchWithTimeout(target.toString()))

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'EastMoney bridge request failed',
      },
      502,
    )
  }
}
