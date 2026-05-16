/**
 * Chi tiết / Sửa phim - Form chỉnh sửa thông tin phim
 */
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, TextInput,
  TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../../components/admin/AdminHeader';
import { fetchMovieDetail, saveMovie, AdminMovie } from '../../../services/admin/movieService';

export default function AdminMovieEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [originTitle, setOriginTitle] = useState('');
  const [description, setDescription] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [year, setYear] = useState('');
  const [type, setType] = useState<'single' | 'series'>('single');
  const [status, setStatus] = useState('public');
  const [quality, setQuality] = useState('1080p');
  const [totalEpisodes, setTotalEpisodes] = useState('');

  useEffect(() => {
    if (!isNew && id) {
      (async () => {
        const m = await fetchMovieDetail(id);
        if (m) {
          setTitle(m.title || '');
          setOriginTitle(m.origin_title || '');
          setDescription(m.description || '');
          setPosterUrl(m.poster_url || '');
          setBackgroundUrl(m.background_url || '');
          setYear(m.year || '');
          setType(m.type || 'single');
          setStatus(m.status || 'public');
          setQuality(m.quality || '1080p');
          setTotalEpisodes(m.total_episodes?.toString() || '');
        }
        setLoading(false);
      })();
    }
  }, [id]);

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Lỗi', 'Vui lòng nhập tên phim'); return; }
    setSaving(true);
    try {
      const payload: Partial<AdminMovie> = {
        title: title.trim(),
        origin_title: originTitle.trim() || undefined,
        description: description.trim() || undefined,
        poster_url: posterUrl.trim() || undefined,
        background_url: backgroundUrl.trim() || undefined,
        year: year.trim() || undefined,
        type,
        status,
        quality,
        total_episodes: totalEpisodes ? parseInt(totalEpisodes) : undefined,
      };
      if (!isNew) payload.id = id;

      const r = await saveMovie(payload, isNew);
      if (r.success) {
        Alert.alert('Thành công', isNew ? 'Đã thêm phim mới!' : 'Đã cập nhật phim!');
        router.back();
      } else {
        Alert.alert('Lỗi', r.error || 'Không thể lưu phim');
      }
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={st.ctn}>
        <AdminHeader title="Đang tải..." />
        <View style={st.center}><ActivityIndicator size="large" color="#4db8ff" /></View>
      </SafeAreaView>
    );
  }

  const Field = ({ label, value, onChangeText, placeholder, multiline, keyboardType }: any) => (
    <View style={st.field}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        style={[st.input, multiline && { height: 100, textAlignVertical: 'top' }]}
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor="#444"
        multiline={multiline} keyboardType={keyboardType}
      />
    </View>
  );

  const TypeBtn = ({ val, label }: { val: 'single' | 'series'; label: string }) => (
    <TouchableOpacity
      style={[st.typeBtn, type === val && st.typeBtnAct]}
      onPress={() => setType(val)}
    >
      <Text style={[st.typeTxt, type === val && st.typeTxtAct]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={st.ctn}>
      <AdminHeader
        title={isNew ? 'Thêm phim mới' : 'Sửa phim'}
        rightActions={
          <TouchableOpacity style={st.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : (
              <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={st.saveTxt}>Lưu</Text></>
            )}
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={st.scroll}>
        {/* Preview poster */}
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={st.preview} />
        ) : null}

        <Field label="Tên phim *" value={title} onChangeText={setTitle} placeholder="Nhập tên phim..." />
        <Field label="Tên gốc" value={originTitle} onChangeText={setOriginTitle} placeholder="Tên tiếng Anh/gốc..." />
        <Field label="Mô tả" value={description} onChangeText={setDescription} placeholder="Nội dung phim..." multiline />
        <Field label="Poster URL" value={posterUrl} onChangeText={setPosterUrl} placeholder="https://..." />
        <Field label="Background URL" value={backgroundUrl} onChangeText={setBackgroundUrl} placeholder="https://..." />
        <Field label="Năm" value={year} onChangeText={setYear} placeholder="2024" keyboardType="numeric" />

        {/* Loại phim */}
        <View style={st.field}>
          <Text style={st.label}>Loại phim</Text>
          <View style={st.typeRow}>
            <TypeBtn val="single" label="🎬 Phim lẻ" />
            <TypeBtn val="series" label="📺 Phim bộ" />
          </View>
        </View>

        {type === 'series' ? (
          <Field label="Tổng số tập" value={totalEpisodes} onChangeText={setTotalEpisodes} placeholder="VD: 16" keyboardType="numeric" />
        ) : null}

        {/* Trạng thái */}
        <View style={st.field}>
          <Text style={st.label}>Trạng thái</Text>
          <View style={st.typeRow}>
            {['public', 'hidden', 'pending'].map(s => (
              <TouchableOpacity key={s} style={[st.typeBtn, status === s && st.typeBtnAct]} onPress={() => setStatus(s)}>
                <Text style={[st.typeTxt, status === s && st.typeTxtAct]}>
                  {s === 'public' ? '● Công khai' : s === 'pending' ? '◷ Chờ duyệt' : '○ Ẩn'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Field label="Chất lượng" value={quality} onChangeText={setQuality} placeholder="1080p" />
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  ctn: { flex: 1, backgroundColor: '#0a0a0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  preview: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16, backgroundColor: '#1a1a2e' },
  field: { marginBottom: 16 },
  label: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { backgroundColor: 'rgba(26,26,46,0.8)', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  typeBtnAct: { backgroundColor: 'rgba(77,184,255,0.15)', borderColor: 'rgba(77,184,255,0.4)' },
  typeTxt: { color: '#888', fontSize: 13, fontWeight: '600' },
  typeTxtAct: { color: '#4db8ff' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(0,255,136,0.15)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,255,136,0.3)' },
  saveTxt: { color: '#00ff88', fontSize: 13, fontWeight: '700' },
});
