import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { Colors } from "../theme/colors";

type ThemeMode = 'dark' | 'light';

// Cài đặt hiệu ứng cá nhân của user (mỗi loại bật/tắt riêng)
export type UserEffects = {
  snow: boolean;
  stars: boolean;
  firework: boolean;
  bubbles: boolean;
  hearts: boolean;
  leaves: boolean;
  rain: boolean;
  confetti: boolean;
};

const DEFAULT_USER_EFFECTS: UserEffects = {
  snow: false, stars: false, firework: false, bubbles: false,
  hearts: false, leaves: false, rain: false, confetti: false,
};

type ThemeState = {
  themeMode: ThemeMode;
  themeColors: typeof Colors.dark;
  primaryColor: string;
  fontSizeMultiplier: number;
  enableEffects: boolean;
  userEffects: UserEffects; // Cài đặt từng hiệu ứng cá nhân
  userId: string | null;
  fontFamily: string;
  setUserId: (id: string | null) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setPrimaryColor: (color: string) => void;
  setFontSizeMultiplier: (multiplier: number) => void;
  setFontFamily: (fontFamily: string) => void;
  setEnableEffects: (enable: boolean) => void;
  setUserEffects: (effects: Partial<UserEffects>) => void;
  resetTheme: () => void;
  loadUserTheme: (id: string) => Promise<void>;
};

export const PRESET_COLORS = [
  // Tone Xanh / Lạnh (Đảm bảo độ tương phản với chữ trắng)
  { id: "cyan", color: "#4db8ff", name: "Xanh lơ" },
  { id: "blue", color: "#3b82f6", name: "Xanh dương" },
  { id: "indigo", color: "#6366f1", name: "Tím than" },
  
  // Tone Tím / Hồng / Nữ tính
  { id: "purple", color: "#8b5cf6", name: "Tím hoàng gia" },
  { id: "fuchsia", color: "#d946ef", name: "Hồng tím" },
  { id: "pink", color: "#e84393", name: "Hồng dạ quang" },
  { id: "rose", color: "#f43f5e", name: "Đỏ hồng" },

  // Tone Đỏ / Cam / Nóng
  { id: "netflix-red", color: "#e50914", name: "Đỏ Netflix" },
  { id: "crimson", color: "#dc2626", name: "Đỏ sẫm" },
  { id: "orange", color: "#ea580c", name: "Cam đậm" },

  // Tone Xanh lá / Tự nhiên
  { id: "emerald", color: "#10b981", name: "Xanh ngọc" },
  { id: "forest", color: "#059669", name: "Xanh rừng" },
];

const DEFAULT_THEME = {
  themeMode: 'dark' as ThemeMode,
  themeColors: Colors.dark,
  primaryColor: "#4db8ff", // Default cyan
  fontSizeMultiplier: 1,
  fontFamily: "Inter",
  enableEffects: false,
  userEffects: { ...DEFAULT_USER_EFFECTS },
};

export const useThemeStore = create<ThemeState>((set, get) => {
  const saveToSupabase = async (updates: Partial<ThemeState>) => {
    const { userId } = get();
    if (!userId) return; // Chỉ lưu nếu đã đăng nhập
    
    try {
      // Cập nhật lên cột preferences (JSONB) trong bảng profiles
      const currentState = get();
      const preferences = {
        themeMode: updates.themeMode ?? currentState.themeMode,
        primaryColor: updates.primaryColor ?? currentState.primaryColor,
        fontSizeMultiplier: updates.fontSizeMultiplier ?? currentState.fontSizeMultiplier,
        fontFamily: updates.fontFamily ?? currentState.fontFamily,
        enableEffects: updates.enableEffects ?? currentState.enableEffects,
        userEffects: (updates as any).userEffects ?? currentState.userEffects,
      };
      
      await supabase
        .from('profiles')
        .update({ preferences })
        .eq('id', userId);
    } catch (e) {
      console.warn('Lỗi khi lưu cài đặt giao diện:', e);
    }
  };

  return {
    ...DEFAULT_THEME,
    userId: null,
    
    setUserId: (userId) => set({ userId }),
    
    setThemeMode: (themeMode) => {
      set({ themeMode, themeColors: Colors[themeMode] });
      saveToSupabase({ themeMode });
    },
    
    setPrimaryColor: (primaryColor) => {
      set({ primaryColor });
      saveToSupabase({ primaryColor });
    },
    
    setFontSizeMultiplier: (fontSizeMultiplier) => {
      set({ fontSizeMultiplier });
      saveToSupabase({ fontSizeMultiplier });
    },
    
    setFontFamily: (fontFamily) => {
      set({ fontFamily });
      saveToSupabase({ fontFamily });
    },
    
    setEnableEffects: (enableEffects) => {
      set({ enableEffects });
      saveToSupabase({ enableEffects });
    },
    
    // Cập nhật từng hiệu ứng cá nhân (merge partial)
    setUserEffects: (partial) => {
      const current = get().userEffects;
      const merged = { ...current, ...partial };
      set({ userEffects: merged });
      saveToSupabase({ userEffects: merged } as any);
    },
    
    loadUserTheme: async (userId: string) => {
      set({ userId });
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('preferences')
          .eq('id', userId)
          .single();
          
        if (error) throw error;
        
        if (data?.preferences) {
          const pref = data.preferences as any;
          const mode = pref.themeMode || DEFAULT_THEME.themeMode;
          set({
            themeMode: mode,
            themeColors: Colors[mode as ThemeMode] || Colors.dark,
            primaryColor: pref.primaryColor || DEFAULT_THEME.primaryColor,
            fontSizeMultiplier: pref.fontSizeMultiplier || DEFAULT_THEME.fontSizeMultiplier,
            fontFamily: pref.fontFamily || DEFAULT_THEME.fontFamily,
            enableEffects: pref.enableEffects !== undefined ? pref.enableEffects : DEFAULT_THEME.enableEffects,
            userEffects: pref.userEffects ? { ...DEFAULT_USER_EFFECTS, ...pref.userEffects } : { ...DEFAULT_USER_EFFECTS },
          });
        } else {
          // Chưa có thì dùng default
          set({ ...DEFAULT_THEME, userId });
        }
      } catch (e) {
        console.warn('Không thể tải cài đặt giao diện:', e);
        set({ ...DEFAULT_THEME, userId });
      }
    },
    
    resetTheme: () => {
      set({ ...DEFAULT_THEME });
      saveToSupabase(DEFAULT_THEME);
    },
  };
});
