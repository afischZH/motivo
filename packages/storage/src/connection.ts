/**
 * One lazily opened database connection per store object. A failed open is
 * retried on the next call (e.g. after the user left private mode), and a
 * schema upgrade from another tab closes this connection so that tab can
 * proceed; the next call opens the new version.
 */
import { StorageError, defaultFactory, openDatabase } from "./idb";

export interface ConnectionOptions {
  /** Default: the global `indexedDB`. */
  indexedDB?: IDBFactory | undefined;
  /** Database name; tests use their own. Default `motivo`. */
  databaseName?: string | undefined;
}

export interface Connection {
  db(): Promise<IDBDatabase>;
  close(): void;
}

export function createConnection(options: ConnectionOptions): Connection {
  let opening: Promise<IDBDatabase> | null = null;
  return {
    db() {
      if (!opening) {
        const factory = options.indexedDB ?? defaultFactory();
        if (!factory) {
          return Promise.reject(new StorageError("unavailable", "IndexedDB is not available"));
        }
        opening = openDatabase(factory, options.databaseName).then((database) => {
          // Another tab upgrades the schema: let it, reopen on next use.
          database.onversionchange = () => {
            database.close();
            opening = null;
          };
          return database;
        });
        opening.catch(() => {
          opening = null;
        });
      }
      return opening;
    },
    close() {
      const pending = opening;
      opening = null;
      void pending?.then((database) => database.close()).catch(() => undefined);
    },
  };
}

/** 128 random bits as hex: ids that never collide in practice. */
export function randomHexId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
