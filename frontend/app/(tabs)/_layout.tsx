import { Tabs } from 'expo-router';
import React from 'react';

import { TabIcon } from '@/components/TabIcon';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Tiga tab utama (D-02).
 *
 * Ikon tab bersifat dekoratif; label teks selalu ada sehingga status aktif tidak
 * hanya ditandai warna (NFR-01).
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSecondary,
        tabBarStyle: {
          backgroundColor: colors.bgSurface,
          borderTopColor: colors.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bgApp },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarAccessibilityLabel: t('tabs.home'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" size={24} color={color} focused={focused} testID="tab-icon-home" />
          ),
        }}
      />
      <Tabs.Screen
        name="journey"
        options={{
          title: t('tabs.journey'),
          tabBarAccessibilityLabel: t('tabs.journey'),
          // Ikon buku, bukan `journey` (balon bicara): tab ini adalah
          // perpustakaan cerita yang tersimpan, dan balon bicara memberi kesan
          // fitur obrolan yang tidak ada di fayLN.
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="journey" size={24} color={color} focused={focused} testID="tab-icon-journey" />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarAccessibilityLabel: t('tabs.settings'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="settings" size={24} color={color} focused={focused} testID="tab-icon-settings" />
          ),
        }}
      />
    </Tabs>
  );
}
