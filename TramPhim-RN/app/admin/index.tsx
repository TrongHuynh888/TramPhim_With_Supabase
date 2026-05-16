/**
 * Dashboard Admin - Trang chính khu vực quản trị
 * Gồm: 6 stat cards + menu điều hướng đến các chức năng con
 * Tương ứng dashboardPanel + admin-nav trong bản web
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Href } from 'expo-router';
import AdminHeader from '../../components/admin/AdminHeader';
import StatCard from '../../components/admin/StatCard';
import AdminMenuItem from '../../components/admin/AdminMenuItem';
import { fetchAdminStats, fetchRecentMovies, AdminStats } from '../../services/admin/statsService';
import { Ionicons } from '@expo/vector-icons';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentMovies, setRecentMovies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tải dữ liệu thống kê
  const loadData = useCallback(async () => {
    try {
      const [statsData, moviesData] = await Promise.all([
        fetchAdminStats(),
        fetchRecentMovies(5),
      ]);
      setStats(statsData);
      setRecentMovies(moviesData);
    } catch (e) {
      console.error('Lỗi load dashboard:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Kéo xuống để refresh
  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <AdminHeader title="Quản trị Admin" showBack={true} />
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4db8ff" />
          <Text style={styles.loadingText}>Đang tải thống kê...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AdminHeader
        title="🛡️ Quản trị Admin"
        subtitle="Tổng quan hệ thống"
        showBack={true}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4db8ff"
          />
        }
      >
        {/* ═══ STAT CARDS ═══ */}
        <Text style={styles.sectionTitle}>📊 Thống kê tổng quan</Text>
        <View style={styles.statsGrid}>
          <StatCard
            icon="film-outline"
            label="Tổng số phim"
            value={stats?.totalMovies ?? 0}
            color="#ff6b6b"
          />
          <StatCard
            icon="eye-outline"
            label="Tổng lượt xem"
            value={stats?.totalViews ?? 0}
            color="#4db8ff"
          />
          <StatCard
            icon="cash-outline"
            label="Doanh thu"
            value={stats?.totalRevenue ?? 0}
            color="#00ff88"
            suffix=" CRO"
          />
          <StatCard
            icon="people-outline"
            label="Tổng người dùng"
            value={stats?.totalUsers ?? 0}
            color="#ffaa00"
          />
          <StatCard
            icon="diamond-outline"
            label="Thành viên VIP"
            value={stats?.vipUsers ?? 0}
            color="#ffd700"
          />
          <StatCard
            icon="warning-outline"
            label="Báo lỗi chờ"
            value={stats?.pendingErrors ?? 0}
            color="#ff69b4"
          />
        </View>

        {/* ═══ PHIM GẦN ĐÂY ═══ */}
        {recentMovies.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>🕐 Phim mới thêm gần đây</Text>
            <View style={styles.recentList}>
              {recentMovies.map((movie) => (
                <View key={movie.id} style={styles.recentItem}>
                  <View style={styles.recentLeft}>
                    <Text style={styles.recentTitle} numberOfLines={1}>
                      {movie.title}
                    </Text>
                    <View style={styles.recentMeta}>
                      <View
                        style={[
                          styles.typeBadge,
                          {
                            backgroundColor:
                              movie.type === 'series'
                                ? 'rgba(218,119,242,0.15)'
                                : 'rgba(77,171,247,0.15)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeBadgeText,
                            {
                              color:
                                movie.type === 'series' ? '#da77f2' : '#4dabf7',
                            },
                          ]}
                        >
                          {movie.type === 'series' ? 'Phim bộ' : 'Phim lẻ'}
                        </Text>
                      </View>
                      <Ionicons name="eye-outline" size={12} color="#888" />
                      <Text style={styles.viewCount}>
                        {(movie.views || 0).toLocaleString('vi-VN')}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          movie.status === 'public'
                            ? 'rgba(0,255,136,0.12)'
                            : movie.status === 'pending'
                            ? 'rgba(255,170,0,0.12)'
                            : 'rgba(255,68,68,0.12)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            movie.status === 'public'
                              ? '#00ff88'
                              : movie.status === 'pending'
                              ? '#ffaa00'
                              : '#ff4444',
                        },
                      ]}
                    >
                      {movie.status === 'public'
                        ? 'Công khai'
                        : movie.status === 'pending'
                        ? 'Chờ duyệt'
                        : 'Ẩn'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* ═══ MENU CHỨC NĂNG ═══ */}
        <Text style={styles.sectionTitle}>⚙️ Quản lý nội dung</Text>
        <AdminMenuItem
          icon="film-outline"
          iconColor="#ff6b6b"
          title="Quản lý Phim"
          subtitle={`${stats?.totalMovies ?? 0} phim`}
          onPress={() => router.push('/admin/movies' as Href)}
        />
        <AdminMenuItem
          icon="list-outline"
          iconColor="#4db8ff"
          title="Quản lý Tập Phim"
          subtitle="Thêm, sửa, xóa tập"
          onPress={() => router.push('/admin/episodes' as Href)}
        />

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
          👥 Quản lý người dùng
        </Text>
        <AdminMenuItem
          icon="people-outline"
          iconColor="#ffaa00"
          title="Người dùng"
          subtitle={`${stats?.totalUsers ?? 0} tài khoản`}
          onPress={() => router.push('/admin/users' as Href)}
        />
        <AdminMenuItem
          icon="star-outline"
          iconColor="#ffd700"
          title="Yêu cầu VIP"
          subtitle="Duyệt nâng cấp VIP"
          onPress={() => router.push('/admin/vip-requests' as Href)}
        />
        <AdminMenuItem
          icon="warning-outline"
          iconColor="#ff6b6b"
          title="Báo lỗi"
          badge={stats?.pendingErrors}
          subtitle="Xử lý báo lỗi từ người dùng"
          onPress={() => router.push('/admin/error-reports' as Href)}
        />
        <AdminMenuItem
          icon="chatbubbles-outline"
          iconColor="#00ff88"
          title="Bình luận"
          subtitle="Duyệt và xóa bình luận"
          onPress={() => router.push('/admin/comments' as Href)}
        />
        <AdminMenuItem
          icon="notifications-outline"
          iconColor="#da77f2"
          title="Thông báo"
          subtitle="Gửi thông báo đẩy"
          onPress={() => router.push('/admin/notifications' as Href)}
        />

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
          🗂️ Metadata
        </Text>
        <AdminMenuItem
          icon="pricetags-outline"
          iconColor="#da77f2"
          title="Thể loại"
          subtitle="Quản lý thể loại phim"
          onPress={() => router.push('/admin/categories' as Href)}
        />
        <AdminMenuItem
          icon="globe-outline"
          iconColor="#4ecdc4"
          title="Quốc gia"
          subtitle="Quản lý quốc gia"
          onPress={() => router.push('/admin/countries' as Href)}
        />
        <AdminMenuItem
          icon="person-outline"
          iconColor="#00d2ff"
          title="Diễn viên"
          subtitle="Quản lý diễn viên"
          onPress={() => router.push('/admin/actors' as Href)}
        />

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
          ⚙️ Cấu hình hệ thống
        </Text>
        <AdminMenuItem
          icon="settings-outline"
          iconColor="#9b59b6"
          title="Cài đặt hệ thống"
          subtitle="API Keys, Telegram Bot"
          onPress={() => router.push('/admin/settings' as Href)}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 16 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#888', marginTop: 12, fontSize: 14 },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  /* Phim gần đây */
  recentList: {
    backgroundColor: 'rgba(26,26,46,0.5)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    marginBottom: 20,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  recentLeft: { flex: 1, marginRight: 10 },
  recentTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  recentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '600' },
  viewCount: { color: '#888', fontSize: 11 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
});
