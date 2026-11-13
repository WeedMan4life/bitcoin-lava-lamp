export const APP_VERSION = "v1.1.0";

export const CONFIG = {

    // Your StartOS Mempool instance base URL (no trailing slash). Used
    // when "My node" is the selected data source (default). See
    // getDataSource()/setDataSource() below for the public
    // mempool.space alternative, for people without their own node --
    // BASE_URL itself (used everywhere else in the app) is always the
    // currently EFFECTIVE url, computed just below from whichever
    // source is selected.
    //
    // Don't put your real address here. Either type it into the
    // settings panel (gear icon -> "My node address", remembered by
    // your browser), or set it in config.local.js (gitignored, see
    // config.local.example.js). Both override this placeholder.
    NODE_BASE_URL: "https://your-startos-mempool.local",

    BASE_URL: "", // set below, once NODE_BASE_URL exists to fall back to

    FALLBACK_POLL_MS: 10000,
    MIN_REFRESH_GAP_MS: 1000,

    // If no delta has landed for this long (and the real mempool
    // clearly doesn't match what's tracked), the subscription has
    // likely silently stalled -- force a resync. Found via a real
    // uncaught exception in the delta handler that left the sequence
    // number not advancing with no further error logged.
    STALL_TIMEOUT_MS: 20000,

    SHOW_OVERLAY: true,

    // Real mempool blocks can hold thousands of transactions; this caps
    // how many tiles render (largest-by-vsize kept), purely for render
    // performance -- not a data fabrication knob.
    // Real mempool blocks can hold thousands of transactions. This caps
    // how many tiles render (largest-by-vsize kept) purely as a safety
    // valve against extreme mempool sizes killing render performance --
    // it is NOT meant to trim normal activity. Keep this high: capping
    // it low (as a previous version did at 500) silently discards most
    // small transactions, which are exactly what creates the fine
    // mosaic texture -- what's left is a biased sample of only the
    // largest transactions, making the block look sparse and blocky.
    MAX_CELLS: 4000,

    // Grid resolution for the real block-layout algorithm (ported from
    // the actual Mempool frontend): the grid is RESOLUTION cells wide,
    // and each transaction occupies an NxN square of grid cells sized
    // by its vsize. Row count (height) is NOT capped at this -- it
    // grows as needed, matching the real component's BlockLayout.
    GRID_RESOLUTION: 64,

    // The standard virtual block size (vbytes). This is the FIXED
    // reference the real component uses to scale transaction sizes
    // (computed once, never recalculated from current content) -- that
    // stability is what keeps the layout from reshuffling on every
    // single data update. Also used as an absolute ceiling to
    // sanity-clamp any single transaction's vsize.
    FULL_BLOCK_VSIZE: 997000,

    // The block always fills the whole viewport (see app.js computeBlockRect)
    // with a small uniform margin on all sides -- not a square, not
    // user-adjustable, individual tiles stretch to match the screen's
    // aspect ratio.
    TREEMAP_MARGIN: 4,

    CELL_GAP: 2,
    CELL_RADIUS: 0,

    // How quickly cells ease toward their new position/size on each
    // data refresh (0-1, higher = snappier, lower = more fluid). Only
    // applies once a tile has landed -- see fall physics below for how
    // new tiles enter.
    EASE: 0.06,

    // New tiles drop in from above and fall straight down at a constant
    // speed, hard-stopping when they land -- no acceleration, no bounce.
    FALL_SPEED: 14,
    MAX_FALL_STAGGER: 300,

    // How new tiles enter: 'fall' (Tetris-style drop), 'grow' (scale up
    // in place), or 'fade' (fade in in place). Toggle in settings panel.
    ENTRY_STYLE: 'fall',

    // Block-found flash
    FLASH_DECAY: 0.92,

    // Subtle continuous per-tile size pulse so the mosaic feels alive
    // even between data refreshes (our data source only updates a
    // couple of times a second on largely-unchanged aggregate numbers,
    // so without this the whole thing can look frozen).
    BREATHE_AMOUNT: 0.045,
    BREATHE_SPEED: 0.0008
};

// Continuous color ramp, coldest (cheap) to hottest (expensive).
export const COLOR_STOPS = [
    { t: 0.00, rgb: [0.10, 0.30, 0.55] },   // blue
    { t: 0.28, rgb: [0.20, 0.42, 0.20] },   // dark green
    { t: 0.52, rgb: [0.45, 0.55, 0.16] },   // olive
    { t: 0.72, rgb: [0.72, 0.62, 0.18] },   // gold
    { t: 0.88, rgb: [0.85, 0.45, 0.15] },   // orange
    { t: 1.00, rgb: [0.85, 0.20, 0.18] }    // red
];

