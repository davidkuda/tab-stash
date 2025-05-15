console.log("hello world");

/*****************************************************************
 * 0)  Bootstrap – gather DOM handles & wire the Clear button
 *****************************************************************/
const tbody = document.querySelector("#tbl tbody");
const clearBtn = document.getElementById("clear");

clearBtn.addEventListener("click", async () => {
  const db = await openDB();
  const tx = db.transaction("pages", "readwrite");
  await tx.objectStore("pages").clear();
  await tx.done;
  render();
});

// Kick‑off the first paint
render();

/*****************************************************************
 * 1)  Main renderer – pulls all rows and builds the table
 *****************************************************************/
async function render() {
  tbody.textContent = "";              // wipe previous content

  // ---- open database (read‑only) ----
  const db = await openDB();
  const store = db.transaction("pages").objectStore("pages");

  // ---- fetch all records ----
  const rows = await promisify(store.getAll());
  if (rows.length === 0) {
    // nothing saved yet
    const tr = document.createElement("tr");
    const td = tr.insertCell();
    td.colSpan = 5;
    td.textContent = "No saved tabs ✨";
    tbody.append(tr);
    return;
  }

  // ---- newest first ----
  rows.sort((a, b) => b.lastClosed - a.lastClosed);

  // ---- build table rows ----
  for (const row of rows) {
    const tr = document.createElement("tr");

    // 0. favicon
    const tdIcon = tr.insertCell();
    if (row.icon) {
      const img = document.createElement("img");
      img.src = row.icon;
      img.width = 16;
      img.height = 16;
      tdIcon.append(img);
    }

    // 1. domain
    tr.insertCell().textContent = row.domain;

    // 2. URL (clickable)
    const tdUrl = tr.insertCell();
    const a = document.createElement("a");
    a.href = row.url;
    a.target = "_blank";
    a.textContent = row.url;
    tdUrl.append(a);

    // 3. count
    tr.insertCell().textContent = row.count;

    // 4. title
    tr.insertCell().textContent = row.title;

    tbody.append(tr);
  }
}

/*****************************************************************
 * 2)  Tiny helpers – expanded for readability (no one‑liners)
 *****************************************************************/
function openDB() {
  /**
   * Opens (or creates) the `tabbundlr` database and returns a Promise
   * with the IDBDatabase handle.  The schema is created the first
   * time via `onupgradeneeded`.
   */
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("tabbundlr", 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore("pages", { keyPath: "url" });
      store.createIndex("domain", "domain");
      store.createIndex("lastClosed", "lastClosed");
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisify(idbRequest) {
  /**
   * Wraps an IDBRequest in a Promise so we can `await` it.
   */
  return new Promise((resolve, reject) => {
    idbRequest.onsuccess = () => resolve(idbRequest.result);
    idbRequest.onerror = () => reject(idbRequest.error);
  });
}
