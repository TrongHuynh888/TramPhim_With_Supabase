import { supabase } from '../../lib/supabase';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type?: string;
  target_user?: string;
  link?: string;
  created_at: string;
}

export async function fetchNotifications(page: number = 1, pageSize: number = 50) {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      notifications: data as Notification[],
      hasMore: (data?.length || 0) >= pageSize
    };
  } catch (err) {
    console.error('Error in fetchNotifications:', err);
    throw err;
  }
}

export async function createNotification(title: string, message: string, type: string = 'info', target_user: string = 'all', link: string = '') {
  const { error } = await supabase.from('notifications').insert({
    title, message, type, target_user, link, created_at: new Date().toISOString()
  });
  if (error) throw error;
  return { success: true };
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}
