import React, { useEffect, useState } from 'react';
import { 
  View, Text, StyleSheet, FlatList, ActivityIndicator, 
  TouchableOpacity, Dimensions, SafeAreaView, Alert 
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useMovieStore, Movie } from '../stores/useMovieStore';
import { useThemeStore } from '../stores/useThemeStore';
import { useAppFont } from '../hooks/useAppFont';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 3; 

interface FavoriteItem {
  movie_id: string;
  movie: Movie;
}

export default function FavoritesScreen() {
  const router = useRouter();
  const user = useAuthStore(state => state.user);
  const { allMovies } = useMovieStore();
  const { themeColors } = useThemeStore();
  const { fontBold, fontSemiBold, fontRegular } = useAppFont();

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchFavorites();
    }, [user])
  );

  const fetchFavorites = async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('user_favorites')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const items = (data || []).map(h => {
        const movie = allMovies.find(m => m.id === h.movie_id);
        if (!movie) return null;
        return {
          movie_id: h.movie_id,
          movie,
        };
      }).filter(Boolean) as FavoriteItem[];

      // Reverse so newest is first, if order is not guaranteed
      setFavoriteItems(items.reverse());
    } catch (e) {
      console.error('Lỗi tải danh sách yêu thích:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (movieId: string) => {
    Alert.alert(
      "Xóa Yêu Thích",
      "Bạn có chắc chắn muốn xóa phim này khỏi danh sách yêu thích?",
      [
        { text: "Hủy", style: "cancel" },
        { 
          text: "Xóa", 
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            try {
              const { error } = await supabase
                .from('user_favorites')
                .delete()
                .eq('user_id', user.id)
                .eq('movie_id', movieId);
                
              if (error) throw error;
              
              setFavoriteItems(prev => prev.filter(item => item.movie_id !== movieId));
            } catch (e) {
              console.error("Lỗi xóa yêu thích:", e);
              Alert.alert("Lỗi", "Không thể xóa phim này lúc này.");
            }
          }
        }
      ]
    );
  };

  const handleMoviePress = (item: FavoriteItem) => {
    router.push(`/movie/${item.movie.id}`);
  };

  const renderItem = ({ item }: { item: FavoriteItem }) => {
    const { movie } = item;

    return (
      <TouchableOpacity 
        style={[styles.cardContainer, { width: CARD_WIDTH }]}
        onPress={() => handleMoviePress(item)}
      >
        <View style={styles.imageWrapper}>
          <Image
            source={movie.posterUrl || 'https://placehold.co/300x450/1a1a2e/ffffff?text=No+Poster'}
            style={styles.poster}
            contentFit="cover"
            transition={200}
          />
          <TouchableOpacity 
            style={styles.removeBtn}
            onPress={(e) => {
              e.stopPropagation();
              handleRemove(movie.id);
            }}
          >
            <Ionicons name="heart-dislike" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: themeColors.textPrimary, fontFamily: fontSemiBold }]} numberOfLines={2}>
            {movie.title}
          </Text>
          <Text style={[styles.year, { color: themeColors.textMuted, fontFamily: fontRegular }]} numberOfLines={1}>
            {movie.year || ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      <Stack.Screen 
        options={{ 
          title: "Yêu Thích",
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
          <ActivityIndicator size="large" color="#FFD166" />
        </View>
      ) : favoriteItems.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="heart-outline" size={48} color={themeColors.textMuted} style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: themeColors.textMuted, fontFamily: fontRegular }]}>Danh sách yêu thích trống</Text>
        </View>
      ) : (
        <FlatList
          data={favoriteItems}
          keyExtractor={(item) => item.movie_id}
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { marginTop: 8 },
  title: { fontSize: 13, marginBottom: 4, lineHeight: 18 },
  year: { fontSize: 11 },
  emptyText: { fontSize: 16 },
});
