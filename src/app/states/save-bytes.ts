import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'king_shield_save_bytes';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function read(): Uint8Array | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? fromBase64(raw) : null;
  } catch {
    return null;
  }
}

@Injectable({
  providedIn: 'root',
})
export class SaveBytesState {
  private readonly _bytes = signal<Uint8Array | null>(read());
  readonly bytes = this._bytes.asReadonly();

  set(bytes: Uint8Array | null): void {
    this._bytes.set(bytes);
    try {
      if (bytes) localStorage.setItem(STORAGE_KEY, toBase64(bytes));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Could not keep the save file (storage full or blocked):', error);
    }
  }
}
