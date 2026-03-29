/**
 * ============================================
 * TMDB SERVICE — TRẠM PHIM
 * Cung cấp dữ liệu bổ sung từ The Movie Database (TMDb)
 * Mỗi loại data được kiểm soát bởi toggle riêng trong Admin API
 * ============================================
 */

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p';

// --- Lấy API Key từ dbSettingsCache (được load bởi admin-api-keys.js) ---
function getTmdbKey() {
    if (typeof dbSettingsCache !== 'undefined' && dbSettingsCache['tmdb_api_key']) {
        return dbSettingsCache['tmdb_api_key'];
    }
    return null;
}

// --- Kiểm tra toggle bật/tắt từng loại data ---
function isTmdbEnabled(feature) {
    if (typeof dbSettingsCache === 'undefined') return false;
    return dbSettingsCache['tmdb_use_' + feature] === 'true';
}

/**
 * Làm sạch tên phim trước khi gửi cho TMDb (Loại bỏ Phần 1, Season 1, text trong ngoặc...)
 */
function _cleanTitleForTMDb(raw) {
    if (!raw) return '';
    let t = raw;
    t = t.replace(/\(Phần \d+\)/gi, '');
    t = t.replace(/\(Season \d+\)/gi, '');
    t = t.replace(/Phần \d+/gi, '');
    t = t.replace(/Season \d+/gi, '');
    t = t.replace(/\([^)]*\)/g, ''); // Xoá chữ trong ngoặc đơn
    return t.replace(/\s+/g, ' ').trim();
}

/**
 * Tìm phim trên TMDb theo dạng search/multi (hỗ trợ cả movie và tv)
 * @param {string} rawTitle - Tên phim đầu vào (ưu tiên 1)
 * @param {number|string} year - Năm phát hành
 * @param {string} secondaryTitle - Tên phụ (ưu tiên 2, thường là tiếng Việt/Anh còn lại)
 * @returns {object|null} - TMDb result object hoặc null nếu không tìm thấy
 */
async function searchTmdbByTitle(rawTitle, year, secondaryTitle = null) {
    const key = getTmdbKey();
    if (!key || !rawTitle) return null;

    let title = _cleanTitleForTMDb(rawTitle);

    try {
        const fetchTmdb = async (queryTitle) => {
            const params = new URLSearchParams({
                api_key: key,
                query: queryTitle,
                language: 'vi-VN',
                include_adult: 'false'
            });
            const res = await fetch(`${TMDB_BASE}/search/multi?${params}`);
            if (!res.ok) {
                if (res.status === 401) {
                    showNotification('TMDb API Key không hợp lệ! Vui lòng kiểm tra lại cấu hình.', 'error');
                }
                console.error('[TMDb Search] Lỗi API:', res.status);
                return null;
            }
            const data = await res.json();
            return data.results || [];
        };

        let results = await fetchTmdb(title);

        if (results.length === 0) {
            // Thử bỏ chữ năm hoặc tên phụ đi (cắt theo dấu : hoặc -)
            if (title.includes(':') || title.includes('-')) {
                const shortTitle = title.split(/[:\-]/)[0].trim();
                const shortResults = await fetchTmdb(shortTitle);
                if (shortResults && shortResults.length > 0) results = shortResults;
            }
        }

        // Nếu lấy Tên 1 (Tên Gốc) thất bại, thử lấy theo Tên 2 (Tiếng Việt)
        if (results.length === 0 && secondaryTitle && secondaryTitle !== rawTitle) {
            if (typeof _trailerBulkLog === 'function' && typeof _bulkScanTrailerRunning !== 'undefined' && _bulkScanTrailerRunning) {
                _trailerBulkLog(`⚠️ Không tìm thấy "${title}". Đang thử lại với tên khác: "${secondaryTitle}"...`);
            }
            const title2 = _cleanTitleForTMDb(secondaryTitle);
            results = await fetchTmdb(title2);
            
            if (results.length === 0 && (title2.includes(':') || title2.includes('-'))) {
                const shortTitle2 = title2.split(/[:\-]/)[0].trim();
                const shortResults2 = await fetchTmdb(shortTitle2);
                if (shortResults2 && shortResults2.length > 0) results = shortResults2;
            }
        }

        if (results.length === 0) return null;

        // Ưu tiên kết quả movie > tv, lấy kết quả có popularity cao nhất
        let sorted = results.sort((a, b) => {
            if (a.media_type === 'movie' && b.media_type !== 'movie') return -1;
            if (b.media_type === 'movie' && a.media_type !== 'movie') return 1;
            return (b.popularity || 0) - (a.popularity || 0);
        });

        // NẾU CÓ NĂM PHÁT HÀNH -> BẮT BUỘC PHẢI KHỚP NĂM (Vì TMDb /search/multi không hỗ trợ param year)
        if (year) {
            const tYear = Number(year);
            const matched = sorted.filter(item => {
                const itemDate = item.release_date || item.first_air_date;
                if (!itemDate) return false;
                const iYear = Number(itemDate.split('-')[0]);
                // Cho phép lệch tới 2 năm do chênh lệch múi giờ/ngày phát hành quốc tế
                return Math.abs(iYear - tYear) <= 2;
            });
            if (matched.length > 0) {
                sorted = matched;
            } else {
                console.warn(`[TMDb] Tìm thấy phim nhưng KHÔNG KHỚP NĂM phát hành (Cần năm: ${year}). Đã bỏ qua để tránh lấy nhầm trailer phim khác!`);
                return null;
            }
        }

        return sorted[0] || null;
    } catch (e) {
        console.warn('[TMDb] Lỗi tìm kiếm phim:', e.message);
        return null;
    }
}

