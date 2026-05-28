import { randomUUID } from 'node:crypto';
import { memoryFile } from '../config/paths.js';
import type { LavandeConfig } from '../config/schema.js';
import type { ChatMessage } from '../types/index.js';
import { JsonStore } from './jsonStore.js';
import type { Conversation, MemoryState, Storage } from './types.js';

/**
 * Factory that picks the right backend. Today only JSON; the interface is
 * stable so adding SQLite later is a drop-in swap.
 */
function createStorage(): Storage {
  return new JsonStore(memoryFile);
}

/**
 * High-level memory facade used by the agent / commands. Wraps a Storage and
 * exposes conversation-shaped operations.
 */
export class MemoryStore {
  private state: MemoryState | null = null;
  private readonly storage: Storage;

  constructor(
    private readonly config: LavandeConfig,
    storage: Storage = createStorage(),
  ) {
    this.storage = storage;
  }

  location(): string {
    return this.storage.location();
  }

  async load(): Promise<MemoryState> {
    if (!this.state) this.state = await this.storage.load();
    return this.state;
  }

  async startConversation(title = 'New conversation'): Promise<Conversation> {
    const state = await this.load();
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      title,
      messages: [],
    };
    state.conversations.unshift(conv);
    return conv;
  }

  async appendMessage(conversationId: string, message: ChatMessage): Promise<void> {
    if (!this.config.memory.enabled) return;
    const state = await this.load();
    const conv = state.conversations.find((c) => c.id === conversationId);
    if (!conv) return;
    conv.messages.push(message);
    conv.updatedAt = new Date().toISOString();

    // Light-touch compaction: cap stored turns to keep the file small.
    const max = this.config.memory.maxTurns * 2;
    if (conv.messages.length > max) {
      conv.messages = conv.messages.slice(-max);
    }
    await this.storage.save(state);
  }

  async listConversations(): Promise<Conversation[]> {
    const state = await this.load();
    return state.conversations;
  }

  async getLastConversation(): Promise<Conversation | undefined> {
    const state = await this.load();
    return state.conversations[0];
  }

  async setPreference(key: string, value: unknown): Promise<void> {
    const state = await this.load();
    state.preferences[key] = value;
    await this.storage.save(state);
  }

  async getPreference<T = unknown>(key: string): Promise<T | undefined> {
    const state = await this.load();
    return state.preferences[key] as T | undefined;
  }

  async clear(): Promise<void> {
    this.state = null;
    await this.storage.clear();
  }
}
