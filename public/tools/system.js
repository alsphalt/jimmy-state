/* Runtime Monitor — extracted from inline script blocks so the CSP
   (script-src 'self') allows it to run. */
/* ---------- Runtime monitor ---------- */
(() => {
  const $ = id => document.getElementById(id);
  const MB = 1024 * 1024;
  const START = performance.now();
  const WALL = new Date();
  const TEST_CACHE = "runtime-monitor-test";
  const HIST = 60;
  const hist = { fps: [], lag: [], heap: [] };
  const hog = [];

  $("started").textContent = "Started " + WALL.toLocaleString();

  const fmtBytes = b => {
    if (b == null || isNaN(b)) return "—";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(i ? 1 : 0) + " " + u[i];
  };
  const fmtUptime = ms => {
    const s = Math.floor(ms / 1000);
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map(n => String(n).padStart(2, "0")).join(":");
  };
  const log = msg => {
    const el = $("log");
    el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + el.textContent;
  };

  let frames = 0;
  const raf = () => { frames++; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);

  let lagAcc = 0, lastTick = performance.now();
  setInterval(() => {
    const now = performance.now();
    const drift = (now - lastTick) - 100;
    if (drift > 0) lagAcc += drift;
    lastTick = now;
  }, 100);

  function spark(canvas, data, color, max) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (data.length < 2) return;
    const top = max || Math.max(1, ...data) * 1.15;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (HIST - 1)) * w;
      const y = h - (v / top) * (h - 6) - 3;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.globalAlpha = 0.12; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
  }
  const push = (arr, v) => { arr.push(v); if (arr.length > HIST) arr.shift(); };
  const drawAll = () => {
    spark($("cFps"), hist.fps, "#5eead4", 75);
    spark($("cLag"), hist.lag, "#fbbf24");
    spark($("cHeap"), hist.heap, "#60a5fa");
  };

  function readMemory() {
    const m = performance.memory;
    if (m) {
      $("heap").textContent = fmtBytes(m.usedJSHeapSize);
      $("heapUsed").textContent = fmtBytes(m.usedJSHeapSize);
      $("heapTotal").textContent = fmtBytes(m.totalJSHeapSize);
      $("heapLimit").textContent = fmtBytes(m.jsHeapSizeLimit);
      $("heapBar").style.width = Math.min(100, (m.usedJSHeapSize / m.jsHeapSizeLimit) * 100) + "%";
      $("heapNote").textContent = "Live from performance.memory (Chromium browsers).";
      return m.usedJSHeapSize;
    }
    $("heap").textContent = "Not exposed";
    $("heapNote").textContent = "This browser does not expose JS heap numbers (Safari and Firefox hide them).";
    return null;
  }
  $("devMem").textContent = navigator.deviceMemory ? navigator.deviceMemory + " GB (approx.)" : "Not exposed";
  $("cores").textContent = navigator.hardwareConcurrency || "—";

  async function readStorage() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        const used = e.usage, quota = e.quota;
        $("storUsed").textContent = fmtBytes(used);
        $("storUsed2").textContent = fmtBytes(used);
        $("storQuota").textContent = fmtBytes(quota - used);
        $("storBar").style.width = Math.min(100, (used / quota) * 100) + "%";
        const d = e.usageDetails || {};
        $("storCache").textContent = d.caches != null ? fmtBytes(d.caches) : "Not reported";
        $("storIdb").textContent = d.indexedDB != null ? fmtBytes(d.indexedDB) : "Not reported";
      }
      if (navigator.storage && navigator.storage.persisted) {
        $("storPersist").textContent = (await navigator.storage.persisted()) ? "Yes" : "No";
      }
    } catch (err) {
      $("storUsed").textContent = "Unavailable";
    }
  }

  async function readCaches() {
    if (!("caches" in window)) {
      $("cacheCount").innerHTML = 'Not supported<span class="unit"></span>';
      return;
    }
    try {
      const names = await caches.keys();
      let total = 0;
      for (const n of names) {
        const c = await caches.open(n);
        total += (await c.keys()).length;
      }
      $("cacheCount").innerHTML = total + '<span class="unit">entries</span>';
      $("cacheNames").textContent = names.length ? names.join(", ") : "None";
      if (names.includes(TEST_CACHE)) {
        const c = await caches.open(TEST_CACHE);
        const reqs = await c.keys();
        let bytes = 0;
        for (const r of reqs) {
          const res = await c.match(r);
          if (res) bytes += (await res.blob()).size;
        }
        $("testSize").textContent = `${reqs.length} entries, ${fmtBytes(bytes)}`;
      } else {
        $("testSize").textContent = "Not created";
      }
    } catch (err) {
      $("cacheCount").innerHTML = 'Error<span class="unit"></span>';
    }
  }

  $("allocBtn").onclick = () => {
    const arr = new Uint8Array(20 * MB);
    for (let i = 0; i < arr.length; i += 4096) arr[i] = 1;
    hog.push(arr);
    log(`Allocated 20 MB (${hog.length} block${hog.length > 1 ? "s" : ""} held, ${fmtBytes(hog.length * 20 * MB)} total)`);
    $("loadStatus").textContent = "Allocated. Heap usage should rise on the next sample.";
  };
  $("freeBtn").onclick = () => {
    const n = hog.length;
    hog.length = 0;
    log(`Released ${n} block${n === 1 ? "" : "s"} (GC runs when the browser decides)`);
    $("loadStatus").textContent = "Released. Heap drops after garbage collection.";
  };
  $("cacheAddBtn").onclick = async () => {
    if (!("caches" in window)) { log("Cache API not available"); return; }
    $("cacheAddBtn").disabled = true;
    try {
      const c = await caches.open(TEST_CACHE);
      const n = (await c.keys()).length + 1;
      const blob = new Blob([new Uint8Array(5 * MB).fill(n % 256)]);
      await c.put(new Request("https://runtime-monitor.local/blob-" + n), new Response(blob));
      log(`Wrote entry #${n} (5 MB) to cache "${TEST_CACHE}"`);
    } catch (err) {
      log("Cache write failed: " + err.message);
    }
    $("cacheAddBtn").disabled = false;
    readCaches(); readStorage();
  };
  $("cacheClrBtn").onclick = async () => {
    try {
      const ok = await caches.delete(TEST_CACHE);
      log(ok ? `Deleted cache "${TEST_CACHE}"` : "No test cache to delete");
    } catch (err) { log("Delete failed: " + err.message); }
    readCaches(); readStorage();
  };

  let tickCount = 0;
  function sample() {
    const uptime = performance.now() - START;
    $("uptime").textContent = fmtUptime(uptime);
    $("uptimeMs").textContent = Math.round(uptime).toLocaleString() + " ms since load";

    const fps = frames; frames = 0;
    const lag = lagAcc; lagAcc = 0;
    push(hist.fps, fps);
    push(hist.lag, lag);

    $("fps").innerHTML = fps + '<span class="unit">fps</span>';
    $("frameMs").textContent = fps ? `Avg frame interval ${(1000 / fps).toFixed(1)} ms` : "Waiting for frames…";
    const lagEl = $("lag");
    lagEl.innerHTML = lag.toFixed(1) + '<span class="unit">ms/s</span>';
    lagEl.className = "big " + (lag > 100 ? "bad" : lag > 30 ? "warn" : "");

    const heap = readMemory();
    if (heap != null) push(hist.heap, heap / MB);
    drawAll();

    tickCount++;
    if (tickCount % 5 === 1) { readStorage(); readCaches(); }
  }
  sample();
  setInterval(sample, 1000);
  window.addEventListener("resize", drawAll);
})();

