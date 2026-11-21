(() => {
  'use strict';

  const databaseName = 'mono.local-backups';
  const storeName = 'backups';
  const limit = 3;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(databaseName, 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
      };
      request.onblocked = () => {
        blocked = true;
        reject(new Error('请关闭其他 MONO 标签页后重试。'));
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        if (blocked) {
          database.close();
          return;
        }
        database.onversionchange = () => database.close();
        resolve(database);
      };
    });
  }

  async function runTransaction(mode, operation) {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        transaction.onabort = () => reject(transaction.error || new Error('本地备份操作已中断。'));
        try {
          const request = operation(transaction.objectStore(storeName));
          transaction.oncomplete = () => resolve(request.result);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      });
    } finally {
      database.close();
    }
  }

  async function save({ version, createdAt, data }) {
    return runTransaction('readwrite', store => {
      const added = store.add({ version, createdAt, data });
      const keys = store.getAllKeys();
      keys.onsuccess = () => {
        for (const id of keys.result.slice(0, -limit)) store.delete(id);
      };
      return added;
    });
  }

  async function list() {
    const backups = await runTransaction('readonly', store => store.getAll());
    return backups.reverse().map(({ id, createdAt, data }) => ({
      id, createdAt,
      accountCount: data.accounts.length,
      goalCount: data.goals.length,
      personal: data.personal
    }));
  }

  async function get(id) {
    return runTransaction('readonly', store => store.get(id));
  }

  window.MonoBackupStore = { save, list, get };
})();
