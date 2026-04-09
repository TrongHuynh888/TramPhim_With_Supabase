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
        // Tạo URL tìm kiếm phim bằng từ khóa
        buildSearchUrl(keyword, page = 1) {
            return `${this.baseUrl}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=24&page=${page}`;
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
                episode_total: raw.episode_total || raw.total_episodes || '',
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
    // NGUỒN 2: OPhim (ophim1.com) — cấu trúc tương tự KKPhim
    // ─────────────────────────────────────────────────────────────
    ophim: {
        id: 'ophim',
        name: 'OPhim',
        color: '#f59e0b',
        baseUrl: 'https://ophim1.com',
        cdnImgUrl: 'https://img.ophim.live/uploads/movies',
        badge: 'FREE',
        // Tạo URL gọi danh sách phim
        buildListUrl(params) {
            const { type, lang, year, limit, page } = params;
            let url = `${this.baseUrl}/v1/api/danh-sach/${type}?page=${page}&sort_field=modified.time&sort_type=desc&limit=${limit}`;
            if (lang) url += `&sort_lang=${lang}`;
            if (year) url += `&year=${year}`;
            return url;
        },
        // Tạo URL tìm kiếm phim bằng từ khóa
        buildSearchUrl(keyword, page = 1) {
            return `${this.baseUrl}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=24&page=${page}`;
        },
        // Tạo URL gọi chi tiết phim
        buildDetailUrl(slug) {
            return `${this.baseUrl}/phim/${slug}`;
        },
        // Build URL ảnh: OPhim trả về tên file, cần ghép với CDN
        buildImgUrl(url) {
            if (!url) return '';
            if (url.startsWith('http')) return url;
            return `${this.cdnImgUrl}/${url}`;
        },
        // Chuẩn hóa item dữ liệu về schema chung
        mapItem(raw) {
            return {
                slug: raw.slug,
                name: raw.name,
                origin_name: raw.origin_name || '',
                poster: this.buildImgUrl(raw.poster_url) || this.buildImgUrl(raw.thumb_url),
                thumb: this.buildImgUrl(raw.thumb_url),
                year: raw.year,
                type: raw.type,
                lang: raw.lang || '',
                status: raw.episode_current || '',
                episode_total: raw.episode_total || raw.total_episodes || '',
                category: (raw.category || []).map(c => c.name).join(', '),
                country: (raw.country || []).map(c => c.name).join(', '),
            };
        },
        // Chuẩn hóa response list — cấu trúc giống KKPhim
        parseListResponse(data) {
            const d = data.data || {};
            const pagination = d.params?.pagination || {};
            return {
                items: (d.items || []).map(i => this.mapItem(i)),
                totalItems: pagination.totalItems || 0,
                totalPages: pagination.totalPages || Math.ceil((pagination.totalItems || 0) / (pagination.totalItemsPerPage || 24)),
                currentPage: pagination.currentPage || 1,
            };
        },
        // Kiểu danh sách hỗ trợ (giống KKPhim)
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
    // NGUỒN 3: NguonC (phim.nguonc.com) — cấu trúc khác biệt
    // ─────────────────────────────────────────────────────────────
    nguonc: {
        id: 'nguonc',
        name: 'NguonC',
        color: '#10b981',
        baseUrl: 'https://phim.nguonc.com',
        badge: 'FREE',
        // Tạo URL gọi danh sách phim
        buildListUrl(params) {
            const { type, lang, year, limit, page } = params;
            let url = `${this.baseUrl}/api/films/danh-sach/${type}?page=${page}`;
            // NguonC không hỗ trợ limit/lang/year qua query params
            return url;
        },
        // Tạo URL gọi tìm kiếm phim
        buildSearchUrl(keyword, page = 1) {
            return `${this.baseUrl}/api/films/search?keyword=${encodeURIComponent(keyword)}&page=${page}`;
        },
        // Tạo URL gọi chi tiết phim
        buildDetailUrl(slug) {
            return `${this.baseUrl}/api/film/${slug}`;
        },
        // Build URL ảnh: NguonC trả URL đầy đủ, không cần ghép CDN
        buildImgUrl(url) {
            return url || '';
        },
        // Chuẩn hóa item dữ liệu về schema chung
        mapItem(raw) {
            return {
                slug: raw.slug,
                name: raw.name,
                origin_name: raw.original_name || raw.origin_name || '',
                poster: raw.poster_url || raw.thumb_url || '',
                thumb: raw.thumb_url || '',
                year: this._extractYear(raw),
                type: this._detectType(raw),
                lang: raw.language || '',
                status: raw.current_episode || '',
                episode_total: raw.episode_total || raw.total_episodes || '',
                category: this._extractCategories(raw),
                country: this._extractCountry(raw),
            };
        },
        // Trích xuất năm từ category group "Năm"
        _extractYear(raw) {
            if (raw.year) return raw.year;
            const cat = raw.category;
            if (!cat) return '';
            for (const key of Object.keys(cat)) {
                const group = cat[key];
                if (group?.group?.name === 'Năm' && group.list?.length) {
                    return parseInt(group.list[0].name) || '';
                }
            }
            return '';
        },
        // Detect loại phim từ category group "Định dạng"
        _detectType(raw) {
            const cat = raw.category;
            if (!cat) return 'series';
            for (const key of Object.keys(cat)) {
                const group = cat[key];
                if (group?.group?.name === 'Định dạng' && group.list?.length) {
                    const names = group.list.map(l => l.name?.toLowerCase());
                    if (names.some(n => n?.includes('phim lẻ') || n?.includes('phim le'))) return 'single';
                }
            }
            return 'series';
        },
        // Trích xuất thể loại từ category group "Thể loại"
        _extractCategories(raw) {
            const cat = raw.category;
            if (!cat) return '';
            for (const key of Object.keys(cat)) {
                const group = cat[key];
                if (group?.group?.name === 'Thể loại' && group.list?.length) {
                    return group.list.map(l => l.name).join(', ');
                }
            }
            return '';
        },
        // Trích xuất quốc gia từ category group "Quốc gia"
        _extractCountry(raw) {
            const cat = raw.category;
            if (!cat) return '';
            for (const key of Object.keys(cat)) {
                const group = cat[key];
                if (group?.group?.name === 'Quốc gia' && group.list?.length) {
                    return group.list.map(l => l.name).join(', ');
                }
            }
            return '';
        },
        // Chuẩn hóa response list — NguonC cấu trúc khác biệt
        parseListResponse(data) {
            const paginate = data.paginate || {};
            return {
                items: (data.items || []).map(i => this.mapItem(i)),
                totalItems: paginate.total_items || 0,
                totalPages: paginate.total_page || 1,
                currentPage: paginate.current_page || 1,
            };
        },
        // Kiểu danh sách hỗ trợ
        typeOptions: [
            { value: 'phim-bo', label: 'Phim bộ' },
            { value: 'phim-le', label: 'Phim lẻ' },
            { value: 'phim-dang-chieu', label: 'Đang chiếu' },
            { value: 'phim-sap-chieu', label: 'Sắp chiếu' },
            { value: 'phim-hoat-hinh', label: 'Hoạt hình' },
            { value: 'phim-vietsub', label: 'Vietsub' },
            { value: 'phim-thuyet-minh', label: 'Thuyết minh' },
            { value: 'phim-long-tieng', label: 'Lồng tiếng' },
        ],
    },
};

/** State nội bộ của API Explorer */
const _apiState = {
    currentProvider: 'kkphim',
    currentPage: 1,
    totalPages: 1,
    lastRawData: null,  // Lưu JSON raw để hiển thị tab JSON
    lastDetailRaw: null,
    pings: {},          // Lưu kết quả đo ping { kkphim: 120, ophim: 'error' }
    pingInterval: null,
    pingCountdown: 10,
    isPinging: false,
};

/**
 * Khởi tạo panel API Explorer khi admin vào tab.
 * Được gọi từ showAdminPanel().
 */
function initApiExplorer() {
    _renderProviderTabs();
    _populateYearSelect();
    _updateTypeOptions();
    
    // Đo vòng đầu tiên (có loading)
    measureApiPings(false);

    // Setup đếm ngược 10 giây đo ngầm (cập nhật UI từng giây)
    if (_apiState.pingInterval) clearInterval(_apiState.pingInterval);
    _apiState.pingCountdown = 10;
    _apiState.pingInterval = setInterval(() => {
        const explorerElem = document.getElementById('apiExplorerPanel');
        // Tự hủy ping nếu đổi panel
        if (!explorerElem || explorerElem.style.display === 'none') {
            clearInterval(_apiState.pingInterval);
            _apiState.pingInterval = null;
            return;
        }

        // Đang lấy ping thì ngưng đếm
        if (_apiState.isPinging) return;

        _apiState.pingCountdown--;
        const btn = document.getElementById('btnMeasurePing');

        if (_apiState.pingCountdown <= 0) {
            measureApiPings(true);
        } else if (btn) {
            btn.innerHTML = `<i class="fas fa-satellite-dish"></i> Đo Live (${_apiState.pingCountdown}s)`;
        }
    }, 1000);
}

/**
 * Render các nút chọn nguồn API từ registry API_PROVIDERS.
 */
function _renderProviderTabs() {
    const container = document.getElementById('apiProviderTabs');
    if (!container) return;
    container.innerHTML = '';
    Object.values(API_PROVIDERS).forEach(p => {
        const pingVal = _apiState.pings[p.id];
        let pingHtml = '<i class="fas fa-wifi"></i> --ms';
        let pingColor = 'var(--text-muted)';
        
        if (pingVal !== undefined) {
            if (pingVal === 'error') {
                pingHtml = '<i class="fas fa-exclamation-triangle"></i> Lỗi';
                pingColor = '#ff6b6b';
            } else {
                pingHtml = `<i class="fas fa-wifi"></i> ${pingVal}ms`;
                if (pingVal < 400) pingColor = '#34d399'; // Tốt (Xanh) - API VN hay loanh quanh 100-300ms
                else if (pingVal < 1000) pingColor = '#fbbf24'; // Chậm (Vàng)
                else pingColor = '#f87171'; // Quá chậm (Đỏ)
            }
        }

        const btn = document.createElement('button');
        btn.className = 'api-provider-btn' + (p.id === _apiState.currentProvider ? ' active' : '');
        btn.onclick = () => onApiProviderChange(p.id);
        btn.innerHTML = `
            <span class="provider-dot" style="background:${p.color};"></span>
            ${p.name}
            <span class="api-provider-badge">${p.badge || 'API'}</span>
            <span class="api-provider-ping" id="ping_${p.id}" style="font-size:0.65rem; color:${pingColor}; margin-left:4px; display:flex; align-items:center; gap:4px; background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);" title="Tốc độ phản hồi API">${pingHtml}</span>
        `;
        container.appendChild(btn);
    });
}

/**
 * Đo ping mạng các nguồn API (Hỗ trợ realtime ngầm có đếm ngược)
 */
async function measureApiPings(silent = false) {
    if (_apiState.isPinging) return; // Khóa không cho gọi chồng
    _apiState.isPinging = true;
    _apiState.pingCountdown = 10; // Reset countdown

    const btn = document.getElementById('btnMeasurePing');
    if (btn && !silent) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đo...';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.7';
    } else if (btn && silent) {
        // Đổi màu vàng báo hiệu đang thu thập dữ liệu realtime
        btn.innerHTML = '<i class="fas fa-satellite-dish" style="color: #fbbf24;"></i> Đo Live...';
    }

    // Cập nhật UI loading các tab (chỉ khi ko chạy ngầm)
    if (!silent) {
        Object.keys(API_PROVIDERS).forEach(id => {
            const span = document.getElementById(`ping_${id}`);
            if (span) {
                span.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
                span.style.color = 'var(--text-muted)';
            }
        });
    }

    // Gọi song song list_url page=1 limit=1 để lấy ping chân thực nhất
    const promises = Object.values(API_PROVIDERS).map(async p => {
        const start = performance.now();
        try {
            const tempUrl = p.buildListUrl({ type: 'phim-bo', lang:'', year:'', limit: 1, page: 1 });
            const res = await fetch(tempUrl, { method: 'GET', cache: 'no-cache' });
            if (!res.ok) throw new Error('Bad Status');
            
            await res.json(); 
            const elapsed = Math.round(performance.now() - start);
            _apiState.pings[p.id] = elapsed;
        } catch (err) {
            _apiState.pings[p.id] = 'error';
        }
    });

    await Promise.allSettled(promises);
    
    // Cập nhật UI trực tiếp vào thẻ span thay vì render lại cả tab (tránh mất DOM đang hover/focus)
    Object.keys(API_PROVIDERS).forEach(id => {
        const span = document.getElementById(`ping_${id}`);
        if (!span) return;
        const pingVal = _apiState.pings[id];
        let pingHtml = '<i class="fas fa-wifi"></i> --ms';
        let pingColor = 'var(--text-muted)';
        
        if (pingVal !== undefined) {
            if (pingVal === 'error') {
                pingHtml = '<i class="fas fa-exclamation-triangle"></i> Lỗi';
                pingColor = '#ff6b6b';
            } else {
                pingHtml = `<i class="fas fa-wifi"></i> ${pingVal}ms`;
                if (pingVal < 400) pingColor = '#34d399'; // Xanh
                else if (pingVal < 1000) pingColor = '#fbbf24'; // Vàng
                else pingColor = '#f87171'; // Đỏ
            }
        }
        span.innerHTML = pingHtml;
        span.style.color = pingColor;
    });

    _apiState.isPinging = false; // Mở khóa

    if (btn) {
        btn.innerHTML = `<i class="fas fa-satellite-dish"></i> Đo Live (${_apiState.pingCountdown}s)`;
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
    }
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

    const keyword = document.getElementById('apiSearchKeyword') ? document.getElementById('apiSearchKeyword').value.trim() : '';

    const startTime = performance.now();

    try {
        if (keyword) {
            // TÌM KIẾM ĐA NGUỒN (MULTI-PROVIDER SEARCH)
            const fetchPromises = Object.values(API_PROVIDERS).map(async (prov) => {
                try {
                    const url = prov.buildSearchUrl(keyword, params.page);
                    const res = await fetch(url);
                    if (!res.ok) return null;
                    const raw = await res.json();
                    const parsed = prov.parseListResponse(raw);
                    // Gắn tag nguồn vào từng item để UI biết nó của API nào
                    parsed.items.forEach(i => i._providerId = prov.id);
                    return parsed;
                } catch (e) {
                    console.warn(`[Multi-Search] Lỗi nguồn ${prov.id}:`, e);
                    return null;
                }
            });

            const results = await Promise.all(fetchPromises);
            
            let allItems = [];
            let totalItemsCount = 0;
            let maxTotalPages = 1;

            results.forEach(res => {
                if (res && res.items) {
                    // Lọc quốc gia bị chặn cho Multi-Search
                    if (typeof _importState !== 'undefined' && _importState.excludeCountryEnabled && _importState.excludeCountryText) {
                        const blocked = _importState.excludeCountryText.toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
                        res.items = res.items.filter(item => {
                            if (!item.country) return true; // Cứ cho qua nếu API không trả country
                            const cText = item.country.toLowerCase();
                            return !blocked.some(bc => cText.includes(bc));
                        });
                    }

                    allItems = allItems.concat(res.items);
                    totalItemsCount += res.totalItems;
                    if (res.totalPages > maxTotalPages) maxTotalPages = res.totalPages;
                }
            });

            const elapsed = Math.round(performance.now() - startTime);
            _apiState.totalPages = maxTotalPages;

            // Cập nhật stats
            document.getElementById('apiStatsRow').style.display = 'flex';
            document.getElementById('apiStatCount').textContent = allItems.length;
            document.getElementById('apiStatTotalPages').textContent = maxTotalPages;
            document.getElementById('apiStatTotalItems').innerHTML = `${totalItemsCount.toLocaleString()} <span style="font-size:0.7rem; opacity:0.7">(Đa nguồn)</span>`;
            document.getElementById('apiResponseTime').textContent = `${elapsed}ms`;
            document.getElementById('apiCurrentPage').textContent = `Trang ${_apiState.currentPage}`;
            document.getElementById('btnApiPrev').disabled = _apiState.currentPage <= 1;
            document.getElementById('btnApiNext').disabled = _apiState.currentPage >= _apiState.totalPages;

            // Render card phim hỗn hợp
            renderApiMovieCards(allItems);
            
            document.getElementById('apiJsonViewer').innerHTML = _syntaxHighlightJson(JSON.stringify({ multi_search_results: allItems.length, timestamp: new Date().toISOString() }, null, 2));

        } else {
            // LOAD DANH SÁCH MỘT NGUỒN (SINGLE-PROVIDER LIST)
            const provider = API_PROVIDERS[_apiState.currentProvider];
            const url = provider.buildListUrl(params);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = await res.json();

            const elapsed = Math.round(performance.now() - startTime);
            _apiState.lastRawData = raw;

            const parsed = provider.parseListResponse(raw);
            _apiState.totalPages = parsed.totalPages;

            // Lọc quốc gia bị chặn cho Single-Provider
            if (typeof _importState !== 'undefined' && _importState.excludeCountryEnabled && _importState.excludeCountryText) {
                const blocked = _importState.excludeCountryText.toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
                parsed.items = parsed.items.filter(item => {
                    if (!item.country) return true; // Cứ cho qua nếu API không trả country
                    const cText = item.country.toLowerCase();
                    return !blocked.some(bc => cText.includes(bc));
                });
            }

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
        }

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
        card.onclick = () => callApiDetail(item.slug, item._providerId);

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

        grid.appendChild(card);
    });
}

