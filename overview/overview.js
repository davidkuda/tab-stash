console.log("hello world");

/*****************************************************************
 * 0)  Bootstrap – DOM handles & button wiring
 *****************************************************************/
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
    td.colSpan = 5;
    td.textContent = "No saved tabs ✨";
    tbody.append(tr);
    return;
  }

  rows.sort((a, b) => b.lastClosed - a.lastClosed);

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

    tr.insertCell().textContent = row.domain; // domain

    const tdUrl = tr.insertCell();            // URL
    const a = document.createElement("a");
    a.href = row.url;
    a.target = "_blank";
    a.textContent = row.url;
    tdUrl.append(a);

    tr.insertCell().textContent = row.count;  // count
    tr.insertCell().textContent = row.title;  // title

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
