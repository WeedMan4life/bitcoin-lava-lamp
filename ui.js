import { CONFIG, APP_VERSION, getDataSource, setDataSource } from "./config.js";

export function initUI({ onSettingChange }) {
    const overlay = document.getElementById("overlay");
    const statusDot = document.getElementById("statusDot");
    const statusText = document.getElementById("statusText");
    const blockHeightEl = document.getElementById("blockHeight");
    const txCountEl = document.getElementById("txCount");
    const tileCountEl = document.getElementById("tileCount");
    const vsizeEl = document.getElementById("vsize");
    const nextFeeEl = document.getElementById("nextFee");
    const hashrateEl = document.getElementById("hashrate");
    const updatedEl = document.getElementById("updated");
    const tooltip = document.getElementById("tooltip");
    const settingsPanel = document.getElementById("settingsPanel");
    const settingsToggle = document.getElementById("settingsToggle");
    const legend = document.getElementById("legend");
    const bigBlockNumber = document.getElementById("bigBlockNumber");

    if (!CONFIG.SHOW_OVERLAY) overlay.classList.add("hidden");

    const versionEl = document.getElementById("appVersion");
    if (versionEl) versionEl.textContent = APP_VERSION;

    settingsToggle.addEventListener("click", () => {
        settingsPanel.classList.toggle("hidden");
    });

    // Data source: the user's own self-hosted node, or the public
    // mempool.space API for people without one. Switching reloads the
    // page -- simplest, safest way to fully reinitialize the websocket
    // connection and all tracked state against the new source, rather
    // than trying to live-swap everything in place.
    const dataSourceRow = document.createElement("div");
    dataSourceRow.className = "settingRow";
    const dataSourceLabel = document.createElement("label");
    dataSourceLabel.textContent = "Data source";
    dataSourceRow.appendChild(dataSourceLabel);

    const dataSourceGroup = document.createElement("div");
    dataSourceGroup.className = "toggleGroup";
    const dataSourceOptions = [
        { value: "node", label: "My node" },
        { value: "public", label: "mempool.space" }
    ];
    dataSourceOptions.forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = opt.label;
        btn.className = "toggleBtn";
        btn.classList.toggle("active", getDataSource() === opt.value);
        btn.addEventListener("click", () => {
            if (getDataSource() === opt.value) return;
            setDataSource(opt.value);
            location.reload();
        });
        dataSourceGroup.appendChild(btn);
    });
    dataSourceRow.appendChild(dataSourceGroup);
    settingsPanel.appendChild(dataSourceRow);

    // Big block number, bottom-left -- independent of the overlay's
    // show/hide state (the 'o' key), since it's meant as a minimal
    // always-visible decoration rather than a debug stat.
    let showBigBlockNumber = false;
    const bigBlockRow = document.createElement("div");
    bigBlockRow.className = "settingRow";
    const bigBlockLabel = document.createElement("label");
    bigBlockLabel.textContent = "Big block number";
    bigBlockRow.appendChild(bigBlockLabel);

    const bigBlockGroup = document.createElement("div");
    bigBlockGroup.className = "toggleGroup";
    [{ value: false, label: "Off" }, { value: true, label: "On" }].forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = opt.label;
        btn.className = "toggleBtn";
        btn.classList.toggle("active", showBigBlockNumber === opt.value);
        btn.addEventListener("click", () => {
            showBigBlockNumber = opt.value;
            bigBlockNumber.classList.toggle("hidden", !showBigBlockNumber);
            bigBlockGroup.querySelectorAll(".toggleBtn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
        bigBlockGroup.appendChild(btn);
    });
    bigBlockRow.appendChild(bigBlockGroup);
    settingsPanel.appendChild(bigBlockRow);

    const entryStyleRow = document.createElement("div");
    entryStyleRow.className = "settingRow";
    const entryStyleLabel = document.createElement("label");
    entryStyleLabel.textContent = "New tile animation";
    entryStyleRow.appendChild(entryStyleLabel);

    const entryStyleGroup = document.createElement("div");
    entryStyleGroup.className = "toggleGroup";
    const entryStyleOptions = [
        { value: "fall", label: "Fall" },
        { value: "slide", label: "Slide" },
        { value: "alternate", label: "Alternate" },
        { value: "grow", label: "Grow" }
    ];
    entryStyleOptions.forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = opt.label;
        btn.className = "toggleBtn";
        btn.classList.toggle("active", CONFIG.ENTRY_STYLE === opt.value);
        btn.addEventListener("click", () => {
            CONFIG.ENTRY_STYLE = opt.value;
            entryStyleGroup.querySelectorAll(".toggleBtn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            if (onSettingChange) onSettingChange("ENTRY_STYLE", opt.value);
        });
        entryStyleGroup.appendChild(btn);
    });
    entryStyleRow.appendChild(entryStyleGroup);
    settingsPanel.appendChild(entryStyleRow);

    const sliderDefs = [
        { key: "EASE", label: "Reflow speed", min: 0.02, max: 0.15, step: 0.005 }
    ];

    sliderDefs.forEach(def => {
        const row = document.createElement("div");
        row.className = "settingRow";

        const label = document.createElement("label");
        label.textContent = def.label;

        const input = document.createElement("input");
        input.type = "range";
        input.min = def.min;
        input.max = def.max;
        input.step = def.step;
        input.value = CONFIG[def.key];

        input.addEventListener("input", () => {
            const val = parseFloat(input.value);
            CONFIG[def.key] = val;
            if (onSettingChange) onSettingChange(def.key, val);
        });

        row.appendChild(label);
        row.appendChild(input);
        settingsPanel.appendChild(row);
    });

    function updateStatus(connected) {
        statusDot.classList.toggle("connected", connected);
        statusText.textContent = connected ? "Connected" : "Reconnecting…";
    }

    function updateBlockHeight(tipHeight) {
        const text = `#${(tipHeight + 1).toLocaleString()}`;
        blockHeightEl.textContent = text;
        bigBlockNumber.textContent = text;
    }

    function updateStats({ count, vsizeMb, nextFee }) {
        txCountEl.textContent = count.toLocaleString();
        vsizeEl.textContent = vsizeMb.toFixed(2);
        nextFeeEl.textContent = nextFee;
        updatedEl.textContent = new Date().toLocaleTimeString();
    }

    function updateHashrate(hashrate) {
        // hashrate is in H/s; Bitcoin's network hashrate is conventionally
        // shown in EH/s (exahashes/sec), currently in the hundreds.
        const units = [
            { value: 1e18, suffix: "EH/s" },
            { value: 1e15, suffix: "PH/s" },
            { value: 1e12, suffix: "TH/s" }
        ];
        const unit = units.find(u => hashrate >= u.value) || units[units.length - 1];
        hashrateEl.textContent = (hashrate / unit.value).toFixed(1) + " " + unit.suffix;
    }

    function updateTileCount(count) {
        tileCountEl.textContent = count.toLocaleString();
    }

    function showTooltip(cell, clientX, clientY) {
        // When details are hidden ('o'), hovering shouldn't reveal
        // transaction info either -- that defeats the point of hiding.
        if (overlay.classList.contains("hidden")) return;

        const shortTxid = cell.id ? `${cell.id.slice(0, 8)}…${cell.id.slice(-6)}` : "";
        tooltip.innerHTML =
            `<strong>${cell.feerate.toFixed(1)} sat/vB</strong><br>` +
            `${cell.fee.toLocaleString()} sat fee &middot; ${cell.vsize.toFixed(0)} vB<br>` +
            `<span style="opacity:0.6">${shortTxid}</span>`;
        tooltip.style.left = (clientX + 14) + "px";
        tooltip.style.top = (clientY + 14) + "px";
        tooltip.classList.remove("hidden");
    }

    function hideTooltip() {
        tooltip.classList.add("hidden");
    }

    function toggleOverlay() {
        overlay.classList.toggle("hidden");
        legend.classList.toggle("hidden");
        settingsToggle.classList.toggle("hidden");
        if (overlay.classList.contains("hidden")) {
            settingsPanel.classList.add("hidden");
            hideTooltip();
        }
    }

    return { updateStatus, updateBlockHeight, updateStats, updateTileCount, updateHashrate, showTooltip, hideTooltip, toggleOverlay };
}
