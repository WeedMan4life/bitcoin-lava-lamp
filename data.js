import { CONFIG } from "./config.js";

// ---------------------------------------------------------------------
// Data layer
//
// GET /api/mempool gives overall stats (count, vsize, total_fee) --
// these come straight from bitcoind's own getmempoolinfo, used for the
// header stats only.
//
// For the treemap itself, this uses real individual transaction data
// via the websocket's "track-mempool-block" subscription -- the same
// mechanism the actual Mempool site uses. Mempool Goggles turns out to
// just be a filter menu layered on the single "next block" square (the
// first entry in the projected-blocks row) -- not a multi-block view.
// So this tracks only index 0:
//
//   { "track-mempool-block": 0 }
//
// which returns a message shaped like:
//
//   {
//     "projected-block-transactions": {
//       index: 0,
//       sequence: 11799,
//       delta: { added: [...], removed: [...], changed: [...] }
//     }
//   }
//
// Each entry in added/changed is a compact tuple, not a named object:
//
//   [txid, fee, vsize, value, rate, flags, time]
//
// (confirmed by checking fee/vsize against the listed rate across
// multiple real entries from a live node). removed entries are plain
// txids. This gives real per-transaction vsize/fee data -- no
// fabrication needed for the treemap tile sizes.
// ---------------------------------------------------------------------

// Everything arriving over the websocket is untrusted input -- even from
// your own node, and certainly from a public one. Validate the shape
// and coerce every numeric field to a real number here, at the edge,
// so nothing downstream (layout maths, the tooltip) ever handles a
// string or object where it expects a number. Returns null for
// anything malformed; callers skip those entries.
function parseCompactTx(t) {
    if (!Array.isArray(t) || typeof t[0] !== "string" || t[0].length === 0) return null;
    const fee = Number(t[1]);
    const vsize = Number(t[2]);
    const value = Number(t[3]);
    let rate = Number(t[4]);
    if (!Number.isFinite(fee) || !Number.isFinite(vsize) || vsize <= 0) return null;
    if (!Number.isFinite(rate)) rate = fee / vsize;
    return { txid: t[0], fee, vsize, value: Number.isFinite(value) ? value : 0, rate };
}

// "changed" entries are NOT full tuples like "added" -- they only carry
// an updated effective fee rate (the real component's own type is
// { txid, rate, acc }, confirmed by inspecting the actual frontend
// source). Parsing them as if they were full added-shaped tuples reads
// garbage into vsize/fee, which is exactly what was causing a couple of
// transactions to blow up into huge, layout-breaking squares.
function parseChangedTx(t) {
    if (!t || typeof t !== "object") return null;
    const txid = Array.isArray(t) ? t[0] : t.txid;
    const rate = Number(Array.isArray(t) ? t[1] : t.rate);
    if (typeof txid !== "string" || !Number.isFinite(rate)) return null;
    return { txid, rate };
}

