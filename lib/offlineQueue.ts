import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'clawbase_offline_queue'; // legacy key retained for data continuity

let lockChain: Promise<void> = Promise.resolve();
function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lockChain.then(fn, fn);
  lockChain = next.then(() => {}, () => {});
  return next;
}

export interface QueuedMessage {
    id: string;
    conversationId: string;
    content: string;
    timestamp: number;
    retries: number;
}

export type DroppedMessageCallback = (count: number) => void;

let onMessagesDropped: DroppedMessageCallback | null = null;

export function setOnMessagesDropped(cb: DroppedMessageCallback | null): void {
    onMessagesDropped = cb;
}

async function loadQueue(): Promise<QueuedMessage[]> {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.warn('[offlineQueue] Failed to load queue:', e);
        return [];
    }
}

async function saveQueue(queue: QueuedMessage[]): Promise<void> {
    try {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.warn('[offlineQueue] Failed to save queue:', e);
    }
}

export async function enqueue(conversationId: string, content: string): Promise<QueuedMessage> {
    return withQueueLock(async () => {
        const msg: QueuedMessage = {
            id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            conversationId,
            content,
            timestamp: Date.now(),
            retries: 0,
        };
        const queue = await loadQueue();
        queue.push(msg);
        await saveQueue(queue);
        return msg;
    });
}

export async function peekQueue(): Promise<QueuedMessage[]> {
    return loadQueue();
}

export async function getQueueLength(): Promise<number> {
    const queue = await loadQueue();
    return queue.length;
}

export async function dequeue(id: string): Promise<void> {
    return withQueueLock(async () => {
        const queue = await loadQueue();
        const filtered = queue.filter(m => m.id !== id);
        await saveQueue(filtered);
    });
}

export async function clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function flushQueue(
    sender: (conversationId: string, content: string) => Promise<void>,
): Promise<number> {
    return withQueueLock(async () => {
        const queue = await loadQueue();
        if (queue.length === 0) return 0;

        let sent = 0;
        let dropped = 0;
        const remaining: QueuedMessage[] = [];

        for (const msg of queue) {
            try {
                await sender(msg.conversationId, msg.content);
                sent++;
            } catch (e) {
                msg.retries++;
                if (msg.retries < 5) {
                    remaining.push(msg);
                } else {
                    dropped++;
                    console.warn(`[offlineQueue] Dropped message after 5 retries: "${msg.content.slice(0, 50)}..." (conversation: ${msg.conversationId})`);
                }
            }
        }

        await saveQueue(remaining);

        if (dropped > 0 && onMessagesDropped) {
            onMessagesDropped(dropped);
        }

        return sent;
    });
}
