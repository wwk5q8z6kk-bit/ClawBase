import React from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';

interface GlassCardProps extends ViewProps {
    /** Optional inner content padding, defaults to 16 */
    padding?: number;
    /** Primary gradient variant to use from Colors.dark.gradient */
    variant?: 'card' | 'cardElevated' | 'heroGlow' | 'ocean' | 'lobster' | 'alertInfo' | 'alertWarn' | 'alertSuccess';
    /** Extra border styling */
    accentBorder?: boolean;
}

/**
 * A reusable container that provides a consistent premium "glass" 
 * or elevated dark-mode gradient aesthetic across the app.
 */
export function GlassCard({
    padding = 16,
    variant = 'card',
    accentBorder = false,
    style,
    children,
    ...props
}: GlassCardProps) {
    const gradientColors = Colors.dark.gradient[variant] || Colors.dark.gradient.card;

    return (
        <LinearGradient
            colors={gradientColors as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
                styles.container,
                { padding },
                accentBorder && styles.accentBorder,
                style
            ]}
            {...props}
        >
            {children}
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.dark.borderLight,
        overflow: 'hidden',
    },
    accentBorder: {
        borderColor: Colors.dark.border,
    }
});
