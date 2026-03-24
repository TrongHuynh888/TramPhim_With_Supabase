/* ============================================================
   ADMIN API EXPLORER — js/admin-api-explorer.js
   Dùng kiến trúc "API Provider Pattern" để dễ mở rộng
   thêm nguồn phim mới mà không cần sửa UI.
   ============================================================ */

/**
 * Registry các nguồn API phim.
 * Để thêm nguồn mới: thêm 1 object vào đây, UI sẽ tự cập nhật.
 */
const API_PROVIDERS = {
    kkphim: {
        id: 'kkphim',
        name: 'KKPhim',
        color: '#00d2ff',
        baseUrl: 'https://phimapi.com',
        badge: 'FREE',
        // Tạo URL gọi danh sách phim
        buildListUrl(params) {
            const { type, lang, year, limit, page } = params;
            let url = `${this.baseUrl}/v1/api/danh-sach/${type}?page=${page}&sort_field=modified.time&sort_type=desc&limit=${limit}`;
            if (lang) url += `&sort_lang=${lang}`;
            if (year) url += `&year=${year}`;
            return url;
        },
        // Tạo URL gọi chi tiết phim
        buildDetailUrl(slug) {
            return `${this.baseUrl}/phim/${slug}`;
        },
        // Chuẩn hóa item dữ liệu về schema chung
        mapItem(raw) {
            // Build URL ảnh: KKPhim có thể trả về URL đầy đủ hoặc chỉ path
            function buildImgUrl(url) {
                if (!url) return '';
                if (url.startsWith('http')) return url; // Đã đầy đủ
                return `https://phimimg.com/${url}`;    // Chỉ có path
            }
            return {
                slug: raw.slug,
                name: raw.name,
                origin_name: raw.origin_name || '',
                poster: buildImgUrl(raw.poster_url) || buildImgUrl(raw.thumb_url),
                thumb: buildImgUrl(raw.thumb_url),
                year: raw.year,
                type: raw.type, // 'series' | 'single'
                lang: raw.lang || '',
                status: raw.episode_current || '',
                category: (raw.category || []).map(c => c.name).join(', '),
                country: (raw.country || []).map(c => c.name).join(', '),
            };
        },
        // Chuẩn hóa dữ liệu trả về từ list endpoint KKPhim
        // KKPhim trả về: { status, msg, data: { items, params: { pagination } } }
        parseListResponse(data) {
            const d = data.data || {};
            const pagination = d.params?.pagination || {};
            return {
                items: (d.items || []).map(i => this.mapItem(i)),
                totalItems: pagination.totalItems || 0,
                totalPages: pagination.totalPages || 1,
                currentPage: pagination.currentPage || 1,
            };
        },
        // Kiểu danh sách hỗ trợ
        typeOptions: [
            { value: 'phim-bo', label: 'Phim bộ' },
            { value: 'phim-le', label: 'Phim lẻ' },
            { value: 'tv-shows', label: 'TV Shows' },
            { value: 'hoat-hinh', label: 'Hoạt hình' },
            { value: 'phim-vietsub', label: 'Vietsub' },
            { value: 'phim-thuyet-minh', label: 'Thuyết minh' },
            { value: 'phim-long-tieng', label: 'Lồng tiếng' },
        ],
    },
    // ─────────────────────────────────────────────────────────────
    // Thêm nguồn mới ở đây theo cùng cấu trúc trên. Ví dụ:
    // ophim: {
    //   id: 'ophim', name: 'OPhim', color: '#f59e0b', baseUrl: 'https://ophim1.com',
    //   buildListUrl(p) { ... }, buildDetailUrl(slug) { ... },
    //   mapItem(raw) { ... }, parseListResponse(data) { ... }, typeOptions: [...],
    // },
    // ─────────────────────────────────────────────────────────────
};

/** State nội bộ của API Explorer */
const _apiState = {
    currentProvider: 'kkphim',
    currentPage: 1,
    totalPages: 1,
    lastRawData: null,  // Lưu JSON raw để hiển thị tab JSON
    lastDetailRaw: null,
};

