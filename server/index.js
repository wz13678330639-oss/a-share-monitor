import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = resolve(rootDir, 'dist')
const port = Number(process.env.PORT ?? 4179)
const quoteBaseUrl = 'https://push2delay.eastmoney.com/api/qt/clist/get'
const klineBaseUrl = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const bridgeCallback = '__eastmoney_bridge__'

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function unwrapJsonp(body) {
  const match = body.match(/^[\w$]+\(([\s\S]*)\);\s*$/)
  return match?.[1] ?? body
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function sendError(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(message)
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

async function handleEastMoneyProxy(req, res, requestUrl) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }

  try {
    const isKline = requestUrl.pathname.endsWith('/kline')
    const target = new URL(isKline ? klineBaseUrl : quoteBaseUrl)
    target.search = requestUrl.search

    if (!isKline) {
      target.searchParams.set('cb', bridgeCallback)
    }

    const body = unwrapJsonp(await fetchWithTimeout(target.toString()))
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
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

function resolveStaticPath(pathname) {
  let decodedPath = '/'

  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return resolve(distDir, 'index.html')
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^[/\\]+/, '')
  const requested = resolve(join(distDir, relativePath))
  const pathFromDist = relative(distDir, requested)

  if (pathFromDist.startsWith('..') || pathFromDist.includes(`..${sep}`)) {
    return resolve(distDir, 'index.html')
  }

  return requested
}

async function serveStatic(req, res, requestUrl) {
  let filePath = resolveStaticPath(requestUrl.pathname)

  try {
    const fileStat = await stat(filePath)

    if (fileStat.isDirectory()) {
      filePath = join(filePath, 'index.html')
    }
  } catch {
    filePath = resolve(distDir, 'index.html')
  }

  try {
    const body = await readFile(filePath)
    const ext = extname(filePath)
    const isAsset = filePath.includes(`${distDir}\\assets\\`) || filePath.includes(`${distDir}/assets/`)

    res.writeHead(200, {
      'Content-Type': contentTypes[ext] ?? 'application/octet-stream',
      'Cache-Control': isAsset
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    })
    res.end(body)
  } catch {
    sendError(res, 500, 'Production bundle not found. Run npm run build first.')
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (requestUrl.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'a-share-monitor',
      time: new Date().toISOString(),
    })
    return
  }

  if (requestUrl.pathname.startsWith('/api/eastmoney/')) {
    await handleEastMoneyProxy(req, res, requestUrl)
    return
  }

  await serveStatic(req, res, requestUrl)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`A-share monitor is running on http://0.0.0.0:${port}`)
})
