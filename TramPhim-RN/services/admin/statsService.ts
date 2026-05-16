/**
 * Service lấy thống kê Dashboard Admin
 * Query trực tiếp từ Supabase (cùng DB với bản web)
 */
import { supabase } from '../../lib/supabase';

export interface AdminStats {
  totalMovies: number;
  totalViews: number;
  totalRevenue: number;
  totalUsers: number;
  vipUsers: number;
  pendingErrors: number;
}

/** Lấy toàn bộ thống kê cho Dashboard */
export async function fetchAdminStats(): Promise<AdminStats> {
  try {
    // Chạy song song tất cả các truy vấn để giảm thời gian load (Parallel Fetching)
    const [
      movieRes,
      userRes,
      vipRes,
      errorRes,
      txRes,
      viewsRes
    ] = await Promise.all([
      supabase.from('movies').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_vip', true),
      supabase.from('error_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('transactions').select('amount').eq('status', 'completed').limit(5000),
      supabase.from('movies').select('views').limit(5000)
    ]);

    // Doanh thu (từ transactions đã hoàn thành)
    const totalRevenue = (txRes.data || []).reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);

    // Tổng lượt xem (tính tổng cột views của các phim)
    const totalViews = (viewsRes.data || []).reduce((sum: number, m: any) => sum + (m.views || 0), 0);

    return {
      totalMovies: movieRes.count ?? 0,
      totalViews: totalViews,
      totalRevenue: totalRevenue,
      totalUsers: userRes.count ?? 0,
      vipUsers: vipRes.count ?? 0,
      pendingErrors: errorRes.count ?? 0,
    };
  } catch (e) {
    console.error('Lỗi lấy thống kê Admin:', e);
    return {
      totalMovies: 0,
      totalViews: 0,
      totalRevenue: 0,
      totalUsers: 0,
      vipUsers: 0,
      pendingErrors: 0,
    };
  }
}

/** Lấy 5 phim gần đây nhất */
export async function fetchRecentMovies(limit = 5) {
  try {
    const { data, error } = await supabase
      .from('movies')
      .select('id, title, type, views, status, poster_url, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Lỗi lấy phim gần đây:', e);
    return [];
  }
}
