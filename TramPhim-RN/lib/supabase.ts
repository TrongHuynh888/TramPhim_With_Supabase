import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://woctovnxocyfivzzrrem.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvY3Rvdm54b2N5Zml2enpycmVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODMwNjUsImV4cCI6MjA4ODU1OTA2NX0.kLqVgqytNyaXyXXgHixEmC0_8X5f8BxBqpICKeX_sxA";

// Chọn storage adapter phù hợp theo nền tảng (Web dùng localStorage, Native dùng AsyncStorage)
let storageAdapter: any = undefined;
if (Platform.OS !== 'web') {
  try {
    storageAdapter = require('@react-native-async-storage/async-storage').default;
  } catch (e) {
    console.warn('AsyncStorage không khả dụng, sẽ dùng bộ nhớ tạm (in-memory)');
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    ...(storageAdapter ? { storage: storageAdapter } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web', // Web cần detect URL, Native thì không
  },
});
