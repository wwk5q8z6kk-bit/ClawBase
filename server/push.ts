import { state } from './state';

export async function sendPushNotification(opts: {
    title: string;
    body: string;
    data?: Record<string, any>;
    categoryId?: string;
    channelId?: string;
}) {
    const tokens: string[] = [];
    for (const entry of state.pushTokens.values()) {
        tokens.push(entry.expoPushToken);
    }
    if (tokens.length === 0) return;

    const messages = tokens.map((token) => ({
        to: token,
        sound: 'default',
        title: opts.title,
        body: opts.body,
        data: opts.data,
        categoryId: opts.categoryId,
        channelId: opts.channelId || 'default',
    }));

    try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Push] Failed to send push notification: ${response.status} ${errorText}`);
        } else {
            console.log(`[Push] Sent push notification to ${tokens.length} devices.`);
        }
    } catch (err: any) {
        console.error(`[Push] Error sending push notification: ${err.message}`);
    }
}
