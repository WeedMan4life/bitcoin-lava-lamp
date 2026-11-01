# Bitcoin Wallpaper

A live visualization of your own mempool's "next block" via your
self-hosted Mempool instance on StartOS — one square per real
transaction, sized by vsize and colored by fee rate, laid out with the
same grid bin-packing algorithm as the real Mempool site. New
transactions insert into existing free space (Tetris-drop, grow, or
fade in — your choice); confirmed/evicted transactions free their
space for reuse. Currently at **v0.30** — the version number is shown
next to the title in the overlay, so you can always confirm which
build you're actually looking at before troubleshooting anything
(browser caching has been the cause of several false alarms in this
project's history).

## This is a real port, not an approximation

Earlier versions of this tried to approximate the look — first with
fabricated tile sizes from aggregate fee data, then with a squarified
treemap. Neither matched, because the real site does neither. Its
actual algorithm was fetched directly from
`github.com/mempool/mempool`, `frontend/src/app/components/block-overview-graph/`
(`block-overview-graph.component.ts` and `block-scene.ts`), and ported
faithfully:

1. **A grid, not a treemap.** The block is divided into a
   `GRID_RESOLUTION`-wide grid (64 columns by default). Row count
   (height) is **not** capped — it grows as needed, matching the real
   `BlockLayout.addRow()`.
2. **Transactions are squares, not rectangles.** Each transaction's
   side length (in grid cells) is `round(sqrt(1.1 * vsize / vbytesPerUnit))`.
3. **A fixed scale, computed once.** `vbytesPerUnit` is derived from a
   constant `FULL_BLOCK_VSIZE` (997,000 vbytes, one standard block) —
   *not* recalculated from current content on every update. Real
   transaction sizes vary enormously (a simple send is ~200 vbytes; a
   consolidation sweeping hundreds of UTXOs can be tens of thousands),
   so don't be surprised by a few large tiles among many small ones —
   that's genuine data, not a bug (verify by hovering one — the
   tooltip shows its real vsize).
4. **True incremental updates**, ported into `grid-layout.js`
   (`Slot`/`Row`/`BlockLayout`, including proper `remove()` with
   free-list merging). New transactions insert into existing free grid
   cells; removed transactions free exactly their own cells. Nothing
   ever gets globally rebuilt on a routine delta.
5. **A specific screen transform** — row index maps to X (decreasing
   from the right edge as more rows are needed), column index maps to
   Y (top to bottom). This is why the real site's blocks visibly fill
   in from the right, growing leftward. Row and column axes scale
   independently so tiles stretch to fill whatever the actual window
   shape is.

## Real per-transaction data — and the actual bug that took a while to find

There's no bulk endpoint for every mempool transaction (would be tens
of thousands of objects on a busy node). Instead, this uses the same
websocket subscription the real site itself uses:

```
{ "track-mempool-block": 0 }
```

This streams `added`/`removed`/`changed` deltas as the mempool changes.
Each entry shape was confirmed against a live node, not just docs:

- `added`: compact tuple `[txid, fee, vsize, value, rate, flags, time]`
- `changed`: **not** a full tuple — only `{txid, rate}`. Parsing it like
  `added` reads garbage into vsize/fee (an earlier real bug, now fixed).
- `removed`: plain txid strings.

**The real root cause of persistent under-counting** (tile count never
matching real mempool tx count, resetting to near-zero on every
reconnect): the very first message after subscribing — which is
supposed to carry the full initial snapshot — does **not** arrive
under `delta` or `added` at all. It arrives under a completely
different key:

```js
{ blockTransactions: [ [txid, fee, vsize, ...], ... ], index: 0, sequence: N }
```

This was invisible from the app's behavior alone — it just looked like
tile counts were "a bit low." It only became findable by dumping the
raw object to the console and reading it directly (see `data.js` for
the fix). Confirmed fixed: tracked count now matches real mempool tx
count exactly, both on fresh connect and across block transitions.

Two additional self-healing mechanisms, kept as permanent safety nets
now that this class of bug has bitten twice:

- **Drift detection** — block 0's tracked transactions can never
  legitimately exceed the whole mempool's total count. If they do,
  something's stuck; force a resync.
- **Stall detection** — if no delta has landed in 20+ seconds while the
  real mempool clearly doesn't match what's tracked, the subscription
  has likely gone quiet without any error to signal it; force a resync.

Both log to the console when they fire, so a recurrence is visible
rather than silent.

## Files

