export type Progress = {
  chart: string;
  score: number;
  pitch: number;
  attacks: number;
  stability: number | null;
  completed: number;
  date: string;
  mode: string;
};
export type Settings = {
  tuning: number;
  noiseFloor: number;
  offsetMs: number;
  calibratedAt?: string;
};
export const defaults: Settings = {
  tuning: 440,
  noiseFloor: 0.008,
  offsetMs: 0,
};
let dbPromise: Promise<IDBDatabase> | undefined;
function db() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("trumpet-hero", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("settings");
      r.result.createObjectStore("progress", { autoIncrement: true });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function readStore<T>(
  store: string,
  key?: IDBValidKey,
): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store),
      r =
        key === undefined
          ? tx.objectStore(store).getAll()
          : tx.objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveStore(
  store: string,
  value: unknown,
  key?: IDBValidKey,
) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    if (key !== undefined) tx.objectStore(store).put(value, key);
    else tx.objectStore(store).add(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function clearProgress() {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("progress", "readwrite");
    tx.objectStore("progress").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
