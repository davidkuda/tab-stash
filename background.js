const OVERVIEW_URL = chrome.runtime.getURL("overview/index.html");
const DROP_QS = /^(utm_|fbclid|gclid|igshid|mc_[ce]id|ref|ref_src)$/i;
const RETENTION_DAYS   = 365;
const MAX_PER_DOMAIN   = 10000;


chrome.action.onClicked.addListener(handleClick);

async function handleClick() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  if (!tabs.length) return; // nothing to do

  // Single read‑write transaction for the whole session
  const db    = await openDB();
  const tx    = db.transaction("pages", "readwrite");
  const store = tx.objectStore("pages");
  const now   = Date.now();

  for (const tab of tabs) {
    if (
      !tab.url
        || tab.url.startsWith("brave:")
        || tab.url.startsWith("chrome-extension:")
    ) {
      continue;
    }

    const cleanUrl = sanitizeUrl(tab.url);
    const domain   = getDomain(cleanUrl);

    const existing = await req(store.get(cleanUrl));

    if (existing) {
      existing.count       += 1;
      existing.lastClosed   = now;
      if (!existing.icon && tab.favIconUrl) {
        existing.icon = tab.favIconUrl;
      }

      await req(store.put(existing));
    } else {
      await req(store.add({
        url:   cleanUrl,
        domain,
        title: tab.title,
        icon:  tab.favIconUrl || "",
        count: 1,
        lastClosed: now
      }));
    }
  }

  // TODO: Uncomment
  // await applyRetention(store, now);

  await tx.done;

  // TODO: uncomment: close tab once done
  // await chrome.tabs.remove(tabs.map(t => t.id));

  // once the flow is done, open the extension.
  const [existing] = await chrome.tabs.query({ url: OVERVIEW_URL });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.tabs.reload(existing.id);
  } else {
    await chrome.tabs.create({ url: OVERVIEW_URL });
  }
}

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

function req(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}

function sanitizeUrl(raw) {
  try {
    const u = new URL(raw);
    const qp = u.searchParams;
    // create a list to avoid mutating while iterating
    const toDelete = [];
    qp.forEach((_, k) => { if (DROP_QS.test(k)) toDelete.push(k); });
    toDelete.forEach(k => qp.delete(k));
    // remove trailing ? if no params left
    if ([...qp.keys()].length === 0) u.search = "";
    return u.toString();
  } catch { return raw; }
}

const getDomain = u => {
  try { return new URL(u).hostname.replace(/^www\./, ""); }
  catch { return "unknown"; }
};

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
