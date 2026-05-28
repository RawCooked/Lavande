/**
 * Pure formatting helpers — no side effects, no chalk.
 * Components apply colour at render time so format helpers stay reusable.
 */

export function truncate(text: string, max: number, suffix = '…'): string {
  if (text.length <= max) return text;
  if (max <= suffix.length) return suffix.slice(0, max);
  return text.slice(0, max - suffix.length) + suffix;
}

export function truncateLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return text;
  const omitted = lines.length - maxLines;
  return lines.slice(0, maxLines).join('\n') + `\n… (${omitted} more line${omitted === 1 ? '' : 's'})`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return `${bytes}`;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatArgsPreview(args: unknown, max = 80): string {
  if (args == null) return '';
  if (typeof args === 'string') return truncate(args, max);
  try {
    return truncate(JSON.stringify(args), max);
  } catch {
    return truncate(String(args), max);
  }
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : plural ?? singular + 's'}`;
}
