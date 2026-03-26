// ============================================
// SAMPLE DATA (Dữ liệu mẫu khi chưa có Firebase)
// ============================================
const SAMPLE_CATEGORIES = [
  { id: "action", name: "Hành động", slug: "hanh-dong" },
  { id: "comedy", name: "Hài hước", slug: "hai-huoc" },
  { id: "horror", name: "Kinh dị", slug: "kinh-di" },
  { id: "romance", name: "Tình cảm", slug: "tinh-cam" },
  { id: "scifi", name: "Khoa học viễn tưởng", slug: "khoa-hoc-vien-tuong" },
  { id: "animation", name: "Hoạt hình", slug: "hoat-hinh" },
  { id: "drama", name: "Chính kịch", slug: "chinh-kich" },
  { id: "thriller", name: "Giật gân", slug: "giat-gan" },
];

const SAMPLE_COUNTRIES = [
  { id: "vn", name: "Việt Nam", code: "VN" },
  { id: "us", name: "Mỹ", code: "US" },
  { id: "kr", name: "Hàn Quốc", code: "KR" },
  { id: "jp", name: "Nhật Bản", code: "JP" },
  { id: "cn", name: "Trung Quốc", code: "CN" },
  { id: "th", name: "Thái Lan", code: "TH" },
  { id: "uk", name: "Anh", code: "UK" },
  { id: "fr", name: "Pháp", code: "FR" },
];

const SAMPLE_MOVIES = [
  {
    id: "movie1",
    title: "Người Nhện: Du Hành Vũ Trụ",
    posterUrl: "https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg",
    description: "Miles Morales trở lại trong cuộc phiêu lưu xuyên đa vũ trụ...",
    price: 15,
    status: "public",
    category: "Hoạt hình",
    country: "Mỹ",
    year: 2023,
    views: 15420,
    rating: 9.2,
    episodes: [],
    createdAt: new Date("2024-01-15"),
  }
];

// Cache lịch sử xem toàn cục (MovieID -> Percentage)
window.userWatchHistoryCache = window.userWatchHistoryCache || {};

/**
 * Danh sách diễn viên (Actors) kèm Caching
 */
async function loadActors(remoteTimestamp) {
  try {
    const localTS = getCacheTimestamp("actors");
    
    // Nếu có timestamp hợp lệ và remote khớp với local -> Load từ cache
    if (remoteTimestamp && localTS === remoteTimestamp) {
        const cached = loadFromCache("actors");
        if (cached) {
            allActors = cached;
            console.log("📦 Loaded Actors from Cache (0 reads)");
            return;
        }
    }

    // --- SUPABASE MIGRATION ---
    const { data, error } = await supabase.from('actors').select('*');
    if (error) throw error;
    allActors = data || [];

    // Lưu lại cache và cập nhật timestamp local
    saveToCache("actors", allActors);
    if (remoteTimestamp) setCacheTimestamp("actors", remoteTimestamp);
    console.log("🌐 Fetched Actors from Supabase");

  } catch (error) {
    console.error("Lỗi load diễn viên:", error);
    allActors = [];
  }
}

let currentSyncData = null; // Lưu trữ timestamp hiện tại để so sánh

/**
 * Load dữ liệu ban đầu kèm theo cơ chế Metadata Sync Caching
 */
