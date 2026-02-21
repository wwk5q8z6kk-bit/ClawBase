import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const TabIcon = ({ name, color, size, focused }: { name: any; color: string; size: number; focused: boolean }) => {
  const animatedScale = useSharedValue(focused ? 1 : 0.4);
  const animatedOpacity = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    animatedScale.value = withSpring(focused ? 1 : 0.4, { damping: 14, stiffness: 120 });
    animatedOpacity.value = withTiming(focused ? 1 : 0, { duration: 150, easing: Easing.out(Easing.ease) });
  }, [focused, animatedScale, animatedOpacity]);

  const style = useAnimatedStyle(() => ({
    opacity: animatedOpacity.value,
    transform: [{ scale: animatedScale.value }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 44, height: 44, marginTop: 4 }}>
      <Animated.View style={[{
        position: 'absolute',
        top: 0,
        width: 20,
        height: 3,
        borderRadius: 2,
        backgroundColor: color,
        boxShadow: `0px 2px 6px ${color}CC`,
        elevation: 4,
      }, style]} />
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
        tabBarActiveTintColor: Colors.dark.primary,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Colors.dark.surface,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: Colors.dark.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () => (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.dark.surface, opacity: 0.98 }]} />
          ),
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
          tabBarBadgeStyle: { backgroundColor: Colors.dark.coral, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
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
  return <ClassicTabLayout />;
}
