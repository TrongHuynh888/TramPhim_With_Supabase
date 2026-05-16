import { supabase } from '../../lib/supabase';

export interface Country {
  id: string;
  name: string;
  code?: string;
}

export async function fetchCountries() {
  const { data, error } = await supabase.from('countries').select('*').order('name');
  if (error) throw error;
  return data as Country[];
}

export async function createCountry(name: string, code?: string) {
  const { error } = await supabase.from('countries').insert({ name, code });
  if (error) throw error;
  return { success: true };
}

export async function updateCountry(id: string, name: string, code?: string) {
  const { error } = await supabase.from('countries').update({ name, code }).eq('id', id);
  if (error) throw error;
  return { success: true };
}

export async function deleteCountry(id: string) {
  const { error } = await supabase.from('countries').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}
