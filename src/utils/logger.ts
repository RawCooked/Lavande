import fs from 'node:fs';
import path from 'node:path';
import { debugLogFile, logDir } from '../config/paths.js';

const enabled = process.env.LAVANDE_DEBUG === '1' || process.env.LAVANDE_DEBUG === 'true';

let stream: fs.WriteStream | null = null;

function getStream(): fs.WriteStream | null {
  if (!enabled) return null;
  if (stream) return stream;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    stream = fs.createWriteStream(debugLogFile, { flags: 'a' });
  } catch {
    return null;
  }
  return stream;
}

function write(level: string, scope: string, msg: string, data?: unknown): void {
  const s = getStream();
  if (!s) return;
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${scope} ${msg}${
    data === undefined ? '' : ' ' + safeStringify(data)
  }\n`;
  s.write(line);
}

export const logger = {
  enabled,
  file: debugLogFile,
  scope(name: string) {
    return {
      debug: (msg: string, data?: unknown) => write('DEBUG', name, msg, data),
      info: (msg: string, data?: unknown) => write('INFO', name, msg, data),
      warn: (msg: string, data?: unknown) => write('WARN', name, msg, data),
      error: (msg: string, data?: unknown) => write('ERROR', name, msg, data),
    };
  },
};

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Surface the resolved path for the user (used by `lavande config path`).
export const debugLogPath = path.normalize(debugLogFile);
