import { Audio, Recording } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

let recording: Recording | null = null;
let chunkInterval: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Audio Recording
// ---------------------------------------------------------------------------

export async function requestAudioPermission(): Promise<boolean> {
    try {
        const { granted } = await Audio.requestPermissionsAsync();
        return granted;
    } catch (e) {
        console.warn('[voice] Failed to request audio permission:', e);
        return false;
    }
}

export async function startRecording(opts?: { onChunk?: (base64: string) => void }): Promise<boolean> {
    try {
        const hasPermission = await requestAudioPermission();
        if (!hasPermission) return false;

        const rec = new Recording();
        await rec.prepareToRecordAsync({
            extension: '.m4a',
            sampleRate: 44100,
            numberOfChannels: 2,
            bitRate: 128000,
        });
        await rec.startAsync();
        recording = rec;

        if (opts?.onChunk && Platform.OS !== 'web') {
            const uri = rec.uri;
            if (uri) {
                let position = 0;
                chunkInterval = setInterval(async () => {
                    try {
                        const info = await FileSystem.getInfoAsync(uri);
                        if (!info.exists || info.size === undefined) return;

                        const newBytes = info.size - position;
                        if (newBytes > 4096) {
                            const b64 = await FileSystem.readAsStringAsync(uri, {
                                encoding: 'base64' as any,
                                position,
                                length: newBytes,
                            });
                            position = info.size;
                            opts?.onChunk?.(b64);
                        }
                    } catch (e) {
                        console.warn('[voice] Failed to read audio chunk:', e);
                    }
                }, 500);
            }
        }

        return true;
    } catch (err) {
        console.error('[Voice] Failed to start recording:', err);
        return false;
    }
}

export async function stopRecording(): Promise<{
    uri: string | null;
    durationMs: number;
    base64: string | null;
}> {
    if (chunkInterval) {
        clearInterval(chunkInterval);
        chunkInterval = null;
    }

    if (!recording) return { uri: null, durationMs: 0, base64: null };

    try {
        const durationMs = (recording.currentTime || 0) * 1000;
        await recording.stopAndUnloadAsync();

        const uri = recording.uri;

        let base64: string | null = null;
        if (uri && Platform.OS !== 'web') {
            try {
                base64 = await FileSystem.readAsStringAsync(uri, {
                    encoding: 'base64' as any,
                });
            } catch (e) {
                console.warn('[voice] Failed to read recording as base64:', e);
            }
        }

        recording = null;
        return { uri: uri || null, durationMs, base64 };
    } catch (err) {
        console.error('[Voice] Failed to stop recording:', err);
        recording = null;
        return { uri: null, durationMs: 0, base64: null };
    }
}

export function isRecording(): boolean {
    return recording !== null;
}

// ---------------------------------------------------------------------------
// Text-to-Speech
// ---------------------------------------------------------------------------

export function speakText(
    text: string,
    opts?: { rate?: number; pitch?: number; language?: string; onDone?: () => void },
) {
    const clean = text
        .replace(/```[\s\S]*?```/g, ' code block ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/#{1,6}\s+/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ' ')
        .trim();

    if (!clean) return;

    Speech.speak(clean, {
        rate: opts?.rate ?? 1.0,
        pitch: opts?.pitch ?? 1.0,
        language: opts?.language ?? 'en-US',
        onDone: opts?.onDone,
    });
}

export function stopSpeaking() {
    Speech.stop();
}

export async function isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync();
}
