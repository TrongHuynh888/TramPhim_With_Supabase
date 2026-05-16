/**
 * =============================================
 *  POPUP CHI TIẾT PHIM - PHONG CÁCH NETFLIX
 *  Hiển thị khi user click vào MovieCard
 *  Gồm: ảnh nền, gradient, thông tin phim, nút hành động
 * =============================================
 */
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, View, Text, Modal, Pressable, Dimensions,
  ScrollView, TouchableOpacity, Animated, Alert
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';

import { Movie, useMovieStore } from '../stores/useMovieStore';
import { useThemeStore } from '../stores/useThemeStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useAppFont } from '../hooks/useAppFont';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MovieDetailPopupProps {
  visible: boolean;
  movie: Movie | null;
  onClose: () => void;
}

export default function MovieDetailPopup({ visible, movie, onClose }: MovieDetailPopupProps) {
  const router = useRouter();
  const { primaryColor, themeColors, themeMode } = useThemeStore();
  const { allCategories, allMovies } = useMovieStore();
  const { user, watchHistory } = useAuthStore();
  const { fontBold, fontSemiBold, fontRegular } = useAppFont();

  // State yêu thích
  const [isFavorite, setIsFavorite] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);

  // Animation mở popup
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Kiểm tra trạng thái yêu thích khi phim thay đổi
  useEffect(() => {
    if (!user || !movie) {
      setIsFavorite(false);
      return;
    }
    const checkFavorite = async () => {
      try {
        const { data } = await supabase
          .from('user_favorites')
          .select('movie_id')
          .eq('user_id', user.id)
          .eq('movie_id', movie.id)
          .maybeSingle();
        setIsFavorite(!!data);
      } catch (e) {
        console.error('Lỗi kiểm tra yêu thích:', e);
      }
    };
    checkFavorite();
  }, [user, movie?.id]);

  // Animation mở/đóng popup
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 220,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  // Toggle yêu thích
  const handleToggleFavorite = useCallback(async () => {
    if (!user) {
      Alert.alert(
        "Yêu cầu đăng nhập",
        "Vui lòng đăng nhập để sử dụng tính năng yêu thích.",
        [
          { text: "Đóng", style: "cancel" },
          { text: "Đăng nhập", onPress: () => { onClose(); router.push("/auth/login"); } }
        ]
      );
      return;
    }
    if (!movie || isFavoriteLoading) return;
    setIsFavoriteLoading(true);
    try {
      if (isFavorite) {
        await supabase.from('user_favorites').delete()
          .eq('user_id', user.id).eq('movie_id', movie.id);
        setIsFavorite(false);
      } else {
        await supabase.from('user_favorites')
          .insert({ user_id: user.id, movie_id: movie.id });
        setIsFavorite(true);
      }
    } catch (e) {
      Alert.alert("Lỗi", "Không thể thực hiện lúc này.");
    } finally {
      setIsFavoriteLoading(false);
    }
  }, [user, movie, isFavorite, isFavoriteLoading]);

  // Xử lý phát phim (có kiểm tra lịch sử xem)
  const handlePlay = useCallback(() => {
    if (!movie) return;
    const historyItem = watchHistory?.find((h: any) => h.movie_id === movie.id);
    onClose();
    if (historyItem && historyItem.resume_time > 0) {
      const minutes = Math.floor(historyItem.resume_time / 60);
      const seconds = Math.floor(historyItem.resume_time % 60);
      Alert.alert(
        "Tiếp tục xem?",
        `Bạn đang xem dở tập ${historyItem.episode_index + 1} lúc ${minutes} phút ${seconds} giây.`,
        [
          { text: "Đóng", style: "cancel" },
          { text: "Bắt đầu lại", onPress: () => router.push(`/movie/watch/${movie.id}`) },
          { text: "Tiếp tục xem", onPress: () => router.push(`/movie/watch/${movie.id}?ep=${historyItem.episode_index}&t=${historyItem.resume_time}`) }
        ]
      );
    } else {
      router.push(`/movie/watch/${movie.id}`);
    }
  }, [movie, watchHistory]);

  // Chuyển đến trang chi tiết đầy đủ
  const handleViewDetail = useCallback(() => {
    if (!movie) return;
    onClose();
    router.push(`/movie/${movie.id}`);
  }, [movie]);

  // Resolve tên thể loại từ ID
  const categoryNames = useMemo(() => {
    if (!movie) return [];
    if (movie.categories && movie.categories.length > 0) {
      return movie.categories.map(catId => {
        const searchId = String(catId).trim().toLowerCase();
        const found = allCategories.find(
          c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId
        );
        return found ? found.name : catId;
      }).slice(0, 4); // Giới hạn 4 thể loại để không bị tràn
    }
    if (movie.category) {
      const searchId = String(movie.category).trim().toLowerCase();
      const found = allCategories.find(
        c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId
      );
      return [found ? found.name : movie.category];
    }
    return [];
  }, [movie, allCategories]);

  // Tìm quốc gia từ ID
  const { allCountries } = useMovieStore();
  const countryName = useMemo(() => {
    if (!movie) return '';
    if (movie.country) return movie.country;
    if (movie.country_id) {
      const found = allCountries.find(c => c.id === movie.country_id);
      return found ? found.name : movie.country_id;
    }
    return '';
  }, [movie, allCountries]);


  // Tính % độ phù hợp ngẫu nhiên (giống Netflix) - phải đặt TRƯỚC early return
  const matchPercent = useMemo(() => {
    if (!movie) return 95;
    // Dùng hash đơn giản từ id để tạo số ổn định
    let hash = 0;
    for (let i = 0; i < movie.id.length; i++) {
      hash = movie.id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return 85 + Math.abs(hash % 14); // 85-98%
  }, [movie?.id]);

  // Early return sau tất cả hooks
  if (!movie) return null;

  // Xác định badge text
  let badgeText = '';
  if (movie.type === 'series') {
    const total = movie.totalEpisodes ? `/${movie.totalEpisodes}` : '';
    const current = movie.episodes?.length || '?';
    badgeText = `Tập ${current}${total}`;
  } else {
    badgeText = `Full ${movie.quality || 'HD'}`;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop tối mờ */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Popup nội dung chính */}
      <Animated.View
        style={[
          styles.popupContainer,
          { transform: [{ translateY: slideAnim }] }
        ]}
      >
        <View style={[styles.popupContent, {
          backgroundColor: themeMode === 'light' ? '#f5f5f5' : '#181818'
        }]}>
          {/* ===== PHẦN ẢNH NỀN PHÍA TRÊN ===== */}
          <View style={styles.imageSection}>
            <Image
              source={movie.backgroundUrl || movie.thumbUrl || movie.posterUrl}
              style={styles.backdropImage}
              contentFit="cover"
              transition={300}
            />
            {/* Gradient chuyển tiếp xuống phần nội dung */}
            <LinearGradient
              colors={themeMode === 'light'
                ? ['transparent', 'rgba(245,245,245,0.4)', 'rgba(245,245,245,0.85)', '#f5f5f5']
                : ['transparent', 'rgba(24,24,24,0.4)', 'rgba(24,24,24,0.85)', '#181818']}
              locations={[0, 0.35, 0.7, 1]}
              style={styles.imageGradient}
            />

            {/* Badge phần phim (nếu có) */}
            {!!movie.part && String(movie.part) !== '(Trống)' && (
              <View style={[styles.partBadge, { backgroundColor: primaryColor }]}>
                <Text style={[styles.partBadgeText, { fontFamily: fontBold }]}>
                  PHẦN {movie.part}
                </Text>
              </View>
            )}

            {/* Nút đóng popup */}
            <Pressable
              style={[styles.closeBtn, {
                backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.7)'
              }]}
              onPress={onClose}
              hitSlop={10}
            >
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>

            {/* Badge chất lượng/tập */}
            {badgeText ? (
              <View style={styles.qualityBadge}>
                <Text style={[styles.qualityBadgeText, { fontFamily: fontBold }]}>
                  {badgeText}
                </Text>
              </View>
            ) : null}
          </View>

          {/* ===== PHẦN NỘI DUNG CUỘN ===== */}
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={{ paddingBottom: 50 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Hàng nút hành động chính */}
            <View style={styles.actionButtonsRow}>
              {/* Nút Xem ngay (lớn, nổi bật) */}
              <Pressable
                style={[styles.playButton, { backgroundColor: primaryColor }]}
                onPress={handlePlay}
              >
                <FontAwesome name="play" size={16} color="#fff" style={{ marginRight: 8 }} />
                <Text style={[styles.playButtonText, { fontFamily: fontBold }]}>Xem ngay</Text>
              </Pressable>

              {/* Nút yêu thích */}
              <TouchableOpacity
                style={[styles.circleButton, {
                  backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                  borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)',
                }]}
                onPress={handleToggleFavorite}
                disabled={isFavoriteLoading}
              >
                <FontAwesome
                  name={isFavorite ? "heart" : "heart-o"}
                  size={20}
                  color={isFavorite ? "#ff3b30" : themeColors.textPrimary}
                />
              </TouchableOpacity>

              {/* Nút mở rộng / Xem chi tiết */}
              <TouchableOpacity
                style={[styles.circleButton, {
                  backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                  borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)',
                }]}
                onPress={handleViewDetail}
              >
                <Ionicons name="chevron-down" size={22} color={themeColors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Tên phim */}
            <Text style={[styles.movieTitle, { color: themeColors.textPrimary, fontFamily: fontBold }]} numberOfLines={2}>
              {movie.title}
            </Text>

            {/* Tên gốc */}
            {!!movie.originTitle && movie.originTitle !== movie.title && (
              <Text style={[styles.originTitle, { color: themeColors.textMuted, fontFamily: fontRegular }]} numberOfLines={1}>
                {movie.originTitle}
              </Text>
            )}

            {/* Hàng thông tin meta */}
            <View style={styles.metaRow}>
              {/* % phù hợp */}
              <Text style={[styles.matchText, { fontFamily: fontBold }]}>{matchPercent}% Phù hợp</Text>

              {/* Giới hạn tuổi */}
              {!!movie.ageLimit && (
                <View style={[styles.metaTag, {
                  borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'
                }]}>
                  <Text style={[styles.metaTagText, { color: themeColors.textSecondary, fontFamily: fontSemiBold }]}>
                    {movie.ageLimit}
                  </Text>
                </View>
              )}

              {/* Năm */}
              {!!movie.year && (
                <Text style={[styles.metaText, { color: themeColors.textSecondary, fontFamily: fontSemiBold }]}>
                  {movie.year}
                </Text>
              )}

              {/* Thời lượng */}
              {!!movie.duration && (
                <Text style={[styles.metaText, { color: themeColors.textSecondary, fontFamily: fontSemiBold }]}>
                  {movie.duration}
                </Text>
              )}

              {/* Chất lượng */}
              {!!movie.quality && (
                <View style={[styles.metaTag, {
                  borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'
                }]}>
                  <Text style={[styles.metaTagText, { color: themeColors.textSecondary, fontFamily: fontSemiBold }]}>
                    {movie.quality}
                  </Text>
                </View>
              )}

              {/* IMDb Rating */}
              {!!movie.imdbRating && (
                <View style={styles.ratingRow}>
                  <Text style={[styles.imdbLabel, { fontFamily: fontBold }]}>IMDb</Text>
                  <Text style={[styles.imdbScore, { color: themeColors.textPrimary, fontFamily: fontSemiBold }]}>
                    {movie.imdbRating}
                  </Text>
                </View>
              )}
            </View>

            {/* Thể loại + Quốc gia */}
            <View style={styles.genreRow}>
              {categoryNames.length > 0 && (
                <Text style={[styles.genreText, { color: themeColors.textMuted, fontFamily: fontRegular }]} numberOfLines={1}>
                  {categoryNames.join(', ')}
                  {countryName ? ` • ${countryName}` : ''}
                </Text>
              )}
              {!categoryNames.length && countryName ? (
                <Text style={[styles.genreText, { color: themeColors.textMuted, fontFamily: fontRegular }]}>
                  {countryName}
                </Text>
              ) : null}
            </View>

            {/* Mô tả phim */}
            {!!movie.description && (
              <Text
                style={[styles.description, { color: themeColors.textSecondary, fontFamily: fontRegular }]}
                numberOfLines={3}
              >
                {movie.description}
              </Text>
            )}



            {/* Diễn viên */}
            {!!movie.cast && (
              <Text style={[styles.castText, { color: themeColors.textMuted, fontFamily: fontRegular }]} numberOfLines={2}>
                <Text style={{ color: themeColors.textSecondary, fontFamily: fontSemiBold }}>Diễn viên: </Text>
                {movie.cast}
              </Text>
            )}

            {/* Đạo diễn */}
            {!!movie.director && (
              <Text style={[styles.castText, { color: themeColors.textMuted, fontFamily: fontRegular }]} numberOfLines={1}>
                <Text style={{ color: themeColors.textSecondary, fontFamily: fontSemiBold }}>Đạo diễn: </Text>
                {movie.director}
              </Text>
            )}


            {/* Khoảng trống cuối */}
            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const IMAGE_HEIGHT = SCREEN_WIDTH * 0.55;

