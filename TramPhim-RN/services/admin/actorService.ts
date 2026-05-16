import { supabase } from '../../lib/supabase';

export interface Actor {
  id: string;
  name: string;
  avatar?: string;
  alt_names?: string;
  role?: string;       // 'actor' | 'director'
  gender?: string;
  dob?: string | null;
  country?: string;
  bio?: string;
  created_at?: string;
  updated_at?: string;
}

export async function fetchActors(searchQuery: string = '', page: number = 1, pageSize: number = 50) {
  try {
    let query = supabase.from('actors').select('*', { count: 'exact' }).order('name');

    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;
    
    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    return {
        actors: data as Actor[],
        hasMore: (data?.length || 0) >= pageSize,
        totalPages,
        totalItems
    };
  } catch (err) {
    console.error('Error in fetchActors:', err);
    throw err;
  }
}

export async function createActor(name: string, avatar?: string, alt_names?: string) {
  const { error } = await supabase.from('actors').insert({ name, avatar, alt_names });
  if (error) throw error;
  return { success: true };
}

export async function updateActor(id: string, name: string, avatar?: string, alt_names?: string) {
  const { error } = await supabase.from('actors').update({ name, avatar, alt_names }).eq('id', id);
  if (error) throw error;
  return { success: true };
}

export async function deleteActor(id: string) {
  const { error } = await supabase.from('actors').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}
