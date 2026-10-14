# Farm Game: Build Plan

A single-player **browser game for PC and mobile** in the style of FarmVille 1 (2009–2011 Facebook era). It has an isometric farm, plow/plant/harvest loops on real-time timers, coins and XP, mastery, animals, trees, and buildings. Rates are fully tunable and saves live locally on the device. It's installable to the home screen as a web app (PWA). The architecture is set up so co-op and an optional desktop build can be added later without a rewrite.

> **IP note:** "FarmVille" and its art belong to Zynga. We copy the *mechanics* only and use an original name, original art, and original item names. Working title: **"Homestead Acres"** (rename any time; it lives in one constant).

---

## 1. Guiding principles

1. **Simulation is separate from presentation.** All game rules live in a pure TypeScript `core` module with no rendering, DOM, or storage imports. The renderer only *reads* state and *sends commands*.
2. **Every state change is a command.** `PlantCrop`, `Harvest`, `BuyItem`, and so on are serializable objects applied by a single reducer. Single-player works by sending commands locally; co-op later sends the same commands over a socket.
3. **Time and randomness are injected.** `core` never calls `Date.now()` or `Math.random()`. It takes a `now` timestamp and uses a seeded RNG stored in state. That gives deterministic tests, a time-scale setting, offline progress, and future network sync.
4. **Content is data, not code.** Crops, animals, trees, buildings, and levels are defined in data tables. Balancing means editing data or multipliers, not logic.
5. **Every rate is configurable.** Each timer, price, yield, and XP value is computed as `(per-item override ?? base) × global multiplier`. Overrides replace an item's base stats; the global multipliers still apply on top.
6. **Saves are robust.** Writes are atomic, saves are versioned and migrated, backups roll, exports are easy, and save corruption never destroys progress.
7. **Platform APIs stay at the edges.** Storage, the device lifecycle, and input go through small adapters (`SaveStore`, `Lifecycle`, input layer). A desktop wrapper later only swaps adapters.
8. **Touch-first, mouse-friendly.** Every interaction must work with a finger and no hover. The mouse gets extras (hover tooltips, wheel zoom, keyboard shortcuts) on top.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | One language for the sim, UI, and future server |
| Rendering | **Phaser 3** | Mature 2D engine with isometric-friendly sprites, touch and mouse input, cameras, and a scale manager |
| UI overlays (HUD, market, dialogs) | HTML/CSS overlay (Preact) over the canvas | Menus and responsive layout are much easier in DOM than in canvas |
| Build / dev server | Vite (`--host` for testing on phones over LAN) | Fast hot reload; a phone on the same Wi-Fi sees changes instantly |
| Installable app | PWA (`vite-plugin-pwa`): manifest + service worker | Home-screen install, full-screen, offline play, protection from iOS storage eviction |
| Local saves | IndexedDB (via `idb`) | Transactional, large quota, works on all modern browsers |
| Tests | Vitest | Core sim has high unit-test coverage |
| Lint | ESLint, with a rule banning `Date.now`/`Math.random` in `core/` and storage APIs outside `persistence/` | Enforces principles 3 and 7 |
| Future co-op | Node + `ws` (WebSocket), sharing `core` | Same reducer runs on the host |
| Optional desktop (later) | Electron or Tauri wrapper + `FileSaveStore` | About 1–2 days of work thanks to principle 7 |

---

## 3. Project structure