/**
 * Lấy chi tiết phim từ TMDb (poster, backdrop, overview)
 * @param {number} tmdbId - TMDb movie/tv ID
 * @param {string} mediaType - 'movie' hoặc 'tv'
 * @returns {object|null}
 */
async function getTmdbDetails(tmdbId, mediaType = 'movie') {
    const key = getTmdbKey();
    if (!key || !tmdbId) return null;

    try {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const res = await fetch(`${TMDB_BASE}/${type}/${tmdbId}?api_key=${key}&language=vi-VN`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn('[TMDb] Lỗi lấy chi tiết phim:', e.message);
        return null;
    }
}

/**
 * Lấy trailer YouTube từ TMDb (Bao gồm fallback KinoCheck & Invidious)
 * @param {number} tmdbId
 * @param {string} mediaType
 * @param {string} movieTitle - Tên phim để fallback Invidious
 * @param {number|string} movieYear - Năm để fallback Invidious
 * @returns {string|null} - YouTube key của trailer hoặc null
 */
async function getTmdbTrailer(tmdbId, mediaType = 'movie', movieTitle = '', movieYear = '') {
    const key = getTmdbKey();
    let trailerKey = null;

    if (typeof _addImportLog === 'function') {
        if (key && tmdbId) _addImportLog(`🔍 Bắt đầu kiểm tra Trailer trên TMDb...`, 'info');
        else if (!tmdbId) _addImportLog(`⚠️ Phim không có ID TMDb (không tìm thấy trên TMDb). Bỏ qua bước TMDb.`, 'warning');
    }

    if (key && tmdbId) {
        try {
            const type = mediaType === 'tv' ? 'tv' : 'movie';
            const [resVi, resEn] = await Promise.all([
                fetch(`${TMDB_BASE}/${type}/${tmdbId}/videos?api_key=${key}&language=vi-VN`).catch(() => null),
                fetch(`${TMDB_BASE}/${type}/${tmdbId}/videos?api_key=${key}`).catch(() => null)
            ]);

            let videos = [];
            if (resVi && resVi.ok) {
                const dataVi = await resVi.json();
                videos = [...(dataVi.results || [])];
            }
            if (resEn && resEn.ok) {
                const dataEn = await resEn.json();
                (dataEn.results || []).forEach(v => {
                    if (!videos.find(x => x.key === v.key)) videos.push(v);
                });
            }

            const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
                || videos.find(v => v.site === 'YouTube' && v.type === 'Trailer')
                || videos.find(v => v.site === 'YouTube' && v.type === 'Teaser')
                || videos.find(v => v.site === 'YouTube');

            if (trailer && trailer.key) {
                trailerKey = trailer.key;
            }
        } catch (e) {
            console.warn('[TMDb] Lỗi lấy trailer:', e.message);
        }
    }

    if (trailerKey) {
        if (typeof _addImportLog === 'function') _addImportLog(`✅ Trailer lấy thành công từ TMDb!`, 'success');
        if (typeof _trailerBulkLog === 'function' && typeof _bulkScanTrailerRunning !== 'undefined' && _bulkScanTrailerRunning) _trailerBulkLog(`✅ Đã lấy Trailer từ TMDb.`);
        return trailerKey;
    }

    if (typeof _addImportLog === 'function') _addImportLog(`❌ Không tìm được Trailer trên TMDb.`, 'error');
    if (typeof _trailerBulkLog === 'function' && typeof _bulkScanTrailerRunning !== 'undefined' && _bulkScanTrailerRunning) _trailerBulkLog(`❌ Không tìm được Trailer trên TMDb.`);
    return null;
}

/**
 * Lấy danh sách diễn viên từ TMDb
 * @param {number} tmdbId
 * @param {string} mediaType
 * @returns {Array} - Mảng diễn viên [{name, profile_path, character, id}]
 */
async function getTmdbCast(tmdbId, mediaType = 'movie') {
    const key = getTmdbKey();
    if (!key || !tmdbId) return [];

    try {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const res = await fetch(`${TMDB_BASE}/${type}/${tmdbId}/credits?api_key=${key}`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.cast || []).slice(0, 20); // Lấy tối đa 20 diễn viên đầu
    } catch (e) {
        console.warn('[TMDb] Lỗi lấy diễn viên:', e.message);
        return [];
    }
}

/**
 * Lấy thông tin chi tiết của 1 người (diễn viên / đạo diễn) từ TMDb
 * Trả về: biography, birthday, place_of_birth, gender, known_for_department
 * @param {number} personId - TMDb person ID
 * @returns {object|null}
 */
async function getTmdbPersonDetails(personId) {
    const key = getTmdbKey();
    if (!key || !personId) return null;

    try {
        // Lấy song song: thông tin tiếng Việt và tiếng Anh
        const [resVi, resEn] = await Promise.all([
            fetch(`${TMDB_BASE}/person/${personId}?api_key=${key}&language=vi-VN`).catch(() => null),
            fetch(`${TMDB_BASE}/person/${personId}?api_key=${key}`).catch(() => null)
        ]);

        let dataVi = null, dataEn = null;
        if (resVi && resVi.ok) dataVi = await resVi.json();
        if (resEn && resEn.ok) dataEn = await resEn.json();

        if (!dataEn && !dataVi) return null;

        const base = dataEn || dataVi;
        const vi = dataVi || {};

        // Ưu tiên biography tiếng Việt nếu có, dùng tiếng Anh làm fallback
        const biography = (vi.biography && vi.biography.length > 30)
            ? vi.biography
            : (base.biography || '');

        // Map gender TMDb -> tiếng Việt
        const genderMap = { 0: '', 1: 'Nữ', 2: 'Nam', 3: 'Phi nhị phân' };
        const gender = genderMap[base.gender] || '';

        // Map known_for_department -> vai trò tiếng Việt
        const roleMap = {
            'Acting': 'Diễn viên',
            'Directing': 'Đạo diễn',
            'Writing': 'Biên kịch',
            'Production': 'Nhà sản xuất',
            'Sound': 'Kỹ thuật âm thanh',
            'Camera': 'Quảy phim',
            'Editing': 'Dựng phim',
            'Art': 'Thiết kế',
            'Costume & Make-Up': 'Trang điểm',
            'Visual Effects': 'Kỹ xảo',
            'Crew': 'Ekip',
        };
        const role = roleMap[base.known_for_department] || base.known_for_department || 'Diễn viên';

        return {
            tmdbPersonId: personId,
            biography,
            gender,
            role,
            dob: base.birthday || null,          // Định dạng YYYY-MM-DD
            country: base.place_of_birth || '',   // Nơi sinh / nơi sống
            profile_path: base.profile_path || null
        };
    } catch (e) {
        console.warn('[TMDb] Lỗi lấy chi tiết người:', e.message);
        return null;
    }
}

/**
 * Tạo URL ảnh đầy đủ từ TMDb path
 * @param {string} path - Đường dẫn từ TMDb (ví dụ: /abc123.jpg)
 * @param {string} size - 'w300', 'w500', 'w780', 'original'
 */
function buildTmdbImageUrl(path, size = 'w500') {
    if (!path) return null;
    return `${TMDB_IMG_BASE}/${size}${path}`;
}

/**
 * HÀM CHÍNH: Bổ sung dữ liệu TMDb vào movie object
 * Kiểm tra từng toggle trước khi gọi API tương ứng
 * Không ghi đè dữ liệu gốc đã có sẵn
 * @param {object} movie - Movie object từ Supabase/KKPhim
 * @returns {object} - Movie đã được bổ sung data TMDb
 */
async function enrichMovieWithTmdb(movie) {
    const key = getTmdbKey();
    if (!key || !movie) return movie;

    // Kiểm tra xem có bất kỳ toggle nào bật không
    const anyEnabled = ['poster', 'trailer', 'backdrop', 'cast'].some(f => isTmdbEnabled(f));
    if (!anyEnabled) return movie;

    try {
        // Bước 1: Tìm phim trên TMDb
        const searchTitle = movie.originTitle || movie.title;
        const tmdbResult = await searchTmdbByTitle(searchTitle, movie.year);

        if (!tmdbResult) {
            console.log('[TMDb] Không tìm thấy phim:', movie.title);
            return movie;
        }

        const tmdbId = tmdbResult.id;
        const mediaType = tmdbResult.media_type || 'movie';
        console.log(`[TMDb] Tìm thấy: ${tmdbResult.title || tmdbResult.name} (ID: ${tmdbId}, type: ${mediaType})`);

        // Lưu TMDb ID vào movie object để tái sử dụng
        movie._tmdbId = tmdbId;
        movie._tmdbType = mediaType;

        // Bước 2: Fetch song song các loại data đã bật toggle
        const fetchPromises = {};
        if (isTmdbEnabled('poster') || isTmdbEnabled('backdrop')) {
            fetchPromises.details = getTmdbDetails(tmdbId, mediaType);
        }
        // Trailer: ưu tiên theo thứ tự: DB field > memory cache > API call
        if (isTmdbEnabled('trailer')) {
            if (movie.tmdb_trailer_key) {
                // 1. Đã có sẵn trong movie object (từ bảng movies DB)
                movie._tmdbTrailerKey = movie.tmdb_trailer_key;
            } else {
                const cachedTrailer = getTrailerFromCache(movie.id);
                if (cachedTrailer) {
                    // 2. Lấy từ memory cache
                    movie._tmdbTrailerKey = cachedTrailer;
                } else {
                    // 3. Fetch từ API TMDb (chậm nhất, chỉ khi cần)
                    fetchPromises.trailer = getTmdbTrailer(tmdbId, mediaType, searchTitle, movie.year);
                }
            }
        }
        if (isTmdbEnabled('cast')) {
            fetchPromises.cast = getTmdbCast(tmdbId, mediaType);
        }

        const keys = Object.keys(fetchPromises);
        const values = await Promise.all(keys.map(k => fetchPromises[k]));
        const results = {};
        keys.forEach((k, i) => results[k] = values[i]);

        // Bước 3: Áp dụng dữ liệu (chỉ khi ảnh gốc bị lỗi hoặc thiếu)
        const details = results.details;

        if (details) {
            // Poster HD: chỉ dùng khi ảnh gốc bị lỗi (được xử lý bởi onerror ảnh)
            if (isTmdbEnabled('poster') && details.poster_path) {
                movie._tmdbPosterUrl = buildTmdbImageUrl(details.poster_path, 'w500');
            }

            // Backdrop: chỉ dùng khi ảnh nền gốc bị lỗi
            if (isTmdbEnabled('backdrop') && details.backdrop_path) {
                movie._tmdbBackdropUrl = buildTmdbImageUrl(details.backdrop_path, 'w1280');
            }
        }

        // Trailer YouTube (từ API nếu không có trong cache)
        if (isTmdbEnabled('trailer') && results.trailer && !movie._tmdbTrailerKey) {
            movie._tmdbTrailerKey = results.trailer;
        }

        // Thông tin diễn viên từ TMDb (bổ sung thêm, không ghi đè)
        if (isTmdbEnabled('cast') && results.cast && results.cast.length > 0) {
            movie._tmdbCast = results.cast;
        }

        console.log('[TMDb] Đã bổ sung dữ liệu cho:', movie.title);
    } catch (e) {
        console.warn('[TMDb] Lỗi enrichMovieWithTmdb:', e.message);
    }

    return movie;
}

/**
 * Áp dụng TMDb poster làm fallback khi ảnh gốc lỗi
 * Gán vào thuộc tính onerror của thẻ img, khi kích hoạt sẽ update URL mới vào Supabase luôn!
 * @param {HTMLImageElement} imgEl - Phần tử ảnh
 * @param {string} fallbackUrl - URL ảnh TMDb dự phòng
 * @param {string} movieId - ID của phim trong database
 */
function applyTmdbPosterFallback(imgEl, fallbackUrl, movieId) {
    if (!imgEl || !fallbackUrl) return;
    const original = imgEl.onerror;
    imgEl.onerror = function() {
        if (this.src !== fallbackUrl) {
            this.src = fallbackUrl;
            console.log(`[TMDb Fallback] 🔄 Thay ảnh poster lỗi bằng TMDb: ${fallbackUrl}`);
            
            // Xóa onerror để tránh lặp vô hạn nếu ảnh TMDb lại tiếp tục lỗi
            this.onerror = original; 

            // Cập nhật DB và ghi log
            _logAutoFixToDb(movieId, fallbackUrl, 'poster');
        } else if (original) {
            original.call(this);
        }
    };
}

/**
 * Áp dụng TMDb backdrop làm fallback cho thuộc tính background-image.
 * @param {HTMLElement} bgEl - Phần tử chứa background-image
 * @param {string} fallbackUrl - URL ảnh TMDb dự phòng
 * @param {string} movieId - ID của phim trong database
 */
function applyTmdbBackdropFallback(bgEl, fallbackUrl, movieId) {
    if (!bgEl || !fallbackUrl) return;

    const currentBg = bgEl.style.backgroundImage;
    // Kiểm tra nhanh nếu đang trống hoặc bằng none
    if (!currentBg || currentBg === "url('')" || currentBg === 'none') {
        bgEl.style.backgroundImage = `url('${fallbackUrl}')`;
        _logAutoFixToDb(movieId, fallbackUrl, 'backdrop');
        return;
    }

    // Nếu có background, tạo Image() để "test" xem có lỗi tải không
    const testImg = new Image();
    testImg.onerror = () => {
        console.log(`[TMDb Fallback] 🔄 Thay ảnh nền lỗi bằng TMDb: ${fallbackUrl}`);
        bgEl.style.backgroundImage = `url('${fallbackUrl}')`;
        _logAutoFixToDb(movieId, fallbackUrl, 'backdrop');
    };

    // Trích xuất URL bên trong `url("...")`
    const urlMatch = currentBg.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    if (urlMatch && urlMatch[1]) {
        testImg.src = urlMatch[1];
    }
}

// Cập nhật CSDL và ghi log vào error_reports để Admin theo dõi
function _logAutoFixToDb(movieId, fallbackUrl, type) {
    if (!movieId || typeof window.supabase === 'undefined') return;
    
    // 1. Cập nhật bảng movies
    const updateData = type === 'poster' ? { poster_url: fallbackUrl } : { background_url: fallbackUrl };
    window.supabase.from('movies').update(updateData).eq('id', movieId).then(({error}) => {
        if (!error) console.log(`[TMDb Auto-Fix] Đã lưu ${type} mới: ${movieId}`);
    });

    // 2. Fetch tiêu đề phim và chèn vào error_reports dạng "resolved"
    window.supabase.from('movies').select('title').eq('id', movieId).maybeSingle().then(({data}) => {
        if (data && data.title) {
            window.supabase.from('error_reports').insert({
                movie_id: movieId,
                movie_title: data.title,
                user_name: "Hệ thống (Auto-Fix)",
                error_type: "auto_fix_" + type,
                description: `Tự động thay thế ${type === 'poster' ? 'Poster' : 'Backdrop'} bị lỗi bằng ảnh TMDb: ${fallbackUrl}`,
                status: "resolved",
                report_count: 1,
                created_at: new Date().toISOString(),
                resolved_at: new Date().toISOString()
            }).then(() => {});
        }
    });
}

/**
 * Hiện modal trailer YouTube
 * @param {string} youtubeKey - YouTube video key
 * @param {string} movieTitle - Tên phim để hiển thị trong modal
 */
function showTrailerModal(youtubeKey, movieTitle) {
    if (!youtubeKey) {
        showNotification('Không tìm thấy trailer cho phim này!', 'warning');
        return;
    }

    // Kiểm tra modal đã có chưa, nếu chưa thì tạo mới
    let modal = document.getElementById('tmdbTrailerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tmdbTrailerModal';
        modal.className = 'tmdb-trailer-overlay';
        modal.innerHTML = `
            <div class="tmdb-trailer-container">
                <div class="tmdb-trailer-header">
                    <h3 class="tmdb-trailer-title"><i class="fab fa-youtube"></i> <span id="tmdbTrailerTitle"></span></h3>
                    <button class="tmdb-trailer-close" onclick="closeTrailerModal()" title="Đóng">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="tmdb-trailer-body">
                    <iframe id="tmdbTrailerIframe"
                        src=""
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen>
                    </iframe>
                </div>
            </div>
        `;
        // Đóng khi click bên ngoài
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeTrailerModal();
        });
        document.body.appendChild(modal);
    }

    // Điền nội dung
    const titleEl = document.getElementById('tmdbTrailerTitle');
    const iframe = document.getElementById('tmdbTrailerIframe');
    if (titleEl) titleEl.textContent = `Trailer - ${movieTitle}`;
    if (iframe) iframe.src = `https://www.youtube.com/embed/${youtubeKey}?autoplay=1&rel=0`;

    // Hiện modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * Đóng modal trailer và dừng video
 */
