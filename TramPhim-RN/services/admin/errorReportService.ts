import { supabase } from '../../lib/supabase';

export interface ErrorReport {
  id: string;
  user_id: string;
  movie_id: string;
  episode_id?: string;
  description: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  profiles: {
      email: string;
  };
  movies: {
      title: string;
  };
}

export async function fetchErrorReports(page = 1, limit = 20, statusFilter = 'pending') {
  let query = supabase
    .from('error_reports')
    .select('*', { count: 'exact' });

  if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Lỗi lấy báo cáo lỗi:', error);
    throw error;
  }
  
  return {
    reports: data as ErrorReport[],
    total: count || 0,
    totalPages: Math.ceil((count || 0) / limit)
  };
}

export async function updateErrorReportStatus(reportId: string, status: 'resolved' | 'dismissed') {
  const { error } = await supabase
    .from('error_reports')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', reportId);
  
  if (error) throw error;
  return { success: true };
}

export async function deleteErrorReport(reportId: string) {
    const { error } = await supabase
        .from('error_reports')
        .delete()
        .eq('id', reportId);
    
    if (error) throw error;
    return { success: true };
}