```
D:\Farmville
├─ PLAN.md
├─ index.html / package.json / tsconfig.json / vite.config.ts / eslint.config.js
├─ public/                  # PWA icons, manifest assets
├─ src/
│  ├─ core/                 # PURE simulation (no Phaser/DOM/storage)
│  │  ├─ state.ts           # GameState, PlayerState, FarmState, entity types, newGame()
│  │  ├─ commands.ts        # Command union, envelope (playerId/farmId/clientSeq), error codes
│  │  ├─ reducer.ts         # applyCommand(state, envelope, realNow, content) -> { state, events } | error; tick()
│  │  ├─ events.ts          # GameEvent union (drives effects; broadcast in co-op)
│  │  ├─ time.ts            # clock advance, offline-progress policy
│  │  ├─ crops.ts           # derived crop/plot status, growth stages, withering
│  │  ├─ rules.ts           # WorldRules: multipliers + presets
│  │  ├─ economy.ts         # price/XP/yield formulas (all rule-aware)
│  │  ├─ progression.ts     # levels, mastery, ribbons, unlocks
│  │  ├─ grid.ts            # tile occupancy, footprints, placement validation
│  │  ├─ rng.ts             # seeded PRNG (mulberry32) stored in state
│  │  └─ ids.ts             # entity IDs (string, never array index), safe record lookup
│  ├─ content/              # JSON data tables (crops, decorations, levels, base; later trees, animals, ...)
│  │  ├─ schema.ts          # zod schemas + types
│  │  └─ index.ts           # validates tables, builds lookups (defaultContent)
│  ├─ persistence/
│  │  ├─ SaveStore.ts       # interface: listSlots/read/write/remove + backup rotation policy
│  │  ├─ IdbSaveStore.ts    # IndexedDB implementation (primary)
│  │  ├─ MemorySaveStore.ts # tests + no-storage fallback
│  │  ├─ emergency.ts       # synchronous localStorage copy written on pagehide
│  │  ├─ loadSlot.ts        # emergency (if newer) -> main -> backups fallback
│  │  ├─ serialize.ts       # save envelope, checksum, decode (migrate + validate)
│  │  ├─ schema.ts          # zod schema for GameState
│  │  └─ migrations.ts      # v1->v2, v2->v3 ... (none yet)
│  ├─ platform/
│  │  ├─ lifecycle.ts       # visibilitychange/pagehide/freeze hooks
│  │  ├─ device.ts          # touch/mouse detection, orientation, safe areas, DPR cap
│  │  ├─ files.ts           # download/read files for export/import
│  │  ├─ storage.ts         # navigator.storage.persist()
│  │  └─ install.ts         # PWA install prompt + iOS "Add to Home Screen" hint (Phase 7)
│  ├─ app/                  # wiring between game, UI, saves and transport
│  │  ├─ GameApp.ts         # farm list, new/open/exit/delete, export/import, clock tick, lifecycle
│  │  ├─ Autosaver.ts       # when to save (debounce, interval, hide, pagehide emergency copy)
│  │  ├─ awaySummary.ts     # "while you were away" counts
│  │  ├─ session.ts         # Session type (transport + UI store + settings), new-farm rules, dev URL options
│  │  ├─ settings.ts        # per-device settings (UI size, pop-ups, confirmations, hover info, vibration)
│  │  ├─ store.ts           # tiny observable store
│  │  └─ uiState.ts         # tool, seed, held item, paint mode, menus, tooltip, toasts, confirm
│  ├─ net/                  # co-op seam (local-only for now)
│  │  ├─ Transport.ts       # interface: send(cmd), tick, subscribe(state, events)
│  │  └─ LocalTransport.ts  # applies commands directly to local state
│  ├─ game/                 # Phaser scenes & rendering
│  │  ├─ scenes/            # FarmScene (Visit later)
│  │  ├─ iso.ts             # tile<->screen projection, depth sorting
│  │  ├─ art/               # placeholder textures drawn in code (replaced by an atlas in Phase 7)
│  │  ├─ input/             # gesture recognizer (pure) + DOM pointer binding + keyboard
│  │  ├─ views/             # entity sprites synced from state (plots, decorations; trees/animals later)
│  │  ├─ tools/             # toolActions: what a tap or painted tile does with each tool (pure)
│  │  └─ fx/                # coin/XP pop-ups (particles later)
│  ├─ ui/                   # Preact overlay: HUD, Toolbar, Market, Settings, Saves, Dialogs
│  └─ main.ts               # entry
└─ tests/                   # vitest specs mirroring src/core
```

---

## 4. Core game mechanics (FarmVille 1 parity list)

### 4.1 Farm and grid
- Isometric tile grid. The starting farm is **12×12 plots** (one plot = one crop footprint); later expansions go to 14, 16, 18, 20, 22, and beyond.
- Every placeable item has a footprint (w×h) and optional rotation. Placement is validated against occupancy and bounds.
- Items can be moved, rotated, sold back for a partial refund, or stored in a gift box or inventory.

