import React from 'react';
import { Pressable, type PressableProps, type ViewStyle, Platform } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { Card } from './GlassCard';

interface PressableCardProps extends Omit<PressableProps, 'style'> {
    /** Style for the outer animated container */
    style?: ViewStyle | ViewStyle[];
    /** Padding for the inner Card */
    padding?: number;
    /** Gradient variant for the inner Card */
    variant?: 'card' | 'cardElevated' | 'heroGlow' | 'ocean' | 'lobster' | 'alertInfo' | 'alertWarn' | 'alertSuccess';
    /** Whether to add a secondary glowing border */
    accentBorder?: boolean;
    /** Custom scale factor when pressed, default 0.96 */
    activeScale?: number;
    /** Disables the haptic feedback on press */
    disableHaptics?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableCard({
    style,
    padding = 16,
    variant = 'card',
    accentBorder = false,
    activeScale = 0.96,
    disableHaptics = false,
    onPressIn,
    onPressOut,
    onPress,
    children,
    ...rest
}: PressableCardProps) {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    const handlePressIn = (e: any) => {
        'worklet';
        scale.value = withSpring(activeScale, { mass: 0.5, stiffness: 200, damping: 15 });
        opacity.value = withTiming(0.85, { duration: 100 });

        if (!disableHaptics && Platform.OS !== 'web') {
            import('expo-haptics').then(Haptics => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            });
        }
        onPressIn?.(e);
    };

    const handlePressOut = (e: any) => {
        'worklet';
        scale.value = withSpring(1, { mass: 0.5, stiffness: 200, damping: 15 });
        opacity.value = withTiming(1, { duration: 200 });
        onPressOut?.(e);
    };

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <AnimatedPressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={onPress}
            style={[animatedStyle, style]}
            {...rest}
        >
            {(state: any) => (
                <Card padding={padding} variant={variant} accentBorder={accentBorder}>
                    {typeof children === 'function' ? children(state) : children}
                </Card>
            )}
        </AnimatedPressable>
    );
}