export function createDataLayer({ onMempoolUpdate, onBlockFound, onStatus, onBlockTxUpdate, onTipHeight, onHashrate }) {
    const base = CONFIG.BASE_URL.replace(/\/+$/, "");
    const wsUrl = base.replace(/^http/, "ws") + "/api/v1/ws";

    let ws = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let lastRefresh = 0;
    let fallbackTimer = null;
    let destroyed = false;

    const txState = new Map(); // txid -> {fee, vsize, value, rate}
    let lastDeltaTime = 0;
    let lastSubscribeTime = 0;

    function subscribeToBlock0() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ "track-mempool-block": 0 }));
            lastSubscribeTime = Date.now();
        }
    }

    function resync(reason) {
        console.log(`[${new Date().toLocaleTimeString()}] Bitcoin Wallpaper: resyncing (${reason})`);
        txState.clear();
        onBlockTxUpdate(txState);
        subscribeToBlock0();
    }

    async function refreshMempool(force = false) {
        const now = Date.now();
        if (!force && now - lastRefresh < CONFIG.MIN_REFRESH_GAP_MS) return;
        lastRefresh = now;

        try {
            const [mempoolRes, feesRes] = await Promise.all([
                fetch(base + "/api/mempool"),
                fetch(base + "/api/v1/fees/recommended")
            ]);
            if (!mempoolRes.ok || !feesRes.ok) throw new Error("HTTP error from node");

            const mempool = await mempoolRes.json();
            const fees = await feesRes.json();

            // Sanity check against ground truth: the transactions tracked
            // for block 0 can never legitimately exceed the WHOLE
            // mempool's transaction count (block 0 is a subset of it).
            // If it does, that's proof stale transactions from a
            // previous block are stuck and never got removed.
            if (txState.size > mempool.count && mempool.count > 0) {
                resync(`tracked ${txState.size} > real mempool total ${mempool.count}`);
            } else if (
                // Staleness check: if no delta has landed in a while
                // despite the real mempool clearly being active (has
                // transactions, and the whole thing fits in one block so
                // tracked SHOULD closely match total), the subscription
                // has likely silently stalled -- this is what actually
                // happened here: an uncaught exception in one delta
                // handler appears to have left the stream not advancing
                // (sequence numbers stopped climbing) with no error after
                // that point, so nothing else would have caught it.
                lastSubscribeTime > 0 &&
                now - lastSubscribeTime > CONFIG.STALL_TIMEOUT_MS &&
                now - lastDeltaTime > CONFIG.STALL_TIMEOUT_MS &&
                mempool.count > 0 &&
                mempool.vsize < CONFIG.FULL_BLOCK_VSIZE &&
                Math.abs(txState.size - mempool.count) > Math.max(5, mempool.count * 0.1)
            ) {
                resync(`no delta in ${Math.round((now - lastDeltaTime) / 1000)}s, tracked ${txState.size} vs real ${mempool.count}`);
            }

            onMempoolUpdate(mempool, fees);
        } catch (err) {
            console.warn("Bitcoin Wallpaper: REST refresh failed —", err.message);
        }
    }

    async function refreshTipHeight() {
        try {
            const res = await fetch(base + "/api/blocks/tip/height");
            if (!res.ok) throw new Error("HTTP error from node");
            const height = parseInt(await res.text(), 10);
            if (!isNaN(height)) onTipHeight(height);
        } catch (err) {
            console.warn("Bitcoin Wallpaper: tip height fetch failed —", err.message);
        }
    }

    async function refreshHashrate() {
        try {
            const res = await fetch(base + "/api/v1/mining/hashrate/3d");
            if (!res.ok) throw new Error("HTTP error from node");
            const data = await res.json();
            if (data && typeof data.currentHashrate === "number") onHashrate(data.currentHashrate);
        } catch (err) {
            console.warn("Bitcoin Wallpaper: hashrate fetch failed —", err.message);
        }
    }

    function applyDelta(pbt) {
        const sequence = pbt.sequence;

        // The initial full snapshot after subscribing arrives under
        // "blockTransactions" -- a flat array of compact tuples (the
        // same 7-element shape as "added" entries), NOT wrapped in
        // "delta" and NOT named "added". Confirmed directly from a live
        // node's console: { blockTransactions: [Array(7), ...], index,
        // sequence } with no delta key present at all. This was the
        // real cause of every reconnect losing the whole starting
        // baseline and only ever accumulating small deltas from zero.
        if (Array.isArray(pbt.blockTransactions)) {
            pbt.blockTransactions.forEach(t => {
                const tx = parseCompactTx(t);
                if (tx) txState.set(tx.txid, tx);
            });
            lastDeltaTime = Date.now();
            console.log(`[${new Date().toLocaleTimeString()}] seq=${sequence} FULL SNAPSHOT: ${pbt.blockTransactions.length} transactions => tracked ${txState.size}`);
            onBlockTxUpdate(txState);
            return;
        }

        let delta = pbt.delta;

        if (!delta) {
            // Fallback: treat the object itself as the delta if it has
            // added/removed/changed directly on it.
            if (pbt.added || pbt.removed || pbt.changed) {
                delta = pbt;
            } else {
                console.warn(`[${new Date().toLocaleTimeString()}] Bitcoin Wallpaper: projected-block-transactions message has no usable delta (seq=${sequence}) — full raw object:`, pbt);
                return;
            }
        }

        lastDeltaTime = Date.now();
        const before = txState.size;

        (delta.added || []).forEach(t => {
            const tx = parseCompactTx(t);
            if (tx) txState.set(tx.txid, tx);
        });
        (delta.changed || []).forEach(t => {
            const update = parseChangedTx(t);
            if (!update) return;
            const existing = txState.get(update.txid);
            if (existing) {
                existing.rate = update.rate;
            }
            // If we don't already have this tx (shouldn't normally
            // happen), there's no vsize/fee to size it with -- skip
            // rather than fabricate a tile from an incomplete update.
        });
        (delta.removed || []).forEach(entry => {
            const txid = Array.isArray(entry) ? entry[0] : entry;
            txState.delete(txid);
        });

        console.log(`[${new Date().toLocaleTimeString()}] seq=${sequence} +${(delta.added || []).length} ~${(delta.changed || []).length} -${(delta.removed || []).length} => tracked ${before} -> ${txState.size}`);

        onBlockTxUpdate(txState);
    }

    function scheduleReconnect() {
        if (destroyed) return;
        reconnectAttempts++;
        const delay = Math.min(15000, 1000 * 2 ** (reconnectAttempts - 1));
        onStatus(false);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, delay);
    }

    function connect() {
        if (destroyed) return;
        try {
            ws = new WebSocket(wsUrl);
        } catch (err) {
            scheduleReconnect();
            return;
        }

        ws.addEventListener("open", () => {
            console.log(`[${new Date().toLocaleTimeString()}] Bitcoin Wallpaper: WS connected (attempt was #${reconnectAttempts}), resetting tracked state`);
            reconnectAttempts = 0;
            onStatus(true);
            txState.clear();
            lastDeltaTime = 0;
            ws.send(JSON.stringify({ action: "want", data: ["blocks", "mempool-blocks"] }));
            subscribeToBlock0();
            refreshMempool(true);
            refreshTipHeight();
            refreshHashrate();
        });

        ws.addEventListener("message", (evt) => {
            let msg;
            try {
                msg = JSON.parse(evt.data);
            } catch {
                return;
            }

            if (msg.block) {
                onBlockFound(msg.block);
                refreshMempool(true);
                refreshTipHeight();
                refreshHashrate();
                // Don't clear tracked state or resubscribe here. The
                // existing "track-mempool-block: 0" subscription keeps
                // streaming deltas right through a block being found --
                // transactions that got confirmed arrive as "removed",
                // and transactions promoted from the backlog (what used
                // to be block 1) arrive as "added". Forcing a manual
                // clear+resubscribe created an artificial empty gap that
                // doesn't match the real site (which never blanks out --
                // a fresh "next block" right after one is found already
                // contains whatever backlog didn't fit in the mined one).
                return;
            }

            if (msg["mempool-blocks"]) {
                refreshMempool(false);
            }

            if (msg["projected-block-transactions"] && msg["projected-block-transactions"].index === 0) {
                applyDelta(msg["projected-block-transactions"]);
            }
        });

        ws.addEventListener("close", (evt) => {
            console.log(`[${new Date().toLocaleTimeString()}] Bitcoin Wallpaper: WS closed, code=${evt.code} reason="${evt.reason}", tracked size was ${txState.size}`);
            scheduleReconnect();
        });
        ws.addEventListener("error", () => {
            try { ws.close(); } catch {}
        });
    }

    function startFallbackPoll() {
        fallbackTimer = setInterval(() => refreshMempool(false), CONFIG.FALLBACK_POLL_MS);
    }

    function start() {
        connect();
        startFallbackPoll();
    }

    function destroy() {
        destroyed = true;
        clearTimeout(reconnectTimer);
        clearInterval(fallbackTimer);
        if (ws) ws.close();
    }

    return { start, destroy, refreshMempool };
}
