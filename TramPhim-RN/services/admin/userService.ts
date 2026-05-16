import { supabase } from '../../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  display_name?: string;
  avatar_url?: string;
  avatar?: string;
  role: 'user' | 'admin';
  is_vip: boolean;
  vip_expires_at: string | null;
  created_at: string;
  banned?: boolean;
}

export async function fetchUsers(page = 1, limit = 20, search = '', filter = '') {
  let query = supabase.from('profiles').select('*', { count: 'exact' });

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  if (filter === 'admin') query = query.eq('role', 'admin');
  if (filter === 'vip') query = query.eq('is_vip', true);
  if (filter === 'banned') query = query.eq('banned', true);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  
  return {
    users: data as UserProfile[],
    total: count || 0,
    totalPages: Math.ceil((count || 0) / limit)
  };
}

export async function updateUserRole(userId: string, newRole: 'user' | 'admin') {
  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);
  
  if (error) throw error;
  return { success: true };
}

export async function toggleVipStatus(userId: string, isVip: boolean, daysToAdd = 30) {
  let updateData: any = { is_vip: isVip };
  
  if (isVip) {
    if (daysToAdd === -1) {
      updateData.vip_expires_at = null; // Vĩnh viễn
    } else {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + daysToAdd);
      updateData.vip_expires_at = expiryDate.toISOString();
    }
  } else {
    updateData.vip_expires_at = null;
  }

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', userId);
  
  if (error) throw error;
  return { success: true };
}

export async function banUser(userId: string, isBanned: boolean) {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !isBanned, is_deleted: isBanned, banned: isBanned })
      .eq('id', userId);
    
    if (error) throw error;
    return { success: true };
}

export async function deleteUser(userId: string) {
    // Soft delete to avoid foreign key constraints (matches old web logic)
    const { error } = await supabase
      .from('profiles')
      .update({ is_deleted: true, is_active: false, banned: true })
      .eq('id', userId);
    
    if (error) throw error;
    return { success: true };
}
