/* ============================================================
   ADMIN API IMPORT — js/admin-api-import.js
   Tính năng: Import phim từ API nguồn bên ngoài → Supabase
   Bao gồm: upload ảnh Cloudflare R2, auto diễn viên, thể loại,
   quốc gia, tập phim, bulk import, kiểm tra trùng lặp.
   ============================================================ */

/** URL mặc định của Cloudflare R2 Uploader Worker */
const _R2_DEFAULT_WORKER = 'https://r2-uploader.thinhnd-2003.workers.dev';
// Lưu ý: Điền URL worker của bạn vào đây hoặc cấu hình qua nút ⚙️ trong giao diện
// VD: 'https://r2-uploader.ten-worker.workers.dev'

/** Lấy R2 Worker URL (ưu tiên từ localStorage nếu admin đã đặt) */
function _getR2WorkerUrl() {
    return localStorage.getItem('api_r2_worker_url') || _R2_DEFAULT_WORKER;
}

/** State toàn cục cho import */
const _importState = {
    selectedSlugs: new Set(),  // Slugs được chọn để bulk import
    useR2: true,               // true = upload ảnh lên R2, false = dùng URL gốc
    isImporting: false,        // Đang chạy bulk import
    importAbort: false,        // Signal dừng import
    newOnlyFilterActive: false, // true = ẩn phím đã có trong DB
};

/**
 * Thêm 1 dòng log vào panel tiến trình import inline.
 * @param {string} msg    - Nội dung log (có thể có emoji)
 * @param {'info'|'success'|'warning'|'error'|'done'} type - Loại log
 */
function _addImportLog(msg, type = 'info') {
    const panel = document.getElementById('importProgressPanel');
    const body = document.getElementById('importLogBody');
    const spinner = document.getElementById('importProgressSpinner');
    if (!panel || !body) return;

    // Hiện panel nếu đang ẩn
    panel.style.display = 'block';
    if (spinner) spinner.style.display = (type === 'done') ? 'none' : 'inline';

    // Màu theo loại
    const colors = {
        info:    '#60a5fa',
        success: '#34d399',
        warning: '#fbbf24',
        error:   '#f87171',
        done:    '#a78bfa',
    };
    const icons = {
        info:    'fas fa-circle-notch fa-spin',
        success: 'fas fa-check-circle',
        warning: 'fas fa-exclamation-triangle',
        error:   'fas fa-times-circle',
        done:    'fas fa-flag-checkered',
    };

    const color = colors[type] || colors.info;
    const icon = icons[type] || icons.info;

    // Timestamp
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

    const line = document.createElement('div');
    line.style.cssText = `color: ${color}; padding: 1px 0; display: flex; align-items: flex-start; gap: 8px;`;
    line.innerHTML = `<span style="color:rgba(255,255,255,0.25); min-width:52px;">${ts}</span><i class="${icon}" style="margin-top:3px; font-size:0.65rem;"></i><span style="flex:1;">${msg}</span>`;
    body.appendChild(line);

    // Auto-scroll xuống cuối
    body.scrollTop = body.scrollHeight;
}

/**
 * Xóa sạch log panel và hiện panel sẵn sàng cho phiên import mới.
 */
function _clearImportLog() {
    const body = document.getElementById('importLogBody');
    if (body) body.innerHTML = '';
    const panel = document.getElementById('importProgressPanel');
    if (panel) panel.style.display = 'block';
}

/* ─── CẤU HÌNH R2 ─── */

/**
 * Toggle chế độ upload ảnh: R2 ↔ URL gốc.
 */
function toggleImportR2Mode() {
    _importState.useR2 = !_importState.useR2;
    const btn = document.getElementById('btnToggleR2Mode');
    if (!btn) return;
    if (_importState.useR2) {
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Ảnh: Cloudflare R2';
        btn.classList.add('active');
    } else {
        btn.innerHTML = '<i class="fas fa-link"></i> Ảnh: URL gốc';
        btn.classList.remove('active');
    }
}

/** Mở modal để admin nhập R2 Worker URL tùy chỉnh. */
function openR2ConfigModal() {
    const input = document.getElementById('r2WorkerUrlInput');
    if (input) input.value = _getR2WorkerUrl();
    document.getElementById('apiR2ConfigModal')?.classList.add('open');
}

/** Đóng modal cấu hình R2. */
function closeR2ConfigModal() {
    document.getElementById('apiR2ConfigModal')?.classList.remove('open');
}

/** Lưu R2 Worker URL vào localStorage. */
function saveR2WorkerUrl() {
    const val = (document.getElementById('r2WorkerUrlInput')?.value || '').trim();
    if (val) {
        localStorage.setItem('api_r2_worker_url', val);
        if (typeof showNotification === 'function') showNotification('Đã lưu R2 Worker URL!', 'success');
    }
    closeR2ConfigModal();
}

/* ─── OMDB API — Lấy điểm IMDb thật (Đã chuyển sang utils.js) ─── */

/* ─── HELPER FUNCTIONS ─── */

/**
 * Upload ảnh từ URL lên Cloudflare R2 qua Worker endpoint /upload-from-url.
 * Nếu R2 tắt hoặc lỗi, tự động fallback về URL gốc.
 * @param {string} imgUrl    - URL ảnh gốc
 * @param {string} folder    - folder trên R2 (VD: 'movies/posters')
 * @param {string} filename  - tên file tùy chỉnh (không extension)
 * @returns {Promise<string>}
 */
