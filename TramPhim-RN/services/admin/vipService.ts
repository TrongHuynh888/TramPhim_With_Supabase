import { supabase } from '../../lib/supabase';
import { toggleVipStatus } from './userService';

export interface VipRequest {
  id: string;
  user_id: string;
  transaction_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  profiles: {
    email: string;
    full_name: string;
  };
}

export async function fetchVipRequests(page = 1, limit = 20, statusFilter = 'pending') {
  let query = supabase
    .from('upgrade_requests')
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
    console.error('Lỗi lấy VIP request:', error);
    throw error;
  }
  
  return {
    requests: data as VipRequest[],
    total: count || 0,
    totalPages: Math.ceil((count || 0) / limit)
  };
}

export async function processVipRequest(requestId: string, userId: string, action: 'approve' | 'reject', days = 30) {
  try {
    const status = action === 'approve' ? 'approved' : 'rejected';
    
    const { error: updateError } = await supabase
      .from('upgrade_requests')
      .update({ status, processed_at: new Date().toISOString() })
      .eq('id', requestId);

    if (updateError) throw updateError;

    if (action === 'approve') {
      await toggleVipStatus(userId, true, days);
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteVipRequest(requestId: string) {
    const { error } = await supabase
        .from('upgrade_requests')
        .delete()
        .eq('id', requestId);
    
    if (error) throw error;
    return { success: true };
}
