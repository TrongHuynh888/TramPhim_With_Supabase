/**
 * Layout cho khu vực Admin
 * Kiểm tra quyền admin trước khi cho phép truy cập
 */
import React from 'react';
import { Stack } from 'expo-router';
import { useAuthStore } from '../../stores/useAuthStore';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const router = useRouter();

  // Chặn truy cập nếu không phải admin
  if (!user || !isAdmin) {
    return (
      <View style={styles.denied}>
        <Ionicons name="shield-outline" size={60} color="#ff4444" />
        <Text style={styles.deniedTitle}>Truy cập bị từ chối</Text>
        <Text style={styles.deniedSub}>
          Bạn không có quyền truy cập khu vực quản trị.
        </Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace('/(tabs)/profile')}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={styles.backBtnText}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0a0a0f' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="movies/index" />
      <Stack.Screen name="movies/[id]" />
      <Stack.Screen name="episodes/index" />
      <Stack.Screen name="episodes/[movieId]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  denied: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  deniedTitle: {
    color: '#ff4444',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
  },
  deniedSub: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(77, 184, 255, 0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(77, 184, 255, 0.3)',
  },
  backBtnText: { color: '#4db8ff', fontSize: 14, fontWeight: '600' },
});
