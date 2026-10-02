import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createGameServer } from '../server/index'

test('Node serves level API, production assets, SPA routes, and rejects invalid requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skybound-server-'))
  const distDir = join(root, 'dist')
  await mkdir(join(distDir, 'assets'), { recursive: true })
  await writeFile(join(distDir, 'index.html'), '<!doctype html><title>Skybound</title>')
  await writeFile(join(distDir, 'assets', 'game.js'), 'export const game = true')
  await writeFile(join(root, 'outside.txt'), 'private')
  await symlink(join(root, 'outside.txt'), join(distDir, 'escaped.txt'))
  const server = createGameServer({ distDir })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  try {
    const health = await fetch(`${origin}/api/health`)
    assert.equal(health.status, 200)
    assert.equal((await health.json()).status, 'ok')
    const level = await fetch(`${origin}/api/levels/2`)
    assert.equal(level.status, 200)
    assert.equal((await level.json()).length, 15)
    for (const number of ['0', '-1', '1.1', '1001', 'nope', '0001']) {
      assert.equal((await fetch(`${origin}/api/levels/${number}`)).status, 400)
    }
    assert.equal((await fetch(`${origin}/api/unknown`)).status, 404)
    const home = await fetch(origin)
    assert.match(home.headers.get('content-type')!, /text\/html/)
    assert.match(await home.text(), /Skybound/)
    const route = await fetch(`${origin}/play/2`)
    assert.equal(route.status, 200)
    assert.match(await route.text(), /Skybound/)
    const asset = await fetch(`${origin}/assets/game.js`)
    assert.match(asset.headers.get('content-type')!, /text\/javascript/)
    assert.match(await asset.text(), /export const game/)
    assert.equal((await fetch(`${origin}/assets/missing.png`)).status, 404)
    assert.equal((await fetch(`${origin}/escaped.txt`)).status, 404)
    assert.equal((await fetch(`${origin}/..%2Foutside.txt`)).status, 400)
    assert.equal((await fetch(`${origin}/%ZZ`)).status, 400)
    const head = await fetch(`${origin}/api/levels/1`, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    const post = await fetch(`${origin}/api/levels/1`, { method: 'POST' })
    assert.equal(post.status, 405)
    assert.equal(post.headers.get('allow'), 'GET, HEAD')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
