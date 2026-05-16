/**
 * ============================================
 * ADMIN API KEYS MANAGEMENT
 * ============================================
 */

let hasSystemSettingsTable = true;
// Cache settings từ DB
let dbSettingsCache = {};

// Bảo mật Sudo Mode (lưu trên Supabase DB - key: sudo_expiry_at)
let sudoUnlocked = false;
let sudoUnlockExpiredAt = 0;
let isSuperAdmin = false;
let sudoTimerInterval = null;

const SUPER_ADMINS_DEFAULT = ['huynhphutrong8223@gmail.com'];
const SUDO_PIN_DEFAULT = '123456';

// Chứa các giá trị gốc đọc trực tiếp từ source code (Dùng Regex để parse)
let defaultCodeKeys = {
    imgbb: '',
    omdb: '',
    metered: '',
    cloudflare: ''
};

const API_KEYS_CONFIG = [
    {
        id: 'supabase_url',
        title: 'Supabase URL',
        service: 'Database & Auth',
        icon: 'fas fa-database',
        description: 'Endpoint chính để ứng dụng kết nối tới Supabase.',
        isReadonly: true,
        getValue: () => typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'Chưa cấu hình',
        category: 'core'
    },
    {
        id: 'supabase_anon_key',
        title: 'Supabase Anon Key',
        service: 'Database & Auth',
        icon: 'fas fa-key',
        description: 'Khóa công khai dùng để gọi các API của Supabase từ Frontend.',
        isReadonly: true,
        getValue: () => typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : 'Chưa cấu hình',
        category: 'core'
    },
    {
        id: 'firebase_api_key',
        title: 'Firebase API Key',
        service: 'Realtime & Sync',
        icon: 'fas fa-fire',
        description: 'Khóa kết nối với Firebase Realtime Database (Tuỳ chọn nếu đang dùng Supabase realtime).',
        isReadonly: true,
        getValue: () => (typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey) ? firebaseConfig.apiKey : 'Chưa cấu hình',
        category: 'core'
    },
    {
        id: 'imgbb_api_key',
        title: 'ImgBB API Key',
        service: 'Community (Upload Ảnh)',
        icon: 'fas fa-image',
        description: 'Key dùng để upload ảnh lên ImgBB trong phần Cộng đồng. (Ưu tiên đọc từ DB, mặc định lấy trong file JS nếu chưa lưu).',
        isReadonly: false,
        getValue: () => dbSettingsCache['imgbb_api_key'] || defaultCodeKeys.imgbb,
        category: 'dynamic'
    },
    {
        id: 'omdb_api_key',
        title: 'OMDb API Key',
        service: 'Thông tin Phim',
        icon: 'fas fa-film',
        description: 'Key dùng để fetch Rating (IMDb) và thông tin phụ của phim từ OMDb API.',
        isReadonly: false,
        getValue: () => dbSettingsCache['omdb_api_key'] || defaultCodeKeys.omdb,
        category: 'dynamic'
    },
    {
        id: 'metered_api_key',
        title: 'Metered Video API',
        service: 'Xem Chung (Watch Party)',
        icon: 'fas fa-video',
        description: 'Khóa dùng để tạo phòng video call / stream trong tính năng Xem Chung.',
        isReadonly: false,
        getValue: () => dbSettingsCache['metered_api_key'] || defaultCodeKeys.metered,
        category: 'dynamic'
    },
    {
        id: 'cloudflare_r2_url',
        title: 'Cloudflare R2 Worker',
        service: 'Lưu trữ Ảnh (Cloud)',
        icon: 'fas fa-cloud',
        description: 'Đường dẫn (URL) tới Cloudflare Worker dùng làm Proxy upload ảnh (Avatar, Phim, v.v.).',
        isReadonly: false,
        getValue: () => dbSettingsCache['cloudflare_r2_url'] || defaultCodeKeys.cloudflare,
        category: 'dynamic'
    },
    {
        id: 'tmdb_api_key',
        title: 'TMDb API Key',
        service: 'Metadata Phim (The Movie Database)',
        icon: 'fas fa-database',
        description: 'Key từ themoviedb.org — bổ sung poster HD, trailer YouTube, thông tin diễn viên. Đăng ký miễn phí tại themoviedb.org/settings/api',
        isReadonly: false,
        getValue: () => dbSettingsCache['tmdb_api_key'] || '',
        category: 'dynamic',
        hasTmdbToggles: true
    },
    {
        id: 'gemini_api_key',
        title: 'Gemini AI API Key',
        service: 'Dịch Phụ Đề AI (Chuẩn Ngữ Cảnh)',
        icon: 'fas fa-brain',
        description: 'Mã bản quyền của Google Gemini. Dùng thay cho Google Dịch để dịch phụ đề chuẩn rạp chiếu phim (Lấy tại aistudio.google.com).',
        isReadonly: false,
        getValue: () => dbSettingsCache['gemini_api_key'] || '',
        category: 'dynamic'
    },
    {
        id: 'groq_api_key',
        title: 'Groq API Key',
        service: 'Dịch Phụ Đề AI (Siêu Nhanh — Llama 3.3)',
        icon: 'fas fa-bolt',
        description: 'Khóa API từ Groq — Tốc độ dịch siêu nhanh (300+ token/s) dùng Llama 3.3 70B. Miễn phí tại console.groq.com → API Keys → Create.',
        isReadonly: false,
        getValue: () => dbSettingsCache['groq_api_key'] || '',
        category: 'dynamic'
    }
];

// Khởi tạo
async function initApiKeysManager() {
    console.log("Khởi tạo Admin API Keys Manager...");
    
    // 0. Quét lấy giá trị mặc định từ Source Code
    await extractSourceCodeKeys();

    // 1. Kiểm tra bảng settings có tồn tại không
    await checkSettingsTable();
    
    // 2. Fetch data
    if (hasSystemSettingsTable) {
        await loadSettingsFromDB();
    }
    
    // --- SUDO MODE CHECK (từ DB) ---
    isSuperAdmin = verifySuperAdmin();
    // Đọc expiry từ DB cache (đã load ở bước 2)
    const dbExpiry = parseInt(dbSettingsCache['sudo_expiry_at'] || '0');
    if (dbExpiry && dbExpiry > Date.now()) {
        sudoUnlocked = true;
        sudoUnlockExpiredAt = dbExpiry;
    } else {
        sudoUnlocked = false;
        sudoUnlockExpiredAt = 0;
    }
    if (!checkSudoSession()) {
        renderSudoLockScreen();
        return; 
    }
    // -----------------------
    
    // 3. Render giao diện
    renderApiKeysUI();
}

