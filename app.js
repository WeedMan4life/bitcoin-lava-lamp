import { CONFIG } from "./config.js";
import { createDataLayer } from "./data.js";
import { createCellField } from "./cells.js";
import { createRenderer } from "./renderer.js";
import { initUI } from "./ui.js";

const canvas = document.getElementById("canvas");
const dpr = Math.min(window.devicePixelRatio || 1, 2);

let width = 0, height = 0, blockRect = null;

const cellField = createCellField();
const renderer = createRenderer(canvas);
const ui = initUI({
    onSettingChange: (key) => {
        if (key === "ENTRY_STYLE") {
            cellField.replayEntry();
        } else {
            resize();
        }
    }
});

// The block always fills the whole screen, with a small uniform margin
// on all four sides -- no ratio/slider needed, and no risk of the
// asymmetry a right-aligned-with-half-margin calculation was producing.
function computeBlockRect(w, h) {
    const margin = CONFIG.TREEMAP_MARGIN * dpr;
    return {
        x: margin,
        y: margin,
        w: w - margin * 2,
        h: h - margin * 2
    };
}

function resize() {
    width = canvas.width = Math.round(window.innerWidth * dpr);
    height = canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    blockRect = computeBlockRect(width, height);
    cellField.resize(blockRect.x, blockRect.y, blockRect.w, blockRect.h);
    renderer.resize(width, height);
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------------
// Data wiring
// ---------------------------------------------------------------------

const data = createDataLayer({
    onStatus: (connected) => ui.updateStatus(connected),

    onMempoolUpdate: (mempool, fees) => {
        ui.updateStats({
            count: mempool.count,
            vsizeMb: mempool.vsize / 1_000_000,
            nextFee: fees.halfHourFee
        });
    },

    onBlockTxUpdate: (txMap) => {
        cellField.applyTxs(txMap);
    },

    onTipHeight: (height) => {
        ui.updateBlockHeight(height);
    },

    onHashrate: (hashrate) => {
        ui.updateHashrate(hashrate);
    },

    onBlockFound: () => {
        cellField.triggerFlash();
    }
});

data.start();

// ---------------------------------------------------------------------
// Pointer interaction (tooltip)
// ---------------------------------------------------------------------

canvas.addEventListener("mousemove", (e) => {
    const px = e.clientX * dpr;
    const py = e.clientY * dpr;
    const hit = cellField.hitTest(px, py);
    if (hit) {
        ui.showTooltip(hit, e.clientX, e.clientY);
    } else {
        ui.hideTooltip();
    }
});

canvas.addEventListener("mouseleave", () => ui.hideTooltip());

// ---------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------

document.addEventListener("keydown", (e) => {
    if (e.key === "o") ui.toggleOverlay();
    if (e.key === "f") {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
});

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------

function frame(t) {
    cellField.update();

    const cells = cellField.getCells();
    ui.updateTileCount(cells.size);

    renderer.render({
        width,
        height,
        cells,
        flash: cellField.getFlash(),
        blockRect,
        t
    });

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
