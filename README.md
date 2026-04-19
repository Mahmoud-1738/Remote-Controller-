# K4RA Race — RC Car Game

A two-player, split-screen RC car game you control from your phone.

---

## How to Run

```bash
cd Server
npm install
node server.js
```

- Game screen: `http://localhost:3000`
- Phone controller: `http://<YOUR-LAN-IP>:3000/controller.html`

The LAN IP is printed in the terminal when the server starts, and shown in the top-right HUD after pressing Play.

---

## Project Structure

```
Remote-Controller-/
├── Server/
│   └── server.js          ← Node.js server (Express + Socket.IO)
└── game/
    ├── index.html         ← Main game page (menu + in-game HUD)
    ├── game.js            ← All game logic (Three.js + Cannon.js)
    ├── controller.html    ← Phone controller UI
    ├── libs/              ← Vendor libraries (Three.js, Cannon.js, loaders...)
    └── assets/
        ├── rc_time_trial.fbx      ← Track + car mesh
        ├── images/                ← Car preview sprites, skybox cubemap
        └── sfx/                   ← Engine, skid, bump, click sounds
```

---

## How the Three Parts Connect

```
Phone (controller.html)
    │  socket.emit('input', { forward, turn, playerID })
    ▼
Server (server.js)
    │  socket.broadcast.emit('gameInput', { forward, turn, playerID })
    ▼
Game (game.js)
    │  reads this.js[playerID].forward / .turn each frame
    ▼
Cannon.js RaycastVehicle → Three.js mesh sync
```

The server is a **pure relay** — it has no game logic. It just forwards controller input to the game page.

---

## Game Architecture (`game.js`)

Everything lives in a single `Game` class.

### Startup sequence

1. `new Game()` — sets up GUI, sound, socket connection, and a `Preloader` that waits for all assets
2. `init()` — creates the Three.js scene, WebGL renderer, two cameras, lights, and starts the animation loop
3. `loadAssets()` — loads `rc_time_trial.fbx` via `FBXLoader`; walks every node and sorts them by name:
   - `Chassis` → car body physics anchor
   - `Bonnet*`, `Engine*`, `Seat*`, `Xtra*` → swappable car part meshes
   - `Wheel*` (FL, FR, RL, RR) → wheel meshes
   - `*Collider*` → invisible boxes that become the physics track boundary
   - `Checkpoint*` → lap timing gates
4. `initPhysics()` — builds two `CANNON.RaycastVehicle` bodies (one per player), attaches four wheels each, adds all collider boxes to the physics world
5. `initSocket()` — connects to Socket.IO and routes incoming `gameInput` events to the right player's input slot

### Every frame (`animate()`)

1. Step the Cannon.js physics world (`world.step`)
2. Copy positions/rotations from Cannon bodies → Three.js meshes
3. `updateDrive(0)` — apply P1 throttle/steering forces to vehicle 0
4. `updateDrive(1)` — apply P2 throttle/steering forces to vehicle 1
5. `updateCamera()` — move both follow cameras behind their car
6. **Split-screen render**:
   - Top half of the screen → P1's camera
   - Bottom half of the screen → P2's camera

### Physics colliders

Collider meshes in the FBX (any node whose name contains `"Collider"`) are made invisible and converted to static `CANNON.Box` bodies. Their size is measured using `THREE.Box3.setFromObject()` (world-space bounding box) so the physics shape always matches the mesh exactly.

---

## Two-Player Input

| Player | Controls |
|--------|----------|
| P1 | Phone at `controller.html` (steering wheel + pedal) |
| P2 | WASD keyboard **or** second phone |

Input state is stored as `this.js = [{forward, turn}, {forward, turn}]`.

- Phone input comes in via Socket.IO with a `playerID` field (0 or 1)
- WASD keys directly write into `this.js[1]` each frame

---

## Phone Controller (`controller.html`)

Self-contained HTML page — no server logic needed.

- **Steering**: drag left/right on the wheel image → sets `turn` (-1 to +1)
- **Gas / Brake**: tap/hold the right pedal panels → sets `forward` (+1 gas, -1 brake)
- On every change: `socket.emit('input', { forward, turn, playerID })`

The controller connects to the same Socket.IO server as the game.

---

## Car Customisation (Menu)

The menu shows three car presets. Each preset is a different combination of `Bonnet*`, `Engine*`, `Seat*`, and `Xtra*` meshes toggled visible/invisible inside the loaded FBX scene. The car preview image is a sprite sheet (`carparts0000–0016.png`) animated in the browser.

---

## Key Libraries

| Library | Purpose |
|---------|---------|
| `three.min.js` | 3D rendering (WebGL) |
| `cannon.min.js` | Rigid-body physics |
| `FBXLoader.js` | Load the `.fbx` track/car model |
| `OrbitControls.js` | Debug camera (not used in gameplay) |
| `CannonDebugRenderer.js` | Visualise physics wireframes (debug only) |
| `socket.io.js` | Real-time input relay |









here is video for the game 
https://youtu.be/v2MFMdVMedA