async function checkSettingsTable() {
    try {
        const { error } = await window.supabase.from('system_settings').select('id').limit(1);
        if (error && (error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST205' || (error.message && error.message.includes('Could not find the table')))) {
            hasSystemSettingsTable = false;
        } else {
            hasSystemSettingsTable = true;
        }
    } catch (e) {
        console.error("Lỗi kiểm tra bảng system_settings:", e);
        hasSystemSettingsTable = false;
    }
}

async function extractSourceCodeKeys() {
    try {
        const [commRes, utilRes, wpRes] = await Promise.all([
            fetch('js/community.js').catch(() => null),
            fetch('js/utils.js').catch(() => null),
            fetch('js/watch-party.js').catch(() => null)
        ]);

        if (commRes && commRes.ok) {
            const text = await commRes.text();
            const match = text.match(/IMGBB_API_KEY\s*=\s*['"]([^'"]+)['"]/);
            if (match) defaultCodeKeys.imgbb = match[1];
            
            const matchCf = text.match(/R2_WORKER_URL\s*=\s*['"]([^'"]+)['"]/);
            if (matchCf) defaultCodeKeys.cloudflare = matchCf[1];
        }

        if (utilRes && utilRes.ok) {
            const text = await utilRes.text();
            const match = text.match(/_OMDB_KEY\s*=\s*['"]([^'"]+)['"]/);
            if (match) defaultCodeKeys.omdb = match[1];
        }

        if (wpRes && wpRes.ok) {
            const text = await wpRes.text();
            const match = text.match(/METERED_API_KEY\s*=\s*['"]([^'"]+)['"]/);
            if (match) defaultCodeKeys.metered = match[1];
            
            const matchName = text.match(/APP_NAME\s*=\s*['"]([^'"]+)['"]/);
            if (matchName) window.METERED_APP_NAME = matchName[1];
        }
    } catch(e) {
        console.warn("Lỗi khi đọc file cấu hình mặc định:", e);
    }
}

async function loadSettingsFromDB() {
    try {
        const { data, error } = await window.supabase.from('system_settings').select('*');
        if (error) throw error;
        
        dbSettingsCache = {};
        if (data && data.length > 0) {
            data.forEach(item => {
                dbSettingsCache[item.key_name] = item.key_value;
            });
        }
    } catch (e) {
        console.error('Không tải được settings từ db:', e);
    }
}

function renderApiKeysUI() {
    const container = document.getElementById('adminApiKeysContainer');
    if (!container) return;

    let html = '';

    // Banner quản trị cấp cao
    html += `
        <div class="sudo-header-actions">
            ${isSuperAdmin 
                ? '<div class="super-admin-badge" title="Tài khoản này nằm trong Danh sách Chủ Tịch"><i class="fas fa-crown"></i> Super Admin (Toàn Quyền)</div><button class="btn-change-pin" onclick="changeSudoPin()"><i class="fas fa-key"></i> Đổi Mã Sudo Mode</button>' 
                : '<div class="readonly-admin-badge" title="Tài khoản bạn không nằm trong cấu hình Chủ Tịch"><i class="fas fa-eye"></i> Quyền Quản trị viên (Chỉ Xem)</div>'
            }
            <div class="sudo-timer" id="sudoCountdownTimer" title="Thời gian Sudo Mode còn lại"><i class="fas fa-clock"></i> <span>--:--</span></div>
            <button class="btn-change-pin" style="background: rgba(255, 77, 77, 0.15); color: #ff4d4d; border-color: rgba(255, 77, 77, 0.3); margin-left: 10px;" onclick="lockSudoNow()" title="Khóa ngay khu vực này"><i class="fas fa-lock"></i> Khóa Lại</button>
        </div>
    `;

    // Nếu chưa có bảng
    if (!hasSystemSettingsTable) {
        html += `
            <div class="setup-db-banner">
                <h4><i class="fas fa-exclamation-triangle"></i> Yêu cầu cập nhật Cơ sở dữ liệu</h4>
                <p>Để tính năng lưu API Key hoạt động, bạn cần tạo bảng <strong>system_settings</strong> trên Supabase. Vui lòng chạy lệnh SQL sau trong <strong>SQL Editor</strong> của Supabase:</p>
                <div class="setup-sql-block">
CREATE TABLE system_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    key_name VARCHAR(255) UNIQUE NOT NULL,
    key_value TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
                </div>
                <button class="btn btn-sm btn-danger" style="width: fit-content;" onclick="checkSettingsTable().then(renderApiKeysUI)">
                    <i class="fas fa-sync-alt"></i> Đã chạy lệnh, thử lại
                </button>
            </div>
        `;
    }

    // Cloudflare & Telegram Config (Đã chuyển vào trong Sudo Mode)
    html += `
        <!-- Cloudflare R2 Config -->
        <div style="margin-bottom: 20px; padding: 18px 20px; background: rgba(0,210,255,0.04); border: 1px solid rgba(0,210,255,0.15); border-radius: 12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                <div style="display:flex; align-items:center; gap:10px;">
                <i class="fas fa-cloud-upload-alt" style="color:#00d2ff; font-size:1.2rem;"></i>
                <div>
                    <div style="font-weight:700; font-size:0.9rem; color:#fff;">Cloudflare R2 Worker</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">Upload ảnh phim lên Cloudflare R2 Storage</div>
                </div>
                </div>
                <button class="btn btn-sm" onclick="openR2ConfigModal()" title="Cấu hình R2 Worker URL" style="background:rgba(0,210,255,0.1);border:1px solid rgba(0,210,255,0.25);color:#00d2ff;font-size:0.75rem;">
                <i class="fas fa-cog"></i> Cấu hình URL
                </button>
            </div>
        </div>

        <!-- Telegram Bot Config -->
        <div style="margin-bottom: 20px; padding: 18px 20px; background: rgba(52,211,153,0.04); border: 1px solid rgba(52,211,153,0.15); border-radius: 12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                <div style="display:flex; align-items:center; gap:10px;">
                <i class="fab fa-telegram-plane" style="color:#34d399; font-size:1.3rem;"></i>
                <div>
                    <div style="font-weight:700; font-size:0.9rem; color:#fff;">Telegram Bot Báo Cáo</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">Nhận thông báo sau mỗi đợt Auto-Import</div>
                </div>
                </div>
                <button class="btn btn-sm" onclick="openTelegramConfigModal()" title="Cấu hình Telegram Bot" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);color:#34d399;font-size:0.75rem;">
                <i class="fas fa-cog"></i> Cấu hình Bot
                </button>
            </div>
        </div>
    `;

    html += '<div class="api-keys-grid">';

    API_KEYS_CONFIG.forEach(config => {
        html += `
            <div class="api-key-card ${config.isReadonly ? 'readonly-card' : ''}" id="apiKeyCard_${config.id}">
                ${generateApiKeyCardInnerHtml(config, false)}
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
    
    // Khởi động đồng hồ đếm ngược
    startSudoCountdown();

    // Chạy kiểm tra health-check cho tất cả các API Key hiện có
    checkAllApiHealth();
}

function generateApiKeyCardInnerHtml(config, isPoolOpen = false) {
    const value = config.getValue();
    const valueStr = value !== null && value !== undefined ? String(value).trim() : '';
    const isMaskedPreview = valueStr.length > 10 ? valueStr.substring(0, 4) + '******' + valueStr.slice(-4) : (valueStr ? '******' : '');
    
    // Kiểm tra quyền Super Admin
    const isLockedByRole = !isSuperAdmin;
    const isReadonly = config.isReadonly || isLockedByRole;

    const badgeSpan = config.isReadonly 
        ? '<span class="api-badge readonly"><i class="fas fa-lock"></i> Cố định trong Code</span>'
        : (isLockedByRole 
            ? '<span class="api-badge readonly-admin-badge" title="Bạn chỉ có quyền Xem"><i class="fas fa-eye"></i> Chỉ Xem</span>'
            : (dbSettingsCache[config.id] 
                ? '<span class="api-badge saved"><i class="fas fa-cloud"></i> Lưu tại Supabase</span>' 
                : '<span class="api-badge editable"><i class="fas fa-edit"></i> Có thể đổi</span>'));

    const inputHtml = isReadonly ? `
         <div class="api-key-input-container">
            <input type="text" class="api-key-input" value="${valueStr}" readonly disabled title="Bạn không có quyền sửa khóa này">
        </div>
    ` : `
        <div class="api-key-input-container">
            <input type="password" class="api-key-input" id="apiKeyInput_${config.id}" value="${valueStr}" placeholder="Nhập key mới..." oninput="onApiKeyValueChange('${config.id}')">
            <button class="api-btn-eye" onclick="toggleApiKeyVisibility('${config.id}')" title="Hiện/Ẩn">
                <i class="fas fa-eye" id="eyeIcon_${config.id}"></i>
            </button>
        </div>
    `;

    const actionBtn = isReadonly ? '' : `
        <div class="api-key-actions">
            <button class="api-btn-save" id="btnSave_${config.id}" onclick="saveApiKey('${config.id}', '${config.title}')" disabled>
                <i class="fas fa-save"></i> Lưu Thay Đổi
            </button>
        </div>
    `;
    
    let poolHtml = '';
    if (!config.isReadonly) {
        let pool = getKeyPool(config.id);
        const isAutoSwitch = dbSettingsCache[config.id + '_autoswitch'] === 'true';
        let autoSwitchHtml = `
            <div class="api-auto-switch-container">
                <label class="toggle-switch">
                    <input type="checkbox" id="autoSwitch_${config.id}" ${isAutoSwitch ? 'checked' : ''} onchange="toggleAutoSwitchKey('${config.id}', this.checked)">
                    <span class="slider round"></span>
                </label>
                <span class="auto-switch-label" title="Tự động bốc khóa khỏe dưới kho lên dùng khi khóa gốc bị lỗi">Tự động lấp chỗ trống (Auto-Fix)</span>
            </div>
        `;

        poolHtml = `
        <div class="api-key-pool-wrapper">
            <div class="api-key-pool-header ${isPoolOpen ? 'open' : ''}" id="poolHeader_${config.id}" onclick="togglePool('${config.id}')">
                <span><i class="fas fa-history"></i> Kho khóa dự phòng (<span id="poolCount_${config.id}">${pool.length}</span>)</span>
                <i class="fas fa-chevron-down fold-icon"></i>
            </div>
            ${autoSwitchHtml}
            <div class="api-key-pool-list" id="poolList_${config.id}" style="display:${isPoolOpen ? 'block' : 'none'};">
                ${renderPoolItems(config.id, pool, valueStr)}
            </div>
        </div>`;
    }

    // --- Render toggle switches cho TMDb features ---
    let tmdbTogglesHtml = '';
    if (!isLockedByRole && config.hasTmdbToggles) {
        tmdbTogglesHtml = renderTmdbToggles();
    }

    return `
        <div class="api-key-card-header">
            <div class="api-key-title-group">
                <div class="api-key-title">
                    <i class="${config.icon}"></i> ${config.title}
                </div>
                <div class="api-key-service">${config.service}</div>
            </div>
            ${badgeSpan}
        </div>
        <div class="api-key-desc">${config.description}</div>
        ${inputHtml}
        <div class="api-status checking" id="apiStatus_${config.id}">
            <i class="fas fa-spinner fa-spin api-status-icon"></i>
            <span class="api-status-msg" id="apiStatusMsg_${config.id}">Đang kiểm tra kết nối...</span>
        </div>
        ${tmdbTogglesHtml}
        ${poolHtml}
        ${actionBtn}
    `;
}

// ==========================================
// TMDB FEATURE TOGGLES
// ==========================================

/**
 * Render giao diện toggle on/off cho từng loại dữ liệu TMDb
 */
function renderTmdbToggles() {
    const features = [
        { key: 'poster',   icon: 'fas fa-image',       label: 'Poster dự phòng',   desc: 'Dùng poster TMDb khi ảnh gốc lỗi' },
        { key: 'backdrop', icon: 'fas fa-panorama',     label: 'Backdrop dự phòng', desc: 'Dùng backdrop TMDb khi ảnh nền gốc lỗi' },
        { key: 'trailer',  icon: 'fab fa-youtube',      label: 'Trailer YouTube',   desc: 'Hiện nút Xem Trailer trên trang phim & giới thiệu' },
        { key: 'cast',     icon: 'fas fa-users',        label: 'Thông tin diễn viên', desc: 'Bổ sung ảnh & thông tin diễn viên từ TMDb' },
    ];

    const items = features.map(f => {
        const isOn = dbSettingsCache['tmdb_use_' + f.key] === 'true';
        return `
            <div class="tmdb-toggle-item">
                <div class="tmdb-toggle-info">
                    <i class="${f.icon} tmdb-toggle-icon"></i>
                    <div>
                        <span class="tmdb-toggle-label">${f.label}</span>
                        <span class="tmdb-toggle-desc">${f.desc}</span>
                    </div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${isOn ? 'checked' : ''} onchange="toggleTmdbFeature('${f.key}', this.checked)">
                    <span class="slider round"></span>
                </label>
            </div>`;
    }).join('');

    return `
        <div class="tmdb-toggles-wrapper">
            <div class="tmdb-toggles-header">
                <i class="fas fa-sliders-h"></i> Bật / Tắt từng loại dữ liệu TMDb
            </div>
            <div class="tmdb-toggles-list">
                ${items}
            </div>
            <div style="padding: 10px 14px 12px; border-top: 1px solid rgba(1,180,228,0.12); margin-top: 4px;">
                <button class="btn-bulk-tmdb-scan" onclick="bulkScanTmdbCast()" title="Quét tất cả phim, tìm actor thiếu ảnh và bổ sung từ TMDb">
                    <i class="fas fa-magic"></i>
                    Quét &amp; Bổ sung ảnh diễn viên hàng loạt
                </button>
            </div>
        </div>`;
}

/**
 * Bật/tắt toggle cho từng loại dữ liệu TMDb, lưu vào Supabase
 * @param {string} feature - 'poster' | 'trailer' | 'backdrop' | 'cast'
 * @param {boolean} isEnabled
 */
async function toggleTmdbFeature(feature, isEnabled) {
    if (!hasSystemSettingsTable) {
        showNotification('Cần tạo bảng system_settings trước!', 'error');
        return;
    }
    const keyName = 'tmdb_use_' + feature;
    const val = isEnabled ? 'true' : 'false';

    try {
        const { error } = await window.supabase.from('system_settings').upsert({
            key_name: keyName,
            key_value: val,
            description: `TMDb toggle: ${feature}`,
            updated_at: new Date().toISOString()
        }, { onConflict: 'key_name' });

        if (error) throw error;

        dbSettingsCache[keyName] = val;
        const featureNames = { poster: 'Poster dự phòng', backdrop: 'Backdrop dự phòng', trailer: 'Trailer YouTube', cast: 'Thông tin diễn viên' };
        showNotification(`${isEnabled ? '✅ Đã bật' : '⛔ Đã tắt'} "${featureNames[feature] || feature}"`, 'success');
    } catch (e) {
        console.error('Lỗi lưu TMDb toggle:', e);
        showNotification('Lỗi khi lưu cấu hình TMDb: ' + e.message, 'error');
    }
}

function renderSingleApiKeyCard(id) {
    const card = document.getElementById(`apiKeyCard_${id}`);
    if (!card) return;
    
    const config = API_KEYS_CONFIG.find(c => c.id === id);
    if (!config) return;
    
    // Giữ trạng thái đóng mở của kho khóa
    let isPoolOpen = false;
    const poolList = document.getElementById(`poolList_${id}`);
    if (poolList && poolList.style.display === 'block') {
        isPoolOpen = true;
    }
    
    card.innerHTML = generateApiKeyCardInnerHtml(config, isPoolOpen);
    
    // Khởi chạy lại bộ kiểm tra mạng (Ping API lại ngay sau khi render xong card)
    const valueStr = String(config.getValue()).trim();
    checkApiHealthAndUpdateUI(id, valueStr);
}

function toggleApiKeyVisibility(id) {
    const input = document.getElementById(`apiKeyInput_${id}`);
    const icon = document.getElementById(`eyeIcon_${id}`);
    if (!input || !icon) return;

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

let apiCheckTimeout = {};

function onApiKeyValueChange(id) {
    const btn = document.getElementById(`btnSave_${id}`);
    const input = document.getElementById(`apiKeyInput_${id}`);
    if (!btn || !input) return;

    // Enable button when touched
    btn.disabled = false;
    btn.classList.add('btn-pulse'); // Thêm class nhấp nháy (tuỳ tâm CSS)

    const valueStr = input.value.trim();
    
    // Render cập nhật lại trạng thái Pool list ngay lập tức
    const list = document.getElementById(`poolList_${id}`);
    if(list) {
        let pool = getKeyPool(id);
        list.innerHTML = renderPoolItems(id, pool, valueStr);
    }

    // Cập nhật trạng thái thành "Đang kiểm tra..."
    const statusEl = document.getElementById(`apiStatus_${id}`);
    const msgEl = document.getElementById(`apiStatusMsg_${id}`);
    const iconEl = statusEl ? statusEl.querySelector('.api-status-icon') : null;

    if (statusEl && msgEl && iconEl) {
        statusEl.className = 'api-status checking';
        iconEl.className = 'api-status-icon fas fa-spinner fa-spin';
        msgEl.innerHTML = 'Đang kiểm tra key mới...';
    }

    // Debounce 1 giây sau khi ngừng gõ mới call API check sức khoẻ
    if (apiCheckTimeout[id]) clearTimeout(apiCheckTimeout[id]);
    apiCheckTimeout[id] = setTimeout(() => {
        checkApiHealthAndUpdateUI(id, valueStr);
    }, 1000);
}

async function saveApiKey(id, title) {
    if (!hasSystemSettingsTable) {
        showNotification('Bạn cần tạo bảng system_settings trước!', 'error');
        return;
    }

    const input = document.getElementById(`apiKeyInput_${id}`);
    const btn = document.getElementById(`btnSave_${id}`);
    if (!input || !btn) return;

    const newValue = input.value.trim();
    
    // Disable btn and show loading
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
    btn.disabled = true;

    try {
        // Lấy pool hiện tại
        let pool = getKeyPool(id);
        let oldActive = dbSettingsCache[id];
        let poolChanged = false;
        
        // Thêm khóa đang dùng cũ vào kho (nếu có và hợp lệ)
        if (oldActive && oldActive !== 'Chưa cấu hình' && !pool.includes(oldActive)) {
            pool.push(oldActive);
            poolChanged = true;
        }
        // Đảm bảo khóa mới nhập cũng nằm trong kho
        if (!pool.includes(newValue)) {
            pool.push(newValue);
            poolChanged = true;
        }

        const updates = [{
            key_name: id, 
            key_value: newValue,
            description: `Cấu hình cho ${title}`,
            updated_at: new Date().toISOString()
        }];

        // Cập nhật Pool nếu có biến động
        if (poolChanged) {
            updates.push({
                key_name: id + '_pool',
                key_value: JSON.stringify(pool),
                description: `Kho khóa dự phòng cho ${title}`,
                updated_at: new Date().toISOString()
            });
        }

        // Upsert vào Supabase (hỗ trợ lưu cả array multiple rows)
        const { error } = await window.supabase
            .from('system_settings')
            .upsert(updates, { onConflict: 'key_name' });
            
        if (error) throw error;

        // Xóa pulse effect
        btn.classList.remove('btn-pulse');
        
        // Update cache
        dbSettingsCache[id] = newValue;
        if (poolChanged) dbSettingsCache[id + '_pool'] = JSON.stringify(pool);
        
        showNotification(`Đã lưu ${title} thành công! Mọi thay đổi sẽ có tác dụng ngay.`, 'success');
        
        // Render lại UI để cập nhật badge (Chỉ với card này)
        setTimeout(() => {
            renderSingleApiKeyCard(id);
        }, 300);

    } catch (e) {
        console.error("Lỗi khi lưu API Key:", e);
        showNotification(`Lỗi khi lưu ${title}. Vui lòng thử lại.`, 'error');
    } finally {
        btn.innerHTML = originalText;
    }
}

// ==========================================
// API KEY POOL LOGIC
// ==========================================
function getKeyPool(id) {
    let poolStr = dbSettingsCache[id + '_pool'];
    let pool = [];
    if (poolStr) {
        try { pool = JSON.parse(poolStr); } catch(e) {}
    }
    return pool;
}

function renderPoolItems(id, pool, inputVal) {
    const dbVal = dbSettingsCache[id];
    let html = '';
    
    if (!pool || pool.length === 0) {
        html += '<div class="pool-empty">Chưa có khóa nào dự phòng trong kho</div>';
    } else {
        pool.forEach(k => {
            let matchesInput = (k === inputVal);
            let matchesDB = (k === dbVal);
            
            let actionHtml = '';
            if (matchesInput) {
                // Khóa đang hiển thị ở thẻ Input (Đã chọn)
                actionHtml = `<span class="pool-badge">${matchesDB ? 'Đang dùng' : 'Đang chọn'}</span>`;
            } else {
                if (matchesDB) {
                    // Đây là khóa đang cài dưới DB, nhưng ô Input lại đang nhập khóa khác (Chưa lưu) -> Hiện nút Khôi phục
                    actionHtml = `
                        <span class="pool-badge" style="background:rgba(255,255,255,0.1);color:#aaa;font-size:0.65rem;" title="Khóa đang hoạt động">Gốc</span>
                        <button class="btn-pool-use" onclick="useKeyFromPool('${id}', '${k}')" title="Phục hồi lại khóa đang chạy"><i class="fas fa-undo"></i> Hủy đổi</button>
                    `;
                } else {
                    // Khóa dự phòng bình thường
                    actionHtml = `<button class="btn-pool-use" onclick="useKeyFromPool('${id}', '${k}')" title="Dùng khóa này"><i class="fas fa-check"></i> Chọn</button>`;
                }
            }
            
            let mask = k.length > 20 ? k.substring(0,6) + '...' + k.slice(-6) : (k.length > 8 ? k.substring(0,3) + '***' + k.slice(-3) : k);
            html += `
                <div class="pool-item ${matchesInput ? 'active' : ''}">
                    <span class="pool-key-text" title="${k}">${mask}</span>
                    <div class="pool-actions">
                        ${actionHtml}
                        <button class="btn-pool-del" onclick="deleteKeyFromPool('${id}', '${k}')" title="Xóa khỏi kho"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        });
    }
    
    html += `
        <div class="pool-add-inline" id="poolAddInline_${id}" style="display: none;">
            <input type="text" id="poolAddInput_${id}" class="pool-add-input" placeholder="Dán khóa mới vào đây...">
            <div class="pool-add-actions">
                <button class="btn-pool-save" onclick="confirmAddNewKey('${id}')"><i class="fas fa-check"></i> Lưu Khóa</button>
                <button class="btn-pool-cancel" onclick="toggleAddPoolInput('${id}')"><i class="fas fa-times"></i> Hủy</button>
            </div>
        </div>
        <button class="btn-pool-add" id="btnPoolAdd_${id}" onclick="toggleAddPoolInput('${id}')">
            <i class="fas fa-plus"></i> Thêm khóa dự phòng trực tiếp
        </button>
    `;
    
    return html;
}

