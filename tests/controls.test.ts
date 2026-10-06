import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CharacterId, Input } from '../shared/types'
import { KeyboardControls } from '../src/game/controls'

const idle: Input = { left: false, right: false, jump: false, sprint: false, sneak: false }

function runner(controls: KeyboardControls, id: CharacterId = 'steve'): Input {
  return controls.inputs()[id]!
}

function doubleTap(controls: KeyboardControls, code = 'ArrowRight', first = 0, second = 150): void {
  controls.press(code, false, first)
  controls.release(code)
  controls.press(code, false, second)
}

test('solo maps arrows and WASD to Steve with no Space binding', () => {
  const controls = new KeyboardControls('solo')
  for (const [code, action] of [
    ['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowRight', 'right'], ['KeyD', 'right'],
    ['ArrowUp', 'jump'], ['KeyW', 'jump'], ['ArrowDown', 'sneak'], ['KeyS', 'sneak'],
  ] as const) {
    assert.equal(controls.press(code), 'steve')
    assert.deepEqual(controls.inputs(), { steve: { ...idle, [action]: true } })
    controls.clear()
  }
  for (const code of ['Space', 'ShiftLeft', 'KeyQ', 'Enter', 'constructor']) assert.equal(controls.press(code), null)
  assert.deepEqual(controls.inputs(), { steve: idle })
})

test('duo gives Steve only arrows and Alex only WASD', () => {
  const controls = new KeyboardControls('duo')
  assert.equal(controls.press('ArrowRight'), 'steve')
  assert.equal(controls.press('ArrowUp'), 'steve')
  assert.equal(controls.press('KeyA'), 'alex')
  assert.equal(controls.press('KeyS'), 'alex')
  assert.deepEqual(controls.inputs(), {
    steve: { ...idle, right: true, jump: true },
    alex: { ...idle, left: true, sneak: true },
  })
  controls.release('ArrowUp')
  controls.release('KeyS')
  assert.deepEqual(controls.inputs(), {
    steve: { ...idle, right: true }, alex: { ...idle, left: true },
  })
})

test('holding one alias survives release of another physical key', () => {
  const controls = new KeyboardControls('solo')
  controls.press('ArrowRight')
  controls.press('KeyD')
  controls.press('ArrowUp')
  controls.press('KeyW')
  controls.inputs()
  controls.release('ArrowRight')
  controls.release('ArrowUp')
  assert.deepEqual(runner(controls), { ...idle, right: true, jump: true })
  controls.release('KeyD')
  controls.release('KeyW')
  assert.deepEqual(runner(controls), idle)
})

for (const interval of [0, 249, 250]) {
  test(`double-tap after release at ${interval} ms starts sprint until its key releases`, () => {
    const controls = new KeyboardControls('solo')
    doubleTap(controls, 'ArrowRight', 1000, 1000 + interval)
    assert.deepEqual(runner(controls), { ...idle, right: true, sprint: true })
    assert.equal(runner(controls).sprint, true)
    controls.release('ArrowRight')
    assert.deepEqual(runner(controls), idle)
  })
}

test('a tap outside the time window or with a reversed timestamp does not sprint', () => {
  for (const interval of [251, 1000, -1]) {
    const controls = new KeyboardControls('solo')
    doubleTap(controls, 'KeyA', 1000, 1000 + interval)
    assert.deepEqual(runner(controls), { ...idle, left: true })
  }
})

test('double-tap must use the same physical key', () => {
  const controls = new KeyboardControls('solo')
  controls.press('ArrowRight', false, 0)
  controls.release('ArrowRight')
  controls.press('KeyD', false, 100)
  assert.deepEqual(runner(controls), { ...idle, right: true })
})

test('duplicate keydown and browser repeats cannot create a double-tap', () => {
  const controls = new KeyboardControls('solo')
  controls.press('ArrowRight', false, 0)
  controls.press('ArrowRight', false, 100)
  controls.press('ArrowRight', true, 150)
  assert.deepEqual(runner(controls), { ...idle, right: true })
  controls.release('ArrowRight')
  controls.press('ArrowRight', true, 200)
  assert.deepEqual(runner(controls), idle)
  controls.press('ArrowRight', false, 250)
  assert.equal(runner(controls).sprint, true)
})

test('repeats do not refresh double-tap timing', () => {
  const controls = new KeyboardControls('solo')
  controls.press('ArrowRight', false, 0)
  controls.press('ArrowRight', true, 200)
  controls.release('ArrowRight')
  controls.press('ArrowRight', false, 300)
  assert.equal(runner(controls).sprint, false)
})

test('pressing either opposite alias cancels sprint without restoring it on release', () => {
  for (const opposite of ['ArrowLeft', 'KeyA']) {
    const controls = new KeyboardControls('solo')
    doubleTap(controls)
    controls.press(opposite, false, 175)
    assert.deepEqual(runner(controls), { ...idle, left: true, right: true })
    controls.release(opposite)
    assert.deepEqual(runner(controls), { ...idle, right: true })
  }
})

