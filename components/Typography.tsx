import React from 'react';
import { Text as RNText, type TextProps, StyleSheet, TextStyle } from 'react-native';
import Colors from '@/constants/colors';

export type TextVariant =
    | 'h1'
    | 'h2'
    | 'h3'
    | 'body'
    | 'bodyStrong'
    | 'caption'
    | 'label'
    | 'mono';

export type TextColor = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'coral' | 'amber' | 'success' | 'error';

interface TypographyProps extends TextProps {
    variant?: TextVariant;
    color?: TextColor | string;
    weight?: '400' | '500' | '600' | '700';
    center?: boolean;
}

export function Typography({
    variant = 'body',
    color = 'primary', // defaults to text (primary)
    weight,
    center,
    style,
    children,
    ...props
}: TypographyProps) {

    // Resolve standard colors from our theme, fallback to string value (e.g. raw hex)
    let resolvedColor = Colors.dark.text;
    if (color === 'primary') resolvedColor = Colors.dark.text;
    else if (color === 'secondary') resolvedColor = Colors.dark.textSecondary;
    else if (color === 'tertiary') resolvedColor = Colors.dark.textTertiary;
    else if (color === 'accent') resolvedColor = Colors.dark.accent;
    else if (color === 'coral') resolvedColor = Colors.dark.coral;
    else if (color === 'amber') resolvedColor = Colors.dark.amber;
    else if (color === 'success') resolvedColor = Colors.dark.success;
    else if (color === 'error') resolvedColor = Colors.dark.error;
    else resolvedColor = color; // custom hex color passed

    const baseStyle: TextStyle = {
        color: resolvedColor,
        textAlign: center ? 'center' : 'auto',
    };

    // Override font weight if explicitly provided
    if (weight === '400') baseStyle.fontFamily = 'Inter_400Regular';
    if (weight === '500') baseStyle.fontFamily = 'Inter_500Medium';
    if (weight === '600') baseStyle.fontFamily = 'Inter_600SemiBold';
    if (weight === '700') baseStyle.fontFamily = 'Inter_700Bold';

    return (
        <RNText style={[styles[variant], baseStyle, style]} {...props}>
            {children}
        </RNText>
    );
}

const styles = StyleSheet.create({
    h1: {
        fontFamily: 'Inter_700Bold',
        fontSize: 28,
        lineHeight: 34,
        letterSpacing: -0.5,
    },
    h2: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 22,
        lineHeight: 28,
        letterSpacing: -0.3,
    },
    h3: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 18,
        lineHeight: 24,
        letterSpacing: -0.2,
    },
    body: {
        fontFamily: 'Inter_400Regular',
        fontSize: 15,
        lineHeight: 22,
    },
    bodyStrong: {
        fontFamily: 'Inter_500Medium',
        fontSize: 15,
        lineHeight: 22,
    },
    caption: {
        fontFamily: 'Inter_400Regular',
        fontSize: 13,
        lineHeight: 18,
    },
    label: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    mono: {
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 18,
    }
});
