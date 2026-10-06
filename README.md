# Skybound

A Minecraft-inspired 2D skyblock parkour game built with Vue 3, TypeScript, Vite, and a Node.js backend. Uses the supplied images for grass, dirt, stone, tree wood/leaves, slime, ice, netherrack, nether brick, and the Nether background.

## Play locally

Requires Node.js 22.12+ or 24+.

```sh
npm install
npm run dev
```

Open **http://localhost:5175**. Vite runs on port 5175 and proxies the Node level API on port 3005. These ports keep the game separate from other local projects.

## Modes and controls

Choose **Solo adventure** or **Two players** above the game. Multiplayer is local co-op on one keyboard, on one shared map. The camera smoothly zooms in when Steve and Alex are close and out when they separate, following both players horizontally and vertically. It also keeps a finished player in view while their partner catches up.

| Character | Move | Jump | Crouch | Sprint |
| --- | --- | --- | --- | --- |
| Steve | ← / → | ↑ | ↓ | Double-tap and hold ← or → |
| Alex, in two-player mode | A / D | W | S | Double-tap and hold A or D |

In solo, either arrows or WASD controls Steve. Double-taps must be within 250 ms with a release between them. Releasing the direction, changing direction, or crouching ends the sprint. Normal sprint jumps clear at most four empty blocks; normal jump height is 1.2 blocks, and slime jump height is five.

- **R**: retry from each player's saved checkpoint, or the start if none is saved.
- **Esc**: pause or resume the whole session.
- The reset icon restarts the course from the beginning and clears its checkpoints.
- Touch controls are available in solo; double-tap a direction button to sprint.

Steve and Alex have distinct skins and animated arms and legs. Walking kicks up tiny block-colored dust crumbs; sprinting creates a stronger trail. Particles fade in world space and freeze while paused. Half-height stone slabs move horizontally or vertically and carry riders. Crouching lowers the character, slows movement, and protects platform edges. Players cannot place, move, or edit blocks, and trees are scenery.

Choose **Two players**, then **Teamwork** or **PK race**. Teamwork waits for both players at the red flag. PK starts both at the same line: the first to the flag wins, and a finish on the same physics tick is a tie. The race freezes and names the winner. **Race again** restarts the whole course; switching rules also starts fresh. The chosen rule is remembered across courses and browser refreshes.

In both modes, touching spikes or falling respawns that player after 0.8 seconds while their friend continues. Checkpoints stay personal; players can pass through each other. R retries from saved checkpoints during play, while R after a PK result starts a fresh rematch. Both modes work on parkour and elytra courses.

## Courses and checkpoints

Level 1 spans 10 blocks; each level adds 5: `10 + 5 × (level − 1)`. The first seven authored courses feature sprint gaps, forest stepping stones, slab ferries, stairs, slime climbs, and slippery ice. Course 7, **Frostline crossing**, introduces the supplied ice texture. Later courses mix seeded terrain motifs through level 1000. The course selector offers levels 1–25 and flight course 30 directly.

Cyan checkpoint flags appear **only on courses longer than 45 blocks**, starting at **level 9, which is 50 blocks long**. They are placed on safe static grass islands, or in clear air on elytra routes, near twenty-block intervals. Land beside a checkpoint flag or glide through a cyan ring to save it; later checkpoints replace earlier ones independently for Steve and Alex. Solo retries and co-op respawns use the saved flag. The shared camera prepares for each player’s respawn location while they recover; solo retries snap to the saved position. Your highest completed level is saved in the browser.

## Elytra flight courses

**Every tenth level (10, 20, 30, …, 1000) is an elytra flight course.** Course length still follows the same five-block progression. Choose course 10 to try the first flight immediately.

Steve wears elytra and glides forward automatically, in a horizontal flying pose. **Hold ↑ to rise, hold → to move faster, and release ↑ to descend.** Gravity and lift change vertical speed smoothly. Left, crouch, and double-tap sprint are not needed in flight. In local co-op, Alex also flies, using **W for lift** and **D for speed**. Both still need to reach the red finish flag.

Steer through alternating stone gates, keeping clear of the top and bottom flight boundaries. Gate or boundary contact ends the attempt. Cyan airborne rings save personal checkpoints and respawn the character safely in open air. Hold-to-lift and hold-to-boost buttons are also available in solo. The flight camera keeps the vertical corridor visible and smoothly zooms out when co-op players separate.

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

## Auto sprint and ice

The **Auto sprint** switch beside Solo adventure / Two players makes either character sprint when a single movement direction is held. It also works with solo touch controls. Crouching takes priority. The setting survives course changes, retries, mode changes, and browser reloads; it starts off for a new browser. Elytra keeps its existing lift and boost controls.

Ice accelerates gradually and carries momentum after releasing or reversing movement and through jumps. Ordinary surfaces restore grip; crouching brakes and protects edges. Normal jumps rise 1.2 blocks; slime jumps rise 5. Sprint speed is tuned to 6.5 blocks/second to retain the existing four-block gap limit with the higher jump.

Game website, supplied by the user: [trashbox.tech/ll](https://trashbox.tech/ll). Local changes must be deployed separately to update that website.

## Nether courses

Levels **1–10** keep the sky theme, including the ice course. Levels **11–20** use the supplied Nether background, netherrack landscapes, and nether-brick fortresses. Courses 11–19 zigzag upward through 4–6 ledges, alternating right and left ladder shafts with gaps on each floor. Each ledge has a ranked checkpoint: climbing left never discards progress. The UI shows climb height, and the shared camera follows both players vertically. Their original length value remains a course-size budget; actual width is 11–13 blocks. Course 20 remains an elytra flight with brick gates.

At a ladder, hold **↑ / W** to climb up and **↓ / S** to climb down. Release to hang; move sideways to leave. Down remains crouch away from ladders. Auto-sprint does not speed up climbing. Normal collision, checkpoints, personal respawn, and the shared camera still apply.

## End courses

Levels **21–25** form the toughest chapter: five authored End routes with 3.5–4 block gaps, narrow 1.5-block landings, mandatory vertical End-stone half-slabs, changing heights, and slime jumps to high purpur towers. Safe checkpoints still let you retry each section. The supplied End background, end-stone texture and purpur texture are used directly. Course 26 onward uses the existing sky generator; every tenth course retains elytra flight.

The upward Nether routes and all five End routes pass real-input completion checks, including every End checkpoint retry. The latest local suite passes 158 tests. Local updates are separate from deployment to the game website.

All required End gaps are at least **3.5 blocks wide**, including both sides of each moving slab. These End-stone slabs move vertically; wait for the right height, then jump. They are required landings rather than shortcuts inside a gap. Each End route and every checkpoint retry passes real-input completion checks that include all moving slabs.