/**
 * Gọi API chi tiết 1 phim theo slug và nguồn chỉ định.
 */
async function callApiDetail(slug, forceProviderId = null) {
    const providerId = forceProviderId || _apiState.currentProvider;
    const provider = API_PROVIDERS[providerId];
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

    // Gán dữ liệu cho việc Save/Sync trong Drawer biết nó thuộc nguồn API nào
    drawer.dataset.currentSlug = slug;
    drawer.dataset.currentProviderId = providerId;

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
 * Hỗ trợ multi-provider: KKPhim, OPhim, NguonC.
 */
function renderApiMovieDetail(raw, provider) {
    const titleEl = document.getElementById('apiDetailTitle');
    const body = document.getElementById('apiDetailBody');
    if (!body) return;

    // Lấy thông tin phim: KKPhim/OPhim trả { movie: {}, episodes: [] }, NguonC trả { movie: { episodes: [] } }
    const movie = raw.movie || raw;
    const episodes = raw.episodes || movie.episodes || [];

    const name = movie.name || movie.title || 'Không rõ';
    if (titleEl) titleEl.textContent = name;

    // Build URL ảnh: ưu tiên dùng provider.buildImgUrl nếu có, fallback phimimg.com
    function _buildImg(u) {
        if (!u) return '';
        if (typeof provider.buildImgUrl === 'function') return provider.buildImgUrl(u);
        return u.startsWith('http') ? u : `https://phimimg.com/${u}`;
    }
    const posterUrl = _buildImg(movie.poster_url) || _buildImg(movie.thumb_url);
    const thumbUrl  = _buildImg(movie.thumb_url)  || posterUrl;

    // Categories: hỗ trợ cả array (KKPhim/OPhim) lẫn group object (NguonC)
    let categories = 'N/A';
    if (Array.isArray(movie.category)) {
        categories = movie.category.map(c => c.name).join(', ') || 'N/A';
    } else if (movie.category && typeof movie.category === 'object') {
        const catArr = [];
        for (const key of Object.keys(movie.category)) {
            const group = movie.category[key];
            if (group?.group?.name === 'Thể loại' && group.list?.length) {
                group.list.forEach(l => catArr.push(l.name));
            }
        }
        categories = catArr.join(', ') || 'N/A';
    }

    // Countries: hỗ trợ array lẫn group object
    let countries = 'N/A';
    if (Array.isArray(movie.country)) {
        countries = movie.country.map(c => c.name).join(', ') || 'N/A';
    } else if (movie.category && typeof movie.category === 'object') {
        const countryArr = [];
        for (const key of Object.keys(movie.category)) {
            const group = movie.category[key];
            if (group?.group?.name === 'Quốc gia' && group.list?.length) {
                group.list.forEach(l => countryArr.push(l.name));
            }
        }
        if (countryArr.length) countries = countryArr.join(', ');
    }

    // Actors + Directors: hỗ trợ array (KKPhim/OPhim) lẫn string (NguonC)
    let actors = 'N/A';
    if (Array.isArray(movie.actor)) {
        actors = movie.actor.join(', ') || 'N/A';
    } else if (typeof movie.casts === 'string' && movie.casts) {
        actors = movie.casts;
    }

    let directors = 'N/A';
    if (Array.isArray(movie.director)) {
        directors = movie.director.join(', ') || 'N/A';
    } else if (typeof movie.director === 'string' && movie.director) {
        directors = movie.director;
    }

    // Normalize episodes: NguonC dùng items[] thay vì server_data[], field m3u8/embed thay link_m3u8/link_embed
    const normalizedEpisodes = episodes.map(srv => {
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

    let totalEps = 0;
    let serverNames = [];
    normalizedEpisodes.forEach(srv => {
        serverNames.push(srv.server_name);
        totalEps = Math.max(totalEps, srv.server_data.length);
    });

    // Mô tả ngắn: hỗ trợ cả content (KKPhim/OPhim) và description (NguonC)
    const movieDesc = movie.content || movie.description || '';
    const descShort = movieDesc.substring(0, 300) + (movieDesc.length > 300 ? '...' : '');

    // Tổng tập: hỗ trợ cả 2 field name
    const movieTotalEps = movie.episode_total || movie.total_episodes || totalEps || 'N/A';
    const epCurrent = movie.episode_current || movie.current_episode || 'N/A';
    const movieLang = movie.lang || movie.language || '';
    const movieOriginName = movie.origin_name || movie.original_name || '';

    // --- Render TẤT CẢ servers + link video (compact grid) ---
    let allServersHtml = '';
    normalizedEpisodes.forEach(server => {
        const srvName = server.server_name;
        const srvData = server.server_data;
        if (srvData.length === 0) return;

        const epCards = srvData.map(ep => {
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

    const safePostUrl = posterUrl ? posterUrl.replace(/'/g, "\\'") : '';
    const safeThumbUrl = thumbUrl ? thumbUrl.replace(/'/g, "\\'") : '';
    const safeDetailUrl = provider.buildDetailUrl(movie.slug).replace(/'/g, "\\'");

    body.innerHTML = `
        <div class="api-img-preview-row">
            <div class="api-img-preview-item">
                <div class="api-img-preview-label">Poster</div>
                ${posterUrl
                    ? `<img class="api-detail-poster" src="${posterUrl}" alt="poster" onerror="this.style.display='none'">`
                    : '<div class="api-detail-poster" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);"><i class="fas fa-image"></i></div>'}
                ${posterUrl ? `<button class="api-img-copy-btn" onclick="_copyEpLink('${safePostUrl}','Poster')" title="${posterUrl}"><i class="fas fa-copy"></i> Copy Poster</button>` : ''}
            </div>
            <div class="api-img-preview-item">
                <div class="api-img-preview-label">Background</div>
                ${thumbUrl
                    ? `<img class="api-detail-thumb" src="${thumbUrl}" alt="background" onerror="this.style.display='none'">`
                    : '<div class="api-detail-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);"><i class="fas fa-image"></i></div>'}
                ${thumbUrl ? `<button class="api-img-copy-btn" onclick="_copyEpLink('${safeThumbUrl}','Background')" title="${thumbUrl}"><i class="fas fa-copy"></i> Copy Background</button>` : ''}
            </div>
            <div class="api-detail-meta" style="flex:2;">
                <div class="api-detail-title-big">${name}</div>
                ${movieOriginName ? `<div class="api-detail-subtitle">${movieOriginName}</div>` : ''}
                <div class="api-detail-badges">
                    ${movie.year ? `<span class="api-badge year">${movie.year}</span>` : ''}
                    ${(movie.type === 'series' || movie.type === 'tvshows' || movie.type === 'hoathinh') ? `<span class="api-badge type-series">Phim bộ</span>` : `<span class="api-badge type-single">Phim lẻ</span>`}
                    ${movieLang ? `<span class="api-badge">${movieLang}</span>` : ''}
                    ${movie.quality ? `<span class="api-badge" style="background:rgba(251,191,36,0.15);color:#fbbf24;">${movie.quality}</span>` : ''}
                    <span class="api-badge" style="background:rgba(52,211,153,0.1);color:#34d399;">${epCurrent}</span>
                </div>
            </div>
        </div>

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
                        <span onclick="_copyEpLink('${safeDetailUrl}','API')"
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
                    <div class="field-value">${movieTotalEps}</div>
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

        ${descShort ? `
        <div class="api-detail-section">
            <h4><i class="fas fa-align-left"></i> Nội dung</h4>
            <div class="api-detail-desc">${descShort}</div>
        </div>` : ''}

        ${allServersHtml}

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
