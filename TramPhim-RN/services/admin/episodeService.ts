/**
 * Service CRUD tập phim cho Admin
 * Tương ứng với logic trong admin-episodes.js
 */
import { supabase } from '../../lib/supabase';

export const EPISODES_PER_PAGE = 20;

export interface EpisodeSource {
  label: string;
  type: 'hls' | 'embed';
  source: string;
  server?: string;
}

export interface Episode {
  id?: string;
  movie_id: string;
  title?: string;
  episode_number?: string;
  episode_index: number;
  duration?: string;
  quality?: string;
  sources?: EpisodeSource[];
  is_new?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Lấy danh sách tập của 1 phim */
export async function fetchEpisodes(movieId: string) {
  try {
    const { data, error } = await supabase
      .from('episodes')
      .select('*')
      .eq('movie_id', movieId)
      .order('episode_index', { ascending: true });
    if (error) throw error;
    return (data || []) as Episode[];
  } catch (e) {
    console.error('Lỗi lấy tập phim:', e);
    return [];
  }
}

/** Thêm tập mới */
export async function addEpisode(episode: Omit<Episode, 'id'>) {
  try {
    const payload = {
      ...episode,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('episodes')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return { success: true, data };
  } catch (e: any) {
    console.error('Lỗi thêm tập:', e);
    return { success: false, error: e.message };
  }
}

/** Cập nhật tập */
export async function updateEpisode(id: string, updates: Partial<Episode>) {
  try {
    const { data, error } = await supabase
      .from('episodes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { success: true, data };
  } catch (e: any) {
    console.error('Lỗi cập nhật tập:', e);
    return { success: false, error: e.message };
  }
}

/** Xóa 1 tập */
export async function deleteEpisode(id: string) {
  try {
    const { error } = await supabase.from('episodes').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Xóa nhiều tập */
export async function deleteMultipleEpisodes(ids: string[]) {
  try {
    const { error } = await supabase.from('episodes').delete().in('id', ids);
    if (error) throw error;
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Xóa tất cả tập của 1 phim */
export async function deleteAllEpisodes(movieId: string) {
  try {
    const { error } = await supabase.from('episodes').delete().eq('movie_id', movieId);
    if (error) throw error;
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Lưu tổng số tập vào bảng movies */
export async function saveTotalEpisodes(movieId: string, total: number) {
  try {
    const { error } = await supabase
      .from('movies')
      .update({ total_episodes: total, updated_at: new Date().toISOString() })
      .eq('id', movieId);
    if (error) throw error;
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Import nhiều tập cùng lúc (batch) */
export async function importBatchEpisodes(episodes: Omit<Episode, 'id'>[]) {
  try {
    const { error } = await supabase.from('episodes').insert(episodes);
    if (error) throw error;
    return { success: true, count: episodes.length };
  } catch (e: any) {
    console.error('Lỗi import batch:', e);
    return { success: false, error: e.message };
  }
}

/** Đếm số tập của 1 phim */
export async function countEpisodes(movieId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('episodes')
      .select('id', { count: 'exact', head: true })
      .eq('movie_id', movieId);
    if (error) throw error;
    return count ?? 0;
  } catch (e) {
    return 0;
  }
}
