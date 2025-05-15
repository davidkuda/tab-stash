import { openDB } from "../db.js";

// ------------------------------------------------------------
// DOM references
// ------------------------------------------------------------
const tbody = document.querySelector("#tbl tbody");
const clearBtn = document.getElementById("clear");
const themeBtn = document.getElementById("themeToggle");
const searchIn = document.getElementById("search");

// ------------------------------------------------------------
// Event wiring
// ------------------------------------------------------------
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

let searchDebounce;
searchIn.addEventListener("input", () => {
	clearTimeout(searchDebounce);
	searchDebounce = setTimeout(render, 250);
});

// ------------------------------------------------------------
// Initialisation (theme + first paint)
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
// Main render function
// ------------------------------------------------------------
async function render() {
	tbody.textContent = "";

	// fetch rows
	const db = await openDB();
	const store = db.transaction("pages").objectStore("pages");
	let rows = await toPromise(store.getAll());

	// filter via search
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

	// 3‑level sort: recent ↓, domain ↑, count ↓
	rows.sort((a, b) => {
		if (b.lastClosed !== a.lastClosed) return b.lastClosed - a.lastClosed;
		const domCmp = a.domain.localeCompare(b.domain);
		if (domCmp !== 0) return domCmp;
		return b.count - a.count;
	});

	rows.forEach((r) => tbody.append(buildRow(r)));
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function buildRow(rec) {
	const tr = document.createElement("tr");
	const d = new Date(rec.lastClosed);

	// Date & time
	tr.append(createCell(d.toISOString().slice(0, 10)));
	tr.append(
		createCell(
			d.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			}),
		),
	);

	// Domain & count
	tr.append(createCell(rec.domain));
	tr.append(createCell(rec.count));

	// Page cell (title + meta line)
	const tdPage = document.createElement("td");
	const top = document.createElement("div");
	top.className = "top";
	if (rec.icon) {
		const img = document.createElement("img");
		img.src = rec.icon;
		img.width = img.height = 16;
		top.append(img);
	}
	const title = document.createElement("span");
	title.textContent = rec.title;
	top.append(title);

	const bottom = document.createElement("div");
	bottom.className = "bot";
	const link = document.createElement("a");
	link.href = rec.url;
	link.target = "_blank";
	link.textContent = rec.url;
	bottom.append(link);

	tdPage.append(top, bottom);
	tr.append(tdPage);

	// delete ✕
	const tdDel = document.createElement("td");
	const del = document.createElement("span");
	del.textContent = "✕";
	del.className = "del";
	del.title = "Delete entry";
	del.addEventListener("click", async (e) => {
		e.stopPropagation();
		const db = await openDB();
		const tx = db.transaction("pages", "readwrite");
		await tx.objectStore("pages").delete(rec.url);
		await tx.done;
		tr.remove();
	});
	tdDel.append(del);
	tr.append(tdDel);

	return tr;
}

function createCell(text) {
	const td = document.createElement("td");
	td.textContent = text;
	return td;
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

		const haystack = `${r.domain} ${r.url} ${r.title}`.toLowerCase();
		return haystack.includes(term);
	});
}

function toPromise(req) {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
