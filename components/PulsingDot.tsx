import React from 'react';
import { Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

interface PulsingDotProps {
    color: string;
    size?: number;
}

/**
 * A premium pulsing dot indicator using Reanimated for silky 60fps
 * performance on the UI thread. Replaces all duplicated PulsingDot
 * implementations across the app.
 */
export function PulsingDot({ color, size = 8 }: PulsingDotProps) {
    const opacity = useSharedValue(1);

    React.useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withTiming(0.3, { duration: 1000 }),
                withTiming(1, { duration: 1000 }),
            ),
            -1, // infinite
            false,
        );
    }, [opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: opacity.value,
    }));

    return <Animated.View style={animatedStyle} />;
}
