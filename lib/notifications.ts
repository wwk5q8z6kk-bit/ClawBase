import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PUSH_TOKEN_KEY = '@clawbase:expo_push_token';
const NOTIFICATION_PREFS_KEY = '@clawbase:notification_prefs';

export interface NotificationPrefs {
    approvals: boolean;
    agentErrors: boolean;
    automationResults: boolean;
    dailyBrief: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
    approvals: true,
    agentErrors: true,
    automationResults: false,
    dailyBrief: false,
};

// ---------------------------------------------------------------------------
// Notification Handler (foreground display)
// ---------------------------------------------------------------------------

export function setupNotificationHandler() {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });
}

// ---------------------------------------------------------------------------
// Interactive Notification Categories
// ---------------------------------------------------------------------------

export async function setupNotificationCategories() {
    if (Platform.OS === 'web') return;

    await Notifications.setNotificationCategoryAsync('approval', [
        {
            identifier: 'approve',
            buttonTitle: '✅ Approve',
            options: { opensAppToForeground: false },
        },
        {
            identifier: 'deny',
            buttonTitle: '❌ Deny',
            options: { opensAppToForeground: false },
        },
    ]);

    await Notifications.setNotificationCategoryAsync('alert', [
        {
            identifier: 'view',
            buttonTitle: 'View',
            options: { opensAppToForeground: true },
        },
        {
            identifier: 'dismiss',
            buttonTitle: 'Dismiss',
            options: { opensAppToForeground: false },
        },
    ]);
}

// ---------------------------------------------------------------------------
// Push Token Registration
// ---------------------------------------------------------------------------

export async function registerForPushNotifications(): Promise<string | null> {
    // Push notifications require a physical device
    if (!Device.isDevice) {
        console.log('[Notifications] Must use physical device for push notifications');
        return null;
    }

    // Set up Android notification channel
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('approvals', {
            name: 'Approval Requests',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#4F6BF6',
            sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('alerts', {
            name: 'Agent Alerts',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('info', {
            name: 'Information',
            importance: Notifications.AndroidImportance.DEFAULT,
        });
    }

    // Check / request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('[Notifications] Permission not granted');
        return null;
    }

    // Get Expo push token
    try {
        const projectId =
            Constants?.expoConfig?.extra?.eas?.projectId ??
            Constants?.easConfig?.projectId;

        const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: projectId || undefined,
        });

        const token = tokenData.data;
        console.log('[Notifications] Expo push token:', token);

        // Persist locally
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

        return token;
    } catch (error) {
        console.error('[Notifications] Failed to get push token:', error);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Stored Token
// ---------------------------------------------------------------------------

export async function getStoredPushToken(): Promise<string | null> {
    return AsyncStorage.getItem(PUSH_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Notification Preferences
// ---------------------------------------------------------------------------

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
    try {
        const raw = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
        if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch (e) {
        console.warn('[notifications] Failed to load notification prefs:', e);
    }
    return { ...DEFAULT_PREFS };
}

export async function setNotificationPrefs(prefs: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    const current = await getNotificationPrefs();
    const updated = { ...current, ...prefs };
    await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(updated));
    return updated;
}

// ---------------------------------------------------------------------------
// Local Notification (for in-app display of gateway events)
// ---------------------------------------------------------------------------

export async function showLocalNotification(opts: {
    title: string;
    body: string;
    data?: Record<string, any>;
    categoryIdentifier?: string;
    channelId?: string;
}) {
    await Notifications.scheduleNotificationAsync({
        content: {
            title: opts.title,
            body: opts.body,
            data: opts.data || {},
            categoryIdentifier: opts.categoryIdentifier,
            ...(Platform.OS === 'android' && opts.channelId
                ? { channelId: opts.channelId }
                : {}),
        },
        trigger: null, // show immediately
    });
}