async function loadInitialData() {
  try {
    console.log("🔄 Đang kiểm tra Metadata Sync...");
    
    // 1. Đọc document sync để kiểm tra thay đổi
    if (supabase) {
        try {
            const { data: syncData, error } = await supabase
                .from('app_configs')
                .select('value')
                .eq('key', 'sync')
                .maybeSingle(); // Sử dụng maybeSingle để tránh lỗi 406/single if not found
            
            if (error) {
                console.warn("⚠️ Lỗi truy vấn app_configs/sync:", error.message);
            } else if (syncData) {
                currentSyncData = syncData.value;
                console.log("✅ Metadata Sync loaded:", currentSyncData);
            } else {
                console.log("ℹ️ app_configs/sync chưa tồn tại.");
            }
        } catch (e) {
            console.warn("⚠️ Không thể đọc app_configs/sync, chuyển sang mode load mặc định.", e);
        }
    }

    // 2. Chạy load song song các collection
    await Promise.all([
      loadCategories(currentSyncData?.categories),
      loadCountries(currentSyncData?.countries),
      loadMovies(currentSyncData?.movies),
      loadActors(currentSyncData?.actors)
    ]);

    // Populate filter dropdowns
    populateFilters();
    
    // Cập nhật watch progress nếu đã đăng nhập
    if (currentUser) {
      await updateAllWatchProgress();
      // Render lại home để áp dụng progress nếu đang ở trang chủ
      if (typeof renderFeaturedMovies === 'function') renderFeaturedMovies();
      if (typeof renderNewMovies === 'function') renderNewMovies();
    }

    // 3. Nếu Admin chưa tạo sync doc, hãy tạo nó
    if (supabase && !currentSyncData && (typeof isAdmin !== 'undefined' && isAdmin)) {
        initializeSyncConfig();
    }

    // 4. Kích hoạt listener để nhận cập nhật real-time từ Admin mà không cần F5
    startMetadataSyncListener();
    
    // 5. Kích hoạt listener cho lịch sử xem (Real-time Progress)
    if (currentUser) {
        startWatchHistoryRealtimeListener();
    }

    // 6. Auto-sync tập phim mới khi Admin mở web (không cần vào trang Admin)
    if (typeof isAdmin !== 'undefined' && isAdmin) {
        setTimeout(() => {
            // Lazy load admin-api-import.js nếu chưa load
            if (!window._adminScriptsLoaded) {
                console.log('🔄 [AutoSync] Admin detected → Loading sync scripts...');
                if (typeof lazyLoadScript === 'function') {
                    lazyLoadScript('js/admin-api-import.js?v=3').then(() => {
                        if (typeof autoSyncEpisodesIfNeeded === 'function') {
                            console.log('🔄 [AutoSync] Bắt đầu kiểm tra tập phim mới...');
                            autoSyncEpisodesIfNeeded();
                        }
                    }).catch(e => console.warn('[AutoSync] Lỗi load script:', e.message));
                }
            } else {
                // Script đã load rồi (admin đã vào trang Admin trước đó)
                if (typeof autoSyncEpisodesIfNeeded === 'function') {
                    autoSyncEpisodesIfNeeded();
                }
            }
        }, 5000); // Chờ 5s sau khi data load xong
    }

  } catch (error) {
    console.error("Lỗi load dữ liệu:", error);
  }
}

/**
 * Lắp nghe thay đổi Metadata từ Admin (Supabase Realtime)
 */
function startMetadataSyncListener() {
    if (!supabase) return;
    
    supabase
      .channel('public:app_configs')
      .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'app_configs', 
          filter: 'key=eq.sync' 
      }, payload => {
          const newData = payload.new.value;
          if (!newData) return;
          
          if (!currentSyncData) {
              currentSyncData = newData;
              return;
          }

          // 1. Phim & Tập phim
          if (newData.movies !== currentSyncData.movies) {
              console.log("🔔 [Sync] Phim thay đổi...");
              loadMovies(newData.movies).then(() => {
                  if (typeof renderMovies === 'function') renderMovies();
                  if (typeof renderAdminMoviesList === 'function' && typeof allMovies !== 'undefined') {
                      renderAdminMoviesList(allMovies);
                  }
              });
          }

          // 2. Diễn viên
          if (newData.actors !== currentSyncData.actors) {
              console.log("🔔 [Sync] Diễn viên thay đổi...");
              loadActors(newData.actors).then(() => {
                  if (typeof renderAdminActors === 'function') renderAdminActors();
                  if (typeof renderActorsPage === 'function') renderActorsPage();
              });
          }

          // 3. Thể loại & Quốc gia
          if (newData.categories !== currentSyncData.categories || newData.countries !== currentSyncData.countries) {
              console.log("🔔 [Sync] Thể loại/Quốc gia thay đổi...");
              Promise.all([
                  loadCategories(newData.categories),
                  loadCountries(newData.countries)
              ]).then(() => {
                  populateFilters();
                  if (typeof populateAdminMovieFilters === 'function') populateAdminMovieFilters();
              });
          }

          currentSyncData = newData;
      })
      .subscribe();
}

