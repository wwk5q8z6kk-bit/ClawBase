import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { PulsingDot } from '@/components/PulsingDot';
import type { GatewaySession, GatewaySessionMessage } from '@/lib/gateway';

const C = Colors.dark;

const CHANNEL_ICONS: Record<string, { name: string; color: string }> = {
  whatsapp: { name: 'logo-whatsapp', color: '#25D366' },
  telegram: { name: 'paper-plane', color: '#0088cc' },
  discord: { name: 'logo-discord', color: '#5865F2' },
  slack: { name: 'chatbox', color: '#E01E5A' },
  imessage: { name: 'chatbubble-ellipses', color: '#34C759' },
  signal: { name: 'shield-checkmark', color: '#3A76F0' },
  webchat: { name: 'globe', color: C.accent },
  main: { name: 'sparkles', color: C.coral },
  dm: { name: 'chatbubble', color: C.secondary },
  direct: { name: 'chatbubble', color: C.secondary },
};

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function SessionItem({
  session,
  onPress,
}: {
  session: GatewaySession;
  onPress: () => void;
}) {
  const channelConfig = CHANNEL_ICONS[session.channelType] || CHANNEL_ICONS.main;

  return (
    <Pressable
      style={({ pressed }) => [styles.sessionItem, pressed && { backgroundColor: C.cardElevated }]}
      onPress={onPress}
    >
      <View style={[styles.sessionIcon, { backgroundColor: channelConfig.color + '15' }]}>
        <Ionicons name={channelConfig.name as any} size={20} color={channelConfig.color} />
      </View>
      <View style={styles.sessionContent}>
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionLabel} numberOfLines={1}>{session.label}</Text>
          <Text style={styles.sessionTime}>{formatTimeAgo(session.lastActivity)}</Text>
        </View>
        <View style={styles.sessionMeta}>
          <View style={styles.sessionChannelBadge}>
            <Text style={styles.sessionChannelText}>{session.channelType}</Text>
          </View>
          <View style={styles.sessionMsgCount}>
            <Ionicons name="chatbubble-outline" size={10} color={C.textTertiary} />
            <Text style={styles.sessionMsgCountText}>{session.messageCount}</Text>
          </View>
          {session.isActive && (
            <View style={styles.activeBadge}>
              <PulsingDot color={C.success} size={6} />
              <Text style={styles.activeText}>Active</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
    </Pressable>
  );
}

function SessionHistoryModal({
  session,
  visible,
  onClose,
}: {
  session: GatewaySession | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { fetchGatewaySessionHistory } = useApp();
  const [messages, setMessages] = useState<GatewaySessionMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && session) {
      setLoading(true);
      fetchGatewaySessionHistory(session.sessionKey)
        .then(setMessages)
        .catch(() => setMessages([]))
        .finally(() => setLoading(false));
    } else {
      setMessages([]);
    }
  }, [visible, session, fetchGatewaySessionHistory]);

  if (!session) return null;
  const channelConfig = CHANNEL_ICONS[session.channelType] || CHANNEL_ICONS.main;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <View style={[styles.modalIcon, { backgroundColor: channelConfig.color + '15' }]}>
              <Ionicons name={channelConfig.name as any} size={20} color={channelConfig.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle} numberOfLines={1}>{session.label}</Text>
              <Text style={styles.modalSubtitle}>{session.messageCount} messages · {session.channelType}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={C.coral} />
              <Text style={styles.loadingText}>Loading history...</Text>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Ionicons name="chatbubbles-outline" size={32} color={C.textTertiary} />
              <Text style={styles.emptyHistoryText}>No messages available</Text>
              <Text style={styles.emptyHistorySubtext}>History may not be accessible via the gateway</Text>
            </View>
          ) : (
            <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                const isTool = msg.role === 'tool';
                return (
                  <View
                    key={i}
                    style={[
                      styles.historyMsg,
                      isUser ? styles.historyMsgUser : isTool ? styles.historyMsgTool : styles.historyMsgAssistant,
                    ]}
                  >
                    <View style={styles.historyMsgHeader}>
                      <Text style={[styles.historyRole, { color: isUser ? C.coral : isTool ? C.amber : C.secondary }]}>
                        {isUser ? 'User' : isTool ? (msg.toolName || 'Tool') : 'Agent'}
                      </Text>
                      <Text style={styles.historyTime}>
                        {new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Text style={styles.historyContent} numberOfLines={isTool ? 4 : undefined}>{msg.content}</Text>
                  </View>
                );
              })}
              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function SessionsScreen() {
  const insets = useSafeAreaInsets();
  const { gatewaySessions, fetchGatewaySessions, gatewayStatus } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSession, setSelectedSession] = useState<GatewaySession | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

  useEffect(() => {
    if (gatewayStatus === 'connected') {
      fetchGatewaySessions().catch(() => { });
    }
  }, [gatewayStatus, fetchGatewaySessions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchGatewaySessions().catch(() => { });
    setRefreshing(false);
  }, [fetchGatewaySessions]);

  const handleSessionPress = useCallback((session: GatewaySession) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSession(session);
    setHistoryVisible(true);
  }, []);

  const sortedSessions = useMemo(
    () => [...gatewaySessions].sort((a, b) => b.lastActivity - a.lastActivity),
    [gatewaySessions],
  );

  const channelGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    gatewaySessions.forEach((s) => {
      groups[s.channelType] = (groups[s.channelType] || 0) + 1;
    });
    return groups;
  }, [gatewaySessions]);

  const webTopPad = Platform.OS === 'web' ? 47 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <LinearGradient colors={C.gradient.ocean} style={styles.headerGradient}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Gateway Sessions</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      {gatewayStatus === 'connected' && Object.keys(channelGroups).length > 0 && (
        <View style={styles.channelSummary}>
          {Object.entries(channelGroups).map(([type, count]) => {
            const config = CHANNEL_ICONS[type] || CHANNEL_ICONS.main;
            return (
              <View key={type} style={styles.channelChip}>
                <Ionicons name={config.name as any} size={12} color={config.color} />
                <Text style={styles.channelChipText}>{count}</Text>
              </View>
            );
          })}
        </View>
      )}

      <FlatList
        data={sortedSessions}
        keyExtractor={(item) => item.sessionKey}
        renderItem={({ item }) => (
          <SessionItem session={item} onPress={() => handleSessionPress(item)} />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 20 },
          sortedSessions.length === 0 && styles.emptyListContent,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        scrollEnabled={!!sortedSessions.length}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {gatewayStatus !== 'connected' ? (
              <>
                <Ionicons name="cloud-offline-outline" size={40} color={C.textTertiary} />
                <Text style={styles.emptyTitle}>Not connected</Text>
                <Text style={styles.emptySubtitle}>Connect to your OpenClaw gateway to see active sessions</Text>
                <Pressable
                  onPress={() => router.push('/(tabs)/settings')}
                  style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.8 }]}
                >
                  <LinearGradient colors={C.gradient.lobster} style={styles.emptyBtnGrad}>
                    <Ionicons name="link" size={18} color="#fff" />
                    <Text style={styles.emptyBtnText}>Connect</Text>
                  </LinearGradient>
                </Pressable>
              </>
            ) : (
              <>
                <Ionicons name="chatbubbles-outline" size={40} color={C.textTertiary} />
                <Text style={styles.emptyTitle}>No sessions found</Text>
                <Text style={styles.emptySubtitle}>Sessions will appear as your agent interacts across channels</Text>
              </>
            )}
          </View>
        }
      />

      <SessionHistoryModal
        session={selectedSession}
        visible={historyVisible}
        onClose={() => {
          setHistoryVisible(false);
          setSelectedSession(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  headerGradient: { borderBottomWidth: 1, borderBottomColor: C.borderLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: C.text, flex: 1, textAlign: 'center' },
  channelSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  channelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.card, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: C.borderLight },
  channelChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.textSecondary },
  listContent: { paddingHorizontal: 20 },
  emptyListContent: { flex: 1, justifyContent: 'center' },
  sessionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  sessionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sessionContent: { flex: 1 },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.text, flex: 1, marginRight: 8 },
  sessionTime: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  sessionChannelBadge: { backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  sessionChannelText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary, textTransform: 'uppercase' },
  sessionMsgCount: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sessionMsgCountText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  activeText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.success },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.borderLight, marginLeft: 56 },
  emptyState: { alignItems: 'center', gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: C.text },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 16, borderRadius: 12, overflow: 'hidden' },
  emptyBtnGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, gap: 8 },
  emptyBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingTop: 12 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.textTertiary, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  modalIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: C.text },
  modalSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary, marginTop: 2 },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  loadingState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textSecondary },
  emptyHistory: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyHistoryText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: C.text },
  emptyHistorySubtext: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textSecondary, textAlign: 'center', paddingHorizontal: 40 },
  historyList: { paddingHorizontal: 20, paddingTop: 12 },
  historyMsg: { marginBottom: 12, padding: 12, borderRadius: 12 },
  historyMsgUser: { backgroundColor: C.primaryMuted, borderWidth: 1, borderColor: C.primary + '20' },
  historyMsgAssistant: { backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight },
  historyMsgTool: { backgroundColor: C.amberMuted, borderWidth: 1, borderColor: C.amber + '20' },
  historyMsgHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  historyRole: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textTransform: 'uppercase' },
  historyTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  historyContent: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.text, lineHeight: 20 },
});
