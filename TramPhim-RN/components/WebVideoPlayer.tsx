import { AppText } from '../components/AppText';
/**
 * WebVideoPlayer - Trình phát video HLS trên nền Web
 * Sử dụng hls.js để phát luồng .m3u8 trên Chrome/Edge/Firefox
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Hls from 'hls.js';

interface WebVideoPlayerProps {
  source: string | null;
  isLoading?: boolean;
  style?: any;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export function WebVideoPlayer({ source, isLoading, style, initialTime, onTimeUpdate }: WebVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    // Hủy instance HLS cũ nếu có
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Nếu là link HLS (.m3u8)
    if (source.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hls.loadSource(source);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (initialTime) video.currentTime = initialTime;
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
          if (data.fatal) {
            console.warn('[HLS] Lỗi nghiêm trọng:', data.type);
            hls.destroy();
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari hỗ trợ HLS native
        video.src = source;
        video.addEventListener('loadedmetadata', () => {
          if (initialTime) video.currentTime = initialTime;
          video.play().catch(() => {});
        });
      }
    } else {
      // Link MP4 thông thường
      video.src = source;
      if (initialTime) video.currentTime = initialTime;
      video.play().catch(() => {});
    }

    // Cleanup khi unmount hoặc đổi source
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [source]);

  // Nếu không có nguồn phát
  if (!source) {
    return (
      <View style={[styles.container, style]}>
        <AppText style={styles.placeholderText}>
          {isLoading ? 'Đang tải dữ liệu...' : 'Không tìm thấy nguồn phát'}
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <video
        ref={videoRef}
        style={videoStyles}
        controls
        playsInline
        autoPlay
        onTimeUpdate={(e: any) => {
          if (onTimeUpdate) {
            onTimeUpdate(e.target.currentTime, e.target.duration);
          }
        }}
      />
    </View>
  );
}

// Style cho thẻ <video> HTML (không dùng StyleSheet vì đây là HTML element)
const videoStyles: React.CSSProperties = {
  width: '100%',
  height: '100%',
  backgroundColor: '#000',
  objectFit: 'contain',
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Montserrat-SemiBold',
  },
});
