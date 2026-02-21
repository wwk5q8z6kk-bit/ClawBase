import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'clawbase_offline_queue';

export interface QueuedMessage {
    id: string;
    conversationId: string;
    content: string;
    timestamp: number;
    retries: number;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function loadQueue(): Promise<QueuedMessage[]> {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function saveQueue(queue: QueuedMessage[]): Promise<void> {
    try {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch { }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Enqueue a message for later delivery */
export async function enqueue(conversationId: string, content: string): Promise<QueuedMessage> {
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
}

/** Peek at the current queue without removing anything */
export async function peekQueue(): Promise<QueuedMessage[]> {
    return loadQueue();
}

/** Get count of pending messages */
export async function getQueueLength(): Promise<number> {
    const queue = await loadQueue();
    return queue.length;
}

/** Remove a specific message from the queue (after successful send) */
export async function dequeue(id: string): Promise<void> {
    const queue = await loadQueue();
    const filtered = queue.filter(m => m.id !== id);
    await saveQueue(filtered);
}

/** Clear the entire queue */
export async function clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
}

/**
 * Flush queued messages through a sender function.
 * Returns the number of successfully sent messages.
 */
export async function flushQueue(
    sender: (conversationId: string, content: string) => Promise<void>,
): Promise<number> {
    const queue = await loadQueue();
    if (queue.length === 0) return 0;

    let sent = 0;
    const remaining: QueuedMessage[] = [];

    for (const msg of queue) {
        try {
            await sender(msg.conversationId, msg.content);
            sent++;
        } catch {
            msg.retries++;
            if (msg.retries < 5) {
                remaining.push(msg);
            }
            // Messages with 5+ retries are silently dropped
        }
    }

    await saveQueue(remaining);
    return sent;
}
