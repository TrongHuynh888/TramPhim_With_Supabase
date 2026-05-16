import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook tải danh sách tập phim theo kiểu phân trang (lazy loading).
 * - Lần đầu: Chỉ tải cột episode_number (payload rất nhẹ) để biết tổng số tập + xây dựng pagination
 * - Khi user chọn khoảng tập: Mới tải full data cho khoảng đó
 */
export function useMovieEpisodes(movieId: string) {
  // Danh sách episode_number đã dedup + sort (dùng cho pagination)
  const [episodeNumbers, setEpisodeNumbers] = useState<string[]>([]);
  // Dữ liệu đầy đủ của các tập đang hiển thị
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Bước 1: Tải danh sách episode_number (payload nhẹ ~2KB thay vì 200KB+)
  useEffect(() => {
    async function fetchEpisodeNumbers() {
      if (!movieId) return;
      try {
        setIsLoading(true);

        // Lấy toàn bộ episode_number (chỉ 1 cột, rất nhẹ), vượt giới hạn 1000 rows
        let allNumbers: string[] = [];
        let from = 0;
        const PAGE = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('episodes')
            .select('episode_number')
            .eq('movie_id', movieId)
            .order('episode_number', { ascending: true })
            .range(from, from + PAGE - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allNumbers = allNumbers.concat(data.map(d => String(d.episode_number ?? '')));
            from += PAGE;
            hasMore = data.length === PAGE;
          } else {
            hasMore = false;
          }
        }

        // Dedup episode_number
        const uniqueSet = new Set<string>();
        const uniqueList: string[] = [];
        for (const num of allNumbers) {
          if (!uniqueSet.has(num)) {
            uniqueSet.add(num);
            uniqueList.push(num);
          }
        }

        // Sắp xếp theo số thực (hỗ trợ 1004.5, v.v.)
        uniqueList.sort((a, b) => {
          const nA = parseFloat(a.replace(/[^\d.]/g, '')) || 9999;
          const nB = parseFloat(b.replace(/[^\d.]/g, '')) || 9999;
          return nA - nB;
        });

        setEpisodeNumbers(uniqueList);
        setTotalCount(uniqueList.length);
      } catch (err) {
        console.error('Lỗi tải danh sách số tập:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEpisodeNumbers();
  }, [movieId]);

  // Bước 2: Tải full data cho một khoảng tập cụ thể (gọi khi user chọn page)
  const loadEpisodePage = useCallback(async (epNums: string[]) => {
    if (!movieId || epNums.length === 0) {
      setEpisodes([]);
      return;
    }

    try {
      // Lấy full data chỉ cho các episode_number trong khoảng hiện tại
      const { data, error } = await supabase
        .from('episodes')
        .select('*')
        .eq('movie_id', movieId)
        .in('episode_number', epNums)
        .order('episode_number', { ascending: true });

      if (error) throw error;

      // Dedup (giữ bản đầu tiên cho mỗi episode_number, gộp sources)
      const epMap = new Map<string, any>();
      for (const ep of (data || [])) {
        const key = String(ep.episode_number ?? '');
        if (!epMap.has(key)) {
          epMap.set(key, ep);
        }
      }

      // Sắp xếp theo đúng thứ tự trong epNums (đã sort sẵn)
      const sorted = epNums
        .map(num => epMap.get(num))
        .filter(Boolean);

      setEpisodes(sorted);
    } catch (err) {
      console.error('Lỗi tải dữ liệu tập phim:', err);
    }
  }, [movieId]);

  return { episodes, episodeNumbers, isLoading, totalCount, loadEpisodePage };
}
