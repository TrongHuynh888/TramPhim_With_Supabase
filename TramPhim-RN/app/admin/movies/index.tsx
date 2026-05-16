/**
 * Quản lý Phim - Danh sách phim + lọc + phân trang
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView, FlatList, View, Text, TextInput,
  TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  Image, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Href } from 'expo-router';
import AdminHeader from '../../../components/admin/AdminHeader';
import {
  fetchAdminMovies, deleteMovie, updateMovieStatus,
  AdminMovie, MovieFilter,
} from '../../../services/admin/movieService';

export default function AdminMoviesList() {
  const router = useRouter();
  const [movies, setMovies] = useState<AdminMovie[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<'' | 'single' | 'series'>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const loadMovies = useCallback(async (p: number = 1) => {
    try {
      setLoading(true);
      const filter: MovieFilter = {
        search: searchText || undefined,
        type: filterType || undefined,
        sortOrder,
      };
      const r = await fetchAdminMovies(p, filter);
      setMovies(r.movies); setTotal(r.total); setTotalPages(r.totalPages);
    } finally { setLoading(false); setRefreshing(false); }
  }, [searchText, filterType, sortOrder]);

  useEffect(() => { loadMovies(page); }, [page, sortOrder, filterType]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); loadMovies(1); }, 400);
    return () => clearTimeout(t);
  }, [searchText]);

  const handleDelete = (m: AdminMovie) => {
    Alert.alert('Xóa phim', `Xóa "${m.title}" và tất cả tập liên quan?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        const r = await deleteMovie(m.id);
        if (r.success) { Alert.alert('Đã xóa!'); loadMovies(page); }
        else Alert.alert('Lỗi', r.error || '');
      }},
    ]);
  };

  const handleToggleStatus = async (m: AdminMovie) => {
    const s = m.status === 'public' ? 'hidden' : 'public';
    const r = await updateMovieStatus(m.id, s);
    if (r.success) loadMovies(page);
  };

  const renderMovie = ({ item }: { item: AdminMovie }) => (
    <TouchableOpacity style={s.row} onPress={() => router.push(`/admin/movies/${item.id}` as Href)} activeOpacity={0.7}>
      <Image source={{ uri: item.poster_url || 'https://placehold.co/60x90/1a1a2e/666?text=No' }} style={s.poster} />
      <View style={s.info}>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        <View style={s.meta}>
          <View style={[s.badge, { backgroundColor: item.type === 'series' ? 'rgba(218,119,242,0.15)' : 'rgba(77,171,247,0.15)' }]}>
            <Text style={{ color: item.type === 'series' ? '#da77f2' : '#4dabf7', fontSize: 10, fontWeight: '700' }}>
              {item.type === 'series' ? 'Bộ' : 'Lẻ'}
            </Text>
          </View>
          {item.year ? <Text style={s.metaTxt}>{item.year}</Text> : null}
          <Text style={s.metaTxt}>👁 {(item.views||0).toLocaleString()}</Text>
        </View>
        <View style={[s.sBadge, { backgroundColor: item.status === 'public' ? 'rgba(0,255,136,0.1)' : 'rgba(255,170,0,0.1)' }]}>
          <Text style={{ color: item.status === 'public' ? '#00ff88' : '#ffaa00', fontSize: 10, fontWeight: '600' }}>
            {item.status === 'public' ? '● Công khai' : '◷ Ẩn/Chờ'}
          </Text>
        </View>
      </View>
      <View style={s.acts}>
        <TouchableOpacity onPress={() => handleToggleStatus(item)} style={s.actBtn}>
          <Ionicons name={item.status === 'public' ? 'eye-off-outline' : 'eye-outline'} size={18} color="#4db8ff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} style={s.actBtn}>
          <Ionicons name="trash-outline" size={18} color="#ff4444" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const Chip = ({ label, active, onPress: op }: any) => (
    <TouchableOpacity style={[s.chip, active && s.chipAct]} onPress={op}>
      <Text style={[s.chipTxt, active && s.chipTxtAct]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.ctn}>
      <AdminHeader title="Quản lý Phim" subtitle={`${total} phim`} />
      <View style={s.searchBar}>
        <Ionicons name="search" size={18} color="#666" />
        <TextInput style={s.searchIn} placeholder="Tìm phim..." placeholderTextColor="#555" value={searchText} onChangeText={setSearchText} />
        {searchText ? <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="#555" /></TouchableOpacity> : null}
      </View>
      <View style={s.filterRow}>
        <Chip label="Tất cả" active={filterType === ''} onPress={() => { setFilterType(''); setPage(1); }} />
        <Chip label="Phim lẻ" active={filterType === 'single'} onPress={() => { setFilterType('single'); setPage(1); }} />
        <Chip label="Phim bộ" active={filterType === 'series'} onPress={() => { setFilterType('series'); setPage(1); }} />
        <TouchableOpacity style={s.sortBtn} onPress={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}>
          <Ionicons name={sortOrder === 'newest' ? 'arrow-down' : 'arrow-up'} size={14} color="#4db8ff" />
          <Text style={s.sortTxt}>{sortOrder === 'newest' ? 'Mới' : 'Cũ'}</Text>
        </TouchableOpacity>
      </View>
      {loading && movies.length === 0 ? (
        <View style={s.center}><ActivityIndicator size="large" color="#4db8ff" /></View>
      ) : (
        <FlatList data={movies} keyExtractor={i => i.id} renderItem={renderMovie}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMovies(page); }} tintColor="#4db8ff" />}
          ListEmptyComponent={<View style={s.empty}><Ionicons name="film-outline" size={48} color="#333" /><Text style={s.emptyTxt}>Không có phim</Text></View>}
          ListFooterComponent={totalPages > 1 ? (
            <View style={s.pagi}>
              <TouchableOpacity disabled={page <= 1} onPress={() => setPage(page - 1)} style={[s.pgBtn, page <= 1 && s.pgDis]}>
                <Ionicons name="chevron-back" size={16} color={page <= 1 ? '#333' : '#fff'} />
              </TouchableOpacity>
              <Text style={s.pgTxt}>{page}/{totalPages} ({total})</Text>
              <TouchableOpacity disabled={page >= totalPages} onPress={() => setPage(page + 1)} style={[s.pgBtn, page >= totalPages && s.pgDis]}>
                <Ionicons name="chevron-forward" size={16} color={page >= totalPages ? '#333' : '#fff'} />
              </TouchableOpacity>
            </View>
          ) : null}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  ctn: { flex: 1, backgroundColor: '#0a0a0f' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(26,26,46,0.8)', marginHorizontal: 16, marginTop: 10, borderRadius: 10, paddingHorizontal: 12, height: 42, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  searchIn: { flex: 1, color: '#fff', fontSize: 14, marginLeft: 8 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chipAct: { backgroundColor: 'rgba(77,184,255,0.15)', borderColor: 'rgba(77,184,255,0.4)' },
  chipTxt: { color: '#888', fontSize: 12, fontWeight: '600' },
  chipTxtAct: { color: '#4db8ff' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  sortTxt: { color: '#4db8ff', fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(26,26,46,0.5)', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  poster: { width: 52, height: 75, borderRadius: 8, backgroundColor: '#1a1a2e' },
  info: { flex: 1, marginLeft: 12 },
  title: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  metaTxt: { color: '#777', fontSize: 11 },
  sBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  acts: { gap: 10 },
  actBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  pagi: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 16 },
  pgBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(77,184,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  pgDis: { backgroundColor: 'rgba(255,255,255,0.04)' },
  pgTxt: { color: '#888', fontSize: 13 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTxt: { color: '#555', marginTop: 12, fontSize: 14 },
});