function togglePool(id) {
    const header = document.querySelector(`#poolHeader_${id}`);
    const list = document.querySelector(`#poolList_${id}`);
    if(!list || !header) return;
    
    if (list.style.display === 'none') {
        list.style.display = 'block';
        header.classList.add('open');
    } else {
        list.style.display = 'none';
        header.classList.remove('open');
    }
}

function toggleAddPoolInput(id) {
    const inline = document.getElementById(`poolAddInline_${id}`);
    const btn = document.getElementById(`btnPoolAdd_${id}`);
    const input = document.getElementById(`poolAddInput_${id}`);
    if(!inline || !btn) return;

    if (inline.style.display === 'none') {
        inline.style.display = 'block';
        btn.style.display = 'none';
        if(input) { input.value = ''; input.focus(); }
    } else {
        inline.style.display = 'none';
        btn.style.display = 'flex';
    }
}

function useKeyFromPool(id, keyStr) {
    const input = document.getElementById(`apiKeyInput_${id}`);
    if(input) {
        input.value = keyStr;
        onApiKeyValueChange(id);
    }
}

async function deleteKeyFromPool(id, keyStr) {
    if(!confirm('Bạn có chắc muốn xóa khóa này khỏi kho dự phòng mãi mãi?')) return;
    
    let pool = getKeyPool(id);
    pool = pool.filter(k => k !== keyStr);
    
    // update db
    const {error} = await window.supabase.from('system_settings').upsert({
        key_name: id + '_pool',
        key_value: JSON.stringify(pool),
        updated_at: new Date().toISOString()
    }, { onConflict: 'key_name' });
    
    if(!error) {
        dbSettingsCache[id + '_pool'] = JSON.stringify(pool);
        showNotification('Đã xóa khóa khỏi kho dự phòng thành công.', 'success');
        renderSingleApiKeyCard(id); // Chỉ render lại thẻ này
    } else {
        showNotification('Lỗi khi xóa khóa: ' + error.message, 'error');
    }
}

