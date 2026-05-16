import { supabase } from '../../lib/supabase';

export interface Comment {
  id: string;
  user_id: string;
  movie_id: string;
  content: string;
  created_at: string;
  profiles?: { display_name: string; avatar: string };
  movies?: { title: string };
}

export async function fetchComments(page: number = 1, pageSize: number = 50) {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('comments')
      .select(`
        id, user_id, movie_id, content, created_at,
        profiles (display_name, avatar),
        movies (title)
      `)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      comments: data as any as Comment[],
      hasMore: (data?.length || 0) >= pageSize
    };
  } catch (err) {
    console.error('Error in fetchComments:', err);
    throw err;
  }
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}
