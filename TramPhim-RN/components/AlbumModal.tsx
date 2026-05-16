import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, 
  FlatList, ActivityIndicator, Alert, KeyboardAvoidingView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useMovieStore } from '../stores/useMovieStore';
import { useThemeStore } from '../stores/useThemeStore';
import { useAppFont } from '../hooks/useAppFont';

interface Album {
  id: string;
  name: string;
  movies: any[];
}

interface AlbumModalProps {
  visible: boolean;
  onClose: () => void;
  movieId: string;
}

export default function AlbumModal({ visible, onClose, movieId }: AlbumModalProps) {
  const user = useAuthStore(state => state.user);
  const { themeColors, primaryColor } = useThemeStore();
  const { fontBold, fontSemiBold, fontRegular } = useAppFont();

  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (visible && user) {
      fetchAlbums();
    }
  }, [visible, user]);

  const fetchAlbums = async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('user_albums')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlbums(data || []);
    } catch (e) {
      console.error('Lỗi tải danh sách album:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAlbum = async () => {
    if (!newAlbumName.trim() || !user) return;
    try {
      setIsCreating(true);
      const { data, error } = await supabase
        .from('user_albums')
        .insert({
          user_id: user.id,
          name: newAlbumName.trim(),
          movies: []
        })
        .select()
        .single();

      if (error) throw error;
      
      setAlbums(prev => [data, ...prev]);
      setNewAlbumName('');
      Alert.alert("Thành công", `Đã tạo album "${data.name}"`);
    } catch (e) {
      console.error('Lỗi tạo album:', e);
      Alert.alert("Lỗi", "Không thể tạo album. Vui lòng thử lại.");
    } finally {
      setIsCreating(false);
    }
  };

  const { allMovies } = useMovieStore();

  const handleToggleMovieInAlbum = async (album: Album) => {
    if (!user || !movieId) return;
    
    let currentMovies = album.movies || [];
    const index = currentMovies.findIndex(m => m.id === movieId);
    const isInAlbum = index > -1;

    try {
      let newMovies = [...currentMovies];
      if (isInAlbum) {
        newMovies.splice(index, 1);
      } else {
        const movie = allMovies.find(m => m.id === movieId);
        newMovies.push({ 
          id: movieId, 
          title: movie?.title || "Phim",
          posterUrl: movie?.posterUrl || "",
          addedAt: new Date().toISOString() 
        });
      }

      // Optimistic update
      setAlbums(prev => prev.map(a => a.id === album.id ? { ...a, movies: newMovies } : a));

      const { error } = await supabase
        .from('user_albums')
        .update({ movies: newMovies })
        .eq('id', album.id);

      if (error) {
        // Revert on error
        setAlbums(prev => prev.map(a => a.id === album.id ? { ...a, movies: currentMovies } : a));
        throw error;
      }
      
      if (!isInAlbum) {
        Alert.alert("Thành công", `Đã thêm vào album "${album.name}"`);
      }
    } catch (e) {
      console.error('Lỗi cập nhật album:', e);
      Alert.alert("Lỗi", "Có lỗi xảy ra khi cập nhật album.");
    }
  };

  const renderAlbumItem = ({ item }: { item: Album }) => {
    const isInAlbum = (item.movies || []).some(m => m.id === movieId);

    return (
      <TouchableOpacity 
        style={[styles.albumItem, { backgroundColor: 'rgba(255,255,255,0.05)' }]}
        onPress={() => handleToggleMovieInAlbum(item)}
      >
        <View style={styles.albumInfo}>
          <Ionicons name="folder" size={24} color={primaryColor} />
          <View style={styles.albumTextContainer}>
            <Text style={[styles.albumName, { color: themeColors.textPrimary, fontFamily: fontSemiBold }]}>
              {item.name}
            </Text>
            <Text style={[styles.albumCount, { color: themeColors.textMuted, fontFamily: fontRegular }]}>
              {item.movies?.length || 0} phim
            </Text>
          </View>
        </View>
        {isInAlbum ? (
          <Ionicons name="checkmark-circle" size={24} color="#4ade80" />
        ) : (
          <Ionicons name="ellipse-outline" size={24} color="#444" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalContent, { backgroundColor: themeColors.bgSecondary }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.bgTertiary }]}>
            <Text style={[styles.title, { color: themeColors.textPrimary, fontFamily: fontBold }]}>
              Lưu vào Album
            </Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <Ionicons name="close" size={20} color={themeColors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* List Albums */}
          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={primaryColor} />
            </View>
          ) : albums.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="folder-open" size={48} color={themeColors.textMuted} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyText, { color: themeColors.textMuted, fontFamily: fontRegular }]}>
                Bạn chưa có album nào.
              </Text>
              <Text style={[styles.emptyText, { color: themeColors.textMuted, fontFamily: fontRegular }]}>
                Hãy tạo album đầu tiên bên dưới!
              </Text>
            </View>
          ) : (
            <FlatList
              data={albums}
              keyExtractor={item => item.id}
              renderItem={renderAlbumItem}
              style={styles.list}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}

          {/* Create Album */}
          <View style={[styles.createContainer, { borderTopColor: themeColors.bgTertiary }]}>
            <Text style={[styles.createLabel, { color: themeColors.textSecondary, fontFamily: fontSemiBold }]}>
              Tạo Album mới:
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[
                  styles.input, 
                  { 
                    color: themeColors.textPrimary, 
                    backgroundColor: themeColors.bgPrimary,
                    borderColor: 'rgba(255,255,255,0.1)',
                    fontFamily: fontRegular
                  }
                ]}
                placeholder="Tên Album (VD: Phim hay cuối tuần)"
                placeholderTextColor={themeColors.textMuted}
                value={newAlbumName}
                onChangeText={setNewAlbumName}
              />
              <TouchableOpacity 
                style={[styles.createBtn, { backgroundColor: primaryColor, opacity: (!newAlbumName.trim() || isCreating) ? 0.6 : 1 }]}
                onPress={handleCreateAlbum}
                disabled={!newAlbumName.trim() || isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color={themeColors.bgPrimary} />
                ) : (
                  <>
                    <Ionicons name="add" size={18} color={themeColors.bgPrimary} style={{ marginRight: 4 }} />
                    <Text style={[styles.createBtnText, { color: themeColors.bgPrimary, fontFamily: fontBold }]}>Tạo</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  list: {
    padding: 20,
  },
  albumItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  albumInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  albumTextContainer: {
    marginLeft: 12,
  },
  albumName: {
    fontSize: 15,
    marginBottom: 4,
  },
  albumCount: {
    fontSize: 12,
  },
  createContainer: {
    padding: 20,
    borderTopWidth: 1,
  },
  createLabel: {
    fontSize: 14,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 12,
  },
  createBtnText: {
    fontSize: 15,
  },
});