async function confirmAddNewKey(id) {
    const input = document.getElementById(`poolAddInput_${id}`);
    if (!input) return;
    
    const keyStr = input.value.trim();
    if (!keyStr) {
        showNotification('Vui lòng nhập khóa dự phòng mới', 'warning');
        return;
    }
    
    let pool = getKeyPool(id);
    
    if (pool.includes(keyStr)) {
        showNotification('Khóa này đã có sẵn trong kho!', 'warning');
        return;
    }
    
    pool.push(keyStr);
    
    // update db
    const {error} = await window.supabase.from('system_settings').upsert({
        key_name: id + '_pool',
        key_value: JSON.stringify(pool),
        updated_at: new Date().toISOString()
    }, { onConflict: 'key_name' });
    
    if(!error) {
        dbSettingsCache[id + '_pool'] = JSON.stringify(pool);
        showNotification('Đã lưu khóa dự phòng mới vào kho thành công.', 'success');
        renderSingleApiKeyCard(id); // Reload single card
    } else {
        showNotification('Lỗi khi lưu khóa: ' + error.message, 'error');
    }
}

// ==========================================
// HEALTH CHECK LOGIC
// ==========================================
async function checkAllApiHealth() {
    for (const config of API_KEYS_CONFIG) {
        const value = config.getValue();
        const valueStr = value !== null && value !== undefined ? String(value).trim() : '';
        await checkApiHealthAndUpdateUI(config.id, valueStr);
    }
}