| File | Responsibility |
|---|---|
| `config.js` | All tunables, version string, color gradient |
| `data.js` | Websocket subscription, real per-transaction state, reconnect/drift/stall recovery, hashrate/tip-height fetching |
| `grid-layout.js` | Ported grid bin-packing algorithm with incremental insert/remove (`Slot`/`Row`/`BlockLayout`) |
| `cells.js` | Tile state: grid → screen transform, entry animations, easing |
| `renderer.js` | Canvas2D drawing: squares, grid gaps, block-found flash |
| `ui.js` | Stats overlay, settings panel, tooltip, color legend |
| `app.js` | Wires everything together, main loop |
| `serve.py` | Threaded static file server (handles simultaneous requests correctly -- see multi-monitor note below) |
| `start.bat` / `stop.bat` | Windows dedicated-monitor kiosk launcher |
| `start-server-only.bat` | Windows server-only launcher, for the Lively Wallpaper desktop background setup |
| `start.sh` / `stop.sh` | Linux/Raspberry Pi kiosk launcher, for a small screen on the node |

## Running it

`app.js` is an ES module, so opening `index.html` directly via `file://`
will be blocked by the browser. Serve the folder locally:

```bash
cd bitcoin-wallpaper
python serve.py 8080
```

(`serve.py` is a small threaded server included in this folder — see
the multi-monitor note further down for why it's used instead of the
bare `python -m http.server` command.)

Then open `http://localhost:8080`.

**If you don't see your changes after updating files**, this has come
up repeatedly: hard-refresh (Ctrl+Shift+R) isn't always enough. Most
reliable fix is serving from a fresh, unused port each time
(`python serve.py 8081`, then a new one next time). Check the
version number next to the title to confirm you're looking at the
build you think you are before troubleshooting anything else.

## Deployment options

Three different ways to actually run this somewhere, depending on what
you're picturing:

### A small screen plugged into your node (the main use case)

The common setup here is a Raspberry Pi (or similar small board) with
a small HDMI display, running a minimal kiosk browser — separate from
your StartOS box itself, just reachable over the same network.

1. Flash Raspberry Pi OS onto the Pi (Desktop edition is simplest for
   this — Lite works too but needs a bit more manual X11/autostart setup).
2. Copy the `bitcoin-wallpaper` folder onto the Pi.
3. Copy `config.local.example.js` to `config.local.js` and set
   `NODE_BASE_URL` to your StartOS Mempool instance's address, reachable
   from the Pi's network. (`config.local.js` is gitignored.)
4. Make the scripts executable and run the launcher:
   ```bash
   cd bitcoin-wallpaper
   chmod +x start.sh stop.sh
   ./start.sh
   ```
   This starts the server in the background and opens Chromium in true
   fullscreen kiosk mode (needs `chromium-browser` installed — usually
   preinstalled on Raspberry Pi OS, otherwise `sudo apt install chromium-browser`).
5. **To auto-launch on boot**: Raspberry Pi OS Desktop —
   `mkdir -p ~/.config/autostart` then create
   `~/.config/autostart/bitcoin-wallpaper.desktop` containing:
   ```ini
   [Desktop Entry]
   Type=Application
   Name=Bitcoin Wallpaper
   Exec=/full/path/to/bitcoin-wallpaper/start.sh
   ```
   (use the actual full path, not `~`). Reboot to test.
6. `./stop.sh` shuts the background server down when needed.

### Windows desktop wallpaper

Using [Lively Wallpaper](https://www.rocksdanister.com/lively/) (free,
open source, supports live websites as animated wallpapers):

1. Install Lively Wallpaper.
2. Double-click **`start-server-only.bat`** — starts the background
   server without opening any browser window.
3. In Lively: **Add Wallpaper → Website** → enter `http://localhost:8080`.
4. The lamp becomes your live desktop background.

Important: point Lively at the `http://localhost:8080` URL, not
directly at the `index.html` file — the app uses ES modules, which
browsers refuse to load from a raw local `file://` path, so it needs
to be served over real `http://` even for a wallpaper.

**Multiple monitors**: if one screen loads correctly but another shows
a broken/unstyled page (usually only right after boot), that's a real
race condition, not random flakiness — Lively can initialize more than
one monitor's webview at nearly the same instant, and Python's basic
built-in server only handles one request at a time, so a burst of
simultaneous requests for the page's files can get one of them dropped.
`serve.py` (used by all the launcher scripts here, not the bare
`python -m http.server` command) fixes this with a proper threaded
server — confirmed by firing 20 simultaneous requests at it and getting
20 clean responses back. A manual reload of the affected wallpaper also
works as a one-off fix if this crops up.

### Windows dedicated monitor (full kiosk)

For a spare monitor/TV connected to a Windows PC, showing nothing but
the lamp:

1. Copy the whole `bitcoin-wallpaper` folder to that computer (needs
   Python and Chrome installed).
2. Double-click **`start.bat`**. It starts the server in the background
   (a minimized window titled "BitcoinWallpaperServer") and opens Chrome
   in true fullscreen kiosk mode — no address bar, no tabs, nothing but
   the lamp.
