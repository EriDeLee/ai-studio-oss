export type DevLogLevel = 'info' | 'warn' | 'error';

export interface DevLogEntry {
  id: string;
  ts: number;
  scope: string;
  level: DevLogLevel;
  message: string;
  data?: unknown;
}

const DEV_LOG_EVENT = 'ai-studio:dev-log';
const MAX_LOGS = 300;

declare global {
  interface Window {
    __AI_STUDIO_DEV_LOGS__?: DevLogEntry[];
  }
}

const ensureStore = (): DevLogEntry[] => {
  if (typeof window === 'undefined') return [];
  if (!Array.isArray(window.__AI_STUDIO_DEV_LOGS__)) {
    window.__AI_STUDIO_DEV_LOGS__ = [];
  }
  return window.__AI_STUDIO_DEV_LOGS__;
};

export const getDevLogs = (): DevLogEntry[] => {
  const logs = ensureStore();
  return [...logs];
};

export const clearDevLogs = (): void => {
  if (typeof window === 'undefined') return;
  const logs = ensureStore();
  logs.length = 0;
  window.dispatchEvent(new CustomEvent<DevLogEntry | null>(DEV_LOG_EVENT, { detail: null }));
};

export const pushDevLog = (
  scope: string,
  message: string,
  level: DevLogLevel = 'info',
  data?: unknown
): void => {
  if (typeof window === 'undefined') return;

  const logs = ensureStore();
  const entry: DevLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    scope,
    level,
    message,
    data,
  };

  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }

  window.dispatchEvent(new CustomEvent<DevLogEntry>(DEV_LOG_EVENT, { detail: entry }));
};

export const DEV_LOG_EVENT_NAME = DEV_LOG_EVENT;
