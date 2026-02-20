import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface SectionHeaderProps {
    icon: string;
    iconColor?: string;
    title: string;
    actionLabel?: string;
    onAction?: () => void;
}

/**
 * A reusable section header with an icon, title, and optional action button.
 * Used across Mission Control, Vault, Memory, and other list views.
 */
export function SectionHeader({
    icon,
    iconColor = C.textSecondary,
    title,
    actionLabel,
    onAction,
}: SectionHeaderProps) {
    return (
        <View style={styles.container}>
            <View style={styles.titleRow}>
                <Ionicons name={icon as any} size={16} color={iconColor} />
                <Text style={styles.title}>{title}</Text>
            </View>
            {actionLabel && onAction && (
                <Pressable onPress={onAction} hitSlop={8}>
                    <Text style={styles.action}>{actionLabel}</Text>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    title: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 15,
        color: C.text,
    },
    action: {
        fontFamily: 'Inter_500Medium',
        fontSize: 13,
        color: C.primary,
    },
});
