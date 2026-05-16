import { AppText } from '../components/AppText';
import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, Text, FlatList, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { useMovieStore, Movie } from '../stores/useMovieStore';
import { useThemeStore } from '../stores/useThemeStore';
import { MovieCard } from '../components/MovieCard';
import { Colors } from '../theme/colors';
import MovieDetailPopup from '../components/MovieDetailPopup';

export default function FilterScreen() {
  const params = useLocalSearchParams<{ type?: string; category?: string; catId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { allMovies, allCategories } = useMovieStore();

  // Lấy theme hiện tại (dark/light) từ store
  const themeMode = useThemeStore(s => s.themeMode);
  const themeColors = useThemeStore(s => s.themeColors);

  // State cho popup chi tiết phim kiểu Netflix
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);

  // Mở popup chi tiết phim khi bấm vào MovieCard
  const handleMoviePress = useCallback((movie: Movie) => {
    setSelectedMovie(movie);
    setIsPopupVisible(true);
  }, []);

  // Lấy giá trị params
  const type = params.type || '';
  const category = params.category || '';
  const catId = params.catId || '';

  // Giải mã tên thể loại từ ID hoặc tên truyền vào
  const displayCategory = useMemo(() => {
    if (!category) return '';
    const found = allCategories.find(c => c.id.toLowerCase() === category.toLowerCase() || c.name.toLowerCase() === category.toLowerCase());
    return found ? found.name : category;
  }, [category, allCategories]);

  // Tiêu đề trang dựa trên loại bộ lọc
  const title = displayCategory
    ? `Thể loại: ${displayCategory}`
    : type === 'series'
      ? 'Phim Bộ'
      : type === 'single'
        ? 'Phim Lẻ'
        : 'Danh sách Phim';

  // Lọc phim theo type hoặc category
  const filteredMovies = useMemo(() => {
    let result = [...allMovies];

    // Lọc theo type (phim bộ / phim lẻ)
    if (type) {
      result = result.filter(m => m.type === type);
    }

    // Lọc theo thể loại - sử dụng cả catId (UUID) và category (tên)
    if (category || catId) {
      const targetName = category.toLowerCase().trim();
      const targetId = catId.toLowerCase().trim();

      result = result.filter(m => {
        // 1. Kiểm tra trường category chính (có thể là ID hoặc tên)
        const mainCat = (m.category || '').toLowerCase().trim();
        if (targetName && mainCat === targetName) return true;
        if (targetId && mainCat === targetId) return true;

        // 2. Kiểm tra mảng categories (thường chứa ID hoặc tên)
        if (m.categories && Array.isArray(m.categories)) {
          for (const cid of m.categories) {
            const cidStr = String(cid).toLowerCase().trim();
            // So sánh trực tiếp với ID
            if (targetId && cidStr === targetId) return true;
            // So sánh trực tiếp với tên
            if (targetName && cidStr === targetName) return true;
            // Resolve ID thành tên thông qua bảng allCategories rồi so sánh
            if (targetName) {
              const foundCat = allCategories.find(c =>
                c.id.toLowerCase() === cidStr || c.name.toLowerCase() === cidStr
              );
              if (foundCat && foundCat.name.toLowerCase() === targetName) return true;
            }
          }
        }

        // 3. Kiểm tra trong tags dự phòng
        if (targetName && m.tags && Array.isArray(m.tags)) {
          if (m.tags.some(t => String(t).toLowerCase().includes(targetName))) return true;
        }

        return false;
      });
    }

    return result;
  }, [allMovies, allCategories, type, category, catId]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      {/* Header với nút quay lại - hỗ trợ dark/light */}
      <View style={[
        styles.header, 
        { 
          paddingTop: insets.top + 10,
          backgroundColor: themeMode === 'light' 
            ? 'rgba(233, 235, 238, 0.95)' 
            : 'rgba(18, 18, 21, 0.95)',
          borderBottomColor: themeMode === 'light' 
            ? 'rgba(0,0,0,0.08)' 
            : 'rgba(255,255,255,0.08)',
        }
      ]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="angle-left" size={28} color={themeColors.textPrimary} />
        </Pressable>
        <AppText style={[styles.headerTitle, { color: themeColors.textPrimary }]}>{title}</AppText>
        <AppText style={[styles.countText, { color: themeColors.textMuted }]}>{filteredMovies.length} phim</AppText>
      </View>

      {/* Danh sách phim dạng Grid */}
      <FlatList
        data={filteredMovies}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={({ item }) => <MovieCard movie={item} onPress={handleMoviePress} />}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        removeClippedSubviews={true}
        ListEmptyComponent={() => (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <AppText style={[styles.emptyText, { color: themeColors.textMuted }]}>Không tìm thấy phim nào</AppText>
          </View>
        )}
      />

      {/* Popup chi tiết phim kiểu Netflix */}
      <MovieDetailPopup
        visible={isPopupVisible}
        movie={selectedMovie}
        onClose={() => setIsPopupVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    padding: 4,
    paddingRight: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
    textAlign: 'center',
  },
  countText: {
    fontSize: 12,
    fontFamily: 'Montserrat-Regular',
    minWidth: 50,
    textAlign: 'right',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Montserrat-Regular',
  },
});
