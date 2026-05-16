/**
 * Chọn phim để quản lý tập - Grid danh sách phim
 * Tương ứng movieSelectionGrid trong web admin
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView, FlatList, View, Text, TextInput,
  TouchableOpacity, StyleSheet, Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Href } from 'expo-router';
import AdminHeader from '../../../components/admin/AdminHeader';
import { fetchAdminMovies, AdminMovie, MovieFilter } from '../../../services/admin/movieService';
import { countEpisodes } from '../../../services/admin/episodeService';

export default function AdminEpisodesIndex() {
  const router = useRouter();
  const [movies, setMovies] = useState<(AdminMovie & { _epCount?: number })[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const loadMovies = useCallback(async (p: number = 1) => {
    try {
      setLoading(true);
      const filter: MovieFilter = { search: search || undefined, sortOrder: 'newest' };
      const r = await fetchAdminMovies(p, filter);
      // Đếm số tập cho mỗi phim (batch)
      const moviesWithCount = await Promise.all(
        r.movies.map(async (m) => {
          const c = await countEpisodes(m.id);
          return { ...m, _epCount: c };
        })
      );
      setMovies(moviesWithCount);
      setTotal(r.total); setTotalPages(r.totalPages);
    } finally { setLoading(false); setRefreshing(false); }
  }, [search]);

  useEffect(() => { loadMovies(page); }, [page]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); loadMovies(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const renderMovie = ({ item }: { item: AdminMovie & { _epCount?: number } }) => {
    const epCount = item._epCount || 0;
    const totalEps = item.total_episodes || 0;
    const isFull = totalEps > 0 && epCount >= totalEps;
    const hasNoEp = epCount === 0;

    return (
      <TouchableOpacity
        style={st.card}
        onPress={() => router.push(`/admin/episodes/${item.id}` as Href)}
        activeOpacity={0.7}
      >
        <Image source={{ uri: item.poster_url || 'https://placehold.co/120x180/1a1a2e/666?text=No' }} style={st.poster} />
        {/* Badge tập */}
        <View style={[st.epBadge, { backgroundColor: hasNoEp ? '#e74c3c' : isFull ? '#2ecc71' : '#3498db' }]}>
          <Text style={st.epBadgeTxt}>
            {hasNoEp ? '⚠ 0 tập' : isFull ? `✓ ${epCount}/${totalEps}` : totalEps > 0 ? `${epCount}/${totalEps}` : `${epCount} tập`}
          </Text>
        </View>
        <Text style={st.name} numberOfLines={2}>{item.title}</Text>
        <Text style={st.sub}>{item.year || '—'} • {item.type === 'series' ? 'Bộ' : 'Lẻ'}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={st.ctn}>
      <AdminHeader title="Quản lý Tập Phim" subtitle="Chọn phim để quản lý tập" />
      <View style={st.searchBar}>
        <Ionicons name="search" size={18} color="#666" />
        <TextInput style={st.searchIn} placeholder="Tìm phim..." placeholderTextColor="#555" value={search} onChangeText={setSearch} />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color="#555" /></TouchableOpacity> : null}
      </View>
      {loading && movies.length === 0 ? (
        <View style={st.center}><ActivityIndicator size="large" color="#4db8ff" /></View>
      ) : (
        <FlatList data={movies} keyExtractor={i => i.id} numColumns={3}
          renderItem={renderMovie}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMovies(page); }} tintColor="#4db8ff" />}
          ListEmptyComponent={<View style={st.center}><Ionicons name="film-outline" size={48} color="#333" /><Text style={st.emptyTxt}>Không tìm thấy phim</Text></View>}
          ListFooterComponent={totalPages > 1 ? (
            <View style={st.pagi}>
              <TouchableOpacity disabled={page <= 1} onPress={() => setPage(page - 1)} style={[st.pgBtn, page <= 1 && st.pgDis]}>
                <Ionicons name="chevron-back" size={16} color={page <= 1 ? '#333' : '#fff'} />
              </TouchableOpacity>
              <Text style={st.pgTxt}>{page}/{totalPages}</Text>
              <TouchableOpacity disabled={page >= totalPages} onPress={() => setPage(page + 1)} style={[st.pgBtn, page >= totalPages && st.pgDis]}>
                <Ionicons name="chevron-forward" size={16} color={page >= totalPages ? '#333' : '#fff'} />
              </TouchableOpacity>
            </View>
          ) : null}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  ctn: { flex: 1, backgroundColor: '#0a0a0f' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(26,26,46,0.8)', marginHorizontal: 16, marginTop: 10, borderRadius: 10, paddingHorizontal: 12, height: 42, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  searchIn: { flex: 1, color: '#fff', fontSize: 14, marginLeft: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  card: { flex: 1, maxWidth: '33%', backgroundColor: 'rgba(26,26,46,0.5)', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  poster: { width: '100%', aspectRatio: 2/3, backgroundColor: '#1a1a2e' },
  epBadge: { position: 'absolute', top: 4, left: 4, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  epBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '700' },
  name: { color: '#fff', fontSize: 11, fontWeight: '600', paddingHorizontal: 6, paddingTop: 6 },
  sub: { color: '#777', fontSize: 10, paddingHorizontal: 6, paddingBottom: 6, paddingTop: 2 },
  emptyTxt: { color: '#555', marginTop: 12 },
  pagi: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 16 },
  pgBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(77,184,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  pgDis: { backgroundColor: 'rgba(255,255,255,0.04)' },
  pgTxt: { color: '#888', fontSize: 13 },
});
