import React, { useEffect, useState } from 'react';
import { 
  View, Text, StyleSheet, FlatList, ActivityIndicator, 
  TouchableOpacity, Dimensions, SafeAreaView, Alert 
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useMovieStore, Movie } from '../stores/useMovieStore';
import { useThemeStore } from '../stores/useThemeStore';
import { useAppFont } from '../hooks/useAppFont';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 3; 

interface HistoryItem {
  movie_id: string;
  movie: Movie;
  episode_index: number;
  resume_time: number;
  duration: number;
}

export default function WatchingScreen() {
  const router = useRouter();
  const user = useAuthStore(state => state.user);
  const { allMovies } = useMovieStore();
  const { themeColors, primaryColor } = useThemeStore();
  const { fontBold, fontSemiBold, fontRegular } = useAppFont();

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', user.id)
        .order('last_watched_at', { ascending: false });

      if (error) throw error;

      const items = (data || []).map(h => {
        const movie = allMovies.find(m => m.id === h.movie_id);
        if (!movie) return null;
        return {
          movie_id: h.movie_id,
          movie,
          episode_index: h.episode_index || 0,
          resume_time: h.resume_time || 0,
          duration: h.duration || 0,
        };
      }).filter(Boolean) as HistoryItem[];

      setHistoryItems(items);
    } catch (e) {
      console.error('Lỗi tải lịch sử:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (movieId: string) => {
    Alert.alert(
      "Xóa lịch sử",
      "Bạn có chắc chắn muốn xóa phim này khỏi danh sách đang xem?",
      [
        { text: "Hủy", style: "cancel" },
        { 
          text: "Xóa", 
          style: "destructive",
          onPress: async () => {
            try {
              await supabase
                .from('watch_history')
                .delete()
                .eq('user_id', user?.id)
                .eq('movie_id', movieId);
              
              setHistoryItems(prev => prev.filter(item => item.movie.id !== movieId));
              
              useAuthStore.getState().fetchWatchHistory();
            } catch (e) {
              console.error("Lỗi xóa phim:", e);
            }
          }
        }
      ]
    );
  };

  const handleMoviePress = (item: HistoryItem) => {
    const { movie, episode_index, resume_time } = item;
    
    if (resume_time > 0) {
      const min = Math.floor(resume_time / 60);
      const sec = Math.floor(resume_time % 60);
      const timeDisplay = min > 0 ? `${min} phút ${sec} giây` : `${sec} giây`;
      
      Alert.alert(
        "Tiếp tục xem?",
        `Bạn có muốn tiếp tục xem Tập ${episode_index + 1} tại ${timeDisplay} không?`,
        [
          { text: "Đóng", style: "cancel" },
          { 
            text: "Xem từ đầu", 
            onPress: () => router.push(`/movie/watch/${movie.id}?ep=${episode_index}&t=0`) 
          },
          { 
            text: "Tiếp tục xem", 
            style: "default",
            onPress: () => router.push(`/movie/watch/${movie.id}?ep=${episode_index}&t=${resume_time}`) 
          }
        ]
      );
    } else {
      router.push(`/movie/watch/${movie.id}?ep=${episode_index}`);
    }
  };

  const renderItem = ({ item }: { item: HistoryItem }) => {
    const { movie, episode_index, resume_time, duration } = item;
    const watchedSec = resume_time || 0;
    const totalSec = duration || 0;
    const watchedMin = Math.floor(watchedSec / 60);
    const totalMin = Math.floor(totalSec / 60);
    const timeStr = totalMin > 0 ? `${watchedMin}/${totalMin}m` : `${watchedMin}m`;
    const progressPercent = totalSec > 0 ? Math.min((watchedSec / totalSec) * 100, 100) : 0;

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
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
          {progressPercent > 0 && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${progressPercent}%`, backgroundColor: primaryColor }]} />
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: themeColors.textPrimary, fontFamily: fontSemiBold }]} numberOfLines={1}>
            {movie.title}
          </Text>
          <Text style={[styles.episode, { color: primaryColor, fontFamily: fontRegular }]} numberOfLines={1}>
            Tập {episode_index + 1}
          </Text>
          <Text style={[styles.time, { color: themeColors.textMuted, fontFamily: fontRegular }]} numberOfLines={1}>
            {timeStr} đã xem
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      <Stack.Screen 
        options={{ 
          title: "Đang xem",
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
      ) : historyItems.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={48} color={themeColors.textMuted} style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: themeColors.textMuted, fontFamily: fontRegular }]}>Danh sách đang xem trống</Text>
        </View>
      ) : (
        <FlatList
          data={historyItems}
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { marginTop: 8 },
  title: { fontSize: 13, marginBottom: 4 },
  episode: { fontSize: 11, color: '#A066FF', marginBottom: 2 },
  time: { fontSize: 11 },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBar: {
    height: '100%',
  },
});