const styles = StyleSheet.create({
  // Backdrop mờ phía sau
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },

  // Container popup (căn giữa + bottom)
  popupContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
    alignItems: 'center',
  },

  // Nội dung popup
  popupContent: {
    width: '100%',
    flexShrink: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },

  // ===== PHẦN ẢNH NỀN =====
  imageSection: {
    width: '100%',
    height: IMAGE_HEIGHT,
    position: 'relative',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
  },

  // Badge phần phim (ví dụ: "PHẦN 2")
  partBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  partBadgeText: {
    color: '#fff',
    fontSize: 11,
    letterSpacing: 0.5,
  },

  // Nút đóng popup
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Badge chất lượng
  qualityBadge: {
    position: 'absolute',
    top: 12,
    right: 50,
    backgroundColor: 'rgba(226, 54, 54, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  qualityBadgeText: {
    color: '#fff',
    fontSize: 10,
  },

  // ===== NỘI DUNG CUỘN =====
  scrollContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // Hàng nút hành động chính
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 0,
    marginBottom: 14,
  },

  // Nút Xem ngay
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 8,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 15,
  },

  // Nút tròn (yêu thích, expand)
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tên phim chính
  movieTitle: {
    fontSize: 22,
    marginBottom: 2,
    lineHeight: 28,
  },

  // Tên gốc
  originTitle: {
    fontSize: 13,
    marginBottom: 10,
  },

  // Hàng meta info (% phù hợp, năm, chất lượng...)
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  matchText: {
    color: '#46d369',
    fontSize: 14,
  },
  metaText: {
    fontSize: 13,
  },
  metaTag: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  metaTagText: {
    fontSize: 11,
  },

  // Thể loại
  genreRow: {
    marginBottom: 10,
  },
  genreText: {
    fontSize: 13,
  },

  // Mô tả
  description: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },

  // IMDb
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  imdbLabel: {
    color: '#f5c518',
    fontSize: 13,
    backgroundColor: 'rgba(245, 197, 24, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  imdbScore: {
    fontSize: 14,
  },

  // Diễn viên / Đạo diễn
  castText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
});