### 4.2 Crops (main loop)
- **Plow** a plot: costs coins (default 15), gives 1 XP.
- **Plant** a seed: costs coins, gives XP. Starts a timer `growMs = baseGrow × rules.cropGrowth`. The ripe time is fixed at planting, so changing rates only affects new plantings.
- States: `fallow → plowed → growing (stages 0-2) → ripe → withered`.
- **Wither**: a ripe crop withers after `ripeWindow = growMs × rules.witherWindowFactor` (FV1 used roughly 1× grow time). This is derived from the *current* rules, so switching withering off also revives crops that already withered. A withered crop can be plowed over (paying the plow fee), or revived with an Unwither item (Phase 5). **Withering can be turned off.**
- **Harvest**: gives coins (sale value), counts toward mastery, and leaves the plot *fallow*, needing a new plow (FV1 behavior; the `keepPlowedAfterHarvest` rule skips that).
- Example crop set (original names, FV1-like timings): 4h Strawberries, 8h Eggplant, 12h Wheat, 1d Corn, 2d Pumpkin, 3d Soybeans, 4h Raspberry, plus about 25 more unlocked by level.

### 4.3 Trees
- Placed permanently. Become harvestable every N days (for example Apple 3d, Lemon 2d). Harvesting gives coins and a tree-mastery tick.
- Trees never wither; they just wait. An optional orchard building holds several trees.

### 4.4 Animals
- Chickens, cows, sheep, horses, pigs, ducks, and others. Each has a harvest cycle (for example chicken 1d gives eggs, cow 1d gives milk).
- Later buildings (Chicken Coop, Dairy Farm, Stable) house animals for one-click collection.
- Rare drops: an animal sometimes drops a baby or a collectible (seeded RNG).

### 4.5 Buildings and decorations
- Functional: Storage Cellar or Barn (inventory capacity), Garage (vehicles), Coop/Dairy/Stable (animal housing), Crafting Cottage (later; turns harvests into goods).
- Decorative: fences, hay bales, paths, flowers. They give XP on placement and cost coins.
- Construction buildings: placed as a frame, then completed with N parts. In single-player, parts come from AI-neighbor gifts or can be bought.

### 4.6 Vehicles and fuel
- Tractor (plows 4 plots per click), Seeder (plants 4), Harvester (harvests 4), Combine (all 3, 9 plots).
- Fuel per use; fuel regenerates over time (rate is configurable) or can be bought.

### 4.7 Economy and progression
- **Currencies**: Coins (soft) and Farm Cash (premium-like). Single-player has no real money; Farm Cash is earned by leveling, mastery, and ribbons, with a configurable earn rate.
- **XP and levels**: a level curve table up to level 70 or more. Levels unlock items.
- **Crop mastery**: 3 stars per crop at harvest thresholds. Rewards: coins, XP, and a mastery sign decoration; mastered crops give a seed discount.
- **Ribbons/achievements**: yellow, white, red, and blue tiers for activity milestones.
- **Collections**: random "collectible" drops while harvesting or plowing. Completing a set grants XP, coins, and an item.
- **Daily login bonus**: streak rewards.
- **Farm expansion**: costs coins and requires a level (a neighbor-count requirement in FV1 becomes AI-neighbor count).

### 4.8 Replacing the social layer for single player
FV1 leaned heavily on Facebook neighbors. The single-player replacements:
- **AI neighbors** (about 5 generated farmers with names, avatars, and small simulated farms). Each day they can:
  - send gifts (seeds, decorations, building parts, fuel)
  - "visit" and fertilize N of your crops (speeds them up) or feed your chickens
- **You visit them**: up to 5 actions per neighbor per day for coins and XP, like FV1 neighbor visits.
- **Co-op jobs (solo version)**: timed contracts such as "Grow 300 strawberries + 120 wheat in 3 days" with gold, silver, or bronze rewards. These are designed so the real co-op later reuses them unchanged.
- **Gift box**: inventory that holds gifts until you place or use them.

---

## 5. Customizable rates (`WorldRules`)

Stored **inside each save** (not globally), so a future co-op host's rules apply to everyone. Editable from a Settings → World Rules screen, and importable/exportable as JSON for power users.

