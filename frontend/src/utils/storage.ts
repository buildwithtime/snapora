import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { QueueJob } from '../types/queue.js';
import { purgeExpiredJobMetadata } from './retention.js';

interface SnaporaDB extends DBSchema {
  jobs: {
    key: string;
    value: QueueJob;
    indexes: { 'by-status': string; 'by-created': number };
  };
}

const DB_NAME = 'snapora_queue_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SnaporaDB>> | null = null;

function getDb(): Promise<IDBPDatabase<SnaporaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SnaporaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('jobs')) {
          const store = db.createObjectStore('jobs', { keyPath: 'id' });
          store.createIndex('by-status', 'status');
          store.createIndex('by-created', 'createdAt');
        }
      }
    });
  }
  return dbPromise;
}

export async function saveJobsToStorage(jobs: QueueJob[]): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction('jobs', 'readwrite');
    await tx.store.clear();
    for (const job of jobs) {
      await tx.store.put(job);
    }
    await tx.done;
  } catch (err) {
    console.warn('Failed to persist jobs to IndexedDB:', err);
  }
}

/**
 * Loads persisted jobs from IndexedDB, automatically enforcing the 30-day API data retention policy
 * by purging expired API-derived metadata while strictly preserving all user-created workspace records.
 */
export async function loadJobsFromStorage(): Promise<QueueJob[]> {
  try {
    const db = await getDb();
    const jobs = await db.getAllFromIndex('jobs', 'by-created');
    let anyPurged = false;

    const sanitizedJobs = jobs.map((job) => {
      const purged = purgeExpiredJobMetadata(job);
      if (purged !== job && (job.title || job.preview?.title !== '[Metadata Expired - Please Refresh]')) {
        anyPurged = true;
      }
      return purged;
    });

    if (anyPurged) {
      await saveJobsToStorage(sanitizedJobs);
    }

    return sanitizedJobs;
  } catch (err) {
    console.warn('Failed to load jobs from IndexedDB:', err);
    return [];
  }
}

export async function clearAllJobsFromStorage(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear('jobs');
  } catch (err) {
    console.warn('Failed to clear IndexedDB:', err);
  }
}
