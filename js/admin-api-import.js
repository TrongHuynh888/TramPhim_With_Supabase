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
    testPaused: false,         // Tạm dừng Test Sync / Test Import
    testCancelled: false,      // Hủy Test Sync / Test Import
    excludeCountryEnabled: false,
    excludeCountryText: 'Việt Nam',
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

/* ─── TELEGRAM BOT CONFIG ─── */
let _telegramConfigType = { botToken: '', chatId: '' };

async function _loadTelegramConfig() {
    if (typeof supabase === 'undefined') return;
    try {
        const { data: row } = await supabase.from('app_configs').select('value').eq('key', 'telegram_config').maybeSingle();
        if (row && row.value) {
            _telegramConfigType.botToken = row.value.botToken || '';
            _telegramConfigType.chatId = row.value.chatId || '';
        }
    } catch(e) { console.warn('Lỗi tải Telegram Config', e); }
}

function openTelegramConfigModal() {
    const inputToken = document.getElementById('telegramBotTokenInput');
    const inputChat = document.getElementById('telegramChatIdInput');
    if (inputToken) inputToken.value = _telegramConfigType.botToken;
    if (inputChat) inputChat.value = _telegramConfigType.chatId;
    document.getElementById('apiTelegramConfigModal')?.classList.add('open');
}

function closeTelegramConfigModal() {
    document.getElementById('apiTelegramConfigModal')?.classList.remove('open');
}

async function saveTelegramConfig() {
    if (typeof supabase === 'undefined') return;
    const token = (document.getElementById('telegramBotTokenInput')?.value || '').trim();
    const chat = (document.getElementById('telegramChatIdInput')?.value || '').trim();
    
    _telegramConfigType.botToken = token;
    _telegramConfigType.chatId = chat;

    try {
        await supabase.from('app_configs').upsert({
            key: 'telegram_config',
            value: _telegramConfigType,
            updated_at: new Date().toISOString()
        });
        if (typeof showNotification === 'function') showNotification('Đã lưu cấu hình Telegram!', 'success');
        closeTelegramConfigModal();
    } catch(e) {
        if (typeof showNotification === 'function') showNotification('Lỗi lưu cấu hình Telegram', 'error');
    }
}

async function sendTelegramNotify(message) {
    if (!_telegramConfigType.botToken || !_telegramConfigType.chatId) return false;
    try {
        const url = `https://api.telegram.org/bot${_telegramConfigType.botToken}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                chat_id: _telegramConfigType.chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });
        return res.ok;
    } catch(e) {
        console.warn('Lỗi gửi Telegram', e);
        return false;
    }
}

async function testTelegramConfig() {
    const token = (document.getElementById('telegramBotTokenInput')?.value || '').trim();
    const chat = (document.getElementById('telegramChatIdInput')?.value || '').trim();
    if (!token || !chat) {
        if (typeof showNotification === 'function') showNotification('Vui lòng nhập đủ Token và Chat ID', 'warning');
        return;
    }
    
    const oldToken = _telegramConfigType.botToken;
    const oldChat = _telegramConfigType.chatId;
    _telegramConfigType.botToken = token;
    _telegramConfigType.chatId = chat;
    
    const btn = event?.currentTarget;
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
    
    const success = await sendTelegramNotify('🎬 <b>Trạm Phim Bot</b>: Test kết nối API Webhook thành công!');
    
    if (btn) btn.innerHTML = '<i class="fas fa-paper-plane"></i> Test Gửi';
    
    if (success) {
        if (typeof showNotification === 'function') showNotification('Đã gửi tin nhắn Test qua Telegram!', 'success');
    } else {
        if (typeof showNotification === 'function') showNotification('Lỗi Webhook. Cấu hình có vẻ sai!', 'error');
        _telegramConfigType.botToken = oldToken;
        _telegramConfigType.chatId = oldChat;
    }
}

/* ─── TELEGRAM CHUNK HELPER ─── */
async function _sendTelegramInChunks(reports, headerGenerator, isSync = false) {
    if (typeof sendTelegramNotify !== 'function') return;
    const chunkSize = 20;
    const totalMsgs = Math.ceil(reports.length / chunkSize);
    
    for (let i = 0; i < totalMsgs; i++) {
        const startIdx = i * chunkSize;
        const chunk = reports.slice(startIdx, startIdx + chunkSize);
        
        let msg = headerGenerator(i + 1, totalMsgs);
        
        chunk.forEach((ts, idx) => {
            const realIdx = startIdx + idx + 1;
            if (isSync) {
                msg += `<b>${realIdx}. ${ts.title}</b>\n`;
                msg += `   📺 Cập nhật: +${ts.added} tập (Hiện có ${ts.current}/${ts.total})\n\n`;
            } else {
                const typeStr = ts.isTrailer ? `[Trailer] ${ts.typeName}` : ts.typeName;
                msg += `<b>${realIdx}. ${ts.title}</b> (${typeStr})\n`;
                msg += `   📺 Tập: ${ts.currentEps} / ${ts.totalEps}\n`;
                msg += `   💽 Bản: ${ts.versions}\n`;
                msg += `   🌐 Nguồn: ${ts.sources}\n\n`;
            }
        });
        
        sendTelegramNotify(msg);
        
        if (i < totalMsgs - 1) {
            await new Promise(r => setTimeout(r, 1500)); // Tránh spam limit của Telegram
        }
    }
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
        
        // ★ KIỂM TRA LẠI ẢNH R2 ★ 
        // Đôi khi R2 Worker báo thành công nhưng file tải lên bị 0 byte (do nguồn chặn Cloudflare bot)
        if (data.url) {
            const isR2UrlOk = await _validateImageUrl(data.url);
            if (!isR2UrlOk) {
                console.warn(`[R2 Upload] File R2 bị lỗi/0 byte: ${data.url} → Fallback URL gốc`);
                // Gửi request xóa file lỗi trên R2 chạy ngầm
                fetch(`${workerUrl}/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paths: [`${folder}/${customFilename}`] })
                }).catch(() => {});
                
                return imgUrl; 
            }
        }
        
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
 * Kiểm tra URL ảnh có tải được hay không bằng cách dùng Image() object.
 * Không dùng crossOrigin để tránh CDN chặn CORS.
 * @param {string} url - URL ảnh cần kiểm tra
 * @returns {Promise<boolean>}
 */
async function _validateImageUrl(url) {
    if (!url) return false;
    return new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => {
            img.onload = img.onerror = null; 
            resolve(false); 
        }, 10000);
        img.onload = () => {
            clearTimeout(timeout);
            resolve(img.naturalWidth > 1 && img.naturalHeight > 1);
        };
        img.onerror = () => {
            clearTimeout(timeout);
            resolve(false); 
        };
        img.src = url;
    });
}

/**
 * Lấy thông tin kích thước và tỷ lệ ảnh.
 * KHÔNG dùng crossOrigin để tránh CDN chặn CORS ảo.
 */
async function _getImageInfo(url) {
    if (!url) return { ok: false, isVertical: false };
    return new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => {
            img.onload = img.onerror = null; 
            resolve({ ok: false, isVertical: false }); 
        }, 10000);
        img.onload = () => {
            clearTimeout(timeout);
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            resolve({ ok: w > 1 && h > 1, isVertical: h > w });
        };
        img.onerror = () => {
            clearTimeout(timeout);
            resolve({ ok: false, isVertical: false });
        };
        img.src = url;
    });
}

/**
 * Phân loại đúng 2 URL ảnh API thành Poster (dọc) và Background (ngang)
 * dựa vào kích thước thật. Tự động loại bỏ ảnh chết.
 * @returns {Promise<{ poster: string|null, background: string|null }>}
 */
async function _classifyAndValidateImages(url1, url2) {
    const info1 = url1 ? await _getImageInfo(url1) : null;
    const info2 = url2 && url2 !== url1 ? await _getImageInfo(url2) : null;
    
    let p = null, t = null;
    const assign = (info, url) => {
        if (!info || !info.ok) return;
        if (info.isVertical) {
            if (!p) p = url; else if (!t) t = url;
        } else {
            if (!t) t = url; else if (!p) p = url;
        }
    };
    
    if (info1?.ok && info2?.ok) {
        if (info1.isVertical && !info2.isVertical) { p = url1; t = url2; }
        else if (!info1.isVertical && info2.isVertical) { p = url2; t = url1; }
        else {
            // Nếu cả hai cùng tỷ lệ
            if (!info1.isVertical) {
                // Cả hai đều Nằm Ngang -> Chỉ có Background, KHÔNG có poster!
                t = url1;
            } else {
                // Cả hai đều Đứng Dọc -> Chỉ có Poster, KHÔNG có background!
                p = url1;
            }
        }
    } else if (info1?.ok) {
        if (info1.isVertical) p = url1; else t = url1;
    } else if (info2?.ok) {
        if (info2.isVertical) p = url2; else t = url2;
    }
    
    // CHỈ trả về đúng loại: poster = ảnh DỌC, background = ảnh NGANG
    // KHÔNG dùng poster thay background (tránh gán ảnh dọc vào chỗ ảnh ngang)
    return { poster: p, background: t };
}

/**
 * Tìm ảnh poster/background thay thế từ các API nguồn khác và TMDb.
 * Chỉ tìm ảnh cho loại bị lỗi (poster / background hoặc cả hai).
 * @param {string} slug - slug phim
 * @param {string} movieName - tên phim (tìm kiếm)
 * @param {string} originName - tên gốc phim (tìm kiếm TMDb)
 * @param {number|string} year - năm phát hành
 * @param {string} countryText - chuỗi quốc gia của phim gốc
 * @param {string} excludeProviderId - provider đã dùng (bỏ qua)
 * @param {object} needs - { poster: bool, background: bool }
 * @returns {Promise<{ poster: string|null, background: string|null }>}
 */
