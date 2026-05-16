/**
 * Service CRUD phim cho Admin
 * Tương ứng với logic trong admin.js: loadAdminMovies, filterAdminMovies, saveMovie, deleteMovie
 */
import { supabase } from '../../lib/supabase';

/** Số mục mỗi trang (tương ứng adminPerPage = 15 trong web) */
export const ADMIN_PER_PAGE = 15;

export interface AdminMovie {
  id: string;
  title: string;
  origin_title?: string;
  description?: string;
  poster_url?: string;
  background_url?: string;
  year?: string;
  type?: 'single' | 'series';
  status?: string;
  country?: string;
  country_id?: string;
  categories?: string[];
  tags?: string[];
  views?: number;
  price?: number;
  total_episodes?: number;
  created_at?: string;
  updated_at?: string;
  slug?: string;
  quality?: string;
  rating?: string;
}

export interface MovieFilter {
  search?: string;
  type?: 'single' | 'series' | '';
  categoryId?: string;
  countryId?: string;
  status?: string;
  sortOrder?: 'newest' | 'oldest';
}

/** Lấy danh sách phim (phân trang + bộ lọc) */
export async function fetchAdminMovies(
  page: number = 1,
  filter: MovieFilter = {}
) {
  try {
    const from = (page - 1) * ADMIN_PER_PAGE;
    const to = from + ADMIN_PER_PAGE - 1;

    let query = supabase
      .from('movies')
      .select('*', { count: 'exact' });

    // Lọc theo loại phim
    if (filter.type) {
      query = query.eq('type', filter.type);
    }

    // Lọc theo trạng thái
    if (filter.status) {
      query = query.eq('status', filter.status);
    }

    // Lọc theo quốc gia
    if (filter.countryId) {
      query = query.eq('country_id', filter.countryId);
    }

    // Tìm kiếm theo tên
    if (filter.search) {
      query = query.ilike('title', `%${filter.search}%`);
    }

    // Sắp xếp
    const ascending = filter.sortOrder === 'oldest';
    query = query.order('created_at', { ascending });

    // Phân trang
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      movies: (data || []) as AdminMovie[],
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / ADMIN_PER_PAGE),
    };
  } catch (e) {
    console.error('Lỗi lấy danh sách phim:', e);
    return { movies: [], total: 0, totalPages: 0 };
  }
}

/** Lấy chi tiết 1 phim */
export async function fetchMovieDetail(id: string): Promise<AdminMovie | null> {
  try {
    const { data, error } = await supabase
      .from('movies')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Lỗi lấy chi tiết phim:', e);
    return null;
  }
}

/** Tạo hoặc cập nhật phim */
export async function saveMovie(movie: Partial<AdminMovie>, isNew: boolean = false) {
  try {
    const payload = {
      ...movie,
      updated_at: new Date().toISOString(),
    };

    if (isNew) {
      const { data, error } = await supabase.from('movies').insert(payload).select().single();
      if (error) throw error;
      return { success: true, data };
    } else {
      const { data, error } = await supabase
        .from('movies')
        .update(payload)
        .eq('id', movie.id!)
        .select()
        .single();
      if (error) throw error;
      return { success: true, data };
    }
  } catch (e: any) {
    console.error('Lỗi lưu phim:', e);
    return { success: false, error: e.message };
  }
}

/** Xóa phim (bao gồm tập phim liên quan) */
export async function deleteMovie(id: string) {
  try {
    // Xóa tập phim trước
    await supabase.from('episodes').delete().eq('movie_id', id);
    // Xóa phim
    const { error } = await supabase.from('movies').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (e: any) {
    console.error('Lỗi xóa phim:', e);
    return { success: false, error: e.message };
  }
}

/** Đổi trạng thái phim (public/hidden/pending) */
export async function updateMovieStatus(id: string, status: string) {
  try {
    const { error } = await supabase
      .from('movies')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