/**
 * Khởi tạo panel API Explorer khi admin vào tab.
 * Được gọi từ showAdminPanel().
 */
function initApiExplorer() {
    _renderProviderTabs();
    _populateYearSelect();
    _updateTypeOptions();
}

/**
 * Render các nút chọn nguồn API từ registry API_PROVIDERS.
 */
function _renderProviderTabs() {
    const container = document.getElementById('apiProviderTabs');
    if (!container) return;
    container.innerHTML = '';
    Object.values(API_PROVIDERS).forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'api-provider-btn' + (p.id === _apiState.currentProvider ? ' active' : '');
        btn.onclick = () => onApiProviderChange(p.id);
        btn.innerHTML = `
            <span class="provider-dot" style="background:${p.color};"></span>
            ${p.name}
            <span class="api-provider-badge">${p.badge || 'API'}</span>
        `;
        container.appendChild(btn);
    });
}

/**
 * Điền list năm vào select (2010 → năm hiện tại).
 */
function _populateYearSelect() {
    const sel = document.getElementById('apiYear');
    if (!sel) return;
    // Chỉ build nếu chưa có năm (> 1 option mặc định 'Tất cả')
    if (sel.options.length > 5) return;
    const thisYear = new Date().getFullYear();
    for (let y = thisYear; y >= 2010; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        sel.appendChild(opt);
    }
}

/**
 * Cập nhật select Loại danh sách theo provider đang chọn.
 */
function _updateTypeOptions() {
    const provider = API_PROVIDERS[_apiState.currentProvider];
    if (!provider) return;
    const sel = document.getElementById('apiTypeList');
    if (!sel) return;
    sel.innerHTML = '';
    (provider.typeOptions || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
    });
}

/**
 * Xử lý khi đổi nguồn API.
 */
function onApiProviderChange(providerId) {
    _apiState.currentProvider = providerId;
    _apiState.currentPage = 1;
    _renderProviderTabs();
    _updateTypeOptions();
    // Reset kết quả cũ
    const grid = document.getElementById('apiMovieGrid');
    if (grid) grid.innerHTML = `
        <div class="api-empty-state" id="apiEmptyState">
            <div class="api-empty-icon"><i class="fas fa-plug"></i></div>
            <h3>Đã đổi nguồn: ${API_PROVIDERS[providerId]?.name || providerId}</h3>
            <p>Nhấn <strong>Gọi API</strong> để tải dữ liệu từ nguồn này.</p>
        </div>`;
    document.getElementById('apiStatsRow').style.display = 'none';
    document.getElementById('apiJsonViewer').innerHTML = '<span style="color:var(--text-muted);">// Gọi API để xem dữ liệu JSON...</span>';
}

/**
 * Gọi API danh sách dựa theo form filter và provider hiện tại.
 */