/**
 * Khởi tạo dữ liệu đồng bộ mặc định
 */
async function initializeSyncConfig() {
    if (!supabase) return;
    try {
        const now = Date.now();
        await supabase.from('app_configs').upsert({
            key: 'sync',
            value: {
                movies: now,
                actors: now,
                categories: now,
                countries: now,
                lastUpdated: now
            }
        });
        console.log("✅ Đã khởi tạo configs/sync trên Supabase");
    } catch (e) {
        console.error("Lỗi khởi tạo sync config:", e);
    }
}

/**
 * Load danh sách thể loại kèm Caching
 */
async function loadCategories(remoteTimestamp) {
  try {
    const localTS = getCacheTimestamp("categories");
    if (remoteTimestamp && localTS === remoteTimestamp) {
        const cached = loadFromCache("categories");
        if (cached) {
            allCategories = cached;
            console.log("📦 Loaded Categories from Cache (0 reads)");
            return;
        }
    }

    const { data, error } = await supabase.from('categories').select('*');
    if (error) throw error;

    if (data && data.length > 0) {
        allCategories = data;
        saveToCache("categories", allCategories);
        if (remoteTimestamp) setCacheTimestamp("categories", remoteTimestamp);
        console.log("🌐 Fetched Categories from Supabase");
    } else {
        allCategories = SAMPLE_CATEGORIES;
    }
  } catch (error) {
    console.error("Lỗi load categories:", error);
    allCategories = SAMPLE_CATEGORIES;
  }
}

/**
 * Load danh sách quốc gia kèm Caching
 */
async function loadCountries(remoteTimestamp) {
  try {
    const localTS = getCacheTimestamp("countries");
    if (remoteTimestamp && localTS === remoteTimestamp) {
        const cached = loadFromCache("countries");
        if (cached) {
            allCountries = cached;
            console.log("📦 Loaded Countries from Cache (0 reads)");
            return;
        }
    }

    const { data, error } = await supabase.from('countries').select('*');
    if (error) throw error;

    if (data && data.length > 0) {
        allCountries = data;
        saveToCache("countries", allCountries);
        if (remoteTimestamp) setCacheTimestamp("countries", remoteTimestamp);
        console.log("🌐 Fetched Countries from Supabase");
    } else {
        allCountries = SAMPLE_COUNTRIES;
    }
  } catch (error) {
    console.error("Lỗi load countries:", error);
    allCountries = SAMPLE_COUNTRIES;
  }
}

/**
 * Chuẩn hóa dữ liệu phim: ánh xạ cột snake_case từ Supabase sang camelCase cho frontend
 * Giữ nguyên cả 2 dạng để tương thích code cũ và mới
 */
