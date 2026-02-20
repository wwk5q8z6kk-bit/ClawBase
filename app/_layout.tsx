import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import ConnectionBanner from '@/components/ConnectionBanner';
import { ToastProvider } from '@/components/Toast';
import { queryClient } from '@/lib/query-client';
import { AppProvider } from '@/lib/AppContext';
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

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="calendar" options={{ headerShown: false }} />
      <Stack.Screen name="crm" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="pair" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      if (url && (url.startsWith('clawbase://connect') || url.startsWith('openclaw://connect'))) {
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

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <ToastProvider>
                <RootLayoutNav />
                <ConnectionBanner />
              </ToastProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </AppProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
