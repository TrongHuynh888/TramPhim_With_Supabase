/**
 * Quản lý tập của 1 phim - CRUD tập phim
 * Tương ứng episodesManagement trong web admin
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView, FlatList, View, Text, TextInput,
  TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  RefreshControl, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import AdminHeader from '../../../components/admin/AdminHeader';
import {
  fetchEpisodes, addEpisode, updateEpisode, deleteEpisode,
  deleteAllEpisodes, saveTotalEpisodes, Episode,
} from '../../../services/admin/episodeService';
import { fetchMovieDetail } from '../../../services/admin/movieService';

export default function AdminEpisodeManage() {
  const { movieId } = useLocalSearchParams<{ movieId: string }>();
  const [movieTitle, setMovieTitle] = useState('');
  const [movieType, setMovieType] = useState('series');
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [totalEps, setTotalEps] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal thêm/sửa tập
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEp, setEditingEp] = useState<Episode | null>(null);
  const [epTitle, setEpTitle] = useState('');
  const [epHlsUrl, setEpHlsUrl] = useState('');
  const [epEmbedUrl, setEpEmbedUrl] = useState('');
  const [epDuration, setEpDuration] = useState('');
  const [epQuality, setEpQuality] = useState('1080p');
  const [savingEp, setSavingEp] = useState(false);

  // Tải dữ liệu
  const loadData = useCallback(async () => {
    if (!movieId) return;
    try {
      setLoading(true);
      const [movie, eps] = await Promise.all([
        fetchMovieDetail(movieId),
        fetchEpisodes(movieId),
      ]);
      if (movie) {
        setMovieTitle(movie.title);
        setMovieType(movie.type || 'series');
        setTotalEps(movie.total_episodes?.toString() || '');
      }
      setEpisodes(eps);
    } finally { setLoading(false); setRefreshing(false); }
  }, [movieId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Mở modal thêm tập mới
  const openAddModal = () => {
    setEditingEp(null);
    setEpTitle(`Tập ${episodes.length + 1}`);
    setEpHlsUrl(''); setEpEmbedUrl('');
    setEpDuration(''); setEpQuality('1080p');
    setModalVisible(true);
  };

  // Mở modal sửa tập
  const openEditModal = (ep: Episode) => {
    setEditingEp(ep);
    setEpTitle(ep.title || ep.episode_number || '');
    const hls = ep.sources?.find(s => s.type === 'hls');
    const embed = ep.sources?.find(s => s.type === 'embed');
    setEpHlsUrl(hls?.source || '');
    setEpEmbedUrl(embed?.source || '');
    setEpDuration(ep.duration || '');
    setEpQuality(ep.quality || '1080p');
    setModalVisible(true);
  };

  // Lưu tập
  const handleSaveEp = async () => {
    if (!epTitle.trim()) { Alert.alert('Lỗi', 'Nhập tên tập'); return; }
    setSavingEp(true);
    try {
      const sources = [];
      if (epHlsUrl.trim()) {
        sources.push({ label: 'Bản gốc', type: 'hls' as const, source: epHlsUrl.trim() });
      }
      if (epEmbedUrl.trim()) {
        sources.push({ label: 'Dự phòng', type: 'embed' as const, source: epEmbedUrl.trim() });
      }
      // Normalize episode number
      let epNum = epTitle.trim().replace(/^(tập|tap|episode|ep)\.?\s*/i, '').trim();
      if (/^\d+$/.test(epNum)) epNum = String(parseInt(epNum, 10));

      if (editingEp?.id) {
        const r = await updateEpisode(editingEp.id, {
          title: epTitle.trim(), episode_number: epNum,
          duration: epDuration || undefined, quality: epQuality, sources,
        });
        if (!r.success) { Alert.alert('Lỗi', r.error || ''); return; }
      } else {
        const r = await addEpisode({
          movie_id: movieId!,
          title: epTitle.trim(), episode_number: epNum,
          episode_index: episodes.length,
          duration: epDuration || undefined, quality: epQuality, sources,
        });
        if (!r.success) { Alert.alert('Lỗi', r.error || ''); return; }
      }
      setModalVisible(false);
      loadData();
    } finally { setSavingEp(false); }
  };

  // Xóa 1 tập
  const handleDeleteEp = (ep: Episode) => {
    Alert.alert('Xóa tập', `Xóa "${ep.title || ep.episode_number}"?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        if (!ep.id) return;
        const r = await deleteEpisode(ep.id);
        if (r.success) loadData();
        else Alert.alert('Lỗi', r.error || '');
      }},
    ]);
  };

  // Xóa tất cả
  const handleDeleteAll = () => {
    Alert.alert('Xóa tất cả', `Xóa toàn bộ ${episodes.length} tập?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa tất cả', style: 'destructive', onPress: async () => {
        const r = await deleteAllEpisodes(movieId!);
        if (r.success) loadData();
        else Alert.alert('Lỗi', r.error || '');
      }},
    ]);
  };

  // Lưu tổng số tập
  const handleSaveTotalEps = async () => {
    const r = await saveTotalEpisodes(movieId!, parseInt(totalEps) || 0);
    if (r.success) Alert.alert('Đã lưu', `Tổng số tập: ${totalEps}`);
    else Alert.alert('Lỗi', r.error || '');
  };

  const renderEpisode = ({ item, index }: { item: Episode; index: number }) => {
    const srcCount = item.sources?.length || 0;
    return (
      <View style={st.epRow}>
        <View style={st.epIndex}><Text style={st.epIdxTxt}>{index + 1}</Text></View>
        <View style={st.epInfo}>
          <Text style={st.epName}>{item.title || item.episode_number || `Tập ${index + 1}`}</Text>
          <Text style={st.epMeta}>
            {srcCount} nguồn • {item.quality || 'HD'} • {item.duration || '—'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => openEditModal(item)} style={st.epBtn}>
          <Ionicons name="create-outline" size={16} color="#4db8ff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteEp(item)} style={st.epBtn}>
          <Ionicons name="trash-outline" size={16} color="#ff4444" />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={st.ctn}>
        <AdminHeader title="Đang tải..." />
        <View style={st.center}><ActivityIndicator size="large" color="#4db8ff" /></View>
      </SafeAreaView>
    );
  }

  const epCount = episodes.length;
  const total = parseInt(totalEps) || 0;
  const isFull = total > 0 && epCount >= total;

  return (
    <SafeAreaView style={st.ctn}>
      <AdminHeader title={movieTitle || 'Quản lý Tập'} subtitle={`${epCount} tập`} />

      {/* Thanh tổng số tập (chỉ hiện cho phim bộ) */}
      {movieType === 'series' ? (
        <View style={st.totalBar}>
          <Ionicons name="layers-outline" size={16} color="#4ecdc4" />
          <Text style={st.totalLabel}>Tổng tập:</Text>
          <TextInput style={st.totalInput} value={totalEps} onChangeText={setTotalEps}
            keyboardType="numeric" placeholder="?" placeholderTextColor="#555" />
          <TouchableOpacity style={st.totalSaveBtn} onPress={handleSaveTotalEps}>
            <Text style={st.totalSaveTxt}>Lưu</Text>
          </TouchableOpacity>
          <View style={[st.statusPill, { backgroundColor: isFull ? 'rgba(46,204,113,0.12)' : 'rgba(255,193,7,0.12)' }]}>
            <Text style={{ color: isFull ? '#2ecc71' : '#ffc107', fontSize: 11, fontWeight: '600' }}>
              {isFull ? `✅ Hoàn tất ${epCount}/${total}` : total > 0 ? `${epCount}/${total}` : `${epCount} tập`}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Actions */}
      <View style={st.actionsRow}>
        <TouchableOpacity style={st.addBtn} onPress={openAddModal}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={st.addBtnTxt}>Thêm tập</Text>
        </TouchableOpacity>
        {episodes.length > 0 ? (
          <TouchableOpacity style={st.delAllBtn} onPress={handleDeleteAll}>
            <Ionicons name="trash-outline" size={14} color="#ff4444" />
            <Text style={st.delAllTxt}>Xóa tất cả</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Danh sách tập */}
      <FlatList data={episodes} keyExtractor={(i, idx) => i.id || `ep-${idx}`}
        renderItem={renderEpisode}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#4db8ff" />}
        ListEmptyComponent={<View style={st.center}><Ionicons name="list-outline" size={48} color="#333" /><Text style={st.emptyTxt}>Chưa có tập nào</Text></View>}
      />

      {/* MODAL THÊM/SỬA TẬP */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalContent}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>{editingEp ? 'Sửa tập' : 'Thêm tập mới'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={st.modalField}>
              <Text style={st.fLabel}>Tên tập *</Text>
              <TextInput style={st.fInput} value={epTitle} onChangeText={setEpTitle} placeholder="VD: Tập 1" placeholderTextColor="#444" />
            </View>
            <View style={st.modalField}>
              <Text style={st.fLabel}>Link HLS (.m3u8)</Text>
              <TextInput style={st.fInput} value={epHlsUrl} onChangeText={setEpHlsUrl} placeholder="https://..." placeholderTextColor="#444" autoCapitalize="none" />
            </View>
            <View style={st.modalField}>
              <Text style={st.fLabel}>Link Embed (iframe)</Text>
              <TextInput style={st.fInput} value={epEmbedUrl} onChangeText={setEpEmbedUrl} placeholder="https://..." placeholderTextColor="#444" autoCapitalize="none" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[st.modalField, { flex: 1 }]}>
                <Text style={st.fLabel}>Thời lượng</Text>
                <TextInput style={st.fInput} value={epDuration} onChangeText={setEpDuration} placeholder="45 phút" placeholderTextColor="#444" />
              </View>
              <View style={[st.modalField, { flex: 1 }]}>
                <Text style={st.fLabel}>Chất lượng</Text>
                <TextInput style={st.fInput} value={epQuality} onChangeText={setEpQuality} placeholder="1080p" placeholderTextColor="#444" />
              </View>
            </View>
            <TouchableOpacity style={st.modalSaveBtn} onPress={handleSaveEp} disabled={savingEp}>
              {savingEp ? <ActivityIndicator size="small" color="#fff" /> : (
                <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={st.modalSaveTxt}>{editingEp ? 'Cập nhật' : 'Thêm tập'}</Text></>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  ctn: { flex: 1, backgroundColor: '#0a0a0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyTxt: { color: '#555', marginTop: 12 },
  /* Total bar */
  totalBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(78,205,196,0.08)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(78,205,196,0.2)' },
  totalLabel: { color: '#4ecdc4', fontSize: 13, fontWeight: '600' },
  totalInput: { width: 50, height: 32, backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', borderRadius: 6, textAlign: 'center', fontSize: 14 },
  totalSaveBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#4ecdc4', borderRadius: 6 },
  totalSaveTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  statusPill: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  /* Actions */
  actionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(77,184,255,0.2)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(77,184,255,0.4)' },
  addBtnTxt: { color: '#4db8ff', fontSize: 13, fontWeight: '600' },
  delAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)' },
  delAllTxt: { color: '#ff4444', fontSize: 12, fontWeight: '600' },
  /* Episode row */
  epRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(26,26,46,0.5)', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  epIndex: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(77,184,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  epIdxTxt: { color: '#4db8ff', fontSize: 13, fontWeight: '700' },
  epInfo: { flex: 1, marginLeft: 10 },
  epName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  epMeta: { color: '#777', fontSize: 11, marginTop: 2 },
  epBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', marginLeft: 6 },
  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#13131f', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalField: { marginBottom: 14 },
  fLabel: { color: '#aaa', fontSize: 12, fontWeight: '600', marginBottom: 5 },
  fInput: { backgroundColor: 'rgba(26,26,46,0.8)', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  modalSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, backgroundColor: '#4db8ff', borderRadius: 10, marginTop: 10 },
  modalSaveTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
