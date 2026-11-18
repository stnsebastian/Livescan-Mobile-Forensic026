/**
 * LiveScan Mobile Forensic - IndexedDB Module
 * Manages local offline-first forensic dossiers, fingerprint records and templates.
 */

const DB_NAME = 'LiveScanMobileForensicDB';
const DB_VERSION = 1;
const STORE_RECORDS = 'records';

class ForensicDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_RECORDS)) {
          const store = db.createObjectStore(STORE_RECORDS, { keyPath: 'id', autoIncrement: true });
          store.createIndex('docId', 'docId', { unique: false });
          store.createIndex('caseNumber', 'caseNumber', { unique: false });
          store.createIndex('fullName', 'fullName', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('finger', 'finger', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async addRecord(record) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_RECORDS, 'readwrite');
      const store = tx.objectStore(STORE_RECORDS);
      const dataToSave = {
        ...record,
        timestamp: record.timestamp || Date.now(),
        dateStr: new Date().toISOString()
      };
      const req = store.add(dataToSave);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getRecord(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_RECORDS, 'readonly');
      const store = tx.objectStore(STORE_RECORDS);
      const req = store.get(Number(id));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllRecords() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_RECORDS, 'readonly');
      const store = tx.objectStore(STORE_RECORDS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.reverse());
      req.onerror = () => reject(req.error);
    });
  }

  async deleteRecord(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_RECORDS, 'readwrite');
      const store = tx.objectStore(STORE_RECORDS);
      const req = store.delete(Number(id));
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async searchRecords(query) {
    const all = await this.getAllRecords();
    if (!query || !query.trim()) return all;
    const q = query.toLowerCase().trim();
    return all.filter(r => 
      (r.fullName && r.fullName.toLowerCase().includes(q)) ||
      (r.docId && r.docId.toLowerCase().includes(q)) ||
      (r.caseNumber && r.caseNumber.toLowerCase().includes(q)) ||
      (r.finger && r.finger.toLowerCase().includes(q)) ||
      (r.source && r.source.toLowerCase().includes(q))
    );
  }

  async exportJSON() {
    const records = await this.getAllRecords();
    return JSON.stringify({
      schema: 'LiveScan_Mobile_Forensic_V1',
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      records: records
    }, null, 2);
  }

  async importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data.records || !Array.isArray(data.records)) {
        throw new Error('Formato JSON no válido.');
      }
      for (const rec of data.records) {
        delete rec.id; // regenerar autoincrement
        await this.addRecord(rec);
      }
      return data.records.length;
    } catch (e) {
      console.error('Error importando registros:', e);
      throw e;
    }
  }
}

export const forensicDB = new ForensicDatabase();
