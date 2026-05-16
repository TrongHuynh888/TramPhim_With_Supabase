import { AppText } from '../components/AppText';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Colors } from '../theme/colors';
import { Movie } from '../stores/useMovieStore';
import { useThemeStore } from '../stores/useThemeStore';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = width * 0.48;
const ITEM_SPACING = (width - ITEM_WIDTH) / 2;

interface BannerCarouselProps {
  movies: Movie[];
  onActiveMovieChange?: (movie: Movie) => void;
  children?: React.ReactNode; // Nội dung tuỳ chỉnh (chips) nằm trên nền banner
}

export function BannerCarousel({ movies, onActiveMovieChange, children }: BannerCarouselProps) {
  const router = useRouter();
  const primaryColor = useThemeStore(s => s.primaryColor);
  const dataLen = movies.length;
  
  // Nhân 3 bản sao dữ liệu để tạo vòng lặp vô hạn: [copy1, copy2_gốc, copy3]
  const loopData = [...movies, ...movies, ...movies];
  
  // Bắt đầu cuộn từ bản copy giữa (index = dataLen)
  const startIndex = dataLen;
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  
  const scrollX = useRef(new Animated.Value(startIndex * ITEM_WIDTH)).current;
  const flatListRef = useRef<Animated.FlatList>(null);
  const isAutoScrolling = useRef(false);

  // Lấy index thực (0 -> dataLen-1) từ index trong mảng nhân 3
  const getRealIndex = useCallback((idx: number) => {
    return ((idx % dataLen) + dataLen) % dataLen;
  }, [dataLen]);

  const activeMovie = movies[getRealIndex(currentIndex)] || movies[0];

  // Thông báo ra ngoài khi phim active thay đổi
  useEffect(() => {
    if (activeMovie && onActiveMovieChange) {
      onActiveMovieChange(activeMovie);
    }
  }, [activeMovie?.id]);

  // Khởi tạo: Cuộn tới vị trí bản copy giữa ngay khi mount (không animation)
  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ 
        offset: startIndex * ITEM_WIDTH, 
        animated: false 
      });
    }, 100);
  }, []);

  // Auto-Scroll: Luôn cuộn tiến về phía trước
  useEffect(() => {
    if (!movies || movies.length <= 1) return;
    const interval = setInterval(() => {
      isAutoScrolling.current = true;
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToOffset({ 
        offset: nextIndex * ITEM_WIDTH, 
        animated: true 
      });
      
      // Sau khi animation xong (~400ms), kiểm tra xem có cần reset về giữa không
      setTimeout(() => {
        isAutoScrolling.current = false;
        // Nếu đã cuộn quá bản copy thứ 3, reset lại về bản copy giữa
        if (nextIndex >= dataLen * 2) {
          const resetIndex = dataLen + getRealIndex(nextIndex);
          setCurrentIndex(resetIndex);
          flatListRef.current?.scrollToOffset({ 
            offset: resetIndex * ITEM_WIDTH, 
            animated: false // Dịch chuyển tức thì, người dùng không nhận ra
          });
        }
      }, 450);
    }, 4000);
    return () => clearInterval(interval);
  }, [currentIndex, movies.length]);

  // Xử lý khi người dùng vuốt tay
  const handleScrollEnd = useCallback((e: any) => {
    if (isAutoScrolling.current) return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const idx = Math.round(offsetX / ITEM_WIDTH);
    setCurrentIndex(idx);

    // Reset về bản copy giữa nếu lệch sang 2 đầu
    if (idx < dataLen * 0.5 || idx >= dataLen * 2.5) {
      const resetIndex = dataLen + getRealIndex(idx);
      setTimeout(() => {
        setCurrentIndex(resetIndex);
        flatListRef.current?.scrollToOffset({ 
          offset: resetIndex * ITEM_WIDTH, 
          animated: false 
        });
      }, 50);
    }
  }, [dataLen, getRealIndex]);

  if (!movies || movies.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* 1. BACKGROUND đồng bộ */}
      <Image 
        source={activeMovie.posterUrl} 
        style={styles.bgImage} 
        blurRadius={25}
        transition={500}
      />
      <LinearGradient 
        colors={['rgba(18,18,21,0.05)', 'rgba(18,18,21,0.75)', '#121215']} 
        locations={[0, 0.65, 1]} 
        style={styles.gradient} 
      />

      {/* Nội dung tuỳ chỉnh từ bên ngoài (ví dụ: filter chips) */}
      {children}

      {/* 3. CAROUSEL (Infinite Loop) */}
      <View style={styles.carouselWrapper}>
        <Animated.FlatList
          ref={flatListRef}
          data={loopData}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: ITEM_SPACING }}
          getItemLayout={(_data, index) => ({
            length: ITEM_WIDTH,
            offset: ITEM_WIDTH * index,
            index,
          })}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }], 
            { useNativeDriver: true }
          )}
          onMomentumScrollEnd={handleScrollEnd}
          keyExtractor={(_item, index) => `loop-${index}`}
          renderItem={({ item, index }) => {
            const inputRange = [
              (index - 1) * ITEM_WIDTH, 
              index * ITEM_WIDTH, 
              (index + 1) * ITEM_WIDTH
            ];
            const scale = scrollX.interpolate({ 
              inputRange, outputRange: [0.8, 1, 0.8], extrapolate: 'clamp' 
            });
            const opacity = scrollX.interpolate({ 
              inputRange, outputRange: [0.4, 1, 0.4], extrapolate: 'clamp' 
            });
            const rotateY = scrollX.interpolate({
              inputRange, outputRange: ['25deg', '0deg', '-25deg'], extrapolate: 'clamp'
            });
            const translateY = scrollX.interpolate({
              inputRange, outputRange: [15, 0, 15], extrapolate: 'clamp'
            });

            return (
              <View style={{ width: ITEM_WIDTH, alignItems: 'center', justifyContent: 'center' }}>
                <Pressable onPress={() => {
                  const realIdx = getRealIndex(index);
                  if (getRealIndex(currentIndex) !== realIdx) {
                    setCurrentIndex(index);
                    flatListRef.current?.scrollToOffset({ offset: index * ITEM_WIDTH, animated: true });
                  } else {
                    router.push(`/movie/${item.id}`);
                  }
                }}>
                  <Animated.View style={[
                    styles.posterWrapper, 
                    { 
                      transform: [
                        { perspective: 800 },
                        { rotateY },
                        { scale },
                        { translateY }
                      ], 
                      opacity 
                    }
                  ]}>
                    <Image source={item.posterUrl} style={styles.poster} contentFit="cover" />
                  </Animated.View>
                </Pressable>
              </View>
            );
          }}
        />
      </View>

      {/* 4. THÔNG TIN PHIM */}
      <View style={styles.infoBox}>
        <AppText style={styles.title} numberOfLines={1}>{activeMovie.title}</AppText>
        <AppText style={styles.subTitle} numberOfLines={1}>
          {activeMovie.originTitle || activeMovie.title}
        </AppText>

        <View style={styles.actionRow}>
          <Pressable 
            style={({ pressed }) => [styles.btnPlay, { backgroundColor: primaryColor, opacity: pressed ? 0.8 : 1 }]} 
            onPress={() => router.push(`/movie/watch/${activeMovie.id}`)}
          >
            <FontAwesome name="play" size={14} color="#fff" style={{ marginRight: 8 }} />
            <AppText style={styles.btnPlayText}>Xem Phim</AppText>
          </Pressable>
          <Pressable 
            style={({ pressed }) => [styles.btnInfo, { opacity: pressed ? 0.8 : 1 }]} 
            onPress={() => router.push(`/movie/${activeMovie.id}`)}
          >
            <FontAwesome name="info-circle" size={16} color="#000" style={{ marginRight: 8 }} />
            <AppText style={styles.btnInfoText}>Thông tin</AppText>
          </Pressable>
        </View>

        <View style={styles.tagsRow}>
          {activeMovie.imdbRating && (
            <View style={styles.outlineTag}>
              <AppText style={styles.imdbLabel}>IMDb</AppText>
              <AppText style={styles.whiteText}> {activeMovie.imdbRating}</AppText>
            </View>
          )}
          {activeMovie.ageLimit && (
            <View style={styles.outlineTag}>
              <AppText style={styles.whiteText}>{activeMovie.ageLimit}</AppText>
            </View>
          )}
          {activeMovie.year && (
            <View style={styles.outlineTag}>
              <AppText style={styles.whiteText}>{activeMovie.year}</AppText>
            </View>
          )}
          <View style={styles.outlineTag}>
            <AppText style={styles.whiteText}>{activeMovie.type === 'series' ? 'Phim Bộ' : 'Phim Lẻ'}</AppText>
          </View>
          {activeMovie.quality && (
            <View style={styles.outlineTag}>
              <AppText style={styles.whiteText}>{activeMovie.quality}</AppText>
            </View>
          )}
        </View>

        <AppText style={styles.desc} numberOfLines={1}>
          {activeMovie.description || "Chưa có mô tả cho phim này."}
        </AppText>

        {/* Pagination - Chỉ hiển thị đúng số lượng phim thực tế */}
        <View style={styles.dotsRow}>
          {movies.map((_, i) => (
            <View key={i} style={[styles.dot, i === getRealIndex(currentIndex) && styles.dotActive]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', position: 'relative', paddingBottom: 24, paddingTop: 30 },
  bgImage: { 
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
    width: '100%', height: '100%', opacity: 0.85
  },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  
  carouselWrapper: { height: ITEM_WIDTH * 1.65, marginVertical: 10, justifyContent: 'center' },
  posterWrapper: { 
    width: ITEM_WIDTH, aspectRatio: 2/3, borderRadius: 12, overflow: 'hidden', 
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    elevation: 10, shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.8, shadowRadius: 15,
  },
  poster: { width: '100%', height: '100%' },

  infoBox: { alignItems: 'center', paddingHorizontal: 20, marginTop: 10 },
  title: { color: '#fff', fontSize: 26, fontFamily: 'Montserrat-Bold', textAlign: 'center', marginBottom: 4 },
  subTitle: { color: '#aaa', fontSize: 14, fontFamily: 'Montserrat-Regular', textAlign: 'center', marginBottom: 20 },

  actionRow: { flexDirection: 'row', gap: 12, width: '100%', justifyContent: 'center', marginBottom: 24 },
  btnPlay: { flex: 1, backgroundColor: '#4db8ff', flexDirection: 'row', paddingVertical: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, 
  btnPlayText: { color: '#fff', fontFamily: 'Montserrat-Bold', fontSize: 15 },
  btnInfo: { flex: 1, backgroundColor: '#fff', flexDirection: 'row', paddingVertical: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, 
  btnInfoText: { color: '#000', fontFamily: 'Montserrat-Bold', fontSize: 15 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 },
  outlineTag: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row' },
  yellowText: { color: '#f5c518', fontFamily: 'Montserrat-SemiBold', fontSize: 12 },
  imdbLabel: { color: '#f5c518', fontFamily: 'Montserrat-Bold', fontSize: 12 },
  whiteText: { color: '#fff', fontFamily: 'Montserrat-SemiBold', fontSize: 12 },

  desc: { color: '#ccc', fontSize: 13, fontFamily: 'Montserrat-Regular', textAlign: 'center', marginBottom: 24 },

  dotsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { width: 24, backgroundColor: '#fff' },
});