async function _uploadImgToR2(imgUrl, folder, filename) {
    if (!imgUrl) return '';
    if (!_importState.useR2) return imgUrl; // Dùng URL gốc nếu tắt R2
    const workerUrl = _getR2WorkerUrl();
    if (!workerUrl) {
        // Chưa cấu hình R2 Worker URL → dùng URL gốc
        console.warn('[R2 Upload] Chưa cấu hình Worker URL, dùng URL gốc.');
        return imgUrl;
    }
    try {
        // Xác định extension từ URL
        const extMatch = imgUrl.split('?')[0].match(/\.(jpg|jpeg|png|webp|gif|avif)$/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
        const customFilename = `${filename}.${ext}`;
        const res = await fetch(`${workerUrl}/upload-from-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: imgUrl, folder, customFilename }),
        });
        if (!res.ok) throw new Error(`R2 HTTP ${res.status}`);
        const data = await res.json();
        return data.url || imgUrl;
    } catch (err) {
        console.warn('[R2 Upload] Lỗi, fallback URL gốc:', err.message);
        return imgUrl; // Fallback an toàn
    }
}

/**
 * Build URL ảnh đầy đủ từ API nguồn (hỗ trợ KKPhim, OPhim, NguonC).
 * @param {string} url - URL ảnh hoặc filename
 * @param {string} [providerId] - ID nguồn API ('kkphim', 'ophim', 'nguonc')
 */
function _buildApiImgUrl(url, providerId) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    // OPhim: CDN ảnh riêng
    if (providerId === 'ophim') return `https://img.ophim.live/uploads/movies/${url}`;
    // KKPhim (mặc định)
    return `https://phimimg.com/${url}`;
}

/**
 * Tìm ID thể loại trong allCategories bằng tên thể loại từ API.
 * @param {string} name - tên thể loại (VD: 'Hành động')
 * @returns {string|null}
 */
function _findCategoryIdByName(name) {
    if (!name || typeof allCategories === 'undefined') return null;
    const lower = name.toLowerCase().trim();
    const found = allCategories.find(c =>
        c.name?.toLowerCase().trim() === lower ||
        c.slug?.toLowerCase().trim() === lower
    );
    return found?.id || null;
}

/**
 * Tìm ID quốc gia trong allCountries bằng tên quốc gia từ API.
 * @param {string} name - tên quốc gia (VD: 'Hàn Quốc')
 * @returns {string|null}
 */
function _findCountryIdByName(name) {
    if (!name || typeof allCountries === 'undefined') return null;

    // Alias map: API trả về tên gộp / tiếng Anh / viết tắt → map sang tên chuẩn trong DB
    const _aliasMap = {
        // Châu Á
        'trung quốc': 'Trung Quốc', 'china': 'Trung Quốc', 'cn': 'Trung Quốc', 'trung quoc': 'Trung Quốc', 'zhongguo': 'Trung Quốc',
        'hồng kông': 'Hồng Kông', 'hong kong': 'Hồng Kông', 'hk': 'Hồng Kông', 'hương cảng': 'Hồng Kông', 'huong cang': 'Hồng Kông', 'hong kong sar': 'Hồng Kông', 'hongkong': 'Hồng Kông',
        'đài loan': 'Đài Loan', 'taiwan': 'Đài Loan', 'tw': 'Đài Loan', 'dai loan': 'Đài Loan',
        'hàn quốc': 'Hàn Quốc', 'korea': 'Hàn Quốc', 'south korea': 'Hàn Quốc', 'kr': 'Hàn Quốc', 'han quoc': 'Hàn Quốc',
        'nhật bản': 'Nhật Bản', 'japan': 'Nhật Bản', 'jp': 'Nhật Bản', 'nhat ban': 'Nhật Bản',
        'thái lan': 'Thái Lan', 'thailand': 'Thái Lan', 'th': 'Thái Lan', 'thai lan': 'Thái Lan',
        'việt nam': 'Việt Nam', 'vietnam': 'Việt Nam', 'vn': 'Việt Nam', 'viet nam': 'Việt Nam',
        'ấn độ': 'Ấn Độ', 'india': 'Ấn Độ', 'in': 'Ấn Độ', 'an do': 'Ấn Độ',
        'philippines': 'Philippines', 'ph': 'Philippines', 'pilipinas': 'Philippines',
        'indonesia': 'Indonesia', 'id': 'Indonesia',
        'malaysia': 'Malaysia', 'my': 'Malaysia',
        'singapore': 'Singapore', 'sg': 'Singapore',
        'campuchia': 'Campuchia', 'cambodia': 'Campuchia', 'kh': 'Campuchia',
        'myanma': 'Myanmar', 'myanmar': 'Myanmar', 'mm': 'Myanmar',
        'lào': 'Lào', 'laos': 'Lào', 'la': 'Lào',
        'mông cổ': 'Mông Cổ', 'mongolia': 'Mông Cổ', 'mn': 'Mông Cổ',
        'pakistan': 'Pakistan', 'pk': 'Pakistan',
        'bangladesh': 'Bangladesh', 'bd': 'Bangladesh',
        'sri lanka': 'Sri Lanka', 'lk': 'Sri Lanka',
        'iran': 'Iran', 'ir': 'Iran',
        'israel': 'Israel', 'il': 'Israel',
        'ả rập xê út': 'Ả Rập Xê Út', 'saudi arabia': 'Ả Rập Xê Út', 'sa': 'Ả Rập Xê Út',
        // Châu Âu
        'mỹ': 'Mỹ', 'usa': 'Mỹ', 'united states': 'Mỹ', 'america': 'Mỹ', 'âu mỹ': 'Mỹ', 'âu-mỹ': 'Mỹ', 'us-uk': 'Mỹ', 'âu': 'Mỹ', 'au my': 'Mỹ',
        'anh': 'Anh', 'uk': 'Anh', 'united kingdom': 'Anh', 'britain': 'Anh', 'england': 'Anh', 'great britain': 'Anh',
        'pháp': 'Pháp', 'france': 'Pháp', 'fr': 'Pháp',
        'đức': 'Đức', 'germany': 'Đức', 'de': 'Đức', 'deutschland': 'Đức',
        'ý': 'Ý', 'italy': 'Ý', 'italia': 'Ý', 'it': 'Ý',
        'tây ban nha': 'Tây Ban Nha', 'spain': 'Tây Ban Nha', 'es': 'Tây Ban Nha', 'tay ban nha': 'Tây Ban Nha',
        'bồ đào nha': 'Bồ Đào Nha', 'portugal': 'Bồ Đào Nha', 'pt': 'Bồ Đào Nha',
        'nga': 'Nga', 'russia': 'Nga', 'ru': 'Nga',
        'hà lan': 'Hà Lan', 'netherlands': 'Hà Lan', 'nl': 'Hà Lan', 'ha lan': 'Hà Lan',
        'bỉ': 'Bỉ', 'belgium': 'Bỉ', 'be': 'Bỉ',
        'thụy điển': 'Thụy Điển', 'sweden': 'Thụy Điển', 'se': 'Thụy Điển',
        'đan mạch': 'Đan Mạch', 'denmark': 'Đan Mạch', 'dk': 'Đan Mạch',
        'nauy': 'Nauy', 'norway': 'Nauy', 'no': 'Nauy',
        'phần lan': 'Phần Lan', 'finland': 'Phần Lan', 'fi': 'Phần Lan',
        'áo': 'Áo', 'austria': 'Áo', 'at': 'Áo',
        'thụy sĩ': 'Thụy Sĩ', 'switzerland': 'Thụy Sĩ', 'ch': 'Thụy Sĩ',
        'ba lan': 'Ba Lan', 'poland': 'Ba Lan', 'pl': 'Ba Lan',
        'séc': 'Séc', 'czech': 'Séc', 'czech republic': 'Séc', 'cz': 'Séc',
        'hungary': 'Hungary', 'hu': 'Hungary',
        'hy lạp': 'Hy Lạp', 'greece': 'Hy Lạp', 'gr': 'Hy Lạp',
        // Châu Mỹ & Khác
        'canada': 'Canada', 'ca': 'Canada',
        'brazil': 'Brazil', 'br': 'Brazil',
        'mexico': 'Mexico', 'mx': 'Mexico',
        'argentina': 'Argentina', 'ar': 'Argentina',
        'úc': 'Úc', 'australia': 'Úc', 'au': 'Úc', 'aussie': 'Úc',
        'new zealand': 'New Zealand', 'nz': 'New Zealand',
        'nam phi': 'Nam Phi', 'south africa': 'Nam Phi', 'za': 'Nam Phi',
        'ai cập': 'Ai Cập', 'egypt': 'Ai Cập', 'eg': 'Ai Cập',
        'thổ nhĩ kỳ': 'Thổ Nhĩ Kỳ', 'turkey': 'Thổ Nhĩ Kỳ', 'türkiye': 'Thổ Nhĩ Kỳ', 'tr': 'Thổ Nhĩ Kỳ',
        // Khác
        'quốc tế': 'Quốc tế', 'international': 'Quốc tế'
    };

    const lowerInput = name.toLowerCase().trim();
    const resolved = _aliasMap[lowerInput] || name; // Dùng tên gốc nếu không có alias

    // Hàm phụ: Chuẩn hóa, loại bỏ dấu tiếng Việt để so sánh an toàn hơn (fallback)
    const normalizeStr = (str) => {
        if (!str) return '';
        return str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Bỏ dấu
            .replace(/[đĐ]/g, "d")
            .replace(/[^a-z0-9]/g, ""); // Chỉ giữ lại chữ và số
    };

    const targetNorm = normalizeStr(resolved);

    // 1. Tìm chính xác trước
    let found = allCountries.find(c =>
        c.name?.toLowerCase().trim() === resolved.toLowerCase().trim() ||
        c.code?.toLowerCase().trim() === resolved.toLowerCase().trim()
    );

    // 2. Nếu không thấy, tìm tương đối (bỏ dấu, dính chữ)
    if (!found) {
        found = allCountries.find(c => {
            const dbNameNorm = normalizeStr(c.name);
            const dbCodeNorm = normalizeStr(c.code);
            return dbNameNorm === targetNorm || dbCodeNorm === targetNorm ||
                   // Xử lý các case như API trả về "vietnam" nhưng DB là "việt nam"
                   (dbNameNorm && targetNorm && (dbNameNorm.includes(targetNorm) || targetNorm.includes(dbNameNorm)));
        });
    }

    return found?.id || null;
}


/**
 * Kiểm tra phim đã tồn tại trong Supabase chưa bằng `api_url_backup`.
 * Chấp nhận cả 2 dạng: URL đầy đủ hoặc slug ngắn (tương thích DB cũ).
 * @param {string} slug  - slug hoặc URL đầy đủ
 * @returns {Promise<string|null>} ID phim nếu tồn tại, null nếu chưa
 */
async function _checkMovieExistsBySlug(slug) {
    if (!slug || typeof supabase === 'undefined') return null;
    // Trích xuất slug thuần từ URL (nếu là URL đầy đủ)
    const shortSlug = slug.startsWith('http')
        ? slug.replace(/.*\/(phim|film)\//, '').split('?')[0].replace(/\/$/, '')
        : slug;
    // Build tất cả URL có thể từ 3 nguồn API
    const possibleUrls = [
        `https://phimapi.com/phim/${shortSlug}`,
        `https://ophim1.com/phim/${shortSlug}`,
        `https://phim.nguonc.com/api/film/${shortSlug}`,
        shortSlug,
    ];
    try {
        // Tìm slug trên tất cả nguồn API đã import
        const orFilter = possibleUrls.map(u => `api_url_backup.eq.${u}`).join(',');
        const { data } = await supabase
            .from('movies')
            .select('id')
            .or(orFilter)
            .maybeSingle();
        return data?.id || null;
    } catch { return null; }
}

/**
 * Detect tự động Phần/Mùa/Season từ tên phim tiếng Việt hoặc tiếng Anh.
 * VD: "Bệnh Viện Pitt (Phần 2)" → "Phần 2"
 *     "The Pitt (Season 2)"      → "Mùa 2"
 *     "Avengers: Part II"        → "Phần 2"
 * @param {string} viTitle  - tên tiếng Việt
 * @param {string} enTitle  - tên tiếng Anh / gốc
 * @returns {string} - VD "Phần 2", "Mùa 3", "" nếu không phát hiện
 */
function _detectMoviePart(viTitle, enTitle) {
    // Chuyển số La Mã → số thường
    const _roman = { I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10 };
    const _toArabic = (s) => _roman[s.toUpperCase()] || parseInt(s) || null;

    // Patterns kiểm tra (theo độ ưu tiên)
    const patterns = [
        // Tiếng Việt: Phần 2, (Phần 2), Phần II
        { re: /\bph\u1ea7n\s*([ivxlcdm\d]+)\b/i, label: 'Phần' },
        // Tiếng Việt: Mùa 2, (Mùa 2)
        { re: /\bm\u00f9a\s*([ivxlcdm\d]+)\b/i,   label: 'Mùa'  },
        // Tiếng Anh: Season 2, (Season 2)
        { re: /\bseason\s*([ivxlcdm\d]+)\b/i,      label: 'Mùa'  },
        // Tiếng Anh: Part 2, Part II
        { re: /\bpart\s*([ivxlcdm\d]+)\b/i,        label: 'Phần' },
        // Tiếng Anh: Chapter 2
        { re: /\bchapter\s*([ivxlcdm\d]+)\b/i,     label: 'Phần' },
        // Số thứ tự ở cuối tên trong ngoặc: "(2)", "(3)"
        { re: /\(\s*(\d+)\s*\)$/,                  label: 'Phần' },
        // Số La Mã hoặc số thường ở CUỐI CÙNG chuỗi, cách bởi khoảng trắng: "Iron Man 2", "Ám Ảnh Kinh Hoàng II"
        { re: /\s+([ivxlc\d]+)$/i,                 label: 'Phần' }
    ];

    for (const src of [viTitle, enTitle]) {
        if (!src) continue;
        for (const { re, label } of patterns) {
            const m = src.match(re);
            if (m) {
                const num = _toArabic(m[1]);
                if (num && num > 1) return `${label} ${num}`; // Chỉ set nếu >= 2
            }
        }
    }
    return ''; // Không phát hiện → để trống
}

/**
 * Tự sinh series_id từ slug phím: bỏ phần "-phan-2", "-season-2", "-mua-3"... ở cuối slug.
 * VD: "benh-vien-pitt-phan-2" → "benh-vien-pitt"
 *     "avengers-part-3"        → "avengers"
 *     "the-pitt-season-2"      → "the-pitt"
 * Chỉ trả về giá trị khi số phần >= 2 (tức là phím có nhiều phần).
 * Nếu là phần 1 hoặc không có số phần, trả về slug gốc (phần 1 dùng chính nó làm series_id).
 * @param {string} slug
 * @param {string} detectedPart - giá trị từ _detectMoviePart, VD "Phần 2" hoặc ""
 * @returns {string} series_id làm chuẩn
 */
function _buildSeriesId(slug, detectedPart) {
    if (!slug) return '';

    // Bỏ các suffix phần/mùa ở cuối slug
    const cleanSlug = slug
        .replace(/-(phan|season|mua|part|chapter|quyen|tap)-?0*([\divxlc]+)$/i, '')
        .replace(/-0*(\d+)$/, '')
        .replace(/-+$/, '');

    // PascalCase: mỗi từ viết hoa chữ đầu (VD: "mua-ruc-ro-cua-em" → "MuaRucRoCuaEm")
    return (cleanSlug || slug)
        .split('-')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('');
}


/**
 * Resolve danh sách tên diễn viên: tìm trong DB, tạo mới nếu chưa có.
 * Schema actors: {id, name, avatar, dob, gender, role, alt_names, bio, auto_created, created_at}
 * @param {Array<string>} actorNames
 * @returns {Promise<Array<{id, name}>>}
 */
async function _resolveActorsForImport(actorNames) {
    if (!actorNames?.length || typeof supabase === 'undefined') return [];
    const castData = [];
    try {
        const trimmed = actorNames.map(n => n.trim()).filter(Boolean);
        if (trimmed.length === 0) return [];

        // Truy vấn tất cả actors đã có 1 lần
        const { data: existing } = await supabase
            .from('actors')
            .select('id, name')
            .in('name', trimmed);

        // Map tên → actor object
        const existingMap = {};
        (existing || []).forEach(a => { existingMap[a.name.toLowerCase()] = a; });

        for (const name of trimmed) {
            const lower = name.toLowerCase();
            if (existingMap[lower]) {
                castData.push({ id: existingMap[lower].id, name: existingMap[lower].name });
            } else {
                // Tạo slug từ tên (giống autoCreateNewActors trong admin.js)
                const slug = name.toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
                    .replace(/[^a-z0-9\s]/g, '')
                    .replace(/\s+/g, '-');
                const newId = slug + '-' + Math.floor(Math.random() * 10000);

                // --- Tự động Fetch TMDb cho diễn viên mới ---
                let tmdbData = {};
                // Chỉ fetch nếu có tmdb.js trong ngữ cảnh
                if (typeof searchTmdbPerson === 'function' && typeof getTmdbPersonDetails === 'function') {
                    try {
                        const searchRes = await searchTmdbPerson(name);
                        if (searchRes && searchRes.id) {
                            const details = await getTmdbPersonDetails(searchRes.id);
                            if (details) tmdbData = details;
                        }
                    } catch (e) {
                        console.warn('[Actor TMDb] Lỗi fetch:', name, e.message);
                    }
                }

                const newActor = {
                    id:           newId,
                    name:         name,
                    avatar:       tmdbData.profile_path ? buildTmdbImageUrl(tmdbData.profile_path, 'w185') : '',
                    dob:          tmdbData.birthday || null,
                    gender:       tmdbData.gender === 1 ? 'Nữ' : (tmdbData.gender === 2 ? 'Nam' : ''),
                    role:         tmdbData.known_for_department === 'Directing' ? 'director' : 'actor',
                    alt_names:    '',
                    bio:          tmdbData.biography || '',
                    country:      tmdbData.place_of_birth ? tmdbData.place_of_birth.split(',').pop().trim() : '',
                    auto_created: true,
                    created_at:   new Date().toISOString(),
                };

                try {
                    const { error } = await supabase.from('actors').insert(newActor);
                    if (!error) {
                        castData.push({ id: newId, name });
                        existingMap[lower] = { id: newId, name }; // Cache tránh tạo trùng
                        console.log(`[Actor] Tạo mới + TMDb info: ${name}`);
                    } else {
                        console.warn('[Actor] Lỗi tạo diễn viên:', name, error.message);
                        castData.push({ id: null, name }); // Vẫn lưu tên dù không có ID
                    }
                } catch (e) {
                    console.warn('[Actor] Lỗi tạo diễn viên:', name, e.message);
                    castData.push({ id: null, name });
                }
            }
        }
    } catch (err) {
        console.warn('[Actors] Lỗi resolve:', err.message);
    }
    return castData;
}

/**
 * Import danh sách tập phim vào bảng episodes trong Supabase.
 * Group theo episode_number: nhiều server Vietsub/Thuyết minh/... cùng tập
 * sẽ được gộp sources vào 1 record, KHÔNG tạo row trùng.
 *
 * @param {string} movieId
 * @param {Array}  episodesData  - [{server_name, server_data: [{name, link_m3u8, link_embed}]}]
 * @param {string} movieDuration - duration của phim VD: "70 phút"
 * @param {string} movieQuality  - chất lượng phim VD: 'HD', 'FHD', '1080p'
 */
async function _importEpisodesForMovie(movieId, episodesData, movieDuration = '', movieQuality = 'HD', providerName = '') {
    if (!movieId || !episodesData?.length || typeof supabase === 'undefined') return;

    // Map FHD/FullHD/raw → giá trị chuẩn của dropdown quality trong form admin
    const _qualityMap = {
        'fhd': '1080p', 'fullhd': '1080p', 'full hd': '1080p',
        'hd': '720p', 'sd': '480p',
        '4k': '4K (2160p)', '2k': '2K (1440p)',
        '1080p': '1080p', '1080p60': '1080p60',
        '720p': '720p',   '720p60':  '720p60',
        '480p': '480p',   '360p':    '360p',
    };
    const normQuality = _qualityMap[(movieQuality || '').toLowerCase().trim()] || movieQuality || '1080p';

    // Xóa tập cũ trước khi import mới
    await supabase.from('episodes').delete().eq('movie_id', movieId);

    // episodeMap: key = epName (số tập), value = { ...episodeRecord }
    const episodeMap = {};

    episodesData.forEach(server => {
        const serverName = server.server_name || '';
        const lower = serverName.toLowerCase();

        // Map tên server → label chuẩn
        let mainLabel  = 'Vietsub';   // Mặc định
        let embedLabel = 'Dự phòng';
        if (lower.includes('thuyet-minh') || lower.includes('thuyết minh') || lower.includes('thuyet minh') || lower.includes('tm')) {
            mainLabel  = 'Thuyết minh';
            embedLabel = 'Thuyết minh dự phòng';
        } else if (lower.includes('long-tieng') || lower.includes('lồng tiếng') || lower.includes('long tieng') || lower.includes('lt')) {
            mainLabel  = 'Lồng tiếng';
            embedLabel = 'Lồng tiếng dự phòng';
        } else if (lower.includes('ban-goc') || lower.includes('bản gốc') || lower.includes('raw') || lower.includes('original')) {
            mainLabel  = 'Bản gốc';
            embedLabel = 'Dự phòng';
        }

        (server.server_data || []).forEach((ep, idx) => {
            const epName = String(ep.name || (idx + 1));
            const epKey  = epName; // Dùng số tập làm key gộp

            // Khởi tạo record nếu chưa có
            if (!episodeMap[epKey]) {
                episodeMap[epKey] = {
                    movie_id:       movieId,
                    episode_index:  idx,
                    episode_number: epName,
                    title:          epName,
                    quality:        normQuality,
                    duration:       movieDuration || '',
                    sources:        [],
                    intro_begin:    0,
                    intro_end:      0,
                    intro_start:    0,
                    is_new:         false,
                    created_at:     new Date().toISOString(),
                    updated_at:     new Date().toISOString(),
                };
            }

            // Gộp sources từ server này vào record (không trùng link) + gắn tên nguồn (server)
            if (ep.link_m3u8) {
                const already = episodeMap[epKey].sources.some(s => s.source === ep.link_m3u8);
                if (!already) episodeMap[epKey].sources.push({ label: mainLabel, type: 'hls', source: ep.link_m3u8, server: providerName || '' });
            }
            if (ep.link_embed) {
                const already = episodeMap[epKey].sources.some(s => s.source === ep.link_embed);
                if (!already) episodeMap[epKey].sources.push({ label: embedLabel, type: 'embed', source: ep.link_embed, server: providerName || '' });
            }
        });
    });

    // Chuyển map → mảng và sắp xếp theo episode_number tự nhiên
    const toInsert = Object.values(episodeMap).sort((a, b) => {
        const na = parseFloat(a.episode_number) || 0;
        const nb = parseFloat(b.episode_number) || 0;
        return na - nb;
    }).map((ep, idx) => ({ ...ep, episode_index: idx })); // Đánh lại index theo thứ tự

    if (!toInsert.length) return;

    // Insert theo batch 50
    const BATCH = 50;
    for (let i = 0; i < toInsert.length; i += BATCH) {
        const { error } = await supabase.from('episodes').insert(toInsert.slice(i, i + BATCH));
        if (error) console.warn('[Episodes] Lỗi insert batch:', error.message);
    }
    console.log(`✅ Import ${toInsert.length} tập phim cho movieId: ${movieId}`);
}

/* ─── HÀM IMPORT CHÍNH ─── */

/**
 * Import 1 phim từ API slug vào Supabase.
 * Xử lý đầy đủ: ảnh R2, thể loại, quốc gia, diễn viên, tập phim.
 *
 * @param {string} slug   - slug phim từ API
 * @param {object} opts   - { silent: bool } nếu silent=true, không hiện loading toàn màn hình
 * @returns {Promise<{success: boolean, movieId: string|null, message: string, duplicate: boolean}>}
 */
async function importSingleMovieFromApi(slug, opts = {}) {
    // Luôn ưu tiên providerId truyền rõ ràng (từ Multi-Search), nếu không có mới lấy tab hiện hành
    const pid = opts.providerId || (typeof _apiState !== 'undefined' ? _apiState.currentProvider : null);
    const provider = typeof API_PROVIDERS !== 'undefined' ? API_PROVIDERS[pid] : null;

    if (!provider) return { success: false, message: 'Không có API provider' };
    if (typeof supabase === 'undefined') return { success: false, message: 'Supabase chưa sẵn sàng' };

    // Progress hiện qua panel inline, không cần overlay spinner

    try {
        // 1. Lấy chi tiết phim từ API
        if (!opts.silent) _clearImportLog(); // Chỉ xóa log khi import đơn, bulk đã clear ở đầu
        _addImportLog(`📡 Đang tải chi tiết "${slug}" từ ${provider.name}...`, 'info');
        const res = await fetch(provider.buildDetailUrl(slug));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const movie    = raw.movie || raw;
        // NguonC: episodes nằm trong movie.episodes thay vì raw.episodes
        const episodes = raw.episodes || movie.episodes || [];
        if (!movie?.slug) throw new Error('Dữ liệu API không hợp lệ (thiếu slug)');

        // 2. Kiểm tra trùng lặp → Nếu đã có thì MERGE NGUỒN thay vì bỏ qua
        const existingId = await _checkMovieExistsBySlug(movie.slug);
        if (existingId) {
            // Phim đã tồn tại → Merge nguồn mới vào episodes cũ
            const providerName = provider.name || provider.id || 'Unknown';

            const mergeResult = await _mergeEpisodesSources(existingId, episodes, providerName);

            // ★ Trigger cross-fetch sang các nguồn khác (giống import mới)
            if (!opts.skipCrossFetch && mergeResult.added > 0) {
                try {
                    await _crossFetchFromAllProviders(existingId, movie.slug, providerName, movie.name || '');
                } catch (e) {
                    console.warn('[CrossFetch on Merge] Lỗi:', e.message);
                }
            }

            // Cập nhật versions dựa trên sources thực tế trong DB
            await _syncMovieVersionsFromEpisodes(existingId);


            return {
                success: mergeResult.added > 0,
                movieId: existingId,
                duplicate: mergeResult.added === 0,
                message: mergeResult.added > 0
                    ? `✅ Đã gộp ${mergeResult.added} nguồn "${providerName}" vào "${movie.name}"`
                    : `"${movie.name}" đã có đủ nguồn từ "${providerName}"`,
            };
        }

        // 3. Chuẩn bị URL ảnh gốc từ API (truyền providerId để dùng đúng CDN)
        const _pid = provider.id || 'kkphim';
        const rawPoster = _buildApiImgUrl(movie.poster_url, _pid) || _buildApiImgUrl(movie.thumb_url, _pid);
        const rawThumb  = _buildApiImgUrl(movie.thumb_url, _pid)  || rawPoster;
        const safeSlug  = (movie.slug || slug).replace(/[^a-z0-9-]/gi, '-').toLowerCase();

        // 4. Upload ảnh lên Cloudflare R2 (hoặc dùng URL gốc nếu tắt R2)

        _addImportLog(_importState.useR2
            ? '☁️ Đang upload ảnh poster & background lên Cloudflare R2...'
            : '🔗 Đang lấy ảnh poster & background từ URL gốc...', 'info');
        const [posterUrl, backgroundUrl] = await Promise.all([
            _uploadImgToR2(rawPoster, 'movies/posters',     `${safeSlug}-poster`),
            _uploadImgToR2(rawThumb,  'movies/backgrounds', `${safeSlug}-bg`),
        ]);

        // 5. Map thể loại → IDs trong Supabase
        const categoryNames = (movie.category || []).map(c => c.name);
        const categoryIds   = categoryNames.map(_findCategoryIdByName).filter(Boolean);

        // 6. Map quốc gia → ID trong Supabase
        let countryId = null;
        const countryNames = (movie.country || []).map(c => c.name);
        for (const cn of countryNames) {
            countryId = _findCountryIdByName(cn);
            if (countryId) break;
        }

        // 7. Resolve diễn viên + tra cứu IMDb + tra cứu TMDb trailer song song

        _addImportLog('🎭 Đang xử lý diễn viên, điểm IMDb & trailer TMDb...', 'info');
        const actorNames = (movie.actor || []).slice(0, 20); // Giới hạn 20 diễn viên
        
        // Wrap hàm lấy trailer TMDb để an toàn (không lỗi ngắt import)
        const fetchTrailerSafe = async () => {
            try {
                if (typeof searchTmdbByTitle !== 'function' || typeof getTmdbTrailer !== 'function') return null;
                const searchTitle = movie.origin_name || movie.name || '';
                const tmdbResult = await searchTmdbByTitle(searchTitle, movie.year);
                if (!tmdbResult) return null;
                return await getTmdbTrailer(tmdbResult.id, tmdbResult.media_type || 'movie');
            } catch(e) { return null; }
        };

        const [castData, imdbRating, tmdbTrailerKey] = await Promise.all([
            _resolveActorsForImport(actorNames),
            // Sử dụng hàm Global trong utils.js hỗ trợ Cơ chế Tự Dụng Pool Khi Quá Tải
            _fetchImdbRatingGlobal(movie.origin_name || movie.name || '', movie.year),
            fetchTrailerSafe() // Tự động lấy trailer
        ]);

        // 8. Build movieData - theo đúng whitelist bảng movies Supabase
        // whitelist: id, title, origin_title, poster_url, background_url, description,
        //   year, type, duration, quality, status, age_limit, series_id, price, rating,
        //   total_episodes, api_url_backup, cast_data, tags, versions, category_id, country_id,
        //   created_at, updated_at, view_count, tmdb_trailer_key
        const movieId = `${safeSlug}-${Date.now().toString().slice(-6)}`;


        // Tính total_episodes: ưu tiên từ API, fallback theo type
        let totalEps = null;
        if (movie.episode_total) {
            totalEps = parseInt(movie.episode_total) || null;
        } else if (movie.type === 'single') {
            totalEps = 1;
        }

        // Parse duration từ API (VD: "70 phút", "1h25'", "90 min") sang format chuẩn
        const rawDuration = movie.time || '';
        let parsedDuration = rawDuration;
        // Nếu API trả về dạng số thuần (VD: "70") → chuyển sang "70 phút"
        if (/^\d+$/.test(rawDuration.trim())) {
            parsedDuration = `${rawDuration.trim()} phút`;
        }

        // Map versions: detect từ SERVER NAME của episodesData (chính xác hơn movie.lang)
        // Mỗi server_name chứa "thuyet-minh"/"long-tieng"/... → thêm bản chiếu tương ứng
        const versionSet = new Set();

        // Seed từ movie.lang trước
        const _langMap = {
            'vietsub': 'Vietsub', 'thuyet-minh': 'Thuyết minh', 'long-tieng': 'Lồng tiếng',
            'thuyet minh': 'Thuyết minh', 'long tieng': 'Lồng tiếng',
            'lồng tiếng': 'Lồng tiếng', 'thuyết minh': 'Thuyết minh',
        };
        const apiLang = (movie.lang || '').toLowerCase().trim();
        if (_langMap[apiLang]) versionSet.add(_langMap[apiLang]);

        // Scan tất cả server_name trong episodes → detect thêm bản chiếu
        (episodes || []).forEach(server => {
            const s = (server.server_name || '').toLowerCase();
            if (s.includes('thuyet-minh') || s.includes('thuyết minh') || s.includes('thuyet minh') || s.includes('tm')) {
                versionSet.add('Thuyết minh');
            }
            if (s.includes('long-tieng') || s.includes('lồng tiếng') || s.includes('long tieng') || s.includes('lt')) {
                versionSet.add('Lồng tiếng');
            }
            if (s.includes('vietsub') || s.includes('sub') || s.includes('vs')) {
                versionSet.add('Vietsub');
            }
            if (s.includes('ban-goc') || s.includes('bản gốc') || s.includes('raw') || s.includes('original')) {
                versionSet.add('Bản gốc');
            }
        });

        // Nếu không detect được gì → mặc định Vietsub
        if (versionSet.size === 0) versionSet.add('Vietsub');

        const versions = [...versionSet]; // Lưu dạng array (text[])

        const movieData = {
            id:             movieId,
            title:          movie.name || 'Không rõ',
            origin_title:   movie.origin_name || movie.origin_title || '',
            poster_url:     posterUrl,
            background_url: backgroundUrl,
            description:    (movie.content || movie.description || '').replace(/<[^>]*>/g, '').trim(),
            year:           movie.year ? parseInt(movie.year) : null,
            type:           movie.type === 'series' ? 'series' : 'single',
            quality:        movie.quality || 'HD',
            status:         'public',
            age_limit:      'P',
            series_id:      '',
            price:          0,
            rating:         0,
            imdb_rating:    imdbRating, // Điểm IMDb thật từ OMDB API
            view_count:     undefined, // Đã xóa cột, không gửi lên DB
            total_episodes: totalEps,
            duration:       parsedDuration,
            tags:           [],
            cast_data:      castData,
            versions:       versions,
            category_ids:   categoryIds.length > 0 ? categoryIds : [],
            country_id:     countryId,
            part:           _detectMoviePart(movie.name || '', movie.origin_name || ''),
            series_id:      _buildSeriesId(movie.slug || safeSlug, ''), // Tất cả phim đều có series_id
            api_url_backup: provider.buildDetailUrl(movie.slug), // Lưu URL đúng theo provider đang dùng
            tmdb_trailer_key: tmdbTrailerKey, // Trailer key lưu tự động
            created_at:     new Date().toISOString(),
            updated_at:     new Date().toISOString(),
        };

        // Lọc whitelist - chỉ gửi field có trong bảng movies Supabase
        const _WHITELIST = [
            'id', 'title', 'origin_title', 'poster_url', 'background_url', 'description',
            'year', 'type', 'duration', 'quality', 'status', 'age_limit', 'series_id',
            'price', 'rating', 'imdb_rating', 'total_episodes', 'api_url_backup', 'cast_data', 'tags',
            'versions', 'category_ids', 'country_id', 'part', 'tmdb_trailer_key',
            'created_at', 'updated_at',
        ];
        const _NUM_FIELDS = ['year', 'price', 'rating', 'imdb_rating', 'total_episodes'];
        const finalMovieData = {};
        _WHITELIST.forEach(k => {
            if (movieData[k] !== undefined) {
                if (_NUM_FIELDS.includes(k)) {
                    const v = movieData[k];
                    finalMovieData[k] = (v === '' || v === null || isNaN(v)) ? null : Number(v);
                } else {
                    finalMovieData[k] = movieData[k];
                }
            }
        });

        // 9. Insert phim vào Supabase

        _addImportLog(`💾 Đang lưu "${movie.name}" vào database...`, 'info');
        const { error: insertErr } = await supabase.from('movies').insert(finalMovieData);
        if (insertErr) throw new Error(insertErr.message);
        _addImportLog('✅ Đã lưu phim vào database thành công!', 'success');


        // 10. Import tập phim (nếu có)
        let totalEpCount = 0;
        if (episodes.length > 0) {
            // Normalize episodes: NguonC dùng items[] thay vì server_data[], m3u8/embed thay link_m3u8/link_embed
            const normalizedEps = episodes.map(srv => {
                const srvData = srv.server_data || srv.items || [];
                return {
                    server_name: srv.server_name || 'Server',
                    server_data: srvData.map(ep => ({
                        name: ep.name,
                        link_m3u8: ep.link_m3u8 || ep.m3u8 || '',
                        link_embed: ep.link_embed || ep.embed || '',
                    })),
                };
            });

            // Đếm số tập duy nhất (lấy server đầu tiên, các server khác là bản chiếu khác)
            const _primaryEpCount = normalizedEps.length > 0 ? (normalizedEps[0].server_data?.length || 0) : 0;
            totalEpCount = _primaryEpCount;
            _addImportLog(`📀 Import ${_primaryEpCount} tập phim...`, 'info');

            // Gắn tên server (provider) vào mỗi source trước khi import
            const _currentProviderName = provider.name || provider.id || 'Unknown';
            // Truyền duration và quality phìm xuống từng tập (API không có duration riêng cho từng tập)
            await _importEpisodesForMovie(movieId, normalizedEps, parsedDuration, movie.quality || 'HD', _currentProviderName);

            // ★ AUTO CROSS-FETCH: Quét thêm nguồn từ các API khác (ngầm, không block)
            if (!opts.skipCrossFetch) {
                try {

                    _addImportLog('🌐 Bắt đầu quét đa nguồn tự động...', 'info');
                    const _crossProviders = await _crossFetchFromAllProviders(movieId, movie.slug, _currentProviderName, movie.name || '');
                    _addImportLog('🎉 Hoàn tất quét đa nguồn!', 'success');
                    // Lưu _crossProviders cho summary
                    var _mergedProviderNames = _crossProviders || [];
                } catch (e) {
                    console.warn('[CrossFetch] Lỗi quét chéo:', e.message);
                }
            }

            // Sync versions dựa trên sources thực tế sau cross-fetch
            await _syncMovieVersionsFromEpisodes(movieId);
        }

        // 11. Đồng bộ sync cache và refresh admin lists
        if (typeof notifyDataChange === 'function') await notifyDataChange('movies');
        _refreshAdminLists();

        // Trước khi return, đếm số nguồn thực tế đã gộp
        let summaryMsg = `✅ Import "${movie.name}" thành công!`;
        try {
            const { count: realEpCount } = await supabase.from('episodes').select('id', { count: 'exact', head: true }).eq('movie_id', movieId);
            const { data: verData } = await supabase.from('movies').select('versions').eq('id', movieId).single();
            const vers = verData?.versions || [];
            // Build chi tiết nguồn
            const sourceDetails = [`${provider.name}: ${totalEpCount} tập`];
            if (typeof _mergedProviderNames !== 'undefined' && _mergedProviderNames.length > 0) {
                _mergedProviderNames.forEach(p => {
                    sourceDetails.push(`${p.name}: ${p.epCount} tập`);
                });
            }
            summaryMsg = `✅ "${movie.name}" - ${realEpCount || '?'} tập | ${vers.length} phiên bản (${vers.join(', ')}) | Nguồn: ${sourceDetails.join(', ')}`;
        } catch(e) { /* ignore */ }

        _addImportLog(summaryMsg, 'done');

        return { success: true, movieId, message: summaryMsg };

    } catch (err) {
        console.error('[Import Movie] Lỗi:', err);
        _addImportLog(`❌ Lỗi import: ${err.message}`, 'error');
        return { success: false, message: err.message || 'Lỗi không xác định' };
    }
}

/* ─── BULK IMPORT ─── */

/**
 * Refresh lại danh sách quản lý phím + dropdown quản lý tập ngay lập tức sau khi import.
 * Không cần F5 trang.
 */
async function _refreshAdminLists() {
    try {
        // 1. Reload allMovies (public) + allAdminMovies
        if (typeof loadMovies    === 'function') await loadMovies();
        if (typeof loadAdminMovies === 'function') await loadAdminMovies();

        // 2. Re-render danh sách quản lý phím
        const movieList = typeof allAdminMovies !== 'undefined' && allAdminMovies.length
            ? allAdminMovies : (typeof allMovies !== 'undefined' ? allMovies : []);
        if (typeof renderAdminMoviesList === 'function') {
            renderAdminMoviesList(movieList);
        }

        // 3. Cập nhật dropdown chọn phím trong quản lý tập
        const episodeSelect = document.getElementById('selectMovieForEpisodes');
        if (episodeSelect && movieList.length > 0) {
            const currentVal = episodeSelect.value;
            episodeSelect.innerHTML = '<option value="">Chọn phím...</option>' +
                movieList.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
            if (currentVal) episodeSelect.value = currentVal; // giữ lựa chọn cũ
        }

        // 4. Cập nhật dashboard stats
        if (typeof renderDashboard === 'function') renderDashboard();

        console.log('[Admin Refresh] ✅ Đã refresh danh sách phím và tập');
    } catch (e) {
        console.warn('[Admin Refresh] Lỗi:', e.message);
    }
}

/**
 * Import hàng loạt tất cả phim đang được chọn (checkbox).
 */
async function importBulkMoviesFromApi() {
    if (_importState.isImporting) return;
    const slugs = Array.from(_importState.selectedSlugs);
    if (!slugs.length) {
        if (typeof showNotification === 'function') showNotification('Chưa chọn phim nào!', 'error');
        return;
    }

    _importState.isImporting = true;
    _importState.importAbort = false;

    const total = slugs.length;
    let done = 0, successCount = 0, dupCount = 0, failCount = 0;
    const _bulkResults = []; // Lưu kết quả từng phim cho tổng kết cuối
    const _bulkStartTime = Date.now();

    const btnBulk  = document.getElementById('btnBulkImport');
    const btnAbort = document.getElementById('btnAbortImport');
    if (btnBulk)  { btnBulk.disabled = true; btnBulk.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang import...'; }
    if (btnAbort) btnAbort.style.display = 'inline-flex';
    _clearImportLog();
    _showImportProgress(0, total, 'Đang bắt đầu...');

    for (const slug of slugs) {
        if (_importState.importAbort) {
            _showImportProgress(done, total, '⚠️ Đã dừng bởi admin');
            break;
        }

        _showImportProgress(done, total, `Xử lý: ${slug}`);
        
        // Tìm providerId từ DOM (vì multi-search có nhiều tab)
        const cb = document.querySelector(`.api-card-select-cb[data-slug="${slug}"]`);
        const pId = cb ? cb.dataset.providerId : null;

        // Separator giữa các phim trong log
        if (done > 0) _addImportLog(`── Phim ${done + 1}/${total} ──`, 'info');

        const result = await importSingleMovieFromApi(slug, { silent: true, providerId: pId });
        done++;

        if (result.success) {
            successCount++;
            _addImportLog(`✅ [${done}/${total}] ${result.message}`, 'success');
            _bulkResults.push({ slug, status: 'success', msg: result.message });
        } else if (result.duplicate) {
            dupCount++;
            _addImportLog(`🔁 [${done}/${total}] ${slug}: đã tồn tại`, 'warning');
            _bulkResults.push({ slug, status: 'duplicate', msg: 'Đã tồn tại' });
        } else {
            failCount++;
            _addImportLog(`❌ [${done}/${total}] ${slug}: ${result.message}`, 'error');
            _bulkResults.push({ slug, status: 'error', msg: result.message });
        }

        // Cập nhật badge trạng thái trên card tương ứng
        _updateCardImportBadge(slug, result);

        // Delay nhỏ để không spam API nguồn
        await new Promise(r => setTimeout(r, 400));
    }

    if (successCount > 0) {
        // Refresh admin lists sau khi import bulk xong
        _refreshAdminLists();
    }
    _importState.isImporting = false;
    const msg = `✅ ${successCount} thành công · 🔁 ${dupCount} đã tồn tại · ❌ ${failCount} lỗi`;
    _showImportProgress(done, total, msg);

    if (btnBulk)  { btnBulk.disabled = false; btnBulk.innerHTML = `<i class="fas fa-file-import"></i> Import đã chọn (${slugs.length})`; }
    if (btnAbort) btnAbort.style.display = 'none';

    // ═══ TỔNG KẾT CHI TIẾT ═══
    const elapsedMs = Date.now() - _bulkStartTime;
    const _h = Math.floor(elapsedMs / 3600000);
    const _m = Math.floor((elapsedMs % 3600000) / 60000);
    const _s = Math.floor((elapsedMs % 60000) / 1000);
    const elapsedStr = (_h > 0 ? `${_h} giờ ` : '') + (_m > 0 ? `${_m} phút ` : '') + `${_s} giây`;
    _addImportLog(``, 'info'); // dòng trống

    _addImportLog(`═══════════ TỔNG KẾT IMPORT ═══════════`, 'done');
    _addImportLog(`⏱ Thời gian: ${elapsedStr} | Tổng: ${done}/${total} phim`, 'info');
    _addImportLog(`✅ Thành công: ${successCount} | 🔁 Đã có: ${dupCount} | ❌ Lỗi: ${failCount}`, 'done');

    // Liệt kê từng phim
    _bulkResults.forEach((r, i) => {
        const icon = r.status === 'success' ? '✅' : r.status === 'duplicate' ? '🔁' : '❌';
        _addImportLog(`  ${icon} ${i + 1}. ${r.msg}`, r.status === 'success' ? 'success' : r.status === 'duplicate' ? 'warning' : 'error');
    });

    _addImportLog(`════════════════════════════════════`, 'done');

    if (typeof showNotification === 'function') {
        const summary = `🎬 Import ${done}/${total} phim (${elapsedStr}): ✅ ${successCount} | 🔁 ${dupCount} | ❌ ${failCount}`;
        showNotification(summary, successCount > 0 ? 'success' : 'error', 5000);
    }
}

/**
 * Import phim đang xem trong drawer chi tiết (nút "Lưu vào DB" trong drawer).
 */
async function importCurrentDetailMovie() {
    const drawer = document.getElementById('apiDetailDrawer');
    const slug   = drawer?.dataset?.currentSlug;
    const pId    = drawer?.dataset?.currentProviderId || _apiState.currentProvider;
    if (!slug) {
        if (typeof showNotification === 'function') showNotification('Không có phim nào để import!', 'error');
        return;
    }
    const btn = document.getElementById('btnDetailImport');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang import...'; }

    const result = await importSingleMovieFromApi(slug, { providerId: pId });

    if (btn) {
        if (result.success) {
            btn.innerHTML = '<i class="fas fa-check"></i> Đã import!';
            btn.className = 'btn btn-sm api-detail-import-btn success';
        } else if (result.duplicate) {
            btn.innerHTML = '<i class="fas fa-database"></i> Đã có trong DB';
            btn.className = 'btn btn-sm api-detail-import-btn dup';
            btn.disabled = false;
        } else {
            btn.innerHTML = '<i class="fas fa-times"></i> Lỗi!';
            btn.className = 'btn btn-sm api-detail-import-btn fail';
            btn.disabled = false;
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Lưu vào DB';
                btn.className = 'btn btn-sm api-detail-import-btn';
            }, 4000);
        }
    }
    if (typeof showNotification === 'function') {
        showNotification(result.message, result.success ? 'success' : (result.duplicate ? 'warning' : 'error'));
    }
}

/**
 * Import nhanh 1 phim từ nút trên card (nút ➕ nhỏ ở góc card).
 * @param {string} slug
 * @param {HTMLElement} btn
 * @param {string} providerId
 */
async function importQuickFromCard(slug, btn, providerId = null) {
    if (!slug || !btn || btn.disabled) return;
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const result = await importSingleMovieFromApi(slug, { providerId });

    if (result.success) {
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.classList.add('import-ok');
        btn.title = 'Đã import thành công!';
        document.querySelector(`.api-movie-card[data-slug="${slug}"]`)?.classList.add('import-success');
    } else if (result.duplicate) {
        btn.innerHTML = '<i class="fas fa-database"></i>';
        btn.classList.add('import-dup-btn');
        btn.title = 'Phim đã tồn tại trong database';
        btn.disabled = false;
        document.querySelector(`.api-movie-card[data-slug="${slug}"]`)?.classList.add('import-dup');
    } else {
        btn.innerHTML = '<i class="fas fa-times"></i>';
        btn.classList.add('import-err-btn');
        btn.title = 'Lỗi: ' + result.message;
        btn.disabled = false;
        setTimeout(() => {
            btn.innerHTML = origHtml;
            btn.classList.remove('import-err-btn');
        }, 3000);
        document.querySelector(`.api-movie-card[data-slug="${slug}"]`)?.classList.add('import-fail');
    }

    if (typeof showNotification === 'function') {
        showNotification(result.message, result.success ? 'success' : (result.duplicate ? 'warning' : 'error'));
    }
}

/* ─── UI HELPERS ─── */

/** Toggle chọn 1 phim để bulk import. */
function toggleImportSelect(slug, checkbox) {
    if (checkbox.checked) _importState.selectedSlugs.add(slug);
    else _importState.selectedSlugs.delete(slug);
    _updateBulkImportBar();
}

/** Chọn/bỏ chọn tất cả phim trong trang — BỎ QUA phim đã có trong DB khi chọn. */
function selectAllApiMovies(checked) {
    document.querySelectorAll('.api-card-select-cb').forEach(cb => {
        const card = cb.closest('.api-movie-card');
        const isInDb = card && card.dataset.inDb === 'true';

        if (checked && isInDb) {
            // Bỏ qua phim đã có trong DB khi chọn tất cả
            cb.checked = false;
            return;
        }

        cb.checked = checked;
        const s = cb.dataset.slug;
        if (s) { if (checked) _importState.selectedSlugs.add(s); else _importState.selectedSlugs.delete(s); }
    });
    _updateBulkImportBar();
}

/** Dừng bulk import đang chạy. */
function abortBulkImport() {
    _importState.importAbort = true;
    if (typeof showNotification === 'function') showNotification('Đang dừng import...', 'warning');
}

/** Cập nhật UI thanh bulk actions (hiện/ẩn + số lượng). */
function _updateBulkImportBar() {
    const count   = _importState.selectedSlugs.size;
    const bar     = document.getElementById('apiBulkActionsBar');
    const countEl = document.getElementById('apiBulkSelectedCount');
    const btnBulk = document.getElementById('btnBulkImport');
    if (bar)     bar.style.display = count > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = count;
    if (btnBulk) btnBulk.innerHTML = `<i class="fas fa-file-import"></i> Import đã chọn (${count})`;
}

/**
 * Kiểm tra từng phím trong danh sách API có trong DB chưa, gắn badge "Có" cho phím đã import.
 * Chạy bất đồng bộ sau khi render, không block UI.
 * @param {Array} items - Danh sách phím vừa render
 */
async function _markImportedCards(items) {
    if (!items?.length || typeof supabase === 'undefined') return;

    const slugs = items.map(i => i.slug).filter(Boolean);
    if (!slugs.length) return;

    try {
        // Lấy tất cả các api_url_backup khớp (dạng URL đầy đủ của cả 3 nguồn hoặc slug ngắn)
        const fullUrls = [];
        slugs.forEach(s => {
            fullUrls.push(`https://phimapi.com/phim/${s}`);
            fullUrls.push(`https://ophim1.com/phim/${s}`);
            fullUrls.push(`https://api.nguonc.com/api/film/${s}`);
        });

        const { data: existingRows } = await supabase
            .from('movies')
            .select('api_url_backup')
            .in('api_url_backup', [...slugs, ...fullUrls]);

        if (!existingRows?.length) return;

        // Tạo Set cạc slug/URL đã có trong DB
        const inDbSet = new Set();
        existingRows.forEach(r => {
            const val = r.api_url_backup || '';
            inDbSet.add(val);
            // Chuẩn hóa: thêm cạ dạng slug ngắn
            const short = val.replace(/.*\/phim\//, '').split('?')[0].replace(/\/$/, '');
            inDbSet.add(short);
        });

        // Xác định provider chính từ api_url_backup (domain → providerId)
        const primaryProviderMap = {}; // slug → providerId gốc
        existingRows.forEach(r => {
            const val = r.api_url_backup || '';
            const short = val.replace(/.*\/(phim|film)\//, '').split('?')[0].replace(/\/$/, '');
            let pid = 'kkphim'; // mặc định
            if (val.includes('ophim1.com')) pid = 'ophim';
            else if (val.includes('nguonc.com')) pid = 'nguonc';
            if (short) primaryProviderMap[short] = pid;
        });

        // Gắn class + badge lên từng card đã import
        slugs.forEach(slug => {
            if (!inDbSet.has(slug)) return;
            // Tìm TẤT CẢ card cùng slug (multi-search có thể ra 3 card cùng slug)
            const cards = document.querySelectorAll(`.api-movie-card[data-slug="${slug}"]`);
            if (!cards.length) return;

            const primaryPid = primaryProviderMap[slug] || '';

            cards.forEach(card => {
                card.dataset.inDb = 'true';
                card.classList.add('in-db');
                const cardPid = card.dataset.providerId || '';
                const isPrimary = cardPid === primaryPid;

                // 1. Ẩn ô checkbox góc trái (cả primary và secondary)
                const cbWrap = card.querySelector('.api-card-select-wrap');
                if (cbWrap) cbWrap.style.display = 'none';

                // 2. Ẩn nút ➕ import (cả primary và secondary)
                const importBtn = card.querySelector('.api-card-import-btn');
                if (importBtn) importBtn.style.display = 'none';

                // 3. Badge phân biệt vai trò
                if (!card.querySelector('.api-in-db-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'api-in-db-badge';
                    if (isPrimary) {
                        badge.textContent = '⭐ Nguồn chính';
                        badge.style.cssText = 'position:absolute;top:8px;left:8px;background:rgba(59,130,246,0.92);color:#fff;font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:5px;z-index:10;letter-spacing:0.3px;pointer-events:none;';
                    } else {
                        badge.textContent = '🔗 Đã gộp';
                        badge.style.cssText = 'position:absolute;top:8px;left:8px;background:rgba(16,185,129,0.9);color:#fff;font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:5px;z-index:10;letter-spacing:0.3px;pointer-events:none;';
                    }
                    card.style.position = card.style.position || 'relative';
                    card.appendChild(badge);
                }
            });
        });

        // 4. Nếu drawer đang mở với slug đã có DB → đổi nút Lưu vào DB
        _updateDrawerImportBtnIfInDb(inDbSet);


        // Nếu filter đang bật, áp dụng ngay
        if (_importState.newOnlyFilterActive) applyNewOnlyFilter();
    } catch (err) {
        console.warn('[FilterDB] Lỗi check DB:', err.message);
    }
}

/**
 * Nếu drawer chi tiết đang mở với phim đã có trong DB → đổi nút "Lưu vào DB"
 * thành icon database màu xanh lá và disable để tránh import nhầm.
 * @param {Set} inDbSet - Set chứa slug/URL đã có trong DB
 */
function _updateDrawerImportBtnIfInDb(inDbSet) {
    const drawer = document.getElementById('apiDetailDrawer');
    if (!drawer || drawer.style.display === 'none' || !drawer.dataset.currentSlug) return;
    const currentSlug = drawer.dataset.currentSlug;
    const fullUrls = [
        `https://phimapi.com/phim/${currentSlug}`,
        `https://ophim1.com/phim/${currentSlug}`,
        `https://api.nguonc.com/api/film/${currentSlug}`
    ];
    if (!inDbSet.has(currentSlug) && !fullUrls.some(u => inDbSet.has(u))) return;

    // Tìm nút Lưu vào DB trong drawer
    const importBtn = Array.from(drawer.querySelectorAll('button')).find(b =>
        b.textContent.includes('Lưu') || b.innerHTML.includes('cloud-upload')
    );
    if (!importBtn) return;
    importBtn.innerHTML = '<i class="fas fa-link"></i> Gộp Server';
    importBtn.title = 'Phim đã có. Nhấn để gộp Server hiện tại vào DB.';
    importBtn.style.background = 'rgba(16,185,129,0.2)';
    importBtn.style.borderColor = 'rgba(16,185,129,0.5)';
    importBtn.style.color = '#34d399';
    importBtn.style.cursor = 'pointer';
}

/**
 * Ẩn/hiện các card phím theo trạng thái filter "Chỉ phím mới".
 * Card có class .in-db sẽ được ẩn khi filter bật.
 */
function applyNewOnlyFilter() {
    const cards = document.querySelectorAll('.api-movie-card');
    cards.forEach(card => {
        if (_importState.newOnlyFilterActive && card.dataset.inDb === 'true') {
            card.style.display = 'none';
        } else {
            card.style.display = '';
        }
    });
}

/**
 * Toggle nút "Chỉ phím mới" — 2 trạng thái:
 *   - Bật: ẩn phím đã có trong DB, thảy màu tím đậm
 *   - Tắt: hiện lại hết, nút về màu mặc định
 */
function toggleNewOnlyFilter() {
    _importState.newOnlyFilterActive = !_importState.newOnlyFilterActive;
    const btn = document.getElementById('btnFilterNewOnly');
    if (btn) {
        if (_importState.newOnlyFilterActive) {
            btn.style.background = 'rgba(167,139,250,0.3)';
            btn.style.borderColor = '#a78bfa';
            btn.style.color = '#fff';
            btn.innerHTML = '<i class="fas fa-filter"></i> Chỉ phím mới ●';
        } else {
            btn.style.background = 'rgba(167,139,250,0.08)';
            btn.style.borderColor = 'rgba(167,139,250,0.4)';
            btn.style.color = '#a78bfa';
            btn.innerHTML = '<i class="fas fa-filter"></i> Chỉ phím mới';
        }
    }
    applyNewOnlyFilter();
}

/** Cập nhật progress bar import hàng loạt. */
function _showImportProgress(done, total, label) {
    const cont    = document.getElementById('apiImportProgressContainer');
    const bar     = document.getElementById('apiImportProgressBar');
    const labelEl = document.getElementById('apiImportProgressLabel');
    const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
    if (cont)    cont.style.display = 'block';
    if (bar)     bar.style.width = pct + '%';
    if (labelEl) labelEl.textContent = `${done}/${total} · ${label}`;
}

/** Cập nhật badge trạng thái import trên card. */
function _updateCardImportBadge(slug, result) {
    const card = document.querySelector(`.api-movie-card[data-slug="${slug}"]`);
    if (!card) return;
    card.classList.remove('import-success', 'import-dup', 'import-fail');
    if (result.success)         card.classList.add('import-success');
    else if (result.duplicate)  card.classList.add('import-dup');
    else                        card.classList.add('import-fail');
}

/* ─── OVERRIDE renderApiMovieCards ─── */
// Script được lazy-load sau page load → chạy override ngay khi script load
// (không dùng window 'load' event vì nó đã fire trước khi script này được tải)
(function _initImportOverrides() {
    if (typeof renderApiMovieCards !== 'function') return;

    /**
     * Override renderApiMovieCards để thêm:
     * - Checkbox chọn nhiều phim (bulk import)
     * - Nút import nhanh (➕) trên mỗi card
     * - Hiển thị badge trạng thái sau khi import
     */
    window.renderApiMovieCards = function(items) {
        const grid = document.getElementById('apiMovieGrid');
        if (!grid) return;
        grid.innerHTML = '';

        // Reset lựa chọn khi render trang mới
        _importState.selectedSlugs.clear();
        _updateBulkImportBar();
        const selectAllCb = document.getElementById('apiSelectAllMovies');
        if (selectAllCb) selectAllCb.checked = false;

        // Hiện toolbar import sau khi có dữ liệu
        const importToolbar = document.getElementById('apiImportToolbar');
        if (importToolbar) importToolbar.style.display = 'flex';

        // Khởi tạo nút toggle Auto-Sync (sau khi toolbar hiện)
        if (typeof initAutoSyncToggleUI === 'function') initAutoSyncToggleUI();

        // Ẩn progress container
        const progressCont = document.getElementById('apiImportProgressContainer');
        if (progressCont) progressCont.style.display = 'none';


        if (!items || items.length === 0) {
            grid.innerHTML = `
                <div class="api-empty-state" id="apiEmptyState">
                    <div class="api-empty-icon"><i class="fas fa-film"></i></div>
                    <h3>Không có kết quả</h3>
                    <p>Thử thay đổi bộ lọc và gọi lại.</p>
                </div>`;
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'api-movie-card';
            card.dataset.slug = item.slug;
            card.title = item.name;
            card.dataset.providerId = item._providerId || (typeof _apiState !== 'undefined' ? _apiState.currentProvider : '') || '';

            // Checkbox chọn bulk import
            const cbWrap = document.createElement('div');
            cbWrap.className = 'api-card-select-wrap';
            cbWrap.onclick = e => e.stopPropagation();
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'api-card-select-cb';
            cb.dataset.slug = item.slug;
            if (item._providerId) cb.dataset.providerId = item._providerId;
            cb.onchange = () => toggleImportSelect(item.slug, cb);
            cbWrap.appendChild(cb);
            card.appendChild(cbWrap);

            // Poster phim
            if (item.poster) {
                const img = document.createElement('img');
                img.className = 'api-movie-card-poster';
                img.loading = 'lazy'; img.alt = item.name; img.src = item.poster;
                img.onerror = function () {
                    this.style.display = 'none';
                    const ph = document.createElement('div');
                    ph.className = 'api-movie-card-poster-placeholder';
                    ph.innerHTML = '<i class="fas fa-film"></i>';
                    card.insertBefore(ph, this);
                };
                card.appendChild(img);
            } else {
                const ph = document.createElement('div');
                ph.className = 'api-movie-card-poster-placeholder';
                ph.innerHTML = '<i class="fas fa-film"></i>';
                card.appendChild(ph);
            }

            // Hover overlay → xem chi tiết
            const overlay = document.createElement('div');
            overlay.className = 'api-movie-card-overlay';
            overlay.innerHTML = '<span class="api-movie-card-overlay-text"><i class="fas fa-eye"></i> Xem chi tiết</span>';
            card.appendChild(overlay);

            // Nút import nhanh ➕
            const importBtn = document.createElement('button');
            importBtn.className = 'api-card-import-btn';
            importBtn.title = 'Import nhanh vào database';
            importBtn.innerHTML = '<i class="fas fa-plus-circle"></i>';
            importBtn.onclick = e => { e.stopPropagation(); importQuickFromCard(item.slug, importBtn, item._providerId); };
            card.appendChild(importBtn);

            // Thông tin phim
            const typeClass = item.type === 'series' ? 'type-series' : 'type-single';
            const typeLabel = item.type === 'series' ? 'Bộ' : 'Lẻ';
            
            let providerBadgeHtml = '';
            if (item._providerId && API_PROVIDERS[item._providerId]) {
                const p = API_PROVIDERS[item._providerId];
                providerBadgeHtml = `<span class="api-badge" style="background:${p.color}20;color:${p.color};font-size:0.65rem;border:1px solid ${p.color}40;margin-right:4px;">${p.name}</span>`;
            }

            const info = document.createElement('div');
            info.className = 'api-movie-card-info';
            info.innerHTML = `
                <div class="api-movie-card-name">${item.name}</div>
                <div class="api-movie-card-meta">
                    ${providerBadgeHtml}
                    <span class="api-badge ${typeClass}">${typeLabel}</span>
                    ${item.year ? `<span class="api-badge year">${item.year}</span>` : ''}
                    ${item.status ? `<span class="api-badge" style="background:rgba(52,211,153,0.1);color:#34d399;font-size:0.65rem;">${item.status}</span>` : ''}
                </div>`;
            card.appendChild(info);

            // Click vào phần nội dung card → xem chi tiết
            card.onclick = e => {
                if (e.target.closest('.api-card-select-wrap, .api-card-import-btn')) return;
                if (typeof callApiDetail === 'function') callApiDetail(item.slug, item._providerId);
            };

            grid.appendChild(card);
        });

        // Sau khi render xong → check từng phim có trong DB không (async, không block UI)
        _markImportedCards(items);

        // Áp filter ngay nếu đang bật chế độ "Chỉ phim mới"
        if (_importState.newOnlyFilterActive) applyNewOnlyFilter();
    };

    // Override callApiDetail để lưu slug và providerId hiện tại vào drawer
    if (typeof callApiDetail === 'function') {
        const _origCallApiDetail = callApiDetail;
        window.callApiDetail = async function(slug, providerId) {
            const drawer = document.getElementById('apiDetailDrawer');
            if (drawer) {
                drawer.dataset.currentSlug = slug;
                if (providerId) drawer.dataset.currentProviderId = providerId;
                else delete drawer.dataset.currentProviderId;
            }
            const btn = document.getElementById('btnDetailImport');
            if (btn) {
                btn.disabled = false;
                btn.className = 'btn btn-sm api-detail-import-btn';
                btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Lưu vào DB';
            }
            return _origCallApiDetail(slug, providerId);
        };
    }
})();

console.log('✅ Admin API Import module loaded');

/* ─── AUTO-SYNC EPISODES ─── */

/**
 * Sync tập phim cho 1 phim từ API: chỉ INSERT tập mới, không xóa tập cũ.
 * Tập mới được gán created_at = NOW() và is_new = true để hiển thị badge MỚI.
 *
 * @param {string} movieId   - ID phim trong Supabase
 * @param {string} slug      - api_url_backup (slug KKPhim)
 * @param {object} provider  - API provider object từ API_PROVIDERS
 * @returns {Promise<{added: number, total: number}>}
 */
async function syncEpisodesForMovie(movieId, slug, provider) {
    if (!movieId || !slug || !provider || typeof supabase === 'undefined') return { added: 0, total: 0 };

    try {
        // Chuẩn hóa slug: nếu api_url_backup là URL đầy đủ thì trích xuất phần cuối
        // VD: "https://phimapi.com/phim/toi-pham-101" → "toi-pham-101"
        const cleanSlug = slug.startsWith('http')
            ? slug.replace(/.*\/phim\//, '').split('?')[0].replace(/\/$/, '')
            : slug;

        // 1. Gọi API lấy danh sách tập mới nhất
        const res = await fetch(provider.buildDetailUrl(cleanSlug));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const apiEpisodes = raw.episodes || [];
        if (!apiEpisodes.length) return { added: 0, total: 0 };

        // 2. Lấy danh sách episode_number đang có trong DB
        const { data: existingEps } = await supabase
            .from('episodes')
            .select('episode_number')
            .eq('movie_id', movieId);

        const existingNumbers = new Set((existingEps || []).map(e => String(e.episode_number)));

        // 3. Map FHD/FullHD/raw → giá trị chuẩn
        const _qualityMap = {
            'fhd': '1080p', 'fullhd': '1080p', 'full hd': '1080p',
            'hd': '720p', 'sd': '480p',
            '4k': '4K (2160p)', '2k': '2K (1440p)',
            '1080p': '1080p', '720p': '720p', '480p': '480p', '360p': '360p',
        };
        const normQuality = _qualityMap[(raw.movie?.quality || '').toLowerCase().trim()] || raw.movie?.quality || '1080p';
        const movieDuration = raw.movie?.time || '';

        // 4. Xây dựng map tập mới (theo cùng logic _importEpisodesForMovie)
        const episodeMap = {};
        apiEpisodes.forEach(server => {
            const serverName = server.server_name || '';
            const lower = serverName.toLowerCase();
            let mainLabel = 'Vietsub';
            let embedLabel = 'Dự phòng';
            if (lower.includes('thuyet-minh') || lower.includes('thuyết minh') || lower.includes('tm')) {
                mainLabel = 'Thuyết minh'; embedLabel = 'Thuyết minh dự phòng';
            } else if (lower.includes('long-tieng') || lower.includes('lồng tiếng') || lower.includes('lt')) {
                mainLabel = 'Lồng tiếng'; embedLabel = 'Lồng tiếng dự phòng';
            }

            (server.server_data || []).forEach((ep, idx) => {
                const epName = String(ep.name || (idx + 1));
                if (!episodeMap[epName]) {
                    episodeMap[epName] = {
                        movie_id: movieId,
                        episode_index: idx,
                        episode_number: epName,
                        title: epName,
                        quality: normQuality,
                        duration: movieDuration,
                        sources: [],
                        intro_begin: 0, intro_end: 0, intro_start: 0,
                        is_new: true,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    };
                }
                if (ep.link_m3u8 && !episodeMap[epName].sources.some(s => s.source === ep.link_m3u8)) {
                    episodeMap[epName].sources.push({ label: mainLabel, type: 'hls', source: ep.link_m3u8 });
                }
                if (ep.link_embed && !episodeMap[epName].sources.some(s => s.source === ep.link_embed)) {
                    episodeMap[epName].sources.push({ label: embedLabel, type: 'embed', source: ep.link_embed });
                }
            });
        });

        // 5. Chỉ INSERT tập chưa có trong DB
        const toInsert = Object.values(episodeMap)
            .filter(ep => !existingNumbers.has(ep.episode_number))
            .sort((a, b) => (parseFloat(a.episode_number) || 0) - (parseFloat(b.episode_number) || 0));

        if (!toInsert.length) return { added: 0, total: existingNumbers.size };

        const BATCH = 50;
        for (let i = 0; i < toInsert.length; i += BATCH) {
            const { error } = await supabase.from('episodes').insert(toInsert.slice(i, i + BATCH));
            if (error) console.warn(`[AutoSync] Lỗi insert tập batch:`, error.message);
        }

        console.log(`[AutoSync] ✅ Phim "${slug}": thêm ${toInsert.length} tập mới.`);
        return { added: toInsert.length, total: existingNumbers.size + toInsert.length };

    } catch (err) {
        console.warn(`[AutoSync] ⚠️ Lỗi sync phim "${slug}":`, err.message);
        return { added: 0, total: 0 };
    }
}

/**
 * Tự động sync tập mới cho phim bộ đang chiếu (chưa đủ tập theo total_episodes).
 * Chạy hoàn toàn ngầm, cooldown 6h lưu trong app_configs.
 * Chỉ sync phim có total_episodes > 0 và số tập hiện tại < total_episodes.
 * Kiểm tra toggle bật/tắt từ localStorage trước khi chạy.
 */
async function autoSyncEpisodesIfNeeded() {
    if (typeof supabase === 'undefined') return;

    // Kiểm tra toggle bật/tắt từ Supabase app_configs
    try {
        const { data: toggleRow } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'auto_sync_enabled')
            .maybeSingle();
        // Mặc định là bật (nếu chưa có config thì xem là ON)
        const isEnabled = toggleRow?.value?.enabled !== false;
        if (!isEnabled) {
            console.log('[AutoSync] ⏸️ Đã tắt bởi admin.');
            return;
        }
    } catch (_) {}

    // Đọc thời gian cooldown từ app_configs (admin cài), mặc định 6h nếu chưa cài
    let COOLDOWN_HOURS = 6;
    try {
        const { data: intervalRow } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'auto_sync_interval_hours')
            .maybeSingle();
        const saved = Number(intervalRow?.value?.hours);
        if (saved >= 1 && saved <= 720) COOLDOWN_HOURS = saved;
    } catch (_) {}
    const CONFIG_KEY = 'last_episode_sync';

    try {
        // 1. Kiểm tra cooldown từ app_configs
        const { data: configRow } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', CONFIG_KEY)
            .maybeSingle();

        const lastSync = configRow?.value?.timestamp || 0;
        const hoursSinceLast = (Date.now() - lastSync) / (1000 * 60 * 60);

        if (hoursSinceLast < COOLDOWN_HOURS) {
            console.log(`[AutoSync] ⏱️ Bỏ qua — lần sync cuối ${hoursSinceLast.toFixed(1)}h trước (cooldown ${COOLDOWN_HOURS}h).`);
            _updateAutoSyncLastInfo(configRow?.value);
            return;
        }

        console.log('[AutoSync] 🔄 Bắt đầu sync tập phim từ API...');

        // 2. Lấy provider
        const provider = typeof API_PROVIDERS !== 'undefined' && typeof _apiState !== 'undefined'
            ? API_PROVIDERS[_apiState.currentProvider]
            : (typeof API_PROVIDERS !== 'undefined' ? API_PROVIDERS['kkphim'] : null);
        if (!provider) { console.warn('[AutoSync] Không tìm thấy API provider.'); return; }

        // 3. Lấy phim bộ có api_url_backup VÀ total_episodes > 0
        const { data: movies } = await supabase
            .from('movies')
            .select('id, title, api_url_backup, total_episodes')
            .eq('type', 'series')
            .not('api_url_backup', 'is', null)
            .neq('api_url_backup', '')
            .gt('total_episodes', 0); // Chỉ phim có cài tổng số tập

        if (!movies?.length) {
            console.log('[AutoSync] Không có phim bộ nào đủ điều kiện sync.');
            return;
        }

        // 4. Lọc: chỉ sync phim chưa đủ tập (số tập hiện có < total_episodes)
        const moviesNeedSync = [];
        for (const movie of movies) {
            const { count } = await supabase
                .from('episodes')
                .select('*', { count: 'exact', head: true })
                .eq('movie_id', movie.id);
            const currentCount = count || 0;
            if (currentCount < movie.total_episodes) {
                moviesNeedSync.push({ ...movie, currentEps: currentCount });
                console.log(`[AutoSync] Cần sync: "${movie.title}" (${currentCount}/${movie.total_episodes})`);
            }
        }

        if (!moviesNeedSync.length) {
            console.log('[AutoSync] ✅ Tất cả phim đã đủ tập, không cần sync.');
            // Vẫn lưu timestamp để reset cooldown
            const syncData = { timestamp: Date.now(), totalAdded: 0, movieCount: 0, checkedCount: movies.length };
            await supabase.from('app_configs').upsert({ key: CONFIG_KEY, value: syncData, updated_at: new Date().toISOString() });
            _updateAutoSyncLastInfo(syncData);
            return;
        }

        let totalAdded = 0;

        // 5. Sync từng phim chưa đủ tập (delay 600ms tránh spam API)
        for (const movie of moviesNeedSync) {
            const result = await syncEpisodesForMovie(movie.id, movie.api_url_backup, provider);
            totalAdded += result.added;

            // ★ Cross-fetch đa nguồn: gộp tập từ OPhim, NguonC... nếu có tập mới
            if (result.added > 0 && typeof _crossFetchFromAllProviders === 'function') {
                try {
                    const providerName = provider.name || provider.id || 'KKPhim';
                    const slug = movie.api_url_backup.startsWith('http')
                        ? movie.api_url_backup.replace(/.*\/phim\//, '').split('?')[0].replace(/\/$/, '')
                        : movie.api_url_backup;
                    console.log(`[AutoSync] 🌐 Cross-fetch đa nguồn cho "${movie.title}"...`);
                    await _crossFetchFromAllProviders(movie.id, slug, providerName, movie.title || '');
                    // Cập nhật versions sau khi gộp đa nguồn
                    if (typeof _syncMovieVersionsFromEpisodes === 'function') {
                        await _syncMovieVersionsFromEpisodes(movie.id);
                    }
                    console.log(`[AutoSync] ✅ Cross-fetch xong cho "${movie.title}".`);
                } catch (crossErr) {
                    console.warn(`[AutoSync] ⚠️ Lỗi cross-fetch "${movie.title}":`, crossErr.message);
                }
            }

            await new Promise(r => setTimeout(r, 600));
        }

        // 6. Lưu timestamp vào app_configs
        const syncData = { timestamp: Date.now(), totalAdded, movieCount: moviesNeedSync.length, checkedCount: movies.length };
        await supabase.from('app_configs').upsert({ key: CONFIG_KEY, value: syncData, updated_at: new Date().toISOString() });
        _updateAutoSyncLastInfo(syncData);

        console.log(`[AutoSync] ✅ Hoàn tất: sync ${moviesNeedSync.length}/${movies.length} phim, thêm ${totalAdded} tập mới.`);

        // 7. Refresh danh sách tập — CHỈ KHI modal edit episode KHÔNG đang mở
        // (tránh đóng modal preview khi admin đang xem/chỉnh tập)
        const episodeModal = document.getElementById('episodeModal');
        const isModalOpen = episodeModal && (episodeModal.style.display === 'flex' || episodeModal.classList.contains('active') || episodeModal.classList.contains('show'));
        if (totalAdded > 0 && !isModalOpen && typeof selectedMovieForEpisodes !== 'undefined' && selectedMovieForEpisodes) {
            if (typeof loadEpisodesForMovie === 'function') loadEpisodesForMovie(selectedMovieForEpisodes, false);
        }

    } catch (err) {
        console.warn('[AutoSync] Lỗi:', err.message);
    }
}

/**
 * Cập nhật thông tin "sync lần cuối" hiển thị cạnh nút toggle.
 * @param {object} syncData - { timestamp, totalAdded, movieCount }
 */
function _updateAutoSyncLastInfo(syncData) {
    const el = document.getElementById('autoSyncLastInfo');
    if (!el || !syncData?.timestamp) return;
    const d = new Date(syncData.timestamp);
    const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    el.textContent = `Sync lúc ${timeStr} ${dateStr}`;
}

/**
 * Bật/tắt tính năng Auto-Sync tập mới.
 * Lưu trạng thái vào Supabase app_configs (key: auto_sync_enabled).
 */
async function toggleAutoSyncFeature() {
    if (typeof supabase === 'undefined') return;
    const btn = document.getElementById('btnToggleAutoSync');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
        // Đọc trạng thái hiện tại từ DB
        const { data: row } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'auto_sync_enabled')
            .maybeSingle();

        const current = row?.value?.enabled !== false; // mặc định ON
        const newState = !current;

        // Lưu trạng thái mới vào DB
        await supabase.from('app_configs').upsert({
            key: 'auto_sync_enabled',
            value: { enabled: newState, updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString(),
        });

        _renderAutoSyncToggleBtn(newState);
        if (typeof showNotification === 'function') {
            showNotification(
                newState ? '✅ Đã bật Auto-Sync tập mới' : '⏸️ Đã tắt Auto-Sync tập mới',
                newState ? 'success' : 'warning'
            );
        }
    } catch (err) {
        console.error('[AutoSync] Lỗi đổi trạng thái:', err.message);
        if (typeof showNotification === 'function') showNotification('Lỗi khi lưu cài đặt!', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

/* 🧪 TEST ONLY — XÓA SAU KHI TEST XONG */
let _testSyncIntervalId = null;
async function toggleTestSyncLoop() {
    const btn = document.getElementById('btnTestSyncLoop');
    if (_testSyncIntervalId) {
        clearInterval(_testSyncIntervalId);
        _testSyncIntervalId = null;
        if (btn) { btn.textContent = '🧪 Test Sync'; btn.style.background = 'rgba(255,146,43,0.12)'; btn.style.borderColor = '#ff922b'; btn.style.color = '#ff922b'; }
        if (typeof showNotification === 'function') showNotification('Đã dừng test sync', 'warning');
        return;
    }
    const runSync = async () => {
        // Reset cooldown để bypass kiểm tra 6h
        if (typeof supabase !== 'undefined') {
            await supabase.from('app_configs').upsert({ key: 'last_episode_sync', value: { timestamp: 0 }, updated_at: new Date().toISOString() });
        }
        if (typeof autoSyncEpisodesIfNeeded === 'function') await autoSyncEpisodesIfNeeded();
    };
    await runSync();
    _testSyncIntervalId = setInterval(runSync, 5 * 60 * 1000);
    if (btn) { btn.textContent = '🔴 Dừng Test (5m)'; btn.style.background = 'rgba(255,50,50,0.15)'; btn.style.borderColor = '#ff4444'; btn.style.color = '#ff4444'; }
    if (typeof showNotification === 'function') showNotification('🧪 Test sync bắt đầu — lặp mỗi 5 phút. Xem log F12.', 'info');
}
/* END TEST ONLY */

/**
 * Lưu thời gian cooldown sync do admin cài vào Supabase app_configs.
 * Key: 'auto_sync_interval_hours', value: { hours: N }
 * Giới hạn: 1-720 giờ (tối đa 30 ngày).
 */
async function saveAutoSyncInterval() {
    if (typeof supabase === 'undefined') return;
    const input = document.getElementById('autoSyncIntervalInput');
    const hours = parseInt(input?.value);
    if (!hours || hours < 1 || hours > 720) {
        if (typeof showNotification === 'function') showNotification('Số giờ không hợp lệ (1 - 720h)!', 'error');
        return;
    }
    try {
        await supabase.from('app_configs').upsert({
            key: 'auto_sync_interval_hours',
            value: { hours, updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString(),
        });
        if (typeof showNotification === 'function')
            showNotification(`✅ Đã lưu: tự động sync mỗi ${hours} giờ`, 'success');
    } catch (err) {
        console.error('[AutoSync] Lỗi lưu interval:', err.message);
        if (typeof showNotification === 'function') showNotification('Lỗi khi lưu!', 'error');
    }
}

/**
 * Render trạng thái nút toggle Auto-Sync (ON/OFF).
 * @param {boolean} isEnabled
 */
function _renderAutoSyncToggleBtn(isEnabled) {
    const btn = document.getElementById('btnToggleAutoSync');
    if (!btn) return;
    btn.textContent = isEnabled ? 'ON' : 'OFF';
    btn.style.background = isEnabled
        ? 'linear-gradient(135deg,#00d2ff,#0099cc)'
        : 'rgba(255,255,255,0.1)';
    btn.style.color = isEnabled ? '#fff' : 'var(--text-muted)';
}

/**
 * Khởi tạo trạng thái toggle Auto-Sync khi toolbar hiện ra.
 * Đọc trạng thái từ Supabase app_configs.
 */
function initAutoSyncToggleUI() {
    if (typeof supabase === 'undefined') return;
    _renderAutoSyncToggleBtn(true);
    const btn = document.getElementById('btnToggleAutoSync');
    if (btn) btn.disabled = true;

    // Đọc cả 3 config cùng lúc: trạng thái, lần sync cuối, và số giờ
    Promise.all([
        supabase.from('app_configs').select('value').eq('key', 'auto_sync_enabled').maybeSingle(),
        supabase.from('app_configs').select('value').eq('key', 'last_episode_sync').maybeSingle(),
        supabase.from('app_configs').select('value').eq('key', 'auto_sync_interval_hours').maybeSingle(),
    ]).then(([{ data: toggleRow }, { data: syncRow }, { data: intervalRow }]) => {
        const isEnabled = toggleRow?.value?.enabled !== false;
        _renderAutoSyncToggleBtn(isEnabled);
        if (syncRow?.value) _updateAutoSyncLastInfo(syncRow.value);
        // Hiện số giờ đã lưu vào input
        const savedHours = Number(intervalRow?.value?.hours);
        const input = document.getElementById('autoSyncIntervalInput');
        if (input && savedHours >= 1) input.value = savedHours;
        if (btn) btn.disabled = false;
    }).catch(() => {
        _renderAutoSyncToggleBtn(true);
        if (btn) btn.disabled = false;
    });
}

/* ─── BATCH UPDATE IMDb RATING CHO PHIM CŨ ─── */

/**
 * Cập nhật hàng loạt điểm IMDb cho tất cả phim chưa có imdb_rating.
 * Gọi OMDB API bằng origin_title + year, delay 500ms giữa các request.
 * Dùng trong Admin Console hoặc gắn vào nút trên giao diện Admin.
 *
 * @param {boolean} forceAll - true = cập nhật tất cả phim (kể cả đã có điểm)
 */
async function batchUpdateImdbRatings(forceAll = false) {
    if (typeof supabase === 'undefined' || typeof allMovies === 'undefined') {
        console.error('[IMDb Batch] Supabase hoặc allMovies chưa sẵn sàng');
        return;
    }

    // Lọc phim cần cập nhật
    const moviesToUpdate = forceAll
        ? allMovies
        : allMovies.filter(m => !m.imdbRating && !m.imdb_rating);

    if (moviesToUpdate.length === 0) {
        console.log('✅ [IMDb Batch] Tất cả phim đã có điểm IMDb!');
        if (typeof showNotification === 'function') showNotification('Tất cả phim đã có điểm IMDb!', 'success');
        return;
    }

    console.log(`🎬 [IMDb Batch] Bắt đầu cập nhật ${moviesToUpdate.length} phim...`);
    if (typeof showNotification === 'function') {
        showNotification(`Đang cập nhật IMDb cho ${moviesToUpdate.length} phim... Vui lòng đợi.`, 'info');
    }

    let updated = 0, skipped = 0, failed = 0;

    for (const movie of moviesToUpdate) {
        const title = movie.originTitle || movie.origin_title || movie.title || '';
        if (!title) { skipped++; continue; }

        try {
            const imdbRating = await _fetchImdbRating(title, movie.year);

            if (imdbRating !== null) {
                // Cập nhật vào Supabase
                const { error } = await supabase
                    .from('movies')
                    .update({ imdb_rating: imdbRating })
                    .eq('id', movie.id);

                if (error) {
                    console.warn(`❌ [IMDb] Lỗi update "${movie.title}":`, error.message);
                    failed++;
                } else {
                    // Cập nhật cache local
                    movie.imdbRating = imdbRating;
                    movie.imdb_rating = imdbRating;
                    updated++;
                    console.log(`✅ [IMDb] "${movie.title}" → ${imdbRating}`);
                }
            } else {
                skipped++;
            }
        } catch (e) {
            console.warn(`❌ [IMDb] Lỗi xử lý "${movie.title}":`, e.message);
            failed++;
        }

        // Delay 500ms để không spam OMDB API (free: 1000 req/ngày)
        await new Promise(r => setTimeout(r, 500));
    }

    const msg = `✅ IMDb Batch: ${updated} cập nhật · ${skipped} bỏ qua · ${failed} lỗi`;
    console.log(`🎬 [IMDb Batch] ${msg}`);
    if (typeof showNotification === 'function') showNotification(msg, 'success');

    // Lưu lại cache
    if (typeof saveToCache === 'function') saveToCache('movies', allMovies);
}

// Gắn ra global scope để admin gọi từ DevTools console
window.batchUpdateImdbRatings = batchUpdateImdbRatings;

/* ═══════════════════════════════════════════════════════════════
   SYNC VERSIONS & MERGE NGUỒN & CROSS-FETCH & BULK SCAN ĐA NGUỒN
   ═══════════════════════════════════════════════════════════════ */

/**
 * Quét tất cả sources trong episodes của 1 phim → tự động cập nhật versions trên movies.
 * Chạy sau khi merge/cross-fetch để đảm bảo cột versions phản ánh đúng thực tế.
 * @param {string} movieId
 */
async function _syncMovieVersionsFromEpisodes(movieId) {
    if (!movieId || typeof supabase === 'undefined') return;
    try {
        const { data: eps } = await supabase
            .from('episodes')
            .select('sources')
            .eq('movie_id', movieId);
        if (!eps?.length) return;

        // Trích xuất tất cả label duy nhất từ sources
        const versionSet = new Set();
        for (const ep of eps) {
            if (!Array.isArray(ep.sources)) continue;
            for (const src of ep.sources) {
                const label = (src.label || '').trim();
                if (!label) continue;
                // Chuẩn hóa: bỏ "dự phòng" ở cuối, bỏ suffix server
                const clean = label.replace(/\s*dự phòng$/i, '').trim();
                if (clean) versionSet.add(clean);
            }
        }

        if (versionSet.size === 0) return;
        const newVersions = [...versionSet];

        // So sánh với versions hiện tại, chỉ update nếu có thay đổi
        const { data: movie } = await supabase.from('movies').select('versions').eq('id', movieId).single();
        const oldVersions = movie?.versions || [];
        const oldSet = new Set(oldVersions);
        const hasNew = newVersions.some(v => !oldSet.has(v));
        if (!hasNew && oldVersions.length >= newVersions.length) return; // Không cần update

        await supabase.from('movies').update({ versions: newVersions }).eq('id', movieId);
        console.log(`[SyncVersions] ✅ Cập nhật versions cho ${movieId}:`, newVersions);
    } catch (e) {
        console.warn('[SyncVersions] Lỗi:', e.message);
    }
}

/**
 * Gộp nguồn video mới từ 1 API vào các tập phim đã có trong DB.
 * Không xóa dữ liệu cũ, chỉ push thêm source chưa tồn tại.
 * @param {string} movieId       - ID phim trong Supabase
 * @param {Array}  episodesData  - Mảng episodes từ API [{server_name, server_data/items}]
 * @param {string} providerName  - Tên nguồn API (VD: 'KKPhim', 'OPhim')
 * @returns {Promise<{added: number}>}
 */
async function _mergeEpisodesSources(movieId, episodesData, providerName) {
    if (!movieId || !episodesData?.length || typeof supabase === 'undefined') return { added: 0 };

    try {
        // Hàm chuẩn hóa số tập: "Tập 01" → "1", "Episode 5" → "5", "1" → "1", "01" → "1"
        function _normalizeEpNumber(raw) {
            const s = String(raw || '').trim().toLowerCase();
            // Loại bỏ prefix "tập", "tap", "episode", "ep" + khoảng trắng/dấu
            const cleaned = s.replace(/^(tập|tap|episode|ep)[\s._-]*/i, '').trim();
            // Trích xuất số đầu tiên tìm thấy
            const numMatch = cleaned.match(/(\d+(\.\d+)?)/);
            return numMatch ? String(parseFloat(numMatch[1])) : s;
        }

        // 1. Lấy tất cả tập hiện có của phim này từ DB
        const { data: existingEps } = await supabase
            .from('episodes')
            .select('id, episode_number, sources')
            .eq('movie_id', movieId);

        if (!existingEps || existingEps.length === 0) return { added: 0 };

        // Map episode_number (chuẩn hóa) → DB record để tra nhanh
        // Lưu cả bản gốc và bản chuẩn hóa để khớp linh hoạt giữa các provider
        const epMap = {};
        existingEps.forEach(ep => {
            // Key gốc (chính xác)
            epMap[String(ep.episode_number)] = ep;
            // Key chuẩn hóa (số thuần túy)
            const norm = _normalizeEpNumber(ep.episode_number);
            if (!epMap[norm]) epMap[norm] = ep; // Ưu tiên key gốc nếu trùng
        });

        let totalAdded = 0;

        // 2. Duyệt episodesData mới từ API
        for (const server of episodesData) {
            const serverName = server.server_name || '';
            const lower = serverName.toLowerCase();

            // Map tên server → label chuẩn (giống _importEpisodesForMovie)
            let mainLabel = 'Vietsub';
            if (lower.includes('thuyet-minh') || lower.includes('thuyết minh') || lower.includes('thuyet minh') || lower.includes('tm')) {
                mainLabel = 'Thuyết minh';
            } else if (lower.includes('long-tieng') || lower.includes('lồng tiếng') || lower.includes('long tieng') || lower.includes('lt')) {
                mainLabel = 'Lồng tiếng';
            } else if (lower.includes('ban-goc') || lower.includes('bản gốc') || lower.includes('raw') || lower.includes('original')) {
                mainLabel = 'Bản gốc';
            }

            const srvData = server.server_data || server.items || [];
            for (const ep of srvData) {
                const epName = String(ep.name || '').trim();
                // Thử khớp: (1) tên gốc chính xác, (2) tên chuẩn hóa (số thuần)
                const dbEp = epMap[epName] || epMap[_normalizeEpNumber(epName)];
                if (!dbEp) continue; // Tập này không tồn tại trong DB → bỏ qua

                const currentSources = Array.isArray(dbEp.sources) ? [...dbEp.sources] : [];
                let addedForThisEp = 0;

                const m3u8Link = ep.link_m3u8 || ep.m3u8 || '';
                const embedLink = ep.link_embed || ep.embed || '';

                // Push m3u8 nếu chưa có link này
                if (m3u8Link && !currentSources.some(s => s.source === m3u8Link)) {
                    currentSources.push({ label: mainLabel, type: 'hls', source: m3u8Link, server: providerName });
                    addedForThisEp++;
                }
                // Push embed nếu chưa có link này
                if (embedLink && !currentSources.some(s => s.source === embedLink)) {
                    currentSources.push({ label: mainLabel + ' dự phòng', type: 'embed', source: embedLink, server: providerName });
                    addedForThisEp++;
                }

                // Chỉ update DB nếu thực sự có thêm nguồn mới
                if (addedForThisEp > 0) {
                    await supabase.from('episodes')
                        .update({ sources: currentSources, updated_at: new Date().toISOString() })
                        .eq('id', dbEp.id);
                    totalAdded += addedForThisEp;
                    // Cập nhật cache local để các tập sau cùng phim không bị trùng
                    dbEp.sources = currentSources;
                }
            }
        }

        if (totalAdded > 0) {
            console.log(`[MergeSources] ✅ Đã gộp ${totalAdded} nguồn "${providerName}" vào movieId: ${movieId}`);
        }
        return { added: totalAdded };
    } catch (err) {
        console.error('[MergeSources] Lỗi:', err);
        return { added: 0 };
    }
}

/**
 * Quét chéo tất cả API providers khác để lấy thêm nguồn video cho 1 phim.
 * Chiến lược "Search-Then-Detail": Tìm kiếm theo tên phim trên từng Provider
 * để tìm đúng slug tương ứng, rồi mới fetch chi tiết.
 * @param {string} movieId          - ID phim đã lưu trong DB
 * @param {string} slug             - Slug phim gốc (dùng làm fallback)
 * @param {string} excludeProvider  - Tên/ID provider đã import (bỏ qua)
 * @param {string} movieName        - Tên phim gốc để Search (optional, lấy từ DB nếu thiếu)
 */
async function _crossFetchFromAllProviders(movieId, slug, excludeProvider, movieName = '') {
    const _fetchedProviders = []; // Danh sách provider gộp thành công
    if (!movieId || !slug || typeof API_PROVIDERS === 'undefined') return _fetchedProviders;

    // Nếu chưa có tên phim → thử lấy từ DB
    if (!movieName) {
        try {
            const { data } = await supabase.from('movies').select('title').eq('id', movieId).single();
            movieName = data?.title || '';
        } catch(e) { /* ignore */ }
    }

    const providerKeys = Object.keys(API_PROVIDERS);
    for (const key of providerKeys) {
        const otherProvider = API_PROVIDERS[key];
        // Bỏ qua provider đã import
        if (otherProvider.name === excludeProvider || otherProvider.id === excludeProvider) continue;

        try {
            let resolvedSlug = slug; // Mặc định thử slug gốc
            let foundViaSearch = false;

            // ★ Progress: Đang quét nguồn
                _addImportLog(`🔍 Đang tìm "${movieName || slug}" trên ${otherProvider.name}...`, 'info');

            // ★ BƯỚC 1: Thử tìm kiếm theo tên phim trên Provider này
            if (movieName && typeof otherProvider.buildSearchUrl === 'function') {
                try {
                    const searchUrl = otherProvider.buildSearchUrl(movieName, 1);
                    const searchRes = await fetch(searchUrl);
                    if (searchRes.ok) {
                        const searchRaw = await searchRes.json();
                        const parsed = otherProvider.parseListResponse(searchRaw);
                        
                        if (parsed.items && parsed.items.length > 0) {
                            // Tìm item có slug trùng khớp chính xác trước
                            let match = parsed.items.find(i => i.slug === slug);
                            
                            // Nếu không trùng khớp slug → tìm theo tên (so sánh lowercase)
                            if (!match) {
                                const lowerName = movieName.toLowerCase().trim();
                                match = parsed.items.find(i => 
                                    (i.name || '').toLowerCase().trim() === lowerName ||
                                    (i.origin_name || '').toLowerCase().trim() === lowerName
                                );
                            }
                            
                            // Nếu vẫn không → lấy kết quả đầu tiên (gần nhất)
                            if (!match && parsed.items.length === 1) {
                                match = parsed.items[0];
                            }
                            
                            if (match && match.slug) {
                                resolvedSlug = match.slug;
                                foundViaSearch = true;
                                _addImportLog(`✅ Tìm thấy trên ${otherProvider.name}: "${match.name || resolvedSlug}"`, 'success');
                            }
                        }
                    }
                } catch (searchErr) {
                    console.warn(`[CrossFetch] Search lỗi trên ${otherProvider.name}:`, searchErr.message);
                }
            }

            // ★ BƯỚC 2: Gọi Detail API với slug đã giải quyết
            const url = otherProvider.buildDetailUrl(resolvedSlug);
            const res = await fetch(url);
            
            if (!res.ok) {
                _addImportLog(`⚠️ ${otherProvider.name}: Không tìm thấy phim này`, 'warning');
                console.log(`[CrossFetch] ${otherProvider.name}: Không tìm thấy slug "${resolvedSlug}" (HTTP ${res.status})`);
                continue;
            }
            
            const raw = await res.json();

            // Kiểm tra dữ liệu hợp lệ
            const movieData = raw.movie || raw;
            const apiEpisodes = raw.episodes || movieData.episodes || [];
            if (!apiEpisodes.length) continue;

            // Normalize episodes cho NguonC (items[] thay vì server_data[])
            const normalizedEps = apiEpisodes.map(srv => ({
                server_name: srv.server_name || 'Server',
                server_data: (srv.server_data || srv.items || []).map(ep => ({
                    name: ep.name,
                    link_m3u8: ep.link_m3u8 || ep.m3u8 || '',
                    link_embed: ep.link_embed || ep.embed || '',
                })),
            }));

            // Progress: Đang gộp
            // Đếm số tập duy nhất (lấy từ server đầu tiên vì mỗi server có cùng số tập)
            const _uniqueEpCount = normalizedEps.length > 0 ? (normalizedEps[0].server_data?.length || 0) : 0;
            const totalEps = normalizedEps.reduce((s, srv) => s + (srv.server_data?.length || 0), 0);
            _addImportLog(`📥 Đang gộp ${_uniqueEpCount} tập từ ${otherProvider.name}...`, 'info');

            // Gộp nguồn từ API này vào DB
            const result = await _mergeEpisodesSources(movieId, normalizedEps, otherProvider.name || otherProvider.id);
            if (result.added > 0) {
                console.log(`[CrossFetch] ✅ Thêm ${result.added} nguồn từ "${otherProvider.name}" cho slug: ${resolvedSlug}${foundViaSearch ? ' (tìm qua Search)' : ''}`);
                _addImportLog(`✅ Gộp thành công ${result.added} nguồn từ ${otherProvider.name}!`, 'success');
                _fetchedProviders.push({ name: otherProvider.name, epCount: _uniqueEpCount });
            } else {
                _addImportLog(`ℹ️ ${otherProvider.name}: Đã có đủ nguồn, không cần thêm`, 'info');
            }

            // Delay nhẹ tránh spam API
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            // API kia lỗi hoặc không tìm thấy → bỏ qua, không ảnh hưởng import chính
            console.warn(`[CrossFetch] ${otherProvider.name}: ${e.message}`);
        }
    }
    return _fetchedProviders;
}

/**
 * Quét bổ sung nguồn hàng loạt cho TẤT CẢ phim đã có trên web.
 * Admin bấm nút từ giao diện "Quản lý API".
 * Duyệt từng phim, check slug trên tất cả API, merge nguồn mới.
 */
async function bulkScanAllMoviesSources() {
    if (typeof supabase === 'undefined') return;
    if (_importState.isImporting) {
        if (typeof showNotification === 'function') showNotification('Đang có tiến trình import khác đang chạy!', 'warning');
        return;
    }

    // Lấy tất cả phim có api_url_backup (đã import từ API)
    const { data: movies, error } = await supabase
        .from('movies')
        .select('id, title, api_url_backup')
        .not('api_url_backup', 'is', null)
        .neq('api_url_backup', '');

    if (error || !movies?.length) {
        if (typeof showNotification === 'function') showNotification('Không có phim nào cần quét hoặc lỗi kết nối!', 'warning');
        return;
    }

    _importState.isImporting = true;
    _importState.importAbort = false;

    const total = movies.length;
    let done = 0, updatedCount = 0;

    // Hiện UI progress
    const btnScan = document.getElementById('btnBulkScanSources');
    const btnAbort = document.getElementById('btnAbortBulkScan');
    if (btnScan) { btnScan.disabled = true; btnScan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang quét...'; }
    if (btnAbort) btnAbort.style.display = 'inline-flex';
    _showImportProgress(0, total, 'Bắt đầu quét đa nguồn...');

    for (const movie of movies) {
        if (_importState.importAbort) {
            _showImportProgress(done, total, '⚠️ Đã dừng bởi admin');
            break;
        }

        // Trích xuất slug từ api_url_backup
        const slug = (movie.api_url_backup || '')
            .replace(/.*\/(phim|film)\//, '').split('?')[0].replace(/\/$/, '');

        if (!slug) { done++; continue; }

        _showImportProgress(done, total, `Quét: ${movie.title || slug}`);

        // Gọi hàm quét chéo thông minh (Search-Then-Detail) cho tất cả providers
        try {
            await _crossFetchFromAllProviders(movie.id, slug, '', movie.title || '');
            updatedCount++;
        } catch (e) {
            // Bỏ qua lỗi, tiếp tục phim tiếp theo
        }

        done++;
        await new Promise(r => setTimeout(r, 200)); // Delay giữa các phim
    }

    _importState.isImporting = false;
    const msg = `✅ Hoàn tất quét ${done}/${total} phim — Cập nhật ${updatedCount} nguồn mới`;
    _showImportProgress(done, total, msg);

    if (btnScan) { btnScan.disabled = false; btnScan.innerHTML = '<i class="fas fa-satellite-dish"></i> Quét Đa Nguồn'; }
    if (btnAbort) btnAbort.style.display = 'none';
    if (typeof showNotification === 'function') showNotification(msg, updatedCount > 0 ? 'success' : 'info');
}

/** Dừng quét bulk scan */
function abortBulkScan() {
    _importState.importAbort = true;
    if (typeof showNotification === 'function') showNotification('Đang dừng quét...', 'warning');
}

/**
 * Fix tất cả tập phim có server rỗng → tự detect từ URL video
 * Quét toàn bộ bảng episodes, kiểm tra sources JSON, tự xác định nguồn từ URL
 */
async function fixEmptyServerNames() {
    if (!supabase) return;
    
    const confirmed = await customConfirm(
        'Quét tất cả tập phim trong DB và sửa các nguồn có server rỗng.\n\nHệ thống sẽ TỰ DETECT nguồn từ URL video:\n• URL chứa "ophim" → OPhim (Server 2)\n• URL chứa "nguonc" → NguonC (Server 3)\n• Còn lại → KKPhim (Server 1)',
        { title: 'Fix Server rỗng (Auto Detect)', type: 'info', confirmText: 'Bắt đầu' }
    );
    if (!confirmed) return;

    const btn = document.getElementById('btnFixEmptyServers');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang sửa...';
    }

    // Hàm detect nguồn từ URL video
    function detectProviderFromUrl(url) {
        if (!url) return 'KKPhim';
        const lower = url.toLowerCase();
        if (lower.includes('ophim') || lower.includes('opstream') || lower.includes('op.supabase')) return 'OPhim';
        if (lower.includes('nguonc') || lower.includes('streamc')) return 'NguonC';
        return 'KKPhim';
    }

    try {
        showLoading(true, '🔍 Đang quét tất cả tập phim...');
        
        let allEps = [];
        let from = 0;
        const BATCH = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('episodes')
                .select('id, sources')
                .range(from, from + BATCH - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            allEps = allEps.concat(data);
            if (data.length < BATCH) break;
            from += BATCH;
        }

        const total = allEps.length;
        showLoading(true, `📡 Tìm thấy ${total} tập phim. Đang kiểm tra...`);

        let fixedCount = 0;
        let skippedCount = 0;
        const detectedStats = { KKPhim: 0, OPhim: 0, NguonC: 0 };

        for (let i = 0; i < allEps.length; i++) {
            const ep = allEps[i];
            if (!ep.sources || !Array.isArray(ep.sources)) { skippedCount++; continue; }
            
            let needsUpdate = false;
            const updatedSources = ep.sources.map(src => {
                const detected = detectProviderFromUrl(src.source);
                const currentServer = (src.server || '').trim();
                // Nếu server hiện tại khác với detect → cần sửa
                if (currentServer !== detected) {
                    needsUpdate = true;
                    detectedStats[detected] = (detectedStats[detected] || 0) + 1;
                    return { ...src, server: detected };
                }
                return src;
            });

            if (needsUpdate) {
                const { error } = await supabase
                    .from('episodes')
                    .update({ sources: updatedSources })
                    .eq('id', ep.id);
                if (error) {
                    console.error('❌ Lỗi update episode ' + ep.id, error);
                } else {
                    fixedCount++;
                }
            } else {
                skippedCount++;
            }
            
            if ((i + 1) % 10 === 0 || i === allEps.length - 1) {
                showLoading(true, `🔧 Đang sửa... ${i + 1}/${total} (Đã fix: ${fixedCount})`);
            }
        }

        showLoading(false);
        const statsStr = Object.entries(detectedStats).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ');
        showNotification(`✅ Hoàn tất! Sửa ${fixedCount} tập. Detect: ${statsStr || 'Không có gì cần sửa'}`, 'success');
        console.log('✅ Fix server hoàn tất:', fixedCount, 'sửa,', skippedCount, 'bỏ qua. Stats:', detectedStats);

        if (typeof loadAdminMovies === 'function') await loadAdminMovies(true);

    } catch (err) {
        console.error('❌ Lỗi fix empty servers:', err);
        showLoading(false);
        showNotification('Lỗi: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-wrench"></i> Fix Server rỗng';
        }
    }
}
