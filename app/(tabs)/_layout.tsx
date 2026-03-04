import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const C = Colors.dark;

const TabIcon = ({ name, color, size, focused }: { name: any; color: string; size: number; focused: boolean }) => {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 44, height: 44 }}>
      {focused && (
        <View style={{
          position: 'absolute',
          top: 2,
          width: 20,
          height: 3,
          borderRadius: 2,
          backgroundColor: color,
        }} />
      )}
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
};

function ClassicTabLayout() {
  const isWeb = Platform.OS === 'web';
  const { tasks, memoryEntries, conversations } = useApp();

  const activeTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const unreadMemories = memoryEntries.filter((m) => m.reviewStatus === 'unread').length;
  const vaultBadge = activeTasks + unreadMemories;
  const recentChatCount = conversations.filter((c) => Date.now() - c.lastMessageTime < 3600000).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.tabIconDefault,
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopWidth: 1,
          borderTopColor: C.border,
          elevation: 0,
          height: isWeb ? 84 : undefined,
          paddingBottom: isWeb ? 34 : undefined,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? "home" : "home-outline"} size={size} color={color} focused={focused} />
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
          tabBarBadgeStyle: { backgroundColor: C.coral, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Workspace',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? "grid" : "grid-outline"} size={size} color={color} focused={focused} />
          ),
          tabBarBadge: vaultBadge > 0 ? vaultBadge : undefined,
          tabBarBadgeStyle: { backgroundColor: C.coral, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
        }}
      />
      <Tabs.Screen
        name="automations"
        options={{
          title: 'Automate',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? "flash" : "flash-outline"} size={size} color={color} focused={focused} />
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
        name="calendar"
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
  return <ClassicTabLayout />;
}
