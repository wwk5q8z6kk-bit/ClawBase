import React, { useState, useEffect, useCallback } from 'react';
import {
    StyleSheet,
    View,
    Text,
    Pressable,
    Modal,
    ActivityIndicator,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    Easing,
    cancelAnimation,
    runOnJS
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import {
    startRecording,
    stopRecording,
    speakText,
    stopSpeaking,
    requestAudioPermission,
} from '@/lib/voice';

const C = Colors.dark;

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

interface VoiceModeOverlayProps {
    visible: boolean;
    onClose: () => void;
    onSend: (text: string) => Promise<string | void>;
}

function WaveformBar({ delay, color }: { delay: number; color: string }) {
    const scaleY = useSharedValue(0.3);

    useEffect(() => {
        const timeout = setTimeout(() => {
            scaleY.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 300 + Math.random() * 200, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0.3, { duration: 300 + Math.random() * 200, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );
        }, delay);
        return () => {
            clearTimeout(timeout);
            cancelAnimation(scaleY);
        };
    }, [scaleY, delay]);

    const style = useAnimatedStyle(() => ({
        transform: [{ scaleY: scaleY.value }],
    }));

    return (
        <Animated.View
            style={[
                styles.waveBar,
                { backgroundColor: color },
                style,
            ]}
        />
    );
}

function PulseRing({ active, color }: { active: boolean; color: string }) {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.3);

    useEffect(() => {
        if (!active) {
            cancelAnimation(scale);
            cancelAnimation(opacity);
            scale.value = 1;
            opacity.value = 0;
            return;
        }

        scale.value = 1;
        opacity.value = 0.3;

        scale.value = withRepeat(
            withTiming(2.2, { duration: 1200, easing: Easing.out(Easing.ease) }),
            -1,
            false
        );
        opacity.value = withRepeat(
            withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
            -1,
            false
        );

        return () => {
            cancelAnimation(scale);
            cancelAnimation(opacity);
        };
    }, [active, scale, opacity]);

    const style = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    if (!active) return null;

    return (
        <Animated.View
            style={[
                styles.pulseRing,
                { borderColor: color },
                style,
            ]}
        />
    );
}

