import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import * as QuickActions from 'expo-quick-actions';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import ConnectionBanner from '@/components/ConnectionBanner';
import { ToastProvider, useToast } from '@/components/Toast';
import { queryClient } from '@/lib/query-client';
import { AppProvider } from '@/lib/AppContext';
import { AppLockWrapper } from '@/components/AppLockWrapper';
import { setOnMessagesDropped } from '@/lib/offlineQueue';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

SplashScreen.preventAutoHideAsync();

function getFirstParam(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.find((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return undefined;
}

function OfflineQueueBridge() {
  const { showToast } = useToast();
  useEffect(() => {
    setOnMessagesDropped((count) => {
      showToast('warning', `${count} queued message${count !== 1 ? 's' : ''} couldn't be delivered and were removed`);
    });
    return () => setOnMessagesDropped(null);
  }, [showToast]);
  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="calendar" options={{ headerShown: false }} />
      <Stack.Screen name="crm" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="pair" options={{ headerShown: false }} />
      <Stack.Screen name="search" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="mindmap" options={{ headerShown: false }} />
      <Stack.Screen name="focus" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      if (url && (url.startsWith('meridian://connect') || url.startsWith('clawbase://connect') || url.startsWith('openclaw://connect'))) {
        const parsed = Linking.parse(url);
        const gwUrl = getFirstParam(parsed.queryParams?.url) || getFirstParam(parsed.queryParams?.gateway);
        if (gwUrl) {
          const token = getFirstParam(parsed.queryParams?.token);
          const name = getFirstParam(parsed.queryParams?.name);
          router.push({
            pathname: '/pair',
            params: {
              from: 'deeplink',
              url: gwUrl,
              ...(token ? { token } : {}),
              ...(name ? { name } : {}),
            },
          });
        }
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    QuickActions.setItems([
      {
        title: 'Voice Mode',
        subtitle: 'Talk to your Agent',
        icon: 'audio',
        id: 'voice_mode',
        params: { route: '/chat/agent:main:main?voice=true' },
      },
      {
        title: 'Daily Briefing',
        subtitle: 'Get your morning summary',
        icon: 'contact',
        id: 'daily_briefing',
        params: { route: '/chat/agent:main:main?briefing=true' },
      },
      {
        title: 'New Task',
        subtitle: 'Create a task quickly',
        icon: 'compose',
        id: 'new_task',
        params: { route: '/(tabs)/tasks?add=true' },
      }
    ]);

    const handleQuickAction = (action: QuickActions.Action | null) => {
      if (action?.params?.route) {
        setTimeout(() => {
          router.push(action.params?.route as any);
        }, 500);
      }
    };

    const sub = QuickActions.addListener((action) => {
      handleQuickAction(action);
    });

    if (QuickActions.initial) {
      handleQuickAction(QuickActions.initial);
    }

    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <AppLockWrapper>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <ToastProvider>
                <OfflineQueueBridge />
                <RootLayoutNav />
                <ConnectionBanner />
              </ToastProvider>
            </GestureHandlerRootView>
          </AppLockWrapper>
        </AppProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
