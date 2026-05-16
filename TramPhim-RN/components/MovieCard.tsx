import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors } from '../theme/colors';
import { Movie } from '../stores/useMovieStore';
import { useThemeStore } from '../stores/useThemeStore';
import { useAppFont } from '../hooks/useAppFont';

import { useAuthStore } from '../stores/useAuthStore';

const { width } = Dimensions.get('window');
// Chia 3 cột trên màn hình, trừ đi padding (16*2) và gap giữa các cột
const CARD_WIDTH = (width - 48) / 3; 
const CARD_HEIGHT = CARD_WIDTH * 1.5;

interface MovieCardProps {
  movie: Movie;
  style?: object;
  width?: number;
  onPress?: (movie: Movie) => void; // Callback tùy chỉnh khi bấm vào card (mở popup)
}

export function MovieCard({ movie, style, width = CARD_WIDTH, onPress }: MovieCardProps) {
  const router = useRouter();
  const { themeColors, primaryColor } = useThemeStore();
  const { watchHistory } = useAuthStore();
  const { fontSemiBold, fontRegular } = useAppFont();
  const height = width * 1.5;
  const isFree = !movie.price || movie.price === 0;

  // Xác định nhãn (Tập phim hoặc Chất lượng)
  let badgeText = '';
  if (movie.type === 'series') {
    const total = movie.totalEpisodes ? `/${movie.totalEpisodes}` : '';
    const current = movie.episodes?.length || '?';
    badgeText = `Tập ${current}${total}`;
  } else {
    badgeText = `Full ${movie.quality || 'HD'}`;
  }

  // Tính tiến trình xem
  const historyItem = watchHistory?.find(h => h.movie_id === movie.id);
  const progressPercent = historyItem && historyItem.duration > 0 
    ? Math.min((historyItem.resume_time / historyItem.duration) * 100, 100)
    : 0;

  return (
    <Pressable 
      style={({ pressed }) => [
        styles.container,
        { width, opacity: pressed ? 0.7 : 1 },
        style
      ]}
      onPress={() => onPress ? onPress(movie) : router.push(`/movie/${movie.id}`)}
    >
      <View style={[styles.imageContainer, { height, backgroundColor: themeColors.bgTertiary }]}>
          <Image
            source={movie.posterUrl || 'https://via.placeholder.com/300x450/1a1a2e/ffffff?text=No+Poster'}
            style={styles.image}
            contentFit="cover"
            transition={200} // Hiệu ứng mờ dần khi load ảnh xong
          />
          
          {/* Badge Chất lượng / Tập phim */}
          {badgeText ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          ) : null}
          
          {/* Tag Giá phim */}
          {!isFree && (
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{movie.price} CRO</Text>
            </View>
          )}

          {/* Thanh tiến trình */}
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
          <Text style={[styles.subtitle, { color: themeColors.textMuted, fontFamily: fontRegular }]} numberOfLines={1}>
            {movie.year || ''} {movie.year ? '•' : ''} {movie.type === 'series' ? 'Phim Bộ' : 'Phim Lẻ'}
          </Text>
        </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  imageContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(226, 54, 54, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  priceTag: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(255, 170, 0, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priceText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  info: {
    marginTop: 8,
  },
  title: {
    fontSize: 13,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
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
