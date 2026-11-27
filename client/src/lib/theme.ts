// Day and night mode. The page follows the device's setting until the visitor
// clicks the sun (or the moon); then their choice is remembered in this browser.
// index.html applies the saved choice before the page draws, so it never flashes.
import { useSyncExternalStore } from 'react';

const KEY = 'trailcast-theme';
export type Theme = 'dark' | 'light';

const listeners = new Set<() => void>();
let fadeTimer: ReturnType<typeof setTimeout> | undefined;

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

const deviceQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');
const wantsLessMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyTheme(theme: Theme, { fade = false }: { fade?: boolean } = {}): void {
  const root = document.documentElement;
  if (fade && !wantsLessMotion()) {
    root.classList.add('theme-fade');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 1000);
  }
  root.classList.toggle('dark', theme === 'dark');
  listeners.forEach((listener) => listener());
}

export function toggleTheme(): void {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private windows may not allow saving; the switch still works for this visit.
  }
  applyTheme(next, { fade: true });
}

// Keeps following the device's setting (e.g. it turns dark at sunset) until the visitor chooses.
export function followDeviceTheme(): void {
  deviceQuery()?.addEventListener('change', (event) => {
    if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light', { fade: true });
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, (): Theme => 'light');
}