async function callApiList() {
    const provider = API_PROVIDERS[_apiState.currentProvider];
    if (!provider) return;

    const btn = document.getElementById('btnCallApi');
    if (btn) { btn.classList.add('loading'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gọi...'; }

    // Đọc trang từ ô input (admin nhập tay) và đồng bộ vào state
    const inputPage = parseInt(document.getElementById('apiPage')?.value) || 1;
    _apiState.currentPage = inputPage;

    const params = {
        type: document.getElementById('apiTypeList')?.value || 'phim-bo',
        lang: document.getElementById('apiSortLang')?.value || '',
        year: document.getElementById('apiYear')?.value || '',
        limit: document.getElementById('apiLimit')?.value || '24',
        page: _apiState.currentPage,
    };

    const startTime = performance.now();

    try {
        const url = provider.buildListUrl(params);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();

        const elapsed = Math.round(performance.now() - startTime);
        _apiState.lastRawData = raw;

        const parsed = provider.parseListResponse(raw);
        _apiState.totalPages = parsed.totalPages;

        // Cập nhật stats
        document.getElementById('apiStatsRow').style.display = 'flex';
        document.getElementById('apiStatCount').textContent = parsed.items.length;
        document.getElementById('apiStatTotalPages').textContent = parsed.totalPages;
        document.getElementById('apiStatTotalItems').textContent = parsed.totalItems.toLocaleString();
        document.getElementById('apiResponseTime').textContent = `${elapsed}ms`;
        document.getElementById('apiCurrentPage').textContent = `Trang ${_apiState.currentPage}`;
        document.getElementById('btnApiPrev').disabled = _apiState.currentPage <= 1;
        document.getElementById('btnApiNext').disabled = _apiState.currentPage >= _apiState.totalPages;

        // Render card phim
        renderApiMovieCards(parsed.items);

        // Cập nhật JSON viewer
        document.getElementById('apiJsonViewer').innerHTML = _syntaxHighlightJson(JSON.stringify(raw, null, 2));

    } catch (err) {
        console.error('[API Explorer] Lỗi:', err);
        const grid = document.getElementById('apiMovieGrid');
        if (grid) grid.innerHTML = `
            <div class="api-empty-state" style="grid-column:1/-1;">
                <div class="api-empty-icon" style="border-color:rgba(255,107,107,0.3); color:rgba(255,107,107,0.5);">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3 style="color:#ff6b6b;">Lỗi gọi API</h3>
                <p>${err.message}</p>
            </div>`;
        if (typeof showNotification === 'function') showNotification('Lỗi gọi API: ' + err.message, 'error');
    } finally {
        if (btn) { btn.classList.remove('loading'); btn.innerHTML = '<i class="fas fa-bolt"></i> Gọi API'; }
    }
}

/**
 * Render grid card phim từ mảng items đã normalize.
 * Dùng DOM createElement để tránh lỗi escaped quotes trong onerror attribute.
 */
function renderApiMovieCards(items) {
    const grid = document.getElementById('apiMovieGrid');
    if (!grid) return;

    grid.innerHTML = '';

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
        card.title = item.name;
        card.onclick = () => callApiDetail(item.slug);

        // --- Poster: dùng DOM img để gán onerror an toàn ---
        if (item.poster) {
            const img = document.createElement('img');
            img.className = 'api-movie-card-poster';
            img.loading = 'lazy';
            img.alt = item.name;
            img.src = item.poster;
            img.onerror = function() {
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

        // --- Overlay hover ---
        const overlay = document.createElement('div');
        overlay.className = 'api-movie-card-overlay';
        overlay.innerHTML = '<span class="api-movie-card-overlay-text"><i class="fas fa-eye"></i> Xem chi tiết</span>';
        card.appendChild(overlay);

        // --- Info ---
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

        grid.appendChild(card);
    });
}

/**
 * Gọi API chi tiết 1 phim theo slug.
 */
async function callApiDetail(slug) {
    const provider = API_PROVIDERS[_apiState.currentProvider];
    if (!provider) return;

    const drawer = document.getElementById('apiDetailDrawer');
    const overlay = document.getElementById('apiDetailOverlay');
    const body = document.getElementById('apiDetailBody');
    const titleEl = document.getElementById('apiDetailTitle');

    if (!drawer) return;
    if (titleEl) titleEl.textContent = 'Đang tải...';
    if (body) body.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
        <i class="fas fa-spinner fa-spin fa-2x"></i>
        <p style="margin-top:12px;">Đang tải chi tiết phim...</p>
    </div>`;

    drawer.classList.add('open');
    overlay.classList.add('open');

    try {
        const url = provider.buildDetailUrl(slug);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        _apiState.lastDetailRaw = raw;

        const jsonView = document.getElementById('apiDetailJsonView');
        if (jsonView) jsonView.classList.remove('visible');

        renderApiMovieDetail(raw, provider);

    } catch (err) {
        console.error('[API Detail] Lỗi:', err);
        if (body) body.innerHTML = `<div style="text-align:center;padding:40px;color:#ff6b6b;">
            <i class="fas fa-exclamation-triangle fa-2x"></i>
            <p style="margin-top:12px;">${err.message}</p>
        </div>`;
    }
}

/**
 * Render nội dung chi tiết phim vào drawer.
 */
function renderApiMovieDetail(raw, provider) {
    const titleEl = document.getElementById('apiDetailTitle');
    const body = document.getElementById('apiDetailBody');
    if (!body) return;

    // KKPhim detail trả về { movie: {...}, episodes: [...] }
    const movie = raw.movie || raw;
    const episodes = raw.episodes || [];

    const name = movie.name || movie.title || 'Không rõ';
    if (titleEl) titleEl.textContent = name;

    // Build URL ảnh đúng: detect xem đã là URL đầy đủ hay chỉ path
    function _buildImg(u) { if (!u) return ''; return u.startsWith('http') ? u : `https://phimimg.com/${u}`; }
    const posterUrl = _buildImg(movie.poster_url) || _buildImg(movie.thumb_url);
    const thumbUrl  = _buildImg(movie.thumb_url)  || posterUrl;  // ảnh nền/background
    const categories = (movie.category || []).map(c => c.name).join(', ') || 'N/A';
    const countries = (movie.country || []).map(c => c.name).join(', ') || 'N/A';
    const actors = (movie.actor || []).join(', ') || 'N/A';
    const directors = (movie.director || []).join(', ') || 'N/A';

    let totalEps = 0;
    let serverNames = [];
    episodes.forEach(srv => {
        serverNames.push(srv.server_name || 'Server');
        totalEps = Math.max(totalEps, (srv.server_data || []).length);
    });

    const descShort = (movie.content || '').substring(0, 300) + (movie.content?.length > 300 ? '...' : '');

    // --- Render TẤT CẢ servers + link video (compact grid) ---
    let allServersHtml = '';
    episodes.forEach(server => {
        const srvName = server.server_name || 'Server';
        const srvData = server.server_data || [];
        if (srvData.length === 0) return;

        const epCards = srvData.map(ep => {
            // Tránh "Tập Tập": ep.name đôi khi đã có chữ "Tập"
            const epLabel = /^tập\s*/i.test(String(ep.name)) ? ep.name : `Tập ${ep.name}`;
            const m3u8  = (ep.link_m3u8  || '').replace(/'/g, "\\'");
            const embed = (ep.link_embed || '').replace(/'/g, "\\'");

            const btnM3u8  = m3u8  ? `<span class="api-ep-btn m3u8"  onclick="_copyEpLink('${m3u8}','m3u8')"  title="${m3u8}">m3u8</span>`  : `<span class="api-ep-btn disabled">m3u8</span>`;
            const btnEmbed = embed ? `<span class="api-ep-btn embed" onclick="_copyEpLink('${embed}','embed')" title="${embed}">embed</span>` : `<span class="api-ep-btn disabled">embed</span>`;

            return `<div class="api-ep-card">
                <div class="api-ep-card-name">${epLabel}</div>
                <div class="api-ep-card-links">${btnM3u8}${btnEmbed}</div>
            </div>`;
        }).join('');

        allServersHtml += `
        <div class="api-server-block">
            <div class="api-server-label"><i class="fas fa-server"></i> ${srvName} <span class="api-server-count">${srvData.length} tập</span></div>
            <div class="api-ep-compact-grid">${epCards}</div>
        </div>`;
    });

    body.innerHTML = `
        <!-- Poster + Ảnh nền + Copy links -->
        <div class="api-img-preview-row">
            <!-- Poster -->
            <div class="api-img-preview-item">
                <div class="api-img-preview-label">Poster</div>
                ${posterUrl
                    ? `<img class="api-detail-poster" src="${posterUrl}" alt="poster" onerror="this.style.display='none'">`
                    : '<div class="api-detail-poster" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);"><i class="fas fa-image"></i></div>'}
                ${posterUrl ? `<button class="api-img-copy-btn" onclick="_copyEpLink('${posterUrl.replace(/'/g,"\\'")}\'','Poster')" title="${posterUrl}"><i class="fas fa-copy"></i> Copy Poster</button>` : ''}
            </div>
            <!-- Background / Thumb -->
            <div class="api-img-preview-item">
                <div class="api-img-preview-label">Background</div>
                ${thumbUrl
                    ? `<img class="api-detail-thumb" src="${thumbUrl}" alt="background" onerror="this.style.display='none'">`
                    : '<div class="api-detail-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);"><i class="fas fa-image"></i></div>'}
                ${thumbUrl ? `<button class="api-img-copy-btn" onclick="_copyEpLink('${thumbUrl.replace(/'/g,"\\'")}\'','Background')" title="${thumbUrl}"><i class="fas fa-copy"></i> Copy Background</button>` : ''}
            </div>
            <!-- Meta chính -->
            <div class="api-detail-meta" style="flex:2;">
                <div class="api-detail-title-big">${name}</div>
                ${movie.origin_name ? `<div class="api-detail-subtitle">${movie.origin_name}</div>` : ''}
                <div class="api-detail-badges">
                    ${movie.year ? `<span class="api-badge year">${movie.year}</span>` : ''}
                    ${movie.type === 'series' ? `<span class="api-badge type-series">Phim bộ</span>` : `<span class="api-badge type-single">Phim lẻ</span>`}
                    ${movie.lang ? `<span class="api-badge">${movie.lang}</span>` : ''}
                    ${movie.quality ? `<span class="api-badge" style="background:rgba(251,191,36,0.15);color:#fbbf24;">${movie.quality}</span>` : ''}
                    <span class="api-badge" style="background:rgba(52,211,153,0.1);color:#34d399;">${movie.episode_current || 'N/A'}</span>
                </div>
            </div>
        </div>

        <!-- Fields ngang -->
        <div class="api-detail-section">
            <h4><i class="fas fa-info-circle"></i> Thông tin</h4>
            <div class="api-detail-field-grid">
                <div class="api-detail-field">
                    <div class="field-label">Slug</div>
                    <div class="field-value" style="font-family:monospace;font-size:0.78rem;">${movie.slug || 'N/A'}</div>
                </div>
                <div class="api-detail-field" style="grid-column:1/-1;">
                    <div class="field-label" style="display:flex;align-items:center;justify-content:space-between;">
                        Link API
                        <span onclick="_copyEpLink('${provider.buildDetailUrl(movie.slug)}','API')"
                              style="font-size:0.7rem;color:#00d2ff;cursor:pointer;display:flex;align-items:center;gap:4px;background:rgba(0,210,255,0.1);padding:2px 8px;border-radius:5px;border:1px solid rgba(0,210,255,0.2);">
                            <i class="fas fa-copy"></i> copy
                        </span>
                    </div>
                    <div class="field-value" style="font-family:monospace;font-size:0.75rem;white-space:normal;word-break:break-all;color:#00d2ff;">${provider.buildDetailUrl(movie.slug)}</div>
                </div>
                <div class="api-detail-field">
                    <div class="field-label">Trạng thái</div>
                    <div class="field-value">${movie.status || 'N/A'}</div>
                </div>
                <div class="api-detail-field">
                    <div class="field-label">Tổng tập</div>
                    <div class="field-value">${movie.episode_total || totalEps || 'N/A'}</div>
                </div>
                <div class="api-detail-field">
                    <div class="field-label">Servers</div>
                    <div class="field-value">${serverNames.join(', ') || 'N/A'}</div>
                </div>
                <div class="api-detail-field">
                    <div class="field-label">Thể loại</div>
                    <div class="field-value" title="${categories}">${categories}</div>
                </div>
                <div class="api-detail-field">
                    <div class="field-label">Quốc gia</div>
                    <div class="field-value">${countries}</div>
                </div>
                <div class="api-detail-field" style="grid-column:1/-1;">
                    <div class="field-label">Diễn viên</div>
                    <div class="field-value" style="white-space:normal;font-size:0.8rem;">${actors}</div>
                </div>
                <div class="api-detail-field" style="grid-column:1/-1;">
                    <div class="field-label">Đạo diễn</div>
                    <div class="field-value" style="white-space:normal;">${directors}</div>
                </div>
            </div>
        </div>

        <!-- Nội dung phim -->
        ${descShort ? `
        <div class="api-detail-section">
            <h4><i class="fas fa-align-left"></i> Nội dung</h4>
            <div class="api-detail-desc">${descShort}</div>
        </div>` : ''}

        <!-- Tất cả servers + link video -->
        ${allServersHtml}


        <!-- JSON section (toggle) -->
        <div class="api-detail-json" id="apiDetailJsonView">
            <div class="api-detail-section" style="margin-top:16px;">
                <h4><i class="fas fa-code"></i> JSON đầy đủ</h4>
                <pre class="api-json-viewer" style="max-height:400px;font-size:0.75rem;">${_syntaxHighlightJson(JSON.stringify(raw, null, 2))}</pre>
            </div>
        </div>
    `;
}

/**
 * Toggle hiển thị JSON trong drawer chi tiết.
 */
function toggleDetailJson() {
    const view = document.getElementById('apiDetailJsonView');
    if (!view) return;
    view.classList.toggle('visible');
    const btn = document.getElementById('btnDetailJson');
    if (btn) {
        btn.style.background = view.classList.contains('visible')
            ? 'rgba(0,210,255,0.15)' : 'rgba(255,255,255,0.08)';
        btn.style.color = view.classList.contains('visible') ? '#00d2ff' : '';
    }
}

/**
 * Đóng drawer chi tiết phim.
 */
function closeApiDetail() {
    document.getElementById('apiDetailDrawer')?.classList.remove('open');
    document.getElementById('apiDetailOverlay')?.classList.remove('open');
}

/**
 * Chuyển tab kết quả (Danh sách / JSON Raw).
 */
function switchApiTab(tab) {
    document.querySelectorAll('.api-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.api-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.api-tab-btn[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(`apiTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)?.classList.add('active');
}

/**
 * Chuyển trang nhanh từ thanh stats.
 */
async function changeApiPage(delta) {
    const newPage = _apiState.currentPage + delta;
    if (newPage < 1 || newPage > _apiState.totalPages) return;
    _apiState.currentPage = newPage;
    document.getElementById('apiPage').value = newPage;
    await callApiList();
}

/**
 * Copy JSON hiện tại vào clipboard.
 */
async function copyApiJson() {
    try {
        const text = JSON.stringify(_apiState.lastRawData, null, 2);
        await navigator.clipboard.writeText(text);
        const btn = document.getElementById('btnCopyJson');
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Đã copy!';
            btn.style.color = '#34d399';
            setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000);
        }
    } catch (err) {
        if (typeof showNotification === 'function') showNotification('Không thể copy: ' + err.message, 'error');
    }
}

/**
 * Copy link tập phim (m3u8 hoặc embed) vào clipboard.
 */
function _copyEpLink(link, type) {
    navigator.clipboard.writeText(link).then(() => {
        if (typeof showNotification === 'function')
            showNotification(`Đã copy link ${type}!`, 'success');
    }).catch(() => {
        if (typeof showNotification === 'function')
            showNotification('Không thể copy vào clipboard!', 'error');
    });
}

/**
 * Syntax highlight JSON string to colored HTML.
 */

function _syntaxHighlightJson(json) {
    return json
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/(\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*\"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (match) => {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                cls = /:$/.test(match) ? 'json-key' : 'json-string';
            } else if (/true|false/.test(match)) {
                cls = 'json-bool';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return `<span class="${cls}">${match}</span>`;
        });
}
