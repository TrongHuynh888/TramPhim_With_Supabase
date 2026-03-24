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
 * Build URL ảnh đầy đủ từ API KKPhim (có thể là path hoặc URL đầy đủ).
 */
function _buildApiImgUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
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
    // Chuẩn hóa: luôn dùng URL đầy đủ để check
    const fullUrl = slug.startsWith('http') ? slug : `https://phimapi.com/phim/${slug}`;
    const shortSlug = slug.startsWith('http') ? slug.replace(/.*\/phim\//, '').split('?')[0].replace(/\/$/, '') : slug;
    try {
        // Tìm cả 2 dạng để tương thích với dữ liệu cũ trong DB
        const { data } = await supabase
            .from('movies')
            .select('id')
            .or(`api_url_backup.eq.${fullUrl},api_url_backup.eq.${shortSlug}`)
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

                const newActor = {
                    id:           newId,
                    name:         name,
                    avatar:       '',
                    dob:          null,
                    gender:       '',
                    role:         'actor',
                    alt_names:    '',
                    bio:          '',
                    auto_created: true,
                    created_at:   new Date().toISOString(),
                };

                try {
                    const { error } = await supabase.from('actors').insert(newActor);
                    if (!error) {
                        castData.push({ id: newId, name });
                        existingMap[lower] = { id: newId, name }; // Cache tránh tạo trùng
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
async function _importEpisodesForMovie(movieId, episodesData, movieDuration = '', movieQuality = 'HD') {
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

            // Gộp sources từ server này vào record (không trùng link)
            if (ep.link_m3u8) {
                const already = episodeMap[epKey].sources.some(s => s.source === ep.link_m3u8);
                if (!already) episodeMap[epKey].sources.push({ label: mainLabel,  type: 'hls',   source: ep.link_m3u8 });
            }
            if (ep.link_embed) {
                const already = episodeMap[epKey].sources.some(s => s.source === ep.link_embed);
                if (!already) episodeMap[epKey].sources.push({ label: embedLabel, type: 'embed', source: ep.link_embed });
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
    // Kiểm tra tiền điều kiện
    const provider = typeof API_PROVIDERS !== 'undefined' && typeof _apiState !== 'undefined'
        ? API_PROVIDERS[_apiState.currentProvider]
        : null;
    if (!provider) return { success: false, message: 'Không có API provider' };
    if (typeof supabase === 'undefined') return { success: false, message: 'Supabase chưa sẵn sàng' };

    if (!opts.silent && typeof showLoading === 'function') showLoading(true, `Đang tải chi tiết "${slug}"...`);

    try {
        // 1. Lấy chi tiết phim từ API
        const res = await fetch(provider.buildDetailUrl(slug));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const movie    = raw.movie || raw;
        const episodes = raw.episodes || [];
        if (!movie?.slug) throw new Error('Dữ liệu API không hợp lệ (thiếu slug)');

        // 2. Kiểm tra trùng lặp bằng api_url_backup = slug
        const existingId = await _checkMovieExistsBySlug(movie.slug);
        if (existingId) {
            return {
                success: false, movieId: existingId, duplicate: true,
                message: `"${movie.name}" đã tồn tại trong database`,
            };
        }

        // 3. Chuẩn bị URL ảnh gốc từ API
        const rawPoster = _buildApiImgUrl(movie.poster_url) || _buildApiImgUrl(movie.thumb_url);
        const rawThumb  = _buildApiImgUrl(movie.thumb_url)  || rawPoster;
        const safeSlug  = (movie.slug || slug).replace(/[^a-z0-9-]/gi, '-').toLowerCase();

        // 4. Upload ảnh lên Cloudflare R2 (hoặc dùng URL gốc nếu tắt R2)
        if (!opts.silent && typeof showLoading === 'function') {
            showLoading(true, _importState.useR2
                ? `Upload ảnh → Cloudflare R2...`
                : 'Chuẩn bị dữ liệu ảnh...');
        }
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

        // 7. Resolve diễn viên (tạo mới trong DB nếu chưa có)
        if (!opts.silent && typeof showLoading === 'function') showLoading(true, 'Xử lý diễn viên...');
        const actorNames = (movie.actor || []).slice(0, 20); // Giới hạn 20 diễn viên
        const castData   = await _resolveActorsForImport(actorNames);

        // 8. Build movieData - theo đúng whitelist bảng movies Supabase
        // whitelist: id, title, origin_title, poster_url, background_url, description,
        //   year, type, duration, quality, status, age_limit, series_id, price, rating,
        //   total_episodes, api_url_backup, cast_data, tags, versions, category_id, country_id,
        //   created_at, updated_at, view_count
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
            description:    movie.content || '',
            year:           movie.year ? parseInt(movie.year) : null,
            type:           movie.type === 'series' ? 'series' : 'single',
            quality:        movie.quality || 'HD',
            status:         'public',
            age_limit:      'P',
            series_id:      '',
            price:          0,
            rating:         0,
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
            api_url_backup: `https://phimapi.com/phim/${movie.slug}`, // Luôn lưu dạng URL đầy đủ
            created_at:     new Date().toISOString(),
            updated_at:     new Date().toISOString(),
        };

        // Lọc whitelist - chỉ gửi field có trong bảng movies Supabase
        const _WHITELIST = [
            'id', 'title', 'origin_title', 'poster_url', 'background_url', 'description',
            'year', 'type', 'duration', 'quality', 'status', 'age_limit', 'series_id',
            'price', 'rating', 'total_episodes', 'api_url_backup', 'cast_data', 'tags',
            'versions', 'category_ids', 'country_id', 'part',
            'created_at', 'updated_at',
        ];
        const _NUM_FIELDS = ['year', 'price', 'rating', 'total_episodes'];
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
        if (!opts.silent && typeof showLoading === 'function') showLoading(true, 'Đang lưu vào database...');
        const { error: insertErr } = await supabase.from('movies').insert(finalMovieData);
        if (insertErr) throw new Error(insertErr.message);


        // 10. Import tập phim (nếu có)
        if (episodes.length > 0) {
            if (!opts.silent && typeof showLoading === 'function') {
                const totalEpCount = episodes.reduce((sum, s) => sum + (s.server_data?.length || 0), 0);
                showLoading(true, `Import ${totalEpCount} tập phìm...`);
            }
            // Truyền duration và quality phìm xuống từng tập (API không có duration riêng cho từng tập)
            await _importEpisodesForMovie(movieId, episodes, parsedDuration, movie.quality || 'HD');
        }

        // 11. Đồng bộ sync cache và refresh admin lists ngay lập tức
        if (typeof notifyDataChange === 'function') await notifyDataChange('movies');

        // Refresh danh sách quản lý phím và dropdown quản lý tập không cần F5
        _refreshAdminLists();

        return { success: true, movieId, message: `✅ Đã import "${movie.name}" thành công!` };

    } catch (err) {
        console.error('[Import Movie] Lỗi:', err);
        return { success: false, message: err.message || 'Lỗi không xác định' };
    } finally {
        if (!opts.silent && typeof showLoading === 'function') showLoading(false);
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

    const btnBulk  = document.getElementById('btnBulkImport');
    const btnAbort = document.getElementById('btnAbortImport');
    if (btnBulk)  { btnBulk.disabled = true; btnBulk.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang import...'; }
    if (btnAbort) btnAbort.style.display = 'inline-flex';

    _showImportProgress(0, total, 'Đang bắt đầu...');

    for (const slug of slugs) {
        if (_importState.importAbort) {
            _showImportProgress(done, total, '⚠️ Đã dừng bởi admin');
            break;
        }

        _showImportProgress(done, total, `Xử lý: ${slug}`);
        const result = await importSingleMovieFromApi(slug, { silent: true });
        done++;

        if (result.success) successCount++;
        else if (result.duplicate) dupCount++;
        else failCount++;

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

    if (typeof showNotification === 'function') {
        showNotification(`Import hoàn tất: ${msg}`, successCount > 0 ? 'success' : 'error');
    }
}

/**
 * Import phim đang xem trong drawer chi tiết (nút "Lưu vào DB" trong drawer).
 */
async function importCurrentDetailMovie() {
    const drawer = document.getElementById('apiDetailDrawer');
    const slug   = drawer?.dataset?.currentSlug;
    if (!slug) {
        if (typeof showNotification === 'function') showNotification('Không có phim nào để import!', 'error');
        return;
    }
    const btn = document.getElementById('btnDetailImport');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang import...'; }

    const result = await importSingleMovieFromApi(slug);

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
 */
async function importQuickFromCard(slug, btn) {
    if (!slug || !btn || btn.disabled) return;
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const result = await importSingleMovieFromApi(slug);

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
        // Lấy tất cả các api_url_backup khớp (dạng URL đầy đủ hoặc slug ngắn)
        const fullUrls = slugs.map(s => `https://phimapi.com/phim/${s}`);
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

        // Gắn class + badge lên từng card đã import
        slugs.forEach(slug => {
            if (!inDbSet.has(slug)) return;
            const card = document.querySelector(`.api-movie-card[data-slug="${slug}"]`);
            if (!card) return;
            card.dataset.inDb = 'true';
            card.classList.add('in-db');

            // 1. Ẩn ô checkbox góc trái
            const cbWrap = card.querySelector('.api-card-select-wrap');
            if (cbWrap) cbWrap.style.display = 'none';

            // 2. Đổi nút ➕ thành icon database (không cho import lại)
            const importBtn = card.querySelector('.api-card-import-btn');
            if (importBtn) {
                importBtn.innerHTML = '<i class="fas fa-database"></i>';
                importBtn.title = 'Đã có trong database';
                importBtn.style.background = 'rgba(16,185,129,0.85)';
                importBtn.style.cursor = 'default';
                importBtn.onclick = e => { e.stopPropagation(); }; // chặn click
            }

            // 3. Badge "Đã có" góc trên trái
            if (!card.querySelector('.api-in-db-badge')) {
                const badge = document.createElement('span');
                badge.className = 'api-in-db-badge';
                badge.textContent = 'Đã có';
                badge.style.cssText = 'position:absolute;top:8px;left:8px;background:rgba(16,185,129,0.9);color:#fff;font-size:0.62rem;font-weight:700;padding:2px 7px;border-radius:5px;z-index:10;letter-spacing:0.4px;pointer-events:none;';
                card.style.position = card.style.position || 'relative';
                card.appendChild(badge);
            }
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
    const fullUrl = `https://phimapi.com/phim/${currentSlug}`;
    if (!inDbSet.has(currentSlug) && !inDbSet.has(fullUrl)) return;

    // Tìm nút Lưu vào DB trong drawer
    const importBtn = Array.from(drawer.querySelectorAll('button')).find(b =>
        b.textContent.includes('Lưu') || b.innerHTML.includes('cloud-upload')
    );
    if (!importBtn) return;
    importBtn.innerHTML = '<i class="fas fa-database"></i> Đã có trong DB';
    importBtn.style.background = 'rgba(16,185,129,0.2)';
    importBtn.style.borderColor = 'rgba(16,185,129,0.5)';
    importBtn.style.color = '#34d399';
    importBtn.style.cursor = 'default';
    importBtn.onclick = e => e.preventDefault();
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
// Chờ admin-api-explorer.js load xong rồi mới override
window.addEventListener('load', () => {
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

            // Checkbox chọn bulk import
            const cbWrap = document.createElement('div');
            cbWrap.className = 'api-card-select-wrap';
            cbWrap.onclick = e => e.stopPropagation();
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'api-card-select-cb';
            cb.dataset.slug = item.slug;
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
            importBtn.onclick = e => { e.stopPropagation(); importQuickFromCard(item.slug, importBtn); };
            card.appendChild(importBtn);

            // Thông tin phim
            const typeClass = item.type === 'series' ? 'type-series' : 'type-single';
            const typeLabel = item.type === 'series' ? 'Bộ' : 'Lẻ';
            const info = document.createElement('div');
            info.className = 'api-movie-card-info';
            info.innerHTML = `
                <div class="api-movie-card-name">${item.name}</div>
                <div class="api-movie-card-meta">
                    <span class="api-badge ${typeClass}">${typeLabel}</span>
                    ${item.year ? `<span class="api-badge year">${item.year}</span>` : ''}
                    ${item.status ? `<span class="api-badge" style="background:rgba(52,211,153,0.1);color:#34d399;font-size:0.65rem;">${item.status}</span>` : ''}
                </div>`;
            card.appendChild(info);

            // Click vào phần nội dung card → xem chi tiết
            card.onclick = e => {
                if (e.target.closest('.api-card-select-wrap, .api-card-import-btn')) return;
                if (typeof callApiDetail === 'function') callApiDetail(item.slug);
            };

            grid.appendChild(card);
        });

        // Sau khi render xong → check từng phim có trong DB không (async, không block UI)
        _markImportedCards(items);

        // Áp filter ngay nếu đang bật chế độ "Chỉ phim mới"
        if (_importState.newOnlyFilterActive) applyNewOnlyFilter();
    };

    // Override callApiDetail để lưu slug hiện tại vào drawer
    if (typeof callApiDetail === 'function') {
        const _origCallApiDetail = callApiDetail;
        window.callApiDetail = async function(slug) {
            const drawer = document.getElementById('apiDetailDrawer');
            if (drawer) drawer.dataset.currentSlug = slug;
            const btn = document.getElementById('btnDetailImport');
            if (btn) {
                btn.disabled = false;
                btn.className = 'btn btn-sm api-detail-import-btn';
                btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Lưu vào DB';
            }
            return _origCallApiDetail(slug);
        };
    }
});

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

