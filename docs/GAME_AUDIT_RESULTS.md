Game audit implementation and verification — 2026-09-05

All findings in the [baseline audit](GAME_AUDIT.md) have been addressed. The original audit describes the code at commit `d2a94a6`; this document records the resulting behavior and validation.

| Finding | Resolution |
| --- | --- |
| HYPERTUNNEL collision tunneling | Sweep each obstacle across the player plane and interpolate the steering angle at the crossing; camera roll now uses actual delta time. |
| MONOSTACK resource growth | Dispose owned face materials on retry/falling-piece retirement, share edge material, and retire old tower blocks without losing logical score/height. |
| Cold EPHEMERIS topology hitch | Subdivision, edge construction, and displacement all advance through the geometry-job budget. Preparations share progress across bodies and survive cancellation. |
| Redundant terrain work | MERIDIAN caches static biome grids and resolves biome blending once per frame. OPEN HORIZON translates a snapped grid continuously and samples only new rows. Sea animation and biome crossfades remain live. |
| Repeated terminal death | VOID FIELD stops processing collisions once the final life is consumed. |
| Stuck standalone input | Shared input resets on blur, hidden documents, and canceled pointer/touch gestures. Keyboard autorepeat cannot trigger repeated drops/restarts. |
| Discarded job closures | Geometry jobs iterate their remaining work directly, charging preparation/sorting to the budget without regenerating closures for all outstanding slices. |
| Excessive draw calls | Batch city faces/edges by row, merge city/flock grids, and instance DRIFT rocks by geometry. Collision transforms remain independent of rendering. |
| Dead wrappers/API | Remove the unused engine barrel, scheduler, FOV camera wrappers, pause predicate, and unused ultra geometry. Keep shared ownership/flight helpers. |
| No-op effects and garbage | Remove MONOSTACK's ineffective pulse and MURMUR's unused scatter scalar. Reuse flight scratch objects, cache unchanged HUD text, throttle readouts, and move the beacon marker with a CSS transform. |
| Low-value/slow tests | Remove tests of dead APIs and exact tuning-constant assertions; aggregate exhaustive vertex/edge validation while retaining failure location and full coverage. |
| Missing orchestration coverage | Exercise shipped game loops, cancellation, retries, resource retirement, terrain streaming, instance/collision parity, DEEP FIELD transition reversal, EPHEMERIS warp/remount, and real stage pause-source composition. Redirect legacy EPHEMERIS; use explicit standalone HTML links that also work in Vite. |
| GPU-blind governor | Sample asynchronous WebGL2 GPU timer queries every ten frames when supported. The larger CPU/GPU workload drives existing hysteresis. Disjoint, stale, and paused samples are discarded; unsupported browsers retain CPU-only behavior. GPU cost appears separately in the stats overlay. |

Measured results on this workspace/browser (not universal FPS guarantees):

| Measurement | Before | After |
| --- | --- | --- |
| MERIDIAN static terrain samples, 60 frames | 253,500 terrain samples | 25,350 terrain samples; ship-ground sampling remains per-frame |
| OPEN HORIZON, 60 one-unit advances after initial grid | 206,700 terrain samples | 424 terrain samples; every resulting height matches the world-space function |
| Cold level-6 build scheduling | Topology alone blocked for median 21.49 ms | Enqueue 0.19 ms; topology plus full planet displacement completed over 24 updates, largest update 3.83 ms, total CPU work 73.83 ms |
| GRID CITY frozen scene draw calls | 136 | 30 |
| DRIFT frozen scene draw calls | 19 | 6 |
| MURMUR frozen scene draw calls | 37 | 5 |
| Icosphere test file | 4.22 s | 0.37 s in the full-suite verification |
| Full test suite | 346 tests, 6.03 s | 369 tests, 3.43 s |

The three batching comparisons used the same seeded game randomness and frozen camera/simulation state, comparing against `cc6105d` (before batching). Median render-submission/GPU time across 40 repeated draws was 1.10/2.58 → 0.50/2.19 ms for GRID CITY, 0.50/3.34 → 0.50/2.64 ms for DRIFT, and 0.40/2.99 → 0.40/2.54 ms for MURMUR. Coarser batch culling submits more offscreen primitives, so draw-call reduction is not assumed to equal an FPS improvement. GPU timings were checked separately and did not regress in these samples. The synthetic measurements do not include each game's full simulation cost.

The GPU stress fixture confirmed the missing signal: JavaScript remained below 0.1 ms while GPU samples exceeded 50 ms. Quality moved through levels 0 → 1 → 2 and DPR 1.5 → 1.25 → 1.0. After reducing shader work, it recovered to level 0/DPR 1.5. The normal DEEP FIELD scene also reported distinct JS/GPU timings without forcing a downgrade.

All eight standalone pages were opened directly in Chromium with demo play, screenshots, and browser-error checks. MONOSTACK maintained two geometries, two programs, and two material references across 60 reset/miss/cleanup cycles. The landing-page PLAY/ESC reversal and Projects → EPHEMERIS → Home navigation passed; returning home removed the EPHEMERIS debug handle and retained exactly one canvas. The legacy EPHEMERIS URL redirected with its query intact. Browser errors remained empty. A final full-suite rerun passed all 369 tests in 2.85 s, followed by a successful production build.

Validation commands:

- `npm test`: 369 tests passed across 30 files.
- `npm run build`: typecheck and production bundle passed. Vite still reports its existing size warning for the 521 kB minified Three.js vendor chunk; the engine pages remain lazy-loaded.
- `npx vite-node tests/engine/profile.ts`: reproducible cold topology/displacement scheduling measurement. Budgets are soft at the size of an individual bounded step; GC and hardware can increase individual updates.
- `git diff --check`: clean.

Browser verification uses the `agent-browser` CLI against `npm run dev -- --host 127.0.0.1`. [Arcade fixture](../tests/arcade/browser.html) URLs accept `?game=city&freeze` (and the other game names); `await measure()` returns render-submission/GPU medians. To compare a historical version, put its raw HTML into ignored `tests/arcade/.baseline/<game>.txt` and add `&baseline`. Random direction sampling is seeded independently of Three.js resource/UUID allocation. [GPU fixture](../tests/engine/browser.html) accepts `?iterations=4000`; `setWorkload(1)` tests recovery and `samples` records CPU/GPU/quality/DPR. These fixtures and debug handles are under `tests`, outside the production build.
