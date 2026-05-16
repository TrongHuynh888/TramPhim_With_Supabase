import { AppText } from '../../components/AppText';
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, FlatList, StatusBar, Pressable, Dimensions, Modal, TextInput, Keyboard, Animated, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';

import { useMovieStore } from '../../stores/useMovieStore';
import { BannerCarousel } from '../../components/BannerCarousel';
import { MovieCard } from '../../components/MovieCard';
import { Colors } from '../../theme/colors';
import { useThemeStore } from '../../stores/useThemeStore';
import { useAuthStore } from '../../stores/useAuthStore';
import HomeEffects from '../../components/HomeEffects';
import { useAppFont } from '../../hooks/useAppFont';
import { removeDiacritics } from '../../utils/helpers';
import MovieDetailPopup from '../../components/MovieDetailPopup';
import { Movie } from '../../stores/useMovieStore';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const { allMovies, allCategories } = useMovieStore();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { primaryColor, themeColors, themeMode } = useThemeStore();
  const user = useAuthStore(state => state.user);
  const { fontBold, fontSemiBold, fontRegular } = useAppFont();
  const navigation = useNavigation();

  const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // State cho popup chi tiết phim kiểu Netflix
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(''); // Debounce để giảm tải lọc
  const [searchPage, setSearchPage] = useState(1);
  const [headerPosterUrl, setHeaderPosterUrl] = useState<string | null>(null); // Nền header đồng bộ banner
  const SEARCH_PAGE_SIZE = 12; // Mỗi lần hiển thị 12 phim
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Debounce 300ms: chỉ lọc sau khi người dùng ngừng gõ 0.3s
  React.useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  // ====== KÉO POPUP TÌM KIẾM (Pixel-based cho mượt mà) ======
  const screenHeight = Dimensions.get('window').height;
  const headerAreaHeight = insets.top + 118; // Chiều cao header + search bar
  const availableHeight = screenHeight - headerAreaHeight; // Không gian tối đa popup có thể chiếm
  const defaultHeight = availableHeight * 0.60; // Mặc định 60%
  const minHeight = availableHeight * 0.35; // Nhỏ nhất 35%
  const maxHeight = availableHeight; // Tối đa = chạm sát ô tìm kiếm

  const popupHeight = React.useRef(new Animated.Value(defaultHeight)).current;
  const lastHeight = React.useRef(defaultHeight);

  // Theo dõi vị trí cuộn để đổi nền header
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, 120, 200],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  // Lắng nghe scrollY để hiện nút cuộn lên
  React.useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      setShowScrollTop(value > 300);
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  const scrollToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  // Reset khi bật/tắt tìm kiếm
  React.useEffect(() => {
    if (isSearching) {
      popupHeight.setValue(defaultHeight);
      lastHeight.current = defaultHeight;
    }
  }, [isSearching]);

  const searchPanResponder = React.useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        // Lưu lại chiều cao hiện tại trước khi bắt đầu kéo
        lastHeight.current = (popupHeight as any)._value || defaultHeight;
      },
      onPanResponderMove: (_, gestureState) => {
        // Kéo lên = dy âm => tăng chiều cao, kéo xuống = dy dương => giảm chiều cao
        const newHeight = Math.min(maxHeight, Math.max(minHeight, lastHeight.current - gestureState.dy));
        popupHeight.setValue(newHeight);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentVal = (popupHeight as any)._value || defaultHeight;
        const velocity = -gestureState.vy; // Đảo dấu: vuốt lên = dương

        let target = defaultHeight;
        // Nếu kéo quá 75% hoặc vuốt nhanh lên => mở full
        if (currentVal > availableHeight * 0.75 || velocity > 1.5) {
          target = maxHeight;
        }
        // Nếu vuốt nhanh xuống => thu nhỏ về mặc định
        if (velocity < -1.5) {
          target = defaultHeight;
        }

        Animated.spring(popupHeight, {
          toValue: target,
          damping: 20,        // Giảm dao động
          stiffness: 200,     // Phản hồi nhanh
          mass: 0.8,          // Nhẹ hơn = mượt hơn
          useNativeDriver: false,
        }).start(() => {
          lastHeight.current = target;
        });
      }
    }),
  [availableHeight, defaultHeight, minHeight, maxHeight]);

  // Bo góc tự động biến mất khi kéo full
  const animatedBorderRadius = popupHeight.interpolate({
    inputRange: [maxHeight * 0.9, maxHeight],
    outputRange: [24, 0],
    extrapolate: 'clamp',
  });

  // Ẩn/hiện Tab Bar dưới cùng
  React.useEffect(() => {
    navigation.setOptions({
      tabBarStyle: isSearching ? { display: 'none' } : {
        position: 'absolute',
        backgroundColor: 'transparent',
        borderTopColor: 'rgba(255,255,255,0.08)',
        elevation: 0,
      }
    });
  }, [isSearching, themeColors]);

  // Lọc toàn bộ kết quả tìm kiếm (dùng debouncedQuery để tránh lọc quá nhiều lần)
  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    
    const query = removeDiacritics(debouncedQuery.toLowerCase().trim());
    return allMovies.filter(movie => {
      const title = removeDiacritics(movie.title?.toLowerCase() || '');
      const originTitle = removeDiacritics(movie.originTitle?.toLowerCase() || '');
      const cast = removeDiacritics(movie.cast?.toLowerCase() || '');
      
      return title.includes(query) || 
             originTitle.includes(query) || 
             cast.includes(query);
    });
  }, [allMovies, debouncedQuery]);

  // Phân trang: chỉ hiển thị số phim theo trang hiện tại
  const paginatedResults = useMemo(() => {
    return searchResults.slice(0, searchPage * SEARCH_PAGE_SIZE);
  }, [searchResults, searchPage]);

  // Kiểm tra còn dữ liệu để load thêm không
  const hasMoreResults = paginatedResults.length < searchResults.length;

  // Reset trang về 1 khi query thay đổi
  React.useEffect(() => {
    setSearchPage(1);
  }, [debouncedQuery]);

  // Hàm load thêm khi cuộn đến cuối
  const loadMoreResults = useCallback(() => {
    if (hasMoreResults) {
      setSearchPage(prev => prev + 1);
    }
  }, [hasMoreResults]);

  // Mở popup chi tiết phim khi bấm vào MovieCard
  const handleMoviePress = useCallback((movie: Movie) => {
    setSelectedMovie(movie);
    setIsPopupVisible(true);
  }, []);

  // Memo hóa renderItem để tránh tạo function mới mỗi lần render
  const renderSearchItem = useCallback(({ item }: { item: any }) => (
    <MovieCard movie={item} width={(width - 56) / 3} style={{ marginBottom: 0 }} onPress={handleMoviePress} />
  ), [handleMoviePress]);

  // Hàm đóng tìm kiếm (reset sạch state)
  const closeSearch = useCallback(() => {
    setIsSearching(false);
    setSearchQuery('');
    setDebouncedQuery('');
    setSearchPage(1);
  }, []);

  // Chỉ hiện thể loại có phim sử dụng
  const usedCategories = useMemo(() => {
    const usedIds = new Set<string>();
    allMovies.forEach(m => {
      const cats = m.categories || (m.category ? [m.category] : []);
      cats.forEach(c => usedIds.add(c.toLowerCase()));
    });
    return allCategories.filter(cat => usedIds.has(cat.id.toLowerCase()));
  }, [allMovies, allCategories]);

  const bannerMovies = useMemo(() => {
    // Lấy 12 phim mới nhất cho banner
    return [...allMovies].slice(0, 12);
  }, [allMovies]);

  const newMovies = useMemo(() => {
    return [...allMovies].slice(0, 12);
  }, [allMovies]);

  // Phim nổi bật (lượt xem cao nhất, khác với top banner)
  const featuredMovies = useMemo(() => {
    return [...allMovies]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 15);
  }, [allMovies]);

  // Phim Trung Quốc mới (logic lọc giống web gốc: home.js dòng 1210)
  const chineseMovies = useMemo(() => {
    return [...allMovies]
      .filter(m => {
        const c = (m.country || '').toLowerCase();
        const cid = (m.country_id || '').toLowerCase();
        return c.includes('trung') || c.includes('china') || c.includes('cn') ||
          cid === 'cn' || cid.includes('trung');
      })
      .slice(0, 15);
  }, [allMovies]);

  // Phim Hàn Quốc mới (logic lọc giống web gốc: home.js)
  const koreanMovies = useMemo(() => {
    return [...allMovies]
      .filter(m => {
        const c = (m.country || '').toLowerCase();
        const cid = (m.country_id || '').toLowerCase();
        return c.includes('hàn') || c.includes('korea') || c.includes('kr') ||
          cid === 'kr' || cid.includes('han');
      })
      .slice(0, 15);
  }, [allMovies]);

  // Phim US-UK mới
  const usukMovies = useMemo(() => {
    return [...allMovies]
      .filter(m => {
        const c = (m.country || '').toLowerCase();
        const cid = (m.country_id || '').toLowerCase();
        return c.includes('âu') || c.includes('mỹ') || c.includes('us') || c.includes('uk') || c.includes('hoa kỳ') || c.includes('anh') ||
          cid === 'us' || cid === 'uk' || cid.includes('my');
      })
      .slice(0, 15);
  }, [allMovies]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      <StatusBar barStyle={themeMode === 'light' ? 'dark-content' : 'light-content'} translucent backgroundColor="transparent" />
      
      {/* Hiệu ứng Visual chìm xuống lớp nền móng (Z-Index sau ScrollView) */}
      {user && <HomeEffects />}

      {/* Nội dung cuộn Trang Chủ */}
      <Animated.ScrollView 
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false} 
        bounces={false}
        contentContainerStyle={{ paddingTop: insets.top + 80 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Banner Carousel - chips nằm trên nền blur */}
        <View style={{ marginTop: -(insets.top + 80) }}>
          <BannerCarousel 
            movies={bannerMovies} 
            onActiveMovieChange={(movie) => setHeaderPosterUrl(movie.posterUrl || null)}
          >
            {/* Filter Chips nằm tự nhiên trên nền blur banner */}
            <View style={[styles.chipContainer, { marginTop: insets.top + 42 }]}>
              <View style={[styles.chip, { backgroundColor: themeColors.textPrimary, borderColor: themeColors.textPrimary }]}>
                <AppText style={[styles.chipTextActive, { color: themeColors.bgPrimary, fontFamily: fontBold }]}>Đề xuất</AppText>
              </View>
              <Pressable 
                style={[styles.chip, { borderColor: 'rgba(255,255,255,0.35)' }]}
                onPress={() => router.push('/filter?type=series')}
              >
                <AppText style={[styles.chipText, { color: '#fff', fontFamily: fontSemiBold }]}>Phim bộ</AppText>
              </Pressable>
              <Pressable 
                style={[styles.chip, { borderColor: 'rgba(255,255,255,0.35)' }]}
                onPress={() => router.push('/filter?type=single')}
              >
                <AppText style={[styles.chipText, { color: '#fff', fontFamily: fontSemiBold }]}>Phim lẻ</AppText>
              </Pressable>
              <Pressable 
                style={[styles.chip, { borderColor: 'rgba(255,255,255,0.35)', flexDirection: 'row', alignItems: 'center' }]}
                onPress={() => setCategoryModalVisible(true)}
              >
                <AppText style={[styles.chipText, { color: '#fff', marginRight: 4, fontFamily: fontSemiBold }]}>Thể loại</AppText>
                <FontAwesome name="caret-down" size={12} color="#fff" />
              </Pressable>
            </View>
          </BannerCarousel>
        </View>

        {/* Section: Phim Nổi Bật (Cuộn ngang) */}
        <View style={styles.sectionHeader}>
          <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary, fontFamily: fontBold }]}>Phim Nổi Bật</AppText>
          <Pressable onPress={() => router.push('/filter?sort=views')} hitSlop={10}>
            <FontAwesome name="angle-right" size={24} color={themeColors.textPrimary} />
          </Pressable>
        </View>
        <FlatList
          data={featuredMovies}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          keyExtractor={(item) => `feat-${item.id}`}
          renderItem={({ item }) => (
            <MovieCard movie={item} width={130} style={{ marginRight: 12, marginBottom: 0 }} onPress={handleMoviePress} />
          )}
        />

        {/* Section: Bạn đang quan tâm gì? */}
        <View style={[styles.sectionHeader, { marginTop: 28 }]}>
           <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary, fontFamily: fontBold }]}>Phim Mới Cập Nhật</AppText>
           <FontAwesome name="angle-right" size={24} color={themeColors.textPrimary} />
        </View>

        {/* Lưới Phim Mới (Cuộn ngang) */}
        <FlatList
          data={newMovies}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          keyExtractor={(item) => `new-${item.id}`}
          renderItem={({ item }) => (
            <MovieCard movie={item} width={130} style={{ marginRight: 12, marginBottom: 0 }} onPress={handleMoviePress} />
          )}
        />

        {/* Section: Phim Trung Quốc Mới */}
        {chineseMovies.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 28 }]}>
              <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary, fontFamily: fontBold }]}>Phim Trung Quốc Mới</AppText>
              <FontAwesome name="angle-right" size={24} color={themeColors.textPrimary} />
            </View>
            <FlatList
              data={chineseMovies}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              keyExtractor={(item) => `cn-${item.id}`}
              renderItem={({ item }) => (
                <MovieCard movie={item} width={130} style={{ marginRight: 12, marginBottom: 0 }} onPress={handleMoviePress} />
              )}
            />
          </>
        )}

        {/* Section: Phim Hàn Quốc Mới */}
        {koreanMovies.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 28 }]}>
              <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary, fontFamily: fontBold }]}>Phim Hàn Quốc Mới</AppText>
              <FontAwesome name="angle-right" size={24} color={themeColors.textPrimary} />
            </View>
            <FlatList
              data={koreanMovies}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              keyExtractor={(item) => `kr-${item.id}`}
              renderItem={({ item }) => (
                <MovieCard movie={item} width={130} style={{ marginRight: 12, marginBottom: 0 }} onPress={handleMoviePress} />
              )}
            />
          </>
        )}

        {/* Section: Phim US-UK Mới */}
        {usukMovies.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 28 }]}>
              <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary, fontFamily: fontBold }]}>Phim US-UK Mới</AppText>
              <FontAwesome name="angle-right" size={24} color={themeColors.textPrimary} />
            </View>
            <FlatList
              data={usukMovies}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              keyExtractor={(item) => `usuk-${item.id}`}
              renderItem={({ item }) => (
                <MovieCard movie={item} width={130} style={{ marginRight: 12, marginBottom: 0 }} onPress={handleMoviePress} />
              )}
            />
          </>
        )}
        
        <View style={{ height: 90 }} />
      </Animated.ScrollView>

      {/* HIỂN THỊ KẾT QUẢ TÌM KIẾM DẠNG OVERLAY DƯỚI HEADER */}
      {isSearching && (
        <View style={[styles.searchOverlayWrapper, { top: insets.top + 118 }]}>
          <Pressable 
            style={{ ...StyleSheet.absoluteFillObject }} 
            onPress={closeSearch} 
          />
          <Animated.View style={[styles.searchBottomSheet, { height: popupHeight, borderTopLeftRadius: animatedBorderRadius, borderTopRightRadius: animatedBorderRadius }]}>
            <LinearGradient
              {...searchPanResponder.panHandlers}
              colors={themeMode === 'light' 
                ? ['rgba(240,240,245,0.98)', 'rgba(230,230,235,0.95)'] 
                : ['rgba(35,35,45,0.98)', 'rgba(25,25,32,0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1 }}
            >
              {/* Thanh ngang để kéo */}
              <View style={styles.dragHandleContainer}>
                <View style={[styles.dragHandle, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)' }]} />
              </View>

              <View style={{ flex: 1 }}>
                {searchQuery.length === 0 ? (
                  <View style={styles.searchEmpty}>
                    <FontAwesome name="search" size={48} color={themeColors.textMuted} style={{ opacity: 0.3, marginBottom: 16 }} />
                    <AppText style={[styles.searchEmptyText, { color: themeColors.textMuted, fontFamily: fontRegular }]}>
                      Gõ tên phim hoặc diễn viên để tìm kiếm
                    </AppText>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View style={styles.searchEmpty}>
                    <FontAwesome name="inbox" size={48} color={themeColors.textMuted} style={{ opacity: 0.3, marginBottom: 16 }} />
                    <AppText style={[styles.searchEmptyText, { color: themeColors.textMuted, fontFamily: fontRegular }]}>
                      Không tìm thấy kết quả nào
                    </AppText>
                  </View>
                ) : (
                  <>
                    {/* Hiển thị số lượng kết quả */}
                    <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
                      <AppText style={{ color: themeColors.textMuted, fontSize: 13, fontFamily: fontRegular }}>
                        Tìm thấy {searchResults.length} phim · Hiển thị {paginatedResults.length}
                      </AppText>
                    </View>
                    <FlatList
                      data={paginatedResults}
                      keyExtractor={(item) => `search-${item.id}`}
                      numColumns={3}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 30, paddingTop: 0 }}
                      columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 16 }}
                      renderItem={renderSearchItem}
                      keyboardDismissMode="on-drag"
                      onEndReached={loadMoreResults}
                      onEndReachedThreshold={0.3}
                      initialNumToRender={SEARCH_PAGE_SIZE}
                      maxToRenderPerBatch={SEARCH_PAGE_SIZE}
                      windowSize={5}
                      removeClippedSubviews={true}
                      ListFooterComponent={
                        hasMoreResults ? (
                          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                            <AppText style={{ color: themeColors.textMuted, fontSize: 13, fontFamily: fontRegular }}>
                              Cuộn xuống để xem thêm...
                            </AppText>
                          </View>
                        ) : searchResults.length > SEARCH_PAGE_SIZE ? (
                          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                            <AppText style={{ color: themeColors.textMuted, fontSize: 13, fontFamily: fontRegular }}>
                              Đã hiển thị tất cả {searchResults.length} phim
                            </AppText>
                          </View>
                        ) : null
                      }
                    />
                  </>
                )}
              </View>
            </LinearGradient>
          </Animated.View>
        </View>
      )}

      {/* ===== STICKY HEADER ===== */}
      <View style={styles.stickyHeader}>
        {/* Blur glassmorphism - hiện ra khi cuộn xuống */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerBgOpacity }]}>
          <BlurView
            intensity={100}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          {/* Lớp overlay xám nhạt tăng độ tương phản */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30,30,35,0.4)' }]} />
        </Animated.View>
        {/* Gradient overlay nhẹ trên nền poster (chỉ thấy khi chưa cuộn) */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: Animated.subtract(1, headerBgOpacity) }]}>
          <LinearGradient
            colors={themeMode === 'light'
              ? ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']
              : ['rgba(0,0,0,1)', 'rgba(0,0,0,0.9)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)']}
            locations={[0, 0.4, 0.75, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View style={{ paddingTop: insets.top + 10, paddingBottom: 6 }}>
        <View style={styles.headerContent}>
          {/* Logo Trạm Phim (giống Web JS) */}
          <View style={styles.logoRow}>
            <View style={[styles.brandIconWrapper, { width: 36, height: 36 }]}>
              <LinearGradient 
                colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.15)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: 'absolute', width: 26, height: 22, top: 7, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }} 
              />
              <FontAwesome name="subway" size={36} color={primaryColor} style={{ lineHeight: 36, textAlign: 'center' }} />
              <View style={styles.brandPlayOverlay}>
                <FontAwesome name="play" size={11} color="rgba(255,255,255,0.85)" />
              </View>
            </View>
            <View style={{ marginLeft: 8 }}>
              <AppText style={[styles.logoTitle, { color: '#e2dbf0', fontFamily: fontBold }]}>Trạm Phim</AppText>
              <AppText style={[styles.logoSub, { color: 'rgba(255,255,255,0.7)', fontFamily: fontRegular }]}>Trạm dừng của những mọt phim</AppText>
            </View>
          </View>
          
          {/* Nút tiện ích */}
          <View style={styles.headerRight}>
            <Pressable style={styles.iconBtn} onPress={() => {
              if (isSearching) {
                closeSearch();
              } else {
                setIsSearching(true);
              }
            }}>
              <FontAwesome name={isSearching ? "close" : "search"} size={20} color={themeColors.textPrimary} />
            </Pressable>
            <Pressable style={styles.iconBtn}>
              <FontAwesome name="bell-o" size={20} color={themeColors.textPrimary} />
              <View style={[styles.notifDot, { backgroundColor: themeColors.error }]} />
            </Pressable>
          </View>
        </View>

        {/* Ô tìm kiếm mở rộng dính dưới Header */}
        {isSearching && (
          <View style={styles.searchBarWrapper}>
            <LinearGradient
              colors={themeMode === 'light' 
                ? ['rgba(240,240,245,0.95)', 'rgba(230,230,235,0.9)'] 
                : ['rgba(30,30,35,0.95)', 'rgba(20,20,25,0.9)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.searchBar, { borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }]}
            >
              <FontAwesome name="search" size={16} color={themeMode === 'light' ? '#333' : '#fff'} style={{ opacity: 0.7 }} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.textPrimary, fontFamily: fontRegular }]}
                placeholder="Nhập tên phim, diễn viên..."
                placeholderTextColor={themeMode === 'light' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)'}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                selectionColor={primaryColor}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                  <View style={[styles.clearIconBg, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)' }]}>
                    <FontAwesome name="times" size={10} color={themeMode === 'light' ? '#fff' : '#000'} />
                  </View>
                </Pressable>
              )}
            </LinearGradient>
          </View>
        )}
        </View>
      </View>

      {/* ===== MODAL THỂ LOẠI ===== */}
      <Modal
        visible={isCategoryModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCategoryModalVisible(false)}>
          <LinearGradient
            colors={themeMode === 'light' 
              ? ['rgba(240,240,245,0.98)', 'rgba(230,230,235,0.95)'] 
              : ['rgba(35,35,45,0.98)', 'rgba(25,25,32,0.95)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.modalContent, { paddingBottom: insets.bottom > 0 ? insets.bottom : 20 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <AppText style={[styles.modalTitle, { color: themeColors.textPrimary, fontFamily: fontBold }]}>Chọn Thể Loại</AppText>
              <Pressable onPress={() => setCategoryModalVisible(false)}>
                <FontAwesome name="close" size={24} color={themeColors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.categoryGrid}>
                {usedCategories.map((cat, index) => (
                  <Pressable 
                    key={cat.id} 
                    style={[styles.categoryItem, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.3)', borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)' }]}
                    onPress={() => {
                      setCategoryModalVisible(false);
                      router.push(`/filter?category=${cat.id}`);
                    }}
                  >
                    <AppText style={[styles.categoryText, { color: themeColors.textPrimary, fontFamily: fontSemiBold }]}>{cat.name}</AppText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </LinearGradient>
        </Pressable>
      </Modal>

      {/* Nút Đầu Trang */}
      {showScrollTop && (
        <Pressable style={styles.scrollTopBtn} onPress={scrollToTop}>
          <Ionicons name="arrow-up" size={18} color="#000" style={styles.scrollTopIcon} />
          <Text style={styles.scrollTopText}>ĐẦU</Text>
          <Text style={styles.scrollTopText}>TRANG</Text>
        </Pressable>
      )}

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
    backgroundColor: '#121215',
  },
  
  /* ===== STICKY HEADER ===== */
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  logoRow: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  brandIconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2, // icon play hơi lệch trái do hình dạng tam giác
  },
  logoTitle: { 
    color: '#fff', 
    fontSize: 20, 
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  logoSub: { 
    color: 'rgba(255,255,255,0.7)', 
    fontSize: 10, 
    marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerRight: { 
    flexDirection: 'row', 
    gap: 16 
  },
  iconBtn: { 
    padding: 6,
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.error,
  },

  /* ===== CHIPS ===== */
  chipContainer: { 
    flexDirection: 'row',
    justifyContent: 'space-between', // Trải đều 4 nút trên 1 hàng
    paddingHorizontal: 16, 
    marginTop: 10,
  },
  chip: { 
    paddingHorizontal: 12, // Ép padding nhỏ lại một chút để đảm bảo vừa trên màn hình hẹp
    paddingVertical: 6, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipActive: { 
    backgroundColor: '#fff', 
    borderColor: '#fff' 
  },
  chipText: { 
    color: '#fff', 
    fontSize: 12, 
  },
  chipTextActive: { 
    color: '#000', 
    fontSize: 12, 
  },

  /* ===== SECTIONS ===== */
  sectionHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    marginTop: 10, 
    marginBottom: 16 
  },
  sectionTitle: { 
    fontSize: 20, 
    color: '#fff' 
  },
  grid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    paddingHorizontal: 16, 
    gap: 8 
  },

  /* ===== MODAL ===== */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center', // Căn giữa cho đẹp nếu dòng cuối bị dư
    padding: 20,
    gap: 12,
  },
  categoryItem: {
    flexGrow: 1, // Kéo giãn thông minh lấp đầy khoảng trống ngang
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },

  /* ===== SEARCH THÊM VÀO ===== */
  searchBarWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 18,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
  },
  clearIconBg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60, // Kéo lên tí để tránh bàn phím
  },
  searchEmptyText: {
    fontSize: 15,
  },
  searchOverlayWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 90, // Phải nhỏ hơn zIndex của stickyHeader (100)
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  searchBottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  dragHandleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  scrollTopBtn: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 99,
  },
  scrollTopIcon: {
    marginBottom: -2,
  },
  scrollTopText: {
    fontSize: 8,
    fontFamily: 'Montserrat-Bold',
    color: '#000',
    lineHeight: 9,
  },
});