function closeTrailerModal() {
    const modal = document.getElementById('tmdbTrailerModal');
    if (!modal) return;
    const iframe = document.getElementById('tmdbTrailerIframe');
    if (iframe) iframe.src = ''; // Dừng video
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================================
// QUÉT HÀNG LOẠT TRAILER TỪ TMDB (ADMIN ONLY)
// ============================================================

/** Cache trailer keys trong memory khi load xong */
let _tmdbTrailersCache = null;

/**
 * Load trailer cache từ system_settings (Supabase) vào memory
 * Gọi 1 lần khi khởi động để các trang phim dùng được ngay
 */
async function loadTmdbTrailersCache() {
    if (!window.supabase) return;
    try {
        const { data } = await window.supabase
            .from('system_settings')
            .select('key_value')
            .eq('key_name', 'tmdb_trailers_map')
            .maybeSingle();
        if (data && data.key_value) {
            _tmdbTrailersCache = JSON.parse(data.key_value);
            console.log(`[TMDb] Đã load trailer cache: ${Object.keys(_tmdbTrailersCache).length} phim`);
        }
    } catch (e) {
        console.warn('[TMDb] Không load được trailer cache:', e.message);
    }
}

/**
 * Lấy trailer key từ cache (không gọi API)
 * @param {string} movieId - ID phim trong DB
 * @returns {string|null}
 */
function getTrailerFromCache(movieId) {
    if (!_tmdbTrailersCache) return null;
    return _tmdbTrailersCache[movieId] || null;
}

/**
 * Quét toàn bộ phim, fetch trailer từ TMDb & Invidious, lưu vào system_settings
 */
async function bulkScanTmdbTrailers() {
    if (_bulkScanTrailerRunning) {
        showNotification('Đang có lần quét trailer khác chạy!', 'warning');
        return;
    }
    const key = getTmdbKey();
    if (!key) { 
        showNotification('Chưa cấu hình TMDb API Key. Sẽ chỉ sử dụng nguồn dự phòng (Invidious) để quét Trailer!', 'info'); 
    }
    if (!window.supabase) { showNotification('Chưa có Supabase!', 'error'); return; }

    _bulkScanTrailerRunning = true;
    _renderBulkTrailerModal(true);

    try {
        _trailerBulkLog('🎬 Đang tải danh sách phim...');
        const { data: movies, error: moviesErr } = await window.supabase
            .from('movies')
            .select('id, title, origin_title, year, tmdb_trailer_key');
        if (moviesErr) throw moviesErr;

        _trailerBulkLog(`📋 Có ${movies.length} phim. Bắt đầu quét trailer...`);

        let found = 0, skipped = 0, notFound = 0;

        for (let i = 0; i < movies.length; i++) {
            if (!_bulkScanTrailerRunning) break;

            const movie = movies[i];
            const progress = Math.round(((i + 1) / movies.length) * 95);
            _trailerBulkSetProgress(progress);

            // Bỏ qua nếu đã có trailer trong bảng movies
            if (movie.tmdb_trailer_key) {
                skipped++;
                // Cập nhật cache memory luôn
                if (!_tmdbTrailersCache) _tmdbTrailersCache = {};
                _tmdbTrailersCache[movie.id] = movie.tmdb_trailer_key;
                continue;
            }

            _trailerBulkLog(`🔍 [${i+1}/${movies.length}] ${movie.title}...`);

            // Tìm TMDb (Nếu có Key)
            const searchTitle = movie.origin_title || movie.title;
            const tmdbResult = await searchTmdbByTitle(searchTitle, movie.year, movie.title);
            const tmdbId = tmdbResult ? tmdbResult.id : null;
            const mediaType = tmdbResult ? (tmdbResult.media_type || 'movie') : 'movie';

            // Lấy trailer key (getTmdbTrailer đã có tính năng tự fallback sang Invidious nếu tmdbId rỗng)
            const trailerKey = await getTmdbTrailer(tmdbId, mediaType, searchTitle, movie.year);
            if (trailerKey) {
                // Lưu trực tiếp vào bảng movies
                const { error: upErr } = await window.supabase
                    .from('movies')
                    .update({ tmdb_trailer_key: trailerKey })
                    .eq('id', movie.id);

                if (!upErr) {
                    // Cập nhật cache memory
                    if (!_tmdbTrailersCache) _tmdbTrailersCache = {};
                    _tmdbTrailersCache[movie.id] = trailerKey;
                    // Cập nhật allMovies cache nếu có
                    if (typeof allMovies !== 'undefined' && allMovies) {
                        const cached = allMovies.find(m => m.id === movie.id);
                        if (cached) cached.tmdb_trailer_key = trailerKey;
                    }
                    found++;
                    _trailerBulkLog(`✅ Đã lưu trailer: ${movie.title}`);
                } else {
                    _trailerBulkLog(`❌ Lỗi lưu DB: ${movie.title} — ${upErr.message}`);
                    notFound++;
                }
            } else {
                _trailerBulkLog(`❌ Không có trailer: ${movie.title}`);
                notFound++;
            }

            // Nghỉ 250ms để tránh rate limit TMDb
            await new Promise(r => setTimeout(r, 250));
        }

        _trailerBulkSetProgress(100);
        _trailerBulkLog(`\n🎉 Hoàn thành!\n✅ Tìm và lưu được: ${found} trailer\n⏭️ Đã có sẵn: ${skipped}\n❌ Không tìm được: ${notFound}`);
        showNotification(`✅ Đã lưu ${found} trailer vào bảng movies!`, 'success');

        // Cập nhật giao diện Quản lý Trailer nếu đang mở
        if (typeof loadAdminTrailers === 'function') {
            const panel = document.getElementById('trailersPanel');
            if (panel && panel.classList.contains('active')) {
                loadAdminTrailers(currentTrailersPage || 1);
            }
        }

    } catch (e) {
        console.error('[TMDb Trailer Bulk] Lỗi:', e);
        _trailerBulkLog('❌ Lỗi hệ thống: ' + e.message);
        showNotification('Lỗi quét trailer: ' + e.message, 'error');
    } finally {
        _bulkScanTrailerRunning = false;
        const cancelBtn = document.getElementById('trailerBulkCancelBtn');
        const doneBtn = document.getElementById('trailerBulkDoneBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (doneBtn) doneBtn.style.display = 'inline-flex';
    }
}

let _bulkScanTrailerRunning = false;
function _trailerBulkLog(msg) {
    const el = document.getElementById('trailerBulkLog');
    if (!el) return;
    el.textContent += msg + '\n';
    el.scrollTop = el.scrollHeight;
}
function _trailerBulkSetProgress(p) {
    const bar = document.getElementById('trailerBulkProgressBar');
    const label = document.getElementById('trailerBulkProgressLabel');
    if (bar) bar.style.width = p + '%';
    if (label) label.textContent = Math.round(p) + '%';
}
function _renderBulkTrailerModal(show = true) {
    let modal = document.getElementById('tmdbTrailerBulkModal');
    if (!show) { if (modal) modal.classList.remove('active'); return; }
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tmdbTrailerBulkModal';
        modal.className = 'tmdb-trailer-overlay';
        modal.innerHTML = `
            <div class="tmdb-trailer-container" style="max-width:680px;">
                <div class="tmdb-trailer-header" style="background:linear-gradient(135deg,#c62828,#880e4f);">
                    <h3 class="tmdb-trailer-title"><i class="fab fa-youtube"></i> Quét Trailer Hàng Loạt</h3>
                    <button class="tmdb-trailer-close" onclick="_renderBulkTrailerModal(false);_bulkScanTrailerRunning=false;" title="Đóng"><i class="fas fa-times"></i></button>
                </div>
                <div style="padding:20px;">
                    <div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
                        <span style="color:#aaa;font-size:13px;"><i class="fas fa-info-circle"></i> Bỏ qua phim đã có trailer trong cache.</span>
                        <span id="trailerBulkProgressLabel" style="font-weight:700;color:#ef9a9a;">0%</span>
                    </div>
                    <div style="background:#222;border-radius:8px;height:8px;margin-bottom:16px;overflow:hidden;">
                        <div id="trailerBulkProgressBar" style="height:100%;width:0%;background:linear-gradient(90deg,#ef5350,#ff8a80);transition:width 0.4s ease;border-radius:8px;"></div>
                    </div>
                    <div id="trailerBulkLog" style="background:#111;border:1px solid #333;border-radius:8px;padding:12px;height:280px;overflow-y:auto;font-family:monospace;font-size:12px;color:#ccc;white-space:pre-wrap;line-height:1.6;"></div>
                    <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end;">
                        <button id="trailerBulkCancelBtn" class="btn btn-sm" style="background:rgba(255,0,0,0.15);color:#ff4444;border:1px solid rgba(255,0,0,0.3);" onclick="_bulkScanTrailerRunning=false;_trailerBulkLog('⏹️ Đã dừng.');">
                            <i class="fas fa-stop"></i> Dừng lại
                        </button>
                        <button id="trailerBulkDoneBtn" class="btn btn-sm btn-primary" style="display:none;" onclick="_renderBulkTrailerModal(false)">
                            <i class="fas fa-check"></i> Đóng
                        </button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
    } else {
        const el = document.getElementById('trailerBulkLog');
        if (el) el.textContent = '';
        _trailerBulkSetProgress(0);
        const c = document.getElementById('trailerBulkCancelBtn');
        const d = document.getElementById('trailerBulkDoneBtn');
        if (c) c.style.display = 'inline-flex';
        if (d) d.style.display = 'none';
    }
    modal.classList.add('active');
}

// ============================================================
// QUÉT HÀNG LOẠT DIỄN VIÊN TỪ TMDB (ADMIN ONLY)
// ============================================================

let _bulkScanRunning = false;

/**
 * Quét toàn bộ phim trên web, bổ sung ảnh và thông tin diễn viên
 * từ TMDb vào bảng actors trong Supabase.
 * - Chỉ cập nhật actors thiếu ảnh (avatar trống hoặc dùng ui-avatars)
 * - Bổ sung biography, known_for nếu bảng actors hỗ trợ
 * - Có thanh tiến trình UI trong Admin
 */
async function bulkScanTmdbCast() {
    if (_bulkScanRunning) {
        showNotification('Đang có lần quét khác chạy, vui lòng chờ!', 'warning');
        return;
    }

    const key = getTmdbKey();
    if (!key) {
        showNotification('Chưa cấu hình TMDb API Key!', 'error');
        return;
    }

    if (!window.supabase) {
        showNotification('Chưa kết nối Supabase!', 'error');
        return;
    }

    _bulkScanRunning = true;
    _renderBulkScanModal(true);

    try {
        // Bước 1: Load toàn bộ actors từ Supabase
        _bulkLog('📋 Đang tải danh sách diễn viên từ Supabase...');
        const { data: actorsData, error: actorsErr } = await window.supabase
            .from('actors').select('*');
        if (actorsErr) throw actorsErr;

        // Chỉ lấy actors thiếu ảnh (avatar trống hoặc dùng ui-avatars placeholder)
        const actorsMissingPhoto = (actorsData || []).filter(a =>
            !a.avatar || a.avatar.trim() === '' || a.avatar.includes('ui-avatars.com')
        );

        if (actorsMissingPhoto.length === 0) {
            _bulkLog('✅ Tất cả diễn viên đã có ảnh đầy đủ. Không cần quét.');
            _bulkSetProgress(100);
            _bulkScanRunning = false;
            return;
        }

        _bulkLog(`🎭 Tìm thấy ${actorsMissingPhoto.length} diễn viên cần bổ sung ảnh.`);

        // Bước 2: Load danh sách phim để biết phim nào có actor nào
        _bulkLog('🎬 Đang tải danh sách phim...');
        const { data: moviesData, error: moviesErr } = await window.supabase
            .from('movies').select('id, title, origin_title, year, cast_data');
        if (moviesErr) throw moviesErr;

        const movies = moviesData || [];
        _bulkLog(`🎬 Có ${movies.length} phim cần xử lý.`);

        // Bước 3: Tạo map tên actor -> supabase object (để tra nhanh)
        const actorMapByName = {};
        actorsMissingPhoto.forEach(a => {
            actorMapByName[a.name.toLowerCase().trim()] = a;
        });

        // Bước 4: Quét từng phim
        let updatedCount = 0;
        let processedMovies = 0;
        const updatedActors = new Set(); // Theo dõi actor đã cập nhật để không gọi lại

        for (const movie of movies) {
            if (!_bulkScanRunning) break; // Dừng nếu người dùng cancel

            processedMovies++;
            const progress = Math.round((processedMovies / movies.length) * 85); // 85% cho vòng quét
            _bulkSetProgress(progress);

            // Lấy danh sách tên actor của phim này
            const movieActorNames = _extractActorNamesFromMovie(movie);
            if (movieActorNames.length === 0) continue;

            // Kiểm tra xem phim có actor nào thiếu ảnh không
            const needsScan = movieActorNames.some(name => actorMapByName[name.toLowerCase().trim()]);
            if (!needsScan) continue;

            _bulkLog(`🔍 [${processedMovies}/${movies.length}] Quét phim: ${movie.title}...`);

            // Tìm phim trên TMDb
            const searchTitle = movie.origin_title || movie.title;
            const tmdbResult = await searchTmdbByTitle(searchTitle, movie.year, movie.title);
            if (!tmdbResult) {
                _bulkLog(`⚠️ Không tìm thấy "${movie.title}" trên TMDb.`);
                continue;
            }

            // Lấy cast từ TMDb
            const tmdbCast = await getTmdbCast(tmdbResult.id, tmdbResult.media_type || 'movie');
            if (!tmdbCast || tmdbCast.length === 0) continue;

            // Tạo map TMDb name -> actor object
            const tmdbCastMapLower = {};
            tmdbCast.forEach(c => {
                if (c.name) tmdbCastMapLower[c.name.toLowerCase().trim()] = c;
            });

            // Bổ sung ảnh cho từng actor thiếu trong phim này
            for (const actorName of movieActorNames) {
                const nameLower = actorName.toLowerCase().trim();
                const dbActor = actorMapByName[nameLower];
                if (!dbActor || updatedActors.has(dbActor.id)) continue;

                const tmdbActor = tmdbCastMapLower[nameLower];
                if (!tmdbActor || !tmdbActor.profile_path) continue;

                // --- Lấy thông tin chi tiết của diễn viên (bio, gender, dob, country, role) ---
                const personDetails = await getTmdbPersonDetails(tmdbActor.id);

                // --- Xây dựng payload chỉ ghi đè các trường đang trống ---
                const updatePayload = {};

                // Ảnh: chỉ cập nhật nếu chưa có
                if (!dbActor.avatar || dbActor.avatar.includes('ui-avatars.com')) {
                    const avatarPath = personDetails?.profile_path || tmdbActor.profile_path;
                    if (avatarPath) updatePayload.avatar = `https://image.tmdb.org/t/p/w300${avatarPath}`;
                }

                // Bio: chỉ ghi nếu trống
                if (!dbActor.bio && personDetails?.biography) {
                    updatePayload.bio = personDetails.biography;
                }

                // Giới tính
                if (!dbActor.gender && personDetails?.gender) {
                    updatePayload.gender = personDetails.gender;
                }

                // Vai trò (Actor / Director...)
                if (!dbActor.role && personDetails?.role) {
                    updatePayload.role = personDetails.role;
                }

                // Ngày sinh
                if (!dbActor.dob && personDetails?.dob) {
                    updatePayload.dob = personDetails.dob;
                }

                // Quốc gia / nơi sinh
                if (!dbActor.country && personDetails?.country) {
                    updatePayload.country = personDetails.country;
                }

                // Thười điểm cập nhật
                updatePayload.updated_at = new Date().toISOString();

                if (Object.keys(updatePayload).length <= 1) {
                    // Chỉ có updated_at, không có gì mới -> bỏ qua
                    continue;
                }

                const { error: updateErr } = await window.supabase
                    .from('actors')
                    .update(updatePayload)
                    .eq('id', dbActor.id);

                if (!updateErr) {
                    updatedActors.add(dbActor.id);
                    updatedCount++;
                    // Sync local allActors cache với đầy đủ các trường mới
                    if (typeof allActors !== 'undefined' && allActors) {
                        const cached = allActors.find(a => a.id === dbActor.id);
                        if (cached) Object.assign(cached, updatePayload);
                    }
                    // Log chi tiết những gì đã cập nhật
                    const updatedFields = Object.keys(updatePayload)
                        .filter(k => k !== 'updated_at')
                        .map(k => ({ avatar: '📷 Ảnh', bio: '📝 Bio', gender: '⚧ Giới tính', role: '🎬 Vai trò', dob: '🎂 Năm sinh', country: '📍 Nơi sinh' })[k] || k)
                        .join(', ');
                    _bulkLog(`✅ ${actorName} — cập nhật: ${updatedFields}`);
                } else {
                    _bulkLog(`❌ Lỗi cập nhật ${actorName}: ${updateErr.message}`);
                }

                // Nghỉ nhỏ để tránh rate limit TMDb (40 req/10s)
                await new Promise(r => setTimeout(r, 150));
            }
        }

        _bulkSetProgress(100);
        _bulkLog(`\n🎉 Hoàn thành! Đã bổ sung thông tin cho ${updatedCount} diễn viên.`);

        if (updatedCount > 0) {
            showNotification(`✅ Đã cập nhật thông tin cho ${updatedCount} diễn viên từ TMDb!`, 'success');
        } else {
            showNotification('Không tìm thấy thêm ảnh nào từ TMDb.', 'info');
        }

    } catch (e) {
        console.error('[TMDb Bulk] Lỗi quét hàng loạt:', e);
        _bulkLog('❌ Lỗi hệ thống: ' + e.message);
        showNotification('Lỗi quét TMDb: ' + e.message, 'error');
    } finally {
        _bulkScanRunning = false;
        // Hiện nút đóng / chạy lại
        const cancelBtn = document.getElementById('bulkScanCancelBtn');
        const doneBtn = document.getElementById('bulkScanDoneBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (doneBtn) doneBtn.style.display = 'inline-flex';
    }
}

