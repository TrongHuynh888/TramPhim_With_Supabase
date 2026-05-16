import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, ActivityIndicator, 
  TouchableOpacity, Dimensions, SafeAreaView, Alert 
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useThemeStore } from '../stores/useThemeStore';
import { useAppFont } from '../hooks/useAppFont';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2; // 2 cột cho đẹp

interface Album {
  id: string;
  name: string;
  movies: any[];
}

export default function AlbumsScreen() {
  const router = useRouter();
  const user = useAuthStore(state => state.user);
  const { themeColors, primaryColor } = useThemeStore();
  const { fontBold, fontSemiBold, fontRegular } = useAppFont();

  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchAlbums();
    }, [user])
  );

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

  const handleRemove = (albumId: string, albumName: string) => {
    Alert.alert(
      "Xóa Album",
      `Bạn có chắc chắn muốn xóa album "${albumName}" không? Hành động này không thể hoàn tác.`,
      [
        { text: "Hủy", style: "cancel" },
        { 
          text: "Xóa", 
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            try {
              const { error } = await supabase
                .from('user_albums')
                .delete()
                .eq('id', albumId);
                
              if (error) throw error;
              
              setAlbums(prev => prev.filter(item => item.id !== albumId));
            } catch (e) {
              console.error("Lỗi xóa album:", e);
              Alert.alert("Lỗi", "Không thể xóa album lúc này.");
            }
          }
        }
      ]
    );
  };

  const handleAlbumPress = (album: Album) => {
    router.push(`/album/${album.id}` as any);
  };

  const renderItem = ({ item }: { item: Album }) => {
    const movieCount = item.movies ? item.movies.length : 0;
    const coverImg = movieCount > 0 && item.movies[0].posterUrl 
      ? item.movies[0].posterUrl 
      : 'https://placehold.co/300x450/1a1a2e/ffffff?text=Empty';

    return (
      <TouchableOpacity 
        style={[styles.cardContainer, { width: CARD_WIDTH }]}
        onPress={() => handleAlbumPress(item)}
      >
        <View style={styles.imageWrapper}>
          <Image
            source={coverImg}
            style={styles.poster}
            contentFit="cover"
            transition={200}
          />
          <View style={styles.overlay} />
          
          <TouchableOpacity 
            style={styles.removeBtn}
            onPress={(e) => {
              e.stopPropagation();
              handleRemove(item.id, item.name);
            }}
          >
            <Ionicons name="trash-outline" size={16} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.countBadge}>
            <Text style={[styles.countText, { fontFamily: fontSemiBold }]}>{movieCount}</Text>
          </View>
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: themeColors.textPrimary, fontFamily: fontSemiBold }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted, fontFamily: fontRegular }]} numberOfLines={1}>
            Album
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      <Stack.Screen 
        options={{ 
          title: "Album Của Tôi",
          headerStyle: { backgroundColor: themeColors.bgPrimary },
          headerTintColor: themeColors.textPrimary,
          headerTitleStyle: { fontFamily: fontBold },
          headerLeft: ({ canGoBack }) => 
            canGoBack ? (
              <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 20 }}>
                <Ionicons name="chevron-back" size={28} color={themeColors.textPrimary} />
              </TouchableOpacity>
            ) : null,
        }} 
      />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
      ) : albums.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="albums-outline" size={64} color={themeColors.textMuted} style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: themeColors.textMuted, fontFamily: fontSemiBold }]}>Chưa có album nào</Text>
          <Text style={[styles.emptySub, { color: themeColors.textSecondary, fontFamily: fontRegular }]}>
            Hãy tạo album mới trong trang chi tiết phim!
          </Text>
        </View>
      ) : (
        <FlatList
          data={albums}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  listContent: { padding: 16, paddingBottom: 32 },
  columnWrapper: { justifyContent: 'space-between', gap: 16 },
  cardContainer: { marginBottom: 20 },
  imageWrapper: {
    width: '100%',
    aspectRatio: 1, // Hình vuông cho Album
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a2e',
  },
  poster: { width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: '#fff',
    fontSize: 12,
  },
  info: { marginTop: 10 },
  title: { fontSize: 15, marginBottom: 4 },
  subtitle: { fontSize: 12 },
  emptyText: { fontSize: 18, marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center' }
});
