import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

export interface LocalStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createEvenLocalStore(bridge: EvenAppBridge): LocalStore {
  return {
    async get(key) {
      return (await bridge.getLocalStorage(key)) || null;
    },
    async set(key, value) {
      const saved = await bridge.setLocalStorage(key, value);
      if (!saved) throw new Error('The Even app could not save the local setting.');
    },
    async remove(key) {
      const removed = await bridge.setLocalStorage(key, '');
      if (!removed) throw new Error('The Even app could not clear the local setting.');
    },
  };
}

export function createBrowserLocalStore(storage: Storage = window.localStorage): LocalStore {
  return {
    async get(key) {
      return storage.getItem(key);
    },
    async set(key, value) {
      storage.setItem(key, value);
    },
    async remove(key) {
      storage.removeItem(key);
    },
  };
}