/* ---------- Vault ---------- */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmtBytes = b => {
    if (b == null || isNaN(b)) return "—";
    const u = ["B", "KB", "MB", "GB"]; let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(i ? 1 : 0) + " " + u[i];
  };
  const fmtDate = t => new Date(t).toLocaleString();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ----- Notifications: OS pop-up when allowed, in-app toast always ----- */
  let toastTimer = null;
  function toast(title, body) {
    const t = $("toast");
    t.innerHTML = "<b>" + esc(title) + "</b>" + esc(body || "");
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3800);
  }
  function notify(title, body) {
    let popped = false;
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: body || "", tag: "vault" });
        popped = true;
      }
    } catch (e) { popped = false; }
    toast(title, body);
    return popped;
  }

  /* ----- Storage: IndexedDB with in-memory fallback ----- */
  let dbp = null, useMem = false;
  const mem = { items: new Map(), folders: new Map() };
  function getDB() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!("indexedDB" in window)) return rej(new Error("IndexedDB not available"));
      const r = indexedDB.open("rm-vault", 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
        if (!db.objectStoreNames.contains("folders")) db.createObjectStore("folders", { keyPath: "id" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function dbAll(store) {
    if (!useMem) {
      try { const db = await getDB(); return await req2p(db.transaction(store).objectStore(store).getAll()); }
      catch (e) { useMem = true; }
    }
    return [...mem[store].values()];
  }
  async function dbGet(store, id) {
    if (!useMem) {
      try { const db = await getDB(); return (await req2p(db.transaction(store).objectStore(store).get(id))) || null; }
      catch (e) { useMem = true; }
    }
    return mem[store].get(id) || null;
  }
  async function dbPut(store, rec) {
    if (!useMem) {
      try {
        const db = await getDB();
        await new Promise((res, rej) => {
          const t = db.transaction(store, "readwrite");
          t.objectStore(store).put(rec);
          t.oncomplete = res; t.onerror = () => rej(t.error);
        });
        return;
      } catch (e) { useMem = true; }
    }
    mem[store].set(rec.id, rec);
  }
  async function dbDel(store, id) {
    mem[store].delete(id);
    if (!useMem) {
      try {
        const db = await getDB();
        await new Promise((res, rej) => {
          const t = db.transaction(store, "readwrite");
          t.objectStore(store).delete(id);
          t.oncomplete = res; t.onerror = () => rej(t.error);
        });
      } catch (e) { useMem = true; }
    }
  }

  /* ----- Folders ----- */
  const getFolders = async () => (await dbAll("folders")).sort((a, b) => a.name.localeCompare(b.name));
  async function createFolder(name) {
    const clean = (name || "").trim().slice(0, 60);
    if (!clean) return null;
    const existing = (await getFolders()).find(f => f.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing;
    const f = { id: uid(), name: clean, createdAt: Date.now() };
    await dbPut("folders", f);
    return f;
  }
  async function deleteFolder(id) {
    for (const it of await dbAll("items")) {
      if (it.folderId === id) { it.folderId = null; await dbPut("items", it); }
    }
    await dbDel("folders", id);
  }
  async function folderName(id) {
    if (!id) return "Unfiled";
    const f = await dbGet("folders", id);
    return f ? f.name : "Unfiled";
  }

  /* ----- Upload staging: pick a folder before saving ----- */
  let pending = null;   // { kind, name, items: [{ path, name, file }] }
  let chosen = null;    // folder id or null (Unfiled)

  function setStatus(msg, bad) {
    const el = $("uploadStatus");
    el.textContent = msg;
    el.className = "note " + (bad ? "bad" : "");
  }

  async function renderChooser() {
    const folders = await getFolders();
    const chips = [`<button data-f="" class="${chosen === null ? "on" : ""}">Unfiled</button>`]
      .concat(folders.map(f => `<button data-f="${f.id}" class="${chosen === f.id ? "on" : ""}">${esc(f.name)}</button>`));
    $("chooseFolders").innerHTML = chips.join("");
    $("chooseFolders").querySelectorAll("button").forEach(b => b.onclick = () => {
      chosen = b.dataset.f || null;
      renderChooser();
    });
  }

  async function stage(kind, fileList, nameFor) {
    const files = [...fileList];
    if (!files.length) return;
    if (kind === "folder") {
      const top = (files[0].webkitRelativePath || "").split("/")[0] || "Folder";
      pending = { kind, name: top, items: files.map(f => ({ path: f.webkitRelativePath || f.name, name: f.name, file: f })) };
      $("chooseInfo").textContent = `Folder "${top}" with ${files.length} file${files.length > 1 ? "s" : ""}`;
    } else {
      pending = { kind, name: null, items: files.map(f => ({ path: f.name, name: nameFor ? nameFor(f) : f.name, file: f })) };
      $("chooseInfo").textContent = `${files.length} ${kind === "photo" ? "photo" : "file"}${files.length > 1 ? "s" : ""} ready`;
    }
    chosen = null;
    $("chooseTitle").textContent = "Where should this be saved?";
    $("chooser").style.display = "";
    setStatus("Choose a folder, then tap Save here.");
    await renderChooser();
    $("chooser").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function cancelStage() {
    pending = null;
    $("chooser").style.display = "none";
    setStatus("Upload cancelled.");
  }

  async function commitPending() {
    if (!pending) return;
    const p = pending;
    const folderId = chosen;
    const where = await folderName(folderId);
    $("saveHereBtn").disabled = true;
    try {
      if (p.kind === "folder") {
        await saveRecord("folder", p.name, p.items, folderId);
      } else {
        for (const it of p.items) await saveRecord(p.kind, it.name, [it], folderId);
      }
      const count = p.items.length;
      const what = p.kind === "folder" ? `folder "${p.name}"` : `${count} ${p.kind === "photo" ? "photo" : "file"}${count > 1 ? "s" : ""}`;
      pending = null;
      $("chooser").style.display = "none";
      setStatus(`Saved ${what} to ${where}.`);
      notify("Upload saved", `${what[0].toUpperCase() + what.slice(1)} saved to ${where}`);
      renderLibrary();
      refreshStorage();
    } catch (err) {
      setStatus("Could not save: " + err.message, true);
    } finally {
      $("saveHereBtn").disabled = false;
    }
  }

  async function saveRecord(kind, name, items, folderId) {
    const rec = {
      id: uid(), kind, name, createdAt: Date.now(), folderId: folderId || null,
      files: items.map(it => ({ path: it.path, name: it.name, type: it.file.type, size: it.file.size, blob: it.file }))
    };
    await dbPut("items", rec);
    return rec;
  }
  const recSize = r => r.files.reduce((a, f) => a + f.size, 0);

  $("btnFiles").onclick = () => $("inFiles").click();
  $("btnFolder").onclick = () => $("inFolder").click();
  $("btnPhoto").onclick = () => $("inPhoto").click();
  $("inFiles").onchange = e => { stage("file", e.target.files); e.target.value = ""; };
  $("inFolder").onchange = e => { stage("folder", e.target.files); e.target.value = ""; };
  $("inPhoto").onchange = e => { stage("photo", e.target.files); e.target.value = ""; };
  $("inCamFallback").onchange = e => {
    stage("photo", e.target.files, () => "Camera " + new Date().toLocaleTimeString());
    e.target.value = "";
  };
  $("saveHereBtn").onclick = commitPending;
  $("cancelStageBtn").onclick = cancelStage;
  $("newFolderBtn").onclick = async () => {
    const f = await createFolder($("newFolderIn").value);
    if (!f) { toast("Folder name needed", "Type a name first."); return; }
    $("newFolderIn").value = "";
    chosen = f.id;
    await renderChooser();
    notify("Folder created", `"${f.name}" is ready`);
    renderLibrary();
  };
  $("newFolderIn").onkeydown = e => { if (e.key === "Enter") $("newFolderBtn").click(); };

  /* ----- Camera ----- */
  let stream = null;
  function stopCam() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    $("camModal").classList.remove("show");
    $("camVideo").srcObject = null;
  }
  $("btnCam").onclick = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $("inCamFallback").click();
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      $("camVideo").srcObject = stream;
      $("camNote").textContent = "Point the camera and tap the shutter.";
      $("camModal").classList.add("show");
      closeMenu();
    } catch (err) {
      setStatus("Camera not available here, opening the phone camera instead.");
      $("inCamFallback").click();
    }
  };
  $("camClose").onclick = stopCam;
  $("shutterBtn").onclick = () => {
    const v = $("camVideo");
    if (!v.videoWidth) { $("camNote").textContent = "Camera is still starting…"; return; }
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob(blob => {
      stopCam();
      if (!blob) { setStatus("Could not capture the photo.", true); return; }
      const name = "photo-" + new Date().toISOString().replace(/[:.]/g, "-") + ".jpg";
      const file = new File([blob], name, { type: "image/jpeg" });
      openMenu();
      stage("photo", [file]);
    }, "image/jpeg", 0.92);
  };

  /* ----- Drawer ----- */
  function openMenu() {
    $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false");
    $("overlay").classList.add("show");
    $("menuBtn").classList.add("open"); $("menuBtn").setAttribute("aria-expanded", "true");
    renderLibrary(); refreshStorage();
  }
  function closeMenu() {
    $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true");
    $("overlay").classList.remove("show");
    $("menuBtn").classList.remove("open"); $("menuBtn").setAttribute("aria-expanded", "false");
    closeReview();
  }
  $("menuBtn").onclick = () => $("drawer").classList.contains("open") ? closeMenu() : openMenu();
  $("closeBtn").onclick = closeMenu;
  $("overlay").onclick = closeMenu;
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeMenu(); stopCam(); } });

  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.id === "tab-" + b.dataset.tab));
    if (b.dataset.tab === "library") { closeReview(); renderLibrary(); }
    if (b.dataset.tab === "storage") refreshStorage();
    if (b.dataset.tab === "settings") refreshSettings();
    if (b.dataset.tab === "upload" && pending) renderChooser();
  });

  /* ----- Library ----- */
  let libFilter = "all";   // "all" | "none" | folder id
  async function renderLibrary() {
    const folders = await getFolders();
    const items = (await dbAll("items")).sort((a, b) => b.createdAt - a.createdAt);
    if (libFilter !== "all" && libFilter !== "none" && !folders.find(f => f.id === libFilter)) libFilter = "all";
    const counts = id => items.filter(i => (i.folderId || null) === id).length;

    const chips = [`<button data-lf="all" class="${libFilter === "all" ? "on" : ""}">All (${items.length})</button>`,
      `<button data-lf="none" class="${libFilter === "none" ? "on" : ""}">Unfiled (${counts(null)})</button>`]
      .concat(folders.map(f => `<button data-lf="${f.id}" class="${libFilter === f.id ? "on" : ""}">${esc(f.name)} (${counts(f.id)})</button>`));

    const folderBar = `
      <div class="folderbar">
        <div class="label">Folders</div>
        <div class="rowin" style="margin-top:0">
          <input class="txt" id="libFolderIn" placeholder="New folder name" maxlength="60">
          <button id="libFolderBtn">Create</button>
        </div>
        <div class="chips">${chips.join("")}</div>
        ${folders.length ? `<div class="note" style="margin:0 0 4px">Tap a folder to show only its items. Delete a folder to move its items to Unfiled.</div>
          <div class="btns" style="margin-top:6px">${folders.map(f => `<button data-fdel="${f.id}">Delete "${esc(f.name)}"</button>`).join("")}</div>` : ""}
      </div>`;

    const shown = items.filter(i => libFilter === "all" ? true : libFilter === "none" ? !i.folderId : i.folderId === libFilter);
    const list = shown.length ? shown.map(r => {
      const count = r.files.length;
      const opts = [`<option value="">Unfiled</option>`].concat(folders.map(f => `<option value="${f.id}" ${r.folderId === f.id ? "selected" : ""}>${esc(f.name)}</option>`)).join("");
      return `<div class="item">
        <div class="t">${esc(r.name)}<span class="badge">${esc(r.kind)}</span></div>
        <div class="m">${count} file${count > 1 ? "s" : ""} · ${fmtBytes(recSize(r))} · ${esc(fmtDate(r.createdAt))}</div>
        <div class="m" style="margin-top:-4px">In: ${esc(folders.find(f => f.id === r.folderId)?.name || "Unfiled")}</div>
        <div class="acts">
          <button data-act="review" data-id="${r.id}">Review</button>
          <button data-act="download" data-id="${r.id}">${r.kind === "folder" || count > 1 ? "Download ZIP" : "Download"}</button>
          <select class="txt" style="min-height:36px;padding:4px 8px;width:auto;font-size:13px" data-move="${r.id}" aria-label="Move to folder">${opts}</select>
          <button data-act="delete" data-id="${r.id}">Delete</button>
        </div>
      </div>`;
    }).join("") : `<div class="note">${items.length ? "No items in this folder yet." : "Nothing saved yet. Upload files, a folder, or a photo from the Upload tab."}</div>`;

    const view = $("libView");
    view.innerHTML = folderBar + list;

    view.querySelectorAll("[data-lf]").forEach(b => b.onclick = () => { libFilter = b.dataset.lf; renderLibrary(); });
    view.querySelectorAll("button[data-act]").forEach(b => b.onclick = () => libAction(b.dataset.act, b.dataset.id));
    view.querySelectorAll("select[data-move]").forEach(s => s.onchange = () => moveItem(s.dataset.move, s.value || null));
    view.querySelectorAll("button[data-fdel]").forEach(b => b.onclick = () => armedDeleteFolder(b));
    $("libFolderBtn").onclick = async () => {
      const f = await createFolder($("libFolderIn").value);
      if (!f) { toast("Folder name needed", "Type a name first."); return; }
      notify("Folder created", `"${f.name}" is ready`);
      libFilter = f.id;
      renderLibrary();
    };
    $("libFolderIn").onkeydown = e => { if (e.key === "Enter") $("libFolderBtn").click(); };
  }

  async function moveItem(id, folderId) {
    const rec = await dbGet("items", id);
    if (!rec) return;
    rec.folderId = folderId;
    await dbPut("items", rec);
    const where = await folderName(folderId);
    notify("Item moved", `"${rec.name}" is now in ${where}`);
    renderLibrary();
  }

  function armed(btn, label, onConfirm) {
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.textContent = "Tap again to confirm";
      setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ""; btn.textContent = label; } }, 3000);
      return;
    }
    onConfirm();
  }
  function armedDeleteFolder(btn) {
    const id = btn.dataset.fdel;
    armed(btn, btn.textContent, async () => {
      const name = (await dbGet("folders", id))?.name || "folder";
      await deleteFolder(id);
      if (libFilter === id) libFilter = "all";
      notify("Folder deleted", `"${name}" removed, its items are in Unfiled`);
      renderLibrary();
    });
  }

  async function libAction(act, id) {
    if (act === "review") return openReview(id);
    if (act === "download") {
      const rec = await dbGet("items", id);
      if (!rec) return;
      if (rec.kind !== "folder" && rec.files.length === 1) {
        downloadBlob(rec.files[0].blob, rec.files[0].name);
      } else {
        const zip = await buildZip(rec.files.map(f => ({ path: f.path, blob: f.blob })));
        downloadBlob(zip, rec.name.replace(/[\\/:*?"<>|]/g, "_") + ".zip");
      }
      notify("Download ready", `"${rec.name}" is saved to your downloads`);
      return;
    }
    if (act === "delete") {
      const btn = document.querySelector(`button[data-act="delete"][data-id="${id}"]`);
      if (!btn) return;
      armed(btn, "Delete", async () => {
        const rec = await dbGet("items", id);
        await dbDel("items", id);
        notify("Item deleted", rec ? `"${rec.name}" was removed` : "Item removed");
        renderLibrary(); refreshStorage();
      });
    }
  }

  /* ----- Review ----- */
  let urls = [];
  const objUrl = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };
  function revokeUrls() { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; }
  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = objUrl(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function closeReview() {
    revokeUrls();
    $("reviewView").style.display = "none";
    $("reviewView").innerHTML = "";
    $("libView").style.display = "";
  }
  const isText = f => (f.type || "").startsWith("text/") || /\.(txt|md|json|js|ts|jsx|tsx|css|html|csv|py|xml|yml|yaml|log)$/i.test(f.name);

  async function openReview(id) {
    const rec = await dbGet("items", id);
    if (!rec) return;
    $("libView").style.display = "none";
    const rv = $("reviewView");
    rv.style.display = "";
    rv.innerHTML = `
      <div class="btns" style="margin:0 0 10px"><button id="backLib">← Back</button></div>
      <div style="font-weight:600;word-break:break-word">${esc(rec.name)}</div>
      <div class="note" style="margin-top:2px">${rec.files.length} file${rec.files.length > 1 ? "s" : ""} · ${fmtBytes(recSize(rec))} · ${esc(fmtDate(rec.createdAt))}</div>
      <ul class="files">${rec.files.map((f, i) => `
        <li><span style="word-break:break-all">${esc(f.path)}<br><span class="note" style="margin:0">${fmtBytes(f.size)}</span></span>
        <span><button data-pv="${i}">Preview</button> <button data-dl="${i}">Save</button></span></li>`).join("")}
      </ul>
      <div class="preview" id="preview"></div>`;
    $("backLib").onclick = closeReview;
    rv.querySelectorAll("[data-pv]").forEach(b => b.onclick = () => previewFile(rec.files[+b.dataset.pv]));
    rv.querySelectorAll("[data-dl]").forEach(b => b.onclick = () => { const f = rec.files[+b.dataset.dl]; downloadBlob(f.blob, f.name); });
    if (rec.files.length) previewFile(rec.files[0]);
  }

  async function previewFile(f) {
    const pv = $("preview");
    revokeUrls();
    pv.innerHTML = "";
    if ((f.type || "").startsWith("image/")) {
      const img = new Image(); img.src = objUrl(f.blob); img.alt = f.name;
      pv.appendChild(img);
    } else if (f.type === "application/pdf") {
      const fr = document.createElement("iframe"); fr.src = objUrl(f.blob);
      pv.appendChild(fr);
    } else if (isText(f)) {
      const pre = document.createElement("pre");
      pre.textContent = await f.blob.slice(0, 200000).text() + (f.size > 200000 ? "\n\n… preview cut at 200 KB, save for the full file" : "");
      pv.appendChild(pre);
    } else {
      pv.innerHTML = `<div class="note">No preview for ${esc(f.type || "this file type")}. Use Save to download it.</div>`;
    }
  }

  /* ----- ZIP (store-only) ----- */
  const CRC_T = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(d) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  async function buildZip(entries) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.path);
      const data = new Uint8Array(await e.blob.arrayBuffer());
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
      lh.setUint16(6, 0, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, p) => a + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true); end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }

  /* ----- Storage tab ----- */
  async function refreshStorage() {
    const items = await dbAll("items");
    const folders = await dbAll("folders");
    $("vaultCount").textContent = items.length + (items.length === 1 ? " item" : " items");
    $("vaultFolders").textContent = String(folders.length);
    $("vaultSize").textContent = fmtBytes(items.reduce((a, r) => a + recSize(r), 0));
    if (navigator.storage && navigator.storage.estimate) {
      try { const e = await navigator.storage.estimate(); $("vaultQuota").textContent = fmtBytes(e.quota - e.usage); } catch (err) {}
    }
    if (navigator.storage && navigator.storage.persisted) {
      try {
        const p = await navigator.storage.persisted();
        $("persistStatus").textContent = p ? "Persistent storage is on for this site." : "Persistent storage is off. The browser may clear this vault under low space.";
      } catch (err) {}
    }
  }
  $("persistBtn").onclick = async () => {
    try {
      if (!navigator.storage || !navigator.storage.persist) throw new Error("not supported in this browser");
      const ok = await navigator.storage.persist();
      $("persistStatus").textContent = ok ? "Granted. Your saved items are protected from automatic clearing." : "Not granted by the browser. It decides based on usage and engagement.";
      if (ok) notify("Persistent storage on", "Your saved items are protected");
    } catch (err) {
      $("persistStatus").textContent = "Could not request it: " + err.message;
    }
  };
  $("wipeBtn").onclick = () => armed($("wipeBtn"), "Delete all saved items", async () => {
    for (const r of await dbAll("items")) await dbDel("items", r.id);
    for (const f of await dbAll("folders")) await dbDel("folders", f.id);
    libFilter = "all";
    notify("Vault cleared", "All saved items and folders were deleted");
    renderLibrary(); refreshStorage();
  });

  /* ----- Settings: permissions and notifications ----- */
  const PERMS = [
    { id: "camera", name: "Camera", q: "camera", hint: "Taking photos with the camera", grant: async () => { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop()); } },
    { id: "mic", name: "Microphone", q: "microphone", hint: "Voice input, if you use it", grant: async () => { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } },
    { id: "notif", name: "Notifications", q: "notifications", hint: "Pop-up alerts for uploads and changes", grant: async () => { if (!("Notification" in window)) throw new Error("Notifications are not supported here"); const r = await Notification.requestPermission(); if (r !== "granted") throw new Error("blocked"); } },
    { id: "geo", name: "Location", q: "geolocation", hint: "Your position, only if needed", grant: () => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(() => res(), e => rej(new Error(e.message)))) },
    { id: "persist", name: "Persistent storage", q: "persistent-storage", hint: "Keeps saved items from being cleared", grant: async () => { if (!(await navigator.storage.persist())) throw new Error("blocked"); } },
    { id: "files", name: "Folder access", q: null, hint: "Pick a folder to save from (asks each time)", grant: async () => { await window.showDirectoryPicker(); } }
  ];
  const pillText = s => ({ granted: "Granted", denied: "Blocked", prompt: "Not granted", unsupported: "Not supported" })[s] || "Unknown";
  const pillClass = s => s === "granted" ? "ok" : s === "denied" ? "no" : "";
  async function permState(p) {
    try {
      if (p.id === "files") return "showDirectoryPicker" in window ? "prompt" : "unsupported";
      if (p.id === "notif") { if (!("Notification" in window)) return "unsupported"; const n = Notification.permission; return n === "default" ? "prompt" : n; }
      if (p.id === "persist") { if (!(navigator.storage && navigator.storage.persisted)) return "unsupported"; return (await navigator.storage.persisted()) ? "granted" : "prompt"; }
      if (!navigator.permissions) return "unknown";
      const r = await navigator.permissions.query({ name: p.q });
      return r.state;
    } catch (e) { return "unknown"; }
  }
  async function refreshSettings() {
    const list = $("permList");
    list.innerHTML = "";
    for (const p of PERMS) {
      const s = await permState(p);
      const row = document.createElement("div");
      row.className = "perm";
      row.innerHTML = '<div><div style="font-weight:600">' + p.name + '</div><div class="note" style="margin:2px 0 0">' + p.hint + '</div></div>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0"><span class="pill ' + pillClass(s) + '">' + pillText(s) + '</span>' +
        '<button data-perm="' + p.id + '" data-s="' + s + '"' + (s === "unsupported" ? " disabled" : "") + '>' + (s === "granted" ? "Re-check" : "Grant") + '</button></div>';
      list.appendChild(row);
    }
    list.querySelectorAll("button[data-perm]").forEach(b => b.onclick = () => b.dataset.s === "granted" ? refreshSettings() : grantOne(b.dataset.perm));
  }
  async function grantOne(id, quiet) {
    const p = PERMS.find(x => x.id === id);
    const note = $("settingsNote");
    try {
      await p.grant();
      note.textContent = p.name + ": granted.";
      if (id === "notif") notify("Notifications on", "You will see pop-ups for uploads and changes");
    } catch (err) {
      const blocked = ["NotAllowedError", "NotFoundError", "SecurityError", "AbortError"].includes(err.name) || err.message === "blocked";
      note.textContent = blocked
        ? p.name + " was not granted. Allow it from the lock icon in the address bar or the site settings, then tap Re-check."
        : p.name + ": " + (err.message || "not available here.");
    }
    if (!quiet) refreshSettings();
  }
  $("grantAllBtn").onclick = async () => {
    $("settingsNote").textContent = "Asking for each permission in turn…";
    for (const p of PERMS) {
      if (p.id === "files") continue;
      const s = await permState(p);
      if (s !== "granted" && s !== "unsupported") await grantOne(p.id, true);
    }
    $("settingsNote").textContent += " Folder access asks each time you use it, so it is not in Grant all. Some browsers show one prompt per tap, so tap any row that is still not granted.";
    refreshSettings();
  };
  $("testNotifBtn").onclick = async () => {
    if (!("Notification" in window)) { toast("Pop-ups not supported", "This browser cannot show system notifications here. You will still see in-app alerts."); return; }
    if (Notification.permission === "default") {
      const r = await Notification.requestPermission();
      refreshSettings();
      if (r !== "granted") { $("settingsNote").textContent = "Notifications were not allowed. In-app alerts still appear at the top of the screen."; return; }
    }
    if (Notification.permission === "granted") {
      const popped = notify("Test pop-up", "Notifications are working for the vault");
      $("settingsNote").textContent = popped ? "Test pop-up sent." : "Browser blocked the pop-up here, showing an in-app alert instead.";
    } else {
      toast("Pop-ups are blocked", "Allow notifications from the lock icon in the address bar.");
    }
  };

  renderLibrary();
  refreshStorage();
})();
(() => {
  const $ = id => document.getElementById(id);
  const GAMES = [
    { id: 'chess', name: 'Chess', desc: 'Play against the AI on three levels. You are White and move first.', open: () => showChess() },
    { id: 'ludo', name: 'Ludo', desc: 'Classic board game for 2 to 4 players. Play against the AI or pass the device around. Roll a 6 to bring a piece out.', open: () => showLudo() },
    { id: 'race', name: 'Car Racing', desc: 'Top-down circuit racing against three computer cars. Pick a car, a track and a lap count.', open: () => showRace() },
    { id: 'football', name: 'Football', desc: 'Five-a-side on a small pitch. Move, pass, shoot and tackle against the computer.', open: () => showFootball() }
  ];
  const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' };
  const GLYPH_B = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  const DIRS = {
    N: [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]],
    K: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],
    B: [[-1,-1],[-1,1],[1,-1],[1,1]],
    R: [[-1,0],[1,0],[0,-1],[0,1]]
  };
  DIRS.Q = DIRS.B.concat(DIRS.R);
  const LEVELS = {
    easy: { label: 'Easy', strength: 0.3, depth: 2, text: 'Beginner AI. It plays its best move only 30% of the time and random moves the rest, so you should win most games.' },
    normal: { label: 'Normal', strength: 0.7, depth: 2, text: 'Balanced AI. It plays its best move 70% of the time and makes mistakes the rest of the time.' },
    hard: { label: 'Hard', strength: 1.0, depth: 3, text: 'Intelligent AI. It always plays its best move and looks three moves ahead.' }
  };
  const colorOf = p => p ? (p === p.toUpperCase() ? 'w' : 'b') : null;
  const sqName = i => 'abcdefgh'[i & 7] + (8 - (i >> 3));
  const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

  function initialBoard() {
    const row = ['r','n','b','q','k','b','n','r'];
    return [...row, ...Array(8).fill('p'), ...Array(32).fill(null), ...Array(8).fill('P'), ...row.map(p => p.toUpperCase())];
  }

  function pseudo(b, side) {
    const moves = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || colorOf(p) !== side) continue;
      const r = i >> 3, c = i & 7, t = p.toUpperCase();
      if (t === 'P') {
        const dir = side === 'w' ? -1 : 1, start = side === 'w' ? 6 : 1, lr = r + dir;
        if (inB(lr, c) && !b[lr * 8 + c]) {
          moves.push({ from: i, to: lr * 8 + c });
          if (r === start && !b[(r + 2 * dir) * 8 + c]) moves.push({ from: i, to: (r + 2 * dir) * 8 + c });
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc;
          if (inB(lr, cc) && b[lr * 8 + cc] && colorOf(b[lr * 8 + cc]) !== side) moves.push({ from: i, to: lr * 8 + cc });
        }
      } else if (t === 'N' || t === 'K') {
        for (const [dr, dc] of DIRS[t]) {
          const nr = r + dr, nc = c + dc;
          if (!inB(nr, nc)) continue;
          const j = nr * 8 + nc;
          if (!b[j] || colorOf(b[j]) !== side) moves.push({ from: i, to: j });
        }
      } else {
        for (const [dr, dc] of DIRS[t]) {
          let nr = r + dr, nc = c + dc;
          while (inB(nr, nc)) {
            const j = nr * 8 + nc;
            if (!b[j]) moves.push({ from: i, to: j });
            else { if (colorOf(b[j]) !== side) moves.push({ from: i, to: j }); break; }
            nr += dr; nc += dc;
          }
        }
      }
    }
    return moves;
  }

  function attacked(b, idx, by) {
    const r = idx >> 3, c = idx & 7;
    const cap = t => by === 'w' ? t : t.toLowerCase();
    const pr = by === 'w' ? r + 1 : r - 1;
    for (const dc of [-1, 1]) {
      const cc = c + dc;
      if (inB(pr, cc) && b[pr * 8 + cc] === cap('P')) return true;
    }
    for (const [dr, dc] of DIRS.N) { const nr = r + dr, nc = c + dc; if (inB(nr, nc) && b[nr * 8 + nc] === cap('N')) return true; }
    for (const [dr, dc] of DIRS.K) { const nr = r + dr, nc = c + dc; if (inB(nr, nc) && b[nr * 8 + nc] === cap('K')) return true; }
    for (const [dr, dc] of DIRS.B) {
      let nr = r + dr, nc = c + dc;
      while (inB(nr, nc)) { const p = b[nr * 8 + nc]; if (p) { if (p === cap('B') || p === cap('Q')) return true; break; } nr += dr; nc += dc; }
    }
    for (const [dr, dc] of DIRS.R) {
      let nr = r + dr, nc = c + dc;
      while (inB(nr, nc)) { const p = b[nr * 8 + nc]; if (p) { if (p === cap('R') || p === cap('Q')) return true; break; } nr += dr; nc += dc; }
    }
    return false;
  }

  const kingIdx = (b, side) => b.indexOf(side === 'w' ? 'K' : 'k');
  const inCheck = (b, side) => { const k = kingIdx(b, side); return k >= 0 && attacked(b, k, side === 'w' ? 'b' : 'w'); };
  function apply(b, m) {
    const nb = b.slice();
    let p = nb[m.from];
    nb[m.from] = null;
    if (p.toUpperCase() === 'P' && ((m.to >> 3) === 0 || (m.to >> 3) === 7)) p = colorOf(p) === 'w' ? 'Q' : 'q';
    nb[m.to] = p;
    return nb;
  }
  const legal = (b, side) => pseudo(b, side).filter(m => !inCheck(apply(b, m), side));

  function evalB(b) {
    let s = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const t = p.toUpperCase(), r = i >> 3, c = i & 7;
      const center = (t === 'N' || t === 'P') && r >= 2 && r <= 5 && c >= 2 && c <= 5 ? 12 : 0;
      const v = VAL[t] + center;
      s += colorOf(p) === 'w' ? v : -v;
    }
    return s;
  }

  function search(b, side, depth, alpha, beta) {
    if (depth === 0) return evalB(b);
    const moves = legal(b, side);
    if (!moves.length) return inCheck(b, side) ? (side === 'w' ? -100000 - depth : 100000 + depth) : 0;
    const white = side === 'w';
    let best = white ? -Infinity : Infinity;
    moves.sort((x, y) => (b[y.to] ? VAL[b[y.to].toUpperCase()] : 0) - (b[x.to] ? VAL[b[x.to].toUpperCase()] : 0));
    for (const m of moves) {
      const v = search(apply(b, m), white ? 'b' : 'w', depth - 1, alpha, beta);
      if (white) { if (v > best) best = v; if (best > alpha) alpha = best; }
      else { if (v < best) best = v; if (best < beta) beta = best; }
      if (beta <= alpha) break;
    }
    return best;
  }

  function bestMove(b, side, depth) {
    const moves = legal(b, side);
    if (!moves.length) return null;
    const white = side === 'w';
    let best = null, bestV = white ? -Infinity : Infinity;
    for (const m of moves) {
      const v = search(apply(b, m), white ? 'b' : 'w', depth - 1, -Infinity, Infinity);
      if ((white && v > bestV) || (!white && v < bestV) || (v === bestV && Math.random() < 0.5)) { bestV = v; best = m; }
    }
    return best;
  }

  function pickAI(b, level) {
    const cfg = LEVELS[level];
    if (Math.random() < cfg.strength) return bestMove(b, 'b', cfg.depth);
    const moves = legal(b, 'b');
    return moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
  }

  const ch = { started: false, level: 'normal', board: null, turn: 'w', sel: null, targets: [], last: null, over: false, result: '', busy: false };

  function chStart(level) {
    ch.level = level; ch.board = initialBoard(); ch.turn = 'w';
    ch.sel = null; ch.targets = []; ch.last = null;
    ch.over = false; ch.result = ''; ch.busy = false; ch.started = true;
    chRender();
  }

  function endCheck() {
    if (legal(ch.board, ch.turn).length) return false;
    ch.over = true;
    const mate = inCheck(ch.board, ch.turn);
    ch.result = mate ? (ch.turn === 'w' ? 'Checkmate. The AI wins.' : 'Checkmate. You win!') : 'Stalemate. It is a draw.';
    return true;
  }

  function playMove(m) {
    ch.board = apply(ch.board, m); ch.last = m; ch.sel = null; ch.targets = [];
    ch.turn = 'b';
    if (endCheck()) { chRender(); return; }
    ch.busy = true;
    chRender();
    setTimeout(aiTurn, 300);
  }

  function aiTurn() {
    const m = pickAI(ch.board, ch.level);
    ch.busy = false;
    if (m) { ch.board = apply(ch.board, m); ch.last = m; ch.turn = 'w'; }
    endCheck();
    chRender();
  }

  function onSquare(i) {
    if (ch.over || ch.busy || ch.turn !== 'w') return;
    const hit = ch.sel !== null ? ch.targets.find(t => t.to === i) : null;
    if (hit) return playMove(hit);
    const p = ch.board[i];
    if (p && colorOf(p) === 'w') { ch.sel = i; ch.targets = legal(ch.board, 'w').filter(t => t.from === i); }
    else { ch.sel = null; ch.targets = []; }
    chRender();
  }

  function statusText() {
    if (ch.over) return ch.result;
    if (ch.busy) return 'AI is thinking…';
    const check = inCheck(ch.board, ch.turn);
    return ch.turn === 'w' ? ('Your move' + (check ? ' · you are in check!' : '')) : 'AI to move';
  }

  function chRender() {
    if (activeGame !== 'chess') return;
    const body = $('gmBody');
    if (!ch.started) {
      body.innerHTML = '<p class="note" style="margin:0 0 14px;text-align:center">Choose the AI level. You play White and move first.</p>' +
        '<div class="lvlwrap">' + Object.keys(LEVELS).map(k => '<button class="lvl' + (ch.level === k ? ' on' : '') + '" data-lvl="' + k + '"><b>' + LEVELS[k].label + '</b><span>' + LEVELS[k].text + '</span></button>').join('') + '</div>' +
        '<div class="btns" style="justify-content:center;margin-top:16px"><button class="primary" id="chStart">Start game</button></div>';
      body.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { ch.level = b.dataset.lvl; chRender(); });
      $('chStart').onclick = () => chStart(ch.level);
      return;
    }
    const lastSet = ch.last ? [ch.last.from, ch.last.to] : [];
    const chkSq = inCheck(ch.board, ch.turn) ? ch.board.indexOf(ch.turn === 'w' ? 'K' : 'k') : -1;
    let squares = '';
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7, p = ch.board[i];
      const t = ch.targets.find(x => x.to === i);
      const cls = ['sq', (r + c) % 2 ? 'dk' : 'lt'];
      if (lastSet.includes(i)) cls.push('last');
      if (i === ch.sel) cls.push('sel');
      if (t) cls.push(p ? 'cap' : 'mv');
      if (i === chkSq) cls.push('chk');
      const glyph = p ? (colorOf(p) === 'w' ? GLYPH[p] : GLYPH_B[p.toUpperCase()]) : '';
      const pcls = p ? (colorOf(p) === 'w' ? 'pc wp' : 'pc bp') : 'pc';
      squares += '<div class="' + cls.join(' ') + '" data-i="' + i + '"><span class="' + pcls + '">' + glyph + '</span></div>';
    }
    const lastTxt = ch.last ? 'Last move: ' + sqName(ch.last.from) + ' to ' + sqName(ch.last.to) + ' · ' : '';
    body.innerHTML = '<div class="status">' + statusText() + '</div>' +
      '<div class="board">' + squares + '</div>' +
      '<div class="note" style="text-align:center">' + lastTxt + LEVELS[ch.level].label + ' level · You are White</div>' +
      '<div class="btns" style="justify-content:center;margin-top:12px"><button class="primary" id="chNew">New game</button><button id="chLevel">Change level</button></div>';
    body.querySelectorAll('.sq').forEach(el => el.onclick = () => onSquare(+el.dataset.i));
    $('chNew').onclick = () => chStart(ch.level);
    $('chLevel').onclick = () => { ch.started = false; chRender(); };
  }

  function showList() {
    activeGame = null;
    $('gmTitle').textContent = 'Games';
    $('gmBack').style.display = 'none';
    $('gmBody').innerHTML = GAMES.map(g => '<div class="gcard"><div class="gname">' + g.name + '</div><div class="note" style="margin:4px 0 10px">' + g.desc + '</div><div class="btns" style="margin-top:0"><button class="primary" data-game="' + g.id + '">Play</button></div></div>').join('') +
      '<div class="gcard soon"><div class="gname">More games</div><div class="note" style="margin:4px 0 0">Coming soon.</div></div>';
    $('gmBody').querySelectorAll('[data-game]').forEach(b => b.onclick = () => GAMES.find(x => x.id === b.dataset.game).open());
  }
  function showChess() {
    activeGame = 'chess';
    $('gmTitle').textContent = 'Chess';
    $('gmBack').style.display = '';
    chRender();
  }

  /* ---------- Ludo ---------- */
  let activeGame = null;
  const LUDO_LOOP = [[6,0],[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0]];
  const LUDO_START = [14, 1, 40, 27];
  const LUDO_SAFE = new Set([1, 9, 14, 22, 27, 35, 40, 48]);
  const LUDO_HOME = [[[1,7],[2,7],[3,7],[4,7],[5,7]],[[7,1],[7,2],[7,3],[7,4],[7,5]],[[13,7],[12,7],[11,7],[10,7],[9,7]],[[7,13],[7,12],[7,11],[7,10],[7,9]]];
  const LUDO_BASE = [[[1,10],[1,13],[4,10],[4,13]],[[1,1],[1,4],[4,1],[4,4]],[[10,1],[10,4],[13,1],[13,4]],[[10,10],[10,13],[13,10],[13,13]]];
  const LUDO_BOX = [[0,5,9,14],[0,5,0,5],[9,14,0,5],[9,14,9,14]];
  const LUDO_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];
  const LUDO_COLORS = ['#e53935', '#43a047', '#fdd835', '#1e88e5'];
  const LUDO_SEATS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
  const LUDO_CELLS = {};
  LUDO_BOX.forEach((b, k) => { for (let r = b[0]; r <= b[1]; r++) for (let c = b[2]; c <= b[3]; c++) LUDO_CELLS[r * 15 + c] = 'bx' + k; });
  for (let r = 6; r <= 8; r++) for (let c = 6; c <= 8; c++) LUDO_CELLS[r * 15 + c] = 'ctr';
  LUDO_HOME.forEach((list, k) => list.forEach(([r, c]) => { LUDO_CELLS[r * 15 + c] = 'hm' + k; }));
  LUDO_LOOP.forEach(([r, c], i) => { const si = LUDO_START.indexOf(i); LUDO_CELLS[r * 15 + c] = si >= 0 ? 'st' + si : (LUDO_SAFE.has(i) ? 'star' : 'trk'); });
  const lu = { started: false, n: 2, mode: 'ai', seats: [0, 2], humans: [0], pos: [], turn: 0, phase: 'roll', dice: 0, rolling: false, busy: false, choices: [], winners: [], over: false, msg: '' };

  const luIsHuman = k => lu.humans.includes(k);
  const luAbs = (k, p) => (LUDO_START[k] + p) % 52;
  const luCoord = (k, p, i) => p === -1 ? LUDO_BASE[k][i] : p <= 50 ? LUDO_LOOP[luAbs(k, p)] : p <= 55 ? LUDO_HOME[k][p - 51] : [7, 7];
  const luActive = () => lu.seats.filter(k => !lu.winners.includes(k));
  function luLegal(k, d) {
    const out = [];
    lu.pos[k].forEach((p, i) => { if (p === -1) { if (d === 6) out.push(i); } else if (p + d <= 56) out.push(i); });
    return out;
  }

  function luBegin(n, mode) {
    lu.n = n; lu.mode = mode; lu.seats = LUDO_SEATS[n];
    lu.humans = mode === 'ai' ? [lu.seats[0]] : lu.seats.slice();
    lu.pos = [0, 1, 2, 3].map(() => [-1, -1, -1, -1]);
    lu.turn = lu.seats[0]; lu.phase = 'roll'; lu.dice = 0; lu.rolling = false; lu.busy = false;
    lu.choices = []; lu.winners = []; lu.over = false; lu.started = true;
    lu.msg = 'Roll the dice to start.';
    luRender(); luSchedule();
  }

  function luSchedule() {
    if (lu.over || lu.busy) return;
    if (!luIsHuman(lu.turn) && lu.phase === 'roll') setTimeout(luRoll, 700);
  }

  function luRoll() {
    if (lu.over || lu.phase !== 'roll' || lu.busy) return;
    lu.busy = true; lu.rolling = true;
    lu.msg = `${LUDO_NAMES[lu.turn]} is rolling…`;
    luRender();
    let n = 0;
    const iv = setInterval(() => {
      n++;
      lu.dice = 1 + Math.floor(Math.random() * 6);
      if (n < 12) { const el = document.querySelector('.die'); if (el) el.textContent = lu.dice; return; }
      clearInterval(iv);
      lu.rolling = false; lu.busy = false;
      luAfterRoll();
    }, 70);
  }

  function luAfterRoll() {
    const k = lu.turn, legal = luLegal(k, lu.dice);
    if (!legal.length) {
      lu.msg = `${LUDO_NAMES[k]} rolled ${lu.dice}. No move.`;
      lu.busy = true;
      luRender();
      setTimeout(() => { lu.busy = false; luNext(); }, 800);
      return;
    }
    if (legal.length === 1) { luMove(k, legal[0]); return; }
    lu.phase = 'choose'; lu.choices = legal;
    lu.msg = `${LUDO_NAMES[k]} rolled ${lu.dice}. Choose a piece.`;
    luRender();
    if (!luIsHuman(k)) luAiPick(k);
  }

  function luMove(k, i) {
    const d = lu.dice, p = lu.pos[k][i];
    const np = p === -1 ? 0 : p + d;
    lu.pos[k][i] = np;
    let msg = `${LUDO_NAMES[k]} rolled ${d} and moved.`;
    if (np <= 50 && !LUDO_SAFE.has(luAbs(k, np))) {
      const a = luAbs(k, np);
      for (const o of lu.seats) {
        if (o === k) continue;
        lu.pos[o].forEach((q, j) => {
          if (q >= 0 && q <= 50 && luAbs(o, q) === a) { lu.pos[o][j] = -1; msg = `${LUDO_NAMES[k]} captured ${LUDO_NAMES[o]}!`; }
        });
      }
    }
    if (lu.pos[k].every(q => q === 56) && !lu.winners.includes(k)) { lu.winners.push(k); msg = `${LUDO_NAMES[k]} reached home and finished!`; }
    lu.msg = msg; lu.choices = []; lu.phase = 'roll';
    const act = luActive();
    if (act.length <= 1) {
      if (act.length === 1) lu.winners.push(act[0]);
      lu.over = true; lu.phase = 'over';
      luRender();
      return;
    }
    if (lu.winners.includes(k)) { luNext(); return; }
    if (d === 6) { luRender(); luSchedule(); return; }
    luNext();
  }

  function luNext() {
    const idx = lu.seats.indexOf(lu.turn);
    for (let s = 1; s <= lu.seats.length; s++) {
      const cand = lu.seats[(idx + s) % lu.seats.length];
      if (!lu.winners.includes(cand)) { lu.turn = cand; break; }
    }
    lu.phase = 'roll'; lu.choices = [];
    luRender(); luSchedule();
  }

  function luPick(i) {
    if (lu.phase !== 'choose' || !luIsHuman(lu.turn) || !lu.choices.includes(i)) return;
    luMove(lu.turn, i);
  }

  function luAiPick(k) {
    setTimeout(() => {
      if (lu.over || lu.phase !== 'choose' || lu.turn !== k) return;
      let best = lu.choices[0], bestS = -Infinity;
      for (const i of lu.choices) {
        const p = lu.pos[k][i], np = p === -1 ? 0 : p + lu.dice;
        let s = np / 10;
        if (np === 56) s += 100;
        if (p === -1) s += 30;
        if (np <= 50) {
          const a = luAbs(k, np);
          if (LUDO_SAFE.has(a)) s += 5;
          else for (const o of lu.seats) {
            if (o === k) continue;
            lu.pos[o].forEach(q => { if (q >= 0 && q <= 50 && luAbs(o, q) === a) s += 60; });
          }
        }
        if (s > bestS) { bestS = s; best = i; }
      }
      luMove(k, best);
    }, 650);
  }

  function luRender() {
    if (activeGame !== 'ludo') return;
    const body = $('gmBody');
    if (!lu.started) {
      body.innerHTML = `
        <p class='note' style='margin:0 0 14px;text-align:center'>Choose the number of players and how you want to play.</p>
        <div class='lvlwrap'>${[2, 3, 4].map(n => `<button class='lvl${lu.n === n ? ' on' : ''}' data-n='${n}'><b>${n} players</b><span>${n === 2 ? 'Red and Yellow sit opposite each other.' : n === 3 ? 'Red, Green and Yellow.' : 'All four colours.'}</span></button>`).join('')}</div>
        <div class='lvlwrap' style='margin-top:10px'>
          <button class='lvl${lu.mode === 'ai' ? ' on' : ''}' data-m='ai'><b>Play vs AI</b><span>You are Red. The other seats are played by the computer.</span></button>
          <button class='lvl${lu.mode === 'pass' ? ' on' : ''}' data-m='pass'><b>Pass and play</b><span>Everyone takes turns on this device.</span></button>
        </div>
        <div class='btns' style='justify-content:center;margin-top:16px'><button class='primary' id='luStartBtn'>Start game</button></div>`;
      body.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { lu.n = +b.dataset.n; luRender(); });
      body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { lu.mode = b.dataset.m; luRender(); });
      $('luStartBtn').onclick = () => luBegin(lu.n, lu.mode);
      return;
    }
    const occ = {};
    for (const k of lu.seats) {
      lu.pos[k].forEach((p, i) => {
        const [r, c] = luCoord(k, p, i), key = r * 15 + c;
        (occ[key] = occ[key] || []).push({ k, i });
      });
    }
    const choices = (lu.phase === 'choose' && luIsHuman(lu.turn)) ? lu.choices : [];
    let cells = '';
    for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) {
      const key = r * 15 + c, list = occ[key] || [], small = list.length > 1;
      const toks = list.map(t => {
        const can = t.k === lu.turn && choices.includes(t.i);
        return `<span class='tok${small ? ' small' : ''}${can ? ' clickable' : ''}' data-k='${t.k}' data-i='${t.i}' style='background:${LUDO_COLORS[t.k]}'>${t.i + 1}</span>`;
      }).join('');
      const slot = LUDO_BASE.some(list => list.some(([sr, sc]) => sr * 15 + sc === key));
      cells += `<div class='lc ${LUDO_CELLS[key] || 'emp'}${slot ? ' slot' : ''}'>${toks}</div>`;
    }
    const canRoll = !lu.over && lu.phase === 'roll' && luIsHuman(lu.turn) && !lu.busy;
    const status = lu.over ? 'Game over' : `${LUDO_NAMES[lu.turn]}'s turn${luIsHuman(lu.turn) ? '' : ' (AI)'}`;
    const results = lu.over ? `<div class='gcard' style='margin-top:12px'><div class='gname'>Results</div>${lu.winners.map((k, idx) => `<div class='row'><span>${idx + 1}. ${LUDO_NAMES[k]}</span><span>${luIsHuman(k) ? 'You' : 'AI'}</span></div>`).join('')}</div>` : '';
    body.innerHTML = `
      <div class='status'>${status}</div>
      <div class='ludo'>${cells}</div>
      <div class='dicerow'><div class='die${lu.rolling ? ' spin' : ''}'>${lu.dice || '–'}</div><button class='primary' id='luRoll'${canRoll ? '' : ' disabled'}>Roll dice</button></div>
      <div class='note' style='text-align:center'>${lu.msg}</div>
      ${results}
      <div class='btns' style='justify-content:center;margin-top:12px'><button id='luNew'>New game</button><button id='luSetup'>Change setup</button></div>`;
    body.querySelectorAll('.tok.clickable').forEach(el => el.onclick = () => luPick(+el.dataset.i));
    $('luRoll').onclick = () => luRoll();
    $('luNew').onclick = () => luBegin(lu.n, lu.mode);
    $('luSetup').onclick = () => { lu.started = false; luRender(); };
  }

  function showLudo() {
    activeGame = 'ludo';
    $('gmTitle').textContent = 'Ludo';
    $('gmBack').style.display = '';
    luRender();
  }

  /* ---------- Shared controls for racing and football ---------- */
  const KEYS = new Set(), TOUCH = new Set(), TAP = new Set();
  const KEYMAP = { left: ['arrowleft', 'a'], right: ['arrowright', 'd'], up: ['arrowup', 'w'], down: ['arrowdown', 's'], gas: ['arrowup', 'w'], brake: ['arrowdown', 's'], nitro: ['shift'], drift: [' '], sprint: ['shift'] };
  const TAPKEY = { z: 'pass', x: 'shoot', c: 'tackle' };
  const held = n => (KEYMAP[n] || []).some(k => KEYS.has(k)) || TOUCH.has(n);
  const tapped = n => { if (TAP.has(n)) { TAP.delete(n); return true; } return false; };
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (activeGame === 'race' || activeGame === 'football') {
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!e.repeat && activeGame === 'football' && TAPKEY[k]) TAP.add(TAPKEY[k]);
    }
    KEYS.add(k);
  });
  window.addEventListener('keyup', e => KEYS.delete(e.key.toLowerCase()));
  window.addEventListener('pointerup', () => TOUCH.clear());
  window.addEventListener('pointercancel', () => TOUCH.clear());
  window.addEventListener('blur', () => { KEYS.clear(); TOUCH.clear(); });
  function bindPad(root) {
    root.querySelectorAll('[data-hold]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); TOUCH.add(b.dataset.hold); }));
    root.querySelectorAll('[data-tap]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); TAP.add(b.dataset.tap); }));
  }
  const fmtClock = t => { const s = Math.max(0, Math.floor(t)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const ordinal = n => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';

  /* ---------- Car racing ---------- */
  const RC_CARS = [
    { name: 'Sprinter', color: '#ef4444', maxV: 620, accel: 300, turn: 2.1, grip: 8, note: 'Top speed' },
    { name: 'Balanced', color: '#3b82f6', maxV: 560, accel: 270, turn: 2.5, grip: 10, note: 'All round' },
    { name: 'Roadster', color: '#22c55e', maxV: 510, accel: 250, turn: 3.0, grip: 13, note: 'Handling' },
    { name: 'Rally', color: '#f97316', maxV: 580, accel: 290, turn: 2.8, grip: 11, note: 'Balanced power' }
  ];
  const RC_TRACKS = [
    { name: 'Oval Park', rx: 560, ry: 340, wob: [0.12, 0.06, 3, 5] },
    { name: 'Twisty Hills', rx: 540, ry: 340, wob: [0.22, 0.12, 4, 7] }
  ];
  const RC_N = 360, RC_HALF = 46;
  const rc = { started: false, car: 0, track: 0, laps: 3, state: 'setup', cars: [], pts: [], raceT: 0, cd: 0, last: 0, raf: 0, msg: '', msgT: 0, lapTimes: [], lapStart: 0, finishOrder: [], resultText: '' };

  function rcBuildTrack(tr) {
    const pts = [];
    for (let i = 0; i < RC_N; i++) {
      const t = 2 * Math.PI * i / RC_N, w = tr.wob;
      const r = 1 + w[0] * Math.sin(w[2] * t) + w[1] * Math.cos(w[3] * t);
      pts.push([800 + tr.rx * r * Math.cos(t), 500 + tr.ry * r * Math.sin(t)]);
    }
    return pts;
  }
  function rcWrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function rcNearest(car) {
    let best = car.idx, bd = Infinity;
    for (let k = -25; k <= 25; k++) {
      const j = (car.idx + k + RC_N) % RC_N, p = rc.pts[j];
      const d = (p[0] - car.x) * (p[0] - car.x) + (p[1] - car.y) * (p[1] - car.y);
      if (d < bd) { bd = d; best = j; }
    }
    return { idx: best, dist: Math.sqrt(bd) };
  }
  function rcMakeCars() {
    const cars = [], colors = ['#f59e0b', '#a855f7', '#14b8a6'];
    for (let i = 0; i < 4; i++) {
      const isP = i === 0;
      const st = isP ? RC_CARS[rc.car] : RC_CARS[i % 3];
      const idx0 = (RC_N - i * 10) % RC_N;
      const p = rc.pts[idx0], q = rc.pts[(idx0 + 1) % RC_N];
      const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const side = (i % 2 ? 1 : -1) * 22;
      cars.push({ x: p[0] - Math.sin(a) * side, y: p[1] + Math.cos(a) * side, a, vx: 0, vy: 0, v: 0, idx: idx0, lap: isP ? 0 : -1, prog: 0, finished: false, finishT: 0, isP, st, color: isP ? st.color : colors[i - 1], nitro: 100, skill: isP ? 1 : 0.86 + Math.random() * 0.12, offT: false });
    }
    return cars;
  }

  function rcBegin() {
    rc.pts = rcBuildTrack(RC_TRACKS[rc.track]);
    rc.cars = rcMakeCars();
    rc.started = true; rc.state = 'count'; rc.cd = 3;
    rc.raceT = 0; rc.lapTimes = []; rc.lapStart = 0; rc.finishOrder = []; rc.msg = ''; rc.msgT = 0; rc.resultText = '';
    rc.last = 0;
    rcRender();
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
    if (!rc.raf) rc.raf = requestAnimationFrame(rcLoop);
  }

  function rcPhysics(car, dt, inp) {
    const st = car.st;
    let fx = Math.cos(car.a), fy = Math.sin(car.a), rx = -fy, ry = fx;
    let vf = car.vx * fx + car.vy * fy, lat = car.vx * rx + car.vy * ry;
    const nitroOn = inp.nitro && car.nitro > 0;
    if (nitroOn) car.nitro = Math.max(0, car.nitro - 28 * dt);
    const topV = st.maxV * (nitroOn ? 1.35 : 1) * (car.offT ? 0.6 : 1);
    if (inp.gas) vf += st.accel * (nitroOn ? 1.5 : 1) * dt * Math.max(0.15, 1 - Math.max(0, vf) / topV);
    if (inp.brake) vf -= 480 * dt;
    if (!inp.gas && !inp.brake) vf -= vf * 0.35 * dt;
    if (vf > topV) vf -= (vf - topV) * 2 * dt;
    if (vf < -160) vf = -160;
    if (car.offT) vf -= vf * 1.2 * dt;
    const drift = inp.drift && Math.abs(vf) > 120;
    lat *= Math.exp(-(drift ? 2.2 : st.grip) * dt);
    if (drift) vf -= vf * 0.25 * dt;
    const sp = Math.min(1, Math.abs(vf) / 200);
    car.a += inp.steer * st.turn * sp * dt * (vf < 0 ? -1 : 1) * (drift ? 1.35 : 1);
    fx = Math.cos(car.a); fy = Math.sin(car.a); rx = -fy; ry = fx;
    car.vx = fx * vf + rx * lat; car.vy = fy * vf + ry * lat;
    car.x += car.vx * dt; car.y += car.vy * dt;
    car.v = vf;
  }

  function rcAi(car) {
    const tp = rc.pts[(car.idx + 14) % RC_N];
    const diff = rcWrap(Math.atan2(tp[1] - car.y, tp[0] - car.x) - car.a);
    const vmax = car.st.maxV * car.skill * (car.offT ? 0.6 : 0.92);
    return { steer: Math.max(-1, Math.min(1, diff * 2.4)), gas: car.v < vmax && Math.abs(diff) < 1.1, brake: Math.abs(diff) > 1.1 && car.v > 240, nitro: false, drift: false };
  }

  function rcRanks() {
    return rc.cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishT - b.finishT;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.prog - a.prog;
    });
  }

  function rcUpdate(dt) {
    if (rc.msgT > 0) rc.msgT -= dt;
    if (rc.state === 'count') {
      rc.cd -= dt;
      if (rc.cd <= 0) { rc.state = 'race'; rc.msg = 'GO!'; rc.msgT = 1; }
      return;
    }
    if (rc.state !== 'race') return;
    rc.raceT += dt;
    const pl = { steer: (held('right') ? 1 : 0) - (held('left') ? 1 : 0), gas: held('gas'), brake: held('brake'), nitro: held('nitro'), drift: held('drift') };
    for (const car of rc.cars) {
      const inp = car.finished ? { steer: 0, gas: false, brake: true, nitro: false, drift: false } : (car.isP ? pl : rcAi(car));
      rcPhysics(car, dt, inp);
      const near = rcNearest(car);
      car.offT = near.dist > RC_HALF;
      const prev = car.idx, cur = near.idx;
      if (prev > RC_N * 0.8 && cur < RC_N * 0.2) {
        car.lap++;
        if (car.isP && car.lap > 0) { rc.lapTimes.push(rc.raceT - rc.lapStart); rc.lapStart = rc.raceT; }
      } else if (prev < RC_N * 0.2 && cur > RC_N * 0.8) car.lap--;
      car.idx = cur;
      car.prog = car.lap * RC_N + cur;
      if (!car.finished && car.lap >= rc.laps) {
        car.finished = true; car.finishT = rc.raceT; rc.finishOrder.push(car);
      }
    }
    for (let i = 0; i < rc.cars.length; i++) for (let j = i + 1; j < rc.cars.length; j++) {
      const a = rc.cars[i], b = rc.cars[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 28) {
        const nx = dx / d, ny = dy / d, ov = (28 - d) / 2;
        a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        a.vx *= 0.85; a.vy *= 0.85; b.vx *= 0.85; b.vy *= 0.85;
      }
    }
    const player = rc.cars[0];
    if (player.finished && rc.state === 'race') {
      rc.state = 'done';
      const place = rc.finishOrder.indexOf(player) + 1;
      const best = rc.lapTimes.length ? Math.min(...rc.lapTimes) : 0;
      rc.resultText = `Finished ${ordinal(place)} of ${rc.cars.length} in ${fmtClock(player.finishT)} (time ${player.finishT.toFixed(1)} s). Best lap ${best ? best.toFixed(1) + ' s' : '-'}.`;
      rcRender();
    } else if (rc.cars.every(c => c.finished)) {
      rc.state = 'done';
    }
  }

  function rcDraw() {
    const cv = $('rcCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, P = rc.cars[0], z = 0.72;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#43a047'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#3b983f'; for (let s = 0; s < W; s += 80) ctx.fillRect(s, 0, 40, H);
    ctx.setTransform(z, 0, 0, z, W / 2 - P.x * z, H / 2 - P.y * z);
    const pts = rc.pts;
    ctx.beginPath();
    pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = RC_HALF * 2 + 10; ctx.stroke(); ctx.setLineDash([12, 12]); ctx.strokeStyle = '#dc2626'; ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#4b5058'; ctx.lineWidth = RC_HALF * 2; ctx.stroke();
    ctx.setLineDash([18, 16]); ctx.strokeStyle = 'rgba(248,250,252,0.6)'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
    const s0 = pts[0], s1 = pts[1], sa = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
    ctx.save(); ctx.translate(s0[0], s0[1]); ctx.rotate(sa); ctx.fillStyle = '#fff'; ctx.fillRect(-4, -RC_HALF, 8, RC_HALF * 2); ctx.restore();
    for (const c of rc.cars) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
      ctx.fillStyle = c.color; ctx.fillRect(-20, -11, 40, 22); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-20, -2, 40, 4); ctx.fillStyle = '#fde047'; ctx.fillRect(16, -9, 4, 4); ctx.fillRect(16, 5, 4, 4);
      ctx.fillStyle = '#bfe3ff'; ctx.fillRect(4, -8, 9, 16);
      ctx.fillStyle = '#111'; ctx.fillRect(-18, -14, 8, 4); ctx.fillRect(-18, 10, 8, 4); ctx.fillRect(10, -14, 8, 4); ctx.fillRect(10, 10, 8, 4);
      if (c.isP) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-21, -12, 42, 24); }
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (rc.state === 'count') {
      ctx.fillStyle = '#fff'; ctx.font = '800 96px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(Math.max(1, Math.ceil(rc.cd))), W / 2, H / 2 + 30);
      ctx.textAlign = 'left';
    }
  }

  function rcHud() {
    const el = id => document.getElementById(id);
    if (!el('rcPos')) return;
    const p = rc.cars[0];
    el('rcPos').textContent = (rcRanks().indexOf(p) + 1) + ' / ' + rc.cars.length;
    el('rcLap').textContent = Math.min(rc.laps, Math.max(1, p.lap + 1)) + ' / ' + rc.laps;
    el('rcTime').textContent = rc.raceT.toFixed(1);
    el('rcSpd').textContent = Math.round(Math.abs(p.v) * 0.36);
    el('rcNit').style.width = p.nitro + '%';
    let m = rc.resultText;
    if (rc.state === 'count') m = 'Get ready';
    else if (rc.msgT > 0) m = rc.msg;
    el('rcMsg').textContent = m;
  }

  function rcRender() {
    if (activeGame !== 'race') return;
    const body = $('gmBody');
    if (!rc.started) {
      body.innerHTML = `
        <div class='label' style='align-self:flex-start'>Car</div>
        <canvas id='rcPrev' width='320' height='140'></canvas>
        <div class='lvlwrap'>${RC_CARS.map((c, i) => `<button class='lvl${rc.car === i ? ' on' : ''}' data-car='${i}'><b><span class='swatch' style='background:${c.color}'></span>${c.name}</b><span>${c.note} · top speed ${c.maxV}</span></button>`).join('')}</div>
        <div class='label' style='align-self:flex-start;margin-top:12px'>Track</div>
        <div class='lvlwrap'>${RC_TRACKS.map((t, i) => `<button class='lvl${rc.track === i ? ' on' : ''}' data-track='${i}'><b>${t.name}</b><span>${i === 0 ? 'Wide, smooth bends' : 'Tight, twisty bends'}</span></button>`).join('')}</div>
        <div class='btns' style='justify-content:center;margin-top:12px'>${[2, 3, 5].map(n => `<button class='${rc.laps === n ? 'primary' : ''}' data-laps='${n}'>${n} laps</button>`).join('')}</div>
        <div class='btns' style='justify-content:center;margin-top:16px'><button class='primary' id='rcStart'>Start race</button></div>
        <div class='note' style='text-align:center;margin-top:10px'>Arrows or WASD to drive, Space to drift, Shift for nitro. On phones use the buttons under the track.</div>`;
      body.querySelectorAll('[data-car]').forEach(b => b.onclick = () => { rc.car = +b.dataset.car; rcRender(); });
      body.querySelectorAll('[data-track]').forEach(b => b.onclick = () => { rc.track = +b.dataset.track; rcRender(); });
      body.querySelectorAll('[data-laps]').forEach(b => b.onclick = () => { rc.laps = +b.dataset.laps; rcRender(); });
      $('rcStart').onclick = () => rcBegin();
      rcPreview();
      return;
    }
    body.innerHTML = `
      <div class='hud'><span>Pos <b id='rcPos'>-</b></span><span>Lap <b id='rcLap'>-</b></span><span>Time <b id='rcTime'>0.0</b> s</span><span>Speed <b id='rcSpd'>0</b> km/h</span><span>Nitro <span class='nbar'><i id='rcNit'></i></span></span></div>
      <div class='rotate' id='rcRotate'>Turn your phone sideways to play.<br>The race pauses until the screen is landscape.</div>
      <canvas class='gcanvas' id='rcCanvas' width='960' height='540'></canvas>
      <div class='note' style='text-align:center;min-height:20px' id='rcMsg'></div>
      <div class='pad'>
        <button class='pbtn' data-hold='left'>◀</button>
        <button class='pbtn' data-hold='right'>▶</button>
        <button class='pbtn' data-hold='gas'>GAS</button>
        <button class='pbtn' data-hold='brake'>BRAKE</button>
        <button class='pbtn' data-hold='drift'>DRIFT</button>
        <button class='pbtn' data-hold='nitro'>NITRO</button>
      </div>
      <div class='btns' style='justify-content:center;margin-top:10px'><button id='rcAgain'>Restart</button><button id='rcSetup'>Change setup</button></div>`;
    bindPad(body);
    $('rcAgain').onclick = () => rcBegin();
    $('rcSetup').onclick = () => { rc.started = false; rcRender(); };
  }

  function rcPortrait() { return window.innerHeight > window.innerWidth; }
  function rcShowRotate(show) { const el = document.getElementById('rcRotate'); if (el) el.classList.toggle('show', show); }
  function rcPreview() {
    const cv = document.getElementById('rcPrev');
    if (!cv) return;
    const ctx = cv.getContext('2d'), c = RC_CARS[rc.car];
    ctx.fillStyle = '#43a047'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.save(); ctx.translate(cv.width / 2, cv.height / 2 - 8); ctx.scale(2.6, 2.6);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 14, 24, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(-18, -14, 8, 4); ctx.fillRect(-18, 10, 8, 4); ctx.fillRect(10, -14, 8, 4); ctx.fillRect(10, 10, 8, 4);
    ctx.fillStyle = c.color; ctx.fillRect(-20, -11, 40, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-20, -2, 40, 4);
    ctx.fillStyle = '#bfe3ff'; ctx.fillRect(4, -8, 9, 16);
    ctx.fillStyle = '#fde047'; ctx.fillRect(16, -9, 4, 4); ctx.fillRect(16, 5, 4, 4);
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '700 14px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(c.name + ' · top speed ' + c.maxV, cv.width / 2, cv.height - 10);
    ctx.textAlign = 'left';
  }

  function rcLoop(now) {
    if (activeGame !== 'race') { rc.raf = 0; return; }
    rc.raf = requestAnimationFrame(rcLoop);
    if (!rc.last) rc.last = now;
    const dt = Math.min(0.05, (now - rc.last) / 1000);
    rc.last = now;
    if (rc.started) { const portrait = rcPortrait(); rcShowRotate(portrait); if (!portrait) rcUpdate(dt); rcDraw(); rcHud(); }
  }

  function showRace() {
    activeGame = 'race';
    $('gmTitle').textContent = 'Car Racing';
    $('gmBack').style.display = '';
    rcRender();
    if (!rc.raf) { rc.last = 0; rc.raf = requestAnimationFrame(rcLoop); }
  }

  /* ---------- Football (5 v 5, top-down) ---------- */
  const FB_W = 1000, FB_H = 600;
  const FB_KITS = [{ name: 'Blue', c: '#2563eb' }, { name: 'Green', c: '#16a34a' }, { name: 'Gold', c: '#f59e0b' }, { name: 'Purple', c: '#9333ea' }];
  const FB_BASE = [[60, 300], [210, 190], [210, 410], [380, 240], [380, 360]];
  const fb = { started: false, kit: 0, half: 60, period: 1, clock: 60, score: [0, 0], players: [], ball: null, me: 0, over: false, msg: '', msgT: 0, stopT: 0, raf: 0, last: 0 };
  const chance = (rate, dt) => Math.random() < 1 - Math.exp(-rate * dt);
  const fbDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function fbBase(t, i) { const b = FB_BASE[i]; return t === 0 ? b : [FB_W - b[0], b[1]]; }
  function fbKickoff(team) {
    fb.players = [];
    for (let t = 0; t < 2; t++) for (let i = 0; i < 5; i++) {
      const b = fbBase(t, i);
      fb.players.push({ team: t, idx: i, hx: b[0], hy: b[1], x: b[0], y: b[1], vx: 0, vy: 0, fx: t === 0 ? 1 : -1, fy: 0 });
    }
    fb.ball = { x: 500, y: 300, vx: 0, vy: 0, owner: team * 5 + 3, cool: 0 };
  }
  function fbBegin() {
    fb.period = 1; fb.clock = fb.half; fb.score = [0, 0]; fb.over = false;
    fb.msg = 'Kick off!'; fb.msgT = 1.5; fb.stopT = 0;
    fbKickoff(0);
    fb.started = true;
    fbRender();
    if (!fb.raf) { fb.last = 0; fb.raf = requestAnimationFrame(fbLoop); }
  }

  function fbControlled() {
    const b = fb.ball;
    if (b.owner >= 0 && fb.players[b.owner].team === 0) return b.owner;
    let best = -1, bd = Infinity;
    fb.players.forEach((p, g) => {
      if (p.team !== 0 || p.idx === 0) return;
      const d = fbDist(p, b);
      if (d < bd) { bd = d; best = g; }
    });
    return best;
  }
  function fbNearest() {
    const near = [-1, -1], bestD = [Infinity, Infinity];
    fb.players.forEach((p, g) => {
      if (p.idx === 0) return;
      const d = fbDist(p, fb.ball);
      if (d < bestD[p.team]) { bestD[p.team] = d; near[p.team] = g; }
    });
    return near;
  }
  function fbTarget(g, near) {
    const p = fb.players[g], b = fb.ball, t = p.team;
    const owner = b.owner >= 0 ? fb.players[b.owner] : null;
    if (p.idx === 0) return { x: t === 0 ? 40 : FB_W - 40, y: Math.min(360, Math.max(240, b.y)) };
    if (owner && owner.team === t) {
      if (b.owner === g) return { x: t === 0 ? FB_W : 0, y: 300 };
      return { x: p.hx + (b.x - 500) * 0.5 + (p.idx >= 3 ? (t === 0 ? 60 : -60) : 0), y: p.hy + (b.y - 300) * 0.35 };
    }
    if (near[t] === g) return { x: b.x, y: b.y };
    return { x: p.hx + (b.x - 500) * 0.35, y: p.hy + (b.y - 300) * 0.35 };
  }
  function fbMove(p, tx, ty, sp, dt) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > 3) {
      p.fx = dx / d; p.fy = dy / d;
      const s = Math.min(sp, d / dt);
      p.vx = p.fx * s; p.vy = p.fy * s;
    } else { p.vx = 0; p.vy = 0; }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }

  function fbKick(g, tx, ty, power) {
    const p = fb.players[g], b = fb.ball;
    b.owner = -1;
    b.x = p.x + p.fx * 18; b.y = p.y + p.fy * 18;
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
    b.vx = dx / d * power; b.vy = dy / d * power;
    b.cool = 0.4;
  }
  function fbPass(g) {
    const p = fb.players[g];
    let best = -1, bd = Infinity;
    fb.players.forEach((q, h) => {
      if (h === g || q.team !== p.team || q.idx === 0) return;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d < 2 || d > 420) return;
      const dot = (dx * p.fx + dy * p.fy) / d;
      if (dot > 0.35 && d < bd) { bd = d; best = h; }
    });
    if (best >= 0) { const q = fb.players[best]; fbKick(g, q.x + q.vx * 0.25, q.y + q.vy * 0.25, 470); }
    else fbKick(g, p.x + p.fx * 220, p.y + p.fy * 220, 380);
  }
  function fbShoot(g) {
    const p = fb.players[g];
    fbKick(g, p.team === 0 ? FB_W + 100 : -100, 300 + (Math.random() - 0.5) * 90, 720);
  }
  function fbTackle(g) {
    const p = fb.players[g], b = fb.ball;
    let best = -1, bd = 30;
    fb.players.forEach((q, h) => {
      if (q.team === p.team) return;
      const d = fbDist(q, p);
      if (d < bd) { bd = d; best = h; }
    });
    if (best < 0 || b.owner !== best) return;
    if (Math.random() < 0.6) b.owner = g;
    else { b.owner = -1; b.vx = (Math.random() - 0.5) * 260; b.vy = (Math.random() - 0.5) * 260; b.cool = 0.3; }
  }

  function fbScored(team) {
    fb.score[team]++;
    fb.msg = 'GOAL! ' + (team === 0 ? 'Home' : 'Away') + ' scores';
    fb.msgT = 2.2; fb.stopT = 2.2;
    fbKickoff(1 - team);
  }

  function fbStep(dt) {
    if (fb.over) return;
    const b = fb.ball;
    b.cool = Math.max(0, b.cool - dt);
    if (fb.msgT > 0) fb.msgT -= dt;
    if (fb.stopT > 0) { fb.stopT -= dt; return; }
    fb.clock -= dt;
    if (fb.clock <= 0) {
      if (fb.period === 1) {
        fb.period = 2; fb.clock = fb.half; fbKickoff(1);
        fb.msg = 'Half time'; fb.msgT = 2.5; fb.stopT = 2.5;
      } else {
        fb.over = true; fb.clock = 0; fb.msg = 'Full time'; fb.msgT = 999;
        fbRender();
      }
      return;
    }
    const me = fbControlled(); fb.me = me;
    const near = fbNearest();
    const pass = tapped('pass'), shoot = tapped('shoot'), tackle = tapped('tackle');
    if (pass && b.owner === me) fbPass(me);
    if (shoot && (b.owner === me || fbDist(fb.players[me], b) < 26)) fbShoot(me);
    if (tackle) fbTackle(me);

    fb.players.forEach((p, g) => {
      if (g === me) {
        const dx = (held('right') ? 1 : 0) - (held('left') ? 1 : 0), dy = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
        const d = Math.hypot(dx, dy), sp = held('sprint') ? 240 : 165;
        if (d > 0) { p.fx = dx / d; p.fy = dy / d; p.vx = p.fx * sp; p.vy = p.fy * sp; } else { p.vx = 0; p.vy = 0; }
        p.x += p.vx * dt; p.y += p.vy * dt;
      } else {
        const tg = fbTarget(g, near);
        fbMove(p, tg.x, tg.y, p.idx === 0 ? 190 : (near[p.team] === g ? 175 : 150), dt);
      }
      p.x = Math.min(FB_W - 12, Math.max(12, p.x));
      p.y = Math.min(FB_H - 12, Math.max(12, p.y));
    });
    for (let i = 0; i < fb.players.length; i++) for (let j = i + 1; j < fb.players.length; j++) {
      const a = fb.players[i], c = fb.players[j];
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 22) {
        const o = (22 - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * o; a.y -= ny * o; c.x += nx * o; c.y += ny * o;
      }
    }
    if (b.owner >= 0 && b.owner !== me) {
      const op = fb.players[b.owner];
      const goalX = op.team === 0 ? FB_W : 0;
      if (Math.abs(goalX - op.x) < 240 && chance(0.6, dt)) fbShoot(b.owner);
      else if (chance(0.35, dt)) fbPass(b.owner);
    }
    if (b.owner >= 0) {
      const op = fb.players[b.owner];
      fb.players.forEach((p, g) => {
        if (g === me || g === b.owner || p.team === op.team || p.idx === 0) return;
        if (fbDist(p, b) < 22 && chance(0.5, dt)) b.owner = g;
      });
    }
    if (b.owner >= 0) {
      const p = fb.players[b.owner];
      b.x = p.x + p.fx * 16; b.y = p.y + p.fy * 16; b.vx = 0; b.vy = 0;
    } else {
      b.x += b.vx * dt; b.y += b.vy * dt;
      const damp = Math.exp(-1.4 * dt);
      b.vx *= damp; b.vy *= damp;
      if (Math.hypot(b.vx, b.vy) < 6) { b.vx = 0; b.vy = 0; }
      if (b.cool <= 0 && Math.hypot(b.vx, b.vy) < 320) {
        for (let g = 0; g < fb.players.length; g++) {
          if (fbDist(fb.players[g], b) < 18) { b.owner = g; break; }
        }
      }
      if (b.y < 8) { b.y = 8; b.vy = Math.abs(b.vy) * 0.6; }
      if (b.y > FB_H - 8) { b.y = FB_H - 8; b.vy = -Math.abs(b.vy) * 0.6; }
    }
    if (b.x > FB_W - 2 || b.x < 2) {
      if (b.y > 232 && b.y < 368) { fbScored(b.x > FB_W - 2 ? 0 : 1); return; }
      b.x = Math.min(FB_W - 8, Math.max(8, b.x));
      b.vx = -b.vx * 0.6;
    }
  }

  function fbDraw() {
    const cv = $('fbCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#2e7d32' : '#33873a'; ctx.fillRect(i * 100, 0, 100, FB_H); }
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, FB_W - 24, FB_H - 24);
    ctx.beginPath(); ctx.moveTo(500, 12); ctx.lineTo(500, FB_H - 12); ctx.stroke();
    ctx.beginPath(); ctx.arc(500, 300, 70, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(500, 300, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeRect(12, 160, 150, 280); ctx.strokeRect(FB_W - 162, 160, 150, 280);
    ctx.strokeRect(12, 230, 50, 140); ctx.strokeRect(FB_W - 62, 230, 50, 140);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 232, 8, 136); ctx.fillRect(FB_W - 8, 232, 8, 136);
    for (let g = 0; g < fb.players.length; g++) {
      const p = fb.players[g];
      ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = p.idx === 0 ? (p.team === 0 ? '#facc15' : '#06b6d4') : (p.team === 0 ? FB_KITS[fb.kit].c : '#dc2626');
      ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
      if (g === fb.me) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(p.idx + 1), p.x, p.y + 4);
    }
    ctx.textAlign = 'left';
    ctx.beginPath(); ctx.arc(fb.ball.x, fb.ball.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
  }

  function fbHud() {
    if (!document.getElementById('fbS0')) return;
    document.getElementById('fbS0').textContent = fb.score[0];
    document.getElementById('fbS1').textContent = fb.score[1];
    document.getElementById('fbT').textContent = (fb.period === 1 ? '1st' : '2nd') + ' half  ' + fmtClock(fb.clock);
    document.getElementById('fbMsg').textContent = fb.msgT > 0 ? fb.msg : '';
  }

  function fbRender() {
    if (activeGame !== 'football') return;
    const body = $('gmBody');
    if (!fb.started) {
      body.innerHTML = `
        <div class='label' style='align-self:flex-start'>Your kit</div>
        <div class='lvlwrap' style='flex-direction:row;flex-wrap:wrap'>${FB_KITS.map((k, i) => `<button class='lvl${fb.kit === i ? ' on' : ''}' style='width:auto;flex:1 1 130px' data-kit='${i}'><b><span class='swatch' style='background:${k.c}'></span>${k.name}</b></button>`).join('')}</div>
        <div class='label' style='align-self:flex-start;margin-top:12px'>Match length</div>
        <div class='btns' style='justify-content:center'>${[60, 90].map(h => `<button class='${fb.half === h ? 'primary' : ''}' data-half='${h}'>${h === 60 ? 'Short (2 x 1 min)' : 'Normal (2 x 1.5 min)'}</button>`).join('')}</div>
        <div class='btns' style='justify-content:center;margin-top:16px'><button class='primary' id='fbStart'>Kick off</button></div>
        <div class='note' style='text-align:center;margin-top:10px'>5 v 5 on a small pitch. Arrows or WASD to move, Z pass, X shoot, C tackle, Shift sprint. Touch buttons appear under the pitch on phones.</div>`;
      body.querySelectorAll('[data-kit]').forEach(b => b.onclick = () => { fb.kit = +b.dataset.kit; fbRender(); });
      body.querySelectorAll('[data-half]').forEach(b => b.onclick = () => { fb.half = +b.dataset.half; fbRender(); });
      $('fbStart').onclick = () => fbBegin();
      return;
    }
    const result = fb.over ? `<div class='gcard' style='margin-top:12px;text-align:center'><div class='gname'>Full time</div><div style='font-size:22px;font-weight:700;margin:6px 0'>Home ${fb.score[0]} - ${fb.score[1]} Away</div><div class='note'>${fb.score[0] > fb.score[1] ? 'Home win' : fb.score[0] < fb.score[1] ? 'Away win' : 'Draw'}</div></div>` : '';
    const again = fb.over ? "<button class='primary' id='fbAgain'>Play again</button>" : '';
    body.innerHTML = `
      <div class='hud'><span>Home <b id='fbS0'>0</b></span><span><b id='fbT'>--</b></span><span>Away <b id='fbS1'>0</b></span></div>
      <canvas class='gcanvas' id='fbCanvas' width='1000' height='600'></canvas>
      <div class='note' style='text-align:center;min-height:20px;font-weight:600' id='fbMsg'></div>
      ${result}
      <div class='pad'>
        <div class='dpad'>
          <span></span><button class='pbtn' data-hold='up'>▲</button><span></span>
          <button class='pbtn' data-hold='left'>◀</button><span></span><button class='pbtn' data-hold='right'>▶</button>
          <span></span><button class='pbtn' data-hold='down'>▼</button><span></span>
        </div>
        <div class='acts'>
          <button class='pbtn' data-tap='pass'>PASS<br><small>Z</small></button>
          <button class='pbtn' data-tap='shoot'>SHOOT<br><small>X</small></button>
          <button class='pbtn' data-tap='tackle'>TACKLE<br><small>C</small></button>
          <button class='pbtn' data-hold='sprint'>SPRINT<br><small>Shift</small></button>
        </div>
      </div>
      <div class='btns' style='justify-content:center;margin-top:10px'>${again}<button id='fbSetup'>Change setup</button></div>`;
    bindPad(body);
    if ($('fbAgain')) $('fbAgain').onclick = () => fbBegin();
    $('fbSetup').onclick = () => { fb.started = false; fb.over = false; fbRender(); };
    fbHud();
  }

  function fbLoop(now) {
    if (activeGame !== 'football') { fb.raf = 0; return; }
    fb.raf = requestAnimationFrame(fbLoop);
    if (!fb.last) fb.last = now;
    const dt = Math.min(0.05, (now - fb.last) / 1000);
    fb.last = now;
    if (fb.started && !fb.over) { fbStep(dt); fbDraw(); fbHud(); }
  }

  function showFootball() {
    activeGame = 'football';
    $('gmTitle').textContent = 'Football';
    $('gmBack').style.display = '';
    fbRender();
    if (!fb.raf) { fb.last = 0; fb.raf = requestAnimationFrame(fbLoop); }
  }

  function openGames() { $('gamesModal').classList.add('show'); showList(); }
  function closeGames() { $('gamesModal').classList.remove('show'); }

  $('gamesBtn').onclick = openGames;
  $('gmClose').onclick = closeGames;
  $('gmBack').onclick = showList;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGames(); });
})();
/* Back to where the user came from. The link itself points at Jimmy Tube as a
   fallback, so it still works when this page was opened directly. */
(() => {
  const back = document.getElementById('back')
  if (!back) return
  back.addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault()
      window.history.back()
    }
  })
})()
