/**
 * Hard-refuse patterns for run_command and similar tools.
 * These run BEFORE the confirmation prompt — the user can't approve their way
 * past them. Intentionally conservative; if you need an escape hatch, add a
 * dedicated tool with a narrower contract.
 */
const BLOCKLIST: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-[a-z]*r[a-z]*f|--recursive\s+--force)\s+\/\s*$/i, reason: 'Recursive delete of root.' },
  { pattern: /\brm\s+(-[a-z]*r[a-z]*f|--recursive\s+--force)\s+~\s*$/i, reason: 'Recursive delete of home.' },
  { pattern: /\bmkfs(\.|\s)/i, reason: 'Filesystem creation / format.' },
  { pattern: /\bdd\s+if=.*of=\/dev\/(sd|nvme|hd)/i, reason: 'Raw disk write via dd.' },
  { pattern: /\b(format|cipher\s+\/w)\s+[a-z]:/i, reason: 'Drive format on Windows.' },
  { pattern: /\bdel\s+\/[fsq]\s+.*[a-z]:\\?\s*$/i, reason: 'Recursive delete of a drive root on Windows.' },
  { pattern: /\b:\(\)\s*\{\s*:\|:&\s*\};?\s*:/, reason: 'Fork bomb.' },
  { pattern: /shutdown\s+(\/s|-h|-r|now)/i, reason: 'System shutdown.' },
];

export interface SafetyVerdict {
  allowed: boolean;
  reason?: string;
}

export function checkCommandSafety(command: string): SafetyVerdict {
  const trimmed = command.trim();
  for (const { pattern, reason } of BLOCKLIST) {
    if (pattern.test(trimmed)) return { allowed: false, reason };
  }
  return { allowed: true };
}