/** Trích xuất tên diễn viên từ movie object — dùng cast_data (JSONB array {id, name}) */
function _extractActorNamesFromMovie(movie) {
    // cast_data là cột thực trong Supabase: mảng [{id, name}, ...]
    if (movie.cast_data && Array.isArray(movie.cast_data) && movie.cast_data.length > 0) {
        return movie.cast_data.map(a => (a.name || '').trim()).filter(Boolean);
    }
    return [];
}

/** Ghi log vào panel quét */
function _bulkLog(msg) {
    const logEl = document.getElementById('bulkScanLog');
    if (!logEl) return;
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
}

/** Cập nhật thanh tiến trình */
function _bulkSetProgress(percent) {
    const bar = document.getElementById('bulkScanProgressBar');
    const label = document.getElementById('bulkScanProgressLabel');
    if (bar) bar.style.width = percent + '%';
    if (label) label.textContent = Math.round(percent) + '%';
}

/** Render modal panel quét hàng loạt */
function _renderBulkScanModal(show = true) {
    let modal = document.getElementById('tmdbBulkScanModal');

    if (!show) {
        if (modal) modal.classList.remove('active');
        return;
    }

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tmdbBulkScanModal';
        modal.className = 'tmdb-trailer-overlay'; // Tái dùng overlay style
        modal.innerHTML = `
            <div class="tmdb-trailer-container" style="max-width:700px;">
                <div class="tmdb-trailer-header" style="background: linear-gradient(135deg,#1976d2,#0d47a1);">
                    <h3 class="tmdb-trailer-title"><i class="fas fa-magic"></i> Quét Hàng Loạt Diễn Viên từ TMDb</h3>
                    <button class="tmdb-trailer-close" onclick="_renderBulkScanModal(false); _bulkScanRunning=false;" title="Đóng">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#aaa; font-size: 13px;"><i class="fas fa-info-circle"></i> Chỉ cập nhật actor chưa có ảnh. Không ghi đè ảnh đã có.</span>
                        <span id="bulkScanProgressLabel" style="font-weight:700; color:#01b4e4;">0%</span>
                    </div>
                    <div style="background:#222; border-radius:8px; height:8px; margin-bottom:16px; overflow:hidden;">
                        <div id="bulkScanProgressBar" style="height:100%; width:0%; background: linear-gradient(90deg,#01b4e4,#90caf9); transition: width 0.4s ease; border-radius:8px;"></div>
                    </div>
                    <div id="bulkScanLog" style="background:#111; border:1px solid #333; border-radius:8px; padding:12px; height:280px; overflow-y:auto; font-family:monospace; font-size:12px; color:#ccc; white-space:pre-wrap; line-height:1.6;"></div>
                    <div style="margin-top: 16px; display:flex; gap:10px; justify-content:flex-end;">
                        <button id="bulkScanCancelBtn" class="btn btn-sm" style="background:rgba(255,0,0,0.15);color:#ff4444;border:1px solid rgba(255,0,0,0.3);" onclick="_bulkScanRunning=false; _bulkLog('⏹️ Đã dừng quét theo yêu cầu.');">
                            <i class="fas fa-stop"></i> Dừng lại
                        </button>
                        <button id="bulkScanDoneBtn" class="btn btn-sm btn-primary" style="display:none;" onclick="_renderBulkScanModal(false)">
                            <i class="fas fa-check"></i> Đóng
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        // Reset UI khi mở lại
        const logEl = document.getElementById('bulkScanLog');
        if (logEl) logEl.textContent = '';
        _bulkSetProgress(0);
        const cancelBtn = document.getElementById('bulkScanCancelBtn');
        const doneBtn = document.getElementById('bulkScanDoneBtn');
        if (cancelBtn) cancelBtn.style.display = 'inline-flex';
        if (doneBtn) doneBtn.style.display = 'none';
    }

    modal.classList.add('active');
}

// --- Tự động load trailer cache khi web khởi động ---
// Chờ Supabase sẵn sàng (window.supabase) mới load
(function autoLoadTrailerCache() {
    const tryLoad = () => {
        if (window.supabase) {
            loadTmdbTrailersCache();
        } else {
            // Thử lại sau 1s nếu Supabase chưa sẵn sàng
            setTimeout(tryLoad, 1000);
        }
    };
    // Chờ DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(tryLoad, 2000));
    } else {
        setTimeout(tryLoad, 2000);
    }
})();