test('sneak cancels sprint and prevents sprint while held', () => {
  for (const sneak of ['ArrowDown', 'KeyS']) {
    const controls = new KeyboardControls('solo')
    doubleTap(controls)
    controls.press(sneak)
    assert.deepEqual(runner(controls), { ...idle, right: true, sneak: true })
    controls.release('ArrowRight')
    controls.press('ArrowRight', false, 200)
    assert.equal(runner(controls).sprint, false)
    controls.release(sneak)
    assert.deepEqual(runner(controls), { ...idle, right: true })
  }
})

test('a double-tap with the opposite direction held cannot start sprint', () => {
  const controls = new KeyboardControls('solo')
  controls.press('ArrowLeft')
  doubleTap(controls)
  assert.deepEqual(runner(controls), { ...idle, left: true, right: true })
  controls.release('ArrowLeft')
  assert.deepEqual(runner(controls), { ...idle, right: true })
})

test('sprint ends when its triggering physical key releases even if an alias remains held', () => {
  const controls = new KeyboardControls('solo')
  doubleTap(controls)
  controls.press('KeyD')
  controls.release('ArrowRight')
  assert.deepEqual(runner(controls), { ...idle, right: true })
})

test('both runners can sprint and jump independently at the same time', () => {
  const controls = new KeyboardControls('duo')
  doubleTap(controls, 'ArrowRight')
  doubleTap(controls, 'KeyA')
  controls.press('ArrowUp')
  controls.release('ArrowUp')
  controls.press('KeyW')
  controls.release('KeyW')
  assert.deepEqual(controls.inputs(), {
    steve: { ...idle, right: true, jump: true, sprint: true },
    alex: { ...idle, left: true, jump: true, sprint: true },
  })
  controls.press('KeyS')
  assert.deepEqual(controls.inputs(), {
    steve: { ...idle, right: true, sprint: true },
    alex: { ...idle, left: true, sneak: true },
  })
})

test('a brief jump is queued for exactly one input snapshot', () => {
  const controls = new KeyboardControls('solo')
  controls.press('KeyW')
  controls.release('KeyW')
  assert.deepEqual(runner(controls), { ...idle, jump: true })
  assert.deepEqual(runner(controls), idle)
  controls.press('ArrowUp', true)
  assert.deepEqual(runner(controls), idle)
})

test('held jump persists until release without leaving an extra queued jump', () => {
  const controls = new KeyboardControls('solo')
  controls.press('ArrowUp')
  assert.equal(runner(controls).jump, true)
  assert.equal(runner(controls).jump, true)
  controls.release('ArrowUp')
  assert.equal(runner(controls).jump, false)
})

test('blur clear removes held keys, sprint, pending jumps and tap history', () => {
  const controls = new KeyboardControls('duo')
  doubleTap(controls)
  controls.press('KeyW')
  controls.release('KeyW')
  controls.press('KeyS')
  controls.clear()
  assert.deepEqual(controls.inputs(), { steve: idle, alex: idle })
  controls.press('ArrowRight', false, 200)
  assert.deepEqual(controls.inputs(), { steve: { ...idle, right: true }, alex: idle })
})

test('input snapshots remain independent of later polling and caller edits', () => {
  const controls = new KeyboardControls('duo')
  controls.press('ArrowRight')
  const first = controls.inputs()
  first.steve!.left = true
  assert.deepEqual(controls.inputs(), { steve: { ...idle, right: true }, alex: idle })
  controls.release('ArrowRight')
  assert.equal(first.steve!.right, true)
})

test('auto sprint starts with one direction for both independent players', () => {
  const controls = new KeyboardControls('duo', true)
  assert.deepEqual(controls.inputs(), { steve: idle, alex: idle })
  controls.press('ArrowRight')
  controls.press('KeyA')
  assert.deepEqual(controls.inputs(), {
    steve: { ...idle, right: true, sprint: true },
    alex: { ...idle, left: true, sprint: true },
  })
  controls.press('KeyS')
  assert.equal(runner(controls, 'alex').sprint, false)
  assert.equal(runner(controls).sprint, true)
  controls.release('KeyS')
  assert.equal(runner(controls, 'alex').sprint, true)
  controls.press('ArrowLeft')
  assert.equal(runner(controls).sprint, false)
  controls.release('ArrowLeft')
  assert.equal(runner(controls).sprint, true)
  controls.release('ArrowRight')
  assert.equal(runner(controls).sprint, false)
})

test('auto sprint changes mid-move, survives clearing input, and manual sprint still works when off', () => {
  const controls = new KeyboardControls('solo')
  controls.press('KeyD')
  assert.equal(runner(controls).sprint, false)
  controls.setAutoSprint(true)
  assert.equal(runner(controls).sprint, true)
  controls.clear()
  assert.deepEqual(runner(controls), idle)
  controls.press('ArrowLeft')
  assert.equal(runner(controls).sprint, true)
  controls.setAutoSprint(false)
  assert.equal(runner(controls).sprint, false)
  controls.clear()
  doubleTap(controls)
  assert.equal(runner(controls).sprint, true)
})
