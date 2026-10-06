import { createServer, type ServerResponse } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateLevel } from '../shared/levels'

const DEFAULT_DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

function json(response: ServerResponse, status: number, payload: unknown, head = false) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(head ? undefined : body)
}

function isInside(root: string, file: string): boolean {
  const path = relative(root, file)
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

async function safeFile(distDir: string, pathname: string): Promise<string | null> {
  const candidate = resolve(distDir, `.${pathname}`)
  if (!isInside(distDir, candidate)) return null
  try {
    const [realRoot, realCandidate] = await Promise.all([realpath(distDir), realpath(candidate)])
    if (!isInside(realRoot, realCandidate) || !(await stat(realCandidate)).isFile()) return null
    return realCandidate
  } catch {
    return null
  }
}

export function createGameServer(options: { distDir?: string } = {}) {
  const distDir = resolve(options.distDir ?? DEFAULT_DIST)
  return createServer(async (request, response) => {
    const head = request.method === 'HEAD'
    if (request.method !== 'GET' && !head) {
      response.setHeader('Allow', 'GET, HEAD')
      json(response, 405, { error: 'Only GET and HEAD requests are supported.' })
      return
    }

    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    } catch {
      json(response, 400, { error: 'Invalid request URL.' }, head)
      return
    }
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
      json(response, 400, { error: 'Invalid request path.' }, head)
      return
    }

    try {
      if (pathname === '/api/health') {
        json(response, 200, { status: 'ok', game: 'Skybound Parkour' }, head)
        return
      }
      const match = /^\/api\/levels\/([^/]+)$/.exec(pathname)
      if (match) {
        const levelNumber = Number(match[1])
        if (!/^[1-9]\d*$/.test(match[1]!) || !Number.isInteger(levelNumber) || levelNumber > 1000) {
          json(response, 400, { error: 'Level number must be an integer between 1 and 1000.' }, head)
          return
        }
        json(response, 200, generateLevel(levelNumber), head)
        return
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        json(response, 404, { error: 'API route not found.' }, head)
        return
      }

      let file = await safeFile(distDir, pathname === '/' ? '/index.html' : pathname)
      // Vue routes use the same HTML entry. Missing assets still return 404.
      if (!file && !extname(pathname)) file = await safeFile(distDir, '/index.html')
      if (!file) {
        const index = await safeFile(distDir, '/index.html')
        json(response, index ? 404 : 503, {
          error: index ? 'File not found.' : 'The game is not built yet. Run npm run build, then npm start.',
        }, head)
        return
      }
      const body = await readFile(file)
      const extension = extname(file).toLowerCase()
      response.writeHead(200, {
        'Content-Type': MIME[extension] ?? 'application/octet-stream',
        'Content-Length': body.byteLength,
        'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      })
      response.end(head ? undefined : body)
    } catch (error) {
      console.error('Request failed:', error instanceof Error ? error.message : 'unknown error')
      if (!response.headersSent) json(response, 500, { error: 'The server could not handle this request.' }, head)
      else response.end()
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3005)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError('PORT must be an integer between 1 and 65535.')
  }
  const server = createGameServer()
  server.listen(port, '0.0.0.0', () => console.log(`Skybound API and production game: http://localhost:${port}`))
  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
