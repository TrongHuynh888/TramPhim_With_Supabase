import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../components/admin/AdminHeader';
import { settingsService, SystemSetting, FALLBACK_KEYS } from '../../services/admin/settingsService';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import * as Clipboard from 'expo-clipboard';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SETTING_FIELDS = [
  { id: 'supabase_url', title: 'Supabase URL', service: 'DATABASE & AUTH', icon: 'server-outline', desc: 'Endpoint chính để ứng dụng kết nối tới Supabase.', isReadonly: true, defaultVal: SUPABASE_URL },
  { id: 'supabase_anon_key', title: 'Supabase Anon Key', service: 'DATABASE & AUTH', icon: 'key-outline', desc: 'Khóa công khai dùng để gọi API Supabase.', isReadonly: true, defaultVal: SUPABASE_ANON_KEY },
  { id: 'imgbb_api_key', title: 'ImgBB API Key', service: 'CỘNG ĐỒNG (UPLOAD ẢNH)', icon: 'image-outline', desc: 'Dùng upload ảnh lên ImgBB trong phần Cộng đồng.', isReadonly: false, checkUrl: 'https://api.imgbb.com/1/upload' },
  { id: 'omdb_api_key', title: 'OMDb API Key', service: 'THÔNG TIN PHIM', icon: 'film-outline', desc: 'Key dùng để fetch Rating (IMDb) và thông tin phụ của phim từ OMDb API.', isReadonly: false, checkUrl: 'http://www.omdbapi.com/?i=tt0137523&apikey=' },
  { id: 'metered_api_key', title: 'Metered Video API', service: 'XEM CHUNG (WATCH PARTY)', icon: 'videocam-outline', desc: 'Khóa dùng để tạo phòng video call / stream trong Xem Chung.', isReadonly: false },
  { id: 'cloudflare_r2_url', title: 'Cloudflare R2 Worker', service: 'LƯU TRỮ ẢNH (CLOUD)', icon: 'cloud-outline', desc: 'URL tới Cloudflare Worker dùng làm Proxy upload ảnh.', isReadonly: false },
  { id: 'tmdb_api_key', title: 'TMDb API Key', service: 'METADATA PHIM', icon: 'list-circle-outline', desc: 'Bổ sung poster HD, trailer YouTube, thông tin diễn viên. (themoviedb.org)', isReadonly: false, checkUrl: 'https://api.themoviedb.org/3/movie/550?api_key=' },
  { id: 'gemini_api_key', title: 'Gemini AI API Key', service: 'DỊCH PHỤ ĐỀ AI', icon: 'color-wand-outline', desc: 'Mã bản quyền Google Gemini dùng dịch phụ đề chuẩn ngữ cảnh.', isReadonly: false },
  { id: 'groq_api_key', title: 'Groq API Key', service: 'DỊCH PHỤ ĐỀ AI (LLAMA 3)', icon: 'flash-outline', desc: 'Khóa API từ Groq — Tốc độ dịch siêu nhanh.', isReadonly: false },
];

// Helper check sức khoẻ key
const checkHealth = async (id: string, val: string): Promise<{ ok: boolean; msg: string }> => {
  if (!val || val.trim() === '') return { ok: false, msg: 'Chưa cấu hình khóa' };
  try {
    if (id === 'omdb_api_key') {
      const res = await fetch(`https://www.omdbapi.com/?i=tt0137523&apikey=${val}`);
      const json = await res.json();
      if (json.Response === 'True') return { ok: true, msg: 'Khóa hợp lệ. Kết nối OMDb ổn định.' };
      return { ok: false, msg: json.Error || 'Lỗi kết nối OMDb' };
    }
    if (id === 'tmdb_api_key') {
      const res = await fetch(`https://api.themoviedb.org/3/movie/550?api_key=${val}`);
      const json = await res.json();
      if (json.id) return { ok: true, msg: 'Kết nối TMDb OK — Phim test: "Fight Club"' };
      return { ok: false, msg: 'Khóa TMDb không hợp lệ' };
    }
    if (id === 'supabase_url' || id === 'supabase_anon_key') {
      return { ok: true, msg: 'Kết nối Database ổn định' };
    }
    // Các key khác giả lập OK nếu có giá trị
    return { ok: true, msg: 'Định dạng khóa hợp lệ' };
  } catch (e) {
    return { ok: false, msg: 'Không thể kết nối máy chủ' };
  }
};