3. Press **Alt+F4** to exit kiosk mode when you want to stop viewing it.
4. Run **`stop.bat`** to actually shut down the background server
   (closing Chrome alone doesn't stop it) — or just leave it running
   for next time and skip straight to `start.bat` again.

**To make it launch automatically on startup**: press `Win+R`, type
`shell:startup`, press Enter — that opens your Startup folder. Create a
shortcut to `start.bat` there. Windows will run it every time you log
in.

If `start chrome` doesn't launch Chrome (uncommon, but happens if
Chrome isn't registered the usual way), edit `start.bat` and replace
`chrome` with the full path to `chrome.exe`, typically
`"C:\Program Files\Google\Chrome\Application\chrome.exe"`.

## Configuration

Edit `config.js`, or use the in-app settings panel (gear icon, top
right) for these live:

- **Data source** — "My node" (your own `NODE_BASE_URL`, default) or
  "mempool.space" (the public API, for people without their own
  self-hosted node). Switching reloads the page to cleanly
  reinitialize the connection. Persisted via `localStorage` (this is a
  real deployed app, not a Claude artifact, so that's the normal,
  correct way to remember the choice across reloads).
- **Reflow speed** — how fast landed tiles ease into a new position/size
- **New tile animation** — Fall (Tetris-style drop) / **Slide** / Grow
  (scale up in place) / Fade (opacity in place). Clicking a button
  replays the current tiles with that style immediately.

**Slide is the real mempool.space entrance animation** — confirmed
directly from `block-scene.ts` (`setTxOnScreen`), not inferred: a new
transaction spawns offset by `canvasWidth * 1.4` in the flow direction
(fully off-screen) at its real final size, then eases smoothly to its
real grid position over ~1000ms. Fall/Grow/Fade were reasonable guesses
made before finding this; Slide is what the actual site does.

**Existing tiles also continuously reorganize**, not just new ones --
ported from the real `BlockLayout.applyGravity()`. After every update,
every already-placed tile is checked for whether space has opened up
closer to row 0 (the right edge on screen, given the transform) and
pulled into it if so. This runs regardless of which entry style is
selected, and is what produces the real site's constant subtle
reshuffling look -- confirmed by the person actually using this and
noticing our first Slide implementation looked static compared to the
real thing, which led to finding this. Stress-tested at 4,500 tiles
with realistic churn before shipping: ~5-54ms per update round, well
within the ~1s update cadence.

`GRID_RESOLUTION` and `CELL_GAP` were removed from the live settings
panel — changing resolution live forces a full grid rebuild, which
works against the whole point of the incremental-update stability fix
above. Both are still adjustable directly in `config.js` if needed.

Other things worth knowing about:

- `NODE_BASE_URL` — your StartOS Mempool instance (set it in
  `config.local.js`, copied from `config.local.example.js`)
- `FALL_SPEED` / `MAX_FALL_STAGGER` — the Tetris-style entrance animation
- `FULL_BLOCK_VSIZE` — the fixed scale reference (see above) and an
  absolute ceiling to sanity-clamp any single transaction's vsize
- `MAX_CELLS` — cap on newly-inserted tiles per batch (largest-by-vsize
  kept) for performance on very busy mempools
- `STALL_TIMEOUT_MS` — how long without a delta before forcing a resync
- `COLOR_STOPS` — the color gradient control points (also drives the
  legend bar's gradient directly, so they can never drift out of sync)

## Controls

- `o` — toggle the stats overlay, color legend, and gear icon together
- `f` — toggle fullscreen
- hover a square — see its real fee, vsize, and txid
- gear icon — live settings panel

## Troubleshooting

**Status stuck on "Reconnecting…"**
Open your node's address + `"/api/mempool"` directly in your browser first. If that
works but the app doesn't connect, check that your Mempool instance's
nginx config sends `Access-Control-Allow-Origin` and that the websocket
path (`/api/v1/ws`) isn't blocked by a reverse proxy in front of it.

**`.local` address won't resolve**
mDNS `.local` addresses only resolve on the same LAN as your StartOS box
(or over Tor, if that's how you reach it). Confirm the Mempool web UI
itself loads from the same browser first.

**"Mempool tx" and "tiles rendered" don't match**
Should now be rare and self-correcting within ~20s (see drift/stall
detection above). If it persists, check the console for a "resyncing"
or "no usable delta" log line and screenshot it.

**A few tiles look huge compared to the rest**
Very likely real — Bitcoin transaction sizes vary by 100x+ (see above).
Hover the tile to confirm its real vsize before assuming it's a bug.

**Colors look mostly one color**
Real quiet mempools can genuinely have a narrow fee-rate spread — this
was checked against the real site's own behavior on the same node and
confirmed to match, not a bug.
