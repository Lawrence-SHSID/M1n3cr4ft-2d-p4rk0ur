# Skybound

A Minecraft-inspired 2D skyblock parkour game built with Vue 3, TypeScript, Vite, and a Node.js backend. Uses the five supplied images for grass, dirt, stone, tree wood/leaves, and slime.

## Play locally

Requires Node.js 22.12+ or 24+.

```sh
npm install
npm run dev
```

Open **http://localhost:5175**. Vite runs on port 5175 and proxies the Node level API on port 3005. These ports keep the game separate from other local projects.

## Modes and controls

Choose **Solo adventure** or **Two players** above the game. Multiplayer is local co-op on one keyboard, with separate cameras so each player can explore independently.

| Character | Move | Jump | Crouch | Sprint |
| --- | --- | --- | --- | --- |
| Steve | ← / → | ↑ | ↓ | Double-tap and hold ← or → |
| Alex, in two-player mode | A / D | W | S | Double-tap and hold A or D |

In solo, either arrows or WASD controls Steve. Double-taps must be within 250 ms with a release between them. Releasing the direction, changing direction, or crouching ends the sprint. Normal sprint jumps clear at most four empty blocks; normal jump height is one block, and slime jump height is five.

- **R**: retry from each player's saved checkpoint, or the start if none is saved.
- **Esc**: pause or resume the whole session.
- The reset icon restarts the course from the beginning and clears its checkpoints.
- Touch controls are available in solo; double-tap a direction button to sprint.

Steve and Alex have distinct skins and animated arms and legs. Walking kicks up tiny block-colored dust crumbs; sprinting creates a stronger trail. Particles fade in world space and freeze while paused. Half-height stone slabs move horizontally or vertically and carry riders. Crouching lowers the character, slows movement, and protects platform edges. Players cannot place, move, or edit blocks, and trees are scenery.

In co-op, both players must reach the red finish flag. A player who touches spikes or falls respawns after 0.8 seconds while their partner continues. Each keeps a personal checkpoint; players can pass through each other.

## Courses and checkpoints

Level 1 spans 10 blocks; each level adds 5: `10 + 5 × (level − 1)`. The first six authored courses feature sprint gaps, forest stepping stones, slab ferries, stairs, and slime climbs. Later courses mix seeded terrain motifs through level 1000. The course selector offers the first twelve courses plus flight courses 20 and 30 directly.

Cyan checkpoint flags appear **only on courses longer than 45 blocks**, starting at **level 9, which is 50 blocks long**. They are placed on safe static grass islands, or in clear air on elytra routes, near twenty-block intervals. Land beside a checkpoint flag or glide through a cyan ring to save it; later checkpoints replace earlier ones independently for Steve and Alex. Solo retries and co-op respawns use the saved flag. The camera snaps to the respawn position. Your highest completed level is saved in the browser.

## Elytra flight courses

**Every tenth level (10, 20, 30, …, 1000) is an elytra flight course.** Course length still follows the same five-block progression. Choose course 10 to try the first flight immediately.

Steve wears elytra and glides forward automatically, in a horizontal flying pose. **Hold ↑ to rise, hold → to move faster, and release ↑ to descend.** Gravity and lift change vertical speed smoothly. Left, crouch, and double-tap sprint are not needed in flight. In local co-op, Alex also flies, using **W for lift** and **D for speed**. Both still need to reach the red finish flag.

Steer through alternating stone gates, keeping clear of the top and bottom flight boundaries. Gate or boundary contact ends the attempt. Cyan airborne rings save personal checkpoints and respawn the character safely in open air. Hold-to-lift and hold-to-boost buttons are also available in solo. The flight camera shows the whole vertical corridor.

## Build and run the Node server

```sh
npm run build
npm start
```

Open **http://localhost:3005**. The Node server serves the built game and its API. Set `PORT` to override the production server port.

- `GET /api/health`: service status.
- `GET /api/levels/:number`: course definition for levels 1–1000.

## Verification

```sh
npm test
npm run build
```

Tests verify character key separation, double-tap sprint timing and cancellation, simultaneous play, shared platform clocks, independent deaths and finishes, checkpoint thresholds and safe respawns, every-tenth flight generation, automatic glide/lift/boost physics, flight collisions, real completion of flight courses 10 and 20, exact jump heights, four-block sprint clearance and five-block failure, crouching, edge protection, slab collisions and carrying, authored course completion, level growth, and API/static serving.

The game runs a fixed 120 Hz physics simulation and renders to a canvas. `shared/levels.ts` defines courses, `src/game/physics.ts` handles movement/collision, `src/game/flight.ts` handles elytra flight, `src/game/particles.ts` handles walking dust, `src/game/session.ts` coordinates co-op and checkpoints, `src/game/controls.ts` handles independent key sets and sprint taps, `src/game/renderer.ts` draws the world and Steve, and `server/index.ts` serves the API and production files.
