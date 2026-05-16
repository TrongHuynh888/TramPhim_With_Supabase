import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { Session, User } from "@supabase/supabase-js";
import { useThemeStore } from "./useThemeStore";

interface AuthState {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  watchHistory: any[];
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  checkAdminStatus: (userId: string) => Promise<boolean>;
  initializeAuth: () => Promise<void>;
  fetchWatchHistory: () => Promise<void>;
  signOut: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isAdmin: false,
  isLoading: true,
  isInitialized: false,
  watchHistory: [],

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),

  checkAdminStatus: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (error) throw error;

      const isAdmin = data?.role === "admin";
      set({ isAdmin });
      return isAdmin;
    } catch (e) {
      console.warn("Không thể kiểm tra quyền admin:", e);
      set({ isAdmin: false });
      return false;
    }
  },

  initializeAuth: async () => {
    try {
      set({ isLoading: true });

      // Get current session
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("Lỗi getSession:", error);
        throw error;
      }

      const user = session?.user ?? null;
      set({ session, user });

      if (user) {
        await get().checkAdminStatus(user.id);
        useThemeStore.getState().loadUserTheme(user.id);
      } else {
        set({ isAdmin: false });
        useThemeStore.getState().resetTheme();
      }

      // Lắng nghe thay đổi trạng thái auth
      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        const newUser = newSession?.user ?? null;
        set({ session: newSession, user: newUser });

        if (newUser) {
          await get().checkAdminStatus(newUser.id);
          useThemeStore.getState().loadUserTheme(newUser.id);
          get().fetchWatchHistory();
        } else {
          set({ isAdmin: false, watchHistory: [] });
          useThemeStore.getState().resetTheme();
        }
      });
      
      // Fetch lịch sử nếu đã đăng nhập
      if (user) {
        get().fetchWatchHistory();
      }
    } catch (e) {
      console.error("Lỗi khởi tạo Auth:", e);
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  fetchWatchHistory: async () => {
    const user = get().user;
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', user.id);
      if (!error && data) {
        set({ watchHistory: data });
      }
    } catch (e) {
      console.error("Lỗi fetch lịch sử:", e);
    }
  },

  signOut: async () => {
    try {
      set({ isLoading: true });
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Lỗi đăng xuất:", error);
        return false;
      }
      set({ user: null, session: null, isAdmin: false, watchHistory: [] });
      return true;
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
}));
