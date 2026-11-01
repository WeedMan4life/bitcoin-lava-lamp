// ---------------------------------------------------------------------
// Ported from the real Mempool frontend's block-scene.ts (fetched
// directly from github.com/mempool/mempool). The real component does
// NOT use a treemap -- it uses a fixed-resolution grid and a row-based
// first-fit bin-packing algorithm, placing transactions as SQUARES
// (not arbitrary rectangles), largest/highest-fee first. This is a
// faithful translation of that Slot/Row/BlockLayout logic.
// ---------------------------------------------------------------------

class Slot {
    constructor(l, r) {
        this.l = l;
        this.r = r;
        this.w = r - l;
    }

    intersects(slot) {
        return !((slot.r <= this.l) || (slot.l >= this.r));
    }

    subtract(slot) {
        if (this.intersects(slot)) {
            if (slot.l > this.l && slot.r < this.r) {
                return [new Slot(this.l, slot.l), new Slot(slot.r, this.r)];
            } else if (slot.l <= this.l && slot.r >= this.r) {
                return [];
            } else if (slot.l <= this.l) {
                return slot.r === this.r ? [] : [new Slot(slot.r, this.r)];
            } else if (slot.r >= this.r) {
                return slot.l === this.l ? [] : [new Slot(this.l, slot.l)];
            }
        } else {
            return [this];
        }
    }
}

class TxSlot extends Slot {
    constructor(l, r, id) {
        super(l, r);
        this.id = id;
    }
}

class Row {
    constructor(y, width) {
        this.y = y;
        this.w = width;
        this.filled = [];
        this.slots = [new Slot(0, this.w)];
    }

    insert(x, w, id) {
        const newSlot = new TxSlot(x, x + w, id);
        let index = this.filled.findIndex((slot) => (slot.l >= newSlot.r));
        if (index < 0) index = this.filled.length;
        this.filled.splice(index || 0, 0, newSlot);

        for (let i = 0; i < this.slots.length; i++) {
            if (newSlot.intersects(this.slots[i])) {
                const diff = this.slots[i].subtract(newSlot);
                if (diff) {
                    this.slots.splice(i, 1, ...diff);
                    i += diff.length - 1;
                }
            }
        }
    }

    // Real (occupied) entries overlapping [l, r) in this row -- used by
    // applyGravity to test whether a row is genuinely clear before
    // letting something fall into it.
    getSlotsBetween(l, r) {
        return this.filled.filter(slot => !(slot.r <= l || slot.l >= r));
    }

    // Free the space held by a specific transaction id, merging the
    // freed range back into adjacent free slots (a standard free-list
    // merge) so future insertions can reuse the space efficiently.
    remove(id) {
        const idx = this.filled.findIndex(slot => slot.id === id);
        if (idx < 0) return;
        const freed = this.filled[idx];
        this.filled.splice(idx, 1);

        this.slots.push(new Slot(freed.l, freed.r));
        this.slots.sort((a, b) => a.l - b.l);
        const merged = [];
        for (const slot of this.slots) {
            const last = merged[merged.length - 1];
            if (last && last.r >= slot.l) {
                merged[merged.length - 1] = new Slot(last.l, Math.max(last.r, slot.r));
            } else {
                merged.push(slot);
            }
        }
        this.slots = merged;
    }
}