function normalizeMovieData(movie) {
    if (!movie) return movie;
    // Ánh xạ snake_case -> camelCase (giữ nguyên giá trị gốc nếu đã có)
    movie.posterUrl = movie.posterUrl || movie.poster_url || "";
    movie.backgroundUrl = movie.backgroundUrl || movie.background_url || "";
    movie.originTitle = movie.originTitle || movie.origin_title || "";
    movie.totalEpisodes = movie.totalEpisodes || movie.total_episodes || 0;
    movie.episodeNumber = movie.episodeNumber || movie.episode_number || "";
    movie.createdAt = movie.createdAt || movie.created_at || "";
    movie.updatedAt = movie.updatedAt || movie.updated_at || "";
    movie.seriesId = movie.seriesId || movie.series_id || "";
    movie.apiUrlBackup = movie.apiUrlBackup || movie.api_url_backup || "";
    movie.castData = movie.castData || movie.cast_data || [];
    movie.ageLimit = movie.ageLimit || movie.age_limit || "";
    movie.countryId = movie.countryId || movie.country_id || "";
    movie.imdbRating = movie.imdbRating || movie.imdb_rating || null;
    movie.tmdb_trailer_key = movie.tmdb_trailer_key || null; // TMDb trailer YouTube key (bulk scan)
    
    // --- ĐỒNG BỘ SỐ TẬP HIỆN CÓ ---
    // Tính toán từ mảng episodes nếu có (kết quả của join hoặc cache)
    if (movie.episodes && Array.isArray(movie.episodes)) {
        movie._episodeCount = movie.episodes.length;
        movie.current_episode = movie.episodes.length; // Để tương thích DB nếu cần
    } else {
        movie._episodeCount = 0;
        movie.current_episode = 0;
    }

    // --- ĐỒNG BỘ DỮ LIỆU DIỄN VIÊN ---
    // Nếu cast trống nhưng castData có dữ liệu, tự động tạo cast string để hiển thị UI cũ
    if (!movie.cast && movie.castData && Array.isArray(movie.castData) && movie.castData.length > 0) {
        movie.cast = movie.castData.map(a => a.name).join(", ");
    }

    // --- ĐỒNG BỘ DỮ LIỆU THỂ LOẠI & QUỐC GIA CHO UI ---
    // category_ids là mảng text[] - dùng trực tiếp, không còn category_id đơn trị
    if (!movie.category_ids || !Array.isArray(movie.category_ids)) {
        movie.category_ids = [];
    }
    // movie.categories = alias cho category_ids (để tương thích code cũ)
    movie.categories = [...movie.category_ids].filter(Boolean);

    // 2. Đảm bảo country đồng bộ với country_id

    if (!movie.country && movie.countryId) {
        movie.country = movie.countryId;
    }

    return movie;
}

/**
 * Load danh sách phim kèm Caching
 */
async function loadMovies(remoteTimestamp) {
  try {
    const localTS = getCacheTimestamp("movies");
    if (remoteTimestamp && localTS === remoteTimestamp) {
        const cached = loadFromCache("movies");
        if (cached && cached.length > 0) {
            // Kiểm tra ngẫu nhiên 1 phim bộ trong cache, nếu thiếu episodes join thì bỏ qua cache để refresh
            const seriesMovie = cached.find(m => m.type === 'series');
            if (seriesMovie && !seriesMovie.episodes) {
                console.log("🔄 Cache data is old (missing episodes), skipping cache...");
            } else {
                allMovies = cached.map(normalizeMovieData);
                console.log("📦 Loaded Movies from Cache (0 reads)");
                renderAllInitialMovies();
                return;
            }
        }
    }

    const { data, error } = await supabase
        .from('movies')
        .select('*, episodes(id)')
        .eq('status', 'public')
        .order('created_at', { ascending: false });
    
    if (error) throw error;

    if (data && data.length > 0) {
        allMovies = data.map(normalizeMovieData);
        saveToCache("movies", allMovies);
        if (remoteTimestamp) setCacheTimestamp("movies", remoteTimestamp);
        console.log(`🌐 Fetched ${allMovies.length} Movies from Supabase`);
    } else {
        allMovies = SAMPLE_MOVIES;
    }

    renderAllInitialMovies();

  } catch (error) {
    console.error("Lỗi load movies:", error);
    allMovies = SAMPLE_MOVIES;
    renderAllInitialMovies();
  }
}