export default function VoiceModeOverlay({ visible, onClose, onSend }: VoiceModeOverlayProps) {
    const [state, setState] = useState<VoiceState>('idle');
    const [transcribedText, setTranscribedText] = useState('');
    const [responseText, setResponseText] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const fadeAnim = useSharedValue(0);

    useEffect(() => {
        if (visible) {
            fadeAnim.value = 0;
            fadeAnim.value = withTiming(1, {
                duration: 300,
                easing: Easing.out(Easing.ease),
            });
            setState('idle');
            setTranscribedText('');
            setResponseText('');
            setErrorMsg('');
        }
    }, [visible, fadeAnim]);

    const { gateway, gatewayStatus } = useApp();

    const handleStartListening = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        const hasPermission = await requestAudioPermission();
        if (!hasPermission) {
            setErrorMsg('Microphone permission is required');
            setState('error');
            return;
        }

        const started = await startRecording({
            onChunk: (base64) => {
                if (gatewayStatus === 'connected') {
                    // Send chunks immediately as they are recorded
                    gateway.streamAudioChunk(base64, 'agent:main:main').catch(() => { });
                }
            }
        });

        if (started) {
            setState('listening');
            setTranscribedText('');
            setResponseText('');
        } else {
            setErrorMsg('Failed to start recording');
            setState('error');
        }
    }, [gateway, gatewayStatus]);

    const handleStopListening = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setState('processing');

        const result = await stopRecording();
        if (!result.uri && !result.base64) {
            setErrorMsg('No audio recorded');
            setState('error');
            return;
        }

        // Send end signal to gateway so it knows the audio file stream is finished
        if (gatewayStatus === 'connected') {
            gateway.endAudioStream('agent:main:main').catch(() => { });
        }

        // If the recording is too short, show an error
        if (result.durationMs < 500) {
            setErrorMsg('Recording too short — hold the button longer');
            setState('error');
            return;
        }

        // For now, we send a placeholder message indicating voice input
        // In production, the gateway transcribes the audio via its STT service
        const voiceIndicator = '🎤 [Voice message]';
        setTranscribedText(voiceIndicator);

        try {
            const response = await onSend(voiceIndicator);
            if (response) {
                setResponseText(response);
                setState('speaking');
                speakText(response, {
                    onDone: () => setState('idle'),
                });
            } else {
                setState('idle');
            }
        } catch {
            setErrorMsg('Failed to get response');
            setState('error');
        }
    }, [gateway, gatewayStatus, onSend]);

    const handleClose = useCallback(() => {
        stopSpeaking();
        if (state === 'listening') {
            stopRecording();
        }
        fadeAnim.value = withTiming(0, {
            duration: 200,
            easing: Easing.out(Easing.ease),
        }, (finished) => {
            if (finished) {
                runOnJS(onClose)();
            }
        });
    }, [fadeAnim, onClose, state]);

    const handleStopSpeaking = useCallback(() => {
        stopSpeaking();
        setState('idle');
    }, []);

    if (!visible) return null;

    const stateColor =
        state === 'listening' ? C.error :
            state === 'processing' ? C.amber :
                state === 'speaking' ? C.accent :
                    state === 'error' ? C.error :
                        C.textSecondary;

    const stateLabel =
        state === 'idle' ? 'Tap to speak' :
            state === 'listening' ? 'Listening...' :
                state === 'processing' ? 'Processing...' :
                    state === 'speaking' ? 'Speaking...' :
                        'Error';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
                <View style={styles.blurFill}>
                    {/* Close button */}
                    <Pressable style={styles.closeBtn} onPress={handleClose}>
                        <Ionicons name="close" size={24} color={C.textSecondary} />
                    </Pressable>

                    {/* Main content */}
                    <View style={styles.content}>
                        {/* Waveform visualization */}
                        {state === 'listening' && (
                            <View style={styles.waveformContainer}>
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <WaveformBar key={i} delay={i * 50} color={stateColor} />
                                ))}
                            </View>
                        )}

                        {state === 'processing' && (
                            <ActivityIndicator size="large" color={C.amber} style={{ marginBottom: 24 }} />
                        )}

                        {state === 'speaking' && (
                            <View style={styles.waveformContainer}>
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <WaveformBar key={i} delay={i * 80} color={C.accent} />
                                ))}
                            </View>
                        )}

                        {/* Pulse ring around mic button */}
                        <View style={styles.micBtnContainer}>
                            <PulseRing active={state === 'listening'} color={stateColor} />
                            <Pressable
                                style={[
                                    styles.micBtn,
                                    { borderColor: stateColor + '40' },
                                    state === 'listening' && { backgroundColor: stateColor + '20' },
                                ]}
                                onPress={() => {
                                    if (state === 'idle' || state === 'error') {
                                        handleStartListening();
                                    } else if (state === 'listening') {
                                        handleStopListening();
                                    } else if (state === 'speaking') {
                                        handleStopSpeaking();
                                    }
                                }}
                            >
                                <Ionicons
                                    name={
                                        state === 'listening' ? 'stop' :
                                            state === 'speaking' ? 'volume-mute' :
                                                'mic'
                                    }
                                    size={36}
                                    color={stateColor}
                                />
                            </Pressable>
                        </View>

                        {/* State label */}
                        <Text style={[styles.stateLabel, { color: stateColor }]}>
                            {stateLabel}
                        </Text>

                        {/* Transcribed text */}
                        {transcribedText ? (
                            <View style={styles.transcriptBox}>
                                <Text style={styles.transcriptLabel}>You said:</Text>
                                <Text style={styles.transcriptText}>{transcribedText}</Text>
                            </View>
                        ) : null}

                        {/* Response text */}
                        {responseText ? (
                            <View style={styles.responseBox}>
                                <Text style={styles.responseLabel}>Agent:</Text>
                                <Text style={styles.responseText} numberOfLines={6}>
                                    {responseText}
                                </Text>
                            </View>
                        ) : null}

                        {/* Error */}
                        {state === 'error' && (
                            <View style={styles.errorBox}>
                                <Ionicons name="alert-circle" size={16} color={C.error} />
                                <Text style={styles.errorText}>{errorMsg}</Text>
                            </View>
                        )}
                    </View>

                    {/* Bottom hint */}
                    <Text style={styles.hint}>
                        {state === 'listening'
                            ? 'Tap the mic to stop recording'
                            : state === 'speaking'
                                ? 'Tap the mic to stop speaking'
                                : 'Tap the mic to start a voice command'}
                    </Text>
                </View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
    },
    blurFill: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        backgroundColor: 'rgba(8, 12, 24, 0.95)',
    },
    closeBtn: {
        position: 'absolute',
        top: 60,
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: C.surface + '80',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    content: {
        alignItems: 'center',
        gap: 20,
        width: '100%',
    },
    waveformContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        height: 50,
        marginBottom: 8,
    },
    waveBar: {
        width: 4,
        height: 40,
        borderRadius: 2,
    },
    micBtnContainer: {
        width: 100,
        height: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pulseRing: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
    },
    micBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: C.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
        elevation: 8,
    },
    stateLabel: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 18,
        marginTop: 4,
    },
    transcriptBox: {
        backgroundColor: C.surface + '80',
        borderRadius: 12,
        padding: 14,
        width: '100%',
        borderWidth: 1,
        borderColor: C.border,
    },
    transcriptLabel: {
        fontFamily: 'Inter_500Medium',
        fontSize: 11,
        color: C.textTertiary,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    transcriptText: {
        fontFamily: 'Inter_400Regular',
        fontSize: 15,
        color: C.text,
        lineHeight: 22,
    },
    responseBox: {
        backgroundColor: C.accent + '10',
        borderRadius: 12,
        padding: 14,
        width: '100%',
        borderWidth: 1,
        borderColor: C.accent + '30',
    },
    responseLabel: {
        fontFamily: 'Inter_500Medium',
        fontSize: 11,
        color: C.accent,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    responseText: {
        fontFamily: 'Inter_400Regular',
        fontSize: 15,
        color: C.text,
        lineHeight: 22,
    },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: C.errorMuted,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    errorText: {
        fontFamily: 'Inter_500Medium',
        fontSize: 14,
        color: C.error,
    },
    hint: {
        position: 'absolute',
        bottom: 50,
        fontFamily: 'Inter_400Regular',
        fontSize: 13,
        color: C.textTertiary,
        textAlign: 'center',
    },
});
