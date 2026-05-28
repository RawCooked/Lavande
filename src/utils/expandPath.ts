import os from 'node:os';
import path from 'node:path';

/**
 * Normalize a user-supplied path before passing it to the filesystem.
 *
 * Handles:
 *   - Tilde expansion: ~ → os.homedir() (cross-platform)
 *   - Windows %VAR% expansion: %APPDATA%, %USERPROFILE%, etc.
 *   - Absolute path normalization
 *   - Relative path resolution against cwd
 */
export function expandPath(target: string, cwd: string): string {
  let p = target.trim();

  // Tilde expansion — users type this on every OS, even on Windows.
  if (p === '~') {
    return os.homedir();
  }
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    p = os.homedir() + p.slice(1);
  }

  // Windows %VAR% expansion.
  if (process.platform === 'win32') {
    p = p.replace(/%([^%]+)%/gi, (_match, key: string) => {
      return process.env[key] ?? process.env[key.toUpperCase()] ?? `%${key}%`;
    });
  }

  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(cwd, p);
}
