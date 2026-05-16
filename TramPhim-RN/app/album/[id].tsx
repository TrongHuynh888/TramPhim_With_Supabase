import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, ActivityIndicator, 
  TouchableOpacity, Dimensions, SafeAreaView, Alert 
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { useAppFont } from '../../hooks/useAppFont';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 3; 

interface AlbumMovie {
  id: string;
  addedAt: string;
}

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore(state => state.user);
  const { themeColors, primaryColor } = useThemeStore();
  const { fontBold, fontSemiBold, fontRegular } = useAppFont();

  const [albumName, setAlbumName] = useState('Đang tải...');
  const [movies, setMovies] = useState<any[]>([]); // Sẽ lấy từ bảng movies hoặc map từ store
  const [albumData, setAlbumData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user && id) {
      fetchAlbumDetails();
    }
  }, [user, id]);

  const fetchAlbumDetails = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('user_albums')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setAlbumData(data);
      setAlbumName(data.name);

      // Map id từ data.movies sang bảng movies
      if (data.movies && data.movies.length > 0) {
        const movieIds = data.movies.map((m: any) => m.id);
        
        const { data: moviesData, error: moviesError } = await supabase
          .from('movies')
          .select('id, title, poster_url')
          .in('id', movieIds);

        if (moviesError) throw moviesError;

        // Giữ đúng thứ tự thêm vào mới nhất (reverse)
        const sortedMovies = [...data.movies].reverse().map(am => {
          const mData = moviesData?.find(m => m.id === am.id);
          return mData ? { ...mData, addedAt: am.addedAt } : null;
        }).filter(Boolean);

        setMovies(sortedMovies);
      } else {
        setMovies([]);
      }
    } catch (e) {
      console.error('Lỗi tải chi tiết album:', e);
      Alert.alert("Lỗi", "Không thể tải chi tiết album.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveMovie = (movieId: string) => {
    Alert.alert(
      "Xóa Khỏi Album",
      "Bạn có chắc muốn xóa phim này khỏi album?",
      [
        { text: "Hủy", style: "cancel" },
        { 
          text: "Xóa", 
          style: "destructive",
          onPress: async () => {
            try {
              if (!albumData) return;
              
              const newMoviesList = albumData.movies.filter((m: any) => m.id !== movieId);
              
              const { error } = await supabase
                .from('user_albums')
                .update({ movies: newMoviesList })
                .eq('id', id);

              if (error) throw error;
              
              // Cập nhật state
              setAlbumData({ ...albumData, movies: newMoviesList });
              setMovies(prev => prev.filter(m => m.id !== movieId));

            } catch (e) {
              console.error("Lỗi xóa phim:", e);
              Alert.alert("Lỗi", "Không thể xóa phim này lúc này.");
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    return (
      <TouchableOpacity 
        style={[styles.cardContainer, { width: CARD_WIDTH }]}
        onPress={() => router.push(`/movie/${item.id}`)}
      >
        <View style={styles.imageWrapper}>
          <Image
            source={item.poster_url || 'https://placehold.co/300x450/1a1a2e/ffffff?text=No+Poster'}
            style={styles.poster}
            contentFit="cover"
            transition={200}
          />
          <TouchableOpacity 
            style={styles.removeBtn}
            onPress={(e) => {
              e.stopPropagation();
              handleRemoveMovie(item.id);
            }}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: themeColors.textPrimary, fontFamily: fontSemiBold }]} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      <Stack.Screen 
        options={{ 
          title: albumName,
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
      ) : movies.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="film-outline" size={48} color={themeColors.textMuted} style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: themeColors.textMuted, fontFamily: fontRegular }]}>Album trống</Text>
          <Text style={[styles.emptySub, { color: themeColors.textSecondary, fontFamily: fontRegular }]}>Bạn chưa thêm phim nào vào album này</Text>
        </View>
      ) : (
        <FlatList
          data={movies}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={3}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  columnWrapper: { justifyContent: 'flex-start', gap: 8 },
  cardContainer: { marginBottom: 16 },
  imageWrapper: {
    width: '100%',
    aspectRatio: 2/3,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a2e',
  },
  poster: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { marginTop: 8 },
  title: { fontSize: 13, marginBottom: 4, lineHeight: 18 },
  emptyText: { fontSize: 16, marginBottom: 4 },
  emptySub: { fontSize: 13 }
});
