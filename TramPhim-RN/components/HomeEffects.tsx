import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Animated, Dimensions, Easing, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { useThemeStore, UserEffects } from '../stores/useThemeStore';

const { width, height } = Dimensions.get('window');

// Emoji dùng làm particle cho từng hiệu ứng
const EMOJIS: Record<string, string[]> = {
  snow: ['❄️', '❅', '❆'],
  stars: ['⭐', '✨', '🌟'],
  firework: ['🎆', '🎇'],
  bubbles: ['🫧', '⚪'],
  hearts: ['❤️', '💖', '💕'],
  leaves: ['🍂', '🍁'],
  rain: ['🌧️', '💧'],
  confetti: ['🎉', '🎊']
};

interface ParticleProps {
  effectName: string;
  index: number;
}

// Particle đơn lẻ - mỗi phần tử bay/rơi trên màn hình
const Particle = React.memo(({ effectName, index }: ParticleProps) => {
  const isFalling = ['snow', 'rain', 'leaves', 'confetti', 'firework'].includes(effectName);
  
  // Điểm bắt đầu và kết thúc
  const startY = isFalling ? -50 : height + 50;
  const endY = isFalling ? height + 50 : -50;
  
  const progress = useRef(new Animated.Value(0)).current;
  
  // Random tham số tĩnh (chỉ tạo 1 lần)
  const randomX = useMemo(() => Math.random() * width, []);
  const randomScale = useMemo(() => Math.random() * 0.6 + 0.4, []);
  const randomOpacity = useMemo(() => Math.random() * 0.5 + 0.3, []);
  const wiggle = useMemo(() => (Math.random() - 0.5) * 120, []);
  
  // Chọn symbol ngẫu nhiên
  const symbolList = EMOJIS[effectName] || ['✨'];
  const symbol = useMemo(() => symbolList[Math.floor(Math.random() * symbolList.length)], []);
  
  // Timing
  const duration = useMemo(() => Math.random() * 4000 + 3000, []);
  const delay = useMemo(() => Math.random() * 5000, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, [delay, duration, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [startY, endY]
  });

  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [randomX, randomX + wiggle, randomX]
  });

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        fontSize: effectName === 'snow' ? 16 : 24,
        opacity: randomOpacity,
        transform: [
          { translateX },
          { translateY },
          { scale: randomScale },
          { rotate }
        ]
      }}
    >
      {symbol}
    </Animated.Text>
  );
});

/**
 * Component hiệu ứng trang chủ
 * - Kết hợp cài đặt Admin (global - bảng site_settings)
 *   VÀ cài đặt User (cá nhân - useThemeStore.userEffects)
 * - Hiệu ứng chỉ hiện khi CẢ admin bật global VÀ user bật local
 */
export default function HomeEffects() {
  const userEffects = useThemeStore((state) => state.userEffects);
  
  // Hiệu ứng Admin bật từ Supabase (toàn hệ thống)
  const [globalEffects, setGlobalEffects] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Fetch từ Supabase: admin bật hiệu ứng nào?
    const fetchEffects = async () => {
      try {
        const { data } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'visual_effects')
          .single();

        if (data?.value) {
          setGlobalEffects(data.value);
        }
      } catch (e) {
        console.warn('Lỗi load visual_effects:', e);
      }
    };

    fetchEffects();

    // Lắng nghe realtime khi admin thay đổi cài đặt
    const channelName = `home_effects_site_settings_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'site_settings', filter: 'key=eq.visual_effects' },
        (payload) => {
          if (payload.new?.value) {
            setGlobalEffects(payload.new.value as Record<string, boolean>);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Kết hợp: hiệu ứng hiện khi CẢ admin bật VÀ user chọn
  const activeEffects = useMemo(() => {
    return Object.keys(globalEffects).filter(k =>
      globalEffects[k] === true && userEffects[k as keyof UserEffects] === true
    );
  }, [globalEffects, userEffects]);

  if (activeEffects.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {activeEffects.map(effect => {
        // Tăng lên 30 particles mỗi hiệu ứng để dày hơn nhưng vẫn đảm bảo mượt
        return Array.from({ length: 30 }).map((_, i) => (
          <Particle key={`${effect}-${i}`} effectName={effect} index={i} />
        ));
      })}
    </View>
  );
}
