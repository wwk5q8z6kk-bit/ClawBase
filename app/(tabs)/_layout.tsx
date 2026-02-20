import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const TabIcon = ({ name, color, size, focused }: { name: any; color: string; size: number; focused: boolean }) => (
  <View style={{ alignItems: 'center', justifyContent: 'center', width: 44, height: 44, marginTop: 4 }}>
    {focused && (
      <View style={{
        position: 'absolute',
        top: 0,
        width: 20,
        height: 3,
        borderRadius: 2,
        backgroundColor: color,
        shadowColor: color,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
        elevation: 4
      }} />
    )}
    <Ionicons name={name} size={size} color={color} />
  </View>
);

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'gauge.open.with.lines.needle.33percent', selected: 'gauge.open.with.lines.needle.33percent' }} />
        <Label>Mission Control</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chat">
        <Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} />
        <Label>Chat</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="vault">
        <Icon sf={{ default: 'shield.lefthalf.filled', selected: 'shield.lefthalf.filled' }} />
        <Label>Vault</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <Icon sf={{ default: 'calendar', selected: 'calendar' }} />
        <Label>Calendar</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const isWeb = Platform.OS === 'web';
  const isIOS = Platform.OS === 'ios';
  const { tasks, memoryEntries, conversations } = useApp();

  const activeTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const unreadMemories = memoryEntries.filter((m) => m.reviewStatus === 'unread').length;
  const vaultBadge = activeTasks + unreadMemories;
  const recentChatCount = conversations.filter((c) => Date.now() - c.lastMessageTime < 3600000).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.dark.primary,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : Colors.dark.surface,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: Colors.dark.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.dark.surface }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mission Control',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? "speedometer" : "speedometer-outline"} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? "chatbubbles" : "chatbubbles-outline"} size={size} color={color} focused={focused} />
          ),
          tabBarBadge: recentChatCount > 0 ? recentChatCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.dark.coral, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? "shield-checkmark" : "shield-checkmark-outline"} size={size} color={color} focused={focused} />
          ),
          tabBarBadge: vaultBadge > 0 ? vaultBadge : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.dark.coral, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? "calendar" : "calendar-outline"} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? "settings" : "settings-outline"} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="memory"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="automations"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