```ts
interface WorldRules {
  preset: 'classic' | 'relaxed' | 'idle' | 'speedrun' | 'custom';
  timeScale: number;            // 1 = real time; 60 = 1 real min = 1 game hour
  cropGrowth: number;           // multiplier on grow time (0.5 = twice as fast)
  treeCycle: number;
  animalCycle: number;
  witherEnabled: boolean;
  witherWindowFactor: number;   // ripe window as fraction of grow time
  coinYield: number;            // multiplier on harvest coins
  xpGain: number;
  buyCost: number;              // multiplier on all purchase prices (seeds, decorations, ...)
  plowCost: number;
  farmCashEarnRate: number;
  fuelRegenPerHour: number;
  collectibleDropRate: number;
  offlineProgress: 'full' | 'capped' | 'paused'; // 'paused' = timers freeze while game closed
  offlineCapHours: number;
  aiNeighborCount: number;
  aiGiftsPerDay: number;
  keepPlowedAfterHarvest: boolean;
  startingCoins: number;
  startingCash: number;
  overrides: Record<ItemId, Partial<{ growMs: number; sellPrice: number; cost: number; xp: number }>>;
}
```

**Presets**
- **Classic**: FV1-faithful timings, withering on, full offline progress.
- **Relaxed**: withering off, 2× coins, offline progress on.
- **Idle**: withering off, timers pause while closed, 0.5× growth.
- **Speedrun/Test**: `timeScale` 600, 5× XP (also used for development).

All formulas go through `economy.ts`, for example `effectiveGrowMs(item, rules)`, so no other code reads raw numbers.

---

## 6. Time model and offline progress

- Each timed entity stores **absolute timestamps** (`plantedAt`, `readyAt`, `witherAt`) in *game time*.
- Game time is computed as `gameNow = lastGameNow + (realNow − lastRealNow) × timeScale`, where the real-time delta is limited by the `offlineProgress` policy on load or resume.
- On load **and on resume from a background tab**, compute the new `gameNow` and run `tick()` once. Status (ripe or withered) is *derived* from timestamps, so throttled or suspended browser tabs never break timers. The renderer polls status for visuals.
- Guard against clock tampering or a clock going backwards: if `realNow < lastRealNow`, do not advance.

---

## 7. Persistence (local saves, browser)

- **Storage**: IndexedDB database `homestead-acres` with these object stores:
  - `slots`: metadata (farm name, farmer, level, coins, playtime, created, last saved) for the farm list
  - `saves`: current save per slot
  - `backups`: up to 5 older saves per slot, newest first. The previous save is kept when the newest backup is at least 10 minutes older, and always on a session's first save, so backups span hours of play rather than the last few autosaves.
- **Format**: `{ schemaVersion, gameVersion, savedAt, checksum, rules, state }`, stored as JSON.
- **Atomic write**: one IndexedDB transaction writes the save, rotates backups, and updates metadata. It all commits or nothing does.
- **When to save**:
  - every 30s if state changed
  - immediately on `visibilitychange → hidden` and on `pagehide`. Mobile browsers kill background tabs without warning, and `beforeunload` is unreliable there.
  - after important events (level up, purchases)
- **Load**: verify checksum, run migrations `vN → current`, and validate with zod. If any step fails, offer to restore the newest valid backup.
- **Keeping saves from being deleted**:
  - Call `navigator.storage.persist()` on first save.
  - **iOS Safari deletes site data after about 7 days without a visit unless the site is installed to the home screen.** Detect iOS non-standalone mode and show a friendly "Add to Home Screen to keep your farm safe" prompt.
  - Offer an optional "export a backup" reminder every N days (configurable or off).
- **Export/Import save** as a `.farm` file (JSON). This doubles as moving a farm between devices (PC to phone) and as the import path for a future desktop build.
- **Multiple save slots.**

---

## 8. Cross-platform: PC + mobile

**Targets**
- Desktop browsers: Chrome, Edge, Firefox, Safari (latest 2 versions)
- Mobile: iOS Safari 16.4+, Android Chrome
- **Phones: landscape only**, with a "rotate your device" overlay in portrait. Tablets and desktop: any orientation or size.

**Input (one gesture layer, `game/input/`)**

