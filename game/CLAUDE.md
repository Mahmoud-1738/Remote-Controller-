# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

The server lives in `../Server/` (one level up from this `game/` directory):

```bash
cd ../Server
npm run np        # start with nodemon (auto-restart on changes)
# or
node server.js    # plain start
```

- Game client: `http://localhost:3000`
- Mobile controller: `http://<LAN-IP>:3000/controller.html` (URL is printed in the terminal and shown in the game HUD after starting)

There is no build step — all client files are plain HTML/JS served statically from the `game/` folder.

## Architecture

This is a two-part real-time RC car game:

**Server (`../Server/server.js`)** — Node.js + Express + Socket.IO. Serves the `game/` directory as static files and acts as a relay: it receives `input` events from `controller.html` and broadcasts them as `gameInput` events to the game page. No game logic lives here.

**Game client (`game.js`)** — A single `Game` class that owns the full lifecycle:
- `constructor` → sets up GUI, SFX, socket, and `Preloader`
- `init()` → creates Three.js scene, renderer, camera, lights, joystick
- `loadAssets()` → loads `assets/rc_time_trial.glb` via `GLTFLoader`; traverses the scene graph to categorize nodes by name prefix (`Chassis`, `Bonnet*`, `Engine*`, `Seat*`, `Wheel*`, `Xtra*`, `*Collider`, `Checkpoint*`, `*Proxy*`)
- `initPhysics()` → builds a Cannon.js `RaycastVehicle` with 4 wheels; collider meshes (name contains `"Collider"`) become static `CANNON.Box` bodies
- `animate()` → `requestAnimationFrame` loop: steps physics, syncs Three.js meshes to Cannon bodies, calls `updateDrive()` and `updateCamera()`
- `initSocket()` → connects to Socket.IO; `gameInput` events set `this.js.forward` / `this.js.turn` which `updateDrive()` reads each frame

**Mobile controller (`controller.html`)** — Self-contained HTML page. Drag on the steering wheel image sets `turn`, tap/hold the pedal panels sets `forward`. Sends `socket.emit('input', { forward, turn })` on every interaction change.

**Third-party libs (vendor, no build tool, loaded via `<script>` tags):**
- `libs/three.min.js` — Three.js r3D renderer
- `libs/cannon.min.js` — Cannon.js physics
- `libs/GLTFLoader.js` — GLTF/GLB model loader
- `libs/OrbitControls.js`, `libs/CannonDebugRenderer.js`, `libs/stats.min.js`, `libs/inflate.min.js`

**Assets:**
- `assets/rc_time_trial.glb` — entire track + car mesh; node names drive game logic (see `loadAssets()`)
- `assets/images/carparts0000–0016.png` — sprite frames for the menu car preview
- `assets/sfx/` — bump, click, engine, skid sounds (mp3 + ogg)
- `assets/images/{px,nx,py,ny,pz,nz}.jpg` — cubemap skybox

## Key conventions

- **GLB node naming is functional**: adding a mesh to the GLB requires matching the naming convention (`Bonnet1`, `Engine2`, `WheelFL`, `TrackCollider`, `Checkpoint00`, etc.) — the game code searches by `child.name.includes(...)`.
- **Physics ↔ Three.js sync**: Cannon bodies store a `.threemesh` reference; the `postStep` listener and the `animate()` loop copy `.position`/`.quaternion` from Cannon → Three.js each frame.
- **Controller sign convention**: `joystickCallback` negates both axes (`-forward`, `-turn`); `controller.html` accounts for this by also negating before sending, so the raw socket payload matches what the physics expects.
- **`this.debug` / `this.debugPhysics`**: set either flag to `true` in the `Game` constructor to enable Stats.js overlay or the Cannon wireframe debug renderer.