async function checkApiHealthAndUpdateUI(id, valueStr) {
    const statusEl = document.getElementById(`apiStatus_${id}`);
    const msgEl = document.getElementById(`apiStatusMsg_${id}`);
    const iconEl = statusEl ? statusEl.querySelector('.api-status-icon') : null;
    
    if (!statusEl || !msgEl || !iconEl) return;

    // Set đang kết nối
    statusEl.className = 'api-status checking';
    iconEl.className = 'api-status-icon fas fa-spinner fa-spin';
    msgEl.innerHTML = 'Đang kiểm tra kết nối...';

    let isOk = false;
    let errorMsg = '';
    
    try {
        const health = await checkApiHealth(id, valueStr);
        isOk = health.ok;
        errorMsg = health.msg;
    } catch(e) {
        isOk = false;
        errorMsg = "Lỗi mạng / Block CORS (" + e.message + ")";
    }
    
    statusEl.className = `api-status ${isOk ? 'success' : 'error'}`;
    iconEl.className = `api-status-icon fas ${isOk ? 'fa-check-circle' : 'fa-times-circle'}`;
    
    if (!isOk) {
        let pool = getKeyPool(id);
        let hasOtherKeys = pool.some(k => k !== valueStr);
        let isAutoSwitch = dbSettingsCache[id + '_autoswitch'] === 'true';
        
        if (hasOtherKeys) {
            if (isAutoSwitch) {
                msgEl.innerHTML = `${errorMsg} <br><span style="color:var(--accent-primary, #00d2ff); font-size:0.85rem; margin-top:5px; display:inline-block;"><i class="fas fa-magic"></i> Đang tự xoay vòng khóa...</span>`;
                setTimeout(() => autoSwitchBackupKey(id), 500);
            } else {
                msgEl.innerHTML = `${errorMsg} <button class="btn-auto-switch" onclick="autoSwitchBackupKey('${id}')" title="Tự động tìm khóa sống trong kho để đổi"><i class="fas fa-magic"></i> Auto Fix</button>`;
            }
        } else {
            msgEl.innerHTML = errorMsg;
        }
    } else {
        msgEl.innerHTML = errorMsg;
    }
}