| Action | Touch | Mouse / keyboard |
|---|---|---|
| Use tool / multi-tool | Tap | Click |
| Pan camera | One-finger drag (on empty ground or while not moving an item) | Drag, or WASD/arrows |
| Zoom | Pinch | Wheel, +/- |
| Item info / tooltip | Long-press (about 400ms); the next tap only dismisses it | Hover |
| Move or place item | Tap the item to pick it up, then tap where it goes, or drag the preview and release (the camera doesn't pan while holding an item; two fingers still pan) | Preview follows the mouse; click to drop |
| Rotate held item | Toolbar button | R |
| Cancel tool | Toolbar button | Esc / right-click |
| Repeat action over many plots | Paint toggle in the toolbar, then drag across plots (every tile on the path counts, even on fast swipes) | Same, or Shift-drag |
| Tools | Toolbar | 1–6 tools, M market, P paint |

Pressing, pausing, then dragging still drags: the long-press info shows first, then the drag takes over.

**Layout (Preact overlay, responsive by CSS breakpoints)**
- **Large screens**: FV1-style layout. Resources bar along the top, tool palette at the bottom right, and the market as a centered modal with tabs.
- **Phones (landscape)**:
  - compact top HUD
  - the toolbar collapses into a vertical rail on the right edge, within thumb reach
  - the market and dialogs open as full-height side sheets
- Tap targets ≥ 44px; text sizing controlled by a UI scale setting.
- Respect safe-area insets (`env(safe-area-inset-*)`) for notches and home bars.

**Performance on mobile**
- Pack sprites into texture atlases; cap the render resolution at a device pixel ratio of 2.
- Only animate on-screen objects; cull off-screen views.
- Target 60fps on a mid-range Android phone with a fully planted 22×22 farm. Fall back to 30fps in low-power mode.

**Browser lifecycle**
- Audio unlocks on first user gesture.
- Pause rendering when the tab is hidden; catch up time on resume (§6).
- Prevent browser pull-to-refresh, double-tap zoom, and long-press context menus on the canvas (`touch-action: none`, `overscroll-behavior: none`).

**Testing on devices**
- `npm run dev -- --host` serves the game on the LAN, so you can open `http://<PC-IP>:5173` on your phone.
- Desktop Chrome device emulation is used for quick layout checks; a real phone is used for touch feel and performance.
- Service worker features only work over HTTPS or localhost. To test PWA install on a phone, use a local HTTPS tunnel or a preview deploy (decided when needed).

---

## 9. Co-op readiness (build the seams now, implement later)

Done from day one:
- Every entity has an `ownerId`. `GameState` holds `players: Record<PlayerId, PlayerState>` (with one player for now) and `farms: Record<FarmId, FarmState>`.
- Commands carry `{ playerId, farmId, clientSeq }`.
- The UI only talks to a `Transport`. Single-player uses `LocalTransport`.
- The reducer is deterministic and returns **events** (`CropHarvested`, `LevelUp`, and so on) that drive the effects.
- Content and rules are part of the save or session, not global singletons.

Later co-op (Phase 8) options, from easiest to hardest:
1. **Visiting**: the host shares a read-only snapshot, and visitors perform limited "neighbor help" commands.
2. **Shared farm (host-authoritative)**: a small Node relay/host server runs over WebSocket, and the host player's save is authoritative. Clients send commands; the host validates, applies, and broadcasts state diffs and events. Clients predict optimistically and reconcile.
3. **Co-op jobs across separate farms**: each player keeps their own farm, and a shared contract tracks combined harvests (reusing §4.8 contracts).

Because players are in browsers, a pure peer-to-peer option (WebRTC) is also possible. Decide in Phase 8.

---

## 10. Rendering and UX

- **Isometric projection**: 2:1 diamond tiles (64×32 base). Depth sort by `(x + y)` and footprint bottom edge.
- **Camera**: pan and zoom (0.5×–2×) per §8, with edge clamping and inertia on touch.
- **Tool palette**: Multi-tool, Plow, Market, Move, Delete/Sell, Gift box, Fertilize.
- **Multi-tool context action**: plow empty ground, harvest ripe crops, collect from animals.
- **Action queue**: like FV1, taps queue up and a farmer avatar walks to each tile (with an instant mode in settings). Queued actions show on tiles as small icons.
- **HUD**: coins, cash, XP bar with level, fuel, clock, and a settings cog.
- **Market**: tabs for Seeds, Trees, Animals, Buildings, Decorations, Vehicles, Expansion. Locked items show the required level.
- **Info**: hover (mouse) or long-press (touch) shows name, time remaining, and status.
- **Juice**: coin and XP pop-ups, crop growth stage sprites, harvest particles, SFX, and optional haptics on mobile (`navigator.vibrate` where supported).
- **Art plan**: start with procedurally drawn placeholders (colored iso diamonds, simple shapes) so mechanics aren't blocked; then swap in an original sprite atlas (hand-made, commissioned, or CC0/paid packs).

---

## 11. Phased roadmap and estimates

These estimates assume Claude writes the code in regular sessions, with the user play-testing and giving feedback between sessions. Each phase ends with a playable, testable build. A box is checked only once its verification passes.

| Milestone | Phases | Estimate |
|---|---|---|
| Playable game (loop, shop, saves, rates, PC + phone) | 0–4 | 1.5–2.5 weeks |
| Complete single-player content | 5–6 | +2–3 weeks |
| Polish + device testing + PWA | 7 | +2–3.5 weeks |
| **Polished single-player total** | 0–7 | **about 6–9 weeks** |
| Co-op | 8 | +2–4 weeks |
| Optional desktop wrapper | 9 | +1–2 days |

Art is the biggest unknown and is not included in these estimates.

### Phase 0: Scaffold (a few hours) ✅ done 2026-10-14
- [x] npm project, TypeScript strict, Vite, Phaser, Preact, Vitest, ESLint (core purity and storage-boundary rules), git init, `.gitignore`
- [x] `index.html` with full-screen canvas + UI overlay root, mobile viewport meta, `touch-action`/overscroll CSS
- [x] Phaser game sized in device pixels with a DPR cap (scale mode NONE + manual resize, so it stays sharp on high-DPI screens); waits for a non-zero viewport before booting WebGL; Preact overlay mounted
- [x] Scripts: `dev` (with `--host`), `build`, `preview`, `test`, `lint`, `typecheck`, `check`
- [x] **Verify**: the placeholder iso farm renders and resizes (desktop 1280×720, phone landscape 812×375, phone portrait shows the rotate prompt); hover highlight, drag-pan, and wheel zoom work; `check` and `build` pass; the core lint rule fires on a probe file; the dev server is exposed on the LAN. *Real-phone check is pending (user).*

Toolchain: Node 24 LTS, Vite 8, TypeScript 6, Vitest 5, ESLint 10, Phaser 3.90, Preact 11.

### Phase 1: Core simulation, headless (1–2 days) ✅ done 2026-10-14
- [x] State types, IDs, seeded RNG, `WorldRules` and presets
- [x] Grid and placement validation (footprints, rotation, bounds, overlap)
- [x] Commands: Plow (also clears withered crops, replacing a separate ClearWithered), Plant, Harvest, Buy (decorations), Sell, Move
- [x] Time model, `tick`, derived crop status, wither logic, offline policies
- [x] Economy formulas and the XP/level table (70 levels, Farm Cash per level)
- [x] Content loader with zod validation; 8 starter crops, 3 decorations
- [x] **Verify**: 66 unit tests covering growth timing under multipliers and timeScale, wither on and off, offline full/capped/paused, clock rollback, cost and yield math, overrides, level-ups, invalid and inherited ids rejected, ownership check, immutability, determinism, and JSON round trip. Mutation check: three injected bugs were each caught.

### Phase 2: Playable farm, rendering and input (3–5 days) ✅ done 2026-10-14
- [x] Iso renderer, camera (fit-to-farm, zoom 0.5–2.5×, bounds), plot views with 3 growth stages + ripe + withered, decorations as iso boxes, placeholder art drawn at 2× for sharp zoom
- [x] Unified gesture layer (tap, long-press, drag-pan, pinch, wheel, keys)
- [x] Tools: multi-tool, plow, seed, harvest, move, sell (with confirmation), place, drag-paint
- [x] Responsive HUD (level + XP bar, coins, cash, speed badge), toolbar (desktop palette or phone rail), Market (seeds + decorations tabs), tooltips, toasts, coin/XP pop-ups
- [x] Portrait "rotate device" overlay on phones
- [x] Commands go through `Transport` (`LocalTransport`); the clock ticks every 500ms while visible and catches up on resume
- [x] **Verify**: in the browser with `?preset=speedrun`, a full loop with real mouse input: paint-plow 2 rows, choose seeds, paint-plant 14 plots, ripen, paint-harvest (+490 coins), level-ups, place, rotate, move, and sell decorations (with confirmation, 50% refund), invalid placement rejected. Phone landscape (740×360, touch emulation, 2× DPR): rail toolbar, side-sheet market; synthetic touch tap, long-press tooltip, pinch 3× and one-finger pan. 91 unit tests (gestures, tool logic, tooltips/formatting, transport). Perf: 22×22 fully planted farm syncs in about 0.2ms per tick and renders 972 sprites in about 1.7ms. *Pending (user): feel-test on a real phone.*

Dev URL options (still handy for testing; they only affect *new* farms): `?preset=classic|relaxed|idle|speedrun` pre-selects the preset, `?timeScale=600`, `?coins=5000`.

### Phase 3: Persistence (1–2 days) ✅ done 2026-10-15
- [x] `SaveStore` interface, `IdbSaveStore` (via `idb`), `MemorySaveStore` (tests, and the fallback when the browser blocks storage, with a warning to export)
- [x] Transactional save with backups (up to 5, at most one per 10 minutes, plus one at the start of every session), checksum (cyrb53), schema version and migration framework, zod validation of everything loaded or imported
- [x] Autosave: 2s after any action, every 30s regardless (keeps the offline-time anchor fresh), immediately on `visibilitychange → hidden`, on exit to the farm list, and a synchronous localStorage "emergency copy" on `pagehide` that is used only if it's newer than the IndexedDB save
- [x] Farm list (title screen) with new-farm form (name, farmer, rules preset), play, export, delete with confirmation, import; in-game ☰ menu with save status, save now, export, save & exit
- [x] Offline progress on load and on resume, with a "Welcome back" summary (crops ripened or withered, or timers paused); `navigator.storage.persist()` requested on first farm open
- [x] Export/Import `.farm` file (imports become a new farm, renamed if the name is taken)
- [x] **Verify**: in the browser: create a farm, plant, reload and stay away 95s at ×600; on reopen the strawberry had withered, the soybeans were still growing, and the welcome summary was correct. Corrupt the main save in IndexedDB: the backup was restored with a notice. A change made just before a reload survived; `pagehide` wrote the emergency copy, which was cleared after the next IndexedDB save. Export → import round trip; save & exit pauses the renderer; delete with confirmation; phone landscape layouts. 134 unit tests (serialize round trip, schema drift, corruption, newer-version refusal, migrations, both stores incl. IndexedDB via `fake-indexeddb`, backup rotation, load fallback order, autosave timing/playtime/errors, app flows), plus a mutation check of 3 injected persistence bugs and the damaged-backup fix. *Pending (user): real phone, killing the backgrounded tab, and a PC → phone file transfer.*

Found and fixed during verification: after restoring a backup, the first save rotated the *damaged* main copy into the backups, pushing out a good one; it is now skipped (`skipBackup`).

### Phase 4: Settings and rates UI (1 day) ✅ done 2026-10-15
- [x] `setRules` command (validated in core by `validateRules` against `RULE_LIMITS`, owner-only like every command, saved with the farm). When rules change:
  - **Game speed:** applies from that moment (the clock is advanced under the old speed first).
  - **Grow times:** apply to new plantings.
  - **Withering:** follows the current rules, but a change never withers a ripe crop on the spot. Crops that would instantly wither get a fresh ripe window starting now, and the player is told how many.
- [x] World Rules editor (Settings → World rules, from the in-game ☰ menu): presets, sliders with labelled stops for every implemented rate, offline mode, withering, keep-plowed, per-crop/per-decoration overrides table, rules JSON export/import. Draft + Apply/Undo. The same editor appears in the new-farm form behind "Customize rules", with starting coins/cash.
- [x] Device settings (Settings → Game, also on the farm list; localStorage via `persistence/settingsStorage.ts`): interface size (4 steps), coin/XP pop-ups, ask before selling, info on hover, vibration.
- [ ] Deferred: *instant actions* and *sound* settings ship with the action queue and audio (Phase 7). Tree/animal/fuel/collectible/AI-neighbour rules exist in `WorldRules` but are hidden from the editor until those features exist (Phases 5–6).
- [x] **Verify**:
  - **New farm with custom rules (in the browser):** ×60 speed, withering off, 5,000 coins and a 1h strawberry override, all set through the UI. The farm got exactly those, and the market showed 1m / 24m.
  - **Rule change on a live farm:** with a strawberry ripe for 71 game minutes, withering was switched on through Settings. The crop stayed ripe with a fresh 60-minute window, and the toast reported it.
  - **Device settings:** interface size Large and pop-ups off applied instantly and survived a reload.
  - **Tests:** 158 unit tests, covering rules validation (types, ranges, enums, prototype keys, limits), preset matching, every `setRules` timing rule, settings persistence/corruption, slider stops and labels, and app flows. A mutation check of the refresh and validation logic was caught.

Found and fixed during verification:
- `zoom`-scaled panels overflowed narrow screens (viewport sizes are now divided by the scale).
- The view drifted after a canvas resize, because the scroll was kept instead of the centre.
- On tall screens the farm was pinned to the top (camera bounds are now never smaller than the view).
- The HUD overflowed narrow desktop windows (the title chip is hidden below 820px).

### Phase 5: Content depth (1.5–2 weeks)
- [ ] Trees, animals (and animal buildings), decorations
- [ ] Storage, gift box and inventory
- [ ] Crop mastery, ribbons, collections, daily bonus
- [ ] Farm expansions
- [ ] Vehicles and fuel
- [ ] Full crop list (about 30 crops), with level unlocks to about level 40 at first
- [ ] **Verify**: tests for each system; a playthrough from level 1 to 10 under the Speedrun preset

### Phase 6: Single-player social replacements (3–5 days)
- [ ] AI neighbors (generation, daily gifts, fertilize visits)
- [ ] Visiting AI farms (help actions)
- [ ] Solo co-op contracts
- [ ] **Verify**: simulated multi-day runs (time-scale) produce sane gift and contract flows

### Phase 7: Polish, PWA, ship (2–3.5 weeks)
- [ ] Farmer avatar and action queue, animations, particles, SFX and music, haptics
- [ ] Tutorial or first-time flow, tooltips
- [ ] PWA: manifest, icons, service worker (offline play), install prompt, iOS home-screen hint
- [ ] Real art pass (sprite atlas)
- [ ] Performance pass on a mid-range phone (atlases, culling, DPR cap, low-power mode)
- [ ] Hosting decision for a public or personal build (e.g. GitHub Pages, Netlify, itch.io)
- [ ] **Verify**: install to the home screen on Android and iOS; play offline; 22×22 full farm at target fps; saves survive app restarts and updates

### Phase 8: Co-op (future, 2–4 weeks)
- [ ] `WebSocketTransport` and a host server (Node, shares `core`), or WebRTC peer-to-peer
- [ ] Lobby: host or join by code, player list
- [ ] State sync (snapshot on join, then events and diffs), command validation on the host
- [ ] Visiting mode, then shared farm, then cross-farm co-op jobs
- [ ] **Verify**: a PC and a phone co-op on one farm; disconnect and rejoin recovers

### Phase 9: Optional desktop build (1–2 days)
- [ ] Electron or Tauri wrapper around the web build
- [ ] `FileSaveStore` (`%APPDATA%\HomesteadAcres\saves`, atomic temp+rename writes) behind `SaveStore`
- [ ] First-launch import of `.farm` exports; Windows installer
- [ ] **Verify**: install, import a browser save, play, and the save persists across reinstall

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope creep (FV1 had thousands of items) | Ship small item lists per phase; content is data, so it grows later cheaply |
| Iso depth-sorting bugs with multi-tile buildings | Sort by footprint "front" corner; write a debug overlay early |
| Browser deletes saves (iOS 7-day rule, storage pressure) | `storage.persist()`, home-screen install prompt, `.farm` export reminders, backups |
| Mobile tab killed mid-session | Save on `visibilitychange`/`pagehide`, timestamp-based timers |
| Touch gesture conflicts (pan vs. move vs. paint) | Single gesture layer with explicit modes; test on a real phone from Phase 2 |
| Mobile performance | Atlases, culling, DPR cap, and profiling a fully planted farm early in Phase 2, not only at the end |
| Save corruption | Transactional writes, backups, checksums, migrations tested |
| Co-op retrofit pain | Commands, `ownerId`, deterministic reducer, Transport seam from Phase 1 |
| Art bottleneck | Placeholder art throughout; the art pass is isolated in Phase 7 |

---

## 13. Decisions (change any of them)

- **Platform**: browser-first, PC + mobile, installable PWA. Desktop wrapper optional (Phase 9).
- **Phone orientation**: landscape only (rotate prompt in portrait). Adding portrait later costs a few days of layout work.
- **Engine**: Phaser 3 + Preact overlay.
- **Name and art**: original; no Zynga assets.
- **Offline progress**: on by default, with wall-clock timers (FV1 behavior), configurable per save.
- **Co-op approach**: host-authoritative WebSocket (WebRTC considered), deferred to Phase 8.
