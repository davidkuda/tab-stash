export async function openDB() {
	return new Promise((res, rej) => {
		const req = indexedDB.open("tabbundlr", 1);
		req.onupgradeneeded = () => {
			const s = req.result.createObjectStore("pages", { keyPath: "url" });
			s.createIndex("domain", "domain");
			s.createIndex("lastClosed", "lastClosed");
		};
		req.onsuccess = () => res(req.result);
		req.onerror = () => rej(req.error);
	});
}