// Bật/Tắt tính năng Auto Switch
async function toggleAutoSwitchKey(id, isEnabled) {
    const val = isEnabled ? 'true' : 'false';
    const {error} = await window.supabase.from('system_settings').upsert({
        key_name: id + '_autoswitch',
        key_value: val,
        updated_at: new Date().toISOString()
    }, {onConflict: 'key_name'});
    
    if(!error) {
        dbSettingsCache[id + '_autoswitch'] = val;
        showNotification(isEnabled ? 'Đã BẬT tự động lấp khóa trống!' : 'Đã TẮT tự động lấp khóa trống.', 'success');
        
        if (isEnabled) {
            const currentVal = document.getElementById(`apiKeyInput_${id}`)?.value.trim() || dbSettingsCache[id];
            checkApiHealthAndUpdateUI(id, currentVal); 
        }
    } else {
        showNotification('Lỗi lưu cấu hình: ' + error.message, 'error');
        document.getElementById(`autoSwitch_${id}`).checked = !isEnabled;
    }
}

async function checkApiHealth(id, key) {
    if (!key || key === 'Chưa cấu hình' || key.trim() === '') return { ok: false, msg: "Chưa cấu hình API Key" };
    
    try {
        switch(id) {
            case 'supabase_url':
            case 'supabase_anon_key':
                if (window.supabase) {
                    // Test ping tới Database bằng cách select limit 1 bảng system_settings
                    const {error} = await window.supabase.from('system_settings').select('id').limit(1);
                    if(error && !(error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST205' || (error.message && error.message.includes('Could not find the table')))) { 
                       return { ok: false, msg: "Lỗi kết nối từ Supabase: " + error.message }; 
                    }
                    if(error) return { ok: false, msg: "Chưa tạo bảng system_settings" };
                    return { ok: true, msg: "Kết nối Database ổn định" };
                }
                return { ok: false, msg: "Thư viện Supabase JS chưa được load" };
                
            case 'firebase_api_key':
                return { ok: true, msg: "Mã Firebase đã được khai báo (" + key.substring(0,5) + "...)" };
                
            case 'imgbb_api_key':
                const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, { method: 'POST' });
                const imgbbData = await imgbbRes.json();
                if (imgbbRes.status === 401 || imgbbRes.status === 403) return { ok: false, msg: imgbbData.error?.message || "Khóa không hợp lệ" };
                // 400 Bad Request do gửi không có ảnh cũng chứng tỏ key xịn
                if (imgbbRes.status === 400 && imgbbData.error?.message?.includes("Empty upload source")) return { ok: true, msg: "Khóa hợp lệ. Phản hồi tốt." };
                return { ok: true, msg: "Kết nối thành công" };
                
            case 'omdb_api_key':
                const omdbRes = await fetch(`https://www.omdbapi.com/?apikey=${key}&t=a`);
                const omdbData = await omdbRes.json();
                if (omdbData.Response === "False") return { ok: false, msg: omdbData.Error || "Lỗi khóa OMDB" };
                return { ok: true, msg: "Khóa hợp lệ. Có thể tra cứu phim." };
                
            case 'metered_api_key':
                const appName = window.METERED_APP_NAME || 'tramphim';
                const metRes = await fetch(`https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${key}`);
                const metData = await metRes.json();
                if (!metRes.ok) return { ok: false, msg: metData.error || metData.message || "Invalid API Key" };
                return { ok: true, msg: "Máy chủ Video Call: Đang hoạt động (Online)" };
                
            case 'tmdb_api_key':
                const tmdbPingRes = await fetch(`https://api.themoviedb.org/3/movie/550?api_key=${key}`);
                const tmdbPingData = await tmdbPingRes.json();
                if (tmdbPingData.status_code === 7) return { ok: false, msg: 'API Key không hợp lệ (Invalid API key)' };
                if (!tmdbPingRes.ok) return { ok: false, msg: tmdbPingData.status_message || 'Lỗi kết nối TMDb' };
                return { ok: true, msg: `Kết nối TMDb OK — Phim test: "${tmdbPingData.title}" (${tmdbPingData.release_date?.substring(0,4)})` };

            case 'cloudflare_r2_url':
                try {
                    // Cố tình gửi POST trống để ép Worker trả về CORS và HTTP Code (chứng minh server sống)
                    let checkUrl = key;
                    if(checkUrl.endsWith('/')) checkUrl = checkUrl.slice(0, -1);
                    const cfRes = await fetch(checkUrl + '/upload', { method: 'POST' });
                    
                    // Worker thường trả về 400 Bad Request nếu request không có file ảnh, nhưng như vậy nghĩa là máy chủ R2 Worker đang online và cấu hình đúng.
                    return { ok: true, msg: "Máy chủ Cloudflare R2 Worker phản hồi tốt (Status: " + cfRes.status + ")" };
                } catch(e) {
                    return { ok: false, msg: "Không thể kết nối tới Cloudflare R2 (" + e.message + ")" };
                }
                
            default:
                return { ok: true, msg: "Đã thiết lập" };
        }
    } catch(err) {
        return { ok: false, msg: "Lỗi mạng hoặc CORS: " + err.message };
    }
}

