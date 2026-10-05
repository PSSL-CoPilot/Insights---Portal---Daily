"use client";

import { useSyncExternalStore } from "react";

/** Viewer profile (name and photo), kept in this browser only. */
export interface Profile {
  name: string;
  /** Downscaled JPEG data URL, or null. */
  photo: string | null;
}

const KEY = "bs.profile.v1";
const EVENT = "bs-profile-change";
const EMPTY: Profile = { name: "", photo: null };

let cache: { raw: string | null; value: Profile } | null = null;

function read(): Profile {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (cache && cache.raw === raw) return cache.value;
  let value = EMPTY;
  try {
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      value = { name: typeof p.name === "string" ? p.name : "", photo: typeof p.photo === "string" ? p.photo : null };
    }
  } catch {}
  cache = { raw, value };
  return value;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Saves the profile; returns false when the browser refused to store it (for example, storage full). */
export function saveProfile(p: Profile): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: p.name.trim(), photo: p.photo }));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

/** "Spandan Roy" → "SR", "Spandan" → "S", "" → "". */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  return ((w[0][0] ?? "") + (w.length > 1 ? w[w.length - 1][0] ?? "" : "")).toUpperCase();
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Reads an image file and returns a square, centre-cropped JPEG data URL (small enough for local storage). */
export function photoFromFile(file: File, size = 192): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file could not be read as an image."));
    };
    img.src = url;
  });
}
