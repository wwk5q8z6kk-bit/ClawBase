import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, AppState, AppStateStatus, Platform, Text, Pressable } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/lib/AppContext';
import Colors from '@/constants/colors';

const C = Colors.dark;

export function AppLockWrapper({ children }: { children: React.ReactNode }) {
    const { biometricEnabled } = useApp();
    const [isLocked, setIsLocked] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const appState = useRef(AppState.currentState);

    useEffect(() => {
        if (!biometricEnabled || Platform.OS === 'web') {
            setIsLocked(false);
            return;
        }

        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
                setIsLocked(true);
            } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
                if (isLocked && !isAuthenticating) {
                    authenticate();
                }
            }
            appState.current = nextAppState;
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // Initial mount check
        if (biometricEnabled && !isAuthenticating) {
            setIsLocked(true);
            authenticate();
        }

        return () => {
            subscription.remove();
        };
    }, [biometricEnabled]);

    const authenticate = async () => {
        if (isAuthenticating) return;
        setIsAuthenticating(true);
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            if (!hasHardware || !isEnrolled) {
                setIsLocked(false);
                return;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock ClawBase',
                fallbackLabel: 'Use Passcode',
                disableDeviceFallback: false,
                cancelLabel: 'Cancel',
            });

            if (result.success) {
                setIsLocked(false);
            }
        } catch (err) {
            console.warn('Authentication err', err);
        } finally {
            setIsAuthenticating(false);
        }
    };

    return (
        <View style={styles.container}>
            {children}

            {isLocked && biometricEnabled && (
                <View style={StyleSheet.absoluteFill}>
                    <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.lockContent}>
                        <View style={styles.iconCircle}>
                            <Ionicons name="lock-closed" size={48} color={C.coral} />
                        </View>
                        <Text style={styles.title}>ClawBase is Locked</Text>
                        <Text style={styles.subtitle}>Unlock to access your secure remote environment and agent data.</Text>

                        <Pressable
                            style={({ pressed }) => [styles.unlockBtn, pressed && { opacity: 0.8 }]}
                            onPress={authenticate}
                        >
                            <Text style={styles.unlockBtnText}>Unlock</Text>
                        </Pressable>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    lockContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    iconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255, 127, 80, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 127, 80, 0.3)',
    },
    title: {
        fontFamily: 'Inter_700Bold',
        fontSize: 24,
        color: '#fff',
        marginBottom: 12,
    },
    subtitle: {
        fontFamily: 'Inter_400Regular',
        fontSize: 15,
        color: C.textSecondary,
        textAlign: 'center',
        marginBottom: 40,
        lineHeight: 22,
    },
    unlockBtn: {
        backgroundColor: C.coral,
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 12,
    },
    unlockBtnText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
        color: '#fff',
    },
});
