import { supabase } from "@/lib/supabase";

export interface SystemSetting {
  id?: string;
  key_name: string;
  key_value: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export const FALLBACK_KEYS: Record<string, string> = {
  imgbb_api_key: '82e6c87383e2d42e3dbcb62a798eca36',
  omdb_api_key: '461430ce',
  metered_api_key: 'Tp6L8mYZolvVJ2ZwHQnmnZpt3kYvU8uEHJOozyjQtdT15XPE',
  cloudflare_r2_url: 'https://r2-uploader.thinhnd-2003.workers.dev',
};

export const settingsService = {
  async loadSettings(): Promise<SystemSetting[]> {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .order("key_name", { ascending: true });

      if (error) {
        if (error.code === '42P01') {
           return [];
        }
        throw error;
      }
      return data || [];
    } catch (error) {
      console.error("Error loading settings:", error);
      throw error;
    }
  },

  async saveSetting(key_name: string, key_value: string, description?: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("system_settings")
        .upsert(
          {
            key_name,
            key_value,
            description,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key_name" }
        );

      if (error) throw error;
    } catch (error) {
      console.error(`Error saving setting ${key_name}:`, error);
      throw error;
    }
  },
};
