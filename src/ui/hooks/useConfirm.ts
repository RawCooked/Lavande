import { useCallback, useRef, useState } from 'react';
import type { ConfirmRequest } from '../../tools/types.js';

interface PendingConfirm {
  request: ConfirmRequest;
  resolve: (value: boolean) => void;
}

/**
 * Promise-based confirmation flow. The agent calls `request(req)` and awaits
 * the returned promise. The UI renders the ConfirmDialog while the promise is
 * pending; `resolve(true|false)` settles it.
 */
export function useConfirm(): {
  pending: PendingConfirm | null;
  request: (req: ConfirmRequest) => Promise<boolean>;
  resolve: (approved: boolean) => void;
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const request = useCallback((req: ConfirmRequest): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const entry: PendingConfirm = { request: req, resolve };
      pendingRef.current = entry;
      setPending(entry);
    });
  }, []);

  const resolve = useCallback((approved: boolean) => {
    const entry = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    entry?.resolve(approved);
  }, []);

  return { pending, request, resolve };
}
