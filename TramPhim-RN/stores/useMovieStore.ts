import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Các type cơ bản tương đương với web
export interface Movie {
  id: string;
  title: string;
  originTitle?: string;
  description?: string;
  posterUrl?: string;
  backgroundUrl?: string;
  thumbUrl?: string;
  year?: string;
  duration?: string;
  type?: 'single' | 'series';
  seriesId?: string;
  part?: string | number;
  totalEpisodes?: number;
  country?: string;
  country_id?: string;
  category?: string;
  categories?: string[];
  tags?: string[];
  cast?: string;
  director?: string;
  rating?: string;
  imdbRating?: string;
  ageLimit?: string;
  quality?: string;
  views?: number;
  price?: number;
  created_at?: string;
  updated_at?: string;
  versions?: string[];
  episodes?: any[];
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
}

export interface Country {
  id: string;
  name: string;
  code?: string;
}

interface MovieState {
  allMovies: Movie[];
  allCategories: Category[];
  allCountries: Country[];
  isLoading: boolean;
  isInitialized: boolean;
  loadInitialData: () => Promise<void>;
}

const CACHE_KEY_MOVIES = 'TRAMPHIM_CACHE_ALL_MOVIES_V3';
const CACHE_KEY_CATEGORIES = 'TRAMPHIM_CACHE_CATEGORIES';
const CACHE_KEY_COUNTRIES = 'TRAMPHIM_CACHE_COUNTRIES';
const CACHE_KEY_TIMESTAMP = 'TRAMPHIM_CACHE_TIMESTAMP';
const CACHE_LIFETIME = 24 * 60 * 60 * 1000; // 24 giờ (milliseconds)

export const useMovieStore = create<MovieState>((set, get) => ({
  allMovies: [],
  allCategories: [],
  allCountries: [],
  isLoading: true,
  isInitialized: false,

  loadInitialData: async () => {
    try {
      set({ isLoading: true });
      
      const now = new Date().getTime();
      const lastUpdateStr = await AsyncStorage.getItem(CACHE_KEY_TIMESTAMP);
      const lastUpdate = lastUpdateStr ? parseInt(lastUpdateStr, 10) : 0;
      
      const shouldFetchNewData = (now - lastUpdate > CACHE_LIFETIME) || !lastUpdate;

      if (!shouldFetchNewData) {
        // Cố gắng load từ cache trước
        try {
          const [cachedMoviesStr, cachedCatsStr, cachedCountriesStr] = await Promise.all([
            AsyncStorage.getItem(CACHE_KEY_MOVIES),
            AsyncStorage.getItem(CACHE_KEY_CATEGORIES),
            AsyncStorage.getItem(CACHE_KEY_COUNTRIES)
          ]);

          if (cachedMoviesStr && cachedCatsStr && cachedCountriesStr) {
            set({
              allMovies: JSON.parse(cachedMoviesStr),
              allCategories: JSON.parse(cachedCatsStr),
              allCountries: JSON.parse(cachedCountriesStr),
              isLoading: false,
              isInitialized: true
            });
            console.log('✅ Đã load dữ liệu từ AsyncStorage Cache');
            return;
          }
        } catch (e) {
          console.log('Lỗi đọc cache, sẽ fetch mới', e);
        }
      }

      // Fetch mới từ Supabase
      console.log('📡 Đang tải dữ liệu mới từ Supabase...');
      
      const [moviesRes, catsRes, countriesRes] = await Promise.all([
        supabase.from('movies').select('*, episodes(id)').order('created_at', { ascending: false }),
        supabase.from('categories').select('*'),
        supabase.from('countries').select('*')
      ]);

      if (moviesRes.error) throw moviesRes.error;
      
      // Chuyển đổi snake_case từ DB sang camelCase cho ứng dụng
      const normalizedMovies = (moviesRes.data || []).map((m: any) => ({
        id: m.id,
        title: m.title,
        originTitle: m.origin_title || m.originTitle,
        description: m.description,
        posterUrl: m.poster_url || m.posterUrl,
        backgroundUrl: m.background_url || m.backgroundUrl,
        thumbUrl: m.thumb_url || m.thumbUrl,
        year: m.year,
        duration: m.duration,
        type: m.type,
        seriesId: m.series_id || m.seriesId,
        part: m.part,
        totalEpisodes: m.total_episodes || m.totalEpisodes,
        country_id: m.country_id,
        country: m.country,
        category: m.category,
        categories: m.categories || m.category_ids || [],
        tags: m.tags || [],
        cast: m.cast_names || m.cast,
        director: m.director,
        rating: m.rating,
        imdbRating: m.imdb_rating || m.imdbRating,
        ageLimit: m.age_limit || m.ageLimit,
        quality: m.quality,
        views: m.views || 0,
        price: m.price || 0,
        created_at: m.created_at,
        versions: m.versions || [],
        episodes: m.episodes || []
      }));

      const catsData = catsRes.data || [];
      const countriesData = countriesRes.data || [];

      // Lưu vào State
      set({
        allMovies: normalizedMovies,
        allCategories: catsData,
        allCountries: countriesData,
        isLoading: false,
        isInitialized: true
      });

      // Lưu vào Cache bất đồng bộ
      Promise.all([
        AsyncStorage.setItem(CACHE_KEY_MOVIES, JSON.stringify(normalizedMovies)),
        AsyncStorage.setItem(CACHE_KEY_CATEGORIES, JSON.stringify(catsData)),
        AsyncStorage.setItem(CACHE_KEY_COUNTRIES, JSON.stringify(countriesData)),
        AsyncStorage.setItem(CACHE_KEY_TIMESTAMP, now.toString())
      ]).catch(e => console.log('Lỗi lưu cache', e));
      
      console.log(`✅ Đã tải ${normalizedMovies.length} phim từ DB`);

    } catch (e) {
      console.error('Lỗi load data:', e);
      set({ isLoading: false });
    }
  }
}));