/**
 * Hàm gom nhóm các lệnh render phim ban đầu
 */
function renderAllInitialMovies() {
    renderFeaturedMovies();
    renderNewMovies();
    filterMovies(); // Render trang Tất Cả Phim có phân trang
    renderCountrySections();
    renderBannerSlider();
}

/**
 * Khởi tạo sample categories trong Firestore
 */
async function initializeSampleCategories() {
  if (!db) return;

  try {
    const batch = db.batch();
    SAMPLE_CATEGORIES.forEach((cat) => {
      const ref = db.collection("categories").doc(cat.id);
      batch.set(ref, cat);
    });
    await batch.commit();
    console.log("✅ Đã khởi tạo sample categories");
  } catch (error) {
    console.error("Lỗi khởi tạo categories:", error);
  }
}

/**
 * Khởi tạo sample countries trong Firestore
 */
async function initializeSampleCountries() {
  if (!db) return;

  try {
    const batch = db.batch();
    SAMPLE_COUNTRIES.forEach((country) => {
      const ref = db.collection("countries").doc(country.id);
      batch.set(ref, country);
    });
    await batch.commit();
    console.log("✅ Đã khởi tạo sample countries");
  } catch (error) {
    console.error("Lỗi khởi tạo countries:", error);
  }
}

/**
 * Khởi tạo sample movies trong Firestore
 */
async function initializeSampleMovies() {
  if (!db) return;

  try {
    const batch = db.batch();
    SAMPLE_MOVIES.forEach((movie) => {
      const ref = db.collection("movies").doc(movie.id);
      batch.set(ref, {
        ...movie,
        createdAt: firebase.firestore.Timestamp.fromDate(movie.createdAt),
      });
    });
    await batch.commit();
    console.log("✅ Đã khởi tạo sample movies");
  } catch (error) {
    console.error("Lỗi khởi tạo movies:", error);
  }
}

/**
 * Cập nhật thanh watch progress cho tất cả phim đã xem
 * Gọi hàm này sau khi đăng nhập và sau khi load movies
 */
async function updateAllWatchProgress() {
  if (!currentUser || !supabase) {
    console.log("⏳ updateAllWatchProgress: Chưa đăng nhập hoặc chưa có Supabase");
    return;
  }
  
  if (!allMovies || allMovies.length === 0) {
    console.log("⏳ updateAllWatchProgress: Chưa có movies");
    return;
  }
  
  try {
    const { data: historyData, error } = await supabase
      .from('watch_history')
      .select('*')
      .eq('user_id', currentUser.id);
    
    if (error) throw error;
    if (!historyData || historyData.length === 0) {
      console.log("⏳ updateAllWatchProgress: Không có watch progress");
      return;
    }
    
    console.log("📊 Tìm thấy", historyData.length, "watch progress từ Supabase");
    
    historyData.forEach((row) => {
      const movieId = row.movie_id;
      const resumeTime = row.resume_time || 0;
      const duration = row.duration || 0;
      
      if (resumeTime <= 0) return;
      
      let finalPercentage = 0;
      if (duration > 0) {
          finalPercentage = Math.min(Math.round((resumeTime / duration) * 100), 100);
      } else {
          const movie = allMovies.find(m => m.id === movieId);
          if (movie && movie.duration) {
              const durationMinutes = parseInt(movie.duration.replace(/\D/g, '')) || 60;
              finalPercentage = Math.min(Math.round((resumeTime / 60 / durationMinutes) * 100), 100);
          }
      }
      // Cập nhật cache
      window.userWatchHistoryCache[movieId] = finalPercentage;
      
    });
    
    console.log("✅ Hoàn tất cập nhật watch progress cache:", window.userWatchHistoryCache);

    // Render lại các trang chính để áp dụng progress
    if (typeof renderFeaturedMovies === 'function') renderFeaturedMovies();
    if (typeof renderNewMovies === 'function') renderNewMovies();
    if (typeof filterMovies === 'function') filterMovies(); // Cho trang Tất cả phim
    if (typeof filterSeriesMovies === 'function') filterSeriesMovies(); // Cho trang Phim bộ
    if (typeof filterSingleMovies === 'function') filterSingleMovies(); // Cho trang Phim lẻ

  } catch (error) {
    console.error("Lỗi cập nhật watch progress Supabase:", error);
  }
}