class BlockLayout {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.rows = [new Row(0, this.width)];
        this.placements = new Map(); // id -> {x, y, s}
    }

    addRow() {
        this.rows.push(new Row(this.rows.length, this.width));
    }

    insert(id, width) {
        const fit = this.fit(width);
        return this.placeAt(id, fit.x, fit.y, width);
    }

    // Insert at a SPECIFIC known position (not searched) -- used by
    // applyGravity, which has already determined exactly where a tile
    // should move to and must not have it land somewhere else via a
    // fresh best-fit search.
    placeAt(id, x, y, size) {
        for (let row = y; row < y + size; row++) {
            if (row >= this.rows.length) this.addRow();
            this.rows[row].insert(x, size, id);
        }
        const placement = { x, y, s: size };
        this.placements.set(id, placement);
        return placement;
    }

    // Free the grid cells held by id, so future inserts can reuse them.
    remove(id) {
        const placement = this.placements.get(id);
        if (!placement) return;
        for (let y = placement.y; y < placement.y + placement.s; y++) {
            if (this.rows[y]) this.rows[y].remove(id);
        }
        this.placements.delete(id);
    }

    // Ported from the real component's BlockLayout.applyGravity(): sweep
    // every currently-placed tile and pull it toward row 0 (the right
    // edge on screen, given our transform) if space has opened up below
    // it -- e.g. after removals free up room closer to the edge. This is
    // what produces the real site's constant subtle reorganizing look,
    // not just new tiles entering. Returns the ids that actually moved,
    // so the caller can update their stored grid position and let them
    // ease smoothly to the new spot.
    applyGravity() {
        const moved = [];
        const entries = [...this.placements.entries()].sort(
            ([, a], [, b]) => a.y - b.y || a.x - b.x
        );
        entries.forEach(([id, position]) => {
            let dropTo = position.y;
            while (
                dropTo > 0 &&
                this.rows[dropTo - 1].getSlotsBetween(position.x, position.x + position.s).length === 0
            ) {
                dropTo--;
            }
            if (dropTo < position.y) {
                this.remove(id);
                const newPos = this.placeAt(id, position.x, dropTo, position.s);
                moved.push({ id, position: newPos });
            }
        });
        return moved;
    }

    // Find the first slot large enough to hold a square of this size
    fit(width) {
        let fit;
        for (let y = 0; y < this.rows.length && !fit; y++) {
            fit = this.findFit(0, this.width, y, y, width);
        }
        if (!fit) fit = { x: 0, y: this.rows.length };
        return fit;
    }

    // recursively check rows to see if there's space (depth-first)
    findFit(left, right, row, start, size) {
        if ((row - start) >= size || row >= this.rows.length) {
            return { x: left, y: start };
        }
        for (const slot of this.rows[row].slots) {
            const l = Math.max(left, slot.l);
            const r = Math.min(right, slot.r);
            if (r - l >= size) {
                const fit = this.findFit(l, r, row + 1, start, size);
                if (fit) return fit;
            }
        }
    }
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

export function estimateTxSize(vsize, resolution, vbytesPerUnit) {
    const scale = Math.max(1, Math.round(Math.sqrt(1.1 * vsize / vbytesPerUnit)));
    return Math.min(resolution, Math.max(1, scale));
}

export function computeVbytesPerUnit(resolution, blockLimit) {
    return blockLimit / Math.pow(resolution / 1.05, 2);
}

export function createGridLayout(resolution, blockLimit) {
    const vbytesPerUnit = computeVbytesPerUnit(resolution, blockLimit);
    const blockLayout = new BlockLayout(resolution, resolution);

    function txSize(vsize) {
        return estimateTxSize(vsize, resolution, vbytesPerUnit);
    }

    // Full population, sorted highest-fee first (matches the real
    // component's setup()). Used only for the very first layout.
    function setup(items) {
        const sorted = [...items].sort((a, b) => b.feerate - a.feerate);
        sorted.forEach(item => {
            const size = txSize(item.vsize);
            blockLayout.insert(item.id, size);
        });
    }

    // Incremental insert: places one transaction into existing free
    // space without touching anything else already placed (matches the
    // real component's tryInsertByFee/placeBatch -- this is what keeps
    // the layout stable between updates instead of reshuffling
    // everything on every delta).
    function insertOne(id, vsize) {
        const size = txSize(vsize);
        return blockLayout.insert(id, size);
    }

    // Incremental remove: frees exactly the cells this id held, leaving
    // everything else untouched (matches removeBatch).
    function removeOne(id) {
        blockLayout.remove(id);
    }

    function getPlacement(id) {
        return blockLayout.placements.get(id);
    }

    function getRowCount() {
        return blockLayout.rows.length;
    }

    function applyGravity() {
        return blockLayout.applyGravity();
    }

    return { setup, insertOne, removeOne, applyGravity, getPlacement, getRowCount, txSize, resolution };
}