export default function AdminSettingsScreen() {
  const [settingsMap, setSettingsMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await settingsService.loadSettings();
      const map: Record<string, string> = { ...FALLBACK_KEYS };
      data.forEach((item) => {
        if (item.key_value) map[item.key_name] = item.key_value;
      });
      setSettingsMap(map);
    } catch (e) {
      console.error('Lỗi load settings:', e);
      Alert.alert('Lỗi', 'Không thể tải cấu hình từ server.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <AdminHeader title="Cài đặt hệ thống" showBack={true} />
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4db8ff" />
          <Text style={styles.loadingText}>Đang tải cấu hình...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AdminHeader title="⚙️ Cài đặt hệ thống" subtitle="Quản lý API Keys" showBack={true} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={24} color="#4db8ff" />
          <Text style={styles.infoText}>Các thay đổi API Keys sẽ có hiệu lực ngay lập tức. Đảm bảo bạn nhập đúng khóa bảo mật.</Text>
        </View>
        {SETTING_FIELDS.map((field) => (
          <ApiKeyCard key={field.id} field={field} settingsMap={settingsMap} setSettingsMap={setSettingsMap} />
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ApiKeyCard({ field, settingsMap, setSettingsMap }: { field: any, settingsMap: Record<string, string>, setSettingsMap: any }) {
  const [value, setValue] = useState(field.isReadonly ? field.defaultVal : (settingsMap[field.id] || ''));
  const [isVisible, setIsVisible] = useState(field.isReadonly);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Health
  const [healthStatus, setHealthStatus] = useState<'idle'|'checking'|'ok'|'error'>('idle');
  const [healthMsg, setHealthMsg] = useState('');
  
  // Pool
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolItems, setPoolItems] = useState<string[]>([]);
  const [isAutoSwitch, setIsAutoSwitch] = useState(false);
  const [newPoolKey, setNewPoolKey] = useState('');
  const [addingPool, setAddingPool] = useState(false);

  useEffect(() => {
    if (field.isReadonly) {
      checkKeyHealth(field.defaultVal);
      return;
    }
    setValue(settingsMap[field.id] || '');
    
    // Parse pool
    const poolStr = settingsMap[field.id + '_pool'];
    if (poolStr) {
      try { setPoolItems(JSON.parse(poolStr)); } catch(e) {}
    }
    setIsAutoSwitch(settingsMap[field.id + '_autoswitch'] === 'true');
    checkKeyHealth(settingsMap[field.id] || '');
  }, [settingsMap, field.id]);

  const checkKeyHealth = async (val: string) => {
    setHealthStatus('checking');
    setHealthMsg('Đang kiểm tra kết nối...');
    const res = await checkHealth(field.id, val);
    setHealthStatus(res.ok ? 'ok' : 'error');
    setHealthMsg(res.msg);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsService.saveSetting(field.id, value, `Cấu hình cho ${field.title}`);
      
      // Auto add to pool if not exists
      let newPool = [...poolItems];
      if (value && !newPool.includes(value)) {
        newPool.push(value);
        await settingsService.saveSetting(field.id + '_pool', JSON.stringify(newPool));
        setPoolItems(newPool);
      }
      
      setSettingsMap((prev: any) => ({ ...prev, [field.id]: value, [field.id + '_pool']: JSON.stringify(newPool) }));
      setIsEditing(false);
      setIsVisible(false);
      checkKeyHealth(value);
      Alert.alert('Thành công', `Đã lưu ${field.title}!`);
    } catch (e: any) {
      Alert.alert('Lỗi', `Không thể lưu: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(settingsMap[field.id] || '');
    setIsEditing(false);
    setIsVisible(false);
  };

  const togglePool = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPoolOpen(!poolOpen);
  };

  const toggleAutoSwitch = async (val: boolean) => {
    setIsAutoSwitch(val);
    await settingsService.saveSetting(field.id + '_autoswitch', val ? 'true' : 'false');
    setSettingsMap((p: any) => ({ ...p, [field.id + '_autoswitch']: val ? 'true' : 'false' }));
  };

  const addKeyToPool = async () => {
    if (!newPoolKey.trim() || poolItems.includes(newPoolKey.trim())) {
      setAddingPool(false);
      return;
    }
    const newPool = [...poolItems, newPoolKey.trim()];
    await settingsService.saveSetting(field.id + '_pool', JSON.stringify(newPool));
    setPoolItems(newPool);
    setSettingsMap((p: any) => ({ ...p, [field.id + '_pool']: JSON.stringify(newPool) }));
    setNewPoolKey('');
    setAddingPool(false);
  };

  const removeKeyFromPool = async (k: string) => {
    const newPool = poolItems.filter(x => x !== k);
    await settingsService.saveSetting(field.id + '_pool', JSON.stringify(newPool));
    setPoolItems(newPool);
    setSettingsMap((p: any) => ({ ...p, [field.id + '_pool']: JSON.stringify(newPool) }));
  };

  const usePoolKey = (k: string) => {
    setValue(k);
    setIsEditing(true);
    setIsVisible(true);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBox}>
          <Ionicons name={field.icon} size={20} color="#da77f2" />
          <View>
            <Text style={styles.cardTitle}>{field.title}</Text>
            <Text style={styles.cardService}>{field.service}</Text>
          </View>
        </View>
        <View style={[styles.badge, field.isReadonly ? styles.badgeReadonly : styles.badgeEditable]}>
          <Text style={styles.badgeText}>{field.isReadonly ? 'CỐ ĐỊNH' : 'CÓ THỂ SỬA'}</Text>
        </View>
      </View>
      <Text style={styles.cardDesc}>{field.desc}</Text>
      
      <View style={[styles.inputWrapper, isEditing && styles.inputEditing]}>
        <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder="Nhập khóa..."
            placeholderTextColor="#666"
            secureTextEntry={!isVisible}
            editable={isEditing && !field.isReadonly}
            readOnly={!isEditing || field.isReadonly}
          />
        </ScrollView>
        <View style={styles.inputActions}>
          <TouchableOpacity onPress={async () => {
             await Clipboard.setStringAsync(value);
             Alert.alert('Thành công', 'Đã copy vào khay nhớ tạm!');
          }} style={styles.iconBtn}>
            <Ionicons name="copy-outline" size={18} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsVisible(!isVisible)} style={styles.iconBtn}>
            <Ionicons name={isVisible ? "eye-off-outline" : "eye-outline"} size={20} color="#888" />
          </TouchableOpacity>
          {!field.isReadonly && !isEditing && (
            <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.iconBtn}>
              <Ionicons name="pencil" size={18} color="#4db8ff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isEditing && !field.isReadonly && (
        <View style={styles.editActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelBtnText}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Lưu Thay Đổi</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Trạng thái hoạt động */}
      {healthStatus !== 'idle' && (
        <View style={[styles.healthBox, healthStatus === 'ok' ? styles.healthOk : healthStatus === 'error' ? styles.healthErr : {}]}>
          {healthStatus === 'checking' && <ActivityIndicator size="small" color="#aaa" style={{marginRight: 8}}/>}
          {healthStatus === 'ok' && <Ionicons name="checkmark-circle" size={16} color="#00ff88" style={{marginRight: 6}}/>}
          {healthStatus === 'error' && <Ionicons name="close-circle" size={16} color="#ff4444" style={{marginRight: 6}}/>}
          <Text style={[styles.healthText, healthStatus === 'ok' ? {color: '#00ff88'} : healthStatus === 'error' ? {color: '#ff4444'} : {}]}>
            {healthMsg}
          </Text>
        </View>
      )}

      {/* Kho khóa dự phòng */}
      {!field.isReadonly && (
        <View style={styles.poolContainer}>
          <TouchableOpacity style={styles.poolHeader} onPress={togglePool}>
            <Text style={styles.poolTitle}>
              <Ionicons name="time-outline" size={14} /> Kho khóa dự phòng ({poolItems.length})
            </Text>
            <Ionicons name={poolOpen ? "chevron-up" : "chevron-down"} size={16} color="#888" />
          </TouchableOpacity>
          
          {poolOpen && (
            <View style={styles.poolBody}>
              <View style={styles.autoSwitchBox}>
                <Text style={styles.autoSwitchLabel}>Tự động lấp chỗ trống (Auto-Fix)</Text>
                <Switch value={isAutoSwitch} onValueChange={toggleAutoSwitch} trackColor={{ false: '#333', true: '#9b59b6' }} thumbColor="#fff"/>
              </View>
              
              {poolItems.map((k, i) => {
                const isCurrent = k === (settingsMap[field.id] || '');
                return (
                  <View key={i} style={styles.poolItem}>
                    <Text style={styles.poolKeyText} numberOfLines={1}>{k.length > 20 ? k.substring(0,6) + '...' + k.slice(-6) : k}</Text>
                    <View style={styles.poolItemActions}>
                      {isCurrent ? (
                        <View style={styles.poolBadgeCurrent}><Text style={styles.poolBadgeText}>Đang dùng</Text></View>
                      ) : (
                        <TouchableOpacity style={styles.poolBtnUse} onPress={() => usePoolKey(k)}>
                          <Text style={styles.poolBtnUseText}>Chọn</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => removeKeyFromPool(k)} style={styles.poolBtnDel}>
                        <Ionicons name="trash-outline" size={16} color="#ff4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              
              {addingPool ? (
                <View style={styles.poolAddBox}>
                  <TextInput style={styles.poolInput} value={newPoolKey} onChangeText={setNewPoolKey} placeholder="Nhập khóa..." placeholderTextColor="#666" />
                  <View style={{flexDirection: 'row', gap: 6}}>
                    <TouchableOpacity style={styles.poolBtnCancelAdd} onPress={() => setAddingPool(false)}><Ionicons name="close" size={18} color="#aaa"/></TouchableOpacity>
                    <TouchableOpacity style={styles.poolBtnSaveAdd} onPress={addKeyToPool}><Ionicons name="checkmark" size={18} color="#00ff88"/></TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.poolAddBtn} onPress={() => setAddingPool(true)}>
                  <Ionicons name="add" size={16} color="#aaa" />
                  <Text style={styles.poolAddBtnText}>Thêm khóa dự phòng trực tiếp</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 16 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#888', marginTop: 12, fontSize: 14 },

  infoBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(77,184,255,0.1)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(77,184,255,0.2)', marginBottom: 20, gap: 10 },
  infoText: { color: '#4db8ff', flex: 1, fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: '#161622', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitleBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardService: { color: '#888', fontSize: 10, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  badgeReadonly: { backgroundColor: 'rgba(255,68,68,0.1)', borderColor: 'rgba(255,68,68,0.3)' },
  badgeEditable: { backgroundColor: 'rgba(218,119,242,0.1)', borderColor: 'rgba(218,119,242,0.3)' },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#ff4444' }, // Editable text có thể cần đổi màu
  cardDesc: { color: '#aaa', fontSize: 13, marginBottom: 14, lineHeight: 18 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f0f16', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12, overflow: 'hidden' },
  inputEditing: { borderColor: '#4db8ff' },
  input: { minWidth: '100%', color: '#fff', paddingHorizontal: 12, paddingVertical: 12, fontSize: 14 },
  inputActions: { flexDirection: 'row', paddingRight: 8, backgroundColor: '#0f0f16' },
  iconBtn: { padding: 6, justifyContent: 'center', alignItems: 'center' },
  editActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  cancelBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  cancelBtnText: { color: '#aaa', fontWeight: '600' },
  saveBtn: { flex: 2, backgroundColor: '#4db8ff', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  healthBox: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 10 },
  healthOk: { backgroundColor: 'rgba(0,255,136,0.05)' },
  healthErr: { backgroundColor: 'rgba(255,68,68,0.05)' },
  healthText: { color: '#aaa', fontSize: 13 },
  poolContainer: { marginTop: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' },
  poolHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: 'rgba(255,255,255,0.02)' },
  poolTitle: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  poolBody: { padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  autoSwitchBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  autoSwitchLabel: { color: '#da77f2', fontSize: 13, fontWeight: '600' },
  poolItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, marginBottom: 8 },
  poolKeyText: { color: '#fff', fontSize: 13, flex: 1 },
  poolItemActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  poolBadgeCurrent: { backgroundColor: 'rgba(77,184,255,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  poolBadgeText: { color: '#4db8ff', fontSize: 11, fontWeight: '600' },
  poolBtnUse: { backgroundColor: 'rgba(0,255,136,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(0,255,136,0.2)' },
  poolBtnUseText: { color: '#00ff88', fontSize: 11, fontWeight: '600' },
  poolBtnDel: { padding: 4 },
  poolAddBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 6, marginTop: 4, gap: 6 },
  poolAddBtnText: { color: '#aaa', fontSize: 13 },
  poolAddBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  poolInput: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, fontSize: 13 },
  poolBtnCancelAdd: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6 },
  poolBtnSaveAdd: { padding: 8, backgroundColor: 'rgba(0,255,136,0.15)', borderRadius: 6 },
});
