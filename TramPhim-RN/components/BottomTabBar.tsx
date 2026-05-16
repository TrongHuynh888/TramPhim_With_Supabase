import { AppText } from '../components/AppText';
import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter, usePathname } from 'expo-router';
import { Colors } from '../theme/colors';
import { useThemeStore } from '../stores/useThemeStore';

/**
 * Thanh menu dưới cùng (Bottom Tab Bar) dùng cho các trang ngoài group (tabs)
 * Đảm bảo trải nghiệm thống nhất giữa các màn hình
 */

interface TabItem {
  name: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  route: string;
  matchPaths: string[]; // Các path mà tab này được active
}

const TABS: TabItem[] = [
  { name: 'Trang Chủ', icon: 'home', route: '/', matchPaths: ['/', '/index'] },
  { name: 'Kho Phim', icon: 'film', route: '/movies', matchPaths: ['/movies'] },
  { name: 'Tìm Kiếm', icon: 'search', route: '/search', matchPaths: ['/search'] },
  { name: 'Tài Khoản', icon: 'user', route: '/profile', matchPaths: ['/profile'] },
];

export function BottomTabBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  const { primaryColor, themeColors } = useThemeStore();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: themeColors.bgSecondary, borderTopColor: themeColors.bgTertiary }]}>
      {TABS.map((tab) => {
        // Kiểm tra tab nào đang active dựa trên pathname hiện tại
        const isActive = tab.matchPaths.some(p => pathname === p);
        const color = isActive ? primaryColor : themeColors.textMuted;

        return (
          <Pressable
            key={tab.name}
            style={styles.tab}
            onPress={() => router.replace(tab.route as any)}
          >
            <FontAwesome name={tab.icon} size={24} color={color} style={{ marginBottom: -3 }} />
            <AppText style={[styles.label, { color }]}>{tab.name}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 10,
    marginTop: 4,
    fontFamily: 'Montserrat-SemiBold',
  },
});
