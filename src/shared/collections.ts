import type { Conversation } from './contracts.ts';

export interface Collection { id: string; name: string }
export interface CollectionData { version: 1; collections: Collection[]; membership: Record<string, string> }
export interface CollectionResult { data: CollectionData; warnings: string[]; writable: boolean }
export const emptyCollections = (): CollectionData => ({ version:1, collections:[], membership:{} });

/** Derive Sidebar views without filtering the application's full Conversation list. */
export function groupConversations(conversations: readonly Conversation[], data: CollectionData) {
  const groups = new Map(data.collections.map(collection => [collection.id, [] as Conversation[]]));
  const unclassified: Conversation[] = [];
  for (const conversation of conversations) {
    const id = Object.hasOwn(data.membership, conversation.conversation_id) ? data.membership[conversation.conversation_id] : undefined;
    (id ? groups.get(id) ?? unclassified : unclassified).push(conversation);
  }
  return { groups, unclassified };
}
