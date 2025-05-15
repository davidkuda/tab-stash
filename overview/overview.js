import { openDB } from "../db.js";

// ------------------------------------------------------------
// DOM references
// ------------------------------------------------------------
const tbody = document.querySelector("#tbl tbody");
const clearBtn = document.getElementById("clear");
const themeBtn = document.getElementById("themeToggle");
const searchIn = document.getElementById("search");

// column prefixes for autocomplete / slash-focus
const COL_PREFIXES = ["domain:", "url:", "title:", "date:"];

// ------------------------------------------------------------
// Event wiring
// ------------------------------------------------------------
clearBtn.addEventListener("click", async () => {
	const db = await openDB();
	await db.transaction("pages", "readwrite").objectStore("pages").clear();
	render();
});

themeBtn.addEventListener("click", async () => {
	const cur = document.documentElement.getAttribute("data-theme") || "dark";
	const next = cur === "dark" ? "light" : "dark";
	applyTheme(next);
	await chrome.storage.local.set({ theme: next });
});

let searchDebounce;
searchIn.addEventListener("input", () => {
	maybeShowHint();
	clearTimeout(searchDebounce);
	searchDebounce = setTimeout(render, 250);
});

// slash focuses search
window.addEventListener("keydown", (e) => {
	if (e.key === "/" && document.activeElement !== searchIn) {
		e.preventDefault();
		searchIn.focus();
		searchIn.select();
	}
});

// ------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------
(async () => {
	const { theme = "dark" } = await chrome.storage.local.get("theme");
	applyTheme(theme);
	await render();
})();

function applyTheme(mode) {
	document.documentElement.setAttribute("data-theme", mode);
	themeBtn.textContent = mode === "dark" ? "☀️" : "🌙";
}

// ------------------------------------------------------------
// Render
// ------------------------------------------------------------
async function render() {
	tbody.textContent = "";

	const db = await openDB();
	const store = db.transaction("pages").objectStore("pages");
	let rows = await toPromise(store.getAll());

	const query = searchIn.value.trim();
	if (query) rows = applyFilter(rows, query);

	if (rows.length === 0) {
		const td = document.createElement("td");
		td.colSpan = 6;
		td.textContent = query ? "No matches" : "No saved tabs ✨";
		const tr = document.createElement("tr");
		tr.append(td);
		tbody.append(tr);
		return;
	}

	// sort: recent ↓ , domain ↑ , count ↓
	rows.sort((a, b) => {
		if (b.lastClosed !== a.lastClosed) return b.lastClosed - a.lastClosed;
		const domainCmp = a.domain.localeCompare(b.domain);
		if (domainCmp !== 0) return domainCmp;
		return b.count - a.count;
	});

	rows.forEach((r) => tbody.append(buildRow(r)));
}

// ------------------------------------------------------------
// Row builder
// ------------------------------------------------------------
function buildRow(rec) {
	const tr = document.createElement("tr");
	const d = new Date(rec.lastClosed);

	// date & time
	tr.append(cell(d.toISOString().slice(0, 10)));
	tr.append(
		cell(
			d.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			}),
		),
	);

	// domain / count
	tr.append(cell(rec.domain));
	tr.append(cell(rec.count));

	// page (title + url)
	const tdPage = document.createElement("td");
	const top = document.createElement("div");
	top.className = "top";
	if (rec.icon) {
		const img = document.createElement("img");
		img.src = rec.icon;
		img.width = img.height = 16;
		top.append(img);
	}
	const titleSpan = document.createElement("span");
	titleSpan.textContent = rec.title;
	top.append(titleSpan);

	const bottom = document.createElement("div");
	bottom.className = "bot";
	const link = document.createElement("a");
	link.href = rec.url;
	link.target = "_blank";
	link.textContent = rec.url;
	bottom.append(link);

	tdPage.append(top, bottom);
	tr.append(tdPage);

	// delete
	const tdDel = document.createElement("td");
	const del = document.createElement("span");
	del.textContent = "✕";
	del.className = "del";
	del.title = "Delete entry";
	del.addEventListener("click", async (e) => {
		e.stopPropagation();
		const db = await openDB();
		await db
			.transaction("pages", "readwrite")
			.objectStore("pages")
			.delete(rec.url);
		tr.remove();
	});
	tdDel.append(del);
	tr.append(tdDel);

	return tr;
}

function cell(txt) {
	const td = document.createElement("td");
	td.textContent = txt;
	return td;
}

// ------------------------------------------------------------
// Search helpers
// ------------------------------------------------------------
function maybeShowHint() {
	const val = searchIn.value;
	const hit = COL_PREFIXES.find((p) => p.startsWith(val) && p !== val);
	if (hit) {
		searchIn.setAttribute("list", "colHints");
	} else {
		searchIn.removeAttribute("list");
	}
}

function applyFilter(rows, raw) {
	let field = "";
	let term = raw;
	const idx = raw.indexOf(":");
	if (idx !== -1) {
		field = raw.slice(0, idx).toLowerCase();
		term = raw.slice(idx + 1);
	}
	term = term.toLowerCase();

	return rows.filter((r) => {
		if (field === "domain") return r.domain.toLowerCase().includes(term);
		if (field === "url") return r.url.toLowerCase().includes(term);
		if (field === "title") return r.title.toLowerCase().includes(term);
		if (field === "date")
			return new Date(r.lastClosed).toISOString().slice(0, 10).includes(term);

		const hay = `${r.domain} ${r.url} ${r.title}`.toLowerCase();
		return hay.includes(term);
	});
}

function toPromise(req) {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
