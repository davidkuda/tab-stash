console.log("hello world");

const root   = document.getElementById("root");
const clear  = document.getElementById("clear");
const rowTpl = document.getElementById("rowTpl");

clear.onclick = async () => {
  const db = await openDB();
  db.transaction("pages", "readwrite").objectStore("pages").clear();
  render();
};

render();

async function render() {
  //-----------------------------------------------------------
  // 1‑A  Fetch rows (read‑only tx, native API)
  //-----------------------------------------------------------
  const db  = await openDB();
  const tx  = db.transaction("pages");
  const st  = tx.objectStore("pages");

  const rows = await req(st.getAll());

  await tx.done;

  root.innerHTML = ""; // reset view
  if (!rows.length) {
    root.textContent = "No saved tabs ✨";
    return;
  }

  //-----------------------------------------------------------
  // 1‑B  Group rows by domain; decide sections
  //-----------------------------------------------------------
  const map = new Map();
  rows.forEach(r => {
    const arr = map.get(r.domain) || [];
    arr.push(r);
    map.set(r.domain, arr);
  });

  const main   = [];
  const varia  = [];
  map.forEach((list, dom) => (list.length >= 3 ? main : varia).push([dom, list]));

  //-----------------------------------------------------------
  // 1‑C  Render each section using our OWN tiny VirtualList
  //-----------------------------------------------------------
  const makeSection = (label, data, showDom) => {
    // Section header
    const h2 = document.createElement("h2");
    h2.textContent = label;
    root.append(h2);

    // Flatten + sort newest→oldest
    const items = data.flatMap(([d, pages]) =>
      pages.sort((a,b)=>b.lastClosed-a.lastClosed).map(p => ({...p, domain:d}))
    );

    new VirtualList({ container: root, items, showDom });
  };

  makeSection("All domains", main, false);
  if (varia.length) makeSection("Varia", varia, true);
}

/*****************************************************************
 * 2)  Tiny dependency‑free virtual scroller
 *****************************************************************/
class VirtualList {
  constructor({ container, items, showDom }) {
    this.items = items;
    this.showDom = showDom;
    this.rowH = 28;

    // Viewport element
    this.box = document.createElement("div");
    this.box.className = "viewport";
    this.box.style.height = "400px";      // fixed viewport height
    this.box.style.overflowY = "auto";
    container.append(this.box);

    // A spacer div sets the full height so scrollbar size is right
    this.spacer = document.createElement("div");
    this.spacer.style.height = items.length * this.rowH + "px";
    this.box.append(this.spacer);

    // Small pool of recycled row elements
    this.pool = [];
    const poolSize = Math.ceil(400 / this.rowH) + 5;
    for (let i = 0; i < poolSize; i++) {
      const el = rowTpl.content.cloneNode(true).firstElementChild;
      el.style.position = "absolute";
      this.pool.push(el);
      this.box.append(el);
    }

    // Initial paint + scroll handler
    this.paint();
    this.box.addEventListener("scroll", () => this.paint());
  }

  paint() {
    const first = Math.floor(this.box.scrollTop / this.rowH);
    this.pool.forEach((el, idx) => {
      const i = first + idx;
      if (i >= this.items.length) { el.style.display = "none"; return; }
      const data = this.items[i];
      el.style.display = "flex";
      el.style.top = i * this.rowH + "px";

      const link = el.querySelector(".link");
      const cnt  = el.querySelector(".cnt");
      link.href = data.url;
      link.textContent = `${this.showDom ? `[${data.domain}] ` : ""}${data.title}`;
      link.onclick = () => chrome.tabs.create({ url: data.url });
      cnt.textContent = data.count > 1 ? ` (${data.count})` : "";
    });
  }
}

/*****************************************************************
 * 3)  Same tiny helpers used in background.js (duplicated here to
 *     avoid an extra import while staying self‑contained)
 *****************************************************************/
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("tabbundlr", 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore("pages", { keyPath: "url" });
      s.createIndex("domain", "domain");
      s.createIndex("lastClosed", "lastClosed");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}
const req = r => new Promise((res, rej) => {
  r.onsuccess = () => res(r.result);
  r.onerror   = () => rej(r.error);
});
