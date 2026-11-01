import { CONFIG, feeToColor } from "./config.js";
import { createGridLayout } from "./grid-layout.js";

export function createCellField() {
    let cells = new Map();   // txid -> { id, x,y,w,h, targetX/Y/W/H, gridPos:{x,y,s}, color, feerate, vsize, fee, falling, phase, opacity }
    let rect = { x: 0, y: 0, w: 0, h: 0 };
    let flash = 0;
    let knownTxids = new Set();
    let gridLayout = null;
    let builtResolution = null;
    let alternateCounter = 0; // for ENTRY_STYLE 'alternate' -- a deliberate ABAB sequence, not random

    // The real component keeps a STABLE vbytesPerUnit (computed once
    // from a fixed blockLimit) and does true incremental insert/remove
    // -- not a full rebuild from current content on every delta. That
    // instability (recomputing scale from a constantly-changing total,
    // combined with a full rebuild each time) was the actual cause of
    // wildly inconsistent tile counts between updates. Row height is
    // NOT capped at resolution either -- the real BlockLayout just adds
    // more rows as needed, so nothing needs to be dropped for overflow.
    function ensureGridLayout() {
        if (!gridLayout || builtResolution !== CONFIG.GRID_RESOLUTION) {
            gridLayout = createGridLayout(CONFIG.GRID_RESOLUTION, CONFIG.FULL_BLOCK_VSIZE);
            builtResolution = CONFIG.GRID_RESOLUTION;
            knownTxids = new Set();
            cells.clear();
        }
        return gridLayout;
    }

    function resize(x, y, w, h) {
        rect = { x, y, w, h };
        reprojectAll();
    }

    // Row index -> X (decreasing from the right edge), column index -> Y
    // (top to bottom). Row-axis scale depends on the ACTUAL current row
    // count (which grows as needed, uncapped), not a fixed assumption,
    // so the grid always fits the screen regardless of how many rows it
    // currently needs.
    function gridToScreen(pos, gridSizeRow, gridSizeCol, padding) {
        const slotW = pos.s * gridSizeRow;
        const slotH = pos.s * gridSizeCol;
        const screenX = rect.w - (pos.y * gridSizeRow) - slotW;
        const screenY = pos.x * gridSizeCol;

        return {
            x: rect.x + screenX + padding,
            y: rect.y + screenY + padding,
            w: slotW - padding * 2,
            h: slotH - padding * 2
        };
    }

    function currentScale() {
        const layout = ensureGridLayout();
        const rowCount = Math.max(layout.resolution, layout.getRowCount());
        const gridSizeRow = rect.w / rowCount;
        const gridSizeCol = rect.h / layout.resolution;
        const padding = Math.max(1, Math.floor(Math.min(gridSizeRow, gridSizeCol) / 5));
        return { gridSizeRow, gridSizeCol, padding };
    }

    // Recompute every known cell's screen target from its stored grid
    // position -- needed on resize, or after the row count changes
    // (since row-axis scale depends on total rows in use).
    function reprojectAll() {
        if (rect.w <= 0 || rect.h <= 0) return;
        const { gridSizeRow, gridSizeCol, padding } = currentScale();
        cells.forEach(cell => {
            if (!cell.gridPos) return;
            const screen = gridToScreen(cell.gridPos, gridSizeRow, gridSizeCol, padding);
            cell.targetX = screen.x;
            cell.targetY = screen.y;
            cell.targetW = screen.w;
            cell.targetH = screen.h;
        });
    }

    function createEntryCell(txid, screen, gridPos) {
        const base = { id: txid, phase: Math.random() * Math.PI * 2, gridPos };

        let style = CONFIG.ENTRY_STYLE;
        if (style === 'alternate') {
            // A deliberate ABAB sequence by entry order, not random --
            // every other new tile alternates between the real Slide
            // animation and the Tetris-style Fall.
            style = (alternateCounter % 2 === 0) ? 'slide' : 'fall';
            alternateCounter++;
        }

        if (style === 'grow') {
            return {
                ...base,
                x: screen.x + screen.w / 2, y: screen.y + screen.h / 2,
                w: 0, h: 0,
                falling: false,
                opacity: 1
            };
        }

        if (style === 'slide') {
            // The real mempool.space entrance animation, confirmed
            // directly from block-scene.ts (setTxOnScreen): a new tx
            // spawns offset by canvas-width * 1.4 in the flow direction
            // (off-screen, well clear of the visible area) at its real
            // final size, then eases smoothly to its real position --
            // not a fall, not a grow-from-nothing.
            return {
                ...base,
                x: screen.x + rect.w * 1.4, y: screen.y,
                w: screen.w, h: screen.h,
                falling: false,
                opacity: 1
            };
        }

        // 'fall' (default): spawn above the block at full target size and
        // fall straight down at constant speed -- no acceleration, no
        // bounce, hard stop on landing.
        return {
            ...base,
            x: screen.x,
            y: rect.y - screen.h - Math.random() * CONFIG.MAX_FALL_STAGGER,
            w: screen.w, h: screen.h,
            falling: true,
            opacity: 1
        };
    }

    // Recreate every current tile's visual entry state using the
    // CURRENT entry style, reusing each tile's existing grid position
    // (no grid operations, purely visual) -- gives immediate feedback
    // when the style toggle is clicked, instead of only showing up
    // whenever new transactions happen to arrive next.
    function replayEntry() {
        const { gridSizeRow, gridSizeCol, padding } = currentScale();
        cells.forEach((oldCell, txid) => {
            const gridPos = oldCell.gridPos;
            if (!gridPos) return;
            const screen = gridToScreen(gridPos, gridSizeRow, gridSizeCol, padding);
            const fresh = createEntryCell(txid, screen, gridPos);
            fresh.color = oldCell.color;
            fresh.feerate = oldCell.feerate;
            fresh.vsize = oldCell.vsize;
            fresh.fee = oldCell.fee;
            fresh.targetX = screen.x;
            fresh.targetY = screen.y;
            fresh.targetW = screen.w;
            fresh.targetH = screen.h;
            cells.set(txid, fresh);
        });
    }

    function applyTxs(txMap) {
        const layout = ensureGridLayout();
        if (rect.w <= 0 || rect.h <= 0) return;

        const newTxids = new Set(txMap.keys());

        // Removed: known before, absent now -- free their grid cells.
        knownTxids.forEach(txid => {
            if (!newTxids.has(txid)) {
                layout.removeOne(txid);
                const cell = cells.get(txid);
                if (cell) { cell.targetW = 0; cell.targetH = 0; }
                cells.delete(txid);
            }
        });

        // Added: present now, not known before -- insert into existing
        // free space without disturbing anything already placed.
        let toInsert = [];
        newTxids.forEach(txid => {
            if (!knownTxids.has(txid)) toInsert.push(txMap.get(txid));
        });
        if (toInsert.length > CONFIG.MAX_CELLS) {
            toInsert = [...toInsert].sort((a, b) => b.vsize - a.vsize).slice(0, CONFIG.MAX_CELLS);
        }
        toInsert.sort((a, b) => b.rate - a.rate); // highest fee first, matches real ordering

        const { gridSizeRow, gridSizeCol, padding } = currentScale();

        toInsert.forEach(t => {
            const vsize = Math.min(t.vsize, CONFIG.FULL_BLOCK_VSIZE);
            const gridPos = layout.insertOne(t.txid, vsize);
            const screen = gridToScreen(gridPos, gridSizeRow, gridSizeCol, padding);
            cells.set(t.txid, createEntryCell(t.txid, screen, gridPos));
        });

        knownTxids = newTxids;

        // Ported gravity pass: pull already-placed tiles toward row 0
        // (the right edge on screen) wherever removals opened up space
        // closer to it. This is what makes existing tiles continuously
        // reorganize on the real site, not just newly-arriving ones.
        const moved = layout.applyGravity();
        moved.forEach(({ id, position }) => {
            const cell = cells.get(id);
            if (cell) cell.gridPos = position;
        });

        // Row count may have grown from the inserts above -- rescale
        // everything currently placed to fit (a cheap screen-position
        // recompute, not a grid rebuild).
        reprojectAll();

        // Refresh color/metadata for every currently active transaction.
        const allActive = [...txMap.values()];
        if (allActive.length > 0) {
            const rates = allActive.map(t => Math.log(t.rate + 1));
            const minLog = Math.min(...rates);
            const maxLog = Math.max(...rates);
            allActive.forEach(t => {
                const cell = cells.get(t.txid);
                if (!cell) return;
                cell.color = feeToColor(t.rate, minLog, maxLog);
                cell.feerate = t.rate;
                cell.vsize = t.vsize;
                cell.fee = t.fee;
            });
        }
    }

    function triggerFlash() {
        flash = 1.0;
    }

    function update() {
        flash *= CONFIG.FLASH_DECAY;
        const toDelete = [];

        cells.forEach((cell, id) => {
            if (cell.falling) {
                cell.y += CONFIG.FALL_SPEED;
                const landedY = cell.targetY ?? cell.y;
                if (cell.y >= landedY) {
                    cell.y = landedY;
                    cell.falling = false;
                }
                cell.x += ((cell.targetX ?? cell.x) - cell.x) * CONFIG.EASE;
                cell.w += ((cell.targetW ?? cell.w) - cell.w) * CONFIG.EASE;
                cell.h += ((cell.targetH ?? cell.h) - cell.h) * CONFIG.EASE;
            } else {
                cell.x += ((cell.targetX ?? cell.x) - cell.x) * CONFIG.EASE;
                cell.y += ((cell.targetY ?? cell.y) - cell.y) * CONFIG.EASE;
                cell.w += ((cell.targetW ?? cell.w) - cell.w) * CONFIG.EASE;
                cell.h += ((cell.targetH ?? cell.h) - cell.h) * CONFIG.EASE;
            }

            if (cell.targetW === 0 && cell.w < 0.5) toDelete.push(id);
        });

        toDelete.forEach(id => cells.delete(id));
    }

    function hitTest(px, py) {
        for (const cell of cells.values()) {
            if (px >= cell.x && px <= cell.x + cell.w && py >= cell.y && py <= cell.y + cell.h) {
                return cell;
            }
        }
        return null;
    }

    return {
        resize,
        applyTxs,
        replayEntry,
        triggerFlash,
        update,
        hitTest,
        getCells: () => cells,
        getFlash: () => flash
    };
}
