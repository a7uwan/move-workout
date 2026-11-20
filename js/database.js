// Small IndexedDB wrapper: workout history stays on this device when offline.
const MoveDB = (() => {
  const DB_NAME = 'move-workout-db', STORE = 'workouts';
  function open() {
    return new Promise((resolve,reject) => {
      const request = indexedDB.open(DB_NAME,1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE,{keyPath:'id'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function saveWorkout(record) {
    const db = await open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function getWorkouts() {
    const db = await open();
    return new Promise((resolve,reject) => {
      const req = db.transaction(STORE,'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a,b)=>b.startedAt-a.startedAt));
      req.onerror = () => reject(req.error);
    });
  }
  return {saveWorkout,getWorkouts};
})();
