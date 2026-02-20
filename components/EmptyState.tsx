import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface EmptyStateProps {
    icon: string;
    iconColor?: string;
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onAction?: () => void;
}

/**
 * A premium empty state component with a glowing icon, title, subtitle,
 * and optional action button. Standardizes empty states across the app.
 */
export function EmptyState({
    icon,
    iconColor = C.coral,
    title,
    subtitle,
    actionLabel,
    onAction,
}: EmptyStateProps) {
    return (
        <View style={styles.container}>
            <LinearGradient
                colors={C.gradient.lobster}
                style={styles.iconWrap}
            >
                <Ionicons name={icon as any} size={36} color="#fff" />
            </LinearGradient>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            {actionLabel && onAction && (
                <Pressable
                    onPress={onAction}
                    style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
                >
                    <LinearGradient
                        colors={C.gradient.lobster}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.actionBtnGradient}
                    >
                        <Ionicons name="add" size={20} color="#fff" />
                        <Text style={styles.actionBtnText}>{actionLabel}</Text>
                    </LinearGradient>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        paddingHorizontal: 32,
        gap: 12,
    },
    iconWrap: {
        width: 72,
        height: 72,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    title: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 18,
        color: C.text,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        color: C.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
        maxWidth: 260,
    },
    actionBtn: {
        borderRadius: 14,
        overflow: 'hidden',
        marginTop: 8,
    },
    actionBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 24,
        paddingVertical: 14,
    },
    actionBtnText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 15,
        color: '#fff',
    },
});
