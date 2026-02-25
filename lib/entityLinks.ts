import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

export type EntityType = 'conversation' | 'task' | 'memory' | 'calendar' | 'contact';
export type LinkRelation = 'created_from' | 'mentions' | 'related_to' | 'spawned_by';

export interface EntityLink {
  id: string;
  sourceType: EntityType;
  sourceId: string;
  targetType: EntityType;
  targetId: string;
  relation: LinkRelation;
  createdAt: number;
}

const STORAGE_KEY = '@clawbase:entity_links';

async function getAll(): Promise<EntityLink[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveAll(links: EntityLink[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export async function addLink(
  sourceType: EntityType,
  sourceId: string,
  targetType: EntityType,
  targetId: string,
  relation: LinkRelation,
): Promise<EntityLink> {
  const all = await getAll();

  const existing = all.find(
    (l) =>
      l.sourceType === sourceType &&
      l.sourceId === sourceId &&
      l.targetType === targetType &&
      l.targetId === targetId &&
      l.relation === relation,
  );
  if (existing) return existing;

  const link: EntityLink = {
    id: Crypto.randomUUID(),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    createdAt: Date.now(),
  };

  all.push(link);
  await saveAll(all);
  return link;
}

export async function getLinksFor(
  entityType: EntityType,
  entityId: string,
): Promise<EntityLink[]> {
  const all = await getAll();
  return all.filter(
    (l) =>
      (l.sourceType === entityType && l.sourceId === entityId) ||
      (l.targetType === entityType && l.targetId === entityId),
  );
}

export async function removeLinksFor(
  entityType: EntityType,
  entityId: string,
): Promise<void> {
  const all = await getAll();
  const filtered = all.filter(
    (l) =>
      !(l.sourceType === entityType && l.sourceId === entityId) &&
      !(l.targetType === entityType && l.targetId === entityId),
  );
  await saveAll(filtered);
}

export async function removeLink(linkId: string): Promise<void> {
  const all = await getAll();
  await saveAll(all.filter((l) => l.id !== linkId));
}

export async function getAllLinks(): Promise<EntityLink[]> {
  return getAll();
}