async function _findReplacementImages(slug, movieName, originName, year, countryText, excludeProviderId, needs = { poster: true, background: true }) {
    const result = { poster: null, background: null };
    if (typeof API_PROVIDERS === 'undefined') return result;

    // ════════════════════════════════════════════════════════════════
    // ƯU TIÊN 1: Quét nguồn gộp — Dùng CHÍNH XÁC luật 3/5 điểm
    // từ _crossFetchFromAllProviders để xác nhận đúng phim
    // ════════════════════════════════════════════════════════════════
    const providerKeys = Object.keys(API_PROVIDERS);
    for (const key of providerKeys) {
        // Đã đủ ảnh → dừng
        if ((!needs.poster || result.poster) && (!needs.background || result.background)) break;

        const prov = API_PROVIDERS[key];
        if (prov.id === excludeProviderId || prov.name === excludeProviderId) continue;

        try {
            // Bước A: Tìm slug phim trên nguồn khác (Search-Then-Detail)
            let resolvedSlug = slug;
            let foundViaSearch = false;

            if (movieName && typeof prov.buildSearchUrl === 'function') {
                const searchUrl = prov.buildSearchUrl(movieName, 1);
                const sRes = await fetch(searchUrl).catch(() => null);
                if (!sRes || !sRes.ok) continue;
                const sRaw = await sRes.json();
                const parsed = prov.parseListResponse(sRaw);
                if (!parsed.items || parsed.items.length === 0) continue;

                const lowerName = movieName.toLowerCase().trim();
                const lowerOrigin = (originName || '').toLowerCase().trim();
                const potentialMatches = parsed.items.filter(i =>
                    i.slug === slug ||
                    (i.name || '').toLowerCase().trim() === lowerName ||
                    (i.origin_name || '').toLowerCase().trim() === lowerName ||
                    (lowerOrigin && (i.origin_name || '').toLowerCase().trim() === lowerOrigin)
                );

                const match = potentialMatches.find(i => i.slug === slug) || potentialMatches[0];
                if (match && match.slug) {
                    resolvedSlug = match.slug;
                    foundViaSearch = true;
                }
            }

            if (!foundViaSearch) continue;

            // Bước B: Lấy chi tiết phim
            const detUrl = prov.buildDetailUrl(resolvedSlug);
            const dRes = await fetch(detUrl).catch(() => null);
            if (!dRes || !dRes.ok) continue;
            const dRaw = await dRes.json();
            const movieRaw = dRaw.movie || dRaw.item || dRaw;
            const mData = prov.mapItem ? prov.mapItem(movieRaw) : movieRaw;

            // ===== BỘ LỌC 3/5 ĐIỂM (ĐỒNG BỘ VỚI _crossFetchFromAllProviders) =====
            let matchScore = 0;

            // 0. Tên / Slug
            if (mData.slug === slug) {
                matchScore++;
            } else {
                let nameMatched = false;
                const ln = movieName?.toLowerCase().trim();
                if (mData.name && ln && mData.name.toLowerCase().trim() === ln) nameMatched = true;
                if (!nameMatched && mData.origin_name && ln && (mData.origin_name.toLowerCase().trim() === ln || mData.origin_name.toLowerCase().trim() === (originName || '').toLowerCase().trim())) nameMatched = true;
                if (!nameMatched) continue; // Tên không khớp → loại
                matchScore++;
            }

            // 1. Cùng loại phim
            if (year && mData.type) {
                // Dùng countryText param đại diện cho type nếu cần (truyền từ caller)
                // Nhưng hàm này không có type param → bỏ qua tiêu chí này
            }

            // 2. Cùng quốc gia (BẮT BUỘC — khác quốc gia → loại ngay)
            if (countryText && mData.country) {
                const c1 = countryText.toLowerCase();
                const c2Norm = Array.isArray(mData.country)
                    ? mData.country.map(c => typeof c === 'string' ? c : c.name).join(', ')
                    : (mData.country || '');
                const c2 = c2Norm.toLowerCase();
                const c1Arr = c1.split(',').map(s => s.trim()).filter(Boolean);
                const c2Arr = c2.split(',').map(s => s.trim()).filter(Boolean);
                const hasCommonCountry = c1Arr.some(c => c2.includes(c)) || c2Arr.some(c => c1.includes(c));
                if (hasCommonCountry) {
                    matchScore++;
                } else {
                    _addImportLog(`⚠️ ${prov.name}: Khác quốc gia hoàn toàn → chặn lấy ảnh (chống Remake).`, 'warning');
                    continue;
                }
            }

            // 3. Cùng năm (lệch >1 → loại ngay)
            if (year && mData.year) {
                const eYear = Number(year);
                const iYear = Number(mData.year);
                if (eYear === iYear) {
                    matchScore++;
                } else if (Math.abs(eYear - iYear) > 1) {
                    _addImportLog(`⚠️ ${prov.name}: Lệch năm (${eYear} vs ${iYear}) → chặn lấy ảnh.`, 'warning');
                    continue;
                }
            }

            // 4. Cùng tổng tập (lệch >5 → loại)
            if (mData.episode_total) {
                // Chưa có episode_total trong params → bỏ qua
            }

            // Luật 3/5: matchScore phải ≥ 3 (hoặc ≥ 2 nếu thiếu 1 số tiêu chí)
            // Vì hàm này không truyền type và episode_total, ta hạ ngưỡng còn 2
            if (matchScore < 2) {
                _addImportLog(`⚠️ ${prov.name}: Điểm khớp thấp (${matchScore}/5) → chặn lấy ảnh.`, 'warning');
                continue;
            }

            // Bước D: Đã đủ điều kiện gộp → Phân loại ảnh (dọc/ngang)
            _addImportLog(`🔍 ${prov.name}: Đủ điều kiện gộp (Điểm ${matchScore}). Kiểm tra ảnh...`, 'info');
            const buildImg = (u) => {
                if (!u) return '';
                if (typeof prov.buildImgUrl === 'function') return prov.buildImgUrl(u);
                return _buildApiImgUrl(u, prov.id);
            };
            const img1 = buildImg(mData.thumb_url || movieRaw.thumb_url);
            const img2 = buildImg(mData.poster_url || movieRaw.poster_url);
            const classified = await _classifyAndValidateImages(img1, img2);

            if (needs.poster && !result.poster && classified.poster) {
                result.poster = classified.poster;
                _addImportLog(`✅ Lấy poster thay thế từ nguồn gộp ${prov.name}`, 'success');
            }
            if (needs.background && !result.background && classified.background) {
                result.background = classified.background;
                _addImportLog(`✅ Lấy background thay thế từ nguồn gộp ${prov.name}`, 'success');
            }
        } catch (e) {
            console.warn(`[FindReplacementImg] Lỗi quét ${prov.name}:`, e.message);
        }
    }

    // ════════════════════════════════════════════════════════════════
    // ƯU TIÊN 2: TMDb Fallback — Nếu nguồn gộp không đủ ảnh
    // ════════════════════════════════════════════════════════════════
    if ((needs.poster && !result.poster) || (needs.background && !result.background)) {
        try {
            if (typeof searchTmdbByTitle === 'function' && typeof getTmdbDetails === 'function') {
                const searchTitle = originName || movieName || '';
                _addImportLog(`🔍 TMDb: Tìm "${searchTitle}" (Năm: ${year || '?'})...`, 'info');

                const tmdbResult = await searchTmdbByTitle(searchTitle, year, movieName);
                if (tmdbResult) {
                    const details = await getTmdbDetails(tmdbResult.id, tmdbResult.media_type || 'movie');
                    if (details) {
                        if (needs.poster && !result.poster && details.poster_path) {
                            result.poster = buildTmdbImageUrl(details.poster_path, 'w500');
                            _addImportLog('✅ TMDb: Poster OK', 'success');
                        }
                        if (needs.background && !result.background && details.backdrop_path) {
                            result.background = buildTmdbImageUrl(details.backdrop_path, 'w1280');
                            _addImportLog('✅ TMDb: Background OK', 'success');
                        }
                    }
                } else {
                    _addImportLog('❌ TMDb: Không tìm thấy phim.', 'warning');
                }
            }
        } catch (e) {
            console.warn('[FindReplacementImg] TMDb lỗi:', e.message);
        }
    }

    return result;
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
 * Chuẩn hóa tên tập phim để tránh trùng lặp giữa các nguồn.
 * VD: "Tập 01" → "1", "Tap 5" → "5", "01" → "1", "Full" → "full"
 */
function _normalizeEpNumber(name) {
    if (!name) return '0';
    // Bỏ prefix "Tập", "Tap", "Episode", "Ep" + khoảng trắng
    let n = String(name).trim().replace(/^(tập|tap|episode|ep)\.?\s*/i, '').trim();
    // Nếu còn lại là số thuần → bỏ leading zeros ("01" → "1")
    if (/^\d+$/.test(n)) n = String(parseInt(n, 10));
    return (n || String(name).trim()).toLowerCase();
}

/**
 * Detect provider gốc từ api_url_backup URL.
 * VD: "https://ophim1.com/phim/mon-qua" → API_PROVIDERS['ophim']
 *     "https://phim.nguonc.com/api/film/mon-qua" → API_PROVIDERS['nguonc']
 *     "https://phimapi.com/phim/mon-qua" → API_PROVIDERS['kkphim']
 */
function _detectProviderFromUrl(url) {
    if (typeof API_PROVIDERS === 'undefined' || !url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('ophim') || lower.includes('ophim1.com')) return API_PROVIDERS['ophim'];
    if (lower.includes('nguonc') || lower.includes('nguonc.com')) return API_PROVIDERS['nguonc'];
    if (lower.includes('phimapi') || lower.includes('phimapi.com')) return API_PROVIDERS['kkphim'];
    // Fallback: thử KKPhim (provider phổ biến nhất)
    return API_PROVIDERS['kkphim'] || null;
}


/**
 * Kiểm tra phim chỉ mới có Trailer, chưa có tập phim thực sự.
 * Trả về true nếu phim chỉ có trailer → set status 'pending' (chờ duyệt).
 * @param {object} movie    - Dữ liệu phim từ API
 * @param {array}  episodes - Mảng episodes từ API
 */
function _isTrailerOnly(movie, episodes) {
    // 1. Không có episodes hoặc episodes rỗng → coi như trailer
    if (!episodes || episodes.length === 0) return true;

    // 2. Kiểm tra xem có ít nhất 1 tập có link m3u8 hoặc embed thực sự không
    //    → ƯU TIÊN KIỂM TRA LINK THẬT TRƯỚC, bất kể episode_current ghi gì
    //    (Nhiều API ghi episode_current="Trailer" nhưng episodes vẫn có link video thật)
    let hasRealEp = false;
    for (const srv of episodes) {
        const items = srv.server_data || srv.items || [];
        for (const ep of items) {
            const m3u8 = ep.link_m3u8 || ep.m3u8 || '';
            const embed = ep.link_embed || ep.embed || '';
            if (m3u8 || embed) { hasRealEp = true; break; }
        }
        if (hasRealEp) break;
    }

    // Nếu CÓ ít nhất 1 tập có link video thật → KHÔNG PHẢI trailer only
    if (hasRealEp) return false;

    // 3. Không có link thật + episode_current chứa "Trailer" → chắc chắn chỉ có trailer
    const epCurrent = (movie.episode_current || movie.current_episode || '').toLowerCase().trim();
    if (epCurrent.includes('trailer')) return true;

    // 4. Không có tập nào có link thực → coi như trailer
    return true;
}


/**
 * Kiểm tra phim đã tồn tại trong Supabase chưa bằng `api_url_backup` hoặc qua Tên + Năm.
 * @param {string} slug  - slug hoặc URL đầy đủ
 * @param {object} extra - (Optional) { origin_name, name, year, type, countryText }
 * @returns {Promise<string|null>} ID phim nếu tồn tại, null nếu chưa
 */
async function _checkMovieExistsBySlug(slug, extra = null) {
    if (!slug || typeof supabase === 'undefined') return null;
    
    // 1. Dò theo Slug trước (Nhanh nhất & Chính xác nhất)
    const shortSlug = slug.startsWith('http')
        ? slug.replace(/.*\/(phim|film)\//, '').split('?')[0].replace(/\/$/, '')
        : slug;
    const possibleUrls = [
        `https://phimapi.com/phim/${shortSlug}`,
        `https://ophim1.com/phim/${shortSlug}`,
        `https://phim.nguonc.com/api/film/${shortSlug}`,
        shortSlug,
    ];
    
    try {
        // ★ LỚP 2: Check trực tiếp bằng cột slug UNIQUE trước (nhanh nhất, O(1) index lookup)
        const { data: slugMatch } = await supabase.from('movies')
            .select('id')
            .eq('slug', shortSlug)
            .maybeSingle();
        if (slugMatch) {
            console.log(`[SmartDetection] ✅ Trùng slug UNIQUE: "${shortSlug}" → ID: ${slugMatch.id}`);
            return slugMatch.id;
        }

        // ★ LỚP 3: Check bằng tmdb_id (khóa quốc tế, chính xác nhất)
        if (extra && extra.tmdb_id) {
            const { data: tmdbMatch } = await supabase.from('movies')
                .select('id')
                .eq('tmdb_id', extra.tmdb_id)
                .maybeSingle();
            if (tmdbMatch) {
                console.log(`[SmartDetection] ✅ Trùng tmdb_id: ${extra.tmdb_id} → ID: ${tmdbMatch.id}`);
                return tmdbMatch.id;
            }
        }

        // Lớp cũ: Dò theo api_url_backup + tên phim (fallback cho phim cũ chưa có slug/tmdb_id)
        const orFilter = possibleUrls.map(u => `api_url_backup.eq."${u}"`).join(',');
        
        let q = supabase.from('movies').select('id, title, origin_title, type, country_id, countries(name), year, total_episodes, api_url_backup, slug, tmdb_id');
        
        let nameFilters = [];
        if (extra && extra.origin_name && extra.name) {
            const safeOrigin = extra.origin_name.replace(/"/g, '');
            const safeTitle = extra.name.replace(/"/g, '');
            nameFilters.push(`origin_title.ilike."%${safeOrigin}%"`);
            nameFilters.push(`title.ilike."%${safeOrigin}%"`);
            nameFilters.push(`title.ilike."%${safeTitle}%"`);
        } else if (extra && extra.origin_name) {
            const safeOrigin = extra.origin_name.replace(/"/g, '');
            nameFilters.push(`origin_title.ilike."%${safeOrigin}%"`);
            nameFilters.push(`title.ilike."%${safeOrigin}%"`);
        } else if (extra && extra.name) {
            const safeTitle = extra.name.replace(/"/g, '');
            nameFilters.push(`title.ilike."%${safeTitle}%"`);
        }
        
        if (nameFilters.length > 0) {
            q = q.or(`${orFilter},${nameFilters.join(',')}`);
        } else {
            q = q.or(orFilter);
        }
        
        const { data: smartMatches, error: smartErr } = await q;
        if (smartErr) console.warn('[SmartDetection] Query Error:', smartErr.message);
        
        if (smartMatches && smartMatches.length > 0) {
            // Áp dụng thuật toán 4/5 (Name/Slug + Year + Type + Country + TotalEps >= 4)
            const validMatch = smartMatches.find(dbm => {
                // NẾU TRÙNG CHÍNH XÁC URL NGUỒN GỐC -> 100% CÙNG 1 PHIM (VD Bấm Cập nhật cùng 1 phim)
                if (extra && extra.apiUrl && dbm.api_url_backup === extra.apiUrl) return true;
                
                let matchScore = 0; 
                let nameOrSlugMatched = false;
                
                // Kiểm tra trùng Slug ngắn (từ api_url_backup hoặc cột slug)
                const dbShortSlug = dbm.slug || (dbm.api_url_backup ? dbm.api_url_backup.replace(/.*\/(phim|film)\//, '').split('?')[0].replace(/\/$/, '') : '');
                if (dbShortSlug === shortSlug) nameOrSlugMatched = true;
                
                // Kiểm tra trùng Tên
                if (!nameOrSlugMatched && extra) {
                    if (extra.origin_name && dbm.origin_title) {
                        const exO = extra.origin_name.toLowerCase().trim();
                        const dbO = dbm.origin_title.toLowerCase().trim();
                        if (exO === dbO || exO.includes(dbO) || dbO.includes(exO)) nameOrSlugMatched = true;
                    }
                    if (!nameOrSlugMatched && extra.name && dbm.title) {
                        const exT = extra.name.toLowerCase().trim();
                        const dbT = dbm.title.toLowerCase().trim();
                        if (exT === dbT || exT.includes(dbT) || dbT.includes(exT)) nameOrSlugMatched = true;
                    }
                }
                
                if (!nameOrSlugMatched) return false; // Không khớp tên hay slug thì tuyệt đối không gộp!
                matchScore++; // Khớp Tên/Slug được 1 điểm (tiêu chí cứng)
                
                // Nếu gọi hàm check nhanh từ bulk loop (chưa truyền extra data đầy đủ), tự auto pass phần còn lại nếu trùng slug
                if (!extra || (!extra.type && !extra.year)) return true;
                
                // --- BƯỚC 1: KIỂM TRA TYPE ---
                if (extra.type) {
                    const isDbSeries = dbm.type?.toLowerCase().includes('bộ');
                    const isExSeries = extra.type === 'series' || extra.type === 'tvshows' || extra.type === 'hoathinh';
                    if (isDbSeries === isExSeries) matchScore++;
                }
                
                // --- BƯỚC 2: KIỂM TRA QUỐC GIA ---
                const dbCountryName = dbm.countries?.name || '';
                if (extra.countryText && dbCountryName) {
                    const c1 = extra.countryText.toLowerCase();
                    const c2 = dbCountryName.toLowerCase();
                    const c1Arr = c1.split(',').map(s=>s.trim()).filter(Boolean);
                    const c2Arr = c2.split(',').map(s=>s.trim()).filter(Boolean);
                    
                    const hasCommon = c1Arr.some(c => c2.includes(c)) || c2Arr.some(c => c1.includes(c));
                    if (hasCommon) {
                        matchScore++;
                    } else {
                        // TUYỆT ĐỐI KHÔNG GỘP: Trùng tên nhưng khác quốc gia hoàn toàn -> Phim Remake / Trùng Tên!
                        return false; 
                    }
                }
                
                // --- BƯỚC 3: KIỂM TRA YEAR --- (BẮT BUỘC ĐÚNG NĂM)
                if (extra.year && dbm.year) {
                    const diff = Math.abs(Number(extra.year) - Number(dbm.year));
                    if (diff <= 1) { // Lệch tối đa 1 năm
                        matchScore++;
                    } else {
                        // TỬ HÌNH NẾU SAI NĂM (Chống gộp nhầm phim Remake khác năm)
                        return false; 
                    }
                }
                
                // --- BƯỚC 4: KIỂM TRA TỔNG TẬP ---
                if (extra.episode_total && dbm.total_episodes) {
                    const valE = Number(extra.episode_total) || 0;
                    const valD = Number(dbm.total_episodes) || 0;
                    if (valE > 0 && valD > 0) {
                        // Lệch quá 5 tập chắc chắn là phim ăn theo hoặc phiên bản khác! (VD: 13 vs 50)
                        if (Math.abs(valE - valD) > 5) return false;
                        
                        if (valE === valD) matchScore++;
                    }
                }

                // Luật 3/5 (Tên/Slug bắt buộc + ít nhất 2 tiêu chí phụ)
                return matchScore >= 3;
            });
            
            if (validMatch) {
                console.log(`[SmartDetection] Tìm thấy phim trùng khớp 3/5 hoặc URL. Gộp vào ID: ${validMatch.id}`);
                return validMatch.id;
            }
        }
        
        return null; // Không tìm thấy
    } catch (err) {
        console.warn('Lỗi _checkMovieExistsBySlug:', err.message);
        return null;
    }
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
    // Chuyển số La Mã → số thường (hỗ trợ tới XX = 20)
    const _roman = {
        I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10,
        XI:11, XII:12, XIII:13, XIV:14, XV:15, XVI:16, XVII:17, XVIII:18, XIX:19, XX:20
    };
    const _toArabic = (s) => {
        if (!s) return null;
        const upper = s.toUpperCase().trim();
        if (_roman[upper]) return _roman[upper];
        const parsed = parseInt(s);
        return isNaN(parsed) ? null : parsed;
    };

    // Ngưỡng tối đa cho số phần - phim hiếm khi có > 30 phần/mùa
    // Số lớn hơn (VD: 1983, 2024, 101) thường là tên phim hoặc năm, KHÔNG phải số phần
    const MAX_PART = 30;

    // Kiểm tra chuỗi có phải dạng năm phát hành (1900-2099) không
    const _isYearLike = (s) => {
        const n = parseInt(s);
        return n >= 1900 && n <= 2099;
    };

    // ═══════════════════════════════════════════════════════════
    // NHÓM 1: Patterns CÓ TỪ KHÓA RÕ RÀNG (độ tin cậy cao)
    // Phát hiện chính xác vì có keyword đi kèm số
    // ═══════════════════════════════════════════════════════════
    const keywordPatterns = [
        // Tiếng Việt: Phần 2, (Phần 2), Phần II
        { re: /\bph\u1ea7n\s*([ivxlcdm\d]+)\b/i,   label: 'Phần' },
        // Tiếng Việt: Mùa 2, Mùa II
        { re: /\bm\u00f9a\s*([ivxlcdm\d]+)\b/i,     label: 'Mùa'  },
        // Tiếng Việt: Quyển 2 (manga/anime)
        { re: /\bquy\u1ec3n\s*([ivxlcdm\d]+)\b/i,   label: 'Quyển' },
        // Tiếng Việt: Kỳ 2 (dùng trong phim Trung Quốc)
        { re: /\bk\u1ef3\s*([ivxlcdm\d]+)\b/i,      label: 'Kỳ'   },
        // Tiếng Anh: Season 2, (Season 2)
        { re: /\bseason\s*([ivxlcdm\d]+)\b/i,        label: 'Mùa'  },
        // Tiếng Anh: Part 2, Part II
        { re: /\bpart\s*([ivxlcdm\d]+)\b/i,          label: 'Phần' },
        // Tiếng Anh: Chapter 2
        { re: /\bchapter\s*([ivxlcdm\d]+)\b/i,       label: 'Phần' },
        // Tiếng Anh: Volume 2, Vol. 2, Vol 2 (anime/manga)
        { re: /\bvol(?:ume)?\.?\s*([ivxlcdm\d]+)\b/i, label: 'Phần' },
        // Tiếng Anh: Series 2 (UK style)
        { re: /\bseries\s+([ivxlcdm\d]+)\b/i,        label: 'Phần' },
        // Tiếng Anh: Cour 2 (anime)
        { re: /\bcour\s*([ivxlcdm\d]+)\b/i,          label: 'Phần' },
        // Shorthand: S02, S2, SS02, SS2 (phổ biến trong API phim)
        { re: /\bSS?0*(\d+)\b/,                      label: 'Mùa'  },
        // Ordinal: "2nd Season", "3rd Part", "4th Season"
        { re: /\b(\d+)(?:st|nd|rd|th)\s+season\b/i,  label: 'Mùa'  },
        { re: /\b(\d+)(?:st|nd|rd|th)\s+part\b/i,    label: 'Phần' },
    ];

    // ═══════════════════════════════════════════════════════════
    // NHÓM 2: Patterns KHÔNG CÓ TỪ KHÓA (cần cẩn thận hơn)
    // Dễ nhận nhầm nên cần thêm nhiều điều kiện chặn
    // ═══════════════════════════════════════════════════════════
    const ambiguousPatterns = [
        // Từ khóa trong ngoặc có kèm context: "(Season 2)", "(Phần 3)", "(Mùa 2)"
        { re: /\(\s*(?:ph\u1ea7n|m\u00f9a|season|part|chapter|vol\.?)\s*([ivxlcdm\d]+)\s*\)/i, label: 'Phần' },
        // Số thứ tự ở cuối tên trong ngoặc: "(2)", "(3)" — CHỈ khi số nhỏ
        { re: /\(\s*(\d+)\s*\)$/,                    label: 'Phần' },
        // Số La Mã hoặc số nhỏ ở CUỐI CÙNG chuỗi: "Iron Man 2", "Ám Ảnh III"
        // ⚠️ Pattern này DỄ NHẬN NHẦM nhất — cần nhiều bộ lọc bổ sung
        { re: /\s+([ivxlc]+)$/i,                     label: 'Phần', romanOnly: true },
        { re: /\s+(\d+)$/,                           label: 'Phần', digitOnly: true },
    ];

    // --- BƯỚC 1: Thử patterns có từ khóa rõ ràng trước (tin cậy cao) ---
    for (const src of [viTitle, enTitle]) {
        if (!src) continue;
        for (const { re, label } of keywordPatterns) {
            const m = src.match(re);
            if (m) {
                const num = _toArabic(m[1]);
                if (num && num > 1 && num <= MAX_PART) return `${label} ${num}`;
            }
        }
    }

    // --- BƯỚC 2: Thử patterns mơ hồ (cần kiểm tra kỹ hơn) ---
    for (const src of [viTitle, enTitle]) {
        if (!src) continue;
        for (const p of ambiguousPatterns) {
            const m = src.match(p.re);
            if (m) {
                const raw = m[1];
                const num = _toArabic(raw);
                if (!num || num <= 1 || num > MAX_PART) continue;

                // Chặn số trần giống năm phát hành (1900-2099): "Xin Chào 1983" → KHÔNG detect
                if (p.digitOnly && _isYearLike(raw)) continue;

                // Chặn số trần có >= 3 chữ số: "Apollo 13" ok, "District 101" → khả năng là tên phim
                if (p.digitOnly && raw.length >= 3) continue;

                return `${p.label} ${num}`;
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

    // Ngưỡng tối đa: số > 30 ở cuối slug thường là tên phim (VD: "xin-chao-1983"), không cắt
    const MAX_PART = 30;

    // Bỏ các suffix phần/mùa có từ khóa rõ ràng ở cuối slug (VD: -phan-2, -season-3)
    let cleanSlug = slug
        .replace(/-(phan|season|mua|part|chapter|quyen|ky|vol|volume|series|cour|tap|ss?)-?0*([\divxlc]+)$/i, '');
    
    // Chỉ bỏ số thuần ở cuối slug nếu số đó <= MAX_PART (tránh cắt nhầm tên phim có số lớn)
    cleanSlug = cleanSlug.replace(/-0*(\d+)$/, (match, numStr) => {
        const num = parseInt(numStr);
        return (num <= MAX_PART) ? '' : match;
    });
    
    cleanSlug = cleanSlug.replace(/-+$/, '');

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
        let embedLabel = 'Vietsub dự phòng';
        if (lower.includes('thuyet-minh') || lower.includes('thuyết minh') || lower.includes('thuyet minh') || lower.includes('tm')) {
            mainLabel  = 'Thuyết minh';
            embedLabel = 'Thuyết minh dự phòng';
        } else if (lower.includes('long-tieng') || lower.includes('lồng tiếng') || lower.includes('long tieng') || lower.includes('lt')) {
            mainLabel  = 'Lồng tiếng';
            embedLabel = 'Lồng tiếng dự phòng';
        } else if (lower.includes('ban-goc') || lower.includes('bản gốc') || lower.includes('raw') || lower.includes('original')) {
            mainLabel  = 'Bản gốc';
            embedLabel = 'Bản gốc dự phòng';
        }

        (server.server_data || server.items || []).forEach((ep, idx) => {
            const epName = String(ep.name || (idx + 1));
            const epKey  = _normalizeEpNumber(epName); // Dùng số tập đã chuẩn hóa làm key gộp

            // Khởi tạo record nếu chưa có
            if (!episodeMap[epKey]) {
                episodeMap[epKey] = {
                    movie_id:       movieId,
                    episode_index:  idx,
                    episode_number: epKey,
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
            const m3u8Link = ep.link_m3u8 || ep.m3u8 || '';
            const embedLink = ep.link_embed || ep.embed || '';
            const safeServerName = providerName === 'nguonc' || providerName === 'Nguồn C' ? 'NguonC' : providerName;

            if (m3u8Link) {
                const already = episodeMap[epKey].sources.some(s => s.source === m3u8Link);
                if (!already) episodeMap[epKey].sources.push({ label: mainLabel, type: 'hls', source: m3u8Link, server: safeServerName || '' });
            }
            if (embedLink) {
                const already = episodeMap[epKey].sources.some(s => s.source === embedLink);
                if (!already) episodeMap[epKey].sources.push({ label: embedLabel, type: 'embed', source: embedLink, server: safeServerName || '' });
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
        // 1. Lấy chi tiết phim từ API (Có cơ chế tự động thử lại 1 lần nếu lỗi mạng)
        if (!opts.silent) _clearImportLog();
        _addImportLog(`📡 Đang tải chi tiết "${slug}" từ ${provider.name}...`, 'info');
        
        let res, raw;
        try {
            res = await fetch(provider.buildDetailUrl(slug));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            raw = await res.json();
        } catch (fetchErr) {
            // Thử lại 1 lần sau 2 giây
            _addImportLog(`⚠️ Lỗi tải "${slug}", đang thử lại sau 2s...`, 'warning');
            await new Promise(r => setTimeout(r, 2000));
            try {
                res = await fetch(provider.buildDetailUrl(slug));
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                raw = await res.json();
                _addImportLog(`✅ Thử lại thành công cho "${slug}"!`, 'success');
            } catch (retryErr) {
                throw new Error(`Thử lại thất bại: ${retryErr.message}`);
            }
        }
        const movie    = raw.movie || raw;
        // NguonC: episodes nằm trong movie.episodes thay vì raw.episodes
        const episodes = raw.episodes || movie.episodes || [];
        if (!movie?.slug) throw new Error('Dữ liệu API không hợp lệ (thiếu slug)');

        // Extract metadata for smart deduplication (NguonC vs KKPhim/OPhim differences)
        let cYear = Number(movie.year) || 0;
        let cText = '';
        let cTotal = parseInt(movie.episode_total) || 0;
        if (Array.isArray(movie.country)) {
            cText = movie.country.map(c => c.name).join(', ');
        }
        if (movie.category && typeof movie.category === 'object' && !Array.isArray(movie.category)) {
            for (const key of Object.keys(movie.category)) {
                const group = movie.category[key];
                if (group?.group?.name === 'Quốc gia') cText = (group.list || []).map(l => l.name).join(', ');
                if (!cYear && group?.group?.name === 'Năm' && group.list?.length) cYear = parseInt(group.list[0].name) || 0;
                if (!movie.type && group?.group?.name === 'Định dạng' && group.list?.length) {
                    movie.type = group.list[0].name.toLowerCase().includes('lẻ') ? 'single' : 'series';
                }
            }
        }

        // --- NORMALIZE movie.type: Chuyển các giá trị API lạ về chuẩn 'series'/'single' ---
        const _rawType = (movie.type || '').toLowerCase().trim();
        if (['tvshows', 'hoathinh', 'tv_shows', 'phim-bo', 'bộ'].includes(_rawType) || _rawType.includes('phim bộ')) {
            movie.type = 'series';
        } else if (['phim-le', 'lẻ'].includes(_rawType) || _rawType.includes('phim lẻ')) {
            movie.type = 'single';
        }
        // Giữ nguyên nếu đã là 'series' hoặc 'single', hoặc giá trị không nhận dạng được

        // --- TỰ ĐỘNG ÉP KIỂU PHIM BỘ NẾU SỐ TẬP > 1 ---
        let actualEps = 0;
        if (Array.isArray(episodes) && episodes.length > 0) {
            const firstServer = episodes[0];
            if (firstServer.server_data && Array.isArray(firstServer.server_data)) {
                actualEps = firstServer.server_data.length; // Kiểu KKPhim/OPhim
            } else if (firstServer.items && Array.isArray(firstServer.items)) {
                actualEps = firstServer.items.length; // Kiểu NguonC
            }
        }
        const maxEps = Math.max(cTotal, actualEps);

        if (movie.type !== 'series' && maxEps > 1) {
            _addImportLog(`⚠️ Phim khai báo là [${movie.type || 'không rõ'}] nhưng có ${maxEps} tập -> Tự động ép thành [Phim bộ]`, 'warning');
            movie.type = 'series';
            cTotal = maxEps;
            movie.episode_total = maxEps.toString();
        }

        // --- BIỆN PHÁP CHẶN QUỐC GIA (EXCLUDE COUNTRY) ---
        if (_importState.excludeCountryEnabled && _importState.excludeCountryText && cText) {
            const normalizeStr = (str) => {
                if (!str) return '';
                return str.normalize('NFD') // Tách dấu
                          .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu
                          .toLowerCase()
                          .replace(/đ/g, 'd')
                          .replace(/[^a-z0-9]/g, ''); // Bỏ khoảng trắng và ký tự đặc biệt
            };
            const blockedCountries = _importState.excludeCountryText.split(',').map(s => normalizeStr(s)).filter(Boolean);
            const movieCountries = normalizeStr(cText);
            const isBlocked = blockedCountries.some(bc => movieCountries.includes(bc));
            if (isBlocked) {
                _addImportLog(`🚫 Thuộc quốc gia bị chặn (${cText}). Đã bỏ qua.`, 'warning');
                return { success: false, message: `Bỏ qua phim thuộc quốc gia [${cText}] bị chặn.`, duplicate: false, skippedUrl: true };
            }
        }

        // 2. Kiểm tra trùng lặp thông minh (Slug + Tên gốc + Năm) → Nếu đã có thì MERGE NGUỒN thay vì bỏ qua
        const existingId = await _checkMovieExistsBySlug(movie.slug, {
            origin_name: movie.origin_name || movie.original_name,
            name: movie.name,
            year: cYear,
            type: movie.type,
            countryText: cText,
            episode_total: cTotal
        });
        if (existingId) {
            // ★ Nếu skipMerge = true (Auto-Fill): bỏ qua ngay, đừng dùng vào gộp nguồn
            if (opts.skipMerge) {
                return { success: false, duplicate: true, merged: true, message: `Đã có trong DB: "${movie.name}"` };
            }

            // Phim đã tồn tại → Merge nguồn mới vào episodes cũ
            const providerName = provider.name || provider.id || 'Unknown';

            const mergeResult = await _mergeEpisodesSources(existingId, episodes, providerName);

            // ★ KIỂM TRA ẢNH POSTER / BACKGROUND CỦA PHIM ĐÃ TỒN TẠI ★
            try {
                const { data: existingMovie } = await supabase.from('movies')
                    .select('poster_url, background_url')
                    .eq('id', existingId).single();
                if (existingMovie) {
                    _addImportLog('🖼️ Kiểm tra ảnh poster/background phim đã tồn tại...', 'info');
                    const [posterOk, bgOk] = await Promise.all([
                        // Poster phải DỌC (h > w), Background phải NGANG (w > h)
                        existingMovie.poster_url ? _getImageInfo(existingMovie.poster_url).then(info => info.ok && info.isVertical) : Promise.resolve(false),
                        existingMovie.background_url ? _getImageInfo(existingMovie.background_url).then(info => info.ok && !info.isVertical) : Promise.resolve(false),
                    ]);

                    const needsReplace = { poster: !posterOk, background: !bgOk };
                    if (needsReplace.poster || needsReplace.background) {
                        if (needsReplace.poster) _addImportLog('⚠️ Ảnh poster phim cũ bị lỗi → thử lấy từ nguồn gộp...', 'warning');
                        if (needsReplace.background) _addImportLog('⚠️ Ảnh background phim cũ bị lỗi → thử lấy từ nguồn gộp...', 'warning');

                        const updateData = {};

                        // ƯU TIÊN 1: Lấy ảnh từ nguồn đang gộp (đã xác nhận ĐÚNG PHIM qua check trùng lặp)
                        const _mergerPid = provider.id || 'kkphim';
                        const imgMerge1 = _buildApiImgUrl(movie.thumb_url, _mergerPid);
                        const imgMerge2 = _buildApiImgUrl(movie.poster_url, _mergerPid);
                        const _classified = await _classifyAndValidateImages(imgMerge1, imgMerge2);

                        if (needsReplace.poster && _classified.poster) {
                            updateData.poster_url = _classified.poster;
                            needsReplace.poster = false;
                            _addImportLog(`✅ Thay poster bằng ảnh từ nguồn gộp ${providerName}`, 'success');
                        }
                        if (needsReplace.background && _classified.background) {
                            updateData.background_url = _classified.background;
                            needsReplace.background = false;
                            _addImportLog(`✅ Thay background bằng ảnh từ nguồn gộp ${providerName}`, 'success');
                        }

                        // ƯU TIÊN 2: Nếu nguồn gộp cũng không có ảnh chuẩn → Tìm trên TMDb/IMDb
                        if (needsReplace.poster || needsReplace.background) {
                            _addImportLog('🔍 Nguồn gộp không đủ ảnh chuẩn → Đang tìm trên TMDb...', 'info');
                            const replacements = await _findReplacementImages(
                                movie.slug, movie.name,
                                movie.origin_name || movie.original_name || '',
                                cYear, cText, _mergerPid, needsReplace
                            );
                            if (replacements.poster && needsReplace.poster) {
                                updateData.poster_url = replacements.poster;
                                needsReplace.poster = false;
                            }
                            if (replacements.background && needsReplace.background) {
                                updateData.background_url = replacements.background;
                                needsReplace.background = false;
                            }
                        }

                        // VẪN thiếu → XÓA LINK ẢNH SAI + GỬI BÁO LỖI cho admin
                        const missingMergeParts = [];
                        if (needsReplace.poster) {
                            updateData.poster_url = ''; // Để trống link ảnh sai
                            missingMergeParts.push('Poster (ảnh dọc)');
                            _addImportLog('❌ Không tìm được poster → xóa link sai, đã gửi báo lỗi.', 'error');
                        }
                        if (needsReplace.background) {
                            updateData.background_url = ''; // Để trống link ảnh sai
                            missingMergeParts.push('Background (ảnh ngang)');
                            _addImportLog('❌ Không tìm được background → xóa link sai, đã gửi báo lỗi.', 'error');
                        }

                        // Gửi báo lỗi tự động
                        if (missingMergeParts.length > 0) {
                            try {
                                const title = existingMovie.title || movie.name || 'Không rõ';
                                await supabase.from('error_reports').insert({
                                    movie_id: existingId,
                                    movie_title: title,
                                    episode_name: 'Ảnh phim',
                                    error_type: 'missing_image',
                                    description: `[AUTO-IMPORT] Phim "${title}" bị lỗi/thiếu ${missingMergeParts.join(' + ')}. Ảnh sai tỷ lệ hoặc hỏng link, không tìm được thay thế. Admin cần bổ sung ảnh thủ công.`,
                                    status: 'pending',
                                    user_name: 'Hệ thống Import',
                                    report_count: 1,
                                    reporters: [{ uid: 'system_import', name: 'Hệ thống Import', time: new Date().toISOString() }]
                                });
                                _addImportLog(`📨 Đã gửi báo lỗi thiếu ảnh cho admin.`, 'info');
                            } catch (e) {
                                console.warn('[AutoReport] Lỗi:', e.message);
                            }
                        }

                        // Cập nhật DB
                        if (Object.keys(updateData).length > 0) {
                            await supabase.from('movies').update(updateData).eq('id', existingId);
                            _addImportLog(`💾 Đã cập nhật ảnh phim cũ (${Object.keys(updateData).length} field)`, 'success');
                        } else {
                            _addImportLog('ℹ️ Không có ảnh nào cần thay đổi.', 'info');
                        }
                    } else {
                        _addImportLog('✅ Ảnh poster & background phim cũ đều OK', 'success');
                    }
                }
            } catch (imgErr) {
                console.warn('[Merge Image Check] Lỗi kiểm tra ảnh:', imgErr.message);
            }

            // ★ Trigger cross-fetch sang các nguồn khác (giống import mới)
            if (!opts.skipCrossFetch && mergeResult.added > 0) {
                try {
                    await _crossFetchFromAllProviders(existingId, movie.slug, providerName, movie.name || '', {
                        origin_name: movie.origin_name || movie.original_name || '',
                        name: movie.name,
                        year: cYear,
                        type: movie.type,
                        countryText: cText,
                        episode_total: cTotal,
                    });
                } catch (e) {
                    console.warn('[CrossFetch on Merge] Lỗi:', e.message);
                }
            }

            // Cập nhật versions dựa trên sources thực tế trong DB
            await _syncMovieVersionsFromEpisodes(existingId);


            return {
                success: mergeResult.added > 0,
                merged: true, // Đánh dấu là gộp nguồn, KHÔNG phải phim mới
                movieId: existingId,
                duplicate: mergeResult.added === 0,
                message: mergeResult.added > 0
                    ? `✅ Đã gộp ${mergeResult.added} nguồn "${providerName}" vào "${movie.name}"`
                    : `"${movie.name}" đã có đủ nguồn từ "${providerName}"`,
                telegramStats: mergeResult.added > 0 ? {
                    title: movie.name || 'Không rõ',
                    currentEps: 'Cập nhật thêm ' + mergeResult.added + ' link',
                    totalEps: movie.episode_total || cTotal || '?',
                    versions: 'Đã hợp nhất',
                    sources: providerName,
                    typeName: movie.type === 'series' ? 'Phim bộ' : 'Phim lẻ',
                    isTrailer: false
                } : null
            };
        }

        // 3. Chuẩn bị URL ảnh gốc từ API (truyền providerId để dùng đúng CDN)
        const _pid = provider.id || 'kkphim';
        const imgRaw1 = _buildApiImgUrl(movie.thumb_url, _pid);
        const imgRaw2 = _buildApiImgUrl(movie.poster_url, _pid);
        
        // Khởi tạo biến ảnh = null. CHỈ gán khi ảnh đã qua KĐ tỷ lệ chuẩn (dọc/ngang)
        let rawPoster = null;
        let rawThumb  = null;
        const safeSlug  = (movie.slug || slug).replace(/[^a-z0-9-]/gi, '-').toLowerCase();

        // ★ 3.5 KIỂM TRA ẢNH: Validate và phân loại poster & background tự động trước khi upload
        _addImportLog('🖼️ Đang kiểm tra và phân loại chiều ảnh gốc...', 'info');
        
        const info1 = imgRaw1 ? await _getImageInfo(imgRaw1) : { ok: false };
        const info2 = imgRaw2 ? await _getImageInfo(imgRaw2) : { ok: false };

        if (!info1.ok && imgRaw1) _addImportLog('⚠️ Ảnh gốc 1 bị lỗi link / 0 byte', 'error');
        if (!info2.ok && imgRaw2) _addImportLog('⚠️ Ảnh gốc 2 bị lỗi link / 0 byte', 'error');

        let p = null, t = null;
        if (info1.ok && info2.ok) {
            if (info1.isVertical && !info2.isVertical) { p = imgRaw1; t = imgRaw2; }
            else if (!info1.isVertical && info2.isVertical) { p = imgRaw2; t = imgRaw1; }
            else { 
                if (!info1.isVertical) {
                    // CẢ 2 BỨC ĐỀU NẰM NGANG -> KHÔNG CÓ POSTER
                    t = imgRaw1;
                    _addImportLog('⚠️ Cả 2 ảnh gốc đều nằm ngang. Sẽ đi tìm Poster dọc thay thế!', 'warning');
                } else {
                    // CẢ 2 BỨC ĐỀU ĐỨNG DỌC -> KHÔNG CÓ BACKGROUND
                    p = imgRaw1;
                    _addImportLog('⚠️ Cả 2 ảnh gốc đều đứng dọc. Sẽ đi tìm Background ngang thay thế!', 'warning');
                }
            }
        } else if (info1.ok) {
            if (info1.isVertical) { p = imgRaw1; _addImportLog('⚠️ Thiếu Background ngang, sẽ đi tìm thay thế.', 'warning'); } 
            else { t = imgRaw1; _addImportLog('⚠️ Thiếu Poster dọc, sẽ đi tìm thay thế.', 'warning'); }
        } else if (info2.ok) {
            if (info2.isVertical) { p = imgRaw2; _addImportLog('⚠️ Thiếu Background ngang, sẽ đi tìm thay thế.', 'warning'); } 
            else { t = imgRaw2; _addImportLog('⚠️ Thiếu Poster dọc, sẽ đi tìm thay thế.', 'warning'); }
        }
        
        const posterValid = !!p;
        const bgValid = !!t;
        
        // Gán ảnh đã được phân loại chuẩn vào biến
        if (posterValid) rawPoster = p;
        if (bgValid) rawThumb = t;

        if (posterValid) _addImportLog('✅ Ảnh poster gốc OK (đúng tỷ lệ dọc)', 'success');
        else _addImportLog('⚠️ Ảnh poster gốc bị lỗi/thiếu → đang tìm thay thế...', 'warning');

        if (bgValid) _addImportLog('✅ Ảnh background gốc OK (đúng tỷ lệ ngang)', 'success');
        else _addImportLog('⚠️ Ảnh background gốc bị lỗi/thiếu → đang tìm thay thế...', 'warning');

        // Nếu có ảnh lỗi → tìm thay thế từ nguồn gộp (đúng luật) + TMDb
        if (!posterValid || !bgValid) {
            const replacements = await _findReplacementImages(
                movie.slug, movie.name,
                movie.origin_name || movie.original_name || '',
                cYear, cText, _pid,
                { poster: !posterValid, background: !bgValid }
            );
            if (!posterValid && replacements.poster) rawPoster = replacements.poster;
            if (!bgValid && replacements.background) rawThumb = replacements.background;

            // Nếu VẪN không tìm được → ĐỂ TRỐNG + TỰ ĐỘNG BÁO LỖI cho admin
            const missingParts = [];
            if (!posterValid && !replacements.poster) {
                rawPoster = null; // Để trống, không dùng ảnh sai
                missingParts.push('Poster (ảnh dọc)');
                _addImportLog('❌ KHÔNG tìm được poster thay thế → để trống, đã gửi báo lỗi.', 'error');
            }
            if (!bgValid && !replacements.background) {
                rawThumb = null; // Để trống, không dùng ảnh sai
                missingParts.push('Background (ảnh ngang)');
                _addImportLog('❌ KHÔNG tìm được background thay thế → để trống, đã gửi báo lỗi.', 'error');
            }

            // Gửi báo lỗi tự động vào error_reports cho admin
            if (missingParts.length > 0 && typeof supabase !== 'undefined') {
                try {
                    const movieTitle = movie.name || movie.slug || 'Không rõ';
                    await supabase.from('error_reports').insert({
                        movie_id: null, // Phim chưa insert vào DB nên chưa có ID
                        movie_title: movieTitle,
                        episode_name: 'Ảnh phim',
                        error_type: 'missing_image',
                        description: `[AUTO-IMPORT] Phim "${movieTitle}" thiếu ${missingParts.join(' + ')}. Không tìm được ảnh thay thế từ nguồn gộp và TMDb. Admin cần bổ sung ảnh thủ công.`,
                        status: 'pending',
                        user_name: 'Hệ thống Import',
                        report_count: 1,
                        reporters: [{ uid: 'system_import', name: 'Hệ thống Import', time: new Date().toISOString() }]
                    });
                    _addImportLog(`📨 Đã gửi báo lỗi thiếu ảnh "${movieTitle}" cho admin.`, 'info');
                } catch (e) {
                    console.warn('[AutoReport] Lỗi gửi báo lỗi ảnh:', e.message);
                }
            }
        }

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
        
        // Wrap hàm lấy trailer TMDb + tmdb_id để an toàn (không lỗi ngắt import)
        // ★ LỚP 3: Trả về cả tmdb_id để lưu vào DB làm khóa chống trùng quốc tế
        const fetchTmdbInfoSafe = async () => {
            try {
                if (typeof searchTmdbByTitle !== 'function' || typeof getTmdbTrailer !== 'function') return { trailerKey: null, tmdbId: null };
                const searchTitle = movie.origin_name || movie.name || '';
                const tmdbResult = await searchTmdbByTitle(searchTitle, movie.year, movie.name);
                const tmdbId = tmdbResult ? tmdbResult.id : null;
                const mediaType = tmdbResult ? (tmdbResult.media_type || 'movie') : 'movie';
                const trailerKey = await getTmdbTrailer(tmdbId, mediaType, searchTitle, movie.year);
                return { trailerKey, tmdbId };
            } catch(e) { return { trailerKey: null, tmdbId: null }; }
        };

        const [castData, imdbRating, tmdbInfo] = await Promise.all([
            _resolveActorsForImport(actorNames),
            // Sử dụng hàm Global trong utils.js hỗ trợ Cơ chế Tự Dụng Pool Khi Quá Tải
            _fetchImdbRatingGlobal(movie.origin_name || movie.name || '', movie.year),
            fetchTmdbInfoSafe() // Tự động lấy trailer + tmdb_id
        ]);
        const tmdbTrailerKey = tmdbInfo.trailerKey;
        const tmdbId = tmdbInfo.tmdbId; // ★ TMDb ID để lưu vào DB

        // 8. Build movieData - theo đúng whitelist bảng movies Supabase
        // whitelist: id, slug, title, origin_title, poster_url, background_url, description,
        //   year, type, duration, quality, status, age_limit, series_id, price, rating,
        //   tmdb_id, total_episodes, api_url_backup, cast_data, tags, versions, category_id, country_id,
        //   created_at, updated_at, tmdb_trailer_key
        let movieId = `${safeSlug}-${Date.now().toString().slice(-6)}`; // Dùng let vì có thể bị thay đổi bởi upsert


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
            slug:           safeSlug, // ★ LỚP 2: Lưu slug vào cột UNIQUE để DB chặn trùng
            title:          movie.name || 'Không rõ',
            origin_title:   movie.origin_name || movie.origin_title || '',
            poster_url:     posterUrl,
            background_url: backgroundUrl,
            description:    (movie.content || movie.description || '').replace(/<[^>]*>/g, '').trim(),
            year:           movie.year ? parseInt(movie.year) : null,
            // movie.type đã được ép thành 'series' ở bước trên nếu maxEps > 1
            type:           movie.type === 'series' ? 'series' : 'single',
            quality:        movie.quality || 'HD',
            // Phim chỉ có Trailer → set "chờ duyệt" thay vì public
            status:         _isTrailerOnly(movie, episodes) ? 'pending' : 'public',
            age_limit:      'P',
            series_id:      '',
            price:          0,
            rating:         0,
            imdb_rating:    imdbRating, // Điểm IMDb thật từ OMDB API
            tmdb_id:        tmdbId || null, // ★ LỚP 3: TMDb ID quốc tế, chống trùng chính xác nhất
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
        // ★ Thêm 'slug' và 'tmdb_id' vào whitelist cho Lớp 2 & 3
        const _WHITELIST = [
            'id', 'slug', 'title', 'origin_title', 'poster_url', 'background_url', 'description',
            'year', 'type', 'duration', 'quality', 'status', 'age_limit', 'series_id',
            'price', 'rating', 'imdb_rating', 'tmdb_id', 'total_episodes', 'api_url_backup', 'cast_data', 'tags',
            'versions', 'category_ids', 'country_id', 'part', 'tmdb_trailer_key',
            'created_at', 'updated_at',
        ];
        const _NUM_FIELDS = ['year', 'price', 'rating', 'imdb_rating', 'tmdb_id', 'total_episodes'];
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

        // 9. ★ LỚP 2: UPSERT phim vào Supabase (thay vì insert)
        // Dùng slug làm conflict key → nếu trùng slug thì CẬP NHẬT thay vì tạo phim mới trùng
        // Đây là lưới an toàn cuối cùng ở cấp DB, sau tất cả các lớp check JS

        _addImportLog(`💾 Đang lưu "${movie.name}" vào database (upsert trên slug)...`, 'info');
        const { data: upsertData, error: insertErr } = await supabase
            .from('movies')
            .upsert(finalMovieData, { 
                onConflict: 'slug',
                ignoreDuplicates: false // Cho phép cập nhật nếu trùng slug
            })
            .select('id')
            .single();
        if (insertErr) throw new Error(insertErr.message);
        
        // Nếu upsert trả về ID khác movieId → phim đã tồn tại, đã được cập nhật thay vì tạo mới
        const wasExisting = upsertData && upsertData.id !== movieId;
        if (wasExisting) {
            _addImportLog(`⚠️ Phim đã tồn tại trong DB (slug trùng). Đã cập nhật thay vì tạo mới.`, 'warning');
            // ★ Quan trọng: reassign movieId để import tập phim + notification dùng đúng ID
            movieId = upsertData.id;
        }
        _addImportLog('✅ Đã lưu phim vào database thành công!', 'success');

        // ★ Tự động đẩy thông báo chuông (hệ thống) cho tất cả users
        // Chỉ gửi khi phim MỚI thật sự, không gửi khi upsert cập nhật phim cũ (tránh spam)
        if (!wasExisting && typeof sendNotificationToAllUsers === 'function') {
            const isTrailer = finalMovieData.status === 'pending';
            const typeName = finalMovieData.type === 'series' ? 'Phim bộ' : 'Phim lẻ';
            
            const notifTitle = isTrailer ? `🎬 Trailer [${typeName}]: ${movie.name}` : `🎬 Phim mới [${typeName}]: ${movie.name}`;
            const notifMsg = isTrailer 
                ? `Trạm Phim vừa cập nhật Trailer ${typeName.toLowerCase()} "${movie.name}". Cùng hóng nhé!` 
                : `Trạm Phim vừa cập nhật ${typeName.toLowerCase()} "${movie.name}". Xem ngay!`;
            
            sendNotificationToAllUsers(notifTitle, notifMsg, 'new_movie', { movie_id: movieId });
        }


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
                    const _crossProviders = await _crossFetchFromAllProviders(movieId, movie.slug, _currentProviderName, movie.name || '', {
                        origin_name: movie.origin_name || movie.original_name || '',
                        name: movie.name,
                        year: cYear,
                        type: movie.type,
                        countryText: cText,
                        episode_total: cTotal,
                    });
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
        let finalEpCount = '?';
        let finalVersions = [];
        let finalSources = [provider.name || 'Chưa rõ'];

        try {
            const { count: realEpCount } = await supabase.from('episodes').select('id', { count: 'exact', head: true }).eq('movie_id', movieId);
            const { data: verData } = await supabase.from('movies').select('versions').eq('id', movieId).single();
            
            finalEpCount = realEpCount || '?';
            finalVersions = verData?.versions || [];

            // Build chi tiết nguồn
            const sourceDetails = [`${provider.name}: ${totalEpCount} tập`];
            if (typeof _mergedProviderNames !== 'undefined' && _mergedProviderNames.length > 0) {
                _mergedProviderNames.forEach(p => {
                    sourceDetails.push(`${p.name}: ${p.epCount} tập`);
                });
            }
            finalSources = sourceDetails;
            summaryMsg = `✅ "${movie.name}" - ${finalEpCount} tập | ${finalVersions.length} phiên bản (${finalVersions.join(', ')}) | Nguồn: ${finalSources.join(', ')}`;
        } catch(e) { /* ignore */ }

        _addImportLog(summaryMsg, 'done');

        return { 
            success: true, 
            movieId, 
            message: summaryMsg,
            telegramStats: {
                title: movie.name || 'Không rõ',
                currentEps: finalEpCount,
                totalEps: movie.episode_total || cTotal || '?',
                versions: finalVersions.join(', ') || 'Chưa rõ',
                sources: finalSources.join(', ') || 'Chưa rõ',
                typeName: movie.type === 'series' ? 'Phim bộ' : 'Phim lẻ',
                isTrailer: _isTrailerOnly(movie, episodes)
            }
        };

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
    const _bulkTelegramReports = []; // ★ Lưu chi tiết phim cho Telegram
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
            if (result.telegramStats) _bulkTelegramReports.push(result.telegramStats);
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
        await _sendTelegramInChunks(_bulkTelegramReports, (part, totalParts) => {
            return `🎬 <b>Trạm Phim Bot</b>\n\n👤 Admin vừa Import Hàng Loạt <b>${successCount} phim mới</b> ${totalParts > 1 ? `(Phần ${part}/${totalParts})` : ''}:\n\n`;
        }, false);
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
            if (typeof sendTelegramNotify === 'function') {
                const ts = result.telegramStats;
                const typeStr = ts && ts.isTrailer ? `[Trailer] ${ts.typeName}` : (ts ? ts.typeName : 'Phim');
                const msg = ts ? `🎬 <b>Trạm Phim Bot</b>\n\n👤 Admin vừa thêm/gộp phim thủ công:\n\n📌 <b>Phim:</b> ${ts.title}\n🏷 <b>Loại:</b> ${typeStr}\n📺 <b>Tập:</b> ${ts.currentEps} / ${ts.totalEps}\n💽 <b>Bản:</b> ${ts.versions}\n🌐 <b>Nguồn:</b> ${ts.sources}` : `🎬 <b>Trạm Phim Bot</b>\n\n👤 Admin vừa thêm thủ công phim mới!`;
                sendTelegramNotify(msg);
            }
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
        if (typeof sendTelegramNotify === 'function') {
            const ts = result.telegramStats;
            const typeStr = ts && ts.isTrailer ? `[Trailer] ${ts.typeName}` : (ts ? ts.typeName : 'Phim');
            const msg = ts ? `🎬 <b>Trạm Phim Bot</b>\n\n👤 Admin vừa thêm/gộp phim thủ công:\n\n📌 <b>Phim:</b> ${ts.title}\n🏷 <b>Loại:</b> ${typeStr}\n📺 <b>Tập:</b> ${ts.currentEps} / ${ts.totalEps}\n💽 <b>Bản:</b> ${ts.versions}\n🌐 <b>Nguồn:</b> ${ts.sources}` : `🎬 <b>Trạm Phim Bot</b>\n\n👤 Admin vừa click thêm thủ công phim mới!`;
            sendTelegramNotify(msg);
        }
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
        // Khởi tạo nút toggle Auto-Import phim mới
        if (typeof initAutoImportToggleUI === 'function') initAutoImportToggleUI();

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
            const _isSeries = item.type === 'series' || item.type === 'tvshows' || item.type === 'hoathinh';
            const typeClass = _isSeries ? 'type-series' : 'type-single';
            const typeLabel = _isSeries ? 'Bộ' : 'Lẻ';
            
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
        //     "https://phim.nguonc.com/api/film/toi-pham-101" → "toi-pham-101"
        const cleanSlug = slug.startsWith('http')
            ? slug.replace(/.*\/(phim|film)\//, '').split('?')[0].replace(/\/$/, '')
            : slug;

        // 1. Gọi API lấy danh sách tập mới nhất
        const res = await fetch(provider.buildDetailUrl(cleanSlug));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const movieRaw = raw.movie || raw;
        // NguonC: episodes nằm trong movie.episodes, KKPhim/OPhim trong raw.episodes
        const apiEpisodes = raw.episodes || movieRaw.episodes || [];
        if (!apiEpisodes.length) return { added: 0, total: 0 };

        // 2. Lấy danh sách episode đang có trong DB (cần cả id và sources để merge nguồn)
        const { data: existingEps } = await supabase
            .from('episodes')
            .select('id, episode_number, sources')
            .eq('movie_id', movieId);

        // Normalize episode numbers trong DB để match đúng format chuẩn hóa
        const existingNumbers = new Set((existingEps || []).map(e => _normalizeEpNumber(e.episode_number)));
        // Map nhanh: normalized_episode_number → {id, sources} để merge nguồn
        const existingEpMap = {};
        (existingEps || []).forEach(e => { existingEpMap[_normalizeEpNumber(e.episode_number)] = e; });

        // 3. Map FHD/FullHD/raw → giá trị chuẩn
        const _qualityMap = {
            'fhd': '1080p', 'fullhd': '1080p', 'full hd': '1080p',
            'hd': '720p', 'sd': '480p',
            '4k': '4K (2160p)', '2k': '2K (1440p)',
            '1080p': '1080p', '720p': '720p', '480p': '480p', '360p': '360p',
        };
        const normQuality = _qualityMap[(movieRaw?.quality || raw.movie?.quality || '').toLowerCase().trim()] || movieRaw?.quality || raw.movie?.quality || '1080p';
        const movieDuration = movieRaw?.time || raw.movie?.time || '';

        // 4. Xây dựng map tập mới (theo cùng logic _importEpisodesForMovie)
        const episodeMap = {};
        apiEpisodes.forEach(server => {
            const serverName = server.server_name || '';
            const lower = serverName.toLowerCase();
            let mainLabel = 'Vietsub';
            let embedLabel = 'Vietsub dự phòng';
            if (lower.includes('thuyet-minh') || lower.includes('thuyết minh') || lower.includes('tm')) {
                mainLabel = 'Thuyết minh'; embedLabel = 'Thuyết minh dự phòng';
            } else if (lower.includes('long-tieng') || lower.includes('lồng tiếng') || lower.includes('lt')) {
                mainLabel = 'Lồng tiếng'; embedLabel = 'Lồng tiếng dự phòng';
            }

            // NguonC dùng items[] thay vì server_data[], m3u8/embed thay link_m3u8/link_embed
            (server.server_data || server.items || []).forEach((ep, idx) => {
                // Chuẩn hóa tên tập: "Tập 01" / "Tap 1" / "01" / "1" → "1"
                const rawName = String(ep.name || (idx + 1));
                const epName = _normalizeEpNumber(rawName);
                if (!episodeMap[epName]) {
                    episodeMap[epName] = {
                        movie_id: movieId,
                        episode_index: idx,
                        episode_number: epName,
                        title: rawName, // Giữ tên gốc cho display
                        quality: normQuality,
                        duration: movieDuration,
                        sources: [],
                        intro_begin: 0, intro_end: 0, intro_start: 0,
                        is_new: true,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    };
                }
                const m3u8Link = ep.link_m3u8 || ep.m3u8 || '';
                const embedLink = ep.link_embed || ep.embed || '';
                const safeServerName = provider.id === 'nguonc' ? 'NguonC' : provider.name;
                if (m3u8Link && !episodeMap[epName].sources.some(s => s.source === m3u8Link)) {
                    episodeMap[epName].sources.push({ label: mainLabel, type: 'hls', source: m3u8Link, server: safeServerName || '' });
                }
                if (embedLink && !episodeMap[epName].sources.some(s => s.source === embedLink)) {
                    episodeMap[epName].sources.push({ label: embedLabel, type: 'embed', source: embedLink, server: safeServerName || '' });
                }
            });
        });

        // 5a. INSERT tập hoàn toàn mới (chưa tồn tại trong DB)
        const toInsert = Object.values(episodeMap)
            .filter(ep => !existingNumbers.has(ep.episode_number))
            .sort((a, b) => (parseFloat(a.episode_number) || 0) - (parseFloat(b.episode_number) || 0));

        if (toInsert.length > 0) {
            const BATCH = 50;
            for (let i = 0; i < toInsert.length; i += BATCH) {
                const { error } = await supabase.from('episodes').insert(toInsert.slice(i, i + BATCH));
                if (error) console.warn(`[AutoSync] Lỗi insert tập batch:`, error.message);
            }
        }

        // 5b. MERGE NGUỒN MỚI vào tập đã tồn tại (provider ra tập trước → provider khác ra sau → gộp source)
        let mergedCount = 0;
        const mergedEpNames = []; // Theo dõi tên tập vừa được bổ sung video
        for (const [epNum, apiEp] of Object.entries(episodeMap)) {
            const existing = existingEpMap[epNum];
            if (!existing) continue; // Tập mới, đã insert ở bước 5a

            let currentSources = [...(existing.sources || [])];
            let sourceChanged = false;
            let newlyMergedCount = 0;

            for (const newSrc of apiEp.sources) {
                if (!newSrc.source) continue;
                
                // Nhận dạng nguồn trùng lặp logic
                const matchIndex = currentSources.findIndex(s => 
                    s.server === newSrc.server && 
                    s.type === newSrc.type && 
                    s.label === newSrc.label
                );

                if (matchIndex >= 0) {
                    // Cập nhật lại URL M3U8 / Embed nếu API đổi server CDN cho cùng 1 nguồn! (Trọng yếu)
                    if (currentSources[matchIndex].source !== newSrc.source) {
                        currentSources[matchIndex].source = newSrc.source;
                        sourceChanged = true;
                        newlyMergedCount++;
                    }
                } else {
                    // Nếu hoàn toàn khác nguồn API (OPhim khác KKPhim), kiểm tra chống trùng link tuyệt đối
                    const urlExists = currentSources.some(s => s.source === newSrc.source);
                    if (!urlExists) {
                        currentSources.push(newSrc);
                        sourceChanged = true;
                        newlyMergedCount++;
                    }
                }
            }

            if (sourceChanged) {
                const { error } = await supabase.from('episodes')
                    .update({ sources: currentSources, updated_at: new Date().toISOString() })
                    .eq('id', existing.id);
                if (!error) {
                    mergedCount += newlyMergedCount;
                    mergedEpNames.push(epNum);
                }
            }
        }

        const totalNewWork = toInsert.length + mergedCount;
        if (totalNewWork === 0) return { added: 0, total: existingNumbers.size };

        // Cập nhật lại Chất Lượng (Quality) & Trạng Thái Tập Mới Nhất cho phim Gốc (Auto-Upgrade)
        try {
            const qualityStr = normQuality || '1080p';
            const episodeStatus = raw.movie?.episode_current || raw.movie?.current_episode || raw.movie?.status || `Tập ${existingNumbers.size + toInsert.length}`;
            
            const { data: currentMovie } = await supabase.from('movies').select('title, type, status').eq('id', movieId).single();
            
            // ★ Kiểm tra xem phim đang chờ duyệt (trailer) không, NẾU ĐƯỢC THÊM NGUỒN (kể cả merge) → thăng cấp!
            const shouldPromote = currentMovie?.status === 'pending' && totalNewWork > 0;

            const updatePayload = {
                quality: qualityStr,
                updated_at: new Date().toISOString()
            };

            if (shouldPromote) {
                // Phim Trailer → có tập thật → tự động công khai!
                updatePayload.status = 'public';
                console.log(`[AutoSync] 🎬 Phim "${slug}" được bổ sung video → Tự động chuyển từ "chờ duyệt" sang "công khai"!`);
            }
            
            await supabase.from('movies').update(updatePayload).eq('id', movieId);

            // ★ THÔNG BÁO CHUÔNG CHO TẬP MỚI HOẶC BỔ SUNG VIDEO
            if (totalNewWork > 0 && typeof sendNotificationToAllUsers === 'function') {
                const typeName = currentMovie?.type === 'series' ? 'Phim bộ' : 'Phim lẻ';
                const notifTitle = `📺 Cập nhật video [${typeName}]: ${currentMovie?.title || 'Phim'}`;
                
                let epString = '';
                if (toInsert.length > 0) {
                    const epNums = toInsert.map(ep => parseFloat(ep.episode_number)).filter(n => !isNaN(n)).sort((a, b) => a - b);
                    if (epNums.length === 1) epString = `Tập ${epNums[0]}`;
                    else if (epNums.length > 1) epString = `từ Tập ${epNums[0]} đến Tập ${epNums[epNums.length - 1]}`;
                    else epString = `thêm ${toInsert.length} tập mới`;
                } else if (mergedEpNames.length > 0) {
                    const mergedNums = mergedEpNames.map(n => parseFloat(n)).filter(n => !isNaN(n)).sort((a,b)=>a-b);
                    if (mergedNums.length === 1) epString = `video chính thức cho Tập ${mergedNums[0]}`;
                    else epString = `video chính thức cho các tập`;
                }

                const notifMsg = `Trạm Phim vừa cập nhật ${epString} cho "${currentMovie?.title || 'Phim'}". Vào xem ngay!`;
                sendNotificationToAllUsers(notifTitle, notifMsg, 'new_episode', { movie_id: movieId });
            }
        } catch (updateErr) {
            console.warn('[AutoSync] Lỗi update Quality/Status:', updateErr.message);
        }

        console.log(`[AutoSync] ✅ Phim "${slug}": +${toInsert.length} tập mới, +${mergedCount} nguồn bổ sung (Quality: ${normQuality})`);
        return { added: totalNewWork, total: existingNumbers.size + toInsert.length };

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
async function autoSyncEpisodesIfNeeded(isManual = false) {
    if (typeof supabase === 'undefined') return;

    const logOut = (msg, type = 'info') => {
        const cleanMsg = msg.replace(/^\[AutoSync\]\s*/, '');
        console.log(`[AutoSync] ${cleanMsg}`);
        if (isManual) _addImportLog(cleanMsg, type);
    };

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
            logOut('⏸️ Đã tắt tự động bởi admin.', 'error');
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

    // Đọc số ngày grace period từ app_configs (admin cài), mặc định 3 ngày nếu chưa cài
    let GRACE_PERIOD_DAYS = 3;
    try {
        const { data: graceRow } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'auto_sync_grace_period_days')
            .maybeSingle();
        const savedGrace = Number(graceRow?.value?.days);
        if (savedGrace >= 1 && savedGrace <= 30) GRACE_PERIOD_DAYS = savedGrace;
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
            logOut(`⏱️ Bỏ qua — lần sync cuối ${hoursSinceLast.toFixed(1)}h trước (cooldown ${COOLDOWN_HOURS}h).`, 'warning');
            _updateAutoSyncLastInfo(configRow?.value);
            return;
        }

        logOut('🔄 Bắt đầu sync tập phim từ API...', 'info');

        // 2. Kiểm tra API_PROVIDERS có sẵn không
        if (typeof API_PROVIDERS === 'undefined') { logOut('Không tìm thấy API_PROVIDERS.', 'error'); return; }

        // 3. Lấy phim cần check (Phim bộ HOẶC phim đang chờ duyệt)
        const { data: movies } = await supabase
            .from('movies')
            .select('id, title, api_url_backup, total_episodes, type, status')
            .or('type.eq.series,status.eq.pending')
            .not('api_url_backup', 'is', null)
            .neq('api_url_backup', '');

        if (!movies?.length) {
            logOut('Không có phim nào đủ điều kiện sync.', 'warning');
            return;
        }

        // 4. Lọc phim cần sync thực sự (Thêm cả phim lẻ có tập bị rỗng video)
        const moviesNeedSync = [];
        for (const movie of movies) {
            // Lấy toàn bộ episodes của phim này để check sources
            const { data: eps } = await supabase
                .from('episodes')
                .select('id, sources, created_at')
                .eq('movie_id', movie.id);
            
            const currentCount = eps ? eps.length : 0;
            let needsSync = false;
            let reason = '';

            // Điều kiện 1: Phim bộ chưa đủ số tập
            if (movie.type === 'series' && movie.total_episodes > 0 && currentCount < movie.total_episodes) {
                needsSync = true;
                reason = `mới có ${currentCount}/${movie.total_episodes} tập`;
            }

            // Điều kiện 2: Phim đang chờ duyệt (phim trailer, cần check xem đã ra mắt chưa)
            if (!needsSync && movie.status === 'pending') {
                needsSync = true;
                reason = `đang chờ duyệt (trailer)`;
            }

            // Điều kiện 3: Phim đã có tập, nhưng tập đó bị RỖNG nguồn video (0 sources, hoặc sources rỗng)
            if (!needsSync && eps && eps.length > 0) {
                const hasEmptySources = eps.some(ep => !ep.sources || ep.sources.length === 0 || !ep.sources.some(s => s.source));
                if (hasEmptySources) {
                    needsSync = true;
                    reason = `có tập bị rỗng video`;
                }
            }

            // Điều kiện 4: Phim đã Full tập, nhưng có tập vừa ra trong vòng grace period ngày qua (Cần quét theo dõi để lấy nguồn Server tải chậm)
            if (!needsSync && eps && eps.length > 0) {
                const gracePeriodAgo = Date.now() - (GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000); // Mốc GRACE_PERIOD_DAYS ngày trước
                const hasRecentEps = eps.some(ep => ep.created_at && (new Date(ep.created_at).getTime() > gracePeriodAgo));
                if (hasRecentEps) {
                    needsSync = true;
                    reason = `đang trong ${GRACE_PERIOD_DAYS} ngày ngóng chờ Nguồn dự phòng (Grace Period)`;
                }
            }

            if (needsSync) {
                moviesNeedSync.push({ ...movie, currentEps: currentCount });
                logOut(`Đưa vào hàng chờ: "${movie.title}" - Lý do: ${reason}`, 'info');
            }
        }

        if (!moviesNeedSync.length) {
            logOut('✅ Tất cả phim đã đủ tập, không cần sync.', 'success');
            // Vẫn lưu timestamp để reset cooldown
            const syncData = { timestamp: Date.now(), totalAdded: 0, movieCount: 0, checkedCount: movies.length };
            await supabase.from('app_configs').upsert({ key: CONFIG_KEY, value: syncData, updated_at: new Date().toISOString() });
            _updateAutoSyncLastInfo(syncData);
            return;
        }

        let totalAdded = 0;
        const syncTelegramReports = [];

        if (isManual) _showImportProgress(0, moviesNeedSync.length, 'Bắt đầu quét...');
        let doneScan = 0;

        // 5. Sync từng phim chưa đủ tập — QUÉT TẤT CẢ PROVIDERS CHO MỖI PHIM
        for (const movie of moviesNeedSync) {
            doneScan++;
            if (isManual) _showImportProgress(doneScan, moviesNeedSync.length, `Đang xử lý: ${movie.title}`);

            // ★ Kiểm tra tạm dừng / hủy
            if (await _checkTestPauseCancel()) { _addImportLog('🛑 Sync bị hủy giữa chừng.', 'error'); break; }

            // Trích slug từ api_url_backup
            const slug = movie.api_url_backup.startsWith('http')
                ? movie.api_url_backup.replace(/.*\/(phim|film)\//, '').split('?')[0].replace(/\/$/, '')
                : movie.api_url_backup;

            let movieTotalAdded = 0;

            // YÊU CẦU: Luôn quét tất cả providers để bổ sung CẢ TẬP VÀ NGUỒN (Backup Server)
            // Thay vì bị giới hạn bởi provider gốc ban đầu, ta quét toàn bộ các nguồn.
            const targetProviders = new Set();
            const allKeys = Object.keys(API_PROVIDERS);
            allKeys.forEach(k => targetProviders.add(k));

            const names = Array.from(targetProviders).map(k => API_PROVIDERS[k]?.name).join(', ');
            logOut(`🎯 Phim "${movie.title}" quét đa nguồn bổ sung tập/server: [${names}]`, 'info');

            for (const key of targetProviders) {
                // ★ Kiểm tra tạm dừng / hủy giữa provider
                if (await _checkTestPauseCancel()) break;

                const provider = API_PROVIDERS[key];
                try {
                    const result = await syncEpisodesForMovie(movie.id, slug, provider);
                    if (result.added > 0) {
                        movieTotalAdded += result.added;
                        logOut(`✅ "${movie.title}": thêm ${result.added} tập từ ${provider.name}`, 'success');
                    }
                } catch (syncErr) {
                    // Provider không có phim này hoặc lỗi API → bỏ qua, tiếp tục provider khác
                    if (syncErr.message && syncErr.message.includes('404')) {
                        console.log(`[AutoSync] ℹ️ Bỏ qua ${provider.name}: không có phim "${slug}" (HTTP 404)`);
                    } else {
                        logOut(`⚠️ ${provider.name} lỗi cho "${movie.title}": ${syncErr.message}`, 'warning');
                    }
                }
                await new Promise(r => setTimeout(r, 300)); // Delay nhẹ tránh spam
            }

            totalAdded += movieTotalAdded;

            // Cập nhật versions sau khi gộp đa nguồn
            if (movieTotalAdded > 0) {
                if (typeof _syncMovieVersionsFromEpisodes === 'function') {
                    await _syncMovieVersionsFromEpisodes(movie.id);
                }
                syncTelegramReports.push({
                    title: movie.title,
                    added: movieTotalAdded,
                    current: movie.currentEps + movieTotalAdded,
                    total: movie.total_episodes
                });
            }

            await new Promise(r => setTimeout(r, 300));
        }

        // 6. Lưu timestamp vào app_configs
        const syncData = { timestamp: Date.now(), totalAdded, movieCount: moviesNeedSync.length, checkedCount: movies.length };
        await supabase.from('app_configs').upsert({ key: CONFIG_KEY, value: syncData, updated_at: new Date().toISOString() });
        _updateAutoSyncLastInfo(syncData);

        logOut(`✅ Hoàn tất: sync ${moviesNeedSync.length}/${movies.length} phim, thêm ${totalAdded} tập mới.`, 'done');
        if (isManual) _showImportProgress(moviesNeedSync.length, moviesNeedSync.length, `Hoàn tất: thêm ${totalAdded} tập`);

        if (totalAdded > 0) {
            await _sendTelegramInChunks(syncTelegramReports, (part, totalParts) => {
                return `🎬 <b>Trạm Phim Bot</b>\n\n🔄 Vừa Auto-Sync <b>${totalAdded} tập phim mới</b> ${totalParts > 1 ? `(Phần ${part}/${totalParts})` : ''}:\n\n`;
            }, true);
        }

        // 7. Refresh danh sách tập — CHỈ KHI inline editor KHÔNG đang mở
        // (tránh làm gián đoạn khi admin đang xem/chỉnh tập)
        const inlineEditor = document.getElementById('inlineEpisodeEditorContainer');
        const isEditorOpen = inlineEditor && inlineEditor.style.display !== 'none';
        if (totalAdded > 0 && !isEditorOpen && typeof selectedMovieForEpisodes !== 'undefined' && selectedMovieForEpisodes) {
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

/**
 * Helper: Chờ nếu đang tạm dừng, return false nếu bị hủy.
 * Dùng trong vòng lặp sync/import: if (await _checkTestPauseCancel()) break;
 */
async function _checkTestPauseCancel() {
    if (_importState.testCancelled) return true; // Thoát vòng lặp
    // Chờ khi bị tạm dừng (poll mỗi 500ms)
    while (_importState.testPaused && !_importState.testCancelled) {
        await new Promise(r => setTimeout(r, 500));
    }
    return _importState.testCancelled;
}

/** Hiện nút Tạm dừng / Hủy khi test đang chạy */
function _showTestControls() {
    _importState.testPaused = false;
    _importState.testCancelled = false;
    const wrap = document.getElementById('testControlsWrap');
    if (wrap) wrap.style.display = 'flex';
}

/** Ẩn nút Tạm dừng / Hủy khi test xong */
function _hideTestControls() {
    const wrap = document.getElementById('testControlsWrap');
    if (wrap) wrap.style.display = 'none';
    const pauseBtn = document.getElementById('btnTestPause');
    if (pauseBtn) { pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Tạm dừng'; pauseBtn.dataset.paused = '0'; }
}

/** Toggle tạm dừng */
function testPauseToggle() {
    const btn = document.getElementById('btnTestPause');
    if (_importState.testPaused) {
        _importState.testPaused = false;
        if (btn) btn.innerHTML = '<i class="fas fa-pause"></i> Tạm dừng';
        _addImportLog('▶️ Tiếp tục chạy...', 'info');
    } else {
        _importState.testPaused = true;
        if (btn) btn.innerHTML = '<i class="fas fa-play"></i> Tiếp tục';
        _addImportLog('⏸️ Đã tạm dừng. Nhấn "Tiếp tục" để chạy lại.', 'warning');
    }
}

/** Hủy hoàn toàn */
function testCancelNow() {
    _importState.testCancelled = true;
    _importState.testPaused = false; // Giải phóng pause loop
    _addImportLog('🛑 ĐÃ HỦY! Đang dọn dẹp...', 'error');
    if (typeof showNotification === 'function') showNotification('🛑 Đã hủy thao tác!', 'warning');
}

/* 🧪 Test Sync — Nhấn 1 lần chạy ngay, bypass cooldown */
let _testSyncRunning = false;
async function toggleTestSyncLoop() {
    if (_testSyncRunning) {
        if (typeof showNotification === 'function') showNotification('🔄 Sync đang chạy! Vui lòng đợi...', 'warning');
        return;
    }
    const btn = document.getElementById('btnTestSyncLoop');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang sync...';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.7';
    }

    _showTestControls();
    _addImportLog('===========================', 'info');
    _addImportLog('🧪 BẮT ĐẦU TEST SYNC TẬP MỚI', 'info');

    _testSyncRunning = true;
    try {
        // Reset cooldown để bypass kiểm tra 6h
        if (typeof supabase !== 'undefined') {
            await supabase.from('app_configs').upsert({ key: 'last_episode_sync', value: { timestamp: 0 }, updated_at: new Date().toISOString() });
        }
        // Chạy sync ngay (cờ isManual = true)
        if (typeof autoSyncEpisodesIfNeeded === 'function') await autoSyncEpisodesIfNeeded(true);
        if (!_importState.testCancelled) {
            if (typeof showNotification === 'function') showNotification('✅ Test sync hoàn tất!', 'success');
            _addImportLog('✅ TEST SYNC HOÀN TẤT!', 'done');
        }
    } catch (e) {
        console.error('[TestSync] Lỗi:', e);
        if (typeof showNotification === 'function') showNotification('❌ Lỗi sync: ' + e.message, 'error');
    } finally {
        _testSyncRunning = false;
        _hideTestControls();
        if (btn) {
            btn.innerHTML = '🧪 Test Sync';
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        }
    }
}

/**
 * Lưu thời gian cooldown sync do admin cài vào Supabase app_configs.
 * Key: 'auto_sync_interval_hours', value: { hours: N }
 * Giới hạn: 1-720 giờ (tối đa 30 ngày).
 */
async function saveAutoSyncInterval() {
    if (typeof supabase === 'undefined') return;
    const input = document.getElementById('autoSyncIntervalInput');
    const hours = parseInt(input?.value);

    // Đọc số ngày grace period
    const graceInput = document.getElementById('autoSyncGracePeriodInput');
    const graceDays = parseInt(graceInput?.value) || 3;

    if (!hours || hours < 1 || hours > 720) {
        if (typeof showNotification === 'function') showNotification('Số giờ không hợp lệ (1 - 720h)!', 'error');
        return;
    }
    if (graceDays < 1 || graceDays > 30) {
        if (typeof showNotification === 'function') showNotification('Số ngày theo dõi không hợp lệ (1 - 30 ngày)!', 'error');
        return;
    }
    try {
        await supabase.from('app_configs').upsert([
            {
                key: 'auto_sync_interval_hours',
                value: { hours, updatedAt: new Date().toISOString() },
                updated_at: new Date().toISOString(),
            },
            {
                key: 'auto_sync_grace_period_days',
                value: { days: graceDays, updatedAt: new Date().toISOString() },
                updated_at: new Date().toISOString(),
            }
        ]);
        if (typeof showNotification === 'function')
            showNotification(`✅ Đã lưu: tự động sync mỗi ${hours} giờ, theo dõi tập mới ${graceDays} ngày`, 'success');
    } catch (err) {
        console.error('[AutoSync] Lỗi lưu interval và ngày theo dõi:', err.message);
        if (typeof showNotification === 'function') showNotification('Lỗi khi lưu cấu hình!', 'error');
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

    // Đọc cả 4 config cùng lúc: trạng thái, lần sync cuối, số giờ, và số ngày theo dõi
    Promise.all([
        supabase.from('app_configs').select('value').eq('key', 'auto_sync_enabled').maybeSingle(),
        supabase.from('app_configs').select('value').eq('key', 'last_episode_sync').maybeSingle(),
        supabase.from('app_configs').select('value').eq('key', 'auto_sync_interval_hours').maybeSingle(),
        supabase.from('app_configs').select('value').eq('key', 'auto_sync_grace_period_days').maybeSingle(),
    ]).then(([{ data: toggleRow }, { data: syncRow }, { data: intervalRow }, { data: graceRow }]) => {
        const isEnabled = toggleRow?.value?.enabled !== false;
        _renderAutoSyncToggleBtn(isEnabled);
        if (syncRow?.value) _updateAutoSyncLastInfo(syncRow.value);
        // Hiện số giờ đã lưu vào input
        const savedHours = Number(intervalRow?.value?.hours);
        const input = document.getElementById('autoSyncIntervalInput');
        if (input && savedHours >= 1) input.value = savedHours;

        // Hiện số ngày theo dõi đã lưu
        const savedGrace = Number(graceRow?.value?.days);
        const graceInput = document.getElementById('autoSyncGracePeriodInput');
        if (graceInput && savedGrace >= 1) graceInput.value = savedGrace;

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
                const safeServerName = providerName === 'nguonc' || providerName === 'Nguồn C' ? 'NguonC' : providerName;

                // Push m3u8 nếu chưa có link này
                if (m3u8Link && !currentSources.some(s => s.source === m3u8Link)) {
                    currentSources.push({ label: mainLabel, type: 'hls', source: m3u8Link, server: safeServerName });
                    addedForThisEp++;
                }
                // Push embed nếu chưa có link này
                if (embedLink && !currentSources.some(s => s.source === embedLink)) {
                    currentSources.push({ label: mainLabel + ' dự phòng', type: 'embed', source: embedLink, server: safeServerName });
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
async function _crossFetchFromAllProviders(movieId, slug, excludeProvider, movieName = '', extraCriteria = {}) {
    const _fetchedProviders = []; // Danh sách provider gộp thành công
    if (!movieId || !slug || typeof API_PROVIDERS === 'undefined') return _fetchedProviders;

    // Nếu chưa có tên phim → thử lấy từ DB
    if (!movieName || !extraCriteria.type) {
        try {
            const { data } = await supabase.from('movies').select('title, origin_title, type, year, country, total_episodes').eq('id', movieId).single();
            movieName = movieName || data?.title || '';
            if (data) {
                if (!extraCriteria.type) extraCriteria.type = data.type?.includes('lẻ') ? 'single' : 'series';
                if (!extraCriteria.year) extraCriteria.year = data.year;
                if (!extraCriteria.countryText) extraCriteria.countryText = data.country;
                if (!extraCriteria.episode_total) extraCriteria.episode_total = data.total_episodes;
                if (!extraCriteria.origin_name) extraCriteria.origin_name = data.origin_title;
            }
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
                            const lowerName = movieName.toLowerCase().trim();
                            
                            // Gộp chung Tìm theo Slug HOẶC Tìm theo Tên
                            const potentialMatches = parsed.items.filter(i => 
                                i.slug === slug ||
                                (i.name || '').toLowerCase().trim() === lowerName ||
                                (i.origin_name || '').toLowerCase().trim() === lowerName ||
                                (extraCriteria.origin_name && (i.origin_name || '').toLowerCase().trim() === extraCriteria.origin_name.toLowerCase().trim())
                            );
                            
                            // Lấy ứng viên duy nhất (Ưu tiên trùng slug, nếu không thì trùng tên)
                            let match = potentialMatches.find(i => i.slug === slug) || potentialMatches[0];
                            if (match && match.slug) {
                                resolvedSlug = match.slug;
                                foundViaSearch = true; // Chỉ mới đánh dấu tìm được ứng viên, chưa chắc ăn 100%
                            }
                        }
                    }
                } catch (searchErr) {
                    console.warn(`[CrossFetch] Search lỗi trên ${otherProvider.name}:`, searchErr.message);
                }
                
                // NẾU ĐÃ SEARCH MÀ KHÔNG TÌM THẤY ỨNG VIÊN NÀO NỔI BẬT -> HỦY BỎ!
                if (!foundViaSearch) {
                    _addImportLog(`⚠️ ${otherProvider.name}: Không tìm thấy danh sách ứng viên phù hợp.`, 'warning');
                    continue; 
                }
            }

            // ★ BƯỚC 2: Gọi Detail API với slug ứng viên để LẤY FULL THÔNG TIN CHẤM ĐIỂM
            const url = otherProvider.buildDetailUrl(resolvedSlug);
            const res = await fetch(url);
            
            if (!res.ok) {
                _addImportLog(`⚠️ ${otherProvider.name}: Không tìm thấy api url`, 'warning');
                continue;
            }
            
            const raw = await res.json();
            const movieData = raw.movie || raw.item || raw;
            const mData = otherProvider.mapItem ? otherProvider.mapItem(movieData) : movieData;

            // ===== BỘ LỌC CHẶT CHẼ TRÁNH MERGE SAI (Áp dụng luật 3/5 dựa trên DETAIL API) =====
            let matchScore = 0;
            
            // BƯỚC 0: KIỂM TRA TÊN / SLUG
            if (mData.slug === slug) {
                matchScore++; 
            } else {
                let nameMatched = false;
                const lowerName = movieName?.toLowerCase().trim();
                if (mData.name && lowerName && mData.name.toLowerCase().trim() === lowerName) nameMatched = true;
                if (!nameMatched && mData.origin_name && lowerName && (mData.origin_name.toLowerCase().trim() === lowerName || mData.origin_name.toLowerCase().trim() === (extraCriteria.origin_name || '').toLowerCase().trim())) nameMatched = true;
                
                if (!nameMatched) {
                    _addImportLog(`⚠️ ${otherProvider.name}: Tên hoặc tên gốc không khớp. Đã chặn gộp.`, 'warning');
                    continue;
                }
                matchScore++; 
            }
            
            // 1. Phải CÙNG LOẠI
            if (extraCriteria.type && mData.type) {
                const isC1Series = extraCriteria.type === 'series' || extraCriteria.type === 'tvshows' || extraCriteria.type === 'hoathinh' || extraCriteria.type === 'bộ';
                const isC2Series = mData.type === 'series' || mData.type === 'tvshows' || mData.type === 'hoathinh' || mData.type === 'bộ';
                if (isC1Series === isC2Series) matchScore++;
            }
            
            // 2. CÙNG QUỐC GIA
            if (extraCriteria.countryText && mData.country) {
                const c1 = extraCriteria.countryText.toLowerCase();
                const c2 = mData.country.toLowerCase();
                const c1Arr = c1.split(',').map(s=>s.trim()).filter(Boolean);
                const c2Arr = c2.split(',').map(s=>s.trim()).filter(Boolean);
                const hasCommonCountry = c1Arr.some(c => c2.includes(c)) || c2Arr.some(c => c1.includes(c));
                
                if (hasCommonCountry) {
                    matchScore++;
                } else {
                    _addImportLog(`⚠️ ${otherProvider.name}: Khác quốc gia hoàn toàn. Đã chặn gộp phim Remake.`, 'warning');
                    continue;
                }
            }
            
            // 3. Phải CÙNG NĂM
            if (extraCriteria.year && mData.year) {
                const eYear = Number(extraCriteria.year);
                const iYear = Number(mData.year);
                if (eYear === iYear) {
                    matchScore++;
                } else if (Math.abs(eYear - iYear) > 1) {
                    _addImportLog(`⚠️ ${otherProvider.name}: Lệch năm phát hành (${eYear} vs ${iYear}). Đã chặn gộp.`, 'warning');
                    continue;
                }
            }
            
            // 4. KIỂM TRA TỔNG TẬP
            if (extraCriteria.episode_total && mData.episode_total) {
                const iVal = parseInt(mData.episode_total) || 0;
                const eVal = Number(extraCriteria.episode_total) || 0;
                if (eVal > 0 && iVal > 0) {
                    if (Math.abs(eVal - iVal) > 5) {
                        _addImportLog(`⚠️ ${otherProvider.name}: Phim bị lệch tổng số tập quá mức (${iVal} vs ${eVal}). Đã chặn gộp.`, 'warning');
                        continue;
                    }
                    if (eVal === iVal) matchScore++;
                }
            }

            // Luật 3/5: Tuyệt đối tránh gộp râu ông nọ cắm cằm bà kia
            if (matchScore < 3) {
                _addImportLog(`⚠️ ${otherProvider.name}: Không khớp tiêu chí (Điểm ${matchScore}/5). Đã chặn gộp.`, 'warning');
                continue;
            }

            _addImportLog(`✅ Xác nhận khớp ứng viên đáng tin cậy: "${mData.name || resolvedSlug}"`, 'success');

            // --- Lấy ds episodes ---
            const apiEpisodes = raw.episodes || movieData.episodes || [];
            if (!apiEpisodes.length) {
                _addImportLog(`⚠️ ${otherProvider.name}: Phim chưa upload list tập nào.`, 'warning');
                continue;
            }

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

/* ═══════════════════════════════════════════════════════════════
   AUTO-IMPORT PHIM MỚI TỪ NGUỒN API
   Tự động poll API KKPhim endpoint "phim-moi-cap-nhat",
   so sánh slug với DB, import phim chưa có kèm cross-fetch 3 nguồn.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Kiểm tra và auto-import phim mới nếu đủ điều kiện (cooldown + toggle ON).
 * Chỉ import phim MỚI RA MẮT (year >= năm hiện tại - 1).
 * Gọi khi admin page load hoặc khi bấm Test.
 */
let _autoImportRunning = false; // Guard chống chạy trùng

async function autoImportNewMoviesIfNeeded() {
    if (typeof supabase === 'undefined') return;
    // Guard: chặn chạy song song (admin.js + data.js cùng gọi)
    if (_autoImportRunning) { console.log('[AutoImport] ⏭️ Đã đang chạy, bỏ qua.'); return; }
    _autoImportRunning = true;

    try { await _runAutoImport(false); } finally { _autoImportRunning = false; }
}

/**
 * Nút bấm Test Auto-Import (bỏ qua cooldown)
 */
window.testAutoImportNow = async function() {
    if (_autoImportRunning) {
        if (typeof showNotification === 'function') showNotification('🔄 Auto-Import đang chạy! Vui lòng đợi...', 'warning');
        return;
    }
    const btn = document.getElementById('btnTestAutoImport');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang quét...';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.7';
    }
    
    _showTestControls();
    _addImportLog('===========================', 'info');
    _addImportLog('🧪 BẮT ĐẦU TEST AUTO-IMPORT', 'info');
    
    _autoImportRunning = true;
    try { 
        await _runAutoImport(true);
        if (!_importState.testCancelled) {
            _addImportLog('✅ TEST AUTO-IMPORT HOÀN TẤT!', 'done');
        }
    } catch(e) {
        console.error(e);
        if (typeof showNotification === 'function') showNotification('❌ Lỗi: ' + e.message, 'error');
    } finally { 
        _autoImportRunning = false;
        _hideTestControls();
        if (btn) {
            btn.innerHTML = '<i class="fas fa-magic"></i> Test Import';
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        }
    }
};

async function _runAutoImport(force = false) {
    // 1. Kiểm tra toggle bật/tắt từ app_configs (nếu không force)
    if (!force) {
        try {
            const { data: toggleRow } = await supabase
                .from('app_configs')
                .select('value')
                .eq('key', 'auto_import_enabled')
                .maybeSingle();
            const isEnabled = toggleRow?.value?.enabled !== false;
            if (!isEnabled) {
                console.log('[AutoImport] ⏸️ Đã tắt bởi admin.');
                return;
            }
        } catch (_) {}
    }

    // 2. Đọc cooldown từ app_configs (mặc định 6h)
    let COOLDOWN_HOURS = 6;
    try {
        const { data: intervalRow } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'auto_import_interval_hours')
            .maybeSingle();
        const saved = Number(intervalRow?.value?.hours);
        if (saved >= 1 && saved <= 720) COOLDOWN_HOURS = saved;
    } catch (_) {}

    // 3. Đọc giới hạn phim/lần (mặc định 10)
    let MAX_PER_RUN = 10;
    try {
        const { data: maxRow } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'auto_import_max_per_run')
            .maybeSingle();
        const savedMax = Number(maxRow?.value?.max);
        if (savedMax >= 1 && savedMax <= 50) MAX_PER_RUN = savedMax;
    } catch (_) {}

    const CONFIG_KEY = 'last_auto_import';
    
    // 3b. Đọc năm cần import (mặc định năm hiện tại)
    let TARGET_YEAR = new Date().getFullYear();
    try {
        const { data: yearRow } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'auto_import_target_year')
            .maybeSingle();
        const savedYear = Number(yearRow?.value?.year);
        if (savedYear >= 1900 && savedYear <= 2100) TARGET_YEAR = savedYear;
    } catch (_) {}

    const currentYear = new Date().getFullYear();

    try {
        // 4. Kiểm tra cooldown (nếu không force)
        const { data: configRow } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', CONFIG_KEY)
            .maybeSingle();

        const lastImport = configRow?.value?.timestamp || 0;
        const hoursSinceLast = (Date.now() - lastImport) / (1000 * 60 * 60);

        if (!force && hoursSinceLast < COOLDOWN_HOURS) {
            console.log(`[AutoImport] ⏱️ Bỏ qua — lần import cuối ${hoursSinceLast.toFixed(1)}h trước (cooldown ${COOLDOWN_HOURS}h).`);
            _updateAutoImportLastInfo(configRow?.value);
            return;
        }

        if (force) {
            console.log('[AutoImport] 🧪 FORCE RUN: Bỏ qua kiểm tra thời gian.');
            _addImportLog('🧪 Chạy ép buộc: Bỏ qua kiểm tra thời gian cooldown.', 'info');
        }

        console.log('[AutoImport] 🎬 Chủ động quét phim mới từ 3 nguồn API...');

        // 5. ★ CHỦ ĐỘNG QUÉT 3 NGUỒN: KKPhim, OPhim, NguonC
        const candidates = []; // Phim đạt tiêu chuẩn: năm nay + cập nhật gần đây
        const seenSlugs = new Set();
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        let totalScanned = 0;

        // Danh sách endpoint "phim mới cập nhật" của từng nguồn
        const SCAN_SOURCES = [
            { name: 'KKPhim',  url: 'https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1', providerId: 'kkphim' },
            { name: 'KKPhim',  url: 'https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=2', providerId: 'kkphim' },
            { name: 'OPhim',   url: 'https://ophim1.com/danh-sach/phim-moi-cap-nhat?page=1',  providerId: 'ophim' },
            { name: 'NguonC',  url: 'https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=1', providerId: 'nguonc' },
        ];

        for (const source of SCAN_SOURCES) {
            try {
                const res = await fetch(source.url);
                if (!res.ok) { console.warn(`[AutoImport] ⚠️ ${source.name}: HTTP ${res.status}`); continue; }
                const data = await res.json();
                // Lấy items: KKPhim/OPhim dùng data.items, NguonC dùng data.items hoặc data.data
                const items = data.items || data.data || [];
                let addedFromSource = 0;

                items.forEach(item => {
                    totalScanned++;
                    const slug = item.slug;
                    if (!slug || seenSlugs.has(slug)) return;
                    seenSlugs.add(slug);

                    let movieYear = Number(item.year) || 0;
                    if (!movieYear && item.category) {
                        // NguonC: tìm năm trong category groups
                        for (const key of Object.keys(item.category)) {
                            const group = item.category[key];
                            if (group?.group?.name === 'Năm' && group.list?.length) {
                                movieYear = parseInt(group.list[0].name) || 0;
                            }
                        }
                    }

                    // ★ Điều kiện: Phim thuộc năm mục tiêu do Admin cài đặt
                    if (movieYear === TARGET_YEAR) {
                        const modTimeStr = item.modified?.time || new Date().toISOString();
                        candidates.push({
                            slug,
                            year: movieYear,
                            modifiedTime: modTimeStr,
                            source: source.providerId,
                        });
                        addedFromSource++;
                    }
                });

                console.log(`[AutoImport] 📡 ${source.name}: ${items.length} phim, +${addedFromSource} đạt tiêu chuẩn`);

            } catch (e) {
                console.warn(`[AutoImport] ⚠️ ${source.name}: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 400));
        }

        // 6. Sắp xếp: phim cập nhật gần nhất → import trước
        candidates.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());

        console.log(`[AutoImport] 📋 Quét ${totalScanned} phim từ 3 nguồn → ${candidates.length} phim năm ${TARGET_YEAR}`);

        if (!candidates.length) {
            console.log('[AutoImport] ✅ Không tìm thấy phim mới ra mắt cần import.');
            const syncData = { timestamp: Date.now(), added: 0, checked: totalScanned, filtered: 0 };
            await supabase.from('app_configs').upsert({ key: CONFIG_KEY, value: syncData, updated_at: new Date().toISOString() });
            _updateAutoImportLastInfo(syncData);
            return;
        }

        const candidateSlugs = candidates.map(i => i.slug);

        // 7. Kiểm tra slug nào chưa có trong DB
        // Supabase .in() giới hạn ~ 200 items, chia batch nếu cần
        let allExistingSlugs = new Set();
        for (let i = 0; i < candidateSlugs.length; i += 100) {
            const batch = candidateSlugs.slice(i, i + 100);
            const { data: existingBatch } = await supabase
                .from('movies')
                .select('slug')
                .in('slug', batch);
            (existingBatch || []).forEach(m => allExistingSlugs.add(m.slug));
        }

        const newCandidates = candidates.filter(c => !allExistingSlugs.has(c.slug));

        if (!newCandidates.length) {
            console.log('[AutoImport] ✅ Tất cả phim đã có trong DB, không cần import.');
            const syncData = { timestamp: Date.now(), added: 0, checked: totalScanned, filtered: candidates.length };
            await supabase.from('app_configs').upsert({ key: CONFIG_KEY, value: syncData, updated_at: new Date().toISOString() });
            _updateAutoImportLastInfo(syncData);
            return;
        }

        // 8. Không cắt cứng mảng, lặp đến khi đủ số lượng cài đặt
        console.log(`[AutoImport] 🚀 Cố gắng import đạt đủ chỉ tiêu ${MAX_PER_RUN} phim mới...`);

        // 9. Import từng phim (tuần tự, chống trùng bằng tracking Set)
        let importedCount = 0;
        const importedSlugsThisRun = new Set(); // ★ Theo dõi slug đã import trong run này
        const telegramReports = []; // ★ Theo dõi chi tiết phim đã import cho Telegram

        for (const item of newCandidates) {
            // Khi đã Import ĐỦ số lượng chỉ tiêu cài đặt -> dừng
            if (importedCount >= MAX_PER_RUN) break;
            // ★ Kiểm tra tạm dừng / hủy
            if (await _checkTestPauseCancel()) { _addImportLog('🛑 Import bị hủy giữa chừng.', 'error'); break; }

            const slug = item.slug;
            const source = item.source || 'kkphim';

            // ★ Chống trùng lớp 1: skip nếu đã import trong run này
            if (importedSlugsThisRun.has(slug)) {
                console.log(`[AutoImport] ⏭️ Skip "${slug}" — đã xử lý trong run này`);
                continue;
            }

            // ★ Chống trùng lớp 2: re-check DB ngay trước import (tránh race condition)
            try {
                const existId = await _checkMovieExistsBySlug(slug);
                if (existId) {
                    console.log(`[AutoImport] 🔁 Đã có trong DB: "${slug}"`);
                    importedSlugsThisRun.add(slug);
                    continue;
                }
            } catch (_) {}

            try {
                const result = await importSingleMovieFromApi(slug, { silent: true, providerId: source });
                importedSlugsThisRun.add(slug); // Đánh dấu đã xử lý

                if (result.success) {
                    importedCount++;
                    console.log(`[AutoImport] ✅ Import: "${slug}" (từ ${source})`);
                    if (result.telegramStats) telegramReports.push(result.telegramStats);
                } else if (result.duplicate) {
                    console.log(`[AutoImport] 🔁 Đã có: "${slug}"`);
                } else {
                    console.warn(`[AutoImport] ❌ Lỗi: "${slug}" — ${result.message}`);
                }
            } catch (e) {
                console.warn(`[AutoImport] ❌ Exception: "${slug}" — ${e.message}`);
                importedSlugsThisRun.add(slug); // Đánh dấu để không retry
            }
            await new Promise(r => setTimeout(r, 800)); // Delay tránh spam API
        }

        // 10. Lưu timestamp và kết quả
        const syncData = {
            timestamp: Date.now(),
            added: importedCount,
            checked: totalScanned,
            filtered: candidates.length,
            newFound: newCandidates.length,
        };
        await supabase.from('app_configs').upsert({
            key: CONFIG_KEY,
            value: syncData,
            updated_at: new Date().toISOString(),
        });
        _updateAutoImportLastInfo(syncData);

        console.log(`[AutoImport] 🎉 Hoàn tất: import ${importedCount}/${newCandidates.length} phim mới.`);

        // 10. Refresh danh sách admin nếu có phim mới
        if (importedCount > 0) {
            _refreshAdminLists();
            if (typeof notifyDataChange === 'function') await notifyDataChange('movies');
            await _sendTelegramInChunks(telegramReports, (part, totalParts) => {
                return `🎬 <b>Trạm Phim Bot</b>\n\n🔄 Vừa Auto-Import thành công <b>${importedCount} phim mới</b> ${totalParts > 1 ? `(Phần ${part}/${totalParts})` : ''}:\n\n`;
            }, false);
        }

    } catch (err) {
        console.warn('[AutoImport] Lỗi:', err.message);
    }
}

/**
 * Cập nhật thông tin "import lần cuối" hiển thị trên UI.
 */
function _updateAutoImportLastInfo(data) {
    const el = document.getElementById('autoImportLastInfo');
    if (!el || !data) return;
    const ts = data.timestamp ? new Date(data.timestamp) : null;
    if (!ts) { el.textContent = ''; return; }
    const timeStr = `${String(ts.getDate()).padStart(2,'0')}-${String(ts.getMonth()+1).padStart(2,'0')} ${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`;
    el.textContent = `Sync lúc ${timeStr} | +${data.added || 0} phim`;
    el.title = `Đã quét: ${data.checked || 0} phim | Mới: ${data.newFound || 0} | Thêm: ${data.added || 0}`;
}

/**
 * Bật/tắt tính năng Auto-Import phim mới.
 * Lưu trạng thái vào Supabase app_configs (key: auto_import_enabled).
 */
async function toggleAutoImportFeature() {
    if (typeof supabase === 'undefined') return;
    const btn = document.getElementById('btnToggleAutoImport');
    try {
        const { data: toggleRow } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'auto_import_enabled')
            .maybeSingle();
        const currentState = toggleRow?.value?.enabled !== false;
        const newState = !currentState;

        await supabase.from('app_configs').upsert({
            key: 'auto_import_enabled',
            value: { enabled: newState, updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString(),
        });

        _renderAutoImportToggleBtn(newState);
        if (typeof showNotification === 'function') {
            showNotification(
                newState ? '✅ Đã bật Auto-Import phim mới' : '⏸️ Đã tắt Auto-Import phim mới',
                newState ? 'success' : 'info'
            );
        }
    } catch (err) {
        console.error('[AutoImport] Lỗi đổi trạng thái:', err.message);
    }
}

/**
 * Lưu cài đặt Auto-Import: interval giờ + giới hạn phim/lần.
 */
async function saveAutoImportSettings() {
    if (typeof supabase === 'undefined') return;
    const inputHours = document.getElementById('autoImportIntervalInput');
    const inputMax = document.getElementById('autoImportMaxInput');
    const inputYear = document.getElementById('autoImportYearInput');
    
    const hours = parseInt(inputHours?.value);
    const max = parseInt(inputMax?.value);
    const year = parseInt(inputYear?.value);

    if (!hours || hours < 1 || hours > 720) {
        if (typeof showNotification === 'function') showNotification('Số giờ không hợp lệ (1 - 720h)!', 'error');
        return;
    }
    if (!max || max < 1 || max > 50) {
        if (typeof showNotification === 'function') showNotification('Số phim không hợp lệ (1 - 50)!', 'error');
        return;
    }
    if (!year || year < 1900 || year > 2100) {
        if (typeof showNotification === 'function') showNotification('Năm không hợp lệ (1900 - 2100)!', 'error');
        return;
    }
    try {
        await Promise.all([
            supabase.from('app_configs').upsert({
                key: 'auto_import_interval_hours',
                value: { hours, updatedAt: new Date().toISOString() },
                updated_at: new Date().toISOString(),
            }),
            supabase.from('app_configs').upsert({
                key: 'auto_import_max_per_run',
                value: { max, updatedAt: new Date().toISOString() },
                updated_at: new Date().toISOString(),
            }),
            supabase.from('app_configs').upsert({
                key: 'auto_import_target_year',
                value: { year, updatedAt: new Date().toISOString() },
                updated_at: new Date().toISOString(),
            }),
        ]);
        if (typeof showNotification === 'function')
            showNotification(`✅ Đã lưu: import phim năm ${year} mỗi ${hours}h, max ${max} phim`, 'success');
    } catch (err) {
        console.error('[AutoImport] Lỗi lưu settings:', err.message);
        if (typeof showNotification === 'function') showNotification('Lỗi khi lưu!', 'error');
    }
}

/**
 * Render trạng thái nút toggle Auto-Import (ON/OFF).
 */
function _renderAutoImportToggleBtn(isEnabled) {
    const btn = document.getElementById('btnToggleAutoImport');
    if (!btn) return;
    btn.textContent = isEnabled ? 'ON' : 'OFF';
    btn.style.background = isEnabled
        ? 'linear-gradient(135deg,#a78bfa,#7c3aed)'
        : 'rgba(255,255,255,0.1)';
    btn.style.color = isEnabled ? '#fff' : 'var(--text-muted)';
}

/**
 * Khởi tạo trạng thái toggle Auto-Import khi toolbar hiện ra.
 * Đọc trạng thái từ Supabase app_configs.
 */
function initAutoImportToggleUI() {
    if (typeof supabase === 'undefined') return;
    _renderAutoImportToggleBtn(true);
    const btn = document.getElementById('btnToggleAutoImport');
    if (btn) btn.disabled = true;

    Promise.all([
        supabase.from('app_configs').select('value').eq('key', 'auto_import_enabled').maybeSingle(),
        supabase.from('app_configs').select('value').eq('key', 'last_auto_import').maybeSingle(),
        supabase.from('app_configs').select('value').eq('key', 'auto_import_interval_hours').maybeSingle(),
        supabase.from('app_configs').select('value').eq('key', 'auto_import_max_per_run').maybeSingle(),
        supabase.from('app_configs').select('value').eq('key', 'auto_import_target_year').maybeSingle(),
        supabase.from('app_configs').select('value').eq('key', 'auto_fill_target').maybeSingle(),
    ]).then(([{ data: toggleRow }, { data: importRow }, { data: intervalRow }, { data: maxRow }, { data: yearRow }, { data: fillRow }]) => {
        const isEnabled = toggleRow?.value?.enabled !== false;
        _renderAutoImportToggleBtn(isEnabled);
        if (importRow?.value) _updateAutoImportLastInfo(importRow.value);

        // Hiện số giờ + max phim + year đã lưu
        const savedHours = Number(intervalRow?.value?.hours);
        const inputH = document.getElementById('autoImportIntervalInput');
        if (inputH && savedHours >= 1) inputH.value = savedHours;

        const savedMax = Number(maxRow?.value?.max);
        const inputM = document.getElementById('autoImportMaxInput');
        if (inputM && savedMax >= 1) inputM.value = savedMax;

        const savedYear = Number(yearRow?.value?.year);
        const inputY = document.getElementById('autoImportYearInput');
        if (inputY && savedYear >= 1900) inputY.value = savedYear;

        // Khôi phục Auto-Fill target đã lưu
        const savedFillTarget = Number(fillRow?.value?.target);
        const inputFill = document.getElementById('autoFillTargetInput');
        if (inputFill && savedFillTarget >= 1) inputFill.value = savedFillTarget;

        // Tải config chặn quốc gia
        _loadExcludeCountrySettings();
        
        // Tải config Telegram
        _loadTelegramConfig();

        if (btn) btn.disabled = false;
    }).catch(() => {
        _renderAutoImportToggleBtn(true);
        if (btn) btn.disabled = false;
    });
}
/** ─── CẤU HÌNH LỌC QUỐC GIA ─── */
let _lastExcludeToggleTime = 0;

async function _loadExcludeCountrySettings() {
    try {
        const { data: exRow } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'api_exclude_country')
            .maybeSingle();

        if (exRow && exRow.value) {
            _importState.excludeCountryEnabled = exRow.value.enabled === true;
            if (exRow.value.text !== undefined) _importState.excludeCountryText = exRow.value.text;
        }

        const btn = document.getElementById('btnToggleExcludeCountry');
        if (btn) {
            if (_importState.excludeCountryEnabled) {
                btn.innerHTML = 'ON';
                btn.style.background = '#ff6b6b';
                btn.style.color = '#fff';
            } else {
                btn.innerHTML = 'OFF';
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.color = '#ff6b6b';
            }
        }
        renderExcludeCountryTags();
    } catch (e) { console.warn('Lỗi load exclude country:', e); }
}

function toggleExcludeCountryFeature() {
    _importState.excludeCountryEnabled = !_importState.excludeCountryEnabled;
    const btn = document.getElementById('btnToggleExcludeCountry');
    if (btn) {
        if (_importState.excludeCountryEnabled) {
            btn.innerHTML = 'ON';
            btn.style.background = '#ff6b6b';
            btn.style.color = '#fff';
        } else {
            btn.innerHTML = 'OFF';
            btn.style.background = 'rgba(255,255,255,0.1)';
            btn.style.color = '#ff6b6b';
        }
    }
    saveExcludeCountrySettings(false); // Lưu ngầm, không hiện thông báo

    // Hiện thông báo nhưng có khoảng lùi 1.5s để chống spam
    const now = Date.now();
    if (now - _lastExcludeToggleTime > 1500) {
        _lastExcludeToggleTime = now;
        if (typeof showNotification === 'function') {
            const msg = _importState.excludeCountryEnabled ? '🚫 Đã BẬT chặn quốc gia' : '✅ Đã TẮT chặn quốc gia';
            showNotification(msg, _importState.excludeCountryEnabled ? 'warning' : 'info');
        }
    }
}

function renderExcludeCountryTags() {
    const container = document.getElementById('excludeCountryTags');
    if (!container) return;
    container.innerHTML = '';
    
    // Parse chuỗi thành mảng
    const tags = _importState.excludeCountryText.split(',').map(s => s.trim()).filter(Boolean);
    
    if (tags.length === 0) {
        container.innerHTML = '<span style="font-size:0.7rem;color:rgba(255,255,255,0.3);font-style:italic;">Chưa có</span>';
        return;
    }

    tags.forEach((tag, index) => {
        const chip = document.createElement('div');
        chip.style.cssText = 'background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:2px 8px; font-size:0.7rem; color:#fff; display:flex; align-items:center; gap:4px; transition:all 0.2s;';
        
        chip.innerHTML = `
            <span>${tag}</span>
            <i class="fas fa-times" style="cursor:pointer;opacity:0.6;font-size:0.65rem;" onclick="removeExcludeCountryTag(${index})" onmouseover="this.style.opacity='1';this.style.color='#ff6b6b';" onmouseout="this.style.opacity='0.6';this.style.color='';"></i>
        `;
        container.appendChild(chip);
    });
}

window.addExcludeCountryTag = function() {
    const input = document.getElementById('excludeCountryInput');
    if (!input) return;
    const newTag = input.value.trim();
    if (!newTag) return;
    
    let tags = _importState.excludeCountryText.split(',').map(s => s.trim()).filter(Boolean);
    // Tránh trùng lặp
    if (!tags.some(t => t.toLowerCase() === newTag.toLowerCase())) {
        tags.push(newTag);
        _importState.excludeCountryText = tags.join(', ');
        renderExcludeCountryTags();
        saveExcludeCountrySettings(false); // Auto-save ngầm
        if (typeof showNotification === 'function') showNotification(`Đã thêm chặn: ${newTag}`, 'success');
    } else {
        if (typeof showNotification === 'function') showNotification('Quốc gia này đã có!', 'warning');
    }
    input.value = ''; // Reset input/select
};

window.removeExcludeCountryTag = function(index) {
    let tags = _importState.excludeCountryText.split(',').map(s => s.trim()).filter(Boolean);
    if (index >= 0 && index < tags.length) {
        const removedTag = tags[index];
        tags.splice(index, 1);
        _importState.excludeCountryText = tags.join(', ');
        renderExcludeCountryTags();
        saveExcludeCountrySettings(false); // Auto-save ngầm
        if (typeof showNotification === 'function') showNotification(`Đã xóa khỏi chặn: ${removedTag}`, 'info');
    }
};

async function saveExcludeCountrySettings(showToast = true) {
    if (typeof supabase === 'undefined') return;

    try {
        await supabase.from('app_configs').upsert({
            key: 'api_exclude_country',
            value: {
                enabled: _importState.excludeCountryEnabled,
                text: _importState.excludeCountryText
            },
            updated_at: new Date().toISOString()
        });
        if (showToast && typeof showNotification === 'function') {
            showNotification('Đã lưu cấu hình chặn quốc gia!', 'success');
        }
    } catch (e) {
        console.warn('Lỗi lưu cấu hình chặn quốc gia', e);
        if (showToast && typeof showNotification === 'function') showNotification('Lỗi lưu cấu hình chặn quốc gia', 'error');
    }
}

/* ================================================================
   AUTO-FILL: Tự động quét và thêm phim cho đủ mục tiêu
   - Admin đặt số phim MỚI cần thêm (VD: 100)
   - Hệ thống phân trang liên tục 3 nguồn API cho đến khi đủ
   - Có nút Tạm dừng / Hủy
   - Áp dụng mọi quy tắc lọc hiện có (năm, quốc gia, chống trùng)
   ================================================================ */

const _autoFillState = {
    isRunning: false,
    isPaused: false,
    isCancelled: false,
    targetCount: 0,
    importedCount: 0,
    skippedCount: 0,
    scannedMovies: 0,
    currentSource: '',
    currentPage: 0,
    telegramReports: [],
};

/**
 * Bắt đầu Auto-Fill: import phim mới cho đến khi đạt mục tiêu
 */
async function startAutoFill() {
    if (_autoFillState.isRunning) {
        if (typeof showNotification === 'function') showNotification('Auto-Fill đang chạy rồi!', 'warning');
        return;
    }

    const targetInput = document.getElementById('autoFillTargetInput');
    const target = parseInt(targetInput?.value) || 50;
    if (target < 1 || target > 500) {
        if (typeof showNotification === 'function') showNotification('Mục tiêu phải từ 1 - 500 phim!', 'error');
        return;
    }

    // Reset state
    _autoFillState.isRunning = true;
    _autoFillState.isPaused = false;
    _autoFillState.isCancelled = false;
    _autoFillState.targetCount = target;
    _autoFillState.importedCount = 0;
    _autoFillState.skippedCount = 0;
    _autoFillState.scannedMovies = 0;
    _autoFillState.currentSource = '';
    _autoFillState.currentPage = 0;
    _autoFillState.telegramReports = [];

    // UI: hiện nút Tạm dừng / Hủy, ẩn nút Bắt đầu
    _updateAutoFillUI('running');

    // Lưu mục tiêu vào DB để lần sau mở lại vẫn giữ
    try {
        await supabase.from('app_configs').upsert({
            key: 'auto_fill_target',
            value: { target, updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString(),
        });
    } catch (_) {}

    _addImportLog(`🚀 Auto-Fill: Bắt đầu import ${target} phim mới...`, 'info');

    // Đọc cấu hình: năm mục tiêu
    let TARGET_YEAR = new Date().getFullYear();
    try {
        const { data: yearRow } = await supabase.from('app_configs').select('value').eq('key', 'auto_import_target_year').maybeSingle();
        const savedYear = Number(yearRow?.value?.year);
        if (savedYear >= 1900 && savedYear <= 2100) TARGET_YEAR = savedYear;
    } catch (_) {}

    // ★ TỐI ƯU: Tải toàn bộ slug đã có trong DB vào bộ nhớ để skip siêu nhanh
    _addImportLog(`📦 Đang tải danh sách phim đã có trong DB...`, 'info');
    const existingSlugs = new Set();
    try {
        let from = 0;
        const BATCH = 1000;
        while (true) {
            const { data: batch } = await supabase.from('movies').select('slug').range(from, from + BATCH - 1);
            if (!batch || batch.length === 0) break;
            batch.forEach(m => existingSlugs.add(m.slug));
            if (batch.length < BATCH) break;
            from += BATCH;
        }
    } catch (e) { console.warn('[Auto-Fill] Lỗi tải slug cache:', e.message); }
    _addImportLog(`📦 Đã cache ${existingSlugs.size} slug từ DB. Bắt đầu quét API...`, 'info');

    // Danh sách endpoint phân trang cho 3 nguồn
    const SOURCES = [
        {
            name: 'KKPhim', id: 'kkphim',
            buildUrl: (page) => `https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${page}`,
            getItems: (data) => data.items || [],
            getTotalPages: (data) => data.pagination?.totalPages || data.params?.pagination?.totalPages || 50,
        },
        {
            name: 'OPhim', id: 'ophim',
            buildUrl: (page) => `https://ophim1.com/danh-sach/phim-moi-cap-nhat?page=${page}`,
            getItems: (data) => data.items || [],
            getTotalPages: (data) => data.pagination?.totalPages || data.params?.pagination?.totalPages || 50,
        },
        {
            name: 'NguonC', id: 'nguonc',
            buildUrl: (page) => `https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=${page}`,
            getItems: (data) => data.items || data.data || [],
            getTotalPages: (data) => data.paginate?.total_page || 50,
        },
    ];

    const seenSlugs = new Set(); // Chống trùng slug giữa các nguồn

    // Vòng lặp chính: quét từng nguồn, phân trang liên tục
    for (const source of SOURCES) {
        if (_autoFillState.isCancelled) break;
        if (_autoFillState.importedCount >= target) break;

        _autoFillState.currentSource = source.name;
        let page = 1;
        let maxPage = 50;

        while (page <= maxPage) {
            if (_autoFillState.isCancelled) break;
            if (_autoFillState.importedCount >= target) break;

            // Kiểm tra tạm dừng
            while (_autoFillState.isPaused && !_autoFillState.isCancelled) {
                await new Promise(r => setTimeout(r, 1000));
            }
            if (_autoFillState.isCancelled) break;

            _autoFillState.currentPage = page;
            _updateAutoFillProgressUI();

            try {
                const url = source.buildUrl(page);
                _addImportLog(`📡 [Auto-Fill] ${source.name} trang ${page}...`, 'info');
                const res = await fetch(url);
                if (!res.ok) {
                    _addImportLog(`⚠️ [Auto-Fill] ${source.name} trang ${page}: HTTP ${res.status}`, 'warning');
                    break;
                }

                const data = await res.json();
                const items = source.getItems(data);

                if (page === 1) {
                    maxPage = Math.min(source.getTotalPages(data), 500); // Giới hạn 500 trang
                }

                if (!items || items.length === 0) {
                    _addImportLog(`📡 [Auto-Fill] ${source.name}: Hết phim ở trang ${page}`, 'info');
                    break;
                }

                for (const item of items) {
                    if (_autoFillState.isCancelled) break;
                    if (_autoFillState.importedCount >= target) break;

                    while (_autoFillState.isPaused && !_autoFillState.isCancelled) {
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    if (_autoFillState.isCancelled) break;

                    const slug = item.slug;
                    if (!slug || seenSlugs.has(slug)) continue;
                    seenSlugs.add(slug);
                    _autoFillState.scannedMovies++;

                    // Lọc theo năm
                    let movieYear = Number(item.year) || 0;
                    if (!movieYear && item.category) {
                        for (const key of Object.keys(item.category)) {
                            const group = item.category[key];
                            if (group?.group?.name === 'Năm' && group.list?.length) {
                                movieYear = parseInt(group.list[0].name) || 0;
                            }
                        }
                    }
                    if (movieYear !== TARGET_YEAR) {
                        _autoFillState.skippedCount++;
                        continue;
                    }

                    // ★ Kiểm tra DB trùng (dùng cache Set — siêu nhanh)
                    if (existingSlugs.has(slug)) { _autoFillState.skippedCount++; continue; }

                    // Import phim
                    try {
                        const result = await importSingleMovieFromApi(slug, { silent: true, providerId: source.id, skipMerge: true });
                        if (result.success && !result.merged) {
                            // Chỉ đếm phim THẬT SỰ MỚI (ko đếm gộp nguồn vào phim cũ)
                            _autoFillState.importedCount++;
                            existingSlugs.add(slug);
                            _addImportLog(`✅ [Auto-Fill] ${_autoFillState.importedCount}/${target}: "${item.name || slug}"`, 'success');
                            if (result.telegramStats) _autoFillState.telegramReports.push(result.telegramStats);
                            _updateAutoFillProgressUI();
                        } else if (result.merged) {
                            // Phim đã có trong DB, chỉ gộp thêm link → không đếm
                            _autoFillState.skippedCount++;
                            existingSlugs.add(slug);
                        } else if (result.duplicate) {
                            _autoFillState.skippedCount++;
                        } else {
                            _addImportLog(`❌ [Auto-Fill] Lỗi "${slug}": ${result.message}`, 'error');
                        }
                    } catch (e) {
                        _addImportLog(`❌ [Auto-Fill] Exception "${slug}": ${e.message}`, 'error');
                    }

                    await new Promise(r => setTimeout(r, 600));
                }

            } catch (err) {
                _addImportLog(`⚠️ [Auto-Fill] Lỗi ${source.name} trang ${page}: ${err.message}`, 'warning');
            }

            page++;
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // === Hoàn tất ===
    const wasCancelled = _autoFillState.isCancelled;
    const imported = _autoFillState.importedCount;

    _addImportLog(wasCancelled
        ? `🛑 Auto-Fill bị hủy. Đã import ${imported}/${target} phim.`
        : `🎉 Auto-Fill hoàn tất! Đã import ${imported}/${target} phim mới.`,
        wasCancelled ? 'warning' : 'done'
    );

    if (imported > 0) {
        _refreshAdminLists();
        if (typeof notifyDataChange === 'function') await notifyDataChange('movies');

        await _sendTelegramInChunks(_autoFillState.telegramReports, (part, totalParts) => {
            return `🚀 <b>Trạm Phim Bot</b>\n\n🤖 Auto-Fill ${wasCancelled ? 'bị hủy' : 'hoàn tất'}! Đã import <b>${imported}/${target}</b> phim mới ${totalParts > 1 ? `(Phần ${part}/${totalParts})` : ''}:\n\n`;
        }, false);
    }

    _autoFillState.isRunning = false;
    _autoFillState.isPaused = false;
    _autoFillState.isCancelled = false;
    _updateAutoFillUI('idle');

    if (typeof showNotification === 'function') {
        showNotification(
            wasCancelled ? `🛑 Auto-Fill đã hủy (${imported} phim)` : `🎉 Auto-Fill xong! Đã thêm ${imported} phim mới`,
            wasCancelled ? 'warning' : 'success'
        );
    }
}

/** Tạm dừng / Tiếp tục Auto-Fill */
function pauseAutoFill() {
    if (!_autoFillState.isRunning) return;
    _autoFillState.isPaused = !_autoFillState.isPaused;
    const btn = document.getElementById('btnPauseAutoFill');
    if (btn) {
        if (_autoFillState.isPaused) {
            btn.innerHTML = '<i class="fas fa-play"></i> Tiếp tục';
            btn.style.background = 'rgba(34,197,94,0.15)';
            btn.style.borderColor = 'rgba(34,197,94,0.5)';
            btn.style.color = '#22c55e';
            _addImportLog('⏸️ Auto-Fill đã tạm dừng.', 'warning');
        } else {
            btn.innerHTML = '<i class="fas fa-pause"></i> Tạm dừng';
            btn.style.background = 'rgba(251,191,36,0.1)';
            btn.style.borderColor = 'rgba(251,191,36,0.5)';
            btn.style.color = '#fbbf24';
            _addImportLog('▶️ Auto-Fill đã tiếp tục!', 'info');
        }
    }
}

/** Hủy Auto-Fill ngay lập tức */
function cancelAutoFill() {
    if (!_autoFillState.isRunning) return;
    _autoFillState.isCancelled = true;
    _autoFillState.isPaused = false;
    _addImportLog('🛑 Đang hủy Auto-Fill...', 'error');
}

/** Cập nhật UI trạng thái Auto-Fill */
function _updateAutoFillUI(state) {
    const btnStart = document.getElementById('btnStartAutoFill');
    const btnPause = document.getElementById('btnPauseAutoFill');
    const btnCancel = document.getElementById('btnCancelAutoFill');
    const progressWrap = document.getElementById('autoFillProgressWrap');
    const targetInput = document.getElementById('autoFillTargetInput');

    if (state === 'running') {
        if (btnStart) btnStart.style.display = 'none';
        if (btnPause) { btnPause.style.display = ''; btnPause.innerHTML = '<i class="fas fa-pause"></i> Tạm dừng'; }
        if (btnCancel) btnCancel.style.display = '';
        if (progressWrap) progressWrap.style.display = 'flex';
        if (targetInput) targetInput.disabled = true;
    } else {
        if (btnStart) btnStart.style.display = '';
        if (btnPause) btnPause.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'none';
        if (targetInput) targetInput.disabled = false;
        if (_autoFillState.importedCount === 0 && progressWrap) progressWrap.style.display = 'none';
    }
}

/** Cập nhật thanh progress realtime */
function _updateAutoFillProgressUI() {
    const bar = document.getElementById('autoFillProgressBar');
    const text = document.getElementById('autoFillProgressText');
    const { importedCount, targetCount, currentSource, currentPage } = _autoFillState;
    const pct = targetCount > 0 ? Math.min(Math.round((importedCount / targetCount) * 100), 100) : 0;
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = `${importedCount}/${targetCount} (${currentSource} T.${currentPage})`;
}

/** Lưu số lượng phim Auto-Fill vào DB */
async function saveAutoFillTarget() {
    if (typeof supabase === 'undefined') return;
    const input = document.getElementById('autoFillTargetInput');
    const target = parseInt(input?.value);
    if (!target || target < 1 || target > 500) {
        if (typeof showNotification === 'function') showNotification('Số phim phải từ 1 - 500!', 'error');
        return;
    }
    try {
        await supabase.from('app_configs').upsert({
            key: 'auto_fill_target',
            value: { target, updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString(),
        });
        if (typeof showNotification === 'function') showNotification(`✅ Đã lưu: Auto-Fill ${target} phim`, 'success');
    } catch (e) {
        if (typeof showNotification === 'function') showNotification('Lỗi khi lưu!', 'error');
    }
}
