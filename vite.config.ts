import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

const execFileAsync = promisify(execFile)
const curlBin = process.platform === 'win32' ? 'curl.exe' : 'curl'
const quoteBaseUrl = 'https://push2delay.eastmoney.com/api/qt/clist/get'
const klineBaseUrl = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const bridgeCallback = '__eastmoney_bridge__'

async function curlGet(url: string) {
  const { stdout } = await execFileAsync(
    curlBin,
    [
      '-L',
      '--max-time',
      '20',
      '-sS',
      '-A',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      url,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  )

  if (!stdout.trim()) {
    throw new Error('EastMoney returned an empty response')
  }

  return stdout
}

function unwrapJsonp(body: string) {
  const match = body.match(/^[\w$]+\(([\s\S]*)\);\s*$/)
  return match?.[1] ?? body
}

function eastMoneyBridge(): Plugin {
  return {
    name: 'eastmoney-local-bridge',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/eastmoney/')) {
          next()
          return
        }

        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        try {
          const requestUrl = new URL(req.url, 'http://localhost')
          const isKline = requestUrl.pathname.endsWith('/kline')
          const target = new URL(isKline ? klineBaseUrl : quoteBaseUrl)
          target.search = requestUrl.search
          if (!isKline) {
            target.searchParams.set('cb', bridgeCallback)
          }

          const body = unwrapJsonp(await curlGet(target.toString()))

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(body)
        } catch (error) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'EastMoney bridge request failed',
            }),
          )
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), eastMoneyBridge()],
  server: {
    proxy: {
      '/eastmoney': {
        target: 'https://push2.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/eastmoney/, ''),
      },
      '/eastmoney-his': {
        target: 'https://push2his.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/eastmoney-his/, ''),
      },
    },
  },
})
