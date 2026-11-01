import { CONFIG, rgbToCss } from "./config.js";

export function createRenderer(canvas) {
    const ctx = canvas.getContext("2d");

    function resize(w, h) {
        // no-op: canvas backing store sized by caller (app.js), context
        // needs no extra setup beyond what fillRect etc. already handle
    }

    function render({ width, height, cells, flash, blockRect, t }) {
        // Background: dark navy behind everything, slightly darker still
        // in the empty margin outside the block square (echoes the reference
        // layout's dark left gutter).
        ctx.fillStyle = "#0a0e14";
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "#0d1420";
        ctx.fillRect(blockRect.x, blockRect.y, blockRect.w, blockRect.h);

        cells.forEach(cell => {
            if (cell.w < 1 || cell.h < 1) return;

            // Subtle continuous size pulse, unique phase per tile, scaled
            // around the tile's own center so it doesn't nudge neighbors.
            const breathe = 1 + CONFIG.BREATHE_AMOUNT * Math.sin(t * CONFIG.BREATHE_SPEED + cell.phase);
            const bw = cell.w * breathe;
            const bh = cell.h * breathe;
            const bx = cell.x + (cell.w - bw) / 2;
            const by = cell.y + (cell.h - bh) / 2;

            const gap = CONFIG.CELL_GAP;
            const x = bx + gap / 2;
            const y = by + gap / 2;
            const w = Math.max(0, bw - gap);
            const h = Math.max(0, bh - gap);
            if (w <= 0 || h <= 0) return;

            ctx.fillStyle = rgbToCss(cell.color, cell.opacity ?? 1);
            roundRect(ctx, x, y, w, h, Math.min(CONFIG.CELL_RADIUS, w / 2, h / 2));
            ctx.fill();

            if (w > 6 && h > 6 && (cell.opacity ?? 1) > 0.5) {
                ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
                ctx.lineWidth = 1;
                roundRect(ctx, x, y, w, h, Math.min(CONFIG.CELL_RADIUS, w / 2, h / 2));
                ctx.stroke();
            }
        });

        // Block-found flash
        if (flash > 0.01) {
            ctx.fillStyle = `rgba(255, 210, 140, ${flash * 0.22})`;
            ctx.fillRect(blockRect.x, blockRect.y, blockRect.w, blockRect.h);
        }
    }

    function roundRect(c, x, y, w, h, r) {
        r = Math.max(0, r);
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }

    return { resize, render };
}
