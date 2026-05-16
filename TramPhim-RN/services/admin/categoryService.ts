import { supabase } from '../../lib/supabase';

export interface Category {
  id: string;
  name: string;
  slug?: string;
  description?: string;
}

export async function fetchCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) throw error;
  return data as Category[];
}

export async function createCategory(name: string, description?: string) {
  const { error } = await supabase.from('categories').insert({ name, description });
  if (error) throw error;
  return { success: true };
}

export async function updateCategory(id: string, name: string, description?: string) {
  const { error } = await supabase.from('categories').update({ name, description }).eq('id', id);
  if (error) throw error;
  return { success: true };
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}
