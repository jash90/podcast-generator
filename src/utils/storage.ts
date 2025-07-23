// Utility functions for safe localStorage operations

/**
 * Safely get an item from localStorage
 * @param key The key to retrieve
 * @returns The stored value or null if not found or error occurs
 */
export function getStorageItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to get item "${key}" from localStorage:`, error);
    return null;
  }
}

/**
 * Safely set an item in localStorage
 * @param key The key to store
 * @param value The value to store
 * @returns true if successful, false otherwise
 */
export function setStorageItem(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to set item "${key}" in localStorage:`, error);
    return false;
  }
}

/**
 * Safely remove an item from localStorage
 * @param key The key to remove
 * @returns true if successful, false otherwise
 */
export function removeStorageItem(key: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Failed to remove item "${key}" from localStorage:`, error);
    return false;
  }
}

/**
 * Check if localStorage is available
 * @returns true if localStorage is available, false otherwise
 */
export function isStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    // Test if we can actually use it
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
} 