// ==========================================
// AUTO FIX BẰNG KHO KHÓA DỰ PHÒNG
// ==========================================
async function autoSwitchBackupKey(id) {
    let pool = getKeyPool(id);
    if (!pool || pool.length === 0) {
        showNotification('Không có khóa dự phòng nào trong kho!', 'warning');
        return;
    }
    
    showNotification('Đang quét tìm khóa sống trong kho dự phòng...', 'info');
    
    let aliveKey = null;
    let alivePoolIndex = -1;
    
    const dbActive = dbSettingsCache[id];
    
    for (let i = 0; i < pool.length; i++) {
        let k = pool[i];
        if (k === dbActive) continue;
        
        try {
            let h = await checkApiHealth(id, k);
            if (h.ok) {
                aliveKey = k;
                alivePoolIndex = i;
                break;
            }
        } catch(e) {}
    }
    
    if (!aliveKey) {
        showNotification('Tất cả khóa trong kho đều đã chết hoặc bị giới hạn!', 'error');
        return;
    }
    
    // Swap khóa cũ bị lỗi vào pool, lấy khóa sống ra ngoài
    let newPool = [...pool];
    newPool.splice(alivePoolIndex, 1);
    if (dbActive && dbActive !== 'Chưa cấu hình' && !newPool.includes(dbActive)) {
        newPool.push(dbActive);
    }
    
    // Auto Update xuống Database ngay lập tức
    const updates = [
        { key_name: id, key_value: aliveKey, updated_at: new Date().toISOString() },
        { key_name: id + '_pool', key_value: JSON.stringify(newPool), updated_at: new Date().toISOString() }
    ];

    const { error } = await window.supabase.from('system_settings').upsert(updates, { onConflict: 'key_name' });
        
    if (error) {
        showNotification('Lỗi khi tự động lưu Khóa: ' + error.message, 'error');
        return;
    }
    
    // Update local cache
    dbSettingsCache[id] = aliveKey;
    dbSettingsCache[id + '_pool'] = JSON.stringify(newPool);
    
    showNotification('Đã tự động tìm và chuyển sang Khóa phụ sống sót!', 'success');
    renderSingleApiKeyCard(id);
}


// ==========================================
// SUDO MODE & SUPER ADMIN FUNCTIONS
// ==========================================

function checkSudoSession() {
    if (sudoUnlocked && Date.now() < sudoUnlockExpiredAt) {
        return true;
    }
    sudoUnlocked = false;
    return false;
}

function verifySuperAdmin() {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.email) return false;
    
    let allowedEmailsStr = dbSettingsCache['super_admin_emails'];
    let allowedEmails = [];
    if (allowedEmailsStr) {
        allowedEmails = allowedEmailsStr.split(',').map(e => e.trim().toLowerCase());
    } else {
        allowedEmails = SUPER_ADMINS_DEFAULT;
        if (hasSystemSettingsTable && window.supabase) {
            window.supabase.from('system_settings').upsert({
                key_name: 'super_admin_emails',
                key_value: allowedEmails.join(', '),
                updated_at: new Date().toISOString()
            }, { onConflict: 'key_name' }).then(()=>{}).catch(()=>{});
        }
    }
    return allowedEmails.includes(currentUser.email.trim().toLowerCase());
}

function renderSudoLockScreen() {
    const container = document.getElementById('adminApiKeysContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="api-keys-wrapper" style="position: relative; min-height: 400px; display: flex;">
            <div class="sudo-lock-screen" id="sudoLockScreen">
                <i class="fas fa-user-shield sudo-lock-icon"></i>
                <h2 class="sudo-lock-title">Khu Vực Bảo Mật Cấp 2</h2>
                <p class="sudo-lock-desc">Vui lòng nhập Mã bảo mật Sudo để tiến hành truy cập. Phiên đăng nhập sẽ được mở khóa trong vòng 30 phút.</p>
                <div class="sudo-pin-container">
                    <input style="display:none" type="text" name="fake_user" autocomplete="username">
                    <input style="display:none" type="password" name="fake_password" autocomplete="current-password">
                    <input type="password" spellcheck="false" autocomplete="new-password" class="sudo-pin-input" id="sudoPinInput" placeholder="******" maxlength="6" onkeyup="if(event.key==='Enter') unlockSudoMode()">
                    <button type="button" class="sudo-btn-eye" onclick="toggleSudoPinVisibility()" title="Hiện/Ẩn mã PIN">
                        <i class="fas fa-eye" id="sudoEyeIcon"></i>
                    </button>
                </div>
                <div class="sudo-error-msg" id="sudoErrorMsg"></div>
                <button class="sudo-unlock-btn" onclick="unlockSudoMode()" id="btnUnlockSudo">
                    <i class="fas fa-lock-open"></i> Mở Khóa Quản Lý
                </button>
                <div style="margin-top: 1.5rem;">
                    <button type="button" class="btn-forgot-pin" onclick="showForgotPinOptions()" style="background: none; border: none; color: #aaa; text-decoration: underline; cursor: pointer; font-size: 0.9rem; transition: color 0.2s;">
                        <i class="fas fa-question-circle"></i> Quên Mã PIN?
                    </button>
                </div>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        const pinInput = document.getElementById('sudoPinInput');
        if(pinInput) pinInput.focus();
    }, 100);
}

