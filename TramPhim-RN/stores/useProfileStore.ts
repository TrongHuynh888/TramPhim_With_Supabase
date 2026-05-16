import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { Profile } from "../types/profile";

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Fetch profile timeout"));
    }, timeoutMs);

    Promise.resolve(promise)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

interface ProfileState {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  setProfile: (profile: Profile | null) => void;
  fetchProfile: (userId: string) => Promise<void>;
  updateProfile: (userId: string, values: Partial<Profile>) => Promise<void>;
  getWatchlist: (userId: string) => Promise<any[]>;
  getFavorites: (userId: string) => Promise<any[]>;
  getHistory: (userId: string) => Promise<any[]>;
  topUpRoCoin: (userId: string, amount: number) => Promise<boolean>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  error: null,

  setProfile: (profile) => set({ profile }),

  fetchProfile: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("profiles")
          .select("id, display_name, email, avatar")
          .eq("id", userId)
          .maybeSingle(),
        8000,
      );
      if (error) throw error;
      if (!data) {
        set({ error: null });
        return;
      }
      set({
        profile: {
          ...data,
          full_name: data?.display_name ?? null,
          avatar_url: data?.avatar ?? null,
        },
        error: null,
      });
    } catch (e: any) {
      set({ error: e?.message ?? "Fetch profile failed" });
    } finally {
      set({ isLoading: false });
    }
  },

  updateProfile: async (userId, values) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(values)
        .eq("id", userId)
        .select()
        .single();
      if (error) throw error;
      set({ profile: data });
    } catch (e: any) {
      set({ error: e?.message ?? "Update failed" });
    } finally {
      set({ isLoading: false });
    }
  },

  getWatchlist: async (userId) => {
    try {
      const { data, error } = await supabase
        .from("watchlists")
        .select("movie(id,title,poster_url)")
        .eq("user_id", userId);
      if (error) throw error;
      return data ?? [];
    } catch {
      return [];
    }
  },

  getFavorites: async (userId) => {
    try {
      const { data, error } = await supabase
        .from("user_favorites")
        .select("movie(id,title,poster_url)")
        .eq("user_id", userId);
      if (error) throw error;
      return data ?? [];
    } catch {
      return [];
    }
  },

  getHistory: async (userId) => {
    try {
      const { data, error } = await supabase
        .from("histories")
        .select("movie(id,title,poster_url), watched_at")
        .eq("user_id", userId)
        .order("watched_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch {
      return [];
    }
  },

  topUpRoCoin: async (userId, amount) => {
    set({ isLoading: true });
    try {
      // Prefer RPC for atomic increments. If RPC missing, fallback to read+update.
      const rpcRes: any = await supabase.rpc("increment_ro_coin", {
        user_id: userId,
        amount,
      });
      if (rpcRes && !rpcRes.error) {
        await get().fetchProfile(userId);
        return true;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("ro_coin_balance")
        .eq("id", userId)
        .single();
      if (error) throw error;
      const newBalance = (data?.ro_coin_balance ?? 0) + amount;
      const { error: e3 } = await supabase
        .from("profiles")
        .update({ ro_coin_balance: newBalance })
        .eq("id", userId);
      if (e3) throw e3;
      await get().fetchProfile(userId);
      return true;
    } catch (e: any) {
      set({ error: e?.message ?? "Top-up failed" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
}));
