const OVERVIEW_URL = chrome.runtime.getURL("overview/index.html");

chrome.action.onClicked.addListener(handleClick);

async function handleClick() {

  const tabs = await chrome.tabs.query({ currentWindow: true });
  if (!tabs.length) return; // nothing to do

  //-----------------------------------------------------------
  // 2‑B  Open / create the IndexedDB database
  //-----------------------------------------------------------
  const db = await openDB();
  // Single read‑write transaction for the whole session
  const tx    = db.transaction("pages", "readwrite");
  const store = tx.objectStore("pages");

  const now = Date.now();

  //-----------------------------------------------------------
  // 2‑C  Merge each tab into the DB  (duplicate => count++)
  //-----------------------------------------------------------
  for (const tab of tabs) {
    // Skip internal pages we can’t reopen later
    if (!tab.url || tab.url.startsWith("brave:")) continue;

    const domain = getDomain(tab.url);

    // Await the request → get plain object back (see helper)
    const existing = await req(store.get(tab.url));

    if (existing) {
      existing.count      += 1;
      existing.lastClosed  = now;
      await req(store.put(existing));
    } else {
      await req(store.add({
        url: tab.url,
        domain,
        title: tab.title,
        count: 1,
        lastClosed: now
      }));
    }
  }

  //-----------------------------------------------------------
  // 2‑D  Retention sweep (age‑based & per‑domain cap)
  //-----------------------------------------------------------
  // TODO: Uncomment
  // await applyRetention(store, now);

  //-----------------------------------------------------------
  // 2‑E  Commit + close all captured tabs
  //-----------------------------------------------------------
  await tx.done;                       // atomic write completes
  // TODO: close tab once done
  // await chrome.tabs.remove(tabs.map(t => t.id));

  //-----------------------------------------------------------
  // 2‑F  Show or refresh the overview tab so the user sees
  //      what was saved *immediately*.
  //-----------------------------------------------------------
  const [existing] = await chrome.tabs.query({ url: OVERVIEW_URL });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.tabs.reload(existing.id);
  } else {
    await chrome.tabs.create({ url: OVERVIEW_URL });
  }
}

/*****************************************************************
 * Helper: open (or create) the DB with native API only
 *****************************************************************/
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("tabbundlr", 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore("pages", { keyPath: "url" });
      store.createIndex("domain", "domain");
      store.createIndex("lastClosed", "lastClosed");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/*****************************************************************
 * Helper: promisify an IDBRequest so we can await it neatly
 *****************************************************************/
function req(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}

/*****************************************************************
 * Helper: domain extractor (strips leading www.)
 *****************************************************************/
const getDomain = u => {
  try { return new URL(u).hostname.replace(/^www\./, ""); }
  catch { return "unknown"; }
};

/*****************************************************************
 * Helper: retention   –  runs inside the same transaction
 *****************************************************************/
const RETENTION_DAYS   = 365;   // tweak as you like or expose via UI
const MAX_PER_DOMAIN   = 10000;


async function applyRetention(store, now) {
  // 1) Age‑based purge
  const cutoff = now - RETENTION_DAYS * 864e5;
  const idxAge = store.index("lastClosed");
  for (let c = await req(idxAge.openCursor()); c; c = await req(c.continue())) {
    if (c.value.lastClosed < cutoff) await req(c.delete());
    else break; // cursor is lastClosed ASC —> stop when fresh enough
  }

  // 2) Cap rows per domain (walk newest→oldest)
  const seen = new Map();
  const idxDom = store.index("domain");
  for (let c = await req(idxDom.openCursor(null, "prev")); c; c = await req(c.continue())) {
    const d = c.value.domain;
    const n = seen.get(d) || 0;
    if (n >= MAX_PER_DOMAIN) await req(c.delete());
    seen.set(d, n + 1);
  }
}
