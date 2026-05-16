import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, TouchableOpacity, Dimensions, Modal, Alert } from 'react-native';
import { AppText } from '../../components/AppText';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMovieStore } from '../../stores/useMovieStore';
import { useMovieEpisodes } from '../../hooks/useMovieEpisodes';
import { useThemeStore } from '../../stores/useThemeStore';
import { Colors } from '../../theme/colors';
import { BottomTabBar } from '../../components/BottomTabBar';
import AlbumModal from '../../components/AlbumModal';
import { MovieComments } from '../../components/MovieComments';
import { useAuthStore } from '../../stores/useAuthStore';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = width * 1.2;

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { allMovies, allCategories } = useMovieStore();
  const insets = useSafeAreaInsets();
  const { primaryColor, themeColors, themeMode } = useThemeStore();
  
  const { episodes, episodeNumbers, isLoading, totalCount, loadEpisodePage } = useMovieEpisodes(id);
  
  // States
  const [activeTab, setActiveTab] = useState<'episodes' | 'cast' | 'recommend' | 'seasons'>('episodes');
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  const [selectedEpRangeIndex, setSelectedEpRangeIndex] = useState(0);
  const [isRangeModalVisible, setRangeModalVisible] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  const { user, watchHistory } = useAuthStore();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  
  const [isAlbumModalVisible, setIsAlbumModalVisible] = useState(false);

  useEffect(() => {
    const checkFavorite = async () => {
      if (!user || !id) return;
      try {
        const { data } = await supabase
          .from('user_favorites')
          .select('movie_id')
          .eq('user_id', user.id)
          .eq('movie_id', id)
          .maybeSingle();
        
        setIsFavorite(!!data);
      } catch (e) {
        console.error('Error checking favorite:', e);
      }
    };
    checkFavorite();
  }, [user, id]);

  const handleToggleFavorite = async () => {
    if (!user) {
      Alert.alert(
        "Yêu cầu đăng nhập", 
        "Vui lòng đăng nhập để sử dụng tính năng yêu thích.", 
        [
          { text: "Đóng", style: "cancel" },
          { text: "Đăng nhập", onPress: () => router.push("/auth/login") }
        ]
      );
      return;
    }

    if (isFavoriteLoading) return;
    setIsFavoriteLoading(true);

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('movie_id', id);
        
        if (error) throw error;
        setIsFavorite(false);
      } else {
        const { error } = await supabase
          .from('user_favorites')
          .insert({ user_id: user.id, movie_id: id });
        
        if (error) throw error;
        setIsFavorite(true);
      }
    } catch (e) {
      console.error('Lỗi khi thao tác yêu thích:', e);
      Alert.alert("Lỗi", "Không thể thực hiện lúc này. Vui lòng thử lại.");
    } finally {
      setIsFavoriteLoading(false);
    }
  };

  const handleOpenAlbumModal = () => {
    if (!user) {
      Alert.alert(
        "Yêu cầu đăng nhập", 
        "Vui lòng đăng nhập để lưu phim vào Album.", 
        [
          { text: "Đóng", style: "cancel" },
          { text: "Đăng nhập", onPress: () => router.push("/auth/login") }
        ]
      );
      return;
    }
    setIsAlbumModalVisible(true);
  };

  // Phân khoảng tập theo logic web gốc (detail.js dòng 1373-1397)
  const PAGE_SIZE_EP = 20;
  const epRanges = useMemo(() => {
    // ≤ 20 tập: hiện hết, không phân trang
    if (episodeNumbers.length <= 20) return [];
    
    const totalPages = Math.ceil(episodeNumbers.length / PAGE_SIZE_EP);
    const ranges = [];
    for (let i = 0; i < totalPages; i++) {
      const start = i * PAGE_SIZE_EP;
      const end = Math.min((i + 1) * PAGE_SIZE_EP, episodeNumbers.length) - 1;
      ranges.push({
        label: `Tập ${start + 1} - ${end + 1}`,
        start,
        end,
      });
    }
    return ranges;
  }, [episodeNumbers]);

  // Tự động load trang tập đầu tiên khi episodeNumbers sẵn sàng
  useEffect(() => {
    if (episodeNumbers.length === 0) return;
    const loadPage = async () => {
      setIsLoadingPage(true);
      if (epRanges.length > 0) {
        const range = epRanges[selectedEpRangeIndex] || epRanges[0];
        await loadEpisodePage(episodeNumbers.slice(range.start, range.end + 1));
      } else {
        // ≤ 20 tập: load hết
        await loadEpisodePage(episodeNumbers);
      }
      setIsLoadingPage(false);
    };
    loadPage();
  }, [episodeNumbers, selectedEpRangeIndex, epRanges, loadEpisodePage]);

  // Callback chuyển trang - chỉ cập nhật index, useEffect trên sẽ tự load
  const handleChangeEpRange = useCallback((idx: number) => {
    setSelectedEpRangeIndex(idx);
    setRangeModalVisible(false);
  }, []);

  // Episodes hiển thị = dữ liệu đã load từ hook
  const displayedEpisodes = episodes;

  // Tìm thông tin phim trong bộ nhớ tạm
  const movie = useMemo(() => allMovies.find(m => m.id === id), [id, allMovies]);

  const handlePlay = () => {
    const historyItem = watchHistory?.find(h => h.movie_id === movie?.id);
    if (historyItem && historyItem.resume_time > 0) {
      const minutes = Math.floor(historyItem.resume_time / 60);
      const seconds = Math.floor(historyItem.resume_time % 60);
      Alert.alert(
        "Tiếp tục xem?",
        `Bạn đang xem dở tập ${historyItem.episode_index + 1} lúc ${minutes} phút ${seconds} giây. Bạn muốn tiếp tục xem hay bắt đầu lại từ đầu?`,
        [
          { text: "Đóng", style: "cancel" },
          { text: "Bắt đầu lại", onPress: () => router.push(`/movie/watch/${movie?.id}`) },
          { text: "Tiếp tục xem", onPress: () => router.push(`/movie/watch/${movie?.id}?ep=${historyItem.episode_index}&t=${historyItem.resume_time}`) }
        ]
      );
    } else {
      router.push(`/movie/watch/${movie?.id}`);
    }
  };

  // Lọc phim đề xuất (cùng thể loại - hỗ trợ cả trường category và categories)
  const recommendedMovies = useMemo(() => {
    if (!movie) return [];
    
    // Thu thập tất cả thể loại của phim hiện tại
    const currentCats = new Set<string>();
    
    // Từ trường category (chuỗi, phân cách bằng dấu phẩy)
    if (movie.category) {
      String(movie.category).split(',').forEach(c => currentCats.add(c.trim().toLowerCase()));
    }
    // Từ trường categories (mảng ID)
    if (movie.categories && Array.isArray(movie.categories)) {
      movie.categories.forEach((c: string) => currentCats.add(String(c).trim().toLowerCase()));
    }
    
    if (currentCats.size === 0) return [];
    
    return allMovies.filter(m => {
      if (m.id === movie.id) return false;
      
      // So sánh qua category string
      if (m.category) {
        const mCats = String(m.category).split(',').map(c => c.trim().toLowerCase());
        if (mCats.some(c => currentCats.has(c))) return true;
      }
      // So sánh qua categories array
      if (m.categories && Array.isArray(m.categories)) {
        if (m.categories.some((c: string) => currentCats.has(String(c).trim().toLowerCase()))) return true;
      }
      
      return false;
    }).slice(0, 12);
  }, [movie, allMovies]);

  // Tìm các phần khác của phim (Seasons) - Logic giống web gốc detail.js renderMoviePartsSeries
  const seasons = useMemo(() => {
    if (!movie) return [];
    
    const hasSeriesId = movie.seriesId && movie.seriesId.trim() !== '';
    const hasPart = movie.part && String(movie.part).trim() !== '' && String(movie.part) !== '(Trống)';
    
    // Nếu không có dữ liệu phần nào thì không hiển thị
    if (!hasPart && !hasSeriesId) return [];
    
    let seriesMovies: typeof allMovies = [];
    
    if (hasSeriesId) {
      // ƯU TIÊN 1: Gom nhóm theo seriesId (chính xác tuyệt đối)
      seriesMovies = allMovies.filter(m => m.seriesId === movie.seriesId);
    } else {
      // ƯU TIÊN 2: Fallback - Tìm theo tên gốc (bỏ "Phần X", "Season X"...)
      let baseTitle = movie.title.split(':')[0].split('-')[0].trim();
      baseTitle = baseTitle.replace(/(\s+)(\d+|I|II|III|IV|V)+$/i, '').trim();
      
      if (baseTitle.length >= 2) {
        seriesMovies = allMovies.filter(m =>
          m.title.toLowerCase().includes(baseTitle.toLowerCase())
        );
      }
    }
    
    // Chỉ trả về nếu có từ 2 phim trở lên
    if (seriesMovies.length <= 1) return [];
    
    // Sắp xếp theo số phần
    seriesMovies.sort((a, b) => {
      const getPartNum = (m: typeof movie) => {
        const match = (String(m?.part || '') || m?.title || '').match(/\d+/);
        return match ? parseInt(match[0]) : 0;
      };
      return getPartNum(a) - getPartNum(b);
    });
    
    return seriesMovies;
  }, [movie, allMovies]);

  // Resolve tên thể loại từ ID (giống logic web gốc intro.js dòng 111-127)
  const categoryNames = useMemo(() => {
    if (!movie) return [];
    
    // Ưu tiên mảng categories (chứa ID thể loại)
    if (movie.categories && movie.categories.length > 0) {
      return movie.categories.map(catId => {
        const searchId = String(catId).trim().toLowerCase();
        const found = allCategories.find(
          c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId
        );
        return found ? found.name : catId;
      });
    }
    
    // Fallback: dùng trường category đơn lẻ
    if (movie.category) {
      const searchId = String(movie.category).trim().toLowerCase();
      const found = allCategories.find(
        c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId
      );
      return [found ? found.name : movie.category];
    }
    
    return [];
  }, [movie, allCategories]);

  // Nếu không tìm thấy phim (hoặc link hỏng)
  if (!movie) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: 'Lỗi', headerTransparent: false }} />
        <AppText style={styles.errorText}>Không tìm thấy thông tin phim</AppText>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <AppText style={styles.backButtonText}>Quay lại</AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      {/* Ẩn header mặc định, dùng floating buttons thay thế */}
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        {/* Ảnh Nền Lớn (Backdrop) */}
        <View style={styles.backdropContainer}>
          <Image 
            source={movie.backgroundUrl || movie.thumbUrl || movie.posterUrl} 
            style={styles.backdropImage} 
            contentFit="cover" 
          />
          {/* Gradient đen mượt mà để hòa quyện vào phần thông tin bên dưới */}
          <LinearGradient
            colors={themeMode === 'light' 
              ? ['rgba(233, 235, 238, 0)', 'rgba(233, 235, 238, 0.6)', 'rgba(233, 235, 238, 1)'] 
              : ['rgba(10, 10, 15, 0)', 'rgba(10, 10, 15, 0.6)', 'rgba(10, 10, 15, 1)']}
            style={styles.gradient}
          />
        </View>

        {/* Phần Thông Tin Chính (kéo lên đè vào ảnh nền một chút) */}
        <View style={styles.contentContainer}>
          <View style={styles.mainInfo}>
            {/* Ảnh Poster nhỏ */}
            <Image source={movie.posterUrl} style={styles.poster} contentFit="cover" />
            
            <View style={styles.titleInfo}>
              <AppText style={[styles.title, { color: themeColors.textPrimary }]}>{movie.title}</AppText>
              <AppText style={[styles.originTitle, { color: themeColors.textMuted }]}>{movie.originTitle || movie.title}</AppText>
              
              <View style={styles.tagsRow}>
                {movie.year && <AppText style={[styles.tag, { backgroundColor: themeColors.bgSecondary, color: themeColors.textSecondary }]}>{movie.year}</AppText>}
                {movie.quality && <AppText style={[styles.tag, { backgroundColor: themeColors.bgSecondary, color: themeColors.textSecondary }]}>{movie.quality}</AppText>}
                {movie.duration && <AppText style={[styles.tag, { backgroundColor: themeColors.bgSecondary, color: themeColors.textSecondary }]}>{movie.duration}</AppText>}
                {movie.ageLimit && <AppText style={[styles.tag, { backgroundColor: themeColors.bgSecondary, color: themeColors.warning }]}>{movie.ageLimit}</AppText>}
                {movie.imdbRating && (
                  <AppText style={[styles.tag, { backgroundColor: themeColors.bgSecondary, color: themeColors.textSecondary }]}>
                    <AppText style={{ color: '#f5c518', fontWeight: 'bold' }}>IMDb</AppText> {movie.imdbRating}
                  </AppText>
                )}
              </View>

              {/* Thể loại phim (hiển thị dạng chip nhỏ gọn bên cạnh info) */}
              {categoryNames.length > 0 && (
                <View style={styles.genreRow}>
                  {categoryNames.map((name, idx) => (
                    <View key={`genre-${idx}`} style={[styles.genreChip, { backgroundColor: `${primaryColor}1A`, borderColor: `${primaryColor}4D` }]}>
                      <FontAwesome name="tag" size={9} color={primaryColor} style={{ marginRight: 5 }} />
                      <AppText style={[styles.genreChipText, { color: primaryColor }]}>{name}</AppText>
                    </View>
                  ))}
                </View>
              )}
              
              {/* Nút Xem Phim */}
              <Pressable 
                style={[styles.watchButton, { backgroundColor: primaryColor }]} 
                onPress={handlePlay}
              >
                <FontAwesome name="play" size={16} color={themeColors.bgPrimary} style={{ marginRight: 8 }} />
                <AppText style={[styles.watchButtonText, { color: themeColors.bgPrimary }]}>Xem Ngay</AppText>
              </Pressable>
            </View>
          </View>

          {/* Mô tả phim */}
          <View style={[styles.section, { paddingHorizontal: 20 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <AppText 
                style={[styles.description, { flex: 1, color: themeColors.textSecondary }]} 
                numberOfLines={isDescExpanded ? undefined : 3}
              >
                {movie.description || 'Chưa có thông tin mô tả chi tiết cho bộ phim này.'}
              </AppText>
              {(movie.description?.length || 0) > 100 && (
                <Pressable onPress={() => setIsDescExpanded(!isDescExpanded)} style={{ marginLeft: 8, alignItems: 'center' }}>
                  <AppText style={{ color: themeColors.textPrimary, fontSize: 12, fontFamily: 'Montserrat-Medium' }}>
                    {isDescExpanded ? 'Rút gọn' : 'Chi tiết'}
                  </AppText>
                  <FontAwesome name={isDescExpanded ? 'chevron-up' : 'chevron-down'} size={10} color={themeColors.textPrimary} style={{ marginTop: 2 }} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Action Buttons Row */}
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[styles.actionBtnIcon, isFavoriteLoading && { opacity: 0.5 }]} 
              onPress={handleToggleFavorite}
              disabled={isFavoriteLoading}
            >
              <FontAwesome name={isFavorite ? "heart" : "heart-o"} size={24} color={isFavorite ? "#ff3b30" : themeColors.textPrimary} />
              <AppText style={[styles.actionBtnText, { color: isFavorite ? "#ff3b30" : themeColors.textPrimary }]}>Yêu thích</AppText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionBtnIcon} 
              onPress={handleOpenAlbumModal}
            >
              <FontAwesome name="plus" size={24} color={themeColors.textPrimary} />
              <AppText style={[styles.actionBtnText, { color: themeColors.textPrimary }]}>Thêm vào</AppText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnIcon}>
              <FontAwesome name="smile-o" size={24} color={themeColors.textPrimary} />
              <AppText style={[styles.actionBtnText, { color: themeColors.textPrimary }]}>Đánh giá</AppText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnIcon} onPress={() => setActiveTab('episodes')}>
              <FontAwesome name="commenting" size={24} color={themeColors.textPrimary} />
              <AppText style={[styles.actionBtnText, { color: themeColors.textPrimary }]}>Bình luận</AppText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnIcon}>
              <FontAwesome name="send" size={22} color={themeColors.textPrimary} />
              <AppText style={[styles.actionBtnText, { color: themeColors.textPrimary }]}>Chia sẻ</AppText>
            </TouchableOpacity>
          </View>

          {/* Tabs Row */}
          <View style={[styles.tabRow, { borderBottomColor: themeColors.bgTertiary }]}>
            <Pressable 
              style={[styles.tabBtn, activeTab === 'episodes' && [styles.tabBtnActive, { borderBottomColor: primaryColor }]]} 
              onPress={() => setActiveTab('episodes')}
            >
              <AppText style={[styles.tabText, { color: themeColors.textMuted }, activeTab === 'episodes' && [styles.tabTextActive, { color: primaryColor }]]}>
                Tập phim
              </AppText>
            </Pressable>
            {seasons.length > 0 && (
              <Pressable 
                style={[styles.tabBtn, activeTab === 'seasons' && [styles.tabBtnActive, { borderBottomColor: primaryColor }]]} 
                onPress={() => setActiveTab('seasons')}
              >
                <AppText style={[styles.tabText, { color: themeColors.textMuted }, activeTab === 'seasons' && [styles.tabTextActive, { color: primaryColor }]]}>
                  Phần phim
                </AppText>
              </Pressable>
            )}
            <Pressable 
              style={[styles.tabBtn, activeTab === 'cast' && [styles.tabBtnActive, { borderBottomColor: primaryColor }]]} 
              onPress={() => setActiveTab('cast')}
            >
              <AppText style={[styles.tabText, { color: themeColors.textMuted }, activeTab === 'cast' && [styles.tabTextActive, { color: primaryColor }]]}>
                Diễn viên
              </AppText>
            </Pressable>
            <Pressable 
              style={[styles.tabBtn, activeTab === 'recommend' && [styles.tabBtnActive, { borderBottomColor: primaryColor }]]} 
              onPress={() => setActiveTab('recommend')}
            >
              <AppText style={[styles.tabText, { color: themeColors.textMuted }, activeTab === 'recommend' && [styles.tabTextActive, { color: primaryColor }]]}>
                Đề xuất
              </AppText>
            </Pressable>
          </View>

          {/* Tab Content */}
          <View style={styles.tabContent}>
            {activeTab === 'episodes' && (
              <View style={styles.tabSection}>
                {/* Danh sách tập (Nếu có episodes từ DB) */}
                {episodeNumbers.length > 0 && (
                  <View style={styles.tabSection}>
                    <View style={[styles.sectionHeaderRow, { justifyContent: 'flex-end' }]}>
                      <AppText style={[styles.epCount, { color: themeColors.textMuted }]}>{episodeNumbers.length} Tập</AppText>
                    </View>

                    {/* Dropdown chọn khoảng tập */}
                    {epRanges.length > 0 && (
                      <View style={{ marginBottom: 16 }}>
                        <Pressable
                          style={[styles.dropdownBtn, { backgroundColor: themeColors.bgTertiary }]}
                          onPress={() => setRangeModalVisible(true)}
                        >
                          <AppText style={[styles.dropdownBtnText, { color: themeColors.textPrimary }]}>
                            {epRanges[selectedEpRangeIndex]?.label || 'Chọn tập'}
                          </AppText>
                          <FontAwesome name="caret-down" size={14} color={themeColors.textPrimary} />
                        </Pressable>
                        
                        <Modal visible={isRangeModalVisible} transparent animationType="fade">
                          <Pressable style={styles.modalOverlay} onPress={() => setRangeModalVisible(false)}>
                            <Pressable style={[styles.modalContent, { backgroundColor: themeColors.bgSecondary }]} onPress={e => e.stopPropagation()}>
                              <AppText style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Chọn khoảng tập</AppText>
                              <ScrollView style={{ maxHeight: 300 }}>
                                {epRanges.map((range, idx) => (
                                  <Pressable 
                                    key={idx} 
                                    style={[styles.modalItem, { borderBottomColor: themeColors.bgTertiary }]}
                                    onPress={() => handleChangeEpRange(idx)}
                                  >
                                    <AppText style={[styles.modalItemText, selectedEpRangeIndex === idx && { color: primaryColor, fontFamily: 'Montserrat-Bold' }, selectedEpRangeIndex !== idx && { color: themeColors.textPrimary }]}>
                                      {range.label}
                                    </AppText>
                                    {selectedEpRangeIndex === idx && <FontAwesome name="check" size={14} color={primaryColor} />}
                                  </Pressable>
                                ))}
                              </ScrollView>
                            </Pressable>
                          </Pressable>
                        </Modal>
                      </View>
                    )}

                    {isLoadingPage ? (
                      <View style={{ padding: 20, alignItems: 'center' }}>
                        <AppText style={{ color: themeColors.textMuted, fontFamily: 'Montserrat-Medium' }}>Đang tải danh sách tập...</AppText>
                      </View>
                    ) : (
                      <View style={styles.episodeGrid}>
                        {displayedEpisodes.map((ep: any, mapIdx: number) => {
                          const originalIdx = epRanges.length > 0 ? epRanges[selectedEpRangeIndex].start + mapIdx : mapIdx;
                          return (
                            <Pressable 
                              key={originalIdx} 
                              style={[styles.episodeBtn, { backgroundColor: themeColors.bgTertiary, borderColor: themeColors.bgTertiary }]}
                              onPress={() => router.push(`/movie/watch/${movie.id}?ep=${originalIdx}`)}
                            >
                              <AppText style={[styles.episodeText, { color: themeColors.textPrimary }]}>{ep.episode_number || (originalIdx + 1)}</AppText>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}

                {/* Bình luận */}
                <View style={styles.tabSection}>
                  <MovieComments movieId={movie.id} />
                </View>
              </View>
            )}

            {activeTab === 'cast' && (
              <View style={[styles.tabSection, { paddingHorizontal: 20 }]}>
                {movie.director && (
                  <AppText style={[styles.castText, { marginBottom: 10 }]}>
                    <AppText style={{ color: themeColors.textPrimary, fontWeight: 'bold' }}>Đạo diễn: </AppText>
                    {movie.director}
                  </AppText>
                )}
                {movie.cast && (
                  <AppText style={styles.castText}>
                    <AppText style={{ color: themeColors.textPrimary, fontWeight: 'bold' }}>Diễn viên: </AppText>
                    {movie.cast}
                  </AppText>
                )}
                {!movie.director && !movie.cast && (
                  <AppText style={{ color: themeColors.textSecondary, fontStyle: 'italic' }}>Chưa có thông biến diễn viên.</AppText>
                )}
              </View>
            )}

            {activeTab === 'seasons' && seasons.length > 0 && (
              <View style={styles.tabSection}>
                <View style={styles.recommendGrid}>
                  {seasons.map((season) => {
                    const isActive = season.id === movie.id;
                    let partText = String(season.part || '');
                    if (!partText || partText === '(Trống)') partText = season.title;
                    
                    return (
                      <Pressable 
                        key={season.id} 
                        style={styles.recCardCol}
                        onPress={() => { if (!isActive) router.push(`/movie/${season.id}`); }}
                      >
                        <Image 
                          source={season.posterUrl || season.thumbUrl} 
                          style={[styles.recPosterCol, { backgroundColor: themeColors.bgTertiary, borderWidth: isActive ? 2 : 0, borderColor: primaryColor }]} 
                          contentFit="cover" 
                        />
                        <AppText style={[styles.recTitleCol, { color: isActive ? primaryColor : themeColors.textPrimary }]} numberOfLines={2}>{partText}</AppText>
                        {isActive && (
                          <View style={{ position: 'absolute', top: 5, right: 5, backgroundColor: primaryColor, borderRadius: 10, padding: 2 }}>
                            <FontAwesome name="check" size={10} color={themeColors.bgPrimary} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {activeTab === 'recommend' && (
              <View style={styles.tabSection}>
                {recommendedMovies.length > 0 ? (
                  <View style={styles.recommendGrid}>
                    {recommendedMovies.map((rec, idx) => (
                      <Pressable 
                        key={idx} 
                        style={styles.recCardCol}
                        onPress={() => router.push(`/movie/${rec.id}`)}
                      >
                        <Image source={rec.posterUrl || rec.thumbUrl} style={[styles.recPosterCol, { backgroundColor: themeColors.bgTertiary }]} contentFit="cover" />
                        <AppText style={[styles.recTitleCol, { color: themeColors.textPrimary }]} numberOfLines={2}>{rec.title}</AppText>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <AppText style={{ color: themeColors.textMuted, paddingHorizontal: 20, fontStyle: 'italic' }}>Chưa có đề xuất phim nào.</AppText>
                )}
              </View>
            )}
          </View>

          {/* Khoảng trống cuối trang */}
          <View style={{ height: 60 }} />
        </View>
      </ScrollView>

      {/* ===== NÚT FLOATING (Nằm trên cùng, đảm bảo nhạy trên iOS) ===== */}
      <View style={[styles.floatingHeader, { top: insets.top + 10 }]} pointerEvents="box-none">
        <TouchableOpacity style={[styles.floatingBtn, { backgroundColor: themeMode === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)' }]} onPress={() => router.back()}>
          <FontAwesome name="angle-left" size={24} color={themeColors.textPrimary} style={{ marginRight: 2 }} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.floatingBtn, { backgroundColor: themeMode === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)' }]}>
          <FontAwesome name="share-alt" size={16} color={themeColors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Thanh menu dưới cùng */}
      <BottomTabBar />

      {/* Modal Album */}
      <AlbumModal 
        visible={isAlbumModalVisible} 
        onClose={() => setIsAlbumModalVisible(false)} 
        movieId={id as string} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bgPrimary },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.dark.bgPrimary },
  errorText: { color: '#fff', fontSize: 16, marginBottom: 16 },
  backButton: { padding: 12, backgroundColor: Colors.dark.bgTertiary, borderRadius: 8 },
  backButtonText: { color: '#fff' },
  
  headerButton: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },

  /* ===== FLOATING BUTTONS (Thay thế headerLeft/headerRight) ===== */
  floatingHeader: {
    position: 'absolute',
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 999,
  },
  floatingBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  backdropContainer: {
    width: width,
    height: HEADER_HEIGHT,
    position: 'relative',
  },
  backdropImage: { width: '100%', height: '100%' },
  gradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '60%',
  },
  
  contentContainer: {
    paddingHorizontal: 16,
    marginTop: -100, // Kéo nội dung lên đè vào ảnh nền
  },
  mainInfo: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.dark.bgSecondary,
    backgroundColor: Colors.dark.bgTertiary,
  },
  titleInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'flex-end',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    fontFamily: 'Montserrat-Bold',
    marginBottom: 4,
  },
  originTitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontFamily: 'Montserrat-Regular',
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tag: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
    fontFamily: 'Montserrat-SemiBold',
  },
  watchButton: {
    backgroundColor: Colors.dark.accentSecondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  watchButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
  
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    fontFamily: 'Montserrat-Bold',
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.accentPrimary,
    paddingLeft: 8,
  },
  description: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Montserrat-Regular',
  },
  castText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Montserrat-Regular',
  },
  commentPlaceholder: {
    backgroundColor: Colors.dark.bgSecondary,
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  commentPlaceholderText: {
    color: Colors.dark.textMuted,
    fontStyle: 'italic',
  },

  /* ===== THỂ LOẠI PHIM (Inline bên cạnh poster) ===== */
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(77, 184, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(77, 184, 255, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  genreChipText: {
    color: Colors.dark.accentPrimary,
    fontSize: 10,
    fontFamily: 'Montserrat-SemiBold',
  },

  /* ===== THỂ LOẠI PHIM (Section đầy đủ bên dưới) ===== */
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  genreFullChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(77, 184, 255, 0.15)',
  },
  genreFullChipText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Montserrat-SemiBold',
  },

  /* ===== THÊM STYLE CHO EPISODES & SERVERS ===== */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  epCount: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontFamily: 'Montserrat-Medium',
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dropdownBtnText: {
    color: '#fff',
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.dark.bgSecondary,
    borderRadius: 16,
    paddingVertical: 10,
    maxHeight: '80%',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
    textAlign: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  modalItemText: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'Montserrat-Medium',
    fontSize: 15,
  },
  episodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  episodeBtn: {
    width: (width - 40 - 48) / 5, // 5 cột, padding 20x2, gap 12x4=48
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  episodeText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 14,
  },
  serverRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  serverBtn: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  serverBtnActive: {
    backgroundColor: Colors.dark.accentPrimary,
    borderColor: Colors.dark.accentPrimary,
  },
  serverText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 13,
  },
  serverTextActive: {
    color: '#000',
    fontFamily: 'Montserrat-Bold',
    fontSize: 13,
  },
  seasonRow: {
    gap: 12,
    marginTop: 12,
    paddingRight: 20,
  },
  seasonBtn: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    marginRight: 10,
  },
  seasonBtnActive: {
    backgroundColor: Colors.dark.accentPrimary,
  },
  seasonText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 13,
  },
  seasonTextActive: {
    color: '#000',
    fontFamily: 'Montserrat-Bold',
    fontSize: 13,
  },
  
  /* ===== ACTION BUTTONS & TABS ===== */
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
  },
  actionBtnIcon: {
    alignItems: 'center',
    gap: 6,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Montserrat-SemiBold',
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: Colors.dark.accentPrimary,
  },
  tabText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontFamily: 'Montserrat-SemiBold',
  },
  tabTextActive: {
    color: Colors.dark.accentPrimary,
    fontFamily: 'Montserrat-Bold',
  },
  tabContent: {
    flex: 1,
  },
  tabSection: {
    flex: 1,
  },
  recommendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 15,
    justifyContent: 'space-between',
  },
  recCardCol: {
    width: (width - 40) / 3, // 3 columns
    marginBottom: 16,
    alignItems: 'center',
  },
  recPosterCol: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 6,
  },
  recTitleCol: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Montserrat-Regular',
    textAlign: 'center',
  },
});
