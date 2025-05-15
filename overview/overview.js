const tbody       = document.querySelector("#tbl tbody");
const clearBtn    = document.getElementById("clear");
const themeBtn    = document.getElementById("themeToggle");

clearBtn.addEventListener("click", async () => {
  const db = await openDB();
  const tx = db.transaction("pages", "readwrite");
  await tx.objectStore("pages").clear();
  await tx.done;
  render();
});

themeBtn.addEventListener("click", async () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  await chrome.storage.local.set({ theme: next });
});

// Load persisted theme (default = dark)
(async () => {
  const { theme = "dark" } = await chrome.storage.local.get("theme");
  applyTheme(theme);
})();

// Kick‑off first table paint
render();

/*****************************************************************
 * 1)  Table renderer – unchanged except centering via wrapper
 *****************************************************************/
async function render() {
  tbody.textContent = "";

  const db = await openDB();
  const store = db.transaction("pages").objectStore("pages");
  const rows = await promisify(store.getAll());

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const td = tr.insertCell();
    td.colSpan = 8;
    td.textContent = "No saved tabs ✨";
    tbody.append(tr);
    return;
  }

  // ---- composite sort: recent ↓  then domain ↑ then count ↓ ----
  rows.sort((a, b) => {
    // 1. newest first
    if (b.lastClosed !== a.lastClosed) {
      return b.lastClosed - a.lastClosed;
    }
    // 2. alphabetic domain
    const domCmp = a.domain.localeCompare(b.domain);
    if (domCmp !== 0) {
      return domCmp;
    }
    // 3. higher duplicate‑count first
    return b.count - a.count;
  });

  for (const row of rows) {
    const tr = document.createElement("tr");

        // favicon
    const tdIcon = tr.insertCell();
    if (row.icon) {
      const img = document.createElement("img");
      img.src = row.icon;
      img.width = 16;
      img.height = 16;
      tdIcon.append(img);
    }

    // date (YYYY‑MM‑DD)
    const created = new Date(row.lastClosed);
    tr.insertCell().textContent = created.toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    // time (24‑h HH:MM)
    tr.insertCell().textContent = created.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    // domain
    tr.insertCell().textContent = row.domain;

    // URL
    const tdUrl = tr.insertCell();
    const a = document.createElement("a");
    a.href = row.url;
    a.target = "_blank";
    a.textContent = row.url;
    tdUrl.append(a);

    // count
    tr.insertCell().textContent = row.count;

    // title
    tr.insertCell().textContent = row.title;

    // delete button
    const tdDel = tr.insertCell();
    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.title = "Delete entry";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const db = await openDB();
      const tx = db.transaction("pages", "readwrite");
      await tx.objectStore("pages").delete(row.url);
      await tx.done;
      tr.remove();
    });
    tdDel.append(delBtn);

    tbody.append(tr);
  }
}

/*****************************************************************
 * 2)  Theme helper – sets data‑theme, updates button icon
 *****************************************************************/
function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  themeBtn.textContent = mode === "dark" ? "☀️" : "🌙";
}

/*****************************************************************
 * 3)  IndexedDB helpers (unchanged)
 *****************************************************************/
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("tabbundlr", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const s = db.createObjectStore("pages", { keyPath: "url" });
      s.createIndex("domain", "domain");
      s.createIndex("lastClosed", "lastClosed");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
function promisify(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