/**
 * Cập nhật UI progress bar cho một phim cụ thể
 * @param {string} movieId - ID của phim
 * @param {number} percentage - Phần trăm đã xem (0-100)
 */
function updateMovieProgressUI(movieId, percentage) {
  if (!movieId || percentage < 0) return;
  
  // Cập nhật cache toàn cục để các thẻ phim render sau này (khi chuyển trang) có dữ liệu
  if (window.userWatchHistoryCache) {
    window.userWatchHistoryCache[movieId] = percentage;
  }
  
  // Danh sách các ID có thể chứa progress bar (trang chủ, landscape, và modal lịch sử)
  const selectors = [
    `#progress-${movieId} .watch-progress-bar`,
    `#progress-ls-${movieId} .watch-progress-bar`,
    `#progress-history-${movieId} .history-progress-fill`
  ];
  
  selectors.forEach(selector => {
    const bars = document.querySelectorAll(selector);
    bars.forEach(bar => {
      const container = bar.parentElement;
      
      // Cập nhật width với hiệu ứng mượt mà
      bar.style.transition = "width 0.5s ease-in-out";
      bar.style.width = `${percentage}%`;
      
      if (container) {
          container.style.display = 'block';
      }
      
      // Thêm class has-watched cho card cha (nếu có)
      const movieCard = bar.closest('.movie-card, .movie-card-landscape, .history-card');
      if (movieCard) {
        movieCard.classList.add('has-watched');
        
        // Nếu là trong modal lịch sử, cập nhật thêm text thời gian
        if (movieCard.classList.contains('history-card')) {
            const timeText = movieCard.querySelector('.history-time');
            if (timeText && timeText.textContent.includes('đang xem')) {
                // Có thể cập nhật text ở đây nếu muốn
            }
        }
      }
    });
  });
}

/**
 * Lắng nghe thay đổi lịch sử xem từ Supabase Realtime (Đồng bộ đa tab/thiết bị)
 */
function startWatchHistoryRealtimeListener() {
    if (!supabase || !currentUser) return;

    console.log("📡 [Realtime] Đang lắng nghe thay đổi lịch sử xem...");

    supabase
        .channel('public:watch_history_progress')
        .on(
            'postgres_changes',
            {
                event: '*', // Lắng nghe cả INSERT và UPDATE
                schema: 'public',
                table: 'watch_history',
                filter: `user_id=eq.${currentUser.id}`
            },
            (payload) => {
                const data = payload.new;
                if (!data || !data.movie_id) return;

                // Tính toán phần trăm mới
                const movieId = data.movie_id;
                const resumeTime = data.resume_time || 0;
                const duration = data.duration || 0;

                if (resumeTime <= 0) return;

                let percentage = 0;
                if (duration > 0) {
                    percentage = Math.min(Math.round((resumeTime / duration) * 100), 100);
                } else {
                    const movie = typeof allMovies !== 'undefined' ? allMovies.find(m => m.id === movieId) : null;
                    if (movie && movie.duration) {
                        const durationMinutes = parseInt(movie.duration.replace(/\D/g, '')) || 60;
                        percentage = Math.min(Math.round((resumeTime / 60 / durationMinutes) * 100), 100);
                    }
                }

                // Cập nhật UI ngay lập tức
                console.log(`🔔 [Sync] Phát hiện thay đổi tiến trình phim ${movieId}: ${percentage}%`);
                updateMovieProgressUI(movieId, percentage);
            }
        )
        .subscribe();
}