function unlockSudoMode() {
    const input = document.getElementById('sudoPinInput');
    const errorMsg = document.getElementById('sudoErrorMsg');
    const btn = document.getElementById('btnUnlockSudo');
    
    if (!input || !errorMsg || !btn) return;
    
    const pin = input.value.trim();
    if (!pin) {
        errorMsg.innerText = "Vui lòng nhập Mã PIN!";
        return;
    }
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xác thực...';
    btn.disabled = true;
    errorMsg.innerText = "";
    
    let correctPin = dbSettingsCache['admin_api_pin'];
    if (!correctPin) {
        correctPin = SUDO_PIN_DEFAULT;
        if (hasSystemSettingsTable && window.supabase) {
            window.supabase.from('system_settings').upsert({
                key_name: 'admin_api_pin',
                key_value: correctPin,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key_name' }).then(()=>{}).catch(()=>{});
        }
    }
    
    setTimeout(() => {
        if (pin === correctPin) {
            sudoUnlocked = true;
            sudoUnlockExpiredAt = Date.now() + 30 * 60000;
            
            // Lưu lên Supabase DB
            if (window.supabase && hasSystemSettingsTable) {
                window.supabase.from('system_settings').upsert({
                    key_name: 'sudo_expiry_at',
                    key_value: sudoUnlockExpiredAt.toString(),
                    description: 'Thời điểm hết hạn Sudo Mode (timestamp ms)',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key_name' }).then(() => {
                    dbSettingsCache['sudo_expiry_at'] = sudoUnlockExpiredAt.toString();
                }).catch(e => console.warn('Lỗi lưu sudo expiry:', e));
            }
            
            // Re-render
            renderApiKeysUI();
        } else {
            errorMsg.innerText = "❌ Mã PIN Sudo không chính xác!";
            btn.innerHTML = '<i class="fas fa-lock-open"></i> Mở Khóa Quản Lý';
            btn.disabled = false;
            input.value = "";
            input.focus();
        }
    }, 400); // 400ms fake delay cho ngầu
}

function toggleSudoPinVisibility() {
    const input = document.getElementById('sudoPinInput');
    const icon = document.getElementById('sudoEyeIcon');
    if (!input || !icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function changeSudoPin() {
    if (!isSuperAdmin) {
        showNotification("Bạn không có quyền Super Admin để đổi Mã PIN!", 'error');
        return;
    }
    
    openSudoModal(
        '<i class="fas fa-key"></i> Đổi Mã Sudo Mode',
        'Vui lòng nhập Mã bảo mật mới (Yêu cầu chính xác 6 ký tự số hoặc chữ):',
        '<i class="fas fa-save"></i> LƯU THAY ĐỔI',
        async (newPin) => {
            const btn = document.getElementById('sudoModalConfirmBtn');
            const err = document.getElementById('sudoModalError');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Xử lý...';
            btn.disabled = true;
            
            try {
                const { error } = await window.supabase.from('system_settings').upsert({
                    key_name: 'admin_api_pin',
                    key_value: newPin,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key_name' });
                
                if (error) throw error;
                
                dbSettingsCache['admin_api_pin'] = newPin;
                showNotification("Đã bảo mật Mã Sudo Mode mới thành công!", "success");
                closeSudoModal();
            } catch(e) {
                err.innerText = "Lỗi cập nhật: " + e.message;
                btn.innerHTML = '<i class="fas fa-save"></i> LƯU THAY ĐỔI';
                btn.disabled = false;
            }
        }
    );
}

function showForgotPinOptions() {
    if (!isSuperAdmin) {
        showNotification("❌ Chỉ có Chủ Tịch (Super Admin) mới có quyền Khôi phục Mã PIN. Vui lòng liên hệ Admin trưởng!", "error");
        return;
    }
    
    openSudoModal(
        '<i class="fas fa-life-ring"></i> Khôi phục Mã PIN', 
        'Hệ thống nhận diện Email của bạn là Chủ Tịch (Super Admin). Bạn có đặc quyền đặt lại Mã Sudo mới ngay bây giờ mà không cần mã cũ.<br><br><b>Nhập Mã PIN mới (6 ký tự):</b>', 
        '<i class="fas fa-redo"></i> ĐẶT LẠI MÃ MỚI',
        async (newPin) => {
            const btn = document.getElementById('sudoModalConfirmBtn');
            const err = document.getElementById('sudoModalError');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Xử lý...';
            btn.disabled = true;
            
            try {
                const { error } = await window.supabase.from('system_settings').upsert({
                    key_name: 'admin_api_pin',
                    key_value: newPin,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key_name' });
                
                if (error) throw error;
                
                dbSettingsCache['admin_api_pin'] = newPin;
                showNotification("Đã khôi phục thành công! Vui lòng nhập Mã PIN vừa tạo để mở khóa.", "success");
                closeSudoModal();
            } catch(e) {
                err.innerText = "Lỗi khôi phục: " + e.message;
                btn.innerHTML = '<i class="fas fa-redo"></i> ĐẶT LẠI MÃ MỚI';
                btn.disabled = false;
            }
        }
    );
}

// Custom Modal System
let sudoModalCallback = null;

function openSudoModal(title, desc, confirmText, callback) {
    let modal = document.getElementById('sudoCustomModal');
    if (!modal) {
        const modalHtml = `
            <div class="sudo-custom-modal" id="sudoCustomModal">
                <div class="sudo-modal-content">
                    <h3 id="sudoModalTitle">Đổi Mã Sudo Mode</h3>
                    <p id="sudoModalDesc">Vui lòng nhập Mã bảo mật mới (Yêu cầu đúng 6 ký tự):</p>
                    <div class="sudo-pin-container" style="margin: 1.5rem auto 1rem; justify-content: center; width: fit-content;">
                        <input type="text" spellcheck="false" autocomplete="off" class="sudo-pin-input" id="sudoModalInput" placeholder="******" maxlength="6" onkeyup="if(event.key==='Enter') document.getElementById('sudoModalConfirmBtn').click()">
                    </div>
                    <div class="sudo-error-msg" id="sudoModalError"></div>
                    <div class="sudo-modal-actions">
                        <button class="btn-sudo-cancel" onclick="closeSudoModal()">Hủy</button>
                        <button class="btn-sudo-confirm" id="sudoModalConfirmBtn">Xác Nhận</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('sudoCustomModal');
    }
    
    document.getElementById('sudoModalTitle').innerHTML = title;
    document.getElementById('sudoModalDesc').innerHTML = desc;
    
    const btnConfirm = document.getElementById('sudoModalConfirmBtn');
    btnConfirm.innerHTML = confirmText;
    btnConfirm.disabled = false;
    
    const input = document.getElementById('sudoModalInput');
    input.value = '';
    
    document.getElementById('sudoModalError').innerText = '';
    
    // Remove old listeners
    const newBtn = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
    
    sudoModalCallback = callback;
    
    newBtn.addEventListener('click', () => {
        const val = input.value.trim();
        if (val.length !== 6) {
            document.getElementById('sudoModalError').innerText = "Vui lòng nhập đủ 6 ký tự!";
            return;
        }
        document.getElementById('sudoModalError').innerText = "";
        if (sudoModalCallback) sudoModalCallback(val);
    });
    
    modal.classList.add('active');
    setTimeout(() => input.focus(), 100);
}

function closeSudoModal() {
    const modal = document.getElementById('sudoCustomModal');
    if (modal) modal.classList.remove('active');
    sudoModalCallback = null;
}

// Timer Logic
function startSudoCountdown() {
    if (sudoTimerInterval) clearInterval(sudoTimerInterval);
    
    sudoTimerInterval = setInterval(() => {
        const timerEl = document.querySelector('#sudoCountdownTimer span');
        if (!timerEl) return;
        
        let remainingTime = sudoUnlockExpiredAt - Date.now();
        if (remainingTime <= 0) {
            clearInterval(sudoTimerInterval);
            lockSudoNow();
            return;
        }
        
        let minutes = Math.floor(remainingTime / 60000);
        let seconds = Math.floor((remainingTime % 60000) / 1000);
        timerEl.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (remainingTime < 300000) { // < 5 minutes
            timerEl.parentElement.classList.add('warning');
        } else {
            timerEl.parentElement.classList.remove('warning');
        }
    }, 1000);
}

function lockSudoNow() {
    sudoUnlocked = false;
    sudoUnlockExpiredAt = 0;
    if (sudoTimerInterval) clearInterval(sudoTimerInterval);
    
    // Xóa khỏi DB
    if (window.supabase && hasSystemSettingsTable) {
        window.supabase.from('system_settings').upsert({
            key_name: 'sudo_expiry_at',
            key_value: '0',
            updated_at: new Date().toISOString()
        }, { onConflict: 'key_name' }).then(() => {
            dbSettingsCache['sudo_expiry_at'] = '0';
        }).catch(e => console.warn('Lỗi xóa sudo expiry:', e));
    }
    
    renderSudoLockScreen();
}

// ============================================
// AUTO PRE-LOAD API KEYS FOR BACKGROUND TASKS (AI SUBTITLE)
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    // Đợi 2 giây để chắc chắn window.supabase đã được khởi tạo
    setTimeout(async () => {
        if (typeof window.supabase !== 'undefined') {
            try {
                // Kiểm tra bảng và nạp ngay dbSettingsCache
                await checkSettingsTable();
                if (hasSystemSettingsTable) {
                    await loadSettingsFromDB();
                    console.log("[Trạm Phim] Đã tải trước", Object.keys(dbSettingsCache).length, "cấu hình API Core vào nền.");
                }
            } catch (error) {
                console.warn("[Trạm Phim] Lỗi tải trước API Keys:", error);
            }
        }
    }, 2000);
});