export function feeToColor(feerate, minLog, maxLog) {
    const logF = Math.log(feerate + 1);
    const span = Math.max(0.0001, maxLog - minLog);
    const t = clamp01((logF - minLog) / span);

    for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
        const a = COLOR_STOPS[i];
        const b = COLOR_STOPS[i + 1];
        if (t >= a.t && t <= b.t) {
            const localT = (t - a.t) / (b.t - a.t || 1);
            return [
                lerp(a.rgb[0], b.rgb[0], localT),
                lerp(a.rgb[1], b.rgb[1], localT),
                lerp(a.rgb[2], b.rgb[2], localT)
            ];
        }
    }
    return COLOR_STOPS[COLOR_STOPS.length - 1].rgb;
}

export function rgbToCss([r, g, b], alpha = 1) {
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ---------------------------------------------------------------------
// Data source: "node" (the user's own self-hosted instance) or
// "public" (mempool.space's public API, for people without their own
// node). This is a real deployed web app (served over http://, not a
// Claude artifact), so localStorage is the right, normal way to
// remember this choice across reloads -- no restriction against it
// here the way there would be inside an in-chat artifact.
// ---------------------------------------------------------------------

const DATA_SOURCE_KEY = "bitcoinWallpaperDataSource";
export const PUBLIC_BASE_URL = "https://mempool.space";

// With no explicit choice saved yet, default to the user's own node if
// one has been configured, otherwise to the public API -- so a
// first-time visitor sees a working lamp instead of "Reconnecting...".
export function getDataSource() {
    const fallback = hasNodeConfigured() ? "node" : "public";
    try {
        return localStorage.getItem(DATA_SOURCE_KEY) || fallback;
    } catch {
        return fallback;
    }
}

// Pass "" to forget the choice and go back to the automatic default.
export function setDataSource(source) {
    try {
        if (source) localStorage.setItem(DATA_SOURCE_KEY, source);
        else localStorage.removeItem(DATA_SOURCE_KEY);
    } catch {
        // localStorage unavailable (e.g. private browsing) -- the
        // toggle just won't persist across reloads, not fatal.
    }
}

// ---------------------------------------------------------------------
// Node address typed into the settings panel. Stored in this browser's
// localStorage only -- it never leaves the machine and is never part
// of the repo. This is what makes the app usable without editing any
// files (the hosted page and the Windows .exe both rely on it).
// ---------------------------------------------------------------------

const NODE_URL_KEY = "bitcoinWallpaperNodeUrl";
const NODE_URL_PLACEHOLDER = CONFIG.NODE_BASE_URL;

// Accepts only a plain http(s) address. Returns the cleaned-up URL
// (no trailing slash, query or fragment), or null if it isn't valid.
export function normalizeNodeUrl(input) {
    let url;
    try {
        url = new URL(String(input).trim());
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.origin + url.pathname.replace(/\/+$/, "");
}

export function getSavedNodeUrl() {
    try {
        return normalizeNodeUrl(localStorage.getItem(NODE_URL_KEY) || "") || "";
    } catch {
        return "";
    }
}

// Pass "" to forget the saved address.
export function setSavedNodeUrl(url) {
    try {
        if (url) localStorage.setItem(NODE_URL_KEY, url);
        else localStorage.removeItem(NODE_URL_KEY);
    } catch {
        // localStorage unavailable -- can't persist, not fatal.
    }
}

export function hasNodeConfigured() {
    return CONFIG.NODE_BASE_URL !== NODE_URL_PLACEHOLDER;
}

// Optional per-machine overrides (e.g. your real NODE_BASE_URL) from
// config.local.js, which is gitignored so it never ends up in the repo.
// Missing file is fine -- the defaults above are used.
try {
    const local = await import("./config.local.js");
    Object.assign(CONFIG, local.default);
} catch {
    // no config.local.js -- not fatal
}

// An address saved from the settings panel wins over config.local.js.
const savedNodeUrl = getSavedNodeUrl();
if (savedNodeUrl) CONFIG.NODE_BASE_URL = savedNodeUrl;

CONFIG.BASE_URL = getDataSource() === "public" ? PUBLIC_BASE_URL : CONFIG.NODE_BASE_URL;
