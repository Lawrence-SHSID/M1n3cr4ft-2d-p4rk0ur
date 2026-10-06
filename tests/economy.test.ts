import test from 'node:test'
import assert from 'node:assert/strict'
import { awardLevel, buyItem, consumeItem, emptyWallet, readWallet, rewardForLevel, saveWallet, WALLET_KEY } from '../src/game/economy'
import { prepareItem } from '../src/game/items'
import { createSession, retrySession, startSession, stepSession } from '../src/game/session'
import type { Level } from '../shared/types'

const level = (): Level => ({ number: 1, name: 'Item arena', subtitle: '', length: 30,
  spawn: { x: 2, y: 9 }, flag: { x: 29, y: 9 }, blocks: [{ id: 'floor', x: 0, y: 9, width: 30, kind: 'grass', solid: true }], spikes: [] })
const apply = (effect: ReturnType<typeof prepareItem>) => { if ('error' in effect) assert.fail(effect.error); else effect.apply() }
test('coin brackets grow by three every five levels, and each numbered level pays once', () => {
  for (const [n, coins] of [[1,5],[5,5],[6,8],[10,8],[11,11],[15,11],[16,14],[20,14],[21,17],[25,17],[26,20],[1000,602]]) assert.equal(rewardForLevel(n!), coins)
  for (const n of [0,-1,1.5,1001,NaN]) assert.equal(rewardForLevel(n), 0)
  const original = emptyWallet(), first = awardLevel(original, 1)
  assert.equal(original.coins, 0); assert.equal(first.earned, 5)
  assert.equal(awardLevel(first.wallet, 1).earned, 0)
  assert.equal(awardLevel(first.wallet, 6).wallet.coins, 13)
})
test('scaffolding costs two coins and purchases and consumables never go negative', () => {
  const funded = awardLevel(emptyWallet(), 1).wallet, bought = buyItem(funded, 'scaffolding')
  assert.equal(bought.coins, 3); assert.equal(bought.inventory.scaffolding, 1); assert.equal(funded.inventory.scaffolding, 0)
  assert.equal(consumeItem(bought, 'scaffolding').inventory.scaffolding, 0)
  assert.throws(() => consumeItem(funded, 'teleport'))
  assert.throws(() => buyItem(funded, 'teleport'))
  assert.equal(buyItem(funded, 'potion').coins, 0)
})
test('wallet survives save and reload with claimed levels and inventory; corrupt data is not overwritten', () => {
  const data = new Map<string,string>(), storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string,v: string) => {data.set(k,v)} }
  assert.deepEqual(readWallet(storage), emptyWallet())
  const bought = buyItem(awardLevel(emptyWallet(), 11).wallet, 'teleport'); saveWallet(storage, bought)
  assert.deepEqual(readWallet(storage), bought); assert.equal(awardLevel(readWallet(storage), 11).earned, 0)
  for (const bad of ['broken', JSON.stringify({...bought, coins:-1}), JSON.stringify({...bought, completed:[11,11]}), JSON.stringify({...bought, inventory:{}})]) {
    data.set(WALLET_KEY,bad); assert.throws(() => readWallet(storage)); assert.equal(data.get(WALLET_KEY), bad)
  }
  assert.throws(() => saveWallet({setItem:()=>{throw new Error('Full')}}, bought)); assert.equal(bought.inventory.teleport, 1)
})
test('shared scaffolding is deferred, blocks occupy clear nearby squares and remain on retry', () => {
  const session = createSession(level(), 'duo'), before = session.level.blocks.length
  const effect = prepareItem(session, 'steve', 'scaffolding', {x:4.2,y:8.3})
  assert.equal(session.level.blocks.length, before); apply(effect)
  assert.equal(session.level.blocks.at(-1)!.kind, 'scaffolding'); assert.equal(session.level.blocks.at(-1)!.x, 4)
  assert.ok('error' in prepareItem(session, 'steve', 'scaffolding', {x:2,y:8}))
  assert.ok('error' in prepareItem(session, 'steve', 'scaffolding', {x:20,y:8}))
  assert.ok('error' in prepareItem(session, 'steve', 'scaffolding', {x:4,y:8}))
  retrySession(session); assert.equal(session.level.blocks.length, before+1)
  const alex=session.runs[1]!.state; alex.player.x=4.1; alex.player.y=5; alex.player.grounded=false
  for(let i=0;i<120;i++) stepSession(session,{},1/120)
  assert.equal(alex.player.groundKind,'scaffolding'); assert.equal(alex.player.y+alex.player.height,8)
})
test('teleport reaches a safe landing exactly ten blocks away and refuses farther, blocked or dangerous spots', () => {
  const session=createSession(level()), p=session.runs[0]!.state.player
  const origin=p.x+p.width/2, before=p.x
  const effect=prepareItem(session,'steve','teleport',{x:origin+10,y:9})
  // Quarter-grid aim snaps 12.24 to 12.25, just beyond the exact boundary; use a grid-aligned origin.
  assert.ok('error' in effect)
  p.x=1.76
  apply(prepareItem(session,'steve','teleport',{x:12,y:9})); assert.equal(p.x,11.76); assert.equal(p.grounded,true)
  assert.equal(p.skin,'steve'); assert.equal(p.vy,0)
  p.x=before
  assert.ok('error' in prepareItem(session,'steve','teleport',{x:14,y:9}))
  assert.ok('error' in prepareItem(session,'steve','teleport',{x:8,y:5}))
  session.level.spikes.push({x:7,y:9}); assert.ok('error' in prepareItem(session,'steve','teleport',{x:7.5,y:9}))
  session.level.blocks.push({id:'wall',x:6,y:7,solid:true,kind:'stone',height:2})
  assert.ok('error' in prepareItem(session,'steve','teleport',{x:6.5,y:9}))
})
test('flight teleport stays inside corridor and scaffolding is not allowed in flight', () => {
  const map=level(); map.kind='elytra'; map.flight={ceiling:0,floor:12}; map.spawn.y=6; map.blocks=[]
  const session=createSession(map), state=session.runs[0]!.state
  apply(prepareItem(session,'steve','teleport',{x:8,y:6})); assert.equal(state.player.grounded,false)
  assert.ok('error' in prepareItem(session,'steve','teleport',{x:10,y:0}))
  assert.ok('error' in prepareItem(session,'steve','scaffolding',{x:9,y:7}))
})
test('potions restore six hearts up to twenty, but full hearts, dead players and ordinary levels keep their item', () => {
  const map=level(); map.bonus={skeleton:{x:15,y:9}}
  const session=createSession(map), state=session.runs[0]!.state
  assert.ok('error' in prepareItem(session,'steve','potion'))
  state.combat!.hearts=12.5; apply(prepareItem(session,'steve','potion')); assert.equal(state.combat!.hearts,18.5)
  apply(prepareItem(session,'steve','potion')); assert.equal(state.combat!.hearts,20)
  state.status='dead'; assert.ok('error' in prepareItem(session,'steve','potion'))
  assert.ok('error' in prepareItem(createSession(level()),'steve','potion'))
})
