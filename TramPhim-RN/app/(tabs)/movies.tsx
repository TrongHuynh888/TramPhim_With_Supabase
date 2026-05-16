import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, ScrollView, Pressable, SafeAreaView, TextInput, Platform, Keyboard, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useMovieStore } from '../../stores/useMovieStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { MovieCard } from '../../components/MovieCard';
import { Ionicons } from '@expo/vector-icons';
import { removeDiacritics } from '../../utils/helpers';
import { LinearGradient } from 'expo-linear-gradient';
import MovieDetailPopup from '../../components/MovieDetailPopup';
import { Movie } from '../../stores/useMovieStore';

// Số phim mỗi trang
const PAGE_SIZE = 60;

export default function MoviesScreen() {
  const { primaryColor, themeColors, themeMode } = useThemeStore();
  const { allMovies, allCategories, allCountries } = useMovieStore();
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const flatListRef = useRef<FlatList>(null);
  const [goToPageInput, setGoToPageInput] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // === State Bộ Lọc ===
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterCountry, setFilterCountry] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [filterVersion, setFilterVersion] = useState<string | null>(null);
  const [filterSort, setFilterSort] = useState<string>('newest');
  // Section nào đang mở trong popup
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  // State cho popup chi tiết phim kiểu Netflix
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Trích xuất quốc gia từ bảng countries + country_id của phim
  const availableCountries = useMemo(() => {
    // Lấy tất cả country_id có trong dữ liệu phim
    const usedIds = new Set<string>();
    allMovies.forEach(m => {
      if (m.country_id) usedIds.add(m.country_id.toLowerCase());
      if (m.country) usedIds.add(m.country.toLowerCase());
    });
    // Map sang tên quốc gia từ bảng countries
    const result: { id: string; name: string }[] = [];
    allCountries.forEach(c => {
      const cId = (c.id || '').toLowerCase();
      const cCode = (c.code || '').toLowerCase();
      const cName = (c.name || '').toLowerCase();
      if (usedIds.has(cId) || usedIds.has(cCode) || usedIds.has(cName)) {
        result.push({ id: c.id, name: c.name });
      }
    });
    // Nếu không match được từ bảng, lấy trực tiếp từ trường country
    if (result.length === 0) {
      const names = new Set<string>();
      allMovies.forEach(m => { if (m.country) names.add(m.country); });
      return Array.from(names).sort().map(n => ({ id: n, name: n }));
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [allMovies, allCountries]);

  // Trích xuất năm sản xuất từ dữ liệu phim
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    allMovies.forEach(m => { if (m.year) years.add(String(m.year)); });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [allMovies]);

  // Chỉ hiện thể loại có phim sử dụng
  const usedCategories = useMemo(() => {
    const usedIds = new Set<string>();
    allMovies.forEach(m => {
      const cats = m.categories || (m.category ? [m.category] : []);
      cats.forEach(c => usedIds.add(c.toLowerCase()));
    });
    return allCategories.filter(cat => usedIds.has(cat.id.toLowerCase()));
  }, [allMovies, allCategories]);

  // Debounce 300ms cho tìm kiếm
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  // Reset về trang 1 khi query thay đổi
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedQuery]);

  // === Hàm lọc phụ trợ: áp dụng tất cả filter NGOẠI TRỪ 1 filter cụ thể ===
  const applyFiltersExcept = useCallback((exclude: string) => {
    let result = allMovies;
    if (exclude !== 'country' && filterCountry) {
      const fc = filterCountry.toLowerCase();
      result = result.filter(m => (m.country_id || '').toLowerCase() === fc || (m.country || '').toLowerCase() === fc);
    }
    if (exclude !== 'type' && filterType) {
      result = result.filter(m => m.type === filterType);
    }
    if (exclude !== 'category' && filterCategory.length > 0) {
      const selectedIds = filterCategory.map(name => {
        const obj = allCategories.find(c => c.name === name);
        return (obj ? obj.id : name).toLowerCase();
      });
      result = result.filter(m => {
        const cats = (m.categories || (m.category ? [m.category] : [])).map(c => c.toLowerCase());
        return selectedIds.some(id => cats.includes(id));
      });
    }
    if (exclude !== 'year' && filterYear) {
      result = result.filter(m => String(m.year) === filterYear);
    }
    if (exclude !== 'version' && filterVersion) {
      result = result.filter(m => (m.versions || []).some(v => v === filterVersion));
    }
    return result;
  }, [allMovies, allCategories, filterCountry, filterType, filterCategory, filterYear, filterVersion]);

  // === Tính toán các giá trị khả dụng cho từng filter (smart filter) ===
  const smartAvailable = useMemo(() => {
    // Phim sau khi áp dụng tất cả filter trừ section đang xét
    const forCountry = applyFiltersExcept('country');
    const forType = applyFiltersExcept('type');
    const forCategory = applyFiltersExcept('category');
    const forYear = applyFiltersExcept('year');
    const forVersion = applyFiltersExcept('version');

    // Quốc gia khả dụng
    const countryIds = new Set<string>();
    forCountry.forEach(m => { if (m.country_id) countryIds.add(m.country_id.toLowerCase()); });

    // Loại phim khả dụng
    const types = new Set<string>();
    forType.forEach(m => { if (m.type) types.add(m.type); });

    // Thể loại khả dụng (lưu dạng ID)
    const categoryIds = new Set<string>();
    forCategory.forEach(m => {
      const cats = m.categories || (m.category ? [m.category] : []);
      cats.forEach(c => categoryIds.add(c.toLowerCase()));
    });

    // Năm khả dụng
    const years = new Set<string>();
    forYear.forEach(m => { if (m.year) years.add(String(m.year)); });

    // Phiên bản khả dụng
    const versions = new Set<string>();
    forVersion.forEach(m => { (m.versions || []).forEach(v => versions.add(v)); });

    return { countryIds, types, categoryIds, years, versions };
  }, [applyFiltersExcept]);

  // Lọc phim theo bộ lọc + tìm kiếm
  const filteredMovies = useMemo(() => {
    let result = allMovies;
    
    // Lọc theo quốc gia (so khớp cả country_id và country)
    if (filterCountry) {
      const fcLower = filterCountry.toLowerCase();
      result = result.filter(m => 
        (m.country_id || '').toLowerCase() === fcLower || 
        (m.country || '').toLowerCase() === fcLower
      );
    }
    // Lọc theo loại phim
    if (filterType) {
      result = result.filter(m => m.type === filterType);
    }
    // Lọc theo thể loại (multi-select, resolve tên -> ID)
    if (filterCategory.length > 0) {
      const selectedIds = filterCategory.map(name => {
        const obj = allCategories.find(c => c.name === name);
        return (obj ? obj.id : name).toLowerCase();
      });
      result = result.filter(m => {
        const cats = (m.categories || (m.category ? [m.category] : [])).map(c => c.toLowerCase());
        return selectedIds.some(id => cats.includes(id));
      });
    }
    // Lọc theo năm
    if (filterYear) {
      result = result.filter(m => String(m.year) === filterYear);
    }
    // Lọc theo phiên bản (dùng trường versions[] từ DB)
    if (filterVersion) {
      result = result.filter(m => 
        (m.versions || []).some(v => v === filterVersion)
      );
    }
    // Lọc theo tìm kiếm
    if (debouncedQuery.trim()) {
      const query = removeDiacritics(debouncedQuery.toLowerCase().trim());
      result = result.filter(m => {
        const title = removeDiacritics(m.title?.toLowerCase() || '');
        const originTitle = removeDiacritics(m.originTitle?.toLowerCase() || '');
        const cast = removeDiacritics(m.cast?.toLowerCase() || '');
        return title.includes(query) || originTitle.includes(query) || cast.includes(query);
      });
    }
    // Sắp xếp kết quả
    if (filterSort === 'newest') {
      result = [...result].sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    } else if (filterSort === 'oldest') {
      result = [...result].sort((a, b) => Number(a.year || 0) - Number(b.year || 0));
    } else if (filterSort === 'views') {
      result = [...result].sort((a, b) => (b.views || 0) - (a.views || 0));
    }
    return result;
  }, [allMovies, allCategories, filterCountry, filterType, filterCategory, filterYear, filterVersion, filterSort, debouncedQuery]);

  // Tính tổng số trang
  const totalPages = useMemo(() => {
    return Math.ceil(filteredMovies.length / PAGE_SIZE);
  }, [filteredMovies.length]);

  // Cắt dữ liệu theo trang hiện tại
  const pagedMovies = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredMovies.slice(start, end);
  }, [filteredMovies, currentPage]);

  // Reset toàn bộ bộ lọc
  const resetFilters = useCallback(() => {
    setFilterCountry(null);
    setFilterType(null);
    setFilterCategory([]);
    setFilterYear(null);
    setFilterVersion(null);
    setFilterSort('newest');
    setCurrentPage(1);
  }, []);

  // Đếm số bộ lọc đang áp dụng
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterCountry) count++;
    if (filterType) count++;
    if (filterCategory.length > 0) count += filterCategory.length;
    if (filterYear) count++;
    if (filterVersion) count++;
    if (filterSort !== 'newest') count++;
    return count;
  }, [filterCountry, filterType, filterCategory, filterYear, filterVersion, filterSort]);

  // Chuyển trang và cuộn lên đầu
  const goToPage = useCallback((page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    // Cuộn lên đầu danh sách khi chuyển trang
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [totalPages]);

  // Mở popup chi tiết phim khi bấm vào MovieCard
  const handleMoviePress = useCallback((movie: Movie) => {
    setSelectedMovie(movie);
    setIsPopupVisible(true);
  }, []);

  // Tạo danh sách số trang hiển thị (tối đa 3 nút xung quanh trang hiện tại)
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 3;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    // Điều chỉnh lại start nếu end bị giới hạn
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  // Xử lý nhảy tới trang nhập vào
  const handleGoToPage = useCallback(() => {
    const page = parseInt(goToPageInput, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      goToPage(page);
    }
    setGoToPageInput('');
    Keyboard.dismiss();
  }, [goToPageInput, totalPages, goToPage]);

  // Tính vị trí hiển thị (VD: "1-60 / 676")
  const rangeStart = (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredMovies.length);

  // Xử lý scroll để hiện/ẩn nút Đầu Trang
  const handleScroll = useCallback((event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 300);
  }, []);

  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      {/* Ô tìm kiếm + Nút lọc */}
      <View style={styles.searchRow}>
        <LinearGradient
          colors={themeMode === 'light' 
            ? ['rgba(240,240,245,0.95)', 'rgba(230,230,235,0.9)'] 
            : ['rgba(30,30,35,0.95)', 'rgba(20,20,25,0.9)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.searchBar, { borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)', borderWidth: 1 }]}
        >
          <Ionicons name="search" size={18} color={themeColors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.textPrimary }]}
            placeholder="Tìm kiếm phim, diễn viên"
            placeholderTextColor={themeColors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            selectionColor={primaryColor}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
              <View style={[styles.clearBtn, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name="close" size={12} color={themeMode === 'light' ? '#000' : '#fff'} />
              </View>
            </Pressable>
          )}
        </LinearGradient>
        <Pressable onPress={() => setFilterVisible(true)}>
          <LinearGradient
            colors={themeMode === 'light' 
              ? ['rgba(240,240,245,0.95)', 'rgba(230,230,235,0.9)'] 
              : ['rgba(30,30,35,0.95)', 'rgba(20,20,25,0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.filterBtn, { borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)', borderWidth: 1 }]}
          >
            <Ionicons name="options-outline" size={20} color={themeColors.textPrimary} />
            <Text style={[styles.filterBtnText, { color: themeColors.textPrimary }]}>Lọc</Text>
            {activeFilterCount > 0 && (
              <View style={[styles.filterBadge, { backgroundColor: primaryColor }]}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </LinearGradient>
        </Pressable>
      </View>




      {/* Thông tin số lượng */}
      <View style={styles.headerInfo}>
        <Text style={[styles.resultsCount, { color: themeColors.textMuted }]}>
          Hiển thị {rangeStart}-{rangeEnd} / {filteredMovies.length} phim
        </Text>
      </View>

      {/* Danh sách Phim dạng Lưới (Grid) - Chỉ load trang hiện tại */}
      <FlatList
        ref={flatListRef}
        data={pagedMovies}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={({ item }) => <MovieCard movie={item} onPress={handleMoviePress} />}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        removeClippedSubviews={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        // Thanh phân trang ở cuối danh sách
        ListFooterComponent={
          totalPages > 1 ? (
            <View style={styles.paginationWrapper}>
              {/* Chỉ báo trang hiện tại */}
              <Text style={[styles.pageIndicator, { color: themeColors.textMuted }]}>
                Trang {currentPage}/{totalPages}
              </Text>

              {/* Hàng chính: Nút điều hướng + Nhảy trang */}
              <View style={styles.paginationRow}>
                {/* Nhóm trái: Nút trước + Số trang + Nút tiếp */}
                <View style={styles.navGroup}>
                  <Pressable 
                    onPress={() => goToPage(currentPage - 1)} 
                    disabled={currentPage === 1}
                    style={[
                      styles.navBtn, 
                      { backgroundColor: themeColors.bgTertiary },
                      currentPage === 1 && styles.navBtnDisabled
                    ]}
                  >
                    <Ionicons name="chevron-back" size={16} color={currentPage === 1 ? themeColors.textMuted : themeColors.textPrimary} />
                  </Pressable>

                  {pageNumbers.map(page => (
                    <Pressable
                      key={page}
                      onPress={() => goToPage(page)}
                      style={[
                        styles.pageNumBtn,
                        { backgroundColor: themeColors.bgTertiary },
                        page === currentPage && { backgroundColor: primaryColor }
                      ]}
                    >
                      <Text style={[
                        styles.pageNumText,
                        { color: themeColors.textSecondary },
                        page === currentPage && styles.pageNumActive
                      ]}>
                        {page}
                      </Text>
                    </Pressable>
                  ))}

                  <Pressable 
                    onPress={() => goToPage(currentPage + 1)} 
                    disabled={currentPage === totalPages}
                    style={[
                      styles.navBtn, 
                      { backgroundColor: themeColors.bgTertiary },
                      currentPage === totalPages && styles.navBtnDisabled
                    ]}
                  >
                    <Ionicons name="chevron-forward" size={16} color={currentPage === totalPages ? themeColors.textMuted : themeColors.textPrimary} />
                  </Pressable>
                </View>

                {/* Đường kẻ ngăn cách */}
                <View style={[styles.divider, { backgroundColor: themeColors.bgTertiary }]} />

                {/* Nhóm phải: Nhảy tới trang */}
                <View style={styles.goToGroup}>
                  <TextInput
                    style={[styles.goToInput, { backgroundColor: themeColors.bgTertiary, color: themeColors.textPrimary }]}
                    value={goToPageInput}
                    onChangeText={setGoToPageInput}
                    keyboardType="number-pad"
                    placeholder="#"
                    placeholderTextColor={themeColors.textMuted}
                    maxLength={3}
                    onSubmitEditing={handleGoToPage}
                    returnKeyType="go"
                  />
                  <Pressable
                    onPress={handleGoToPage}
                    style={[styles.goToBtn, { backgroundColor: primaryColor }]}
                  >
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null
        }
      />
      
      {/* Nút Đầu Trang */}
      {showScrollTop && (
        <Pressable style={styles.scrollTopBtn} onPress={scrollToTop}>
          <Ionicons name="arrow-up" size={18} color="#000" style={styles.scrollTopIcon} />
          <Text style={styles.scrollTopText}>ĐẦU</Text>
          <Text style={styles.scrollTopText}>TRANG</Text>
        </Pressable>
      )}

      {/* ===== MODAL BỘ LỌC ===== */}
      <Modal visible={filterVisible} transparent animationType="slide" onRequestClose={() => setFilterVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setFilterVisible(false)}>
          <LinearGradient
            colors={themeMode === 'light' 
              ? ['rgba(240,240,245,0.98)', 'rgba(230,230,235,0.95)'] 
              : ['rgba(35,35,45,0.98)', 'rgba(25,25,32,0.95)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modalContent} 
            onStartShouldSetResponder={() => true}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="options-outline" size={22} color={themeColors.textPrimary} />
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Bộ lọc</Text>
              </View>
              <Pressable onPress={resetFilters} hitSlop={10}>
                <Text style={{ color: primaryColor, fontSize: 13, fontFamily: 'Montserrat-SemiBold' }}>Đặt lại</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }}>
              {/* Quốc gia */}
              <Pressable style={styles.filterRow} onPress={() => toggleSection('country')}>
                <Text style={[styles.filterLabel, { color: themeColors.textPrimary, marginBottom: 0 }]}>Quốc gia:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: primaryColor, fontSize: 13, fontFamily: 'Montserrat-SemiBold' }}>
                    {filterCountry ? availableCountries.find(c => c.id === filterCountry)?.name || 'Tất cả' : 'Tất cả'}
                  </Text>
                  <Ionicons name={expandedSections.has('country') ? 'chevron-up' : 'chevron-down'} size={16} color={primaryColor} />
                </View>
              </Pressable>
              {expandedSections.has('country') && (
                <View style={[styles.chipGroup, { paddingHorizontal: 20, paddingBottom: 12 }]}>
                  {availableCountries.map(c => {
                    const isActive = filterCountry === c.id;
                    const isAvailable = isActive || smartAvailable.countryIds.has(c.id.toLowerCase());
                    return (
                      <Pressable key={c.id} disabled={!isAvailable}
                        onPress={() => setFilterCountry(isActive ? null : c.id)}
                        style={[styles.chip, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.3)', borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)', opacity: isAvailable ? 1 : 0.3 }, isActive && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                        <Text style={[styles.chipText, { color: themeColors.textSecondary }, isActive && { color: '#fff' }]}>{c.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={[styles.separator, { backgroundColor: themeColors.bgTertiary }]} />

              {/* Loại phim */}
              <Pressable style={styles.filterRow} onPress={() => toggleSection('type')}>
                <Text style={[styles.filterLabel, { color: themeColors.textPrimary, marginBottom: 0 }]}>Loại phim:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: primaryColor, fontSize: 13, fontFamily: 'Montserrat-SemiBold' }}>
                    {filterType === 'series' ? 'Phim Bộ' : filterType === 'single' ? 'Phim Lẻ' : 'Tất cả'}
                  </Text>
                  <Ionicons name={expandedSections.has('type') ? 'chevron-up' : 'chevron-down'} size={16} color={primaryColor} />
                </View>
              </Pressable>
              {expandedSections.has('type') && (
                <View style={[styles.chipGroup, { paddingHorizontal: 20, paddingBottom: 12 }]}>
                  {[{ label: 'Phim Bộ', value: 'series' }, { label: 'Phim Lẻ', value: 'single' }].map(opt => {
                    const isActive = filterType === opt.value;
                    const isAvailable = isActive || smartAvailable.types.has(opt.value);
                    return (
                      <Pressable key={opt.label} disabled={!isAvailable}
                        onPress={() => setFilterType(isActive ? null : opt.value)}
                        style={[styles.chip, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.3)', borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)', opacity: isAvailable ? 1 : 0.3 }, isActive && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                        <Text style={[styles.chipText, { color: themeColors.textSecondary }, isActive && { color: '#fff' }]}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={[styles.separator, { backgroundColor: themeColors.bgTertiary }]} />

              {/* Thể loại */}
              <Pressable style={styles.filterRow} onPress={() => toggleSection('category')}>
                <Text style={[styles.filterLabel, { color: themeColors.textPrimary, marginBottom: 0 }]}>Thể loại:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: primaryColor, fontSize: 13, fontFamily: 'Montserrat-SemiBold' }} numberOfLines={1}>
                    {filterCategory.length > 0 ? filterCategory.join(', ') : 'Tất cả'}
                  </Text>
                  <Ionicons name={expandedSections.has('category') ? 'chevron-up' : 'chevron-down'} size={16} color={primaryColor} />
                </View>
              </Pressable>
              {expandedSections.has('category') && (
                <View style={[styles.chipGroup, { paddingHorizontal: 20, paddingBottom: 12 }]}>
                  {usedCategories.map(cat => {
                    const isActive = filterCategory.includes(cat.name);
                    const isAvailable = isActive || smartAvailable.categoryIds.has(cat.id.toLowerCase());
                    return (
                      <Pressable key={cat.id} disabled={!isAvailable}
                        onPress={() => setFilterCategory(prev => 
                          prev.includes(cat.name) ? prev.filter(c => c !== cat.name) : [...prev, cat.name]
                        )}
                        style={[styles.chip, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.3)', borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)', opacity: isAvailable ? 1 : 0.3 }, isActive && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                        <Text style={[styles.chipText, { color: themeColors.textSecondary }, isActive && { color: '#fff' }]}>{cat.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={[styles.separator, { backgroundColor: themeColors.bgTertiary }]} />

              {/* Phiên bản */}
              <Pressable style={styles.filterRow} onPress={() => toggleSection('version')}>
                <Text style={[styles.filterLabel, { color: themeColors.textPrimary, marginBottom: 0 }]}>Phiên bản:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: primaryColor, fontSize: 13, fontFamily: 'Montserrat-SemiBold' }}>
                    {filterVersion || 'Tất cả'}
                  </Text>
                  <Ionicons name={expandedSections.has('version') ? 'chevron-up' : 'chevron-down'} size={16} color={primaryColor} />
                </View>
              </Pressable>
              {expandedSections.has('version') && (
                <View style={[styles.chipGroup, { paddingHorizontal: 20, paddingBottom: 12 }]}>
                  {[{ label: 'Vietsub', value: 'Vietsub' }, { label: 'Lồng tiếng', value: 'Lồng tiếng' }, { label: 'Thuyết minh', value: 'Thuyết minh' }].map(opt => {
                    const isActive = filterVersion === opt.value;
                    const isAvailable = isActive || smartAvailable.versions.has(opt.value);
                    return (
                      <Pressable key={opt.label} disabled={!isAvailable}
                        onPress={() => setFilterVersion(isActive ? null : opt.value)}
                        style={[styles.chip, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.3)', borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)', opacity: isAvailable ? 1 : 0.3 }, isActive && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                        <Text style={[styles.chipText, { color: themeColors.textSecondary }, isActive && { color: '#fff' }]}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={[styles.separator, { backgroundColor: themeColors.bgTertiary }]} />

              {/* Năm sản xuất */}
              <Pressable style={styles.filterRow} onPress={() => toggleSection('year')}>
                <Text style={[styles.filterLabel, { color: themeColors.textPrimary, marginBottom: 0 }]}>Năm sản xuất:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: primaryColor, fontSize: 13, fontFamily: 'Montserrat-SemiBold' }}>
                    {filterYear || 'Tất cả'}
                  </Text>
                  <Ionicons name={expandedSections.has('year') ? 'chevron-up' : 'chevron-down'} size={16} color={primaryColor} />
                </View>
              </Pressable>
              {expandedSections.has('year') && (
                <View style={[styles.chipGroup, { paddingHorizontal: 20, paddingBottom: 12 }]}>
                  {availableYears.map(y => {
                    const isActive = filterYear === y;
                    const isAvailable = isActive || smartAvailable.years.has(y);
                    return (
                      <Pressable key={y} disabled={!isAvailable}
                        onPress={() => setFilterYear(isActive ? null : y)}
                        style={[styles.chip, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.3)', borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)', opacity: isAvailable ? 1 : 0.3 }, isActive && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                        <Text style={[styles.chipText, { color: themeColors.textSecondary }, isActive && { color: '#fff' }]}>{y}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={[styles.separator, { backgroundColor: themeColors.bgTertiary }]} />

              {/* Sắp xếp */}
              <Pressable style={styles.filterRow} onPress={() => toggleSection('sort')}>
                <Text style={[styles.filterLabel, { color: themeColors.textPrimary, marginBottom: 0 }]}>Sắp xếp:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: primaryColor, fontSize: 13, fontFamily: 'Montserrat-SemiBold' }}>
                    {filterSort === 'newest' ? 'Mới nhất' : filterSort === 'oldest' ? 'Cũ nhất' : 'Xem nhiều'}
                  </Text>
                  <Ionicons name={expandedSections.has('sort') ? 'chevron-up' : 'chevron-down'} size={16} color={primaryColor} />
                </View>
              </Pressable>
              {expandedSections.has('sort') && (
                <View style={[styles.chipGroup, { paddingHorizontal: 20, paddingBottom: 12 }]}>
                  {[{ label: 'Mới nhất', value: 'newest' }, { label: 'Cũ nhất', value: 'oldest' }, { label: 'Xem nhiều', value: 'views' }].map(opt => (
                    <Pressable key={opt.value} onPress={() => setFilterSort(opt.value)}
                      style={[styles.chip, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.3)', borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)' }, filterSort === opt.value && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                      <Text style={[styles.chipText, { color: themeColors.textSecondary }, filterSort === opt.value && { color: '#fff' }]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>

            {/* Nút Lọc kết quả */}
            <Pressable style={[styles.applyBtn, { borderColor: themeColors.textPrimary }]} onPress={() => { setCurrentPage(1); setFilterVisible(false); }}>
              <Text style={[styles.applyBtnText, { color: themeColors.textPrimary }]}>Lọc kết quả</Text>
            </Pressable>
          </LinearGradient>
        </Pressable>
      </Modal>

      {/* Popup chi tiết phim kiểu Netflix */}
      <MovieDetailPopup
        visible={isPopupVisible}
        movie={selectedMovie}
        onClose={() => setIsPopupVisible(false)}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // === Ô tìm kiếm + Nút lọc ===
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Montserrat-Regular',
  },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 6,
  },
  filterBtnText: {
    fontSize: 13,
    fontFamily: 'Montserrat-SemiBold',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Montserrat-Bold',
  },
  filterContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  activeChip: {
  },
  filterText: {
    fontSize: 13,
    fontFamily: 'Montserrat-SemiBold',
  },
  activeFilterText: {
    color: '#fff',
  },
  headerInfo: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultsCount: {
    fontSize: 12,
    fontFamily: 'Montserrat-Regular',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  // === Styles phân trang ===
  paginationWrapper: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 10,
  },
  pageIndicator: {
    fontSize: 12,
    fontFamily: 'Montserrat-Regular',
    letterSpacing: 0.5,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  pageNumBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageNumText: {
    fontSize: 13,
    fontFamily: 'Montserrat-SemiBold',
  },
  pageNumActive: {
    color: '#fff',
  },
  divider: {
    width: 1,
    height: 24,
    borderRadius: 1,
    opacity: 0.4,
  },
  goToGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  goToInput: {
    width: 44,
    height: 36,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Montserrat-SemiBold',
  },
  goToBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
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
  // === Modal Bộ Lọc ===
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    height: '85%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
  },
  filterSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontFamily: 'Montserrat-Bold',
    marginBottom: 10,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'Montserrat-SemiBold',
  },
  separator: {
    height: 1,
    marginHorizontal: 20,
    opacity: 0.3,
  },
  applyBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
  },
});
