import type { ChatMessage } from '../types/index.js';

export interface Conversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  messages: ChatMessage[];
}

export interface MemoryState {
  version: 1;
  conversations: Conversation[];
  preferences: Record<string, unknown>;
}

/**
 * Backend-agnostic storage interface.
 * Implementations: JsonStore (default), future: SqliteStore, etc.
 */
export interface Storage {
  load(): Promise<MemoryState>;
  save(state: MemoryState): Promise<void>;
  clear(): Promise<void>;
  location(): string;
}
