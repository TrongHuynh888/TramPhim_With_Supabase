/**
 * ============================================
 * ADMIN API KEYS MANAGEMENT
 * ============================================
 */

let hasSystemSettingsTable = true;
// Cache settings từ DB
let dbSettingsCache = {};

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
    
    // Chạy kiểm tra health-check cho tất cả các API Key hiện có
    checkAllApiHealth();
}

function generateApiKeyCardInnerHtml(config, isPoolOpen = false) {
    const value = config.getValue();
    const valueStr = value !== null && value !== undefined ? String(value).trim() : '';
    const isMaskedPreview = valueStr.length > 10 ? valueStr.substring(0, 4) + '******' + valueStr.slice(-4) : (valueStr ? '******' : '');
    
    const badgeSpan = config.isReadonly 
        ? '<span class="api-badge readonly"><i class="fas fa-lock"></i> Cố định trong Code</span>'
        : (dbSettingsCache[config.id] 
            ? '<span class="api-badge saved"><i class="fas fa-cloud"></i> Lưu tại Supabase</span>' 
            : '<span class="api-badge editable"><i class="fas fa-edit"></i> Có thể đổi</span>');

    const inputHtml = config.isReadonly ? `
         <div class="api-key-input-container">
            <input type="text" class="api-key-input" value="${valueStr}" readonly disabled>
        </div>
    ` : `
        <div class="api-key-input-container">
            <input type="password" class="api-key-input" id="apiKeyInput_${config.id}" value="${valueStr}" placeholder="Nhập key mới..." oninput="onApiKeyValueChange('${config.id}')">
            <button class="api-btn-eye" onclick="toggleApiKeyVisibility('${config.id}')" title="Hiện/Ẩn">
                <i class="fas fa-eye" id="eyeIcon_${config.id}"></i>
            </button>
        </div>
    `;

    const actionBtn = config.isReadonly ? '' : `
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
        ${poolHtml}
        ${actionBtn}
    `;
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

