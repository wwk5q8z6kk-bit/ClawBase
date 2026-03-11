import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import {
  parseBrainDump,
  aiParseBrainDump,
  getCategoryIcon,
  getCategoryColor,
  getPriorityLabel,
  formatParsedDate,
} from '@/lib/brainDump';
import type { ParsedItem } from '@/lib/brainDump';
import { useToast } from '@/components/Toast';

const C = Colors.dark;

const PRIORITY_COLORS: Record<string, string> = {
  urgent: C.primary,
  high: C.amber,
  medium: C.accent,
  low: C.textSecondary,
};

interface BrainDumpSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function BrainDumpSheet({ visible, onClose }: BrainDumpSheetProps) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [aiItems, setAiItems] = useState<ParsedItem[] | null>(null);
  const inputRef = useRef<TextInput>(null);
  const parseRequestId = useRef(0);
  const insets = useSafeAreaInsets();
  const { addInboxItem, gateway, gatewayStatus } = useApp();
  const { showToast } = useToast();

  const slideAnim = useSharedValue(0);
  const backdropAnim = useSharedValue(0);

  const localParsedItems = useMemo(() => {
    const trimmed = text.trim();
    if (trimmed.length < 3) return [];
    return parseBrainDump(trimmed);
  }, [text]);

  const parsedItems = aiItems || localParsedItems;
  const isAiResult = aiItems !== null && aiItems.length > 0;

  useEffect(() => {
    if (visible) {
      setText('');
      setSaving(false);
      setShowPreview(false);
      setAiParsing(false);
      setAiItems(null);
      parseRequestId.current++;
      backdropAnim.value = withTiming(1, { duration: 250 });
      slideAnim.value = withSpring(1, { damping: 20, stiffness: 300 });
      setTimeout(() => inputRef.current?.focus(), 350);
    } else {
      backdropAnim.value = withTiming(0, { duration: 200 });
      slideAnim.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) });
    }
  }, [visible, slideAnim, backdropAnim]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropAnim.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - slideAnim.value) * 400 }],
    opacity: slideAnim.value,
  }));

  const handleDismiss = () => {
    Keyboard.dismiss();
    backdropAnim.value = withTiming(0, { duration: 200 });
    slideAnim.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

  const handleAiParse = useCallback(async () => {
    if (aiParsing || gatewayStatus !== 'connected') return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const requestId = ++parseRequestId.current;
    Keyboard.dismiss();
    setAiParsing(true);
    try {
      const result = await aiParseBrainDump(trimmed, gateway);
      if (parseRequestId.current !== requestId) return;
      if (result && result.length > 0) {
        setAiItems(result);
        setShowPreview(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        showToast('info', 'AI couldn\'t parse this — try the local parser instead');
      }
    } catch {
      if (parseRequestId.current === requestId) {
        showToast('error', 'AI parsing failed — try again or use local parser');
      }
    } finally {
      if (parseRequestId.current === requestId) {
        setAiParsing(false);
      }
    }
  }, [aiParsing, gatewayStatus, text, gateway, showToast]);

  const handleDump = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving || aiParsing) return;

    setSaving(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (parsedItems.length > 0) {
        for (const item of parsedItems) {
          await addInboxItem(item.rawText || item.parsedTitle, 'braindump', item);
        }
      } else {
        await addInboxItem(trimmed, 'braindump');
      }

      setText('');
      handleDismiss();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  const canSubmit = text.trim().length > 0 && !saving && !aiParsing;
  const hasMultipleItems = parsedItems.length > 1;
  const isGatewayConnected = gatewayStatus === 'connected';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleDismiss}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        </Animated.View>

        <View style={styles.sheetPositioner}>
          <Animated.View style={[styles.sheet, sheetStyle, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconBg}>
                  <Ionicons name="flash" size={18} color={C.primary} />
                </View>
                <Text style={styles.headerTitle}>Brain Dump</Text>
              </View>
              <Pressable onPress={handleDismiss} hitSlop={12}>
                <Ionicons name="close" size={22} color={C.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.subtitleRow}>
              <Text style={styles.subtitle}>
                Type anything — tasks, ideas, reminders. Just get it out of your head.
              </Text>
              {isGatewayConnected && (
                <View style={styles.aiBadge}>
                  <Ionicons name="sparkles" size={11} color={C.accent} />
                  <Text style={styles.aiBadgeText}>AI</Text>
                </View>
              )}
            </View>

            {!showPreview ? (
              <>
                <View style={styles.inputContainer}>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder="Call dentist tomorrow, buy milk, finish slides by Friday..."
                    placeholderTextColor={C.textTertiary}
                    value={text}
                    onChangeText={(t) => { setText(t); setAiItems(null); }}
                    multiline
                    textAlignVertical="top"
                    maxLength={2000}
                    autoCapitalize="sentences"
                    returnKeyType="default"
                  />
                  {text.length > 0 && (
                    <View style={styles.inputFooter}>
                      <Text style={styles.charCount}>{text.length}/2000</Text>
                    </View>
                  )}
                </View>

                {(localParsedItems.length > 0 || isGatewayConnected) && text.trim().length >= 3 && (
                  <View style={styles.previewActions}>
                    {localParsedItems.length > 0 && (
                      <Pressable
                        style={styles.previewToggle}
                        onPress={() => {
                          Keyboard.dismiss();
                          setAiItems(null);
                          setShowPreview(true);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <Ionicons name="list-outline" size={14} color={C.accent} />
                        <Text style={styles.previewToggleText}>
                          {localParsedItems.length} item{localParsedItems.length !== 1 ? 's' : ''} detected
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
                      </Pressable>
                    )}
                    {isGatewayConnected && (
                      <Pressable
                        style={[styles.previewToggle, styles.aiPreviewToggle]}
                        onPress={handleAiParse}
                        disabled={aiParsing}
                      >
                        <Ionicons name={aiParsing ? 'hourglass-outline' : 'sparkles'} size={14} color={C.primary} />
                        <Text style={[styles.previewToggleText, { color: C.primary }]}>
                          {aiParsing ? 'AI analyzing...' : 'Parse with AI'}
                        </Text>
                        {!aiParsing && <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />}
                      </Pressable>
                    )}
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={styles.previewHeader}>
                  <Pressable
                    style={styles.backToEdit}
                    onPress={() => { setShowPreview(false); setAiItems(null); }}
                  >
                    <Ionicons name="chevron-back" size={16} color={C.accent} />
                    <Text style={styles.backToEditText}>Edit text</Text>
                  </Pressable>
                  {isAiResult && (
                    <View style={styles.aiBadge}>
                      <Ionicons name="sparkles" size={11} color={C.primary} />
                      <Text style={[styles.aiBadgeText, { color: C.primary }]}>AI parsed</Text>
                    </View>
                  )}
                </View>

                <ScrollView
                  style={styles.previewScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {parsedItems.map((item, index) => {
                    const catColor = getCategoryColor(item.parsedCategory, C);
                    const catIcon = getCategoryIcon(item.parsedCategory);
                    const priColor = PRIORITY_COLORS[item.parsedPriority] || C.textSecondary;

                    return (
                      <View key={index} style={styles.previewItem}>
                        <View style={[styles.previewIconBg, { backgroundColor: catColor + '18' }]}>
                          <Ionicons name={catIcon as any} size={16} color={catColor} />
                        </View>
                        <View style={styles.previewContent}>
                          <Text style={styles.previewTitle} numberOfLines={2}>
                            {item.parsedTitle}
                          </Text>
                          <View style={styles.previewMeta}>
                            <View style={[styles.previewCatPill, { backgroundColor: catColor + '18' }]}>
                              <Text style={[styles.previewCatText, { color: catColor }]}>
                                {item.parsedCategory}
                              </Text>
                            </View>
                            {item.parsedPriority !== 'medium' && (
                              <View style={[styles.previewPriPill, { backgroundColor: priColor + '18' }]}>
                                <View style={[styles.previewPriDot, { backgroundColor: priColor }]} />
                                <Text style={[styles.previewPriText, { color: priColor }]}>
                                  {getPriorityLabel(item.parsedPriority)}
                                </Text>
                              </View>
                            )}
                            {item.parsedDueDate && (
                              <View style={styles.previewDatePill}>
                                <Ionicons name="time-outline" size={10} color={C.accent} />
                                <Text style={styles.previewDateText}>
                                  {formatParsedDate(item.parsedDueDate)}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <View style={styles.footer}>
              <Pressable
                style={[styles.dumpButton, !canSubmit && styles.dumpButtonDisabled]}
                onPress={handleDump}
                disabled={!canSubmit}
              >
                <Ionicons
                  name={saving ? 'hourglass-outline' : 'arrow-down-circle'}
                  size={20}
                  color={canSubmit ? '#fff' : C.textTertiary}
                />
                <Text style={[styles.dumpButtonText, !canSubmit && styles.dumpButtonTextDisabled]}>
                  {saving ? 'Saving...' : hasMultipleItems ? `Dump ${parsedItems.length} Items` : 'Dump It'}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 6, 16, 0.7)',
  },
  sheetPositioner: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: C.border,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.textTertiary,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: C.text,
  },
  subtitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 16,
    gap: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
    flex: 1,
  },
  aiBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    backgroundColor: C.accent + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  aiBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: C.accent,
    letterSpacing: 0.5,
  },
  inputContainer: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 140,
    maxHeight: 220,
    marginBottom: 12,
  },
  input: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: C.text,
    padding: 16,
    minHeight: 120,
    lineHeight: 24,
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: 12,
    paddingBottom: 8,
  },
  charCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  previewActions: {
    gap: 8,
    marginBottom: 12,
  },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: C.accent + '10',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.accent + '20',
  },
  aiPreviewToggle: {
    backgroundColor: C.primary + '10',
    borderColor: C.primary + '20',
  },
  previewToggleText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.accent,
    flex: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backToEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backToEditText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.accent,
  },
  previewScroll: {
    maxHeight: 280,
    marginBottom: 12,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
  },
  previewIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  previewContent: {
    flex: 1,
    gap: 6,
  },
  previewTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  previewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  previewCatPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  previewCatText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  previewPriPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  previewPriDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  previewPriText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  previewDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: C.accent + '12',
  },
  previewDateText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: C.accent,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  dumpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
  },
  dumpButtonDisabled: {
    backgroundColor: C.card,
  },
  dumpButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  dumpButtonTextDisabled: {
    color: C.textTertiary,
  },
});
