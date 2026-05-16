import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Dimensions, StatusBar, Platform, Modal, Alert } from 'react-native';
import { AppText } from '../../../components/AppText';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';

// Import WebVideoPlayer cho Web (hls.js)
let WebVideoPlayer: any = null;
if (Platform.OS === 'web') {
  WebVideoPlayer = require('../../../components/WebVideoPlayer').WebVideoPlayer;
}

import { useMovieStore } from '../../../stores/useMovieStore';
import { useMovieEpisodes } from '../../../hooks/useMovieEpisodes';
import { useThemeStore } from '../../../stores/useThemeStore';
import { Colors } from '../../../theme/colors';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../stores/useAuthStore';
import AlbumModal from '../../../components/AlbumModal';
import { MovieComments } from '../../../components/MovieComments';
import { useRef } from 'react';

const { width } = Dimensions.get('window');

export default function WatchScreen() {
  const { id, ep, t } = useLocalSearchParams<{ id: string; ep?: string; t?: string }>();
  const router = useRouter();
  const { allMovies, allCategories } = useMovieStore();
  const { episodes, episodeNumbers, isLoading, loadEpisodePage } = useMovieEpisodes(id);
  const user = useAuthStore(state => state.user);

  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  // Trang xem phim cần tải toàn bộ episodes (để chuyển tập nhanh)
  useEffect(() => {
    if (episodeNumbers.length > 0 && episodes.length === 0) {
      loadEpisodePage(episodeNumbers);
    }
  }, [episodeNumbers, episodes.length, loadEpisodePage]);
  const { primaryColor, themeColors, themeMode } = useThemeStore();
  
  // Dùng ep param nếu có, mặc định là 0
  const initialEpIndex = ep ? parseInt(ep, 10) : 0;
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(initialEpIndex);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [selectedLabel, setSelectedLabel] = useState<string>('');

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

  // Toggles state
  const [autoNext, setAutoNext] = useState(true);
  const [autoServer, setAutoServer] = useState(true);

  // Tập Ranges
  const [selectedEpRangeIndex, setSelectedEpRangeIndex] = useState(0);
  const [isRangeModalVisible, setRangeModalVisible] = useState(false);

  const movie = useMemo(() => allMovies.find(m => m.id === id), [id, allMovies]);

  // Phân trang tập nếu > 20 tập
  const EP_PER_RANGE = 30;
  const epRanges = useMemo(() => {
    if (episodes.length <= 20) return []; // Nếu <= 20 tập thì không chia
    const ranges = [];
    for (let i = 0; i < episodes.length; i += EP_PER_RANGE) {
      const endIdx = Math.min(i + EP_PER_RANGE, episodes.length) - 1;
      const startEpNum = episodes[i]?.episode_number || (i + 1);
      const endEpNum = episodes[endIdx]?.episode_number || (endIdx + 1);
      ranges.push({
        label: `Tập ${startEpNum} - ${endEpNum}`,
        start: i,
        end: endIdx,
      });
    }
    return ranges;
  }, [episodes]);

  useEffect(() => {
    if (epRanges.length > 0) {
      const rangeIdx = Math.floor(currentEpisodeIndex / EP_PER_RANGE);
      setSelectedEpRangeIndex(rangeIdx);
    }
  }, [currentEpisodeIndex, epRanges.length]);

  const displayedEpisodes = useMemo(() => {
    if (epRanges.length === 0) return episodes;
    const range = epRanges[selectedEpRangeIndex] || epRanges[0];
    return episodes.slice(range.start, range.end + 1);
  }, [episodes, epRanges, selectedEpRangeIndex]);

  // Resolve tên thể loại
  const categoryNames = useMemo(() => {
    if (!movie) return [];
    const cats = movie.categories?.length ? movie.categories : (movie.category ? [movie.category] : []);
    return cats.map((catId: string) => {
      const s = String(catId).trim().toLowerCase();
      const f = allCategories.find(c => c.id.toLowerCase() === s || c.name.toLowerCase() === s);
      return f ? f.name : catId;
    });
  }, [movie, allCategories]);

  // Seasons (giống web renderMoviePartsSeries)
  const seasons = useMemo(() => {
    if (!movie) return [];
    const hasSeries = movie.seriesId && movie.seriesId.trim() !== '';
    const hasPart = movie.part && String(movie.part).trim() !== '' && String(movie.part) !== '(Trống)';
    if (!hasPart && !hasSeries) return [];
    let list: typeof allMovies = [];
    if (hasSeries) { list = allMovies.filter(m => m.seriesId === movie.seriesId); }
    else { const b = movie.title.split(':')[0].split('-')[0].trim().replace(/(\s+)(\d+|I|II|III|IV|V)+$/i,'').trim(); if (b.length>=2) list = allMovies.filter(m => m.title.toLowerCase().includes(b.toLowerCase())); }
    if (list.length <= 1) return [];
    list.sort((a,b)=>{ const n=(m:any)=>{const x=(String(m?.part||'')||m?.title||'').match(/\d+/);return x?parseInt(x[0]):0;}; return n(a)-n(b); });
    return list;
  }, [movie, allMovies]);

  // Phim đề xuất (giống web renderRecommendedMovies)
  const recommendedMovies = useMemo(() => {
    if (!movie || !allMovies.length) return [];
    const p = (c:any) => { if(!c) return []; if(typeof c==='string') return c.split(',').map((x:string)=>x.trim().toLowerCase()).filter(Boolean); if(Array.isArray(c)) return c.map((x:any)=>String(x).trim().toLowerCase()); return []; };
    const cc = p(movie.categories?.length ? movie.categories : movie.category);
    const ct = p(movie.tags);
    if (!cc.length && !ct.length) return [];
    return allMovies.filter(m=>m.id!==movie.id).map(m=>({m,s:p(m.categories?.length?m.categories:m.category).filter((c:string)=>cc.includes(c)).length+p(m.tags).filter((t:string)=>ct.includes(t)).length})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,15).map(x=>x.m);
  }, [movie, allMovies]);

  // Thứ tự ưu tiên server (giống web detail.js SERVER_ORDER)
  const SERVER_ORDER: Record<string, number> = { 'KKPhim': 1, 'OPhim': 2, 'NguonC': 3 };

  // Lấy danh sách server duy nhất từ episode hiện tại
  const serverList = useMemo(() => {
    if (!episodes || !episodes[currentEpisodeIndex]) return [];
    const ep = episodes[currentEpisodeIndex];
    if (!ep.sources || !Array.isArray(ep.sources)) return [];
    const map = new Map<string, boolean>();
    ep.sources.forEach((s: any) => { map.set(s.server || 'Unknown', true); });
    return [...map.keys()].sort((a, b) => (SERVER_ORDER[a] || 99) - (SERVER_ORDER[b] || 99));
  }, [episodes, currentEpisodeIndex]);

  // Auto-select server đầu tiên khi chưa chọn hoặc server không hợp lệ
  useEffect(() => {
    if (serverList.length > 0 && (!selectedServer || !serverList.includes(selectedServer))) {
      setSelectedServer(serverList[0]);
    }
  }, [serverList]);

  // Lấy danh sách bản chiếu (label) theo server đang chọn
  const labelList = useMemo(() => {
    if (!episodes || !episodes[currentEpisodeIndex] || !selectedServer) return [];
    const ep = episodes[currentEpisodeIndex];
    if (!ep.sources) return [];
    const labels: string[] = [];
    const seen = new Set<string>();
    ep.sources.filter((s: any) => (s.server || 'Unknown') === selectedServer).forEach((s: any) => {
      const label = s.label || 'Bản gốc';
      if (!seen.has(label)) { seen.add(label); labels.push(label); }
    });
    return labels;
  }, [episodes, currentEpisodeIndex, selectedServer]);

  // Auto-select label đầu tiên
  useEffect(() => {
    if (labelList.length > 0 && (!selectedLabel || !labelList.includes(selectedLabel))) {
      setSelectedLabel(labelList[0]);
    }
  }, [labelList]);

  // Tính video URL dựa theo server + label đang chọn
  const currentVideoSource = useMemo(() => {
    if (!episodes || episodes.length === 0 || !episodes[currentEpisodeIndex]) return null;
    const ep = episodes[currentEpisodeIndex];
    if (ep.sources && Array.isArray(ep.sources) && ep.sources.length > 0) {
      // Tìm source khớp server + label
      let match = ep.sources.find((s: any) =>
        (s.server || 'Unknown') === selectedServer && (s.label || 'Bản gốc') === selectedLabel
      );
      // Fallback: lấy source đầu tiên của server
      if (!match) match = ep.sources.find((s: any) => (s.server || 'Unknown') === selectedServer);
      // Fallback cuối: lấy source đầu tiên
      if (!match) match = ep.sources[0];
      let videoUrl = match.source || '';
      if (videoUrl && videoUrl.includes("http") && !videoUrl.startsWith("http")) {
        videoUrl = videoUrl.substring(videoUrl.indexOf("http")).trim();
      }
      return videoUrl;
    }
    return ep.videoSource || ep.youtubeId || null;
  }, [episodes, currentEpisodeIndex, selectedServer, selectedLabel]);

  // Trên web truyền source giả ('') để hook không crash, nhưng ta sẽ render WebVideoPlayer thay thế
  const videoSource = Platform.OS === 'web' ? '' : (currentVideoSource || '');
  const player = useVideoPlayer(videoSource || '', (p: any) => {
    p.loop = false;
    if (Platform.OS !== 'web' && videoSource) {
      if (t && !isNaN(Number(t))) {
        p.currentTime = Number(t);
      }
      p.play();
    }
  });

  const handleWebTimeUpdate = useCallback((time: number, duration: number) => {
    currentTimeRef.current = time;
    durationRef.current = duration;
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !player) return;
    const interval = setInterval(() => {
      currentTimeRef.current = player.currentTime || 0;
      // Note: expo-video duration is not always easily accessible synchronously, 
      // but we grab it if available.
      durationRef.current = (player as any).duration || 0;
    }, 1000);
    return () => clearInterval(interval);
  }, [player]);

  const saveProgress = useCallback(async () => {
    if (!user || !id) return;
    const time = currentTimeRef.current;
    if (time < 5) return;

    try {
      await supabase.from('watch_history').upsert({
        user_id: user.id,
        movie_id: id,
        episode_index: currentEpisodeIndex,
        last_watched_at: new Date().toISOString(),
        resume_time: Math.floor(time),
        duration: Math.floor(durationRef.current || 0)
      }, { onConflict: 'user_id,movie_id' });
      
      // Cập nhật lại lịch sử vào global state để thẻ phim ở trang chủ đồng bộ
      useAuthStore.getState().fetchWatchHistory();
    } catch (e) {
      console.log('Error saving watch history:', e);
    }
  }, [user, id, currentEpisodeIndex]);

  useEffect(() => {
    const interval = setInterval(saveProgress, 10000);
    return () => {
      clearInterval(interval);
      saveProgress();
    };
  }, [saveProgress]);

  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web') {
        try {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } catch (e) {}
      }
    };
  }, []);

  if (!movie) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: 'Lỗi' }} />
        <AppText style={styles.errorText}>Không tìm thấy phim</AppText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle={themeMode === 'light' ? "dark-content" : "light-content"} hidden={false} backgroundColor={themeMode === 'light' ? "#ffffff" : "#000"} />

      {/* Header Tinh Tế */}
      <View style={[styles.header, { backgroundColor: themeColors.bgPrimary }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color={themeColors.textPrimary} />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <AppText style={[styles.headerTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
            {movie.title}
          </AppText>
          <AppText style={[styles.headerSubTitle, { color: primaryColor }]} numberOfLines={1}>
            {movie.originTitle} {movie.type === 'series' ? `- Tập ${currentEpisodeIndex + 1}` : ''}
          </AppText>
        </View>
        <Pressable style={styles.actionBtn}>
          <FontAwesome name="share-alt" size={16} color={themeColors.textPrimary} />
        </Pressable>
      </View>

      {/* Video Player (16:9 chuẩn) - Phân biệt Web vs Native */}
      <View style={styles.playerContainer}>
        {Platform.OS === 'web' ? (
          // Web: Dùng WebVideoPlayer (hls.js) để phát HLS trên Chrome/Edge
          <WebVideoPlayer source={currentVideoSource} isLoading={isLoading} style={styles.video} initialTime={t ? Number(t) : undefined} onTimeUpdate={handleWebTimeUpdate} />
        ) : currentVideoSource && player ? (
          // Native: Dùng expo-video (hỗ trợ HLS native)
          <VideoView
            style={styles.video}
            player={player}
            allowsFullscreen
            allowsPictureInPicture
            contentFit="contain"
            onFullscreenEnter={async () => {
              try {
                await ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
                StatusBar.setHidden(true);
              } catch (e) {}
            }}
            onFullscreenExit={async () => {
              try {
                await ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                StatusBar.setHidden(false);
              } catch (e) {}
            }}
          />
        ) : (
          <View style={styles.loadingVideo}>
            <AppText style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Montserrat-SemiBold' }}>
              {isLoading ? 'Đang tải dữ liệu...' : 'Không tìm thấy nguồn phát'}
            </AppText>
          </View>
        )}
      </View>

      {/* Body Content */}
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
        
        {/* Advanced Toolbar (Wrapped in 2 lines) */}
        <View style={[styles.advancedToolbarContainer, { backgroundColor: themeColors.bgSecondary, borderBottomColor: themeColors.bgTertiary }]}>
          <View style={styles.advancedToolbar}>
            <Pressable 
              style={[styles.toolbarActionBtn, isFavoriteLoading && { opacity: 0.5 }]} 
              onPress={handleToggleFavorite}
              disabled={isFavoriteLoading}
            >
              <FontAwesome name={isFavorite ? "heart" : "heart-o"} size={14} color={isFavorite ? "#ff3b30" : themeColors.textSecondary} />
              <AppText style={[styles.toolbarActionText, { color: isFavorite ? "#ff3b30" : themeColors.textSecondary }]}>Yêu thích</AppText>
            </Pressable>
            <Pressable style={styles.toolbarActionBtn} onPress={handleOpenAlbumModal}>
              <FontAwesome name="plus" size={14} color={themeColors.textSecondary} />
              <AppText style={[styles.toolbarActionText, { color: themeColors.textSecondary }]}>Thêm vào</AppText>
            </Pressable>
            <Pressable style={styles.toolbarSwitchBtn} onPress={() => setAutoNext(!autoNext)}>
              <AppText style={[styles.toolbarActionText, { color: themeColors.textSecondary }]}>Chuyển tập</AppText>
              <View style={[styles.switchBadge, { backgroundColor: themeColors.bgTertiary }, autoNext && [styles.switchBadgeOn, { backgroundColor: `${primaryColor}26` }]]}>
                <AppText style={autoNext ? [styles.switchTextOn, { color: primaryColor }] : [styles.switchTextOff, { color: themeColors.textMuted }]}>{autoNext ? 'ON' : 'OFF'}</AppText>
              </View>
            </Pressable>
            <Pressable style={styles.toolbarActionBtn}>
              <FontAwesome name="users" size={14} color={themeColors.textSecondary} />
              <AppText style={[styles.toolbarActionText, { color: themeColors.textSecondary }]}>Xem chung</AppText>
            </Pressable>
            <Pressable style={styles.toolbarSwitchBtn} onPress={() => setAutoServer(!autoServer)}>
              <AppText style={[styles.toolbarActionText, { color: themeColors.textSecondary }]}>Auto Server</AppText>
              <View style={[styles.switchBadge, { backgroundColor: themeColors.bgTertiary }, autoServer && [styles.switchBadgeOn, { backgroundColor: `${primaryColor}26` }]]}>
                <AppText style={autoServer ? [styles.switchTextOn, { color: primaryColor }] : [styles.switchTextOff, { color: themeColors.textMuted }]}>{autoServer ? 'ON' : 'OFF'}</AppText>
              </View>
            </Pressable>
            <Pressable style={styles.toolbarActionBtn}>
              <FontAwesome name="flag" size={14} color={themeColors.textSecondary} />
              <AppText style={[styles.toolbarActionText, { color: themeColors.textSecondary }]}>Báo lỗi</AppText>
            </Pressable>
          </View>
        </View>



        {/* Danh sách tập */}
        {movie.type === 'series' && episodes.length > 0 && (
          <View style={styles.episodesSection}>
            <View style={styles.sectionHeaderRow}>
              <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Danh sách tập</AppText>
              <AppText style={[styles.epCount, { color: themeColors.textMuted }]}>{episodes.length} Tập</AppText>
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
                             onPress={() => {
                               setSelectedEpRangeIndex(idx);
                               setRangeModalVisible(false);
                             }}
                           >
                             <AppText style={[styles.modalItemText, selectedEpRangeIndex === idx && { color: primaryColor, fontFamily: 'Montserrat-Bold' }]}>
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

            <View style={styles.episodeGrid}>
              {displayedEpisodes.map((ep, mapIdx) => {
                const originalIdx = epRanges.length > 0 ? epRanges[selectedEpRangeIndex].start + mapIdx : mapIdx;
                const isActive = currentEpisodeIndex === originalIdx;
                return (
                  <Pressable
                    key={ep.id || originalIdx}
                    style={[
                      styles.episodeBtn, { backgroundColor: themeColors.bgTertiary, borderColor: themeColors.bgTertiary },
                      isActive && [styles.episodeBtnActive, { backgroundColor: `${primaryColor}26`, borderColor: primaryColor, shadowColor: primaryColor }]
                    ]}
                    onPress={() => setCurrentEpisodeIndex(originalIdx)}
                  >
                    <AppText 
                      style={[
                        styles.episodeText, { color: themeColors.textSecondary },
                        isActive && [styles.episodeTextActive, { color: primaryColor }]
                      ]}
                    >
                      {ep.episode_number || (originalIdx + 1)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        
        {/* Nguồn phát Server (Thực tế từ sources) */}
        {serverList.length > 0 && (
          <View style={styles.serverSection}>
            <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Nguồn phát (Server)</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverRow}>
              {serverList.map((srv, idx) => {
                const isActive = srv === selectedServer;
                const num = SERVER_ORDER[srv] || (idx + 1);
                return (
                  <Pressable key={srv} style={[styles.serverBtn, { borderColor: themeColors.textMuted }, isActive && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setSelectedServer(srv)}>
                    {isActive && <FontAwesome name="check-circle" size={14} color={themeColors.bgPrimary} style={{ marginRight: 6 }} />}
                    <AppText style={isActive ? [styles.serverTextActive, { color: themeColors.bgPrimary }] : [styles.serverText, { color: themeColors.textSecondary }]}>Server {num}</AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Bản chiếu (Vietsub / Thuyết minh) */}
        {labelList.length > 1 && (
          <View style={styles.labelSection}>
            <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Bản chiếu</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverRow}>
              {labelList.map(lb => {
                const isActive = lb === selectedLabel;
                return (
                  <Pressable key={lb} style={[styles.labelBtn, { borderColor: themeColors.textMuted }, isActive && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setSelectedLabel(lb)}>
                    {isActive && <FontAwesome name="check-circle" size={12} color={themeColors.bgPrimary} style={{ marginRight: 5 }} />}
                    <AppText style={isActive ? [styles.serverTextActive, { color: themeColors.bgPrimary }] : [styles.serverText, { color: themeColors.textSecondary }]}>{lb}</AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Chọn Phần / Season */}
        {seasons.length > 0 && (
          <View style={styles.seasonSection}>
            <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Chọn Phần</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverRow}>
              {seasons.map(s => {
                const isActive = s.id === movie.id;
                let partText = String(s.part || '');
                if (!partText || partText === '(Trống)') partText = s.title;
                return (
                  <Pressable key={s.id} style={[styles.seasonBtn, { backgroundColor: themeColors.bgTertiary }, isActive && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => { if (!isActive) router.push(`/movie/watch/${s.id}`); }}>
                    {isActive && <FontAwesome name="check-circle" size={12} color={themeColors.bgPrimary} style={{ marginRight: 5 }} />}
                    <AppText style={isActive ? [styles.serverTextActive, { color: themeColors.bgPrimary }] : [styles.serverText, { color: themeColors.textSecondary }]} numberOfLines={1}>{partText}</AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}



        {/* Ê-kíp */}
        {(movie.cast || movie.director) && (
          <View style={styles.crewSection}>
            <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Ê-kíp</AppText>
            {movie.director && <AppText style={[styles.crewText, { color: themeColors.textSecondary }]}><AppText style={{ color: themeColors.textPrimary, fontWeight: 'bold' }}>Đạo diễn: </AppText>{movie.director}</AppText>}
            {movie.cast && <AppText style={[styles.crewText, { color: themeColors.textSecondary, marginTop: 4 }]}><AppText style={{ color: themeColors.textPrimary, fontWeight: 'bold' }}>Diễn viên: </AppText>{movie.cast}</AppText>}
          </View>
        )}

        {/* Phim đề xuất */}
        {recommendedMovies.length > 0 && (
          <View style={styles.recommendSection}>
            <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Đề xuất cho bạn</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, marginTop: 12 }}>
              {recommendedMovies.map(m => (
                <Pressable key={m.id} style={styles.recCard} onPress={() => router.push(`/movie/${m.id}`)}>
                  <Image source={m.posterUrl || m.thumbUrl} style={[styles.recPoster, { backgroundColor: themeColors.bgTertiary }]} contentFit="cover" />
                  <AppText style={[styles.recTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>{m.title}</AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Bình luận */}
        <View style={styles.commentSection}>
          <MovieComments movieId={movie.id} />
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

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
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },
  errorText: { fontFamily: 'Montserrat-Regular' },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(100,100,100,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
    textAlign: 'center',
  },
  headerSubTitle: {
    fontSize: 12,
    fontFamily: 'Montserrat-SemiBold',
    marginTop: 2,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(100,100,100,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Player
  playerContainer: {
    width: width,
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },

  // Body
  body: {
    flex: 1,
  },
  
  // Info Section
  infoSection: {
    padding: 20,
  },
  movieTitle: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Montserrat-Bold',
    marginBottom: 6,
    lineHeight: 28,
  },
  movieSubTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontFamily: 'Montserrat-Regular',
    marginBottom: 16,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    alignItems: 'center',
  },
  tagTextYellow: {
    color: Colors.dark.accentPrimary,
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 12,
  },
  tagTextWhite: {
    color: '#fff',
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 12,
  },

  // Episodes
  episodesSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
  },
  epCount: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontFamily: 'Montserrat-Medium',
  },
  
  // Dropdown Khoảng Tập
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: 160,
  },
  dropdownBtnText: {
    color: '#fff',
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.8,
    backgroundColor: '#1a1b20',
    borderRadius: 16,
    paddingVertical: 16,
    maxHeight: '70%',
  },
  modalTitle: {
    color: '#fff',
    fontFamily: 'Montserrat-Bold',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
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
  episodeBtnActive: {
    backgroundColor: 'rgba(77, 184, 255, 0.15)',
    borderColor: Colors.dark.accentPrimary,
    shadowColor: Colors.dark.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  episodeText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 14,
  },
  episodeTextActive: {
    color: Colors.dark.accentPrimary,
    fontFamily: 'Montserrat-Bold',
  },

  // Servers
  serverSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  serverRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  serverBtn: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
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

  // Bản chiếu (Label)
  labelSection: { paddingHorizontal: 20, marginTop: 24 },
  labelBtn: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'transparent', borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center',
  },
  labelBtnActive: {
    backgroundColor: Colors.dark.accentPrimary,
    borderColor: Colors.dark.accentPrimary,
  },

  // Seasons
  seasonSection: { paddingHorizontal: 20, marginTop: 24 },
  seasonBtn: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, alignItems: 'center',
  },
  seasonBtnActive: { backgroundColor: Colors.dark.accentPrimary },

  // Thể loại
  categorySection: { paddingHorizontal: 20, marginTop: 24 },
  catChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(77,184,255,0.1)', borderWidth: 1,
    borderColor: 'rgba(77,184,255,0.3)', paddingHorizontal: 10,
    paddingVertical: 5, borderRadius: 14,
  },
  catChipText: { color: Colors.dark.accentPrimary, fontSize: 11, fontFamily: 'Montserrat-SemiBold' },

  // Advanced Toolbar
  advancedToolbarContainer: {
    backgroundColor: '#0c0c10', 
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  advancedToolbar: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  toolbarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolbarActionText: {
    color: '#b0b0b0',
    fontSize: 13,
    fontFamily: 'Montserrat-Medium',
  },
  toolbarSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchBadgeOn: {
    backgroundColor: 'rgba(77, 184, 255, 0.15)',
  },
  switchBadgeOff: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  switchTextOn: {
    fontSize: 10,
    fontFamily: 'Montserrat-Bold',
    color: Colors.dark.accentPrimary,
  },
  switchTextOff: {
    fontSize: 10,
    fontFamily: 'Montserrat-Bold',
    color: '#888',
  },
  toolbarDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 4,
  },

  // Mô tả
  descSection: { paddingHorizontal: 20, marginTop: 16, marginBottom: 16 },
  descText: { color: Colors.dark.textSecondary, fontSize: 14, lineHeight: 22, fontFamily: 'Montserrat-Regular' },

  // Ê-kíp
  crewSection: { paddingHorizontal: 20, marginTop: 24 },
  crewText: { color: Colors.dark.textSecondary, fontSize: 14, lineHeight: 22, fontFamily: 'Montserrat-Regular' },

  // Đề xuất
  recommendSection: { paddingHorizontal: 20, marginTop: 24 },
  recCard: { width: 110, alignItems: 'center' },
  recPoster: { width: 110, height: 165, borderRadius: 8, backgroundColor: Colors.dark.bgTertiary, marginBottom: 6 },
  recTitle: { color: '#ccc', fontSize: 12, lineHeight: 16, fontFamily: 'Montserrat-Regular', textAlign: 'center' },

  // Bình luận
  commentSection: { paddingHorizontal: 20, marginTop: 24, marginBottom: 20 },
  commentPlaceholder: {
    backgroundColor: Colors.dark.bgSecondary, padding: 24, borderRadius: 8,
    alignItems: 'center', gap: 10, marginTop: 12,
  },
  commentPlaceholderText: { color: Colors.dark.textMuted, fontStyle: 'italic', fontSize: 13 },
});
