// --- KHAI BÁO BIẾN TOÀN CỤC (Đảm bảo luôn tồn tại để tránh ReferenceError) ---
window.editingUserId = null;
window.selectedActorIds = [];
window.latestAddedActorIds = JSON.parse(localStorage.getItem('latestAddedActorIds') || '[]');
window.latestAutoActorIds = JSON.parse(localStorage.getItem('latestAutoAutoIds') || '[]');

window.allAdminNotifications = [];
window.adminNotifUnsubscribe = null;
window.allScheduledNotifs = [];
window.scheduledNotifUnsubscribe = null;
window.allVipRequests = [];

/**
 * 🔥 TỐI ƯU HÓA: Hàm thông báo thay đổi dữ liệu để đồng bộ Cache người dùng
 * @param {string} type - 'movies', 'actors', 'categories', 'countries'
 */
async function notifyDataChange(type) {
    if (!supabase) return;
    try {
        const now = Date.now();
        const { data: currentSync } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'sync')
            .maybeSingle();
        
        const updateData = {
            ...(currentSync?.value || {}),
            [type]: now,
            lastUpdated: now
        };

        await supabase.from('app_configs').upsert({
            key: 'sync',
            value: updateData,
            updated_at: new Date().toISOString()
        });
        
        console.log(`📡 Đã gửi tín hiệu đồng bộ Metadata Supabase cho: ${type}`);
    } catch (e) {
        console.warn("⚠️ Không thể cập nhật Metadata Sync Supabase:", e);
    }
}

// Phân trang diễn viên
let currentActorPage = 1;
const actorsPerPage = 20;

// Phân trang các tab khác
let currentAdminMoviePage = 1;
let currentAdminEpisodePage = 1;
let currentEpMovieSelectPage = 1; // Trang hiện tại của grid chọn phim (tab Tập)
let currentAdminUserPage = 1;
let currentAdminNotifPage = 1;
let currentAdminVipPage = 1;
let currentAdminErrorPage = 1;
let currentAdminRoomPage = 1;

const adminPerPage = 15; // Số mục mỗi trang mặc định cho các tab

/**
 * TỐI ƯU HÓA: DEBOUNCE CHO CÁC HÀM TÌM KIẾM ADMIN
 * Giúp giảm lag khi người dùng nhập liệu nhanh vào các ô tìm kiếm
 */
window.filterAdminMoviesDebounced = debounce(() => {
    window.currentAdminMoviePage = 1;
    if (typeof filterAdminMovies === 'function') filterAdminMovies();
}, 300);
window.filterEpisodeMoviesDebounced = debounce(() => {
    // Lưu ý: Tab Episodes có 2 bước, chọn phim và chọn tập. 
    // Ở đây reset trang grid chọn phim về 1 khi tìm kiếm.
    window.currentEpMovieSelectPage = 1;
    window.currentAdminEpisodePage = 1; 
    if (typeof filterEpisodeMovies === 'function') filterEpisodeMovies();
}, 300);
window.filterAdminUsersDebounced = debounce(() => {
    currentAdminUserPage = 1;
    if (typeof filterAdminUsers === 'function') filterAdminUsers();
}, 300);
window.renderAdminCategoriesDebounced = debounce(() => typeof renderAdminCategories === 'function' && renderAdminCategories(), 300);
window.renderAdminCountriesDebounced = debounce(() => typeof renderAdminCountries === 'function' && renderAdminCountries(), 300);
window.renderAdminActorsDebounced = debounce(() => {
    currentActorPage = 1; 
    if (typeof renderAdminActors === 'function') renderAdminActors();
}, 300);
window.filterAdminCommentsDebounced = debounce(() => {
    // Bình luận chưa yêu cầu phân trang cụ thể nhưng nên reset nếu sau này thêm
    if (typeof filterAdminComments === 'function') filterAdminComments();
}, 300);
window.filterAdminNotificationsDebounced = debounce(() => {
    currentAdminNotifPage = 1;
    if (typeof filterAdminNotifications === 'function') filterAdminNotifications();
}, 300);
window.filterAdminVipRequestsDebounced = debounce(() => {
    currentAdminVipPage = 1;
    if (typeof filterAdminVipRequests === 'function') filterAdminVipRequests();
}, 300);
window.filterErrorReportsDebounced = debounce(() => {
    currentAdminErrorPage = 1;
    if (typeof filterErrorReports === 'function') filterErrorReports();
}, 300);
window.filterAdminWatchRoomsDebounced = debounce(() => {
    currentAdminRoomPage = 1;
    if (typeof filterAdminWatchRooms === 'function') filterAdminWatchRooms();
}, 300);

// Thêm debounced cho các tính năng khác trong admin.html
window.adminHandleAvatarUrlInputDebounced = debounce((el) => typeof adminHandleAvatarUrlInput === 'function' && adminHandleAvatarUrlInput(el), 500);
window.updateActorPreviewDebounced = debounce(() => typeof updateActorPreview === 'function' && updateActorPreview(), 500);
window.checkActorDuplicateDebounced = debounce((val) => typeof checkActorDuplicate === 'function' && checkActorDuplicate(val), 500);
window.handleBulkCountryInputDebounced = debounce((val) => typeof handleBulkCountryInput === 'function' && handleBulkCountryInput(val), 300);

/**
 * Cập nhật danh sách ID diễn viên mới nhất
 * @param {Array|string} ids - ID hoặc mảng IDs mới
 * @param {boolean} append - Nếu true, cộng dồn vào danh sách hiện tại. Nếu false, thay thế hoàn toàn.
 */
window.setLatestActorIds = function(ids, append = false) {
    const newIds = Array.isArray(ids) ? ids : [ids];
    if (append) {
        // Gom các ID lại, loại bỏ trùng lặp
        window.latestAddedActorIds = Array.from(new Set([...(window.latestAddedActorIds || []), ...newIds]));
    } else {
        window.latestAddedActorIds = newIds;
    }
    // Lưu vào localStorage
    localStorage.setItem('latestAddedActorIds', JSON.stringify(window.latestAddedActorIds));
};

/**
 * Cập nhật danh sách ID diễn viên tự động tạo mới nhất
 */
window.setLatestAutoActorIds = function(ids, append = false) {
    const newIds = Array.isArray(ids) ? ids : [ids];
    if (append) {
        window.latestAutoActorIds = Array.from(new Set([...(window.latestAutoActorIds || []), ...newIds]));
    } else {
        window.latestAutoActorIds = newIds;
    }
    localStorage.setItem('latestAutoAutoIds', JSON.stringify(window.latestAutoActorIds));
};

/**
 * Load dữ liệu cho Admin
 */
async function loadAdminData() {
  if (!isAdmin) return;

  try {
    // Load categories & countries first (to ensure badges have data)
    if (typeof loadCategories === "function") await loadCategories();
    if (typeof loadCountries === "function") await loadCountries();

    // Khôi phục trang phim đã xem trước khi rời web (từ sessionStorage)
    try {
      const savedPage = parseInt(sessionStorage.getItem('adminMoviePage'));
      if (savedPage && savedPage > 1) currentAdminMoviePage = savedPage;
    } catch(e) {}

    // Load movies for admin
    await loadAdminMovies(currentAdminMoviePage > 1);

    // Load users
    await loadAdminUsers();

    // Load comments
    await loadAdminComments();

    // Load transactions
    await loadAdminTransactions();

    // Populate movie select for episodes
    //populateMovieSelect();

    // Load categories, countries, and actors tables
    renderAdminCategories();
    renderAdminCountries();
    
    // Đảm bảo load xong diễn viên từ DB trước khi render
    if (typeof loadActors === "function") await loadActors();
    renderAdminActors();


    // Load VIP Requests
    await loadAdminVipRequests();

    // Load Notifications (Realtime)
    loadAdminNotifications();

    // Load Scheduled Notifications (Realtime + Timer checker)
    loadScheduledNotifications();

    // Load RapChieuPhim API Key
    loadRapApiKey();

    // ✅ Cập nhật thống kê Dashboard
    await loadAdminStats();

    // 🔄 Tự động sync tập mới từ API (chạy ngầm, không ảnh hưởng UI)
    if (typeof autoSyncEpisodesIfNeeded === 'function') autoSyncEpisodesIfNeeded();
    // 🎬 Tự động import phim mới từ nguồn API (chạy ngầm)
    if (typeof autoImportNewMoviesIfNeeded === 'function') autoImportNewMoviesIfNeeded();
  } catch (error) {
    console.error("Lỗi load admin data:", error);
  }
}

/**
 * Hàm kiểm tra thông báo VIP cũ đã bị xóa (Chuyển sang notifications.js)
 */

// (Đã được khai báo ở đầu file admin.js)
// window.allVipRequests = [];

/**
 * Load dữ liệu yêu cầu VIP
 */
async function loadAdminVipRequests() {
    if(!supabase) return;
    try {
        const { data, error } = await supabase
            .from('upgrade_requests')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
            
        // Group by userId to keep only the latest request per user (như logic cũ)
        const latestRequestsMap = new Map();
        (data || []).forEach(row => {
            if (!latestRequestsMap.has(row.user_id)) {
                latestRequestsMap.set(row.user_id, row);
            }
        });
            
        allVipRequests = Array.from(latestRequestsMap.values());
        filterAdminVipRequests();
    } catch (err) {
        console.error("Lỗi tải yêu cầu VIP Supabase:", err);
    }
}

/**
 * Lọc và sắp xếp yêu cầu VIP
 */
function filterAdminVipRequests() {
    const searchEmail = document.getElementById("adminSearchVip")?.value.toLowerCase().trim() || "";
    const startDate = document.getElementById("vipFilterStartDate")?.value;
    const endDate = document.getElementById("vipFilterEndDate")?.value;
    const sortOrder = document.getElementById("vipSortOrder")?.value || "desc";
    const status = document.getElementById("vipFilterStatus")?.value || "";

    let filtered = [...allVipRequests];

    // Lọc theo Email
    if (searchEmail) {
        filtered = filtered.filter(req => req.user_email && req.user_email.toLowerCase().includes(searchEmail));
    }

    // Lọc theo Status
    if (status) {
        filtered = filtered.filter(req => req.status === status);
    }

    // Lọc theo Thời gian (Từ - Đến)
    if (startDate) {
        const start = new Date(startDate).setHours(0,0,0,0);
        filtered = filtered.filter(req => {
            const reqDate = new Date(req.created_at);
            return reqDate.getTime() >= start;
        });
    }
    
    if (endDate) {
        const end = new Date(endDate).setHours(23,59,59,999);
        filtered = filtered.filter(req => {
            const reqDate = new Date(req.created_at);
            return reqDate.getTime() <= end;
        });
    }

    // Sắp xếp
    filtered.sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

    renderAdminVipRequests(filtered);
}

/**
 * Hiển thị bảng Yêu cầu VIP
 */
function renderAdminVipRequests(requests) {
    const tbody = document.getElementById("adminVipRequestsTable");
    if (!tbody) return;

    const totalItems = requests.length;
    const totalPages = Math.ceil(totalItems / adminPerPage);
    
    if (currentAdminVipPage > totalPages && totalPages > 0) currentAdminVipPage = totalPages;
    if (currentAdminVipPage < 1) currentAdminVipPage = 1;

    const startIndex = (currentAdminVipPage - 1) * adminPerPage;
    const paginatedRequests = requests.slice(startIndex, startIndex + adminPerPage);

    if (totalItems === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Không có yêu cầu nào phù hợp</td></tr>';
        const paginationContainer = document.getElementById("adminVipPagination");
        if (paginationContainer) paginationContainer.innerHTML = "";
        return;
    }

    tbody.innerHTML = paginatedRequests.map(req => {
        const statusClass = req.status === "pending" ? "warning" : req.status === "approved" ? "success" : "danger";
        const statusText = req.status === "pending" ? "Đang chờ duyệt" : req.status === "approved" ? "Đã duyệt" : "Đã từ chối";
        
        const disabledAttr = req.status !== "pending" ? "disabled" : "";
        const opcStyle = req.status !== "pending" ? "opacity: 0.5; cursor: not-allowed;" : "";

        return `
            <tr>
                <td><strong>${req.user_email}</strong><br><small class="text-muted">UID: ${req.user_id.substring(0,8)}...</small></td>
                <td><span style="color: var(--warning-color); font-weight: bold; text-transform: uppercase;">${req.package}</span></td>
                <td>${formatNumber(req.amount)}đ</td>
                <td>
                   <img src="${req.bill_image_base64 || 'https://placehold.co/100x150'}" 
                        style="width: 60px; height: 80px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid rgba(255,255,255,0.2);" 
                        onclick="openBillViewport('${req.bill_image_base64}')"
                        title="Bấm để xem lớn" />
                </td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${formatDateTime(req.created_at)}</td>
                <td style="text-align: center;">
                    <button class="btn btn-sm btn-success" style="margin-right: 5px; ${opcStyle}" ${disabledAttr} onclick="approveVipRequest('${req.id}', '${req.user_id}', '${req.package}')" title="Duyệt nâng cấp">
                        <i class="fas fa-check"></i> Duyệt
                    </button>
                    <button class="btn btn-sm btn-danger" style="margin-right: 5px; ${opcStyle}" ${disabledAttr} onclick="rejectVipRequest('${req.id}')" title="Từ chối yêu cầu">
                        <i class="fas fa-times"></i> Từ chối
                    </button>
                    <button class="btn btn-sm" style="background: rgba(255,255,255,0.1); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.2);" onclick="deleteVipRequest('${req.id}')" title="Xóa yêu cầu">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderAdminPagination("adminVipPagination", totalItems, currentAdminVipPage, adminPerPage, "changeAdminVipPage", "yêu cầu");
}

/**
 * Chuyển trang VIP
 */
window.changeAdminVipPage = function(page) {
    currentAdminVipPage = page;
    filterAdminVipRequests();
    const panel = document.getElementById("vipRequestsPanel");
    if (panel) panel.scrollIntoView({ behavior: 'smooth' });
};

/**
 * Xem ảnh Bill Lớn
 */
window.openBillViewport = function(base64Str) {
    if(!base64Str) return;
    document.getElementById("billViewportImage").src = base64Str;
    openModal("billViewportModal");
}

/**
 * Duyệt Yêu Cầu VIP
 */
window.approveVipRequest = async function(requestId, userId, packageType) {
    if (!await customConfirm("Xác nhận duyệt cho yêu cầu VIP này?", { title: "Duyệt VIP", type: "info", confirmText: "Duyệt" })) return;
    
    let durationDays = 30; 
    if (packageType !== 'lifetime') {
        const inputDays = await customPrompt("Nhập số ngày VIP cấp cho user này:", { title: "Số ngày VIP", defaultValue: "30" });
        if (inputDays === null) return; 
        durationDays = parseInt(inputDays, 10);
        
        if (isNaN(durationDays) || (durationDays <= 0 && durationDays !== -1)) {
            showNotification("Số ngày không hợp lệ!", "error");
            return;
        }

        if (durationDays === -1) {
            packageType = 'lifetime';
        }
    }

    try {
        showLoading(true, "Đang xử lý nâng cấp...");
        
        let vipUntil = null;
        if (packageType !== 'lifetime') {
            vipUntil = new Date();
            vipUntil.setDate(vipUntil.getDate() + durationDays);
        }

        // 1. Cập nhật profile cho User
        const { error: profileError } = await supabase.from('profiles').update({
            is_vip: true,
            vip_expires_at: vipUntil ? vipUntil.toISOString() : null
        }).eq('id', userId);

        if (profileError) throw profileError;

        // 2. Cập nhật trạng thái request thành approved
        const { error: reqError } = await supabase.from('upgrade_requests').update({
            status: "approved",
            processed_at: new Date().toISOString(),
            processed_by: currentUser.email
        }).eq('id', requestId);

        if (reqError) throw reqError;

        // 3. Gửi thông báo cho User
        if (typeof sendNotification === "function") {
            const durationText = packageType === 'lifetime' ? "Vĩnh Viễn ♾️" : `${durationDays} ngày`;
            await sendNotification(userId, "Yêu cầu VIP đã được duyệt ✅", `Tài khoản của bạn đã được nâng cấp VIP (${durationText}).`, "vip_approved");
        }

        showNotification("Đã duyệt thành công!", "success");
        await loadAdminVipRequests();
        if (typeof loadAdminUsers === "function") await loadAdminUsers();
    } catch (err) {
        console.error("Lỗi duyệt VIP Supabase:", err);
        showNotification("Lỗi khi duyệt VIP", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Từ chối Yêu Cầu VIP
 */
window.rejectVipRequest = async function(requestId) {
    if (!await customConfirm("Bạn có chắc chắn muốn TỪ CHỐI yêu cầu này không?", { title: "Từ chối VIP", type: "danger", confirmText: "Từ chối" })) return;
    
    try {
        showLoading(true, "Đang từ chối...");
        
        const { error } = await supabase.from('upgrade_requests').update({
            status: "rejected",
            processed_at: new Date().toISOString(),
            processed_by: currentUser.email
        }).eq('id', requestId);

        if (error) throw error;

        showNotification("Đã từ chối yêu cầu VIP", "success");
        await loadAdminVipRequests();
    } catch (err) {
        console.error("Lỗi từ chối VIP Supabase:", err);
        showNotification("Lỗi khi từ chối", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Xóa Yêu Cầu VIP Khỏi Bảng (Xóa luôn trong Database)
 */
window.deleteVipRequest = async function(requestId) {
    if (!await customConfirm("Hành động này sẽ XÓA VĨNH VIỄN yêu cầu này. Bạn có chắc không?", { title: "Xóa yêu cầu", type: "danger", confirmText: "Xóa" })) return;
    
    try {
        showLoading(true, "Đang xóa...");
        
        const { error } = await supabase.from('upgrade_requests').delete().eq('id', requestId);
        if (error) throw error;

        showNotification("Đã xóa yêu cầu thành công!", "success");
        await loadAdminVipRequests(); 
    } catch (err) {
        console.error("Lỗi xóa yêu cầu VIP Supabase:", err);
        showNotification("Lỗi khi xóa", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Load thống kê Admin (Phiên bản Dashboard mới - PRO)
 * Bao gồm: 6 stat cards, 4 biểu đồ Chart.js, bảng hoạt động gần đây
 */
async function loadAdminStats() {
  if (!supabase) return;
  try {
    // === 1. Tổng số phim (đếm trực tiếp từ DB, không phụ thuộc mảng JS bị limit) ===
    const { count: totalMovies } = await supabase
      .from('movies')
      .select('*', { count: 'exact', head: true });
    animateCountUp("statTotalMovies", totalMovies || 0);

    // === 2. Tổng lượt xem (Cộng dồn cột views từ tất cả phim hiện hành) ===
    let totalViews = 0;
    try {
      let offset = 0;
      const limit = 1000;
      while(true) {
          const { data: mv, error } = await supabase.from('movies').select('views').range(offset, offset + limit - 1);
          if (error || !mv || mv.length === 0) break;
          totalViews += mv.reduce((sum, m) => sum + (m.views || 0), 0);
          if (mv.length < limit) break;
          offset += limit;
      }
    } catch(e) { /* fallback = 0 */ }
    animateCountUp("statTotalViews", totalViews);

    // === 3. Doanh thu ước tính (Từ transactions) ===
    const { data: txData } = await supabase
        .from('transactions')
        .select('amount')
        .eq('status', 'completed');
    const totalRevenue = (txData || []).reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const revenueEl = document.getElementById("statTotalRevenue");
    if (revenueEl) {
      animateCountUp("statTotalRevenue", totalRevenue, 1200, ` CRO`);
    }

    // === 4. Tổng users ===
    const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
    animateCountUp("statTotalUsers", userCount || 0);

    // === 5. VIP Users ===
    const { count: vipCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_vip', true);
    animateCountUp("statVipUsers", vipCount || 0);

    // === 6. Báo lỗi chờ xử lý ===
    const { count: errorCount } = await supabase
        .from('error_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
    animateCountUp("statPendingErrors", errorCount || 0);

    // === Render các phần phụ ===
    const chartMovies = (typeof allAdminMovies !== 'undefined' && allAdminMovies.length > 0)
      ? allAdminMovies : (allMovies || []);
      
    // Cập nhật lượt xem thực tế vào mảng phim trước khi vẽ chart
    try {
        const viewCountsAll = await queryViewLogsCounts('all');
        chartMovies.forEach(m => {
            m.views = viewCountsAll[m.id] || 0;
        });
    } catch(err) {
        console.warn('Lỗi đồng bộ views cho chart:', err);
    }

    renderRecentMovies();
    renderDashboardCharts(chartMovies);
    renderRecentActivities();

  } catch (error) {
    console.error("Lỗi load stats Dashboard:", error);
  }
}

/**
 * Hiệu ứng đếm số từ 0 đến endValue
 * @param {string} elementId - ID của element hiển thị số
 * @param {number} endValue - Giá trị cuối cùng
 * @param {number} duration - Thời gian animation (ms)
 * @param {string} suffix - Hậu tố (ví dụ: ' CRO')
 */
function animateCountUp(elementId, endValue, duration = 1000, suffix = '') {
  const el = document.getElementById(elementId);
  if (!el) return;

  // Nếu giá trị = 0, hiển thị luôn
  if (endValue === 0) {
    el.textContent = '0' + suffix;
    return;
  }

  const startTime = performance.now();
  const startValue = 0;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing: ease-out
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(startValue + (endValue - startValue) * easedProgress);
    
    el.textContent = formatNumber(currentValue) + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = formatNumber(endValue) + suffix;
      el.classList.add('counting');
      setTimeout(() => el.classList.remove('counting'), 300);
    }
  }

  requestAnimationFrame(update);
}

/**
 * Render phim gần đây trong dashboard (Phiên bản mới - thêm Loại + Lượt xem)
 */
function renderRecentMovies() {
  const tbody = document.getElementById("recentMoviesTable");
  if (!tbody) return;

  const moviesSrc = (typeof allAdminMovies !== 'undefined' && allAdminMovies.length > 0) 
    ? allAdminMovies : allMovies;

  const recent = [...moviesSrc]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 5);

  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:20px;color:#888;">Chưa có phim nào</td></tr>';
    return;
  }

  tbody.innerHTML = recent.map(movie => {
    // Badge loại phim
    const typeBadge = movie.type === 'series' 
      ? '<span style="background:rgba(218,119,242,0.15);color:#da77f2;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;">Phim bộ</span>'
      : '<span style="background:rgba(77,171,247,0.15);color:#4dabf7;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;">Phim lẻ</span>';

    return `
      <tr>
        <td><img src="${movie.poster_url || movie.posterUrl || ''}" alt="${movie.title}" 
             onerror="this.src='https://placehold.co/50x75'" style="width:45px;height:65px;object-fit:cover;border-radius:6px;"></td>
        <td><strong style="font-size:0.9rem;">${movie.title}</strong></td>
        <td>${typeBadge}</td>
        <td><i class="fas fa-eye" style="color:var(--accent-primary);margin-right:4px;font-size:0.8rem;"></i>${formatNumber(movie.views || 0)}</td>
        <td><span class="status-badge ${movie.status}">${getStatusText(movie.status)}</span></td>
        <td style="font-size:0.85rem;color:var(--text-muted);">${formatDate(movie.created_at)}</td>
      </tr>
    `;
  }).join("");
}

// === Lưu trữ Chart instances để hủy khi re-render ===
window._dashCharts = window._dashCharts || {};

// Lưu trạng thái period cho từng chart dashboard
window._dashChartPeriods = window._dashChartPeriods || {
  categories: 'all',
  views: 'all',
  topMovies: 'all'
};

/**
 * Render 4 biểu đồ Dashboard bằng Chart.js
 * @param {Array} movies - Mảng phim để phân tích
 */
function renderDashboardCharts(movies) {
  if (typeof Chart === 'undefined') {
    console.warn("⚠️ Chart.js chưa được load, bỏ qua render biểu đồ.");
    return;
  }

  // Cấu hình chung cho Chart.js (Dark theme)
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#b0b0b0' : '#555555';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';

  // --- 1. Bar Chart: Phim theo thể loại ---
  renderChartMoviesByCategory(movies, textColor, gridColor, window._dashChartPeriods.categories);

  // --- 2. Line Chart: Phân bổ lượt xem theo top phim ---
  renderChartViewsDistribution(movies, textColor, gridColor, window._dashChartPeriods.views);

  // --- 3. Doughnut: Tỉ lệ phim lẻ/bộ ---
  renderChartMovieTypes(movies, textColor);

  // --- 4. Horizontal Bar: Top 10 phim xem nhiều ---
  renderChartTopMovies(movies, textColor, gridColor, window._dashChartPeriods.topMovies);
}

/**
 * Xử lý khi click tab lọc thời gian cho biểu đồ Dashboard
 * @param {string} chartName - 'categories' | 'views' | 'topMovies'
 * @param {string} period - 'all' | 'day' | 'week' | 'month'
 */
window.changeDashChartPeriod = function(chartName, period) {
  window._dashChartPeriods[chartName] = period;

  // Cập nhật active tab
  document.querySelectorAll(`.chart-tab[data-chart="${chartName}"]`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });

  // Lấy dữ liệu phim hiện tại
  const movies = (typeof allAdminMovies !== 'undefined' && allAdminMovies.length > 0)
    ? allAdminMovies : (allMovies || []);

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#b0b0b0' : '#555555';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';

  // Render lại chart tương ứng
  if (chartName === 'categories') {
    renderChartMoviesByCategory(movies, textColor, gridColor, period);
  } else if (chartName === 'views') {
    renderChartViewsDistribution(movies, textColor, gridColor, period);
  } else if (chartName === 'topMovies') {
    renderChartTopMovies(movies, textColor, gridColor, period);
  }
};

/**
 * Helper: Tính mốc thời gian ISO cho period
 */
function getDashPeriodFromDate(period) {
  const now = new Date();
  if (period === 'day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  } else if (period === 'month') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString();
  }
  return null;
}

/**
 * Helper: Query view_logs và đếm lượt xem theo movie_id
 */
async function queryViewLogsCounts(period) {
  if (!supabase) return {};
  try {
    let query = supabase.from('view_logs').select('movie_id');
    const fromDate = getDashPeriodFromDate(period);
    if (fromDate) query = query.gte('viewed_at', fromDate);

    const { data, error } = await query.limit(50000);
    if (error) throw error;

    const counts = {};
    (data || []).forEach(log => {
      counts[log.movie_id] = (counts[log.movie_id] || 0) + 1;
    });
    return counts;
  } catch (err) {
    console.warn('Lỗi query view_logs:', err.message);
    return {};
  }
}

/**
 * Biểu đồ cột: Số phim/lượt xem theo thể loại
 */
async function renderChartMoviesByCategory(movies, textColor, gridColor, period) {
  const ctx = document.getElementById('chartMoviesByCategory');
  if (!ctx) return;

  if (window._dashCharts.categories) window._dashCharts.categories.destroy();
  const exist_categories = Chart.getChart("chartMoviesByCategory");
  if (exist_categories) exist_categories.destroy();

  const categories = typeof allCategories !== 'undefined' ? allCategories : [];

  if (period && period !== 'all') {
    // Query view_logs theo thời gian, đếm theo category
    const viewCounts = await queryViewLogsCounts(period);
    const catViewCount = {};

    Object.entries(viewCounts).forEach(([movieId, count]) => {
      const movie = movies.find(m => m.id === movieId);
      if (!movie) return;
      const cats = movie.categories || [];
      cats.forEach(catId => {
        const catObj = categories.find(c => c.id === catId || c.name === catId);
        const catName = catObj ? catObj.name : catId;
        if (catName) catViewCount[catName] = (catViewCount[catName] || 0) + count;
      });
      if (cats.length === 0 && movie.category) {
        catViewCount[movie.category] = (catViewCount[movie.category] || 0) + count;
      }
    });

    const sorted = Object.entries(catViewCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
    renderCategoryChart(ctx, sorted.map(s => s[0]), sorted.map(s => s[1]), 'Lượt xem', textColor, gridColor);
  } else {
    // Đếm số phim theo thể loại (logic cũ)
    const catCount = {};
    movies.forEach(m => {
      const cats = m.categories || [];
      cats.forEach(catId => {
        const catObj = categories.find(c => c.id === catId || c.name === catId);
        const catName = catObj ? catObj.name : catId;
        if (catName) catCount[catName] = (catCount[catName] || 0) + 1;
      });
      if (cats.length === 0 && m.category) {
        catCount[m.category] = (catCount[m.category] || 0) + 1;
      }
    });
    const sorted = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
    renderCategoryChart(ctx, sorted.map(s => s[0]), sorted.map(s => s[1]), 'Số phim', textColor, gridColor);
  }
}

/**
 * Vẽ chart phim theo thể loại
 */
function renderCategoryChart(ctx, labels, data, labelText, textColor, gridColor) {
  const colors = [
    '#4db8ff', '#ff6b6b', '#ffd700', '#00ff88',
    '#da77f2', '#ff9ff3', '#54a0ff', '#48dbfb'
  ];

  window._dashCharts.categories = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: labelText,
        data,
        backgroundColor: colors.slice(0, data.length).map(c => c + '99'),
        borderColor: colors.slice(0, data.length),
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          titleColor: '#fff',
          bodyColor: '#ddd',
          cornerRadius: 8,
          padding: 10,
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 11 } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { color: textColor, stepSize: 1, font: { size: 11 } },
          grid: { color: gridColor }
        }
      }
    }
  });
}

/**
 * Biểu đồ Line: Phân bổ lượt xem (top 10 phim)
 */
async function renderChartViewsDistribution(movies, textColor, gridColor, period) {
  const ctx = document.getElementById('chartViewsRecent');
  if (!ctx) return;

  if (window._dashCharts.views) window._dashCharts.views.destroy();
  const exist_views = Chart.getChart("chartViewsRecent");
  if (exist_views) exist_views.destroy();

  let labels, data;

  if (period && period !== 'all') {
    const viewCounts = await queryViewLogsCounts(period);
    const sorted = Object.entries(viewCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    labels = sorted.map(([movieId]) => {
      const m = movies.find(mv => mv.id === movieId);
      const title = m ? m.title : movieId;
      return title.length > 15 ? title.substring(0, 15) + '...' : title;
    });
    data = sorted.map(([, count]) => count);
  } else {
    const topMovies = [...movies]
      .filter(m => (m.views || 0) > 0)
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 10);
    labels = topMovies.map(m => m.title.length > 15 ? m.title.substring(0, 15) + '...' : m.title);
    data = topMovies.map(m => m.views || 0);
  }

  window._dashCharts.views = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Lượt xem',
        data,
        borderColor: '#4db8ff',
        backgroundColor: 'rgba(77, 184, 255, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#4db8ff',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          titleColor: '#fff',
          bodyColor: '#ddd',
          cornerRadius: 8,
          padding: 10,
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 45 },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { color: textColor, font: { size: 11 } },
          grid: { color: gridColor }
        }
      }
    }
  });
}

/**
 * Biểu đồ Doughnut: Tỉ lệ phim lẻ / phim bộ
 */
function renderChartMovieTypes(movies, textColor) {
  const ctx = document.getElementById('chartMovieTypes');
  if (!ctx) return;

  if (window._dashCharts.types) window._dashCharts.types.destroy();
  const exist_types = Chart.getChart("chartMovieTypes");
  if (exist_types) exist_types.destroy();

  const singleCount = movies.filter(m => m.type === 'single' || !m.type).length;
  const seriesCount = movies.filter(m => m.type === 'series').length;

  window._dashCharts.types = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Phim lẻ', 'Phim bộ'],
      datasets: [{
        data: [singleCount, seriesCount],
        backgroundColor: ['rgba(77, 171, 247, 0.8)', 'rgba(218, 119, 242, 0.8)'],
        borderColor: ['#4dabf7', '#da77f2'],
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: { size: 13, weight: '600' },
            padding: 20,
            usePointStyle: true,
            pointStyleWidth: 12,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          titleColor: '#fff',
          bodyColor: '#ddd',
          cornerRadius: 8,
          padding: 10,
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
              return ` ${context.label}: ${context.parsed} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * Biểu đồ Horizontal Bar: Top 10 phim xem nhiều nhất
 */
async function renderChartTopMovies(movies, textColor, gridColor, period) {
  const ctx = document.getElementById('chartTopMovies');
  if (!ctx) return;

  if (window._dashCharts.topMovies) window._dashCharts.topMovies.destroy();
  const exist_topMovies = Chart.getChart("chartTopMovies");
  if (exist_topMovies) exist_topMovies.destroy();

  let labels, data;

  if (period && period !== 'all') {
    const viewCounts = await queryViewLogsCounts(period);
    const sorted = Object.entries(viewCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    labels = sorted.map(([movieId]) => {
      const m = movies.find(mv => mv.id === movieId);
      const title = m ? m.title : movieId;
      return title.length > 20 ? title.substring(0, 20) + '...' : title;
    });
    data = sorted.map(([, count]) => count);
  } else {
    const top10 = [...movies]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 10);
    labels = top10.map(m => m.title.length > 20 ? m.title.substring(0, 20) + '...' : m.title);
    data = top10.map(m => m.views || 0);
  }

  const barColors = [
    '#ffd700', '#c0c0c0', '#cd7f32', '#4db8ff', '#da77f2',
    '#ff922b', '#20c997', '#748ffc', '#f06595', '#adb5bd'
  ];

  window._dashCharts.topMovies = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Lượt xem',
        data,
        backgroundColor: barColors.slice(0, data.length).map(c => c + 'cc'),
        borderColor: barColors.slice(0, data.length),
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          titleColor: '#fff',
          bodyColor: '#ddd',
          cornerRadius: 8,
          padding: 10,
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: textColor, font: { size: 11 } },
          grid: { color: gridColor }
        },
        y: {
          ticks: { color: textColor, font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

/**
 * Render danh sách hoạt động gần đây (tổng hợp từ nhiều nguồn)
 */
async function renderRecentActivities() {
  const container = document.getElementById("recentActivitiesList");
  if (!container || !supabase) return;

  try {
    const activities = [];

    // 1. Phim mới thêm gần đây
    const moviesSrc = (typeof allAdminMovies !== 'undefined' && allAdminMovies.length > 0) 
      ? allAdminMovies : allMovies;
    const recentMovies = [...moviesSrc]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 3);
    
    recentMovies.forEach(m => {
      activities.push({
        type: 'movie',
        icon: 'fas fa-film',
        title: `Phim mới: <strong>${m.title}</strong>`,
        time: m.created_at,
      });
    });

    // 2. VIP Requests gần đây
    if (typeof allVipRequests !== 'undefined' && allVipRequests.length > 0) {
      allVipRequests.slice(0, 3).forEach(req => {
        const statusText = req.status === 'pending' ? 'chờ duyệt' : (req.status === 'approved' ? 'đã duyệt' : 'đã từ chối');
        activities.push({
          type: 'vip',
          icon: 'fas fa-crown',
          title: `Yêu cầu VIP: <strong>${req.user_email || 'User'}</strong> — ${statusText}`,
          time: req.created_at,
        });
      });
    }

    // 3. Báo lỗi và Auto-fix gần đây (wrap riêng try-catch)
    try {
      const { data: recentErrors } = await supabase
        .from('error_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8); // Tăng limit lên 8 để lấy đủ cả lỗi và auto-fix

      (recentErrors || []).forEach(err => {
        if (err.error_type && err.error_type.startsWith('auto_fix_')) {
          const typeName = err.error_type.includes('poster') ? 'Poster' : 'Nền';
          // Dùng class "success" hoặc "auto_fix" cho CSS riêng
          activities.push({
            type: 'auto_fix', 
            icon: 'fas fa-magic',
            title: `Auto-Fix: Tự cập nhật ${typeName} cho <strong>${err.movie_title || 'Không rõ'}</strong>`,
            time: err.created_at,
          });
        } else {
          activities.push({
            type: 'error',
            icon: 'fas fa-bug',
            title: `Báo lỗi: <strong>${err.movie_title || 'Không rõ'}</strong> bởi ${err.user_name || 'Ẩn danh'}`,
            time: err.created_at,
          });
        }
      });
    } catch (e) { /* Bỏ qua nếu bảng chưa có */ }

    // 4. User mới đăng ký gần đây
    try {
      const { data: recentUsers } = await supabase
        .from('profiles')
        .select('email, display_name, created_at')
        .order('created_at', { ascending: false })
        .limit(3);

      (recentUsers || []).forEach(u => {
        activities.push({
          type: 'user',
          icon: 'fas fa-user-plus',
          title: `User mới: <strong>${u.display_name || u.email || 'Unnamed'}</strong>`,
          time: u.created_at,
        });
      });
    } catch (e) { /* Bỏ qua nếu lỗi */ }

    // Sort tất cả theo thời gian mới nhất và lấy top 10
    activities.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    const top10 = activities.slice(0, 10);

    if (top10.length === 0) {
      container.innerHTML = '<div class="dash-activity-empty"><i class="fas fa-inbox"></i> Chưa có hoạt động nào</div>';
      return;
    }

    container.innerHTML = top10.map(act => {
      const timeAgo = getTimeAgo(act.time);
      return `
        <div class="dash-activity-item">
          <div class="dash-activity-icon ${act.type}">
            <i class="${act.icon}"></i>
          </div>
          <div class="dash-activity-content">
            <div class="dash-activity-title">${act.title}</div>
            <div class="dash-activity-time">${timeAgo}</div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error("Lỗi load hoạt động gần đây:", error);
    container.innerHTML = '<div class="dash-activity-empty"><i class="fas fa-exclamation-circle"></i> Lỗi tải dữ liệu</div>';
  }
}

/**
 * Tính thời gian tương đối (vd: "2 giờ trước", "3 ngày trước")
 */
function getTimeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} tuần trước`;
  return formatDate(dateStr);
}

/**
 * Load lịch sử giao dịch (Đã cập nhật hiện giờ chi tiết)
 */
async function loadAdminTransactions() {
  const tbody = document.getElementById("adminTransactionsTable");
  if (!tbody || !supabase) return;

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    tbody.innerHTML = (data || [])
      .map((tx) => {
        const dateStr = tx.created_at ? formatDate(new Date(tx.created_at), true) : "N/A";
        const statusClass = tx.status === "completed" ? "public" : (tx.status === "failed" ? "rejected" : "pending");

        return `
            <tr>
                <td>${tx.id.slice(0, 8)}...</td>
                <td>${tx.user_email || "N/A"}</td>
                <td>${tx.item_name || "N/A"}</td>
                <td>${formatNumber(tx.amount)} ${tx.currency || "CRO"}</td>
                <td><span class="status-badge ${statusClass}">${tx.status}</span></td>
                <td>${dateStr}</td>
            </tr>
        `;
      })
      .join("");

  } catch (error) {
    console.error("Lỗi fetch transactions Supabase:", error);
  }
}
/**
 * Tải form edit phim
 */
function loadEditMovieForm() {
    const editSearchInput = document.getElementById("editMovieSearchInput");
    const editSelect = document.getElementById("editMovieSelect");

    if (editSearchInput && editSelect) {
        // Set event listener for search input
        editSearchInput.addEventListener("input", function() {
            if (typeof filterEditMovieDropdown === 'function') {
                filterEditMovieDropdown(editSearchInput, editSelect);
            } else {
                // Tự implement nhanh nếu thiếu hoặc dùng logic lọc cơ bản
                const val = editSearchInput.value.toLowerCase();
                Array.from(editSelect.options).forEach(opt => {
                    if (opt.value === "") return;
                    const txt = opt.text.toLowerCase();
                    opt.style.display = txt.includes(val) ? "block" : "none";
                });
            }
        });

        // Tải danh sách phim vào Select
        const moviesToLoad = allMovies;
        let html = '<option value="">-- Chọn Phim --</option>';
        moviesToLoad.forEach(m => {
            html += `<option value="${m.id}">${m.title} (${m.publishYear})</option>`;
        });
        editSelect.innerHTML = html;

        console.log("Đã tải dữ liệu vào Form Sửa Phim (Select)", moviesToLoad.length, "phim");
    }
}

/* ============================================
   QUẢN LÝ BÁO LỖI (ERROR REPORTS)
   ============================================ */

let allErrorReports = []; // Mảng chứa dữ liệu error_reports realtime
let errorReportsUnsubscribe = null;

/**
 * Load dữ liệu báo lỗi từ Supabase
 */
function loadErrorReports() {
    if (!supabase) return;

    // Lắng nghe Realtime qua Channel thay vì onSnapshot
    supabase.channel('public:error_reports')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'error_reports' 
        }, payload => {
            console.log("🔔 [Realtime] Báo lỗi thay đổi:", payload.eventType);
            fetchErrorReports();
        })
        .subscribe();

    // Tải lần đầu
    fetchErrorReports();
}

async function fetchErrorReports() {
    try {
        const { data, error } = await supabase
            .from('error_reports')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        allErrorReports = data || [];
        filterErrorReports();
    } catch (err) {
        console.error("Lỗi fetch error reports Supabase:", err);
    }
}

/**
 * Lọc và tìm kiếm
 */
window.filterErrorReports = function() {
    const searchInput = document.getElementById("adminSearchError");
    const statusSelect = document.getElementById("errorFilterStatus");
    const typeSelect = document.getElementById("errorFilterType"); // Tùy chọn mới

    const searchText = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const statusVal = statusSelect ? statusSelect.value : "";
    const typeVal = typeSelect ? typeSelect.value : "";

    let filtered = allErrorReports;

    if (statusVal) {
        filtered = filtered.filter(item => item.status === statusVal);
    }
    
    if (typeVal) {
        filtered = filtered.filter(item => item.error_type === typeVal);
    }

    if (searchText) {
        filtered = filtered.filter(item => {
            const mTitle = (item.movie_title || "").toLowerCase();
            const epName = (item.episode_name || "").toLowerCase();
            const uName = (item.user_name || "").toLowerCase();
            return mTitle.includes(searchText) || epName.includes(searchText) || uName.includes(searchText);
        });
    }

    renderErrorReports(filtered);
};

/**
 * Render bảng
 */
function renderErrorReports(list) {
    // --- CẬP NHẬT TÓM TẮT ---
    const pendingList = list.filter(item => item.status === "pending");
    const sumPending = document.getElementById("sumPendingErrors");
    const sumTotal = document.getElementById("sumTotalReports");
    if (sumPending) sumPending.innerText = pendingList.length;
    if (sumTotal) {
        const total = pendingList.reduce((acc, item) => acc + (item.report_count || 1), 0);
        sumTotal.innerText = total;
    }

    const tbody = document.getElementById("errorReportsTable");
    if (!tbody) return;

    // --- LOGIC PHÂN TRANG ---
    const totalItems = list.length;
    const totalPages = Math.ceil(totalItems / adminPerPage);
    
    if (currentAdminErrorPage > totalPages && totalPages > 0) currentAdminErrorPage = totalPages;
    if (currentAdminErrorPage < 1) currentAdminErrorPage = 1;

    const startIndex = (currentAdminErrorPage - 1) * adminPerPage;
    const paginatedList = list.slice(startIndex, startIndex + adminPerPage);

    if (totalItems === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px; color: #888;">Không có báo lỗi nào.</td></tr>';
        const paginationContainer = document.getElementById("adminErrorReportPagination");
        if (paginationContainer) paginationContainer.innerHTML = "";
        return;
    }

    tbody.innerHTML = paginatedList.map(item => {
        const timeStr = item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : "—";
            
        const isResolved = item.status === "resolved";
        const statusHtml = isResolved 
            ? '<span style="color: #4ade80; font-weight: bold;"><i class="fas fa-check-circle"></i> Đã xử lý</span>' 
            : '<span style="color: #f87171; font-weight: bold;"><i class="fas fa-exclamation-circle"></i> Chưa xử lý</span>';
            
        // Map label hiển thị Badge trên Admin với màu sắc tường minh
        const typeLabels = {
            "load_slow": { label: "Video giật lag", bg: "#ff9800", text: "#fff" },
            "broken_link": { label: "Hỏng link", bg: "#f44336", text: "#fff" },
            "subtitle_error": { label: "Lỗi phụ đề", bg: "#2196f3", text: "#fff" },
            "audio_error": { label: "Lỗi âm thanh", bg: "#9c27b0", text: "#fff" },
            "wrong_movie": { label: "Sai phim/Tập", bg: "#4caf50", text: "#fff" },
            "other": { label: "Khác", bg: "#607d8b", text: "#fff" }
        };
        const typeBadge = typeLabels[item.error_type] || typeLabels["other"];
            
        return `
            <tr style="${isResolved ? 'opacity: 0.7;' : ''}">
                <td>
                    <div style="font-weight: 500;">${item.user_name || "Ẩn danh"}</div>
                    <div style="font-size: 11px; color: #888;">${(item.user_id || "").substring(0,8)}...</div>
                </td>
                <td style="text-align: center;">
                    <span style="background: ${item.report_count > 1 ? '#e74c3c' : '#555'}; color: #fff; font-size: 13px; font-weight: bold; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%;" title="Tổng cộng ${item.report_count} lượt báo">
                        ${item.report_count || 1}
                    </span>
                </td>
                <td>
                    <div style="font-weight: 500; color: #4db8ff;">${item.movie_title || "—"}</div>
                    <div style="font-size: 12px; color: #aaa;">${item.episode_name || "Phim lẻ"}</div>
                </td>
                <td>
                    <span style="font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; display: inline-block; background-color: ${typeBadge.bg}; color: ${typeBadge.text}; font-weight: bold; white-space: nowrap;">${typeBadge.label}</span>
                </td>
                <td style="max-width: 250px; white-space: pre-wrap; word-break: break-word;">
                    ${item.description || "—"}
                </td>
                <td style="font-size: 0.9rem;">${timeStr}</td>
                <td>${statusHtml}</td>
                <td style="text-align: center;">
                    ${!isResolved ? `
                        <button class="btn btn-sm btn-success" onclick="resolveErrorReport('${item.id}')" title="Đánh dấu đã xử lý" style="margin-right: 4px;">
                            <i class="fas fa-check"></i>
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-danger" onclick="deleteErrorReport('${item.id}')" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    // Render nút phân trang
    if (typeof renderAdminPagination === 'function') {
        renderAdminPagination("adminErrorReportPagination", totalItems, currentAdminErrorPage, adminPerPage, "changeAdminErrorPage", "báo lỗi");
    }
}

/**
 * Đánh dấu báo lỗi là Đã Xử Lý
 */
window.resolveErrorReport = async function(id) {
    if (!await customConfirm("Đánh dấu lỗi này là đã giải quyết?", { title: "Xử lý lỗi", type: "info", confirmText: "Đồng ý" })) return;

    try {
        const { error } = await supabase.from('error_reports').update({
            status: "resolved",
            resolved_at: new Date().toISOString()
        }).eq('id', id);

        if (error) throw error;
        showNotification("Đã cập nhật trạng thái!", "success");
        fetchErrorReports();
    } catch (err) {
        console.error(err);
        showNotification("Lỗi cập nhật!", "error");
    }
};

/**
 * Xóa báo lỗi
 */
window.deleteErrorReport = async function(id) {
    if (!await customConfirm("Bạn có chắc muốn xóa vĩnh viễn báo lỗi này?", { title: "Xóa báo lỗi", type: "danger", confirmText: "Xóa" })) return;

    try {
        showLoading(true, "Đang xóa...");
        
        const { error } = await supabase.from('error_reports').delete().eq('id', id);
        if (error) throw error;

        showNotification("Đã xóa báo lỗi!", "success");
        fetchErrorReports();
    } catch (err) {
        console.error(err);
        showNotification("Lỗi xóa!", "error");
    } finally {
        showLoading(false);
    }
};
/**
 * Lọc danh sách phim (Admin)
 */
function filterAdminMovies(skipPageReset = false) {
  const searchInput = document.getElementById("adminSearchMovies");
  const statusSelect = document.getElementById("adminFilterStatus");
  const typeSelect = document.getElementById("adminFilterMovieType");
  const categorySelect = document.getElementById("adminFilterMovieCategory");
  const countrySelect = document.getElementById("adminFilterCountry");
  const sortSelect = document.getElementById("adminSortMovies");
  
  // Reset về trang 1 khi người dùng lọc — KHÔNG reset khi changeAdminMoviePage gọi
  if (!skipPageReset && typeof currentAdminMoviePage !== 'undefined') {
      currentAdminMoviePage = 1; 
  }
  
  const searchText = removeDiacritics(searchInput.value);
  const statusFilter = statusSelect ? statusSelect.value : "";
  const typeFilter = typeSelect ? typeSelect.value : "";
  const categoryFilter = categorySelect ? categorySelect.value : "";
  const countryFilter = countrySelect ? countrySelect.value : "";
  const sortOrder = sortSelect ? sortSelect.value : "newest";

  console.log("🔍 Đang lọc Admin Movies:", { searchText, statusFilter, typeFilter, categoryFilter, countryFilter });
  const filteredMovies = (allAdminMovies || []).filter(m => {
    // 1. Phân tách logic: Tên/ID (hỗ trợ không dấu)
    const matchText = !searchText || removeDiacritics(m.title || "").includes(searchText) || removeDiacritics(m.originTitle || m.origin_title || "").includes(searchText) || (m.id || "").toLowerCase().includes(searchText);
    
    // 2. Trạng thái & Loại
    const matchStatus = statusFilter === "" || m.status === statusFilter;
    const matchType = typeFilter === "" || m.type === typeFilter;
    
    // 3. Quốc gia (Đồng nhất ID/Name)
    const movieCountryId = m.countryId || m.country_id || "";
    const movieCountryName = m.country || "";
    const matchCountry = countryFilter === "" || movieCountryId === countryFilter || movieCountryName === countryFilter;
    
    // 4. Thể loại (Exhaustive Match)
    let matchCategory = true;
    if (categoryFilter !== "") {
        const catId = m.categoryId || m.category_id || "";
        const catArray = Array.isArray(m.categories) ? m.categories : [];
        const catOld = m.category || "";
        matchCategory = (catId === categoryFilter) || catArray.includes(categoryFilter) || (catOld === categoryFilter);
    }

    return matchText && matchStatus && matchType && matchCategory && matchCountry;
  });

  console.log(`✅ Kết quả: tìm thấy ${filteredMovies.length} phim thỏa mãn bộ lọc`);

  // Xử lý Sắp xếp
  filteredMovies.sort((a, b) => {
    const timeA = a.createdAt ? (a.createdAt.seconds || new Date(a.createdAt).getTime() / 1000 || 0) : 0;
    const timeB = b.createdAt ? (b.createdAt.seconds || new Date(b.createdAt).getTime() / 1000 || 0) : 0;
    
    if (sortOrder === "newest") return timeB - timeA;
    if (sortOrder === "oldest") return timeA - timeB;
    return 0;
  });

  renderAdminMoviesList(filteredMovies);

  // Cập nhật Thống kê
  updateAdminMovieStats(filteredMovies);
}

/**
 * Cập nhật thanh thống kê số lượng phim
 */
async function updateAdminMovieStats(moviesList) {
    const totalEl = document.getElementById("statMoviesTotal");
    const singleEl = document.getElementById("statMoviesSingle");
    const seriesEl = document.getElementById("statMoviesSeries");

    if (!totalEl || !singleEl || !seriesEl) return;

    // Đếm tổng chính xác từ DB (không bị limit bởi mảng JS)
    let total = moviesList.length;
    try {
        if (typeof supabase !== 'undefined') {
            const { count } = await supabase.from('movies').select('*', { count: 'exact', head: true });
            if (count !== null && count !== undefined) total = count;
        }
    } catch(e) { /* fallback dùng mảng */ }

    const singleCount = moviesList.filter(m => m.type === "single").length;
    const seriesCount = moviesList.filter(m => m.type === "series").length;

    totalEl.textContent = `Tổng: ${total}`;
    singleEl.textContent = `Phim lẻ: ${singleCount}`;
    seriesEl.textContent = `Phim bộ: ${seriesCount}`;
}

/**
 * Tự động nạp các thể loại thực tế có phim vào bộ lọc
 */
function populateAdminMovieFilters() {
    const categorySelect = document.getElementById("adminFilterMovieCategory");
    const countrySelect = document.getElementById("adminFilterCountry");
    if (!allAdminMovies) return;

    // 1. Xử lý Thể loại
    if (categorySelect) {
        const usedCategories = new Set();
        (allAdminMovies || []).forEach(m => {
            // Bao gồm category_id và mảng categories
            const catId = m.categoryId || m.category_id;
            if (catId) usedCategories.add(catId);
            
            if (Array.isArray(m.categories)) {
                m.categories.forEach(c => { if (c) usedCategories.add(c); });
            }
            if (m.category) usedCategories.add(m.category);
        });

        const sortedCategories = Array.from(usedCategories).sort();
        categorySelect.innerHTML = '<option value="">Tất cả thể loại</option>' + 
            sortedCategories.map(catId => {
                const found = (typeof allCategories !== 'undefined' && allCategories.length > 0) 
                              ? allCategories.find(c => c.id === catId || c.name === catId) 
                              : null;
                const displayName = found ? found.name : catId;
                return `<option value="${catId}">${displayName}</option>`;
            }).join("");
    }

    // 2. Xử lý Quốc gia
    if (countrySelect) {
        const countryStats = {}; // { "vn": 10, "kr": 5 }
        (allAdminMovies || []).forEach(m => {
            const countryId = m.countryId || m.country_id || m.country;
            if (countryId) {
                countryStats[countryId] = (countryStats[countryId] || 0) + 1;
            }
        });
        
        const sortedCountries = Object.keys(countryStats).sort();
        countrySelect.innerHTML = '<option value="">Tất cả quốc gia</option>' + 
            sortedCountries.map(countryId => {
                const found = (typeof allCountries !== 'undefined' && allCountries.length > 0)
                              ? allCountries.find(c => c.id === countryId || c.name === countryId)
                              : null;
                const displayName = found ? found.name : countryId;
                const info = (typeof getCountryInfo === 'function') ? getCountryInfo(displayName) : { icon: "🌐" };
                return `<option value="${countryId}">${displayName} (${countryStats[countryId]})</option>`;
            }).join("");
    }
}

/**
 * Render danh sách <option> cho dropdown chọn phim trong Quản lý Tập
 * Kèm theo Badge: Chưa có tập, Đang cập nhật (x/y)
 */
function renderEpisodeMovieOptions(moviesList) {
    if (!moviesList) return '<option value="">-- Chọn phim --</option>';
    
    return '<option value="">-- Chọn phim --</option>' + 
        moviesList.map(m => {
            const currentEps = (m.episodes || []).length;
            const totalEps = parseInt(m.totalEpisodes) || 0;
            let badge = "";

            if (currentEps === 0) {
                badge = "🔴 [Chưa có tập] ";
            } else if (m.type === 'series' && currentEps < totalEps) {
                badge = `🟠 [Đang cập nhật ${currentEps}/${totalEps}] `;
            }

            return `<option value="${m.id}">${badge}${m.title}</option>`;
        }).join("");
}

/**
 * Lấy thông tin trang trí cho Quốc gia (Icon + Màu sắc)
 */
function getCountryInfo(countryName) {
    if (!countryName) return { icon: '🌐', bg: 'rgba(255,255,255,0.05)', color: '#ccc' };
    
    const name = countryName.toLowerCase().trim();
    
    const countries = {
        // Châu Á
        'việt nam':        { icon: '🇻🇳', code: 'vn', bg: 'rgba(229,9,20,0.15)',    color: '#ff4d4d' },
        'hàn quốc':        { icon: '🇰🇷', code: 'kr', bg: 'rgba(77,171,247,0.15)',  color: '#4dabf7' },
        'trung quốc':      { icon: '🇨🇳', code: 'cn', bg: 'rgba(253,126,20,0.15)',  color: '#fd7e14' },
        'nhật bản':        { icon: '🇯🇵', code: 'jp', bg: 'rgba(255,255,255,0.15)', color: '#fff' },
        'thái lan':        { icon: '🇹🇭', code: 'th', bg: 'rgba(81,207,102,0.15)',  color: '#51cf66' },
        'đài loan':        { icon: '🇹🇼', code: 'tw', bg: 'rgba(20,184,166,0.15)',  color: '#14b8a6' },
        'hồng kông':       { icon: '🇭🇰', code: 'hk', bg: 'rgba(220,38,38,0.15)',   color: '#f87171' },
        'ấn độ':           { icon: '🇮🇳', code: 'in', bg: 'rgba(245,159,0,0.15)',   color: '#f59f00' },
        'philippines':     { icon: '🇵🇭', code: 'ph', bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
        'indonesia':       { icon: '🇮🇩', code: 'id', bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
        'malaysia':        { icon: '🇲🇾', code: 'my', bg: 'rgba(220,38,38,0.12)',   color: '#fca5a5' },
        'singapore':       { icon: '🇸🇬', code: 'sg', bg: 'rgba(220,38,38,0.12)',   color: '#fca5a5' },
        'campuchia':       { icon: '🇰🇭', code: 'kh', bg: 'rgba(99,102,241,0.12)',  color: '#a5b4fc' },
        'myanma':          { icon: '🇲🇲', code: 'mm', bg: 'rgba(234,179,8,0.12)',   color: '#fde047' },
        'myanmar':         { icon: '🇲🇲', code: 'mm', bg: 'rgba(234,179,8,0.12)',   color: '#fde047' },
        'lào':             { icon: '🇱🇦', code: 'la', bg: 'rgba(239,68,68,0.12)',   color: '#fca5a5' },
        'mông cổ':         { icon: '🇲🇳', code: 'mn', bg: 'rgba(99,102,241,0.12)',  color: '#a5b4fc' },
        'pakistan':        { icon: '🇵🇰', code: 'pk', bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
        'bangladesh':      { icon: '🇧🇩', code: 'bd', bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
        'sri lanka':       { icon: '🇱🇰', code: 'lk', bg: 'rgba(220,38,38,0.12)',   color: '#fca5a5' },
        'iran':            { icon: '🇮🇷', code: 'ir', bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
        'israel':          { icon: '🇮🇱', code: 'il', bg: 'rgba(96,165,250,0.12)',  color: '#93c5fd' },
        'thổ nhĩ kỳ':      { icon: '🇹🇷', code: 'tr', bg: 'rgba(220,38,38,0.15)',   color: '#f87171' },
        'ả rập xê út':     { icon: '🇸🇦', code: 'sa', bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
        // Châu Âu
        'mỹ':              { icon: '🇺🇸', code: 'us', bg: 'rgba(51,154,240,0.15)',  color: '#339af0' },
        'anh':             { icon: '🇬🇧', code: 'gb', bg: 'rgba(77,171,247,0.12)',  color: '#4dabf7' },
        'pháp':            { icon: '🇫🇷', code: 'fr', bg: 'rgba(45,201,255,0.12)',  color: '#2dc9ff' },
        'đức':             { icon: '🇩🇪', code: 'de', bg: 'rgba(234,179,8,0.12)',   color: '#fde047' },
        'ý':               { icon: '🇮🇹', code: 'it', bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
        'tây ban nha':     { icon: '🇪🇸', code: 'es', bg: 'rgba(239,68,68,0.12)',   color: '#f87171' },
        'bồ đào nha':      { icon: '🇵🇹', code: 'pt', bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
        'nga':             { icon: '🇷🇺', code: 'ru', bg: 'rgba(239,68,68,0.12)',   color: '#f87171' },
        'hà lan':          { icon: '🇳🇱', code: 'nl', bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24' },
        'bỉ':              { icon: '🇧🇪', code: 'be', bg: 'rgba(234,179,8,0.12)',   color: '#fde047' },
        'thụy điển':       { icon: '🇸🇪', code: 'se', bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd' },
        'đan mạch':        { icon: '🇩🇰', code: 'dk', bg: 'rgba(220,38,38,0.12)',   color: '#fca5a5' },
        'nauy':            { icon: '🇳🇴', code: 'no', bg: 'rgba(220,38,38,0.12)',   color: '#fca5a5' },
        'phần lan':        { icon: '🇫🇮', code: 'fi', bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd' },
        'áo':              { icon: '🇦🇹', code: 'at', bg: 'rgba(220,38,38,0.12)',   color: '#fca5a5' },
        'thụy sĩ':         { icon: '🇨🇭', code: 'ch', bg: 'rgba(220,38,38,0.12)',   color: '#fca5a5' },
        'ba lan':          { icon: '🇵🇱', code: 'pl', bg: 'rgba(220,38,38,0.12)',   color: '#fca5a5' },
        'séc':             { icon: '🇨🇿', code: 'cz', bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd' },
        'hungary':         { icon: '🇭🇺', code: 'hu', bg: 'rgba(220,38,38,0.12)',   color: '#fca5a5' },
        'hy lạp':          { icon: '🇬🇷', code: 'gr', bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd' },
        // Châu Mỹ & Khác
        'canada':          { icon: '🇨🇦', code: 'ca', bg: 'rgba(220,38,38,0.12)',   color: '#fca5a5' },
        'brazil':          { icon: '🇧🇷', code: 'br', bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
        'mexico':          { icon: '🇲🇽', code: 'mx', bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
        'argentina':       { icon: '🇦🇷', code: 'ar', bg: 'rgba(96,165,250,0.12)',  color: '#93c5fd' },
        'australia':       { icon: '🇦🇺', code: 'au', bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd' },
        'úc':              { icon: '🇦🇺', code: 'au', bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd' },
        'new zealand':     { icon: '🇳🇿', code: 'nz', bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd' },
        'nam phi':         { icon: '🇿🇦', code: 'za', bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
        'ai cập':          { icon: '🇪🇬', code: 'eg', bg: 'rgba(234,179,8,0.12)',   color: '#fde047' },
        // Liên minh / Đa quốc gia
        'âu mỹ':           { icon: '🇪🇺', code: 'eu', bg: 'rgba(132,94,247,0.15)',  color: '#845ef7' },
        'quốc tế':         { icon: '🌍', code: '',   bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' },
    };


    // 1. Tìm kiếm trong danh sách được cấu hình sẵn màu sắc đẹp
    for (const key in countries) {
        if (name.includes(key)) return countries[key];
    }

    // 2. Nếu không có trong danh sách cứng, tra cứu từ dữ liệu quốc gia thực tế (allCountries)
    if (typeof allCountries !== 'undefined') {
        const found = allCountries.find(c => c.name.toLowerCase() === name || (c.id && c.id.toLowerCase() === name));
        if (found && found.code) {
            return { 
                icon: '🏳️', 
                code: found.code.toLowerCase(), 
                bg: 'rgba(255,255,255,0.08)', 
                color: '#eee' 
            };
        }
    }

    // Mặc định cho quốc gia lạ
    return { icon: '🏳️', bg: 'rgba(255,255,255,0.08)', color: '#eee' };
}


/**
 * Biến toàn cục lưu danh sách phim cho Admin (Bao gồm cả ẩn/chờ duyệt)
 */
let allAdminMovies = [];

/**
 * Load danh sách phim cho Admin
 */
async function loadAdminMovies(skipPageReset = false) {
  const tbody = document.getElementById("adminMoviesTable");
  
  // Kiểm tra quyền hiển thị nút Xóa tất cả phim (chỉ Super Admin mới thấy)
  const btnDeleteAll = document.getElementById("btnDeleteAllMovies");
  if (btnDeleteAll) {
      if (typeof currentUser !== 'undefined' && currentUser && currentUser.email === "huynhphutrong8223@gmail.com") {
          btnDeleteAll.style.display = "inline-flex";
      } else {
          btnDeleteAll.style.display = "none";
      }
  }

  if (!supabase) return;

  try {
    // Load tất cả phim — chỉ select cột cần, KHÔNG join episodes (tránh lag)
    // Supabase giới hạn 1000 rows/query nên loop batch
    let allMoviesRaw = [];
    const BATCH = 1000;
    let from = 0;
    let keepFetching = true;
    while (keepFetching) {
        const { data: batch, error: batchErr } = await supabase
            .from('movies')
            .select('id, title, origin_title, poster_url, background_url, type, status, year, quality, country_id, category_ids, total_episodes, price, rating, imdb_rating, api_url_backup, cast_data, tags, versions, part, series_id, duration, age_limit, description, created_at, updated_at')
            .order('created_at', { ascending: false })
            .range(from, from + BATCH - 1);
        if (batchErr) throw batchErr;
        if (!batch || batch.length === 0) break;
        allMoviesRaw = allMoviesRaw.concat(batch);
        if (batch.length < BATCH) break;
        from += BATCH;
    }

    // Chuẩn hóa dữ liệu
    allAdminMovies = allMoviesRaw.map(m => {
        const normalized = typeof normalizeMovieData === 'function' ? normalizeMovieData(m) : m;
        normalized._episodeCount = 0; // Sẽ gán lại sau khi đếm thực tế
        return normalized;
    });

    // ★ [FIX] Đếm số tập THỰC TẾ trong bảng episodes cho mỗi phim (thay vì dùng total_episodes từ API)
    try {
        let allEpCounts = [];
        let countFrom = 0;
        const COUNT_BATCH = 1000;
        while (true) {
            const { data: countBatch, error: countErr } = await supabase
                .from('episodes')
                .select('movie_id')
                .range(countFrom, countFrom + COUNT_BATCH - 1);
            if (countErr || !countBatch || countBatch.length === 0) break;
            allEpCounts = allEpCounts.concat(countBatch);
            if (countBatch.length < COUNT_BATCH) break;
            countFrom += COUNT_BATCH;
        }
        // Đếm số tập theo movie_id
        const epCountMap = {};
        allEpCounts.forEach(ep => {
            epCountMap[ep.movie_id] = (epCountMap[ep.movie_id] || 0) + 1;
        });
        // Gán _episodeCount thực tế vào mỗi movie
        allAdminMovies.forEach(m => {
            m._episodeCount = epCountMap[m.id] || 0;
        });
        console.log(`📊 Đếm tập thực tế cho ${Object.keys(epCountMap).length} phim`);
    } catch (e) {
        console.warn('⚠️ Không đếm được số tập thực tế:', e);
        // Fallback: dùng total_episodes nếu không đếm được
        allAdminMovies.forEach(m => {
            m._episodeCount = m.totalEpisodes || m.total_episodes || 0;
        });
    }

    // [NEW] Lấy server info nhẹ: Chỉ fetch movie_id + sources từ episode đầu tiên
    try {
        let allFirstEps = [];
        let epFrom = 0;
        const EP_BATCH = 1000;
        while (true) {
            const { data: epBatch, error: epErr } = await supabase
                .from('episodes')
                .select('movie_id, sources')
                .eq('episode_index', 0)
                .range(epFrom, epFrom + EP_BATCH - 1);
            if (epErr || !epBatch || epBatch.length === 0) break;
            allFirstEps = allFirstEps.concat(epBatch);
            if (epBatch.length < EP_BATCH) break;
            epFrom += EP_BATCH;
        }
        // Gán _serverNames vào từng movie (chuẩn hóa tên: rỗng/Unknown → KKPhim)
        const serverInfoMap = {};
        allFirstEps.forEach(ep => {
            if (ep.sources && Array.isArray(ep.sources)) {
                const servers = [...new Set(ep.sources.map(s => {
                    const name = (s.server || '').trim();
                    return (!name || name === 'Unknown') ? 'KKPhim' : name;
                }))];
                serverInfoMap[ep.movie_id] = servers;
            }
        });
        allAdminMovies.forEach(m => {
            m._serverNames = serverInfoMap[m.id] || [];
        });
        console.log(`📡 Server info loaded for ${Object.keys(serverInfoMap).length} movies`);
    } catch (e) {
        console.warn('⚠️ Không load được server info:', e);
    }

    if (typeof populateAdminMovieFilters === 'function') populateAdminMovieFilters();
    filterAdminMovies(skipPageReset);
    
    const select = document.getElementById("selectMovieForEpisodes");
    if (select) {
        const currentVal = select.value;
        select.innerHTML = renderEpisodeMovieOptions(allAdminMovies);
        if (currentVal && allAdminMovies.some(m => m.id === currentVal)) {
            select.value = currentVal;
        }
    }

    renderRecentMovies();
  } catch (error) {
    console.error("Lỗi load admin movies Supabase:", error);
  }
}

/**
 * Helper: Parse chuỗi thời lượng (VD: "1 giờ 30 phút" hoặc "120 phút") thành {h, m}
 */
function parseDuration(str) {
    let hours = 0;
    let minutes = 0;
    
    if (!str) return { h: 0, m: 0 };
    
    // Regex tìm giờ và phút
    const hourMatch = str.match(/(\d+)\s*giờ/i);
    const minuteMatch = str.match(/(\d+)\s*phút/i);
    
    if (hourMatch) hours = parseInt(hourMatch[1]);
    if (minuteMatch) minutes = parseInt(minuteMatch[1]);
    
    // Nếu không có cả 2 mà chỉ có số (trường hợp dữ liệu cũ thô)
    if (!hourMatch && !minuteMatch) {
        const onlyNum = str.match(/(\d+)/);
        if (onlyNum) minutes = parseInt(onlyNum[1]);
    }
    
    return { h: hours, m: minutes };
}

/**
 * Helper: Format {h, m} thành chuỗi "X giờ Y phút"
 */
function formatDuration(h, m) {
    let result = [];
    if (h > 0) result.push(`${h} giờ`);
    if (m > 0) result.push(`${m} phút`);
    return result.join(" ") || "";
}
/**
 * Mở modal thêm/sửa phim
 */
// Thêm hàm này vào trước openMovieModal
/**
 * Cập nhật UI nhập Phần/Mùa dựa trên Type
 */
function updateMoviePartUI() {
    const type = document.getElementById("moviePartType").value;
    const groupNumber = document.getElementById("groupPartNumber"); // Chứa Input Number + Buttons
    const inputCustom = document.getElementById("moviePartCustom");

    if (type === "custom") {
        // Hiện ô nhập text, ẩn ô nhập số
        groupNumber.style.display = "none";
        inputCustom.style.display = "block";
        inputCustom.focus();
    } else if (type === "") {
        // Ẩn cả 2
        groupNumber.style.display = "none";
        inputCustom.style.display = "none";
    } else {
        // Hiện ô nhập số, ẩn ô text
        groupNumber.style.display = "flex";
        inputCustom.style.display = "none";
    }
}

/**
 * Tăng giảm số phần
 */
function adjustPartNumber(delta) {
    const input = document.getElementById("moviePartNumber");
    let current = parseInt(input.value) || 1;
    current += delta;
    if (current < 1) current = 1;
    input.value = current;
}

/**
 * Chuyển đổi chế độ nhập giá
 */
function toggleMoviePrice(type) {
  const priceInput = document.getElementById("moviePrice");
  if (!priceInput) return;

  if (type === "free") {
    priceInput.value = 0;
    priceInput.disabled = true;
    priceInput.style.backgroundColor = "#e9ecef"; // Màu xám nhạt
    priceInput.style.color = "#6c757d"; // Màu chữ xám
  } else {
    // Nếu chuyển sang Paid mà giá đang là 0 thì set mặc định 1
    if (parseFloat(priceInput.value) === 0) {
        priceInput.value = 1;
    }
    priceInput.disabled = false;
    priceInput.style.backgroundColor = "";
    priceInput.style.color = "";
  }
}

/**
 * [NEW] FETCH THÔNG TIN PHIM TỪ OPHIM BẰNG LINK API
 */
async function fetchMovieFromAPI() {
    const urlInput = document.getElementById("apiCloneUrl");
    const url = urlInput ? urlInput.value.trim() : "";
    if (!url) {
        showNotification("Vui lòng dán link API OPhim vào ô trống!", "error");
        return;
    }

    try {
        showLoading(true, "Đang tải dữ liệu phim từ OPhim...");
        
        let response = await fetch(url);
        // Kiểm tra Status
        if (!response.ok) {
            throw new Error(`Mã lỗi mạng: ${response.status}`);
        }

        const resData = await response.json();
        
        // Hỗ trợ cả 2 chuẩn API: KKPhim (resData.data.item) và OPhim/PhimAPI (resData.movie)
        let movieData = null;
        let episodesData = null;
        
        if (resData.movie) {
            movieData = resData.movie;
            episodesData = resData.episodes; // OPhim/PhimAPI để episodes ở ngoài
        } else if (resData.data && resData.data.item) {
            movieData = resData.data.item;
            episodesData = movieData.episodes || (resData.data && resData.data.episodes);
        }

        if (!movieData) {
             throw new Error("Dữ liệu API không đúng chuẩn hoặc phim không tồn tại!");
        }

        // --- 1. FILL TÊN PHIM ---
        document.getElementById("movieTitle").value = movieData.name || "";
        // Tên tiếng Anh (origin_name từ API)
        document.getElementById("movieOriginTitle").value = movieData.origin_name || "";
        
        // --- 2. FILL HÌNH ẢNH ---
        let thumbUrl = movieData.thumb_url || "";
        let posterUrl = movieData.poster_url || "";
        
        // Cdn Domain cho trường hợp trả về link tương đối
        let cdnDomain = resData.APP_DOMAIN_CDN_IMAGE || (resData.data && resData.data.APP_DOMAIN_CDN_IMAGE) || resData.pathImage || "https://img.ophim.live/uploads/movies";
        cdnDomain = cdnDomain.replace(/\/$/, "");

        if (thumbUrl && !thumbUrl.startsWith("http")) {
             thumbUrl = `${cdnDomain}/${thumbUrl.replace(/^\//, "")}`;
        }
        if (posterUrl && !posterUrl.startsWith("http")) {
             posterUrl = `${cdnDomain}/${posterUrl.replace(/^\//, "")}`;
        }

        document.getElementById("moviePoster").value = thumbUrl;
        document.getElementById("movieBackground").value = posterUrl;
        
        // Gán preview luôn cho sinh động
        window.updateImagePreview(thumbUrl, 'posterPreview');
        window.updateImagePreview(posterUrl, 'bgPreview');

        // --- 3. FILL MÔ TẢ & CHẤT LƯỢNG ---
        let contentDesc = movieData.content || "";
        // Content ophim trả về thường bọc thẻ <p>. Xóa mã html đi cho đẹp:
        contentDesc = contentDesc.replace(/<[^>]*>?/gm, ''); 
        document.getElementById("movieDescription").value = contentDesc;
        
        // Chất lượng
        const qualityStr = (movieData.quality || "").toUpperCase();
        if (["HD", "FHD", "2K", "4K", "SD"].includes(qualityStr)) {
             document.getElementById("movieQuality").value = qualityStr;
        } else if (qualityStr.includes("1080")) {
             document.getElementById("movieQuality").value = "FHD";
        }

        // Năm phát hành, thời lượng
        if (movieData.year) document.getElementById("movieYear").value = movieData.year;
        
        // Bóc số phút
        const timeStr = movieData.time || ""; 
        const matchTime = timeStr.match(/(\d+)\s*(phút|Phút|min)/);
        if (matchTime) {
            document.getElementById("movieDurationMinute").value = matchTime[1];
        }

        // --- 4. MAP THỂ LOẠI (CATEGORIES) ---
        // Tick chọn tự động các thể loại giống OPhim
        // cb.value là ID (UUID), cần tra cứu tên từ allCategories để so sánh với tên API
        if (movieData.category && Array.isArray(movieData.category)) {
            const opCategories = movieData.category.map(c => c.name.toLowerCase().trim());
            const checkboxes = document.querySelectorAll('input[name="movieCategoryCheckbox"]');
            
            checkboxes.forEach(cb => {
                cb.checked = false; // Reset
                // Tra cứu tên thể loại trong hệ thống dựa trên ID của checkbox
                const catObj = (typeof allCategories !== 'undefined' && allCategories)
                    ? allCategories.find(c => c.id === cb.value)
                    : null;
                if (!catObj) return; // Không tìm thấy thể loại trong hệ thống
                
                const catName = catObj.name.toLowerCase().trim();
                // So sánh tên thể loại hệ thống với tên từ OPhim API (hỗ trợ khớp một phần)
                const isMatch = opCategories.some(opCat => opCat.includes(catName) || catName.includes(opCat));
                if (isMatch) cb.checked = true;
            });
            
            // Log kết quả để debug
            const checkedCount = document.querySelectorAll('input[name="movieCategoryCheckbox"]:checked').length;
            console.log(`🎬 [API] Đã auto-check ${checkedCount} thể loại từ API:`, opCategories);
        }

        // --- 5. MAP QUỐC GIA ---
        if (movieData.country && Array.isArray(movieData.country) && movieData.country.length > 0) {
            const opCountry = movieData.country[0].name.toLowerCase();
            const countrySelect = document.getElementById("movieCountry");
            for (let i = 0; i < countrySelect.options.length; i++) {
                const optionText = countrySelect.options[i].text.toLowerCase();
                if (opCountry.includes(optionText) || optionText.includes(opCountry)) {
                    countrySelect.selectedIndex = i;
                    break;
                }
            }
        }

        // --- 6. KIỂU PHIM BỘ HAY PHIM LẺ ---
        if (movieData.type === "series") {
            document.getElementById("movieType").value = "series";
        } else {
            document.getElementById("movieType").value = "single";
        }
        
        // --- 8. PHÂN TÍCH DIỄN VIÊN TỪ API ---
        if (movieData.actor && Array.isArray(movieData.actor)) {
            const actorNames = movieData.actor.filter(n => n.toLowerCase() !== "đang cập nhật");
            if (typeof initSmartActorsFromCastString === "function") {
                initSmartActorsFromCastString(actorNames.join(", "));
            } else {
                document.getElementById("movieCast").value = actorNames.join(", ");
            }
        }
        
        // --- 7. TẠO TỰ ĐỘNG DANH SÁCH TẬP PHIM SERVER DATA (Trick Save API) ---
        let svData = null;
        if (episodesData && episodesData.length > 0) {
            svData = episodesData[0].server_data;
        } else if (movieData.episodes && movieData.episodes.length > 0) {
            svData = movieData.episodes[0].server_data;
        }

        if (svData && svData.length > 0) {
            // Lưu tạm mảng tập phim OPhim vào Input Ẩn để Admin bấm lưu nó tự save theo!
            // Do Admin form chưa hỗ trợ Save Episdoes cùng lúc với Create Movie. 
            // Tốt nhất là hiện Alert nhắc Admin lấy List Link M3U8 để thêm sau
            
            showNotification(`Đã tự động điền Form! Phim này có ${svData.length} tập. Vui lòng bấm LƯU để tạo phim trước, sau đó chép Link thủ công sang nút THÊM TẬP!`, "success", 8000);
            
            // Lưu tạm list server_data raw vào bộ nhớ window cho phép copy paste nếu cần
            window.tempOphimEpisodes = svData; 
            console.log("📺[OPhim/PhimAPI] Dữ liệu tập:", svData);
        } else {
             showNotification("Tải dữ liệu thông tin phim thành công!", "success");
        }
        
        // --- 9. COPY LINK TỪ FETCH XUỐNG DỰ PHÒNG ---
        document.getElementById("movieApiUrlBackup").value = url;
        
        // --- 10. TỰ SINH MÃ BỘ PHIM TỪ TÊN (MỚI) ---
        const seriesIdInput = document.getElementById("movieSeriesId");
        if (seriesIdInput && (seriesIdInput.value === "" || !movieId)) {
            const autoId = generateSeriesIdFromTitle(movieData.name);
            seriesIdInput.value = autoId;
            seriesIdInput.setAttribute("data-last-auto-title", movieData.name);
        }
            
        
    } catch (err) {
        console.error("Lỗi Fetch Data OPhim:", err);
        showNotification("Lỗi gọi API: " + err.message, "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Ẩn hiện trường tổng số tập dựa trên loại phim
 */
function toggleTotalEpsField(type) {
    const group = document.getElementById("totalEpisodesGroup");
    if (group) {
        group.style.display = type === "series" ? "block" : "none";
    }
}

/**
 * Mở modal thêm/sửa phim
 */
function openMovieModal(movieId = null) {
  const modal = document.getElementById("movieModal");
  const title = document.getElementById("movieModalTitle");
  const form = document.getElementById("movieForm");

  // Populate category and country selects
  // Populate category checkboxes
  const categoryContainer = document.getElementById("movieCategoryContainer");
  categoryContainer.innerHTML = allCategories
      .map((c) => `
        <div class="checkbox-item">
            <label style="cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.9rem; white-space: nowrap; padding: 3px 0;">
                <input type="checkbox" name="movieCategoryCheckbox" value="${c.id}" style="width: 16px; height: 16px; flex-shrink: 0; accent-color: var(--accent-primary, #9b59b6); cursor: pointer;">
                <span>${c.name}</span>
            </label>
        </div>
      `)
      .join("");

    const countrySelect = document.getElementById("movieCountry");
    countrySelect.innerHTML =
    '<option value="">Chọn quốc gia</option>' +
    allCountries
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join("");

  if (movieId) {
    // Edit mode
    title.textContent = "Sửa Phim";
    // Tìm phim từ cả allMovies (public) và allAdminMovies (tất cả trạng thái)
    let movie = allMovies.find((m) => m.id === movieId) || (typeof allAdminMovies !== 'undefined' && allAdminMovies.find((m) => m.id === movieId));
    // Chuẩn hóa dữ liệu snake_case -> camelCase
    if (movie && typeof normalizeMovieData === 'function') movie = normalizeMovieData(movie);

    if (movie) {
      document.getElementById("movieId").value = movieId;
      document.getElementById("movieTitle").value = movie.title;
      // document.getElementById("moviePart").value = movie.part || ""; // Code cũ
      
      // Xử lý Phần/Mùa (Parse dữ liệu cũ)
      const partStr = movie.part || "";
      const partTypeSelect = document.getElementById("moviePartType");
      const partNumberInput = document.getElementById("moviePartNumber");
      const partCustomInput = document.getElementById("moviePartCustom");

      // Regex check: "Phần 1", "Season 2", "Chapter 10"
      const match = partStr.match(/^(Phần|Season|Chapter|Quyển|Tập)\s+(\d+)$/);

      if (match) {
          // Khớp mẫu -> Chọn Type và điền Number
          partTypeSelect.value = match[1];
          partNumberInput.value = match[2];
          partCustomInput.value = "";
      } else if (partStr.trim() === "") {
          // Trống
          partTypeSelect.value = "";
          partNumberInput.value = "1";
          partCustomInput.value = "";
      } else {
          // Không khớp (VD: "Tập Đặc Biệt") -> Chọn Custom
          partTypeSelect.value = "custom";
          partNumberInput.value = "1";
          partCustomInput.value = partStr;
      }
      document.getElementById("movieType").value = movie.type || "single";
      toggleTotalEpsField(movie.type || "single");
      document.getElementById("movieTotalEpisodes").value = movie.totalEpisodes || "";
      updateMoviePartUI(); // Cập nhật UI ẩn hiện

      // Gán link ảnh poster vào ô input
      const posterUrlVal = movie.posterUrl || movie.poster_url || "";
      document.getElementById("moviePoster").value = posterUrlVal;

      // Cập nhật preview cho poster
      if (posterUrlVal) {
          const posterPreview = document.getElementById('posterPreview');
          if (posterPreview) {
              posterPreview.querySelector('img').src = posterUrlVal;
              posterPreview.style.display = "block";
              // Cập nhật biểu tượng nguồn
              window.updateSourceIndicator(posterUrlVal, 'posterPreview');
          }
      }

      // Gán link ảnh nền vào ô input và cập nhật preview
      const bgUrlVal = movie.backgroundUrl || movie.background_url || "";
      document.getElementById("movieBackground").value = bgUrlVal;
      // Cập nhật preview cho background
      if (bgUrlVal) {
          const bgPreview = document.getElementById('bgPreview');
          if (bgPreview) {
              bgPreview.querySelector('img').src = bgUrlVal;
              bgPreview.style.display = "block";
              // Cập nhật biểu tượng nguồn
              window.updateSourceIndicator(bgUrlVal, 'bgPreview');
          }
      }
      document.getElementById("movieCast").value = movie.cast || "";
      if (typeof initSmartActorsFromCastString === "function") {
          initSmartActorsFromCastString(movie.cast || "", movie.castData || movie.cast_data || []);
      }
      document.getElementById("movieOriginTitle").value = movie.originTitle || movie.origin_title || "";
      document.getElementById("movieApiUrlBackup").value = movie.apiUrlBackup || movie.api_url_backup || "";
      
      // Xử lý Versions (Checkboxes + Custom) - versions là text[]
      const versionsRaw = movie.versions || [];
      // Hỗ trợ cả array (mới) và string (fallback cũ)
      const currentVersions = Array.isArray(versionsRaw)
          ? versionsRaw
          : String(versionsRaw).split(',').map(v => v.trim()).filter(Boolean);
      const defaultVersions = ['Vietsub', 'Thuyết minh', 'Lồng tiếng'];
      const vCheckboxes = document.querySelectorAll('input[name="movieVersionCheckbox"]');
      let customVersions = [];

      vCheckboxes.forEach(cb => {
          cb.checked = currentVersions.includes(cb.value);
      });

      // Tìm các version không thuộc mặc định
      currentVersions.forEach(v => {
          if (!defaultVersions.includes(v)) customVersions.push(v);
      });
      document.getElementById('movieVersionsCustom').value = customVersions.join(', ');

      // Xử lý Thời lượng (Smart Input)
      const dur = parseDuration(movie.duration || "");
      document.getElementById("movieDurationHour").value = dur.h || "";
      document.getElementById("movieDurationMinute").value = dur.m || "";

      document.getElementById("movieAgeLimit").value = movie.ageLimit || "P";
      document.getElementById("movieQuality").value = movie.quality || "HD";

      // Xử lý Mult-Genre Checkboxes - đọc từ category_ids (mảng)
      const savedCategoryIds = (movie.category_ids && movie.category_ids.length > 0)
          ? movie.category_ids
          : (movie.categories || []);
      const checkboxes = document.querySelectorAll('input[name="movieCategoryCheckbox"]');
      checkboxes.forEach(cb => {
          cb.checked = savedCategoryIds.includes(cb.value);
      });

      document.getElementById("movieCountry").value = movie.country_id || movie.country || "";
      document.getElementById("movieYear").value = movie.year || "";
      document.getElementById("moviePrice").value = movie.price || 0;
      document.getElementById("movieDescription").value =
        movie.description || "";
      document.getElementById("movieTags").value = (movie.tags || []).join(
        ", ",
      );
      document.getElementById("movieStatus").value = movie.status || "public";
      
      // Series ID - NEW
      document.getElementById("movieSeriesId").value = movie.seriesId || movie.series_id || "";

      // Xử lý Radio Button Free/Paid
      const priceVal = parseFloat(movie.price || 0);
      if (priceVal === 0) {
          document.querySelector('input[name="movieFeeType"][value="free"]').checked = true;
          toggleMoviePrice('free');
      } else {
          document.querySelector('input[name="movieFeeType"][value="paid"]').checked = true;
          toggleMoviePrice('paid');
      }
    }
  } else {
    // Add mode
    title.textContent = "Thêm Phim Mới";
    form.reset();
    
    // Reset previews
    const posterPrev = document.getElementById('posterPreview');
    const bgPrev = document.getElementById('bgPreview');
    if (posterPrev) {
        posterPrev.style.display = "none";
        posterPrev.querySelector('img').src = "";
    }
    if (bgPrev) {
        bgPrev.style.display = "none";
        bgPrev.querySelector('img').src = "";
    }
    
    // Reset file inputs
    const posterInp = document.getElementById('posterInput');
    const bgInp = document.getElementById('bgInput');
    if (posterInp) posterInp.value = "";
    if (bgInp) bgInp.value = "";

    document.getElementById("movieId").value = "";
    document.getElementById("movieYear").value = new Date().getFullYear();
    document.getElementById("movieType").value = "series";
    toggleTotalEpsField("series"); // Default to series
    document.getElementById("movieTotalEpisodes").value = ""; // Reset total episodes
    
    // Mặc định Phần/Mùa: Chọn Trống
    document.getElementById("moviePartType").value = "";
    document.getElementById("moviePartNumber").value = "1";
    document.getElementById("moviePartCustom").value = "";
    updateMoviePartUI();

    // Reset new fields default
    document.getElementById("movieBackground").value = "";
    document.getElementById("movieCast").value = "";
    document.getElementById("movieSeriesId").value = ""; // Reset Series ID
    document.getElementById("movieApiUrlBackup").value = "";
    if (typeof initSmartActorsFromCastString === "function") {
        initSmartActorsFromCastString("");
    }
    
    // Reset Versions mặc định Vietsub
    const vCheckboxes = document.querySelectorAll('input[name="movieVersionCheckbox"]');
    vCheckboxes.forEach(cb => {
        cb.checked = (cb.value === "Vietsub");
    });
    document.getElementById("movieVersionsCustom").value = "";

    // Reset Thời lượng
    document.getElementById("movieDurationHour").value = "";
    document.getElementById("movieDurationMinute").value = "";

    document.getElementById("movieAgeLimit").value = "P";
    document.getElementById("movieQuality").value = "HD";

    // Mặc định là Miễn phí
    document.querySelector('input[name="movieFeeType"][value="free"]').checked = true;
    toggleMoviePrice("free");
  }

  window.pendingUploads = {};
  openModal("movieModal");
}

/**
 * Xử lý submit form phim
 */
async function handleMovieSubmit(event) {
  event.preventDefault();

  if (!supabase) {
    showNotification("Supabase chưa được cấu hình!", "error");
    return;
  }

  // 👇 HIỂN THỊ LOADING NGAY LẬP TỨC 👇
  showLoading(true, "Đang xử lý dữ liệu phim...");

  // Chờ tải ảnh lên Cloudinary nếu có (Deduplicate)
  if (typeof window.uploadPendingImages === "function") {
      const uploadSuccess = await window.uploadPendingImages();
      if (!uploadSuccess) {
          showLoading(false);
          return; 
      }
  }

  // Nếu thêm phim mới (chưa có movieId), tạo ID sớm để R2 upload dùng đúng folder
  // Lưu vào biến tạm, KHÔNG gán vào hidden input (để tránh nhầm sang nhánh UPDATE)
  const existingMovieId = document.getElementById("movieId").value;
  if (!existingMovieId) {
      const title = document.getElementById("movieTitle").value;
      if (title) {
          window._preGeneratedMovieId = generateSeriesIdFromTitle(title) + '-' + Date.now().toString().slice(-8);
      }
  } else {
      window._preGeneratedMovieId = null; // Reset nếu đang edit
  }

  // Chờ tải ảnh lên Cloudflare R2 nếu có (Thực sự upload khi bấm Lưu)
  if (typeof window.uploadPendingR2Images === "function") {
      showLoading(true, "Đang upload ảnh lên Server...");
      const r2Success = await window.uploadPendingR2Images();
      if (!r2Success) {
          showLoading(false);
          return;
      }
  }

  const movieId = document.getElementById("movieId").value;
  
  // Thu thập Categories
  const selectedCategories = Array.from(document.querySelectorAll('input[name="movieCategoryCheckbox"]:checked'))
                                  .map(cb => cb.value);
  
  if (selectedCategories.length === 0) {
      showLoading(false);
      showNotification("Vui lòng chọn ít nhất 1 thể loại!", "error");
      return;
  }

  showLoading(true, "Đang đồng bộ dữ liệu...");
  const movieData = {
    title: document.getElementById("movieTitle").value,
    origin_title: document.getElementById("movieOriginTitle").value || "",
    poster_url: document.getElementById("moviePoster").value,
    categories: selectedCategories, 
    country: document.getElementById("movieCountry").value,
    year: parseInt(document.getElementById("movieYear").value),
    publish_year: parseInt(document.getElementById("movieYear").value), // Đồng bộ
    price: document.querySelector('input[name="movieFeeType"]:checked').value === 'free' 
           ? 0 
           : parseFloat(document.getElementById("moviePrice").value || 0),
    description: document.getElementById("movieDescription").value,
    type: document.getElementById("movieType").value,
    total_episodes: document.getElementById("movieTotalEpisodes").value || "",
    
    background_url: document.getElementById("movieBackground").value,
    cast: document.getElementById("movieCast").value,
    api_url_backup: document.getElementById("movieApiUrlBackup").value.trim(),
    
    versions: (() => {
        let vels = Array.from(document.querySelectorAll('input[name="movieVersionCheckbox"]:checked')).map(cb => cb.value);
        const custom = document.getElementById("movieVersionsCustom").value.trim();
        if (custom) vels.push(...custom.split(",").map(s => s.trim()));
        return Array.from(new Set(vels)).join(", ");
    })(),

    duration: (() => {
        const h = parseInt(document.getElementById("movieDurationHour").value) || 0;
        const m = parseInt(document.getElementById("movieDurationMinute").value) || 0;
        return formatDuration(h, m);
    })(),

    age_limit: document.getElementById("movieAgeLimit").value,
    quality: document.getElementById("movieQuality").value,

    part: (() => {
        const type = document.getElementById("moviePartType").value;
        if (!type) return ""; 
        if (type === "custom") return document.getElementById("moviePartCustom").value.trim();
        return `${type} ${document.getElementById("moviePartNumber").value}`;
    })(),
    tags: document
      .getElementById("movieTags")
      .value.split(",")
      .map((t) => t.trim())
      .filter((t) => t),
    status: document.getElementById("movieStatus").value,
    series_id: document.getElementById("movieSeriesId").value.trim(), 
    updated_at: new Date().toISOString()
  };

    // --- [FIX] CHUẨN HÓA DỮ LIỆU TRƯỚC KHI GỬI LÊN SUPABASE ---
    const whitelist = [
        'id', 'title', 'origin_title', 'poster_url', 'background_url', 'description', 
        'year', 'type', 'duration', 'quality', 'status', 'age_limit', 'series_id', 
        'price', 'rating', 'total_episodes', 'api_url_backup', 'cast_data', 'tags', 
        'versions', 'category_ids', 'country_id', 'created_at', 'updated_at'
    ];

    const finalMovieData = {};
    whitelist.forEach(key => {
        if (movieData[key] !== undefined) {
            let value = movieData[key];
            
            // Ép kiểu cho các trường số (Tránh lỗi 22P02 của PostgreSQL khi gửi "")
            const numericFields = ['year', 'price', 'rating', 'total_episodes'];
            if (numericFields.includes(key)) {
                if (value === "" || value === null || isNaN(value)) {
                    value = null;
                } else {
                    value = Number(value);
                }
            }
            
            finalMovieData[key] = value;
        }
    });

    // 1. Đồng bộ Category & Country
    if (selectedCategories && selectedCategories.length > 0) {
        finalMovieData.category_ids = selectedCategories; // Lưu tất cả thể loại dạng mảng
    }
    finalMovieData.country_id = document.getElementById("movieCountry").value;

    // 1b. Versions từ checkbox - lưu dạng array (text[])
    try {
        let vels = Array.from(document.querySelectorAll('input[name="movieVersionCheckbox"]:checked')).map(cb => cb.value);
        const custom = document.getElementById('movieVersionsCustom').value.trim();
        if (custom) vels.push(...custom.split(',').map(s => s.trim()).filter(Boolean));
        finalMovieData.versions = [...new Set(vels)]; // Lưu là array
    } catch(e) {}

    // Tự động tạo diễn viên mới và gán vào cast_data
    try {
        const castString = document.getElementById("movieCast").value;
        const castData = await autoCreateNewActors(castString);
        finalMovieData.cast_data = castData;
    } catch (e) {
        console.warn("⚠️ Không thể tạo diễn viên tự động:", e);
    }

    try {
        showLoading(true, "Đang lưu vào kho dữ liệu...");

        if (movieId) {
            // Cập nhật
            const { error } = await supabase.from('movies').update(finalMovieData).eq('id', movieId);
            if (error) {
                console.error("Lỗi cập nhật phim:", error);
                throw error;
            }
            showNotification("Đã cập nhật phim!", "success");
        } else {
            // Thêm mới - Dùng ID đã sinh sớm (trước upload R2) hoặc tạo mới nếu chưa có
            finalMovieData.id = window._preGeneratedMovieId || (generateSeriesIdFromTitle(movieData.title) + '-' + Date.now().toString().slice(-8));
            window._preGeneratedMovieId = null; // Reset sau khi dùng

            finalMovieData.rating = 0;
            

            const { error } = await supabase.from('movies').insert(finalMovieData);
            if (error) {
                console.error("Lỗi thêm phim mới:", error);
                throw error;
            }
            
            showNotification("Đã thêm phim mới!", "success");
            
            // Gửi thông báo
            sendNotificationToAllUsers(
                "🎬 Phim mới: " + movieData.title,
                `Trạm Phim vừa cập nhật "${movieData.title}". Xem ngay!`,
                "new_movie"
            );
        }

        notifyDataChange("movies"); 
        closeModal("movieModal");

        // Lưu lại trang hiện tại để sau khi reload không bị nhảy về trang 1
        const _savedMoviePage = currentAdminMoviePage || 1;

        if (typeof loadMovies === 'function') await loadMovies();
        // Truyền skipPageReset=true để loadAdminMovies không reset trang về 1
        await loadAdminMovies(true);

        // Đảm bảo trang không bị thay đổi (phòng hờ)
        currentAdminMoviePage = _savedMoviePage;
    } catch (error) {
        console.error("Lỗi chi tiết Supabase:", error);
        showNotification(`Lỗi: ${error.message || 'Không thể lưu phim'}`, "error");
    } finally {
        showLoading(false);
    }
}

/**
 * [NEW] Tìm kiếm gợi ý Mã bộ phim (Series ID) từ danh sách phim có sẵn
 */
function searchSeriesIdSuggestions(query) {
    const dropdown = document.getElementById("seriesIdSuggestions");
    if (!dropdown) return;

    if (!allAdminMovies || allAdminMovies.length === 0) {
        dropdown.style.display = "none";
        return;
    }

    // Lấy danh sách các seriesId duy nhất, không trống
    const uniqueSeriesIds = [...new Set(
        allAdminMovies
            .map(m => m.seriesId)
            .filter(id => id && id.trim() !== "")
    )];

    const searchText = query.toLowerCase().trim();
    
    // Lọc theo query (nếu query trống thì hiện tất cả tối đa 10 cái gần nhất)
    const matches = uniqueSeriesIds.filter(id => 
        id.toLowerCase().includes(searchText)
    ).slice(0, 10);

    if (matches.length > 0) {
        dropdown.innerHTML = matches.map(id => `
            <div class="suggestion-item" onclick="selectSeriesIdSuggestion('${id}')">
                <i class="fas fa-layer-group"></i> ${id}
            </div>
        `).join("");
        dropdown.style.display = "block";
    } else {
        dropdown.style.display = "none";
    }
}

/**
 * [NEW] Chọn một gợi ý Mã bộ phim
 */
function selectSeriesIdSuggestion(id) {
    const input = document.getElementById("movieSeriesId");
    if (input) {
        input.value = id;
        closeSeriesIdSuggestions();
    }
}

/**
 * [NEW] Đóng danh sách gợi ý
 */
function closeSeriesIdSuggestions() {
    const dropdown = document.getElementById("seriesIdSuggestions");
    if (dropdown) dropdown.style.display = "none";
}

/**
 * [NEW] Chuyển đổi Tiếng Việt có dấu sang không dấu, viết liền (Dùng cho Series ID)
 */
function generateSeriesIdFromTitle(title) {
    if (!title) return "";
    
    // Giữ toàn bộ tên phim (không cắt tại dấu : hoặc - như trước)
    let baseTitle = title.trim();
    
    // Ngưỡng tối đa: số > 30 thường là tên phim (VD: "Xin Chào 1983"), KHÔNG phải phần/mùa
    const MAX_PART = 30;
    
    // Loại bỏ từ khóa Phần/Season/Mùa/Part/Quyển/Kỳ/Vol... kèm số (VD: "Phần 2", "Season 3", "Vol. 2")
    baseTitle = baseTitle.replace(/(\s+)(Phần|Season|Mùa|Part|Quyển|Kỳ|Chapter|Vol(?:ume)?\.?|Series|Cour)\s*(\d+|I{1,3}V?|V?I{1,3}|X{1,3})/i, "").trim();
    // Loại bỏ shorthand S02, SS2 ở cuối
    baseTitle = baseTitle.replace(/\s+SS?\d+$/i, "").trim();
    
    // Loại bỏ số La Mã hoặc số nhỏ ở cuối (VD: "Iron Man 2") — CHỈ khi số <= MAX_PART
    baseTitle = baseTitle.replace(/(\s+)(I|II|III|IV|V)$/i, "").trim();
    baseTitle = baseTitle.replace(/(\s+)(\d+)$/i, (match, space, numStr) => {
        const num = parseInt(numStr);
        // Chỉ xóa nếu là số nhỏ (phần/mùa), giữ nguyên số lớn (tên phim VD: 1983, 2024)
        return (num <= MAX_PART) ? "" : match;
    }).trim();

    return baseTitle
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Xóa dấu
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .replace(/[^a-z0-9]/g, "") // Xóa ký tự đặc biệt và khoảng trắng
        .trim();
}

/**
 * [NEW] Xử lý sự kiện nhập tên phim để tự sinh mã bộ phim
 */
function handleTitleInputForSeriesId(title) {
    const seriesIdInput = document.getElementById("movieSeriesId");
    if (!seriesIdInput) return;

    // Chỉ tự động điền nếu ô mã đang trống hoặc mã đó khớp với mã cũ được sinh từ tên cũ
    const currentId = seriesIdInput.value;
    const oldTitle = seriesIdInput.getAttribute("data-last-auto-title") || "";
    const expectedOldId = generateSeriesIdFromTitle(oldTitle);

    if (currentId === "" || currentId === expectedOldId) {
        const newId = generateSeriesIdFromTitle(title);
        seriesIdInput.value = newId;
        seriesIdInput.setAttribute("data-last-auto-title", title);
    }
}


/**
 * Sửa phim
 */
function editMovie(movieId) {
  openMovieModal(movieId);
}

/**
 * Xóa phim
 */
async function deleteMovie(movieId) {
  if (!await customConfirm("Bạn có chắc muốn xóa phim này? Hành động này không thể hoàn tác!", { title: "Xóa phim", type: "danger", confirmText: "Xóa" }))
    return;

  if (!supabase) return;

  try {
    showLoading(true, "Đang xử lý dọn dẹp và xóa phim...");

    // 1. Lấy thông tin phim trước để lấy URL ảnh R2 (nếu có) để xóa file vật lý
    const { data: movie } = await supabase.from('movies').select('poster_url, background_url').eq('id', movieId).single();
    
    // 2. Xóa ảnh trên Cloudflare R2 nếu có
    if (movie) {
        if (movie.poster_url) await window.deleteImageFromR2(movie.poster_url);
        if (movie.background_url) await window.deleteImageFromR2(movie.background_url);
    }

    // 3. Xóa dữ liệu rác trong bảng notifications (giữ lại code này vì JSONB không hỗ trợ Cascade SQL)
    try {
        await supabase.from('notifications').delete().contains('metadata', { movie_id: movieId });
    } catch (e) { console.warn("Lỗi dọn rác notifications:", e); }

    // 4. Xóa phim khỏi Database
    const { error } = await supabase.from('movies').delete().eq('id', movieId);
    if (error) throw error;

    showNotification("Đã xóa phim và dọn dẹp ảnh R2 (nếu có)!", "success");
    notifyDataChange("movies"); 

    if (typeof loadMovies === 'function') await loadMovies();
    await loadAdminMovies();
  } catch (error) {
    console.error("Lỗi xóa phim Supabase:", error);
    showNotification("Không thể xóa phim!", "error");
  } finally {
    showLoading(false);
  }
}

/**
 * Xóa toàn bộ phim trong Database (Làm sạch hoàn toàn)
 */
async function deleteAllMoviesConfirm() {
  if (!supabase) return;

  // Lớp bảo mật cấp 2: Kiểm tra cứng trong logic phòng trường hợp F12 hiện nút
  if (!currentUser || currentUser.email !== "huynhphutrong8223@gmail.com") {
      showNotification("Truy cập từ chối: Chỉ Super Admin mới có quyền thực hiện hành động này!", "error");
      return;
  }

  const confirmText = await customPrompt("Bạn đang chuẩn bị xóa TOÀN BỘ phim trong hệ thống.\nHành động này KHÔNG THỂ HOÀN TÁC và sẽ xóa toàn bộ dữ liệu bao gồm cả Phim, Tập Phim, và File Ảnh R2 liên quan.\n\nĐể xác nhận, vui lòng gõ chính xác dòng chữ: XOA_TAT_CA", {
      title: "CẢNH BÁO NGUY HIỂM",
      placeholder: "Nhập XOA_TAT_CA",
      confirmText: "Xóa Toàn Bộ",
      cancelText: "Hủy"
  });
  
  if (confirmText !== "XOA_TAT_CA") {
      if (confirmText !== null) showNotification("Hủy xóa vì nhập sai mã xác nhận.", "info");
      return;
  }

  try {
    showLoading(true, "Đang xử lý dọn dẹp và xóa toàn bộ phim...");

    // 1. Phải lấy toàn bộ DB để có ID và Link ảnh R2
    const { data: movies, error: fetchErr } = await supabase.from('movies').select('id, poster_url, background_url');
    if (fetchErr) throw fetchErr;

    if (movies && movies.length > 0) {
        // 2. Xóa ảnh R2 (Chạy batch song song 50 request cùng lúc)
        showNotification(`Phát hiện ${movies.length} phim. Đang dọn dẹp file ảnh Cloudflare R2...`, "info");
        const chunkSize = 50;
        for (let i = 0; i < movies.length; i += chunkSize) {
            const chunk = movies.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (m) => {
                if (m.poster_url) await window.deleteImageFromR2(m.poster_url);
                if (m.background_url) await window.deleteImageFromR2(m.background_url);
            }));
        }

        // 3. Dọn dẹp dữ liệu rác notifications (JSONB không hỗ trợ Cascade)
        showNotification("Hoàn tất dọn R2. Đang xóa thông báo rác và bản ghi Database...", "info");
        
        // Supabase REST không cho phép delete all trực tiếp nếu thiếu where (bảo vệ an toàn). 
        // Nên dùng `.in('id', chunkIDs)` để tuân thủ rule API nhưng với chunk size nhỏ (30).
        for (let i = 0; i < movies.length; i += 30) {
            const chunkIds = movies.slice(i, i + 30).map(m => m.id);
            
            // Xóa rác trong bảng notifications
            try {
                for (const mId of chunkIds) {
                    await supabase.from('notifications').delete().contains('metadata', { movie_id: mId });
                }
            } catch (e) {
                console.warn("Lỗi dọn rác notifications chunk:", e);
            }

            // 4. Bắt đầu xóa bộ phim
            const { error: deleteErr } = await supabase.from('movies').delete().in('id', chunkIds);
            if (deleteErr) {
                console.error("Lỗi xóa db chunk phim:", deleteErr);
                throw deleteErr;
            }
        }
    }

    showNotification("Thành công! Đã xóa sạch toàn bộ phim và dọn dẹp Database.", "success");
    notifyDataChange("movies"); 

    if (typeof loadAdminMovies === 'function') await loadAdminMovies();
  } catch (error) {
    console.error("Lỗi xóa toàn bộ phim:", error);
    showNotification("Lỗi quá trình xóa: " + (error.message || "Lỗi không xác định"), "error");
  } finally {
    showLoading(false);
  }
}

/**
 * Lọc phim trong dropdown chọn phim (Quản lý Tập)
 */
/**
 * Lọc phim và hiển thị Grid chọn phim (Quản lý Tập)
 */
function filterEpisodeMovies() {
  const searchInput = document.getElementById("episodeMovieSearch");
  const sortSelect = document.getElementById("episodeMovieSort");
  const alphabetSelect = document.getElementById("episodeMovieAlphabet");
  const grid = document.getElementById("movieSelectionGrid");
  
  if (!searchInput || !grid) return;

  const searchText = removeDiacritics(searchInput.value.trim());
  const sortOrder = sortSelect ? sortSelect.value : "newest";
  const alphabetFilter = alphabetSelect ? alphabetSelect.value : "";
  
  // Lọc phim từ allAdminMovies (hỗ trợ tìm không dấu tiếng Việt)
  let filteredMovies = (allAdminMovies || []).filter(m => {
    const matchText = removeDiacritics(m.title).includes(searchText);
    
    let matchAlphabet = true;
    if (alphabetFilter) {
        const firstChar = m.title.trim().charAt(0).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (alphabetFilter === "A-D") matchAlphabet = "ABCD".includes(firstChar);
        else if (alphabetFilter === "E-H") matchAlphabet = "EFGH".includes(firstChar);
        else if (alphabetFilter === "I-L") matchAlphabet = "IJKL".includes(firstChar);
        else if (alphabetFilter === "M-P") matchAlphabet = "MNOP".includes(firstChar);
        else if (alphabetFilter === "Q-T") matchAlphabet = "QRST".includes(firstChar);
        else if (alphabetFilter === "U-Z") matchAlphabet = "UVWXYZ".includes(firstChar);
        else if (alphabetFilter === "others") matchAlphabet = !/^[A-Z]$/.test(firstChar);
    }

    return matchText && matchAlphabet;
  });

  // Sắp xếp
  filteredMovies.sort((a, b) => {
    const timeA = a.createdAt ? (a.createdAt.seconds || new Date(a.createdAt).getTime() / 1000 || 0) : 0;
    const timeB = b.createdAt ? (b.createdAt.seconds || new Date(b.createdAt).getTime() / 1000 || 0) : 0;
    
    if (sortOrder === "newest") return timeB - timeA;
    if (sortOrder === "oldest") return timeA - timeB;
    return 0;
  });

  // Render Grid
  renderMovieSelectionGrid(filteredMovies);
}

/**
 * Render Grid danh sách phim để chọn
 */
function renderMovieSelectionGrid(movies) {
    const grid = document.getElementById("movieSelectionGrid");
    if (!grid) return;

    // --- PHÂN TRANG cho grid chọn phim ---
    const totalItems = (movies || []).length;
    const perPage = adminPerPage;
    const totalPages = Math.ceil(totalItems / perPage);

    if (currentEpMovieSelectPage > totalPages && totalPages > 0) currentEpMovieSelectPage = totalPages;
    if (currentEpMovieSelectPage < 1) currentEpMovieSelectPage = 1;

    const startIndex = (currentEpMovieSelectPage - 1) * perPage;
    const paginatedMovies = (movies || []).slice(startIndex, startIndex + perPage);

    if (!movies || movies.length === 0) {
        grid.innerHTML = `
            <div class="text-center py-5 w-100" style="grid-column: 1/-1; opacity: 0.6;">
                <i class="fas fa-search fa-2x mb-2"></i>
                <p>Không tìm thấy phim nào khớp với bộ lọc.</p>
            </div>
        `;
        const paginationEl = document.getElementById("epMovieSelectPagination");
        if (paginationEl) paginationEl.innerHTML = "";
        return;
    }

    grid.innerHTML = paginatedMovies.map(m => {
        const currentEps = m._episodeCount || (m.episodes ? m.episodes.length : 0);
        const totalEps = parseInt(m.totalEpisodes || m.total_episodes) || 0;
        
        // Badge hiển thị tình trạng tập phim (dữ liệu thật từ DB)
        let statusHtml = "";

        if (currentEps === 0) {
            // Phim chưa có tập nào → cảnh báo đỏ
            statusHtml = `<span class="episode-badge episode-badge-warning" style="background: linear-gradient(135deg, #e74c3c, #c0392b); font-size: 0.75rem;">⚠ Chưa có tập</span>`;
        } else if (m.type === 'series') {
            if (totalEps > 0 && currentEps >= totalEps) {
                // Hoàn tất - xanh lá
                statusHtml = `<span class="episode-badge episode-badge-full">Hoàn Tất (${currentEps}/${totalEps})</span>`;
            } else if (totalEps > 0) {
                // Đang cập nhật - xanh dương
                statusHtml = `<span class="episode-badge">Tập ${currentEps}/${totalEps}</span>`;
            } else if (currentEps > 0) {
                // Chưa set tổng - xanh dương, chỉ hiện số tập hiện tại
                statusHtml = `<span class="episode-badge">Tập ${currentEps}</span>`;
            }
        } else {
            // Phim lẻ đã có tập → badge Full
            statusHtml = `<span class="episode-badge episode-badge-full" style="background: linear-gradient(135deg, #2ecc71, #27ae60);">Full</span>`;
        }

        // Badge Server - Dùng _serverNames đã preload
        let serverBadgeHtml = "";
        const SERVER_ORDER = { 'KKPhim': 1, 'OPhim': 2, 'NguonC': 3 };
        if (m._serverNames && m._serverNames.length > 0) {
            const SERVER_COLORS = { 1: '#3b82f6', 2: '#f59e0b', 3: '#a855f7' };
            // Sắp xếp: server đã biết trước, chưa biết sau
            const sorted = [...m._serverNames].sort((a, b) => (SERVER_ORDER[a] || 99) - (SERVER_ORDER[b] || 99));
            let nextNum = Math.max(...Object.values(SERVER_ORDER), 0) + 1;
            const badges = sorted.map(name => {
                    let num = SERVER_ORDER[name];
                    if (!num) { num = nextNum++; }
                    const color = SERVER_COLORS[num] || '#6b7280';
                    return `<span style="background: ${color}; color: #fff; font-size: 0.6rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">S${num}</span>`;
                }).join(' ');
            serverBadgeHtml = `<div style="position: absolute; bottom: 4px; left: 4px; display: flex; gap: 3px; flex-wrap: wrap;">${badges}</div>`;
        }

        // Badge "Chờ duyệt" cho phim đang pending (chỉ có trailer)
        let pendingBadgeHtml = '';
        if (m.status === 'pending') {
            pendingBadgeHtml = `<span style="position:absolute;top:4px;right:4px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:0.65rem;font-weight:700;padding:3px 8px;border-radius:5px;z-index:2;letter-spacing:0.3px;box-shadow:0 2px 6px rgba(245,158,11,0.4);"><i class="fas fa-clock" style="margin-right:3px;"></i>Chờ duyệt</span>`;
        }

        return `
            <div class="movie-selection-card" onclick="loadEpisodesForMovie('${m.id}')">
                <div class="poster-wrapper">
                    ${statusHtml}
                    ${pendingBadgeHtml}
                    ${serverBadgeHtml}
                    <img src="${m.posterUrl || m.poster_url || ''}" alt="${m.title}" loading="lazy" onerror="this.src='https://placehold.co/200x300?text=No+Poster'">
                </div>
                <div class="info">
                    <div class="title" title="${m.title}">${m.title}</div>
                    <div class="stats">
                        <i class="fas fa-calendar-alt"></i> ${m.year || 'N/A'} • 
                        <i class="fas fa-eye"></i> ${formatNumber(m.views || 0)}
                    </div>
                </div>
            </div>
        `;
    }).join("");

    // Render phân trang bên dưới grid
    renderAdminPagination("epMovieSelectPagination", totalItems, currentEpMovieSelectPage, perPage, "changeEpMovieSelectPage", "phim");
}

/**
 * Chuyển trang Grid chọn phim (tab Tập)
 */
window.changeEpMovieSelectPage = function(page) {
    currentEpMovieSelectPage = page;
    filterEpisodeMovies();
    // Cuộn lên đầu grid để dễ nhìn
    const section = document.getElementById("movieSelectionSection");
    if (section) section.scrollIntoView({ behavior: 'smooth' });
};

/**
 * Quay lại bảng chọn phim
 */
function goBackToMovieSelection() {
    selectedMovieForEpisodes = null;
    document.getElementById("movieSelectionSection").classList.remove("hidden");
    document.getElementById("episodesManagement").classList.add("hidden");
    
    // Refresh grid để đảm bảo data mới nhất
    filterEpisodeMovies();
}

/**
 * Load tập phim cho phim đã chọn
 */
async function loadEpisodesForMovie(movieIdFromGrid, resetPage = true) {
  const movieId = movieIdFromGrid || document.getElementById("selectMovieForEpisodes").value;
  const management = document.getElementById("episodesManagement");
  const selectionSection = document.getElementById("movieSelectionSection");
  const tbody = document.getElementById("adminEpisodesTable");

  if (!movieId || !supabase) {
    if (!movieId) {
        management?.classList.add("hidden");
        selectionSection?.classList.remove("hidden");
    }
    return;
  }

  if (resetPage) currentAdminEpisodePage = 1;
  selectedMovieForEpisodes = movieId;
  
  management.classList.remove("hidden");
  selectionSection.classList.add("hidden");

  try {
      // 1. Fetch Movie
      const { data: freshMovie, error: movieError } = await supabase
          .from('movies')
          .select('*')
          .eq('id', movieId)
          .single();

      if (movieError) throw movieError;
      if (!freshMovie) return;

      // 2. Fetch Episodes
      const { data: episodes, error: epError } = await supabase
          .from('episodes')
          .select('*')
          .eq('movie_id', movieId)
          .order('episode_index', { ascending: true });

      if (epError) throw epError;

      const fullMovieData = { ...freshMovie, episodes: episodes || [] };
      
      // Update global allMovies
      const mIdx = allMovies.findIndex(m => m.id === movieId);
      if (mIdx !== -1) {
          allMovies[mIdx] = fullMovieData;
      } else {
          allMovies.push(fullMovieData);
      }
      
      const titleEl = document.getElementById("currentMovieEpisodesTitle");
      if (titleEl) titleEl.innerHTML = `Danh sách tập:<br><span style="color: var(--accent-primary); font-weight: bold; font-size: 1.1em;">${freshMovie.title}</span>`;

      const totalEpisodesInput = document.getElementById("totalEpisodesInput");
      const totalEpisodesContainer = document.getElementById("totalEpisodesContainer");
      const badge = document.getElementById("episodeStatusBadge");
      
      if (totalEpisodesContainer) {
          totalEpisodesContainer.style.display = freshMovie.type === 'single' ? 'none' : 'flex';
      }
      if (badge) {
          badge.style.display = freshMovie.type === 'single' ? 'none' : 'inline-block';
      }

      if (totalEpisodesInput) {
          totalEpisodesInput.value = freshMovie.total_episodes || "";
      }
      updateEpisodeStatusBadge(fullMovieData.episodes.length, freshMovie.total_episodes);

      // --- LOGIC PHÂN TRANG ---
      const totalItems = fullMovieData.episodes.length;
      const perPage = adminPerPage; 
      const totalPages = Math.ceil(totalItems / perPage);
      
      if (currentAdminEpisodePage > totalPages && totalPages > 0) currentAdminEpisodePage = totalPages;
      if (currentAdminEpisodePage < 1) currentAdminEpisodePage = 1;

      const startIndex = (currentAdminEpisodePage - 1) * perPage;
      const paginatedEpisodes = fullMovieData.episodes.slice(startIndex, startIndex + perPage);

      if (totalItems === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Chưa có tập nào</td></tr>';
        const paginationContainer = document.getElementById("adminEpisodePagination");
        if (paginationContainer) paginationContainer.innerHTML = "";
        return;
      }

      const isSingle = freshMovie.type === 'single';
      
      tbody.innerHTML = paginatedEpisodes
        .map(
          (ep, locIdx) => {
            const globalIdx = startIndex + locIdx;
            return `
              <tr data-index="${globalIdx}">
                  <td>
                      <input type="checkbox" class="episode-checkbox" data-index="${globalIdx}" onclick="updateEpisodeSelection()">
                  </td>
                  <td class="drag-handle-cell">
                      ${!isSingle ? '<i class="fas fa-grip-lines drag-handle"></i>' : ""}
                  </td>
                  <td>
                      <input type="text" class="quick-edit-input ${isSingle ? 'is-single' : ''}" 
                        value="${ep.title || ep.episode_number || ep.episode_name || ep.episodeNumber || ""}" 
                        onblur="saveQuickEditEpisodeNumber(${globalIdx}, this.value)"
                        title="Sửa nhanh tên tập">
                  </td>
                  <td>${ep.sources ? ep.sources.length + " sources" : "N/A"}</td>
                  <td>${ep.duration || "N/A"}</td>
                  <td>${ep.quality || "HD"}</td>
                  <td style="font-size: 0.78rem; color: var(--text-muted); white-space: nowrap;">
                      ${ep.is_new ? '<span style="background:linear-gradient(135deg,#00d2ff,#0099cc);color:#fff;font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:4px;letter-spacing:0.5px;">MỚI</span>' : ''}
                      ${ep.created_at ? (() => { const d = new Date(ep.created_at); return d.toLocaleDateString('vi-VN') + '<br><span style="font-size:0.7rem;opacity:0.7;">' + d.toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit',second:'2-digit'}) + '</span>'; })() : '<span style="opacity:0.4;">—</span>'}
                  </td>
                  <td>
                      <button class="btn btn-sm btn-secondary" onclick="editEpisode(${globalIdx})" title="Sửa">
                          <i class="fas fa-edit"></i>
                      </button>
                      <button class="btn btn-sm btn-danger" onclick="deleteEpisode(${globalIdx})" title="Xóa">
                          <i class="fas fa-trash"></i>
                      </button>
                  </td>
              </tr>
          `;
          }
        )
        .join("");

      renderAdminPagination("adminEpisodePagination", totalItems, currentAdminEpisodePage, perPage, "changeAdminEpisodePage", "tập");

      if (!isSingle) {
          initEpisodesSortable();
      }
      
      clearEpisodeSelection();
  } catch (error) {
      console.error("Error loading episodes Supabase:", error);
      showNotification("Lỗi tải danh sách tập phim", "error");
  }
}

/**
 * Chuyển trang Tập phim
 */
window.changeAdminEpisodePage = function(page) {
    currentAdminEpisodePage = page;
    loadEpisodesForMovie(selectedMovieForEpisodes, false);
};

/**
 * Lưu tổng số tập vào Supabase
 */
async function saveTotalEpisodes() {
  const movieId = selectedMovieForEpisodes || document.getElementById("selectMovieForEpisodes").value;
  if (!movieId || !supabase) return;
  
  const input = document.getElementById("totalEpisodesInput");
  const totalEpisodes = parseInt(input.value) || 0;
  
  try {
    const { error } = await supabase.from('movies').update({
      total_episodes: totalEpisodes,
      updated_at: new Date().toISOString()
    }).eq('id', movieId);

    if (error) throw error;
    
    // Cập nhật global allMovies
    const movie = allMovies.find(m => m.id === movieId);
    if (movie) {
      movie.total_episodes = totalEpisodes;
      const currentEps = (movie.episodes || []).length;
      updateEpisodeStatusBadge(currentEps, totalEpisodes);
    }
    
    showNotification(`Đã lưu tổng số tập: ${totalEpisodes}`, "success");
    notifyDataChange("movies");
  } catch (error) {
    console.error("Lỗi lưu tổng số tập Supabase:", error);
    showNotification("Không thể lưu tổng số tập!", "error");
  }
}

/**
 * Cập nhật badge trạng thái tập hiện tại trong admin
 */
function updateEpisodeStatusBadge(currentCount, totalEpisodes) {
  const badge = document.getElementById("episodeStatusBadge");
  if (!badge) return;
  
  if (!totalEpisodes || totalEpisodes <= 0) {
    badge.textContent = `Đã có ${currentCount} tập (chưa set tổng)`;
    badge.style.color = "#aaa";
    badge.style.background = "rgba(255,255,255,0.05)";
  } else if (currentCount >= totalEpisodes) {
    badge.textContent = `✅ Hoàn Tất (${currentCount}/${totalEpisodes})`;
    badge.style.color = "#51cf66";
    badge.style.background = "rgba(81, 207, 102, 0.12)";
  } else {
    badge.textContent = `⏳ ${currentCount}/${totalEpisodes} tập`;
    badge.style.color = "#ffc107";
    badge.style.background = "rgba(255, 193, 7, 0.12)";
  }
}
/**
 * Xử lý hiển thị gợi ý khi chọn loại video
 */
/**
 * [NEW] Mở modal Import Nhiều Tập (API)
 */
function openImportEpisodesModal() {
  const movieId = selectedMovieForEpisodes || document.getElementById("selectMovieForEpisodes").value;
  if (!movieId) {
    showNotification("Vui lòng chọn phim trước khi thao tác!", "error");
    return;
  }
  
  document.getElementById("apiBatchEpisodesUrl").value = "";
  clearImportBatchTable();
  openModal("importEpisodesModal");
}

/**
 * [NEW] Lấy danh sách Tập từ API (Ví dụ: OPhim) hiển thị vào Bảng Preview
 */
async function fetchBatchEpisodesFromAPI() {
    const url = document.getElementById("apiBatchEpisodesUrl").value.trim();
    if (!url) {
        showNotification("Vui lòng nhập Link API!", "error");
        return;
    }

    const tbody = document.getElementById("previewImportTable");
    const statusText = document.getElementById("importBatchStatus");
    const clrBtn = document.getElementById("btnClearBatchTable");

    try {
        statusText.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu...`;
        statusText.style.color = "var(--warning-color)";
        
        let response = await fetch(url);
        if (!response.ok) throw new Error("Lỗi mạng: " + response.status);

        const resData = await response.json();
        
        let episodesData = null;
        let movieData = null;
        
        // Hỗ trợ cả 2 chuẩn API: KKPhim (resData.data.item) và OPhim/PhimAPI (resData.movie)
        if (resData.movie) {
            movieData = resData.movie;
            episodesData = resData.episodes; // OPhim/PhimAPI
        } else if (resData.data && resData.data.item) {
            movieData = resData.data.item;
            episodesData = movieData.episodes || (resData.data && resData.data.episodes);
        }

        if (!movieData) {
             throw new Error("Dữ liệu không đúng cấu trúc Phim của OPhim/KKPhim.");
        }

        if (!episodesData || episodesData.length === 0) {
            throw new Error("Phim này chưa có tập nào được cập nhật trên API!");
        }

        const serverData = episodesData[0].server_data;
        if (!serverData || serverData.length === 0) {
            throw new Error("Không tìm thấy server_data (Link Video) hợp lệ!");
        }

        // Render lên bảng
        tbody.innerHTML = ""; 
        serverData.forEach((ep) => {
            let m3u8Clean = typeof ep.link_m3u8 === 'string' && ep.link_m3u8.includes("http") && !ep.link_m3u8.startsWith("http")
                ? ep.link_m3u8.substring(ep.link_m3u8.indexOf("http")).trim()
                : (ep.link_m3u8 || '');
                
            let embedClean = typeof ep.link_embed === 'string' && ep.link_embed.includes("http") && !ep.link_embed.startsWith("http")
                ? ep.link_embed.substring(ep.link_embed.indexOf("http")).trim()
                : (ep.link_embed || '');

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                   <input type="text" class="form-input batch-ep-name" value="${ep.name || 'Tập ' + (serverData.indexOf(ep) + 1)}" placeholder="Tập..." />
                </td>
                <td>
                   <select class="form-select batch-ep-hls-label" style="margin-bottom: 5px; font-size: 0.9em; padding: 4px;">
                       <option value="Bản gốc" selected style="color: #2ecc71;">🟢 Bản gốc</option>
                       <option value="Vietsub" style="color: #3498db;">🔵 Vietsub</option>
                       <option value="Thuyết minh" style="color: #e67e22;">🟠 Thuyết minh</option>
                       <option value="Lồng tiếng" style="color: #9b59b6;">🟣 Lồng tiếng</option>
                       <option value="Dự phòng" style="color: #e74c3c;">🔴 Dự phòng</option>
                   </select>
                   <input type="text" class="form-input batch-ep-hls" value="${m3u8Clean}" placeholder="Link .m3u8..." />
                </td>
                <td>
                   <select class="form-select batch-ep-embed-label" style="margin-bottom: 5px; font-size: 0.9em; padding: 4px;">
                       <option value="Bản gốc" style="color: #2ecc71;">🟢 Bản gốc</option>
                       <option value="Vietsub" style="color: #3498db;">🔵 Vietsub</option>
                       <option value="Thuyết minh" style="color: #e67e22;">🟠 Thuyết minh</option>
                       <option value="Lồng tiếng" style="color: #9b59b6;">🟣 Lồng tiếng</option>
                       <option value="Dự phòng" selected style="color: #e74c3c;">🔴 Dự phòng</option>
                   </select>
                   <input type="text" class="form-input batch-ep-embed" value="${embedClean}" placeholder="Link Iframe (Tùy chọn)" />
                </td>
                <td style="text-align: center;">
                    <button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        statusText.innerHTML = `<i class="fas fa-check-circle"></i> Đã tải thành công <b>${serverData.length}</b> tập.`;
        statusText.style.color = "var(--success-color)";
        clrBtn.style.display = "inline-block";

    } catch (err) {
        console.error("Batch Import Fetch Error:", err);
        statusText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi: ${err.message}`;
        statusText.style.color = "var(--danger-color)";
    }
}

/**
 * [NEW] Đổi nhãn hàng loạt cho cả cột
 */
function changeAllLabels(type, value) {
    if (!value) return; // Nếu chọn dòng "-- Đổi Nhãn --" thì không làm gì
    
    // Xác định class name của các select dựa vào loại cột (hls hay embed)
    const selectClass = type === 'hls' ? '.batch-ep-hls-label' : '.batch-ep-embed-label';
    
    // Lấy tất cả các thẻ select thuộc cột đó
    const selectElements = document.querySelectorAll(`#previewImportTable ${selectClass}`);
    
    if (selectElements.length === 0) return;
    
    // Duyệt qua và gán giá trị mới
    selectElements.forEach(select => {
        select.value = value;
    });
    
    // Báo nhẹ cho người dùng biết
    showNotification(`Đã đổi đồng loạt ${selectElements.length} tập thành nhãn: ${value}`, "success");
}

/**
 * [NEW] Xóa sạch bảng Preview
 */
function clearImportBatchTable() {
    document.getElementById("previewImportTable").innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 30px;">Dán Link API và bấm "Lấy Danh Sách" để xem trước các tập.</td></tr>`;
    
    // Đặt lại luôn 2 cái Header Select All về trạng thái mặc định
    const selectHeaders = document.querySelectorAll("#importEpisodesModal th select");
    selectHeaders.forEach(select => select.value = "");
    const statusText = document.getElementById("importBatchStatus");
    statusText.innerText = "Chưa có dữ liệu...";
    statusText.style.color = "var(--text-secondary)";
    document.getElementById("btnClearBatchTable").style.display = "none";
}

/**
 * [NEW] Lưu danh sách các tập từ Bảng Preview Lên Hệ Thống Database
 */
async function saveBatchImportedEpisodes() {
    const movieId = selectedMovieForEpisodes || document.getElementById("selectMovieForEpisodes").value;
    if (!movieId || !supabase) {
        showNotification("Lỗi: Không xác định được Phim hoặc Supabase chưa sẵn sàng!", "error");
        return;
    }

    const rows = document.querySelectorAll("#previewImportTable tr");
    if (rows.length === 0 || rows[0].querySelector("td[colspan]")) {
        showNotification("Bảng tập phim trống! Vui lòng Lấy dữ liệu trước.", "error");
        return;
    }

    const movie = allMovies.find(m => m.id === movieId);
    if (!movie) return;

    let existingCount = (movie.episodes || []).length;
    let episodesToInsert = [];

    // Duyệt qua từng hàng trong bảng
    rows.forEach((row, idx) => {
        const nameInput = row.querySelector(".batch-ep-name");
        const hlsInput = row.querySelector(".batch-ep-hls");
        const hlsLabelInput = row.querySelector(".batch-ep-hls-label");
        const embedInput = row.querySelector(".batch-ep-embed");
        const embedLabelInput = row.querySelector(".batch-ep-embed-label");

        if (!nameInput || !hlsInput) return; 
        
        let labelName = nameInput.value.trim();
        let m3u8Link = hlsInput.value.trim();
        let m3u8Label = hlsLabelInput ? hlsLabelInput.value : "Bản gốc";
        let embedLink = embedInput ? embedInput.value.trim() : "";
        let embedLabel = embedLabelInput ? embedLabelInput.value : "Dự phòng";

        if (!m3u8Link) return; 

        const sources = [];
        sources.push({
            label: m3u8Label,
            type: "hls", 
            source: m3u8Link
        });
        
        if (embedLink) {
              sources.push({
                label: embedLabel,
                type: "embed", 
                source: embedLink 
            });
        }

        episodesToInsert.push({
             movie_id: movieId,
             title: labelName, // Đổi từ episode_name -> title theo schema thực tế
             episode_index: existingCount + idx, // Cột integer
             episode_number: labelName.replace(/\D/g, '') || (existingCount + idx).toString(), 
             duration: "0 giờ 45 phút", 
             quality: "1080p",
             sources: sources,
             updated_at: new Date().toISOString()
        });
    });

    if (episodesToInsert.length === 0) {
        showNotification("Không có dòng dữ liệu hợp lệ nào để lưu!", "error");
        return;
    }

    try {
        showLoading(true, `Đang xử lý thêm ${episodesToInsert.length} tập phim...`);
        
        const { error } = await supabase.from('episodes').insert(episodesToInsert);
        if (error) throw error;

        showNotification("Import thành công " + episodesToInsert.length + " tập!", "success");
        closeModal("importEpisodesModal");
        
        if (typeof sendTelegramNotify === 'function') {
            try {
                const { data: mData } = await supabase.from('movies').select('title, total_episodes, versions, type, status').eq('id', movieId).single();
                const { count: currentEpCount } = await supabase.from('episodes').select('id', { count: 'exact', head: true }).eq('movie_id', movieId);
                
                const srcSet = new Set();
                episodesToInsert.forEach(ep => {
                    (ep.sources || []).forEach(s => {
                        if (s.server) srcSet.add(s.server);
                        else if ((s.source || '').includes('ophim')) srcSet.add('OPhim');
                        else if ((s.source || '').includes('nguonc')) srcSet.add('NguonC');
                        else srcSet.add('KKPhim');
                    });
                });
                const sourcesStr = srcSet.size > 0 ? Array.from(srcSet).join(', ') : 'API Khác';
                const versionsStr = mData?.versions?.length ? mData.versions.join(', ') : 'Vietsub';
                const isTrailer = mData?.status === 'pending';
                const typeName = mData?.type === 'series' ? 'Phim bộ' : 'Phim lẻ';
                const typeStr = isTrailer ? `[Trailer] ${typeName}` : typeName;
                
                const msg = `🎬 <b>Trạm Phim Bot</b>\n\n👤 Admin vừa thêm thủ công danh sách tập phim:\n\n`
                    + `📌 <b>Phim:</b> ${mData?.title || 'Không rõ'}\n`
                    + `🏷 <b>Loại:</b> ${typeStr}\n`
                    + `📺 <b>Tập:</b> Cập nhật +${episodesToInsert.length} tập (Hiện tại: ${currentEpCount} / ${mData?.total_episodes || '?'})\n`
                    + `💽 <b>Bản chiếu:</b> ${versionsStr}\n`
                    + `🌐 <b>Nguồn:</b> ${sourcesStr}`;
                
                sendTelegramNotify(msg);

                // ★ THÔNG BÁO CHUÔNG CHO TẬP MỚI
                if (episodesToInsert.length > 0 && typeof sendNotificationToAllUsers === 'function') {
                    const epNums = episodesToInsert.map(ep => parseFloat(ep.episode_number)).filter(n => !isNaN(n)).sort((a, b) => a - b);
                    let epString = `thêm ${episodesToInsert.length} tập mới`;
                    if (epNums.length === 1) {
                        epString = `Tập ${epNums[0]}`;
                    } else if (epNums.length > 1) {
                        epString = `từ Tập ${epNums[0]} đến Tập ${epNums[epNums.length - 1]}`;
                    }

                    const notifTitle = `📺 Tập mới [${typeName}]: ${mData?.title || 'Phim'}`;
                    const notifMsg = `Trạm Phim vừa cập nhật ${epString} cho "${mData?.title || 'Phim'}". Vào xem ngay!`;
                    sendNotificationToAllUsers(notifTitle, notifMsg, 'new_episode', { movie_id: movieId });
                }
            } catch(e) {
                sendTelegramNotify(`🎬 <b>Trạm Phim Bot</b>\n\n👤 Admin vừa thêm thủ công <b>${episodesToInsert.length} tập phim</b> mới qua API Import!`);
            }
        }

        if (typeof loadMovies === 'function') await loadMovies();
        await loadAdminMovies();
        loadEpisodesForMovie(movieId);
        notifyDataChange("movies"); 
    } catch (err) {
        console.error("Lỗi import episodes Supabase:", err);
        showNotification("Không thể lưu các tập phim!", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Lưu loại nhãn hiện tại: "dubbed" (Lồng tiếng) hoặc "voiceover" (Thuyết minh)
 */
let _bulkDubbedLabelMode = "dubbed";

/**
 * [NEW] Mở modal Bổ sung Link hàng loạt (Lồng tiếng hoặc Thuyết minh)
 * @param {string} mode - "dubbed" (Lồng tiếng) | "voiceover" (Thuyết minh)
 */
function openBulkAddDubbedModal(mode = "dubbed") {
    const movieId = selectedMovieForEpisodes || document.getElementById("selectMovieForEpisodes").value;
    if (!movieId) {
        showNotification("Vui lòng chọn phim trước khi thao tác!", "error");
        return;
    }
    
    _bulkDubbedLabelMode = mode;
    
    // Cập nhật tiêu đề modal theo mode
    const modalTitle = document.querySelector("#bulkAddDubbedModal .modal-title");
    const icon = mode === "voiceover" ? "fa-headset" : "fa-microphone-alt";
    const title = mode === "voiceover" ? "Bổ sung Link Thuyết minh Hàng loạt" : "Bổ sung Link Lồng tiếng Hàng loạt";
    if (modalTitle) modalTitle.innerHTML = `<i class="fas ${icon}"></i> ${title}`;
    
    // Cập nhật hướng dẫn trong modal
    const labelText = mode === "voiceover" ? "Thuyết minh" : "Lồng tiếng";
    const instrNote = document.querySelector("#bulkAddDubbedModal .alert-info p:last-child");
    if (instrNote) instrNote.innerHTML = `* Hệ thống sẽ tự động tìm Tập tương ứng và thêm/cập nhật nguồn "${labelText}".`;
    
    // Cập nhật label textarea
    const textareaLabel = document.querySelector("#bulkAddDubbedModal .form-label[for], #bulkAddDubbedModal label.form-label");
    const allLabels = document.querySelectorAll("#bulkAddDubbedModal .form-group .form-label");
    allLabels.forEach(l => {
        if (l.textContent.includes("Link")) {
            l.textContent = `Danh sách Link ${labelText}:`;
        }
    });
    
    // Cập nhật nút xử lý
    const processBtn = document.querySelector("#bulkAddDubbedModal .modal-footer .btn:not(.btn-secondary)");
    if (processBtn) processBtn.innerHTML = `<i class="fas fa-magic"></i> Xử lý & Cập nhật`;
    
    document.getElementById("bulkDubbedInput").value = "";
    document.getElementById("bulkDubbedStatus").innerText = "";
    // Reset preview
    const previewContainer = document.getElementById("dubbedPreviewContainer");
    if (previewContainer) previewContainer.style.display = "none";
    openModal("bulkAddDubbedModal");
}

/**
 * Preview trực quan phân loại link khi dán vào textarea
 * Tự động nhận diện embed vs m3u8 và hiển thị badge màu
 */
function previewDubbedLinks() {
    const input = document.getElementById("bulkDubbedInput")?.value.trim();
    const container = document.getElementById("dubbedPreviewContainer");
    const list = document.getElementById("dubbedPreviewList");
    const countEl = document.getElementById("dubbedPreviewCount");

    if (!input || !container || !list) {
        if (container) container.style.display = "none";
        return;
    }

    const lines = input.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
        container.style.display = "none";
        return;
    }

    let embedCount = 0, hlsCount = 0;
    let html = '';

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parts = trimmed.split('|');
        if (parts.length < 2) {
            // Dòng không hợp lệ
            html += `<div style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(231,76,60,0.1); border-radius: 6px; border-left: 3px solid #e74c3c;">
                <span style="background: #e74c3c; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">⚠ LỖI</span>
                <span style="font-size: 0.8rem; color: #e74c3c; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${trimmed.substring(0, 80)}...</span>
            </div>`;
            continue;
        }

        const epText = parts[0].trim();
        const url = parts.slice(1).join('|').trim(); // Ghép lại URL nếu chứa ký tự |
        const isEmbed = url.includes('/player/') || url.includes('/embed/') || url.includes('player.') || url.includes('?url=');

        if (isEmbed) embedCount++;
        else hlsCount++;

        const typeLabel = isEmbed ? 'EMBED' : 'M3U8';
        const typeColor = isEmbed ? '#e67e22' : '#2ecc71';
        const typeIcon = isEmbed ? 'fas fa-code' : 'fas fa-play-circle';
        const shortUrl = url.length > 60 ? url.substring(0, 57) + '...' : url;

        html += `<div style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(255,255,255,0.03); border-radius: 6px; border-left: 3px solid ${typeColor};">
            <span style="background: rgba(155,89,182,0.2); color: #9b59b6; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; white-space: nowrap;">${epText}</span>
            <span style="background: ${typeColor}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; white-space: nowrap;"><i class="${typeIcon}" style="margin-right: 4px;"></i>${typeLabel}</span>
            <span style="font-size: 0.78rem; color: var(--text-muted); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${url}">${shortUrl}</span>
        </div>`;
    }

    list.innerHTML = html;
    countEl.textContent = `${lines.length} link (${hlsCount} M3U8, ${embedCount} Embed)`;
    container.style.display = "block";
}

/**
 * [NEW] Xử lý danh sách link lồng tiếng được dán vào và cập nhật vào Firebase
 */
async function processBulkDubbedLinks() {
    const movieId = selectedMovieForEpisodes || document.getElementById("selectMovieForEpisodes").value;
    const input = document.getElementById("bulkDubbedInput")?.value.trim();
    const statusEl = document.getElementById("bulkDubbedStatus");

    if (!input) {
        showNotification("Vui lòng nhập danh sách link!", "error");
        return;
    }

    const movie = allMovies.find(m => m.id === movieId);
    if (!movie) {
        showNotification("Không tìm thấy thông tin phim!", "error");
        return;
    }

    let episodes = [...(movie.episodes || [])];
    if (episodes.length === 0) {
        showNotification("Phim này chưa có tập nào để bổ sung!", "error");
        return;
    }

    const lines = input.split('\n');
    let updatedCount = 0;
    let notFoundCount = 0;
    const notFoundEps = [];
    const updatePromises = [];
    const episodeUpdates = new Map(); // Gom sources theo episodeId, tránh race condition

    showLoading(true, "Đang xử lý dữ liệu...");

    try {
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // Định dạng: "Tập 01|URL" hoặc "1|URL"
            const parts = line.split('|');
            if (parts.length < 2) continue;

            let epText = parts[0].trim();
            const dubbedLink = parts[1].trim();

            // Chuẩn hóa epText: Lấy số tập hoặc tên đặc biệt (Full, HD, ...)
            const epNumMatch = epText.match(/\d+/);
            const searchNum = epNumMatch ? parseInt(epNumMatch[0]) : null;
            const epTextLower = epText.toLowerCase().trim();

            // Tìm tập tương ứng trong database
            let targetEpisode = episodes.find(e => {
                const dbEpNumStr = String(e.episode_number || e.episodeNumber || e.name || "");
                const dbEpLower = dbEpNumStr.toLowerCase().trim();
                const dbSlug = String(e.slug || "").toLowerCase().trim();

                // 1. Match theo số tập (Tập 01 → 1)
                if (searchNum !== null) {
                    const dbNumMatch = dbEpNumStr.match(/\d+/);
                    if (dbNumMatch && parseInt(dbNumMatch[0]) === searchNum) return true;
                }

                // 2. Match theo tên text chính xác (Full, HD, ...)
                if (dbEpLower === epTextLower) return true;

                // 3. Match text chứa từ khóa (Full, Vietsub, ...)
                if (epTextLower.includes("full") && (dbEpLower.includes("full") || dbSlug.includes("full"))) return true;

                return false;
            });

            // 4. Fallback: nếu input là "Full" hoặc text không số → gán vào tập đầu tiên chưa được xử lý
            if (!targetEpisode && searchNum === null) {
                // Nếu phim chỉ có 1 tập → gán luôn
                if (episodes.length === 1) {
                    targetEpisode = episodes[0];
                } else {
                    // Phim nhiều tập: gán theo thứ tự dòng input có cùng tên
                    const sameNameLines = lines.filter(l => {
                        const p = l.trim().split('|');
                        return p.length >= 2 && p[0].trim().toLowerCase() === epTextLower;
                    });
                    const lineIndex = sameNameLines.indexOf(line);
                    if (lineIndex >= 0 && lineIndex < episodes.length) {
                        targetEpisode = episodes[lineIndex];
                    }
                }
            }

            if (targetEpisode) {
                // Gom sources theo episode ID (tránh race condition khi 2 dòng cùng match 1 tập)
                if (!episodeUpdates.has(targetEpisode.id)) {
                    episodeUpdates.set(targetEpisode.id, {
                        episode: targetEpisode,
                        sources: [...(targetEpisode.sources || [])]
                    });
                }
                const epUpdate = episodeUpdates.get(targetEpisode.id);
                
                // Nhận diện loại link: embed hay m3u8
                const isEmbed = dubbedLink.includes('/player/') || dubbedLink.includes('/embed/') || dubbedLink.includes('player.') || dubbedLink.includes('?url=');
                // Xác định nhãn dựa theo mode hiện tại
                const baseLabel = _bulkDubbedLabelMode === "voiceover" ? "Thuyết minh" : "Lồng tiếng";
                const label = isEmbed ? `${baseLabel} dự phòng` : baseLabel;
                const sourceType = isEmbed ? "embed" : "hls";
                
                // Xóa nhãn cũ format (Embed) nếu tồn tại (migration sang nhãn mới)
                const oldLabel = `${baseLabel} (Embed)`;
                epUpdate.sources = epUpdate.sources.filter(s => s.label !== oldLabel && s.label !== "Lồng tiếng (Embed)");

                // Kiểm tra xem đã có label này chưa
                const existingIdx = epUpdate.sources.findIndex(s => s.label === label);
                if (existingIdx !== -1) {
                    epUpdate.sources[existingIdx].source = dubbedLink;
                } else {
                    epUpdate.sources.push({ type: sourceType, source: dubbedLink, label: label });
                }
                
                updatedCount++;
            } else {
                notFoundCount++;
                notFoundEps.push(epText);
            }
        }

        // Gửi 1 update duy nhất cho mỗi tập (đã gom đủ sources)
        for (const [epId, { episode, sources }] of episodeUpdates) {
            updatePromises.push(
                supabase
                    .from('episodes')
                    .update({ sources: sources, updated_at: new Date().toISOString() })
                    .eq('id', epId)
            );
            episode.sources = sources; // Cập nhật local
        }

        if (updatedCount > 0) {
            const results = await Promise.all(updatePromises);
            const errors = results.filter(r => r.error);
            if (errors.length > 0) throw errors[0].error;

            const modeLabel = _bulkDubbedLabelMode === "voiceover" ? "Thuyết minh" : "Lồng tiếng";
            showNotification(`Đã cập nhật nguồn ${modeLabel} cho ${updatedCount} tập!`, "success");
            loadEpisodesForMovie(movieId);
            
            if (notFoundCount === 0) {
                closeModal("bulkAddDubbedModal");
            } else {
                statusEl.innerHTML = `<span style="color: #e67e22;">⚠️ Cập nhật ${updatedCount} tập. Không tìm thấy ${notFoundCount} tập: ${notFoundEps.join(", ")}</span>`;
            }
            notifyDataChange("movies");
        } else {
            showNotification("Không tìm thấy tập nào khớp để cập nhật!", "warning");
            statusEl.innerHTML = '<span style="color: #e74c3c;">❌ Không tìm thấy tập nào khớp!</span>';
        }
    } catch (error) {
        console.error("Lỗi cập nhật lồng tiếng Supabase:", error);
        showNotification("Có lỗi xảy ra khi cập nhật!", "error");
        statusEl.innerHTML = '❌ Lỗi hệ thống.';
    } finally {
        showLoading(false);
    }
}

/**
 * Thêm một dòng nhập source video
 */
function addSourceInput(type = "hls", source = "", label = "", server = "KKPhim") {
  const container = document.getElementById("sourceListContainer");
  const id = new Date().getTime() + Math.random().toString(36).substr(2, 9);
  
  // Tự động cập nhật preview buttons khi có thay đổi về số lượng source
  setTimeout(() => updateAdminIntroPreview(), 100);

  // Khởi tạo các nhãn mặc định
  const standardLabels = [
      { value: "Bản gốc", emoji: "🟢", color: "#2ecc71" },
      { value: "Vietsub", emoji: "🔵", color: "#3498db" },
      { value: "Thuyết minh", emoji: "🟠", color: "#e67e22" },
      { value: "Lồng tiếng", emoji: "🟣", color: "#9b59b6" },
      { value: "Dự phòng", emoji: "🔴", color: "#e74c3c" },
      { value: "Lồng tiếng dự phòng", emoji: "🩷", color: "#e91e8c" }
  ];
  let defaultLabel = label || "Bản gốc";
  
  let labelOptions = standardLabels.map(l => `<option value="${l.value}" ${defaultLabel === l.value ? 'selected' : ''} style="color: ${l.color};">${l.emoji} ${l.value}</option>`).join('');
  
  // Tránh mất Data cũ nếu Phim đang có Nhãn nào khác chuỗi Standard Mặc Định
  if (defaultLabel && !standardLabels.some(l => l.value === defaultLabel)) {
      labelOptions += `<option value="${defaultLabel}" selected>⚪ ${defaultLabel}</option>`;
  }

  // Xác định emoji/màu cho label hiện tại
  const currentLabelObj = standardLabels.find(l => l.value === defaultLabel);
  const dotColor = currentLabelObj ? currentLabelObj.color : '#aaa';

  const html = `
    <div class="source-item" id="source-${id}" style="display: grid; grid-template-columns: 100px 140px 90px 1fr auto; gap: 8px; align-items: center; background: rgba(255,255,255,0.06); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color, #444);">
        <div>
            <select class="form-select source-server" style="font-weight: bold;">
                <option value="KKPhim" ${server === 'KKPhim' ? 'selected' : ''} style="color: #3b82f6;">S1 (KKPhim)</option>
                <option value="OPhim" ${server === 'OPhim' ? 'selected' : ''} style="color: #f59e0b;">S2 (OPhim)</option>
                <option value="NguonC" ${server === 'NguonC' ? 'selected' : ''} style="color: #10b981;">S3 (NguonC)</option>
            </select>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
            <span class="source-dot" style="width: 10px; height: 10px; border-radius: 50%; background: ${dotColor}; display: inline-block; flex-shrink: 0;"></span>
            <select class="form-select source-label" style="flex: 1;">
                ${labelOptions}
            </select>
        </div>
        <div>
            <select class="form-select source-type" onchange="updateSourcePlaceholder('${id}')">
                <option value="youtube" ${type === "youtube" ? "selected" : ""}>YouTube</option>
                <option value="hls" ${type === "hls" ? "selected" : ""}>HLS</option>
                <option value="mp4" ${type === "mp4" ? "selected" : ""}>MP4</option>
                <option value="embed" ${type === "embed" ? "selected" : ""}>Embed</option>
            </select>
        </div>
        <div>
            <input type="text" class="form-input source-url" placeholder="Nhập ID hoặc URL" value="${source}" required
                oninput="autoDetectSourceType('${id}')"
                onpaste="setTimeout(() => autoDetectSourceType('${id}'), 50)">
        </div>
        <button type="button" class="btn btn-danger btn-sm" onclick="removeSourceInput('${id}')" style="border-radius: 50%; width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-trash"></i>
        </button>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", html);
  updateSourcePlaceholder(id);
}

function removeSourceInput(id) {
  document.getElementById(`source-${id}`)?.remove();
  // Cập nhật lại danh sách nút preview
  updateAdminIntroPreview();
}

function updateSourcePlaceholder(id) {
  const item = document.getElementById(`source-${id}`);
  if (!item) return;
  const type = item.querySelector(".source-type").value;
  const input = item.querySelector(".source-url");
  
  if (type === "youtube") input.placeholder = "ID YouTube (VD: dQw4...)";
  else if (type === "hls") input.placeholder = "Link .m3u8";
  else if (type === "embed") input.placeholder = "Link embed (iframe URL)";
  else input.placeholder = "Link .mp4";
}

/**
 * Tự động nhận diện loại link khi admin nhập/paste URL
 * Hỗ trợ: YouTube, HLS (.m3u8), MP4, Embed (iframe/player URL)
 */
function autoDetectSourceType(id) {
  const item = document.getElementById(`source-${id}`);
  if (!item) return;
  const input = item.querySelector(".source-url");
  const typeSelect = item.querySelector(".source-type");
  if (!input || !typeSelect) return;
  
  const url = input.value.trim().toLowerCase();
  if (!url) return;
  
  let detected = null;
  
  // 1. YouTube: chứa youtube.com, youtu.be, hoặc chỉ là ID ngắn (11 kí tự)
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    detected = "youtube";
  }
  // 2. HLS: chứa .m3u8
  else if (url.includes(".m3u8")) {
    detected = "hls";
  }
  // 3. MP4: chứa .mp4
  else if (url.includes(".mp4")) {
    detected = "mp4";
  }
  // 4. Embed: link có iframe, player, share, hoặc các trang embed video thông dụng
  else if (
    url.includes("<iframe") ||
    url.includes("/player") ||
    url.includes("/share/") ||
    url.includes("/embed/") ||
    url.includes("player.phimapi.com") ||
    url.includes("ok.ru") ||
    url.includes("drive.google.com") ||
    url.includes("dailymotion.com") ||
    url.includes("vimeo.com") ||
    (url.startsWith("http") && !url.includes(".m3u8") && !url.includes(".mp4") && !url.includes("youtube"))
  ) {
    detected = "embed";
  }
  
  // Chỉ thay đổi nếu phát hiện được và khác giá trị hiện tại
  if (detected && typeSelect.value !== detected) {
    typeSelect.value = detected;
    updateSourcePlaceholder(id);
  }
}

/**
 * Mở modal thêm/sửa tập (Hỗ trợ Multi-Source)
 */
function openEpisodeModal(index = null) {
  const title = document.getElementById("episodeModalTitle");
  const form = document.getElementById("episodeForm");
  const epNumGroup = document.getElementById("episodeNumberGroup");
  const indexInput = document.getElementById("episodeIndex");
  const sourceContainer = document.getElementById("sourceListContainer");

  // Reset form
  form.reset();
  sourceContainer.innerHTML = ""; // Xóa các source cũ
  adminPreviewSelectedIndex = 0; // Reset index preview về nguồn đầu tiên

  // Sử dụng biến toàn cục selectedMovieForEpisodes thay vì đọc từ DOM (vì DOM select có thể bị ẩn/sai lệch)
  const movieId = selectedMovieForEpisodes || document.getElementById("selectMovieForEpisodes").value;
  const movie = allMovies.find((m) => m.id === movieId);
  const isSingle = movie && movie.type === "single";

  if (epNumGroup) {
      epNumGroup.style.display = "block";
      const label = epNumGroup.querySelector(".form-label");
      if (label) {
          label.textContent = isSingle ? "Nhãn hiển thị (VD: FULL, HD-Full) *" : "Số tập *";
      }
  }

  if (index !== null) {
    // === EDIT ===
    title.textContent = isSingle ? "Cập Nhật Link Phim" : "Sửa Tập Phim";
    indexInput.value = index;

    const episode = movie?.episodes?.[index];

    if (episode) {
      // Đổ dữ liệu vào modal
      if (document.getElementById("episodeNumber")) {
          document.getElementById("episodeNumber").value = episode.title || episode.episode_name || episode.episode_number || episode.episodeNumber || (isSingle ? "1" : "");
      }
      
      // Xử lý tự động thêm "Tập" khi nhập số
      const epNumInput = document.getElementById("episodeNumber");
      if (epNumInput) {
          epNumInput.onblur = function() {
              const val = this.value.trim();
              if (val && !isNaN(val)) {
                  this.value = "Tập " + val;
              }
          };
      }
      
      // Xử lý Thời lượng (Smart Input)
      const dur = parseDuration(episode.duration || "");
      document.getElementById("episodeDurationHour").value = dur.h || "";
      document.getElementById("episodeDurationMinute").value = dur.m || "";

      document.getElementById("episodeQuality").value = episode.quality || "1080p60";

      // Load Sources
      if (episode.sources && Array.isArray(episode.sources) && episode.sources.length > 0) {
        // Dữ liệu mới (Multi-source) - field chuẩn là 'source'
        episode.sources.forEach(src => {
            addSourceInput(src.type, src.source || '', src.label, src.server || 'KKPhim');
        });
      } else {
        // Dữ liệu cũ (Single source) -> Convert sang 1 dòng source
        const oldType = episode.videoType || "youtube";
        const oldSource = episode.videoSource || episode.youtubeId || "";
        addSourceInput(oldType, oldSource, "Mặc định");
      }
    }
  } else {
    // === ADD NEW ===
    title.textContent = isSingle ? "Cập Nhật Link Phim" : "Thêm Tập Mới";
    indexInput.value = "";

    if (isSingle) {
      document.getElementById("episodeNumber").value = "FULL";
    } else {
      // FIX: Tìm số tập lớn nhất thay vì đếm số lượng (tránh trùng khi xóa tập giữa)
      let maxEp = 0;
      if (movie && movie.episodes && movie.episodes.length > 0) {
          maxEp = Math.max(...movie.episodes.map(e => {
              const num = parseInt(String(e.episodeNumber).replace(/\D/g, ''));
              return isNaN(num) ? 0 : num;
          }));
      }
      const nextEp = maxEp + 1;
      document.getElementById("episodeNumber").value = "Tập " + nextEp;
    }

    // Xử lý tự động thêm "Tập" khi nhập số cho add mới
    const epNumInput = document.getElementById("episodeNumber");
    if (epNumInput) {
        epNumInput.onblur = function() {
            const val = this.value.trim();
            if (val && !isNaN(val)) {
                this.value = "Tập " + val;
            }
        };
    }

    document.getElementById("episodeQuality").value = "1080p60";
    
    // Reset Thời lượng
    document.getElementById("episodeDurationHour").value = "";
    document.getElementById("episodeDurationMinute").value = "";

    // Reset Intro Begin
    document.getElementById("introBeginMinute").value = "";
    document.getElementById("introBeginSecond").value = "";
    
    // Reset Intro End
    document.getElementById("introEndMinute").value = "";
    document.getElementById("introEndSecond").value = "";
    
    // Reset Outro
    document.getElementById("outroStartMinute").value = "";
    document.getElementById("outroStartSecond").value = "";
    
    // Reset checkbox áp dụng cho tất cả
    const applyCheck = document.getElementById("applyIntroToAll");
    if (applyCheck) applyCheck.checked = false;
    
    // Thêm 1 dòng source mặc định
    addSourceInput("hls", "", "Bản gốc");
  }

  // Khởi tạo preview player và load dữ liệu intro sau khi modal mở
  setTimeout(() => {
      updateAdminIntroPreview();
      
      if (index !== null) {
          const movieId = selectedMovieForEpisodes || document.getElementById("selectMovieForEpisodes").value;
          const movie = allMovies.find((m) => m.id === movieId);
          const episode = movie?.episodes?.[index];
          if (episode) {
              // Đọc intro_begin (thời điểm intro bắt đầu)
              const introBeginTime = Number(episode.intro_begin) || 0;
              document.getElementById("introBeginMinute").value = introBeginTime > 0 ? Math.floor(introBeginTime / 60) : "";
              document.getElementById("introBeginSecond").value = introBeginTime > 0 ? (introBeginTime % 60) : "";

              // Đọc intro_end (thời điểm intro kết thúc)
              const introTime = Number(episode.intro_end || (episode.extra_info && episode.extra_info.intro_end) || episode.introEndTime) || 0;
              document.getElementById("introEndMinute").value = introTime > 0 ? Math.floor(introTime / 60) : "";
              document.getElementById("introEndSecond").value = introTime > 0 ? (introTime % 60) : "";

              // Đọc outro (intro_start trong schema cũ)
              const outroTime = Number(episode.intro_start || (episode.extra_info && episode.extra_info.outro_start) || episode.outroStartTime) || 0;
              document.getElementById("outroStartMinute").value = outroTime > 0 ? Math.floor(outroTime / 60) : "";
              document.getElementById("outroStartSecond").value = outroTime > 0 ? (outroTime % 60) : "";
          }
      }
  }, 300);

  openModal("episodeModal");
}

/**
 * Xử lý submit form tập phim
 */
async function handleEpisodeSubmit(event) {
  event.preventDefault();

  if (!supabase || !selectedMovieForEpisodes) return;

  const index = document.getElementById("episodeIndex").value;
  
  // Thu thập sources từ UI
  const sourceItems = document.querySelectorAll(".source-item");
  const sources = [];
  
  sourceItems.forEach(item => {
      sources.push({
          server: item.querySelector(".source-server") ? item.querySelector(".source-server").value : 'KKPhim',
          label: item.querySelector(".source-label").value,
          type: item.querySelector(".source-type").value,
          source: item.querySelector(".source-url").value
      });
  });

  if (sources.length === 0) {
      showNotification("Phải có ít nhất 1 nguồn video!", "warning");
      return;
  }

  const introBegin = (() => {
      const m = parseInt(document.getElementById("introBeginMinute").value) || 0;
      const s = parseInt(document.getElementById("introBeginSecond").value) || 0;
      return (m * 60) + s;
  })();

  const introEnd = (() => {
      const m = parseInt(document.getElementById("introEndMinute").value) || 0;
      const s = parseInt(document.getElementById("introEndSecond").value) || 0;
      return (m * 60) + s;
  })();
  
  const outroStart = (() => {
      const m = parseInt(document.getElementById("outroStartMinute").value) || 0;
      const s = parseInt(document.getElementById("outroStartSecond").value) || 0;
      return (m * 60) + s;
  })();

  // Lưu intro_end & intro_start dạng cột riêng (khớp schema bảng episodes Supabase)
  const episodeData = {
    title: document.getElementById("episodeNumber").value, // Đổi từ episode_name -> title
    duration: (() => {
        const h = parseInt(document.getElementById("episodeDurationHour").value) || 0;
        const m = parseInt(document.getElementById("episodeDurationMinute").value) || 0;
        return formatDuration(h, m);
    })(),
    quality: document.getElementById("episodeQuality").value,
    sources: sources,
    intro_begin: introBegin,
    intro_end: introEnd,
    intro_start: outroStart,
    updated_at: new Date().toISOString()
  };

  if (introEnd > 0 && outroStart > 0 && introEnd >= outroStart) {
      if (!await customConfirm("Thời gian Intro đang lớn hơn hoặc bằng thời gian Outro. Bạn có chắc chắn muốn lưu không?", { 
          title: "Cảnh báo mốc thời gian", 
          type: "warning",
          confirmText: "Vẫn lưu" 
      })) {
          return;
      }
  }

  try {
    showLoading(true, "Đang lưu...");

    // Tìm index thật trong allMovies để lấy ID nếu là update
    const mIdx = allMovies.findIndex(m => m.id === selectedMovieForEpisodes);
    const movieObj = allMovies[mIdx];
    const episodes = movieObj?.episodes || [];

    if (index !== "") {
      // Update
      const episodeId = episodes[parseInt(index)]?.id;
      if (!episodeId) throw new Error("Không tìm thấy ID tập để cập nhật");
      
      const { error } = await supabase.from('episodes').update(episodeData).eq('id', episodeId);
      if (error) throw error;
    } else {
      // Create
      episodeData.movie_id = selectedMovieForEpisodes;
      // Gán cả 2 cột để chắc chắn
      episodeData.episode_index = episodes.length; 
      episodeData.episode_number = (episodes.length + 1).toString(); 
      
      const { error } = await supabase.from('episodes').insert(episodeData);
      if (error) throw error;
      
      if (typeof sendTelegramNotify === 'function') {
          try {
              const { data: mData } = await supabase.from('movies').select('title, total_episodes, versions, type, status').eq('id', selectedMovieForEpisodes).single();
              const { count: currentEpCount } = await supabase.from('episodes').select('id', { count: 'exact', head: true }).eq('movie_id', selectedMovieForEpisodes);
              
              const srcSet = new Set();
              (episodeData.sources || []).forEach(s => { if (s.server) srcSet.add(s.server); else srcSet.add('Custom'); });
              const sourcesStr = srcSet.size > 0 ? Array.from(srcSet).join(', ') : 'Custom';
              const versionsStr = mData?.versions?.length ? mData.versions.join(', ') : 'Vietsub';
              const isTrailer = mData?.status === 'pending';
              const typeName = mData?.type === 'series' ? 'Phim bộ' : 'Phim lẻ';
              const typeStr = isTrailer ? `[Trailer] ${typeName}` : typeName;

              const msg = `🎬 <b>Trạm Phim Bot</b>\n\n👤 Admin vừa tạo thủ công 1 Tập phim:\n\n`
                    + `📌 <b>Phim:</b> ${mData?.title || 'Không rõ'}\n`
                    + `🏷 <b>Loại:</b> ${typeStr}\n`
                    + `📺 <b>Tập:</b> ${episodeData.episode_number} (Hiện tại: ${currentEpCount} / ${mData?.total_episodes || '?'})\n`
                    + `💽 <b>Bản chiếu:</b> ${versionsStr}\n`
                    + `🌐 <b>Nguồn:</b> ${sourcesStr}`;
              sendTelegramNotify(msg);

              // ★ THÔNG BÁO CHUÔNG CHO TẬP MỚI
              if (typeof sendNotificationToAllUsers === 'function') {
                  const notifTitle = `📺 Tập mới [${typeName}]: ${mData?.title || 'Phim'}`;
                  const notifMsg = `Trạm Phim vừa cập nhật Tập ${episodeData.episode_number} cho "${mData?.title || 'Phim'}". Vào xem ngay!`;
                  sendNotificationToAllUsers(notifTitle, notifMsg, 'new_episode', { movie_id: selectedMovieForEpisodes });
              }
          } catch(e) {
              sendTelegramNotify(`🎬 <b>Trạm Phim Bot</b>\n\n👤 Admin vừa thêm thủ công <b>Tập ${episodeData.episode_number}</b> lên hệ thống qua Admin Panel!`);
          }
      }
    }

    showNotification("Đã lưu tập phim!", "success");
    notifyDataChange("movies"); 

    // Kiểm tra nếu áp dụng cho tất cả tập
    const applyIntroToAll = document.getElementById("applyIntroToAll")?.checked;
    if (applyIntroToAll && episodes.length > 0) {
        const { data: currentEpisodes, error: fetchErr } = await supabase.from('episodes')
            .select('id')
            .eq('movie_id', selectedMovieForEpisodes);
            
        if (!fetchErr && currentEpisodes) {
            for (const ep of currentEpisodes) {
                await supabase.from('episodes')
                    .update({ intro_begin: introBegin, intro_end: introEnd, intro_start: outroStart })
                    .eq('id', ep.id);
            }
            console.log("✅ Đã áp dụng Intro/Outro cho tất cả tập");
        } else {
            console.error("Lỗi áp dụng intro hàng loạt:", fetchErr);
        }
    }

    closeEpisodeModal(); 
    if (typeof loadMovies === 'function') await loadMovies();
    await loadEpisodesForMovie(selectedMovieForEpisodes);
  } catch (error) {
    console.error("Lỗi lưu episode Supabase:", error);
    showNotification("Không thể lưu tập phim!", "error");
  } finally {
    showLoading(false);
  }
}

function editEpisode(index) {
  openEpisodeModal(index);
}

/**
 * [FIX] Hàm đóng modal tập phim chuyên biệt để dừng video review
 */
window.closeEpisodeModal = function() {
    console.log("🎬 Đang đóng Modal Episode và dừng video preview...");
    
    if (adminPreviewPlayer) {
        try {
            if (adminPreviewPlayer instanceof HTMLVideoElement) {
                adminPreviewPlayer.pause();
                adminPreviewPlayer.src = "";
                adminPreviewPlayer.load();
            } else if (typeof adminPreviewPlayer.stopVideo === 'function') {
                // YouTube API
                adminPreviewPlayer.stopVideo();
            } else if (typeof adminPreviewPlayer.pauseVideo === 'function') {
                adminPreviewPlayer.pauseVideo();
            }
        } catch (e) {
            console.error("Lỗi khi dừng video preview:", e);
        }
        adminPreviewPlayer = null;
    }

    // Chỉ xóa video/iframe/placeholder, giữ nguyên overlay + controls (để mở lại modal vẫn hoạt động)
    const wrapper = document.getElementById("adminIntroPlayerWrapper");
    if (wrapper) {
        // Hủy HLS instance nếu đang tồn tại
        if (window._adminHlsInstance) {
            try { window._adminHlsInstance.destroy(); } catch(e) {}
            window._adminHlsInstance = null;
        }
        
        const oldVideo = wrapper.querySelector("video");
        const oldIframe = wrapper.querySelector("iframe");
        const oldYtDiv = wrapper.querySelector("#adminYoutubePreview");
        if (oldVideo) oldVideo.remove();
        if (oldIframe) oldIframe.remove();
        if (oldYtDiv) oldYtDiv.remove();
        
        // Thêm lại placeholder
        let placeholder = document.getElementById("adminIntroPlayerPlaceholder");
        if (!placeholder) {
            placeholder = document.createElement("div");
            placeholder.id = "adminIntroPlayerPlaceholder";
            placeholder.style.cssText = "text-align: center; color: #666;";
            placeholder.innerHTML = `<i class="fas fa-video-slash fa-2x mb-2"></i><p style="font-size: 0.9rem;">Chưa có video. Hãy nhập link video bên trên.</p>`;
            const overlay = document.getElementById("adminPreviewOverlay");
            wrapper.insertBefore(placeholder, overlay);
        } else {
            placeholder.style.display = "";
        }
        
        // Ẩn overlay + controls (không xóa)
        const overlay = document.getElementById("adminPreviewOverlay");
        const controls = document.getElementById("adminPreviewControls");
        if (overlay) overlay.style.display = "none";
        if (controls) controls.style.display = "none";
    }

    // Đóng modal giao diện
    closeModal("episodeModal");
};

/**
 * Xóa tập phim
 */
async function deleteEpisode(index) {
  if (!await customConfirm("Bạn có chắc muốn xóa tập này?", { title: "Xóa tập phim", type: "danger", confirmText: "Xóa" })) return;

  if (!supabase || !selectedMovieForEpisodes) return;

  try {
    showLoading(true, "Đang xóa...");

    // Tìm ID tập từ cache
    const mIdx = allMovies.findIndex(m => m.id === selectedMovieForEpisodes);
    const episodeId = allMovies[mIdx]?.episodes[index]?.id;

    if (!episodeId) throw new Error("Không tìm thấy ID tập để xóa");

    const { error } = await supabase.from('episodes').delete().eq('id', episodeId);
    if (error) throw error;

    showNotification("Đã xóa tập phim!", "success");

    // Reload
    if (typeof loadMovies === 'function') await loadMovies();
    loadEpisodesForMovie(selectedMovieForEpisodes);
    notifyDataChange("movies"); 
  } catch (error) {
    console.error("Lỗi xóa episode Supabase:", error);
    showNotification("Không thể xóa tập phim!", "error");
  } finally {
    showLoading(false);
  }
}

/**
 * Xóa tất cả tập phim
 */
async function deleteAllEpisodes() {
  if (!selectedMovieForEpisodes) {
    showNotification("Vui lòng chọn một phim trước!", "warning");
    return;
  }

  if (!await customConfirm("Bạn có chắc muốn xóa TẤT CẢ các tập của phim này? Hành động này không thể hoàn tác!", { title: "Xóa tất cả tập phim", type: "danger", confirmText: "Xóa tất cả" })) return;

  if (!supabase) return;

  try {
    showLoading(true, "Đang xóa tất cả tập...");

    const { error } = await supabase.from('episodes').delete().eq('movie_id', selectedMovieForEpisodes);
    if (error) throw error;

    showNotification("Đã xóa tất cả tập phim!", "success");

    // Reload
    if (typeof loadMovies === 'function') await loadMovies();
    loadEpisodesForMovie(selectedMovieForEpisodes);
    notifyDataChange("movies"); 
  } catch (error) {
    console.error("Lỗi xóa tất cả episodes Supabase:", error);
    showNotification("Không thể xóa các tập phim!", "error");
  } finally {
    showLoading(false);
  }
}

/**
 * ============================================================
 * SKIP INTRO & PREVIEW PLAYER LOGIC (ADMIN)
 * ============================================================
 */

let adminPreviewPlayer = null; 
let adminPreviewSelectedIndex = 0; // Lưu chỉ số source đang được preview

/**
 * Tự động cập nhật danh sách nút chuyển và preview video
 */
function updateAdminIntroPreview() {
    const sourceList = document.getElementById("sourceListContainer");
    const switchContainer = document.getElementById("adminPreviewSourceSwitch");
    if (!sourceList || !switchContainer) return;

    const sourceItems = sourceList.querySelectorAll(".source-item");
    if (sourceItems.length === 0) {
        switchContainer.innerHTML = "";
        initAdminIntroPlayer(null, null);
        return;
    }

    // Đảm bảo index hợp lệ
    if (adminPreviewSelectedIndex >= sourceItems.length) {
        adminPreviewSelectedIndex = 0;
    }

    // Render danh sách nút chuyển đổi
    let switchHtml = "";
    sourceItems.forEach((item, index) => {
        const label = item.querySelector(".source-label").value || `Nguồn ${index + 1}`;
        const isActive = index === adminPreviewSelectedIndex;
        const btnClass = isActive ? "btn-primary" : "btn-outline-secondary";
        const style = `padding: 4px 12px; font-size: 0.8rem; border-radius: 20px; text-transform: none;`;
        
        switchHtml += `
            <button type="button" class="btn ${btnClass} btn-sm" style="${style}" onclick="changeAdminPreviewSource(${index})">
                <i class="fas ${isActive ? 'fa-play-circle' : 'fa-link'}"></i> ${index + 1}. ${label}
            </button>
        `;

        // Gán sự kiện oninput/onchange cho từng source nếu chưa có để update preview tức thì
        const urlInput = item.querySelector(".source-url");
        const typeSelect = item.querySelector(".source-type");
        const labelSelect = item.querySelector(".source-label");

        if (urlInput && !urlInput.dataset.hasPreviewListener) {
            urlInput.addEventListener('input', () => {
                if (index === adminPreviewSelectedIndex) updateAdminIntroPreview();
            });
            typeSelect.addEventListener('change', () => {
                if (index === adminPreviewSelectedIndex) updateAdminIntroPreview();
            });
            labelSelect.addEventListener('change', () => updateAdminIntroPreview()); // Refresh labels
            urlInput.dataset.hasPreviewListener = "true";
        }
    });
    switchContainer.innerHTML = switchHtml;

    // Lấy thông tin của source đang chọn để init player
    const selectedItem = sourceItems[adminPreviewSelectedIndex];
    const type = selectedItem.querySelector(".source-type").value;
    const url = selectedItem.querySelector(".source-url").value.trim();

    initAdminIntroPlayer(type, url);
}

/**
 * Hành động khi nhấn nút chuyển Source
 */
window.changeAdminPreviewSource = function(index) {
    adminPreviewSelectedIndex = index;
    updateAdminIntroPreview();
}

/**
 * Khởi tạo trình phát preview
 */
function initAdminIntroPlayer(type, source) {
    const wrapper = document.getElementById("adminIntroPlayerWrapper");
    if (!wrapper) return;

    // Cleanup cũ (chỉ xóa video/iframe, giữ lại overlay + controls)
    const oldVideo = wrapper.querySelector("video");
    const oldIframe = wrapper.querySelector("iframe");
    const oldPlaceholder = wrapper.querySelector("#adminIntroPlayerPlaceholder");
    if (oldVideo) oldVideo.remove();
    if (oldIframe) oldIframe.remove();
    if (oldPlaceholder) oldPlaceholder.remove();
    adminPreviewPlayer = null;

    // Ẩn overlay + controls khi chưa có source
    const overlay = document.getElementById("adminPreviewOverlay");
    const controls = document.getElementById("adminPreviewControls");
    
    if (!source) {
        const placeholder = document.createElement("div");
        placeholder.id = "adminIntroPlayerPlaceholder";
        placeholder.style.cssText = "text-align: center; color: #666;";
        placeholder.innerHTML = `<i class="fas fa-video-slash fa-2x mb-2"></i><p style="font-size: 0.9rem;">Chưa có video. Hãy nhập link video bên trên.</p>`;
        wrapper.insertBefore(placeholder, overlay);
        if (overlay) overlay.style.display = "none";
        if (controls) controls.style.display = "none";
        return;
    }

    if (type === "youtube") {
        const videoId = extractYouTubeId(source) || source;
        const ytDiv = document.createElement("div");
        ytDiv.id = "adminYoutubePreview";
        wrapper.insertBefore(ytDiv, overlay);
        
        if (window.YT && window.YT.Player) {
            adminPreviewPlayer = new YT.Player('adminYoutubePreview', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: { 'autoplay': 0, 'controls': 1 }
            });
        } else {
            const iframe = document.createElement("iframe");
            iframe.src = `https://www.youtube.com/embed/${videoId}`;
            iframe.style.cssText = "width:100%;height:100%;border:0;";
            iframe.allowFullscreen = true;
            wrapper.insertBefore(iframe, overlay);
        }
        // YouTube dùng controls riêng, ẩn custom
        if (overlay) overlay.style.display = "none";
        if (controls) controls.style.display = "none";
    } else if (type === "hls" || type === "mp4") {
        const video = document.createElement("video");
        video.style.cssText = "width: 100%; height: 100%; position: absolute; top: 0; left: 0;";
        video.controls = false; // Tắt native controls, dùng custom
        wrapper.insertBefore(video, overlay);
        adminPreviewPlayer = video;

        // Tạo loading spinner cho buffering/lag
        // Thay thế icon nút Play ở giữa thành spinner khi video đang buffer
        const playBtn = document.getElementById("adminPreviewPlayBtn");
        // Inject keyframe CSS cho spinner nếu chưa có
        if (!document.getElementById("adminBufferSpinStyle")) {
            const s = document.createElement("style");
            s.id = "adminBufferSpinStyle";
            s.textContent = `@keyframes adminBufferSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
            document.head.appendChild(s);
        }
        const showBuffering = () => {
            if (playBtn) {
                const icon = playBtn.querySelector("i");
                if (icon) {
                    icon.className = "fas fa-spinner";
                    icon.style.animation = "adminBufferSpin 1s linear infinite";
                }
            }
        };
        const hideBuffering = () => {
            if (playBtn) {
                const icon = playBtn.querySelector("i");
                if (icon) {
                    icon.className = video.paused ? "fas fa-play" : "fas fa-pause";
                    icon.style.animation = "";
                }
            }
        };

        // Gắn event hiện/ẩn spinner khi video buffering (chỉ khi đang phát bị stall)
        video.addEventListener("waiting", showBuffering);
        video.addEventListener("playing", hideBuffering);
        video.addEventListener("canplay", hideBuffering);
        video.addEventListener("seeked", hideBuffering);
        video.addEventListener("error", hideBuffering);
        video.addEventListener("pause", () => {
            if (playBtn) { const icon = playBtn.querySelector("i"); if (icon) icon.className = "fas fa-play"; }
        });

        // Xóa spinner cũ nếu tồn tại (từ code cũ)
        const oldSpinner = wrapper.querySelector("#adminPreviewSpinner");
        if (oldSpinner) oldSpinner.remove();

        // Hủy HLS instance cũ trước khi tạo mới
        if (window._adminHlsInstance) {
            try { window._adminHlsInstance.destroy(); } catch(e) {}
            window._adminHlsInstance = null;
        }

        if (type === "hls") {
            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(source);
                hls.attachMedia(video);
                window._adminHlsInstance = hls; // Lưu lại để hủy khi đóng modal
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = source;
            }
        } else {
            video.src = source;
        }

        // Hiện overlay + custom controls
        if (overlay) overlay.style.display = "";
        if (controls) controls.style.display = "";

        // Gắn event listener cho custom controls
        setupAdminPreviewControls(video);
    } else if (type === "embed") {
        const iframe = document.createElement("iframe");
        iframe.src = source;
        iframe.style.cssText = "width:100%;height:100%;border:0;";
        iframe.allowFullscreen = true;
        wrapper.insertBefore(iframe, overlay);
        // Embed dùng controls riêng
        if (overlay) overlay.style.display = "none";
        if (controls) controls.style.display = "none";
    }
}

/** Gắn event listener cho custom controls (seekbar, timeupdate) */
function setupAdminPreviewControls(video) {
    const seekbar = document.getElementById("adminPreviewSeekbar");
    const timeDisplay = document.getElementById("adminPreviewTimeDisplay");
    const secondDisplay = document.getElementById("adminPreviewSecondDisplay");
    if (!seekbar || !video) return;

    // Format thời gian mm:ss
    function fmt(s) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`;
    }

    // Cập nhật seekbar khi video đang phát (throttle: chỉ khi giây thay đổi)
    let _lastSec = -1;
    
    // Hiển thị tổng thời gian ngay khi video load xong metadata
    video.addEventListener("loadedmetadata", function() {
        if (video.duration && isFinite(video.duration)) {
            seekbar.max = Math.floor(video.duration);
            if (timeDisplay) timeDisplay.textContent = `00:00 / ${fmt(video.duration)}`;
            if (secondDisplay) secondDisplay.textContent = `0s`;
        }
    });
    // Fallback: HLS có thể cập nhật duration sau khi loadedmetadata
    video.addEventListener("durationchange", function() {
        if (video.duration && isFinite(video.duration)) {
            seekbar.max = Math.floor(video.duration);
            if (timeDisplay) timeDisplay.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
        }
    });

    video.addEventListener("timeupdate", function() {
        if (video.duration && !seekbar._dragging) {
            const curSec = Math.floor(video.currentTime);
            if (curSec === _lastSec) return; // Bỏ qua nếu chưa đổi giây
            _lastSec = curSec;
            seekbar.max = Math.floor(video.duration);
            seekbar.value = curSec;
            if (timeDisplay) timeDisplay.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
            if (secondDisplay) secondDisplay.textContent = `${curSec}s`;
        }
    });

    // Khi video load xong metadata → set max
    video.addEventListener("loadedmetadata", function() {
        seekbar.max = Math.floor(video.duration);
    });

    // Kéo thanh seekbar → tua video
    seekbar.addEventListener("mousedown", () => { seekbar._dragging = true; });
    seekbar.addEventListener("touchstart", () => { seekbar._dragging = true; }, { passive: true });
    seekbar.addEventListener("input", function() {
        video.currentTime = Number(seekbar.value);
        if (timeDisplay) timeDisplay.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration || 0)}`;
        if (secondDisplay) secondDisplay.textContent = `${Math.floor(video.currentTime)}s`;
    });
    seekbar.addEventListener("mouseup", () => { seekbar._dragging = false; });
    seekbar.addEventListener("touchend", () => { seekbar._dragging = false; });
    seekbar.addEventListener("change", function() {
        seekbar._dragging = false;
        video.currentTime = Number(seekbar.value);
    });

    // Click vào vùng video (ngoài nút) cũng toggle play
    video.addEventListener("click", function() {
        adminPreviewTogglePlay();
    });

    // Update icon play/pause
    video.addEventListener("play", () => {
        const icon = document.querySelector("#adminPreviewPlayBtn i");
        if (icon) icon.className = "fas fa-pause";
    });
    video.addEventListener("pause", () => {
        const icon = document.querySelector("#adminPreviewPlayBtn i");
        if (icon) icon.className = "fas fa-play";
    });

    // Auto-hide overlay + controls sau 10s khi chuột rời vùng video
    const wrapper = document.getElementById("adminIntroPlayerWrapper");
    const overlayEl = document.getElementById("adminPreviewOverlay");
    const controlsEl = document.getElementById("adminPreviewControls");
    let _hideTimer = null;

    // Thêm transition CSS cho overlay + controls
    if (overlayEl) overlayEl.style.transition = "opacity 0.4s ease";
    if (controlsEl) controlsEl.style.transition = "opacity 0.4s ease";

    const showControls = () => {
        if (overlayEl) { overlayEl.style.opacity = "1"; overlayEl.style.pointerEvents = ""; }
        if (controlsEl) { controlsEl.style.opacity = "1"; controlsEl.style.pointerEvents = ""; }
        // Hiện lại con trỏ chuột
        if (wrapper) wrapper.style.cursor = "";
    };
    const hideControls = () => {
        // Chỉ ẩn khi video đang phát (không ẩn khi đang pause)
        if (video && !video.paused) {
            if (overlayEl) { overlayEl.style.opacity = "0"; overlayEl.style.pointerEvents = "none"; }
            if (controlsEl) { controlsEl.style.opacity = "0"; controlsEl.style.pointerEvents = "none"; }
            // Ẩn con trỏ chuột khi fullscreen
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (wrapper) wrapper.style.cursor = "none";
            }
        }
    };
    const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    const startHideTimer = () => {
        clearTimeout(_hideTimer);
        // Fullscreen: 5 giây, bình thường: 10 giây
        const delay = isFullscreen() ? 5000 : 10000;
        _hideTimer = setTimeout(hideControls, delay);
    };

    if (wrapper) {
        // Chuột vào vùng video → hiện controls, reset timer
        wrapper.addEventListener("mouseenter", () => {
            showControls();
            startHideTimer();
        });
        // Chuột di chuyển trong video → reset timer
        wrapper.addEventListener("mousemove", () => {
            showControls();
            startHideTimer();
        });
        // Chuột rời vùng video → bắt đầu đếm ẩn
        wrapper.addEventListener("mouseleave", () => {
            startHideTimer();
        });
    }

    // Khi video pause → luôn hiện controls
    video.addEventListener("pause", () => {
        clearTimeout(_hideTimer);
        showControls();
    });
    // Khi video play → bắt đầu đếm ẩn
    video.addEventListener("play", () => {
        startHideTimer();
    });

    // Khi vào/thoát fullscreen → reset timer phù hợp
    document.addEventListener("fullscreenchange", () => {
        showControls();
        if (video && !video.paused) startHideTimer();
    });
}

/** Tua ±N giây cho admin preview */
window.adminPreviewSkip = function(seconds) {
    if (adminPreviewPlayer instanceof HTMLVideoElement) {
        adminPreviewPlayer.currentTime = Math.max(0, Math.min(adminPreviewPlayer.duration || 0, adminPreviewPlayer.currentTime + seconds));
    }
}

/** Toggle Play/Pause cho admin preview */
window.adminPreviewTogglePlay = function() {
    if (adminPreviewPlayer instanceof HTMLVideoElement) {
        if (adminPreviewPlayer.paused) {
            adminPreviewPlayer.play().catch(() => {});
        } else {
            adminPreviewPlayer.pause();
        }
    }
}

/** Bật/Tắt toàn màn hình cho admin preview */
window.adminPreviewFullscreen = function() {
    const wrapper = document.getElementById("adminIntroPlayerWrapper");
    if (!wrapper) return;
    
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
        (wrapper.requestFullscreen || wrapper.webkitRequestFullscreen).call(wrapper);
    }
}

/**
 * Lấy thời gian hiện tại từ trình phát để điền vào ô Intro
 */
function getCurrentTimeFromPreview() {
    let seconds = 0;
    
    if (!adminPreviewPlayer) {
        showNotification("Không tìm thấy trình phát video để lấy thời gian!", "warning");
        return;
    }

    if (adminPreviewPlayer instanceof HTMLVideoElement) {
        seconds = Math.floor(adminPreviewPlayer.currentTime);
    } else if (adminPreviewPlayer.getCurrentTime) {
        // YouTube API
        seconds = Math.floor(adminPreviewPlayer.getCurrentTime());
    } else {
        showNotification("Trình phát này không hỗ trợ lấy thời gian tự động. Vui lòng nhập tay.", "info");
        return;
    }

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    // [NEW] Xác định mục tiêu đang chọn (Intro hay Outro)
    const target = document.querySelector('input[name="timeCaptureTarget"]:checked')?.value || 'intro';
    
    if (target === 'introStart') {
        document.getElementById("introBeginMinute").value = mins;
        document.getElementById("introBeginSecond").value = secs;
        showNotification(`Đã lấy thời gian Intro bắt đầu: ${mins}p ${secs}s`, "success");
    } else if (target === 'intro') {
        document.getElementById("introEndMinute").value = mins;
        document.getElementById("introEndSecond").value = secs;
        showNotification(`Đã lấy thời gian Intro kết thúc: ${mins}p ${secs}s`, "success");
    } else {
        document.getElementById("outroStartMinute").value = mins;
        document.getElementById("outroStartSecond").value = secs;
        showNotification(`Đã lấy thời gian Outro: ${mins}p ${secs}s`, "success");
    }
}

/**
 * Thử nhảy tới đoạn intro đã đánh dấu để kiểm tra
 */
function previewSkipIntro() {
    // [NEW] Xác định mục tiêu đang chọn để thử nhảy
    const target = document.querySelector('input[name="timeCaptureTarget"]:checked')?.value || 'intro';
    let mins, secs;

    if (target === 'introStart') {
        mins = parseInt(document.getElementById("introBeginMinute").value) || 0;
        secs = parseInt(document.getElementById("introBeginSecond").value) || 0;
    } else if (target === 'intro') {
        mins = parseInt(document.getElementById("introEndMinute").value) || 0;
        secs = parseInt(document.getElementById("introEndSecond").value) || 0;
    } else {
        mins = parseInt(document.getElementById("outroStartMinute").value) || 0;
        secs = parseInt(document.getElementById("outroStartSecond").value) || 0;
    }

    const totalSeconds = (mins * 60) + secs;

    if (totalSeconds <= 0) {
        const labels = { introStart: 'bắt đầu intro', intro: 'kết thúc intro', outro: 'bắt đầu outro' };
        showNotification(`Vui lòng nhập thời gian ${labels[target] || 'mốc thời gian'} trước!`, "warning");
        return;
    }

    if (!adminPreviewPlayer) return;

    if (adminPreviewPlayer instanceof HTMLVideoElement) {
        adminPreviewPlayer.currentTime = totalSeconds;
        adminPreviewPlayer.play();
    } else if (adminPreviewPlayer.seekTo) {
        adminPreviewPlayer.seekTo(totalSeconds, true);
        adminPreviewPlayer.playVideo();
    }
}

/**
 * Helper: Trích xuất YouTube ID
 */
function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}
/**
 * Populate movie select cho quản lý tập
 */
function populateMovieSelect() {
  const select = document.getElementById("selectMovieForEpisodes");
  select.innerHTML =
    '<option value="">-- Chọn phim --</option>' +
    allMovies
      .map((m) => `<option value="${m.id}">${m.title}</option>`)
      .join("");
}
/**
 * Load danh sách users cho Admin (Đã sửa: Hiện ảnh Avatar thật)
 */
/**
 * Biến toàn cục lưu danh sách users để tìm kiếm
 */
let allAdminUsers = [];

/**
 * Load danh sách users cho Admin (Đã sửa: Hiện ảnh Avatar thật + Tách hàm render)
 */
async function loadAdminUsers() {
  if (!supabase) return;

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Lưu vào biến toàn cục
    allAdminUsers = profiles || [];

    // Render toàn bộ lần đầu
    renderAdminUsersList(allAdminUsers);

    // Gắn sự kiện tìm kiếm nếu chưa gắn
    const searchInput = document.getElementById("adminSearchUsers");
    const filterRole = document.getElementById("adminFilterRole");

    if (searchInput) {
      searchInput.oninput = window.filterAdminUsersDebounced;
    }
    if (filterRole) {
      filterRole.onchange = filterAdminUsers;
    }

  } catch (error) {
    console.error("Lỗi tải users Supabase:", error);
  }
}

/**
 * Hàm lọc user theo tên/email và vai trò
 */
function filterAdminUsers() {
  const searchText = removeDiacritics(document.getElementById("adminSearchUsers").value);
  const roleFilter = document.getElementById("adminFilterRole").value;

  const filtered = allAdminUsers.filter(user => {
    const matchName = removeDiacritics(user.displayName || "").includes(searchText);
    const matchEmail = (user.email || "").toLowerCase().includes(searchText);
    const matchRole = roleFilter ? user.role === roleFilter : true;

    return (matchName || matchEmail) && matchRole;
  });

  renderAdminUsersList(filtered);
}

/**
 * Hàm render UI danh sách user (Tách ra để tái sử dụng)
 */
function renderAdminUsersList(users) {
  const tbody = document.getElementById("adminUsersTable");
  if (!tbody) return;

  // --- LOGIC PHÂN TRANG ---
  const totalItems = users.length;
  const totalPages = Math.ceil(totalItems / adminPerPage);
  
  if (currentAdminUserPage > totalPages && totalPages > 0) currentAdminUserPage = totalPages;
  if (currentAdminUserPage < 1) currentAdminUserPage = 1;

  const startIndex = (currentAdminUserPage - 1) * adminPerPage;
  const paginatedUsers = users.slice(startIndex, startIndex + adminPerPage);

  if (totalItems === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center">Không tìm thấy người dùng nào</td></tr>`;
    const paginationContainer = document.getElementById("adminUserPagination");
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  tbody.innerHTML = paginatedUsers
    .map((user) => {
      const date = user.created_at ? formatDate(new Date(user.created_at)) : "N/A";
      const initial = (user.display_name || user.email || "U")[0].toUpperCase();

      // Avatar Logic
      let avatarHtml =
        user.avatar && user.avatar.startsWith("http")
          ? `<img src="${user.avatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">`
          : `<div class="comment-avatar" style="width:40px;height:40px;font-size:14px;">${initial}</div>`;

      // 👇 LOGIC TÍNH THỜI HẠN VIP 👇
      const isVip = user.is_vip === true;
      let expiryText = "-";

      if (isVip) {
        if (user.vip_expires_at) {
          const expiryDate = new Date(user.vip_expires_at);
          const now = new Date();
          const diffTime = expiryDate - now;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays > 0) {
            expiryText = `<span style="color: #00d4ff; font-weight:bold;">Còn ${diffDays} ngày</span>`;
          } else {
            expiryText = `<span style="color: #ff4444; font-weight:bold;">Đã hết hạn</span>`;
          }
        } else {
          expiryText = `<span class="tag" style="background: linear-gradient(45deg, #00d4ff, #00ff88); color: #000; font-weight:800;">♾️ VĨNH VIỄN</span>`;
        }
      }

      const vipBadge = isVip
        ? `<span class="status-badge vip"><i class="fas fa-crown"></i> VIP</span>`
        : `<span class="status-badge free">Free</span>`;
      const vipBtnClass = isVip ? "btn-secondary" : "btn-vip-action";
      const vipIcon = isVip ? "fa-ban" : "fa-crown";
      
      const roleClass = user.role === "admin" ? "public" : (user.role === "editor" ? "pending" : "");

      return `
          <tr>
              <td>${avatarHtml}</td>
              <td>${user.email}</td>
              <td>${user.display_name || "N/A"}</td>
              <td><span class="status-badge ${roleClass}">${user.role || "user"}</span></td>
              <td><span class="status-badge ${user.is_active ? "active" : "blocked"}">${user.is_active ? "Hoạt động" : "Bị khóa"}</span></td>
              <td>${vipBadge}</td>
              
              <td style="font-size: 13px;">${expiryText}</td>
              
              <td>${date}</td>
              <td>
                  <button class="btn btn-sm ${vipBtnClass}" onclick="toggleUserVip('${user.id}', ${!isVip})" title="Cấp/Hủy VIP">
                      <i class="fas ${vipIcon}"></i>
                  </button>
                  <button class="btn btn-sm btn-secondary" onclick="openUserRoleModal('${user.id}', '${user.email}', '${user.role}')" title="Phân quyền"><i class="fas fa-user-cog"></i></button>
                  <button class="btn btn-sm ${user.is_active ? "btn-danger" : "btn-success"}" onclick="toggleUserStatus('${user.id}', ${!user.is_active})" title="${user.is_active ? "Khóa" : "Mở khóa"}"><i class="fas fa-${user.is_active ? "lock" : "unlock"}"></i></button>
              <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}', '${user.email}')" title="Xóa vĩnh viễn">
                      <i class="fas fa-trash-alt"></i>
                  </button>
                  </td>
          </tr>
      `;
    })
    .join("");

  // Render nút phân trang
  renderAdminPagination("adminUserPagination", totalItems, currentAdminUserPage, adminPerPage, "changeAdminUserPage", "người dùng");
}

/**
 * Chuyển trang Người dùng
 */
window.changeAdminUserPage = function(page) {
    currentAdminUserPage = page;
    filterAdminUsers();
    const panel = document.getElementById("usersPanel");
    if (panel) panel.scrollIntoView({ behavior: 'smooth' });
};
// 👇 HÀM MỚI: CẤP VIP CÓ THỜI HẠN 👇
// 👇 HÀM CẤP VIP (ĐÃ CÓ TÙY CHỌN VĨNH VIỄN) 👇
async function toggleUserVip(userId, setVip) {
  if (!supabase) return;

  let expiryDate = null; 
  let days = 0;
  let message = "";

  if (setVip) {
    const input = await customPrompt("Nhập số ngày VIP (Ví dụ: 30). Nhập -1 để cấp VĨNH VIỄN.", { title: "Cấp VIP", defaultValue: "30" });

    if (input === null) return; 

    days = parseInt(input);

    if (isNaN(days)) {
      await customAlert("Vui lòng nhập số!", { type: "warning" });
      return;
    }

    if (days === -1) {
      expiryDate = null;
      message = "Đã cấp VIP VĨNH VIỄN! ♾️";
    } else if (days > 0) {
      const now = new Date();
      expiryDate = new Date(now.setDate(now.getDate() + days)).toISOString();
      message = `Đã cấp VIP ${days} ngày!`;
    } else {
      await customAlert("Số ngày không hợp lệ!", { type: "warning" });
      return;
    }
  } else {
    if (!await customConfirm("Bạn có chắc muốn HỦY VIP của người dùng này?", { title: "Hủy VIP", type: "danger", confirmText: "Hủy VIP" })) return;
    message = "Đã hủy VIP thành công!";
  }

  try {
    showLoading(true, "Đang cập nhật...");

    const { error } = await supabase.from('profiles').update({
        is_vip: setVip,
        vip_expires_at: expiryDate,
    }).eq('id', userId);

    if (error) throw error;

    showNotification(message, "success");
    await loadAdminUsers();
  } catch (error) {
    console.error("Lỗi cập nhật VIP Supabase:", error);
    showNotification("Lỗi cập nhật!", "error");
  } finally {
    showLoading(false);
  }
}
async function toggleUserStatus(userId, newStatus) {
  if (!supabase) return;

  const action = newStatus ? "mở khóa" : "khóa";
  if (!await customConfirm(`Bạn có chắc muốn ${action} tài khoản này?`, { title: action === 'khóa' ? 'Khóa tài khoản' : 'Mở khóa', type: action === 'khóa' ? 'danger' : 'warning', confirmText: action.charAt(0).toUpperCase() + action.slice(1) })) return;

  try {
    showLoading(true, "Đang xử lý...");

    const { error } = await supabase.from('profiles').update({
        is_active: newStatus
    }).eq('id', userId);

    if (error) throw error;

    showNotification(`Đã ${action} tài khoản thành công!`, "success");
    await loadAdminUsers();
  } catch (error) {
    console.error("Lỗi cập nhật trạng thái user Supabase:", error);
    showNotification("Lỗi cập nhật!", "error");
  } finally {
    showLoading(false);
  }
}
/**
 * Xóa tài khoản người dùng vĩnh viễn
 */
async function deleteUser(userId, userEmail) {
  const confirmMsg = `Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản: ${userEmail}? Hành động này sẽ xóa toàn bộ dữ liệu và KHÔNG THỂ khôi phục.`;

  if (!await customConfirm(confirmMsg, { title: "⚠️ XÓA TÀI KHOẢN", type: "danger", confirmText: "Xóa vĩnh viễn" })) return;

  if (!supabase) return;

  try {
    showLoading(true, "Đang xóa tài khoản...");

    const { error } = await supabase.from('profiles').update({
      is_deleted: true,
      is_active: false,
      deleted_at: new Date().toISOString(),
    }).eq('id', userId);

    if (error) throw error;

    showNotification("Đã xóa tài khoản thành công!", "success");

    await loadAdminUsers();
    await loadAdminStats();
  } catch (error) {
    console.error("Lỗi xóa user Supabase:", error);
    showNotification("Lỗi: " + error.message, "error");
  } finally {
    showLoading(false);
  }
}
/**
 * Mở modal phân quyền user
 */
function openUserRoleModal(userId, email, currentRole) {
  editingUserId = userId;
  document.getElementById("userRoleEmail").textContent = `Email: ${email}`;
  document.getElementById("userRoleSelect").value = currentRole || "user";
  openModal("userRoleModal");
}

/**
 * Cập nhật role user
 */
async function updateUserRole() {
  if (!editingUserId || !supabase) return;

  const newRole = document.getElementById("userRoleSelect").value;

  try {
    showLoading(true, "Đang cập nhật...");

    const { error } = await supabase.from('profiles').update({
      role: newRole,
    }).eq('id', editingUserId);

    if (error) throw error;

    showNotification("Đã cập nhật quyền người dùng!", "success");
    closeModal("userRoleModal");

    await loadAdminUsers();
  } catch (error) {
    console.error("Lỗi cập nhật role Supabase:", error);
    showNotification("Không thể cập nhật quyền!", "error");
  } finally {
    showLoading(false);
  }
}
/**
 * Hiển thị bảng Thể loại (Đã cập nhật nút Sửa/Xóa)
 */
function renderAdminCategories() {
  const tbody = document.getElementById("adminCategoriesTable");
  const searchInput = document.getElementById("adminSearchCategory");
  
  if (!tbody) return;

  let categoriesToRender = allCategories;

  // Lọc nếu có từ khóa tìm kiếm
  if (searchInput) {
    const searchText = searchInput.value.toLowerCase().trim();
    if (searchText) {
      categoriesToRender = allCategories.filter(c => 
        (c.name && c.name.toLowerCase().includes(searchText)) || 
        (c.slug && c.slug.toLowerCase().includes(searchText)) ||
        (c.id && c.id.toLowerCase().includes(searchText))
      );
    }
  }

  if (categoriesToRender.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center">Không tìm thấy thể loại nào</td></tr>';
    return;
  }

  tbody.innerHTML = categoriesToRender
    .map((cat, index) => {
      return `
            <tr>
                <td>${index + 1}</td>
                <td>${cat.id}</td>
                <td>${cat.name}</td>
                <td>${cat.slug || "N/A"}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editCategory('${cat.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCategory('${cat.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    })
    .join("");
}

// ==========================================
// LOGIC QUẢN LÝ THỂ LOẠI (CATEGORY)
// ==========================================

// 1. Mở Modal Thêm/Sửa Thể loại
function openCategoryModal(categoryId = null) {
  const modalTitle = document.getElementById("categoryModalTitle");
  const idInput = document.getElementById("categoryId");
  const nameInput = document.getElementById("categoryName");
  const slugInput = document.getElementById("categorySlug");

  // Reset form
  document.getElementById("categoryForm").reset();

  if (categoryId) {
    // Chế độ Sửa: Điền dữ liệu cũ vào
    const category = allCategories.find((c) => c.id === categoryId);
    if (category) {
      modalTitle.textContent = "Cập nhật Thể Loại";
      idInput.value = category.id;
      nameInput.value = category.name;
      slugInput.value = category.slug || "";
    }
  } else {
    // Chế độ Thêm mới
    modalTitle.textContent = "Thêm Thể Loại Mới";
    idInput.value = "";
  }

  openModal("categoryModal");
}

// 2. Hàm gọi từ nút Sửa
function editCategory(categoryId) {
  openCategoryModal(categoryId);
}

// 3. Xử lý nút Lưu (Submit Form)
async function handleCategorySubmit(event) {
  event.preventDefault(); // Chặn load lại trang

  const categoryId = document.getElementById("categoryId").value;
  const name = document.getElementById("categoryName").value.trim();
  let slug = document.getElementById("categorySlug").value.trim();

  if (!name) {
    showNotification("Vui lòng nhập tên thể loại!", "warning");
    return;
  }

  // Nếu không nhập slug thì tự tạo từ tên
  if (!slug) slug = createSlug(name);

  // Chống trùng lặp (chỉ kiểm tra khi thêm mới - không có categoryId)
  if (!categoryId) {
    const isDuplicateName = allCategories.some(c => c.name.toLowerCase() === name.toLowerCase());
    const isDuplicateSlug = allCategories.some(c => c.slug === slug || c.id === slug);

    if (isDuplicateName) {
      showNotification(`Thể loại "${name}" đã tồn tại!`, "warning");
      return;
    }
    if (isDuplicateSlug) {
      showNotification(`Mã slug "${slug}" đã được sử dụng!`, "warning");
      return;
    }
  }

  const categoryData = { name, slug };

  try {
    showLoading(true, "Đang lưu...");

    if (categoryId) {
      const { error } = await supabase.from('categories').update(categoryData).eq('id', categoryId);
      if (error) throw error;
      showNotification("Đã cập nhật thể loại!", "success");
    } else {
      const newId = slug;
      const { error } = await supabase.from('categories').insert({ id: newId, ...categoryData });
      if (error) throw error;
      showNotification("Đã thêm thể loại mới!", "success");
    }

    notifyDataChange("categories"); 

    closeModal("categoryModal");

    if (typeof loadCategories === "function") await loadCategories();
    renderAdminCategories();
    if (typeof populateFilters === 'function') populateFilters(); 
  } catch (error) {
    console.error("Lỗi lưu category Supabase:", error);
    showNotification("Lỗi: " + error.message, "error");
  } finally {
    showLoading(false);
  }
}

// 4. Xử lý Xóa
async function deleteCategory(categoryId) {
  if (!await customConfirm("Bạn có chắc muốn xóa thể loại này?", { title: "Xóa thể loại", type: "danger", confirmText: "Xóa" })) return;

  try {
    showLoading(true, "Đang xóa...");
    const { error } = await supabase.from('categories').delete().eq('id', categoryId);
    if (error) throw error;

    showNotification("Đã xóa thể loại!", "success");
    notifyDataChange("categories"); 

    if (typeof loadCategories === "function") await loadCategories();
    renderAdminCategories();
    if (typeof populateFilters === 'function') populateFilters();
  } catch (error) {
    console.error("Lỗi xóa category Supabase:", error);
    showNotification("Không thể xóa thể loại!", "error");
  } finally {
    showLoading(false);
  }
}

// ============================================
// ADMIN CRUD - COUNTRIES
// ============================================

// ==========================================
// LOGIC QUẢN LÝ QUỐC GIA (COUNTRY)
// ==========================================
/**
 * Hiển thị bảng Quốc gia (Admin) - CÓ NÚT SỬA/XÓA
 */
// Biến trạng thái: true = hiện tất cả, false = chỉ hiện 10 quốc gia đầu
let _showAllCountries = false;

function renderAdminCountries() {
  const tbody = document.getElementById("adminCountriesTable");
  const searchInput = document.getElementById("adminSearchCountry");
  if (!tbody) return;

  let countriesToRender = allCountries;

  // Đếm số phim cho từng quốc gia
  const movieCountByCountry = {};
  if (typeof allAdminMovies !== 'undefined' && allAdminMovies.length > 0) {
    allAdminMovies.forEach(m => {
      const cId = m.countryId || m.country_id || m.country || '';
      if (cId) {
        movieCountByCountry[cId] = (movieCountByCountry[cId] || 0) + 1;
      }
    });
  }

  // Lọc theo ô tìm kiếm
  if (searchInput) {
    const searchText = searchInput.value.toLowerCase().trim();
    if (searchText) {
      countriesToRender = allCountries.filter(c => {
        const info = (typeof getCountryInfo === 'function') ? getCountryInfo(c.name) : {};
        const codeStr = info.code ? info.code.toLowerCase() : '';
        return (c.name && c.name.toLowerCase().includes(searchText)) || 
               (c.id && c.id.toLowerCase().includes(searchText)) ||
               (codeStr && codeStr.includes(searchText));
      });
    }
  }

  if (countriesToRender.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center">Không tìm thấy quốc gia nào</td></tr>';
    _renderCountryToggleBtn(0, 0);
    return;
  }

  // Sắp xếp: nước có phim lên trước, sau đó theo tên
  const sorted = [...countriesToRender].sort((a, b) => {
    const ca = movieCountByCountry[a.id] || 0;
    const cb = movieCountByCountry[b.id] || 0;
    if (cb !== ca) return cb - ca;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Giới hạn 10 nếu không mở rộng và không đang tìm kiếm
  const isSearching = searchInput && searchInput.value.trim() !== '';
  const limit = (_showAllCountries || isSearching) ? sorted.length : Math.min(10, sorted.length);
  const displayed = sorted.slice(0, limit);

  // Vẽ từng dòng
  tbody.innerHTML = displayed
    .map((country, index) => {
      const countryInfo = getCountryInfo(country.name);
      const numMovies = movieCountByCountry[country.id] || 0;
      return `
            <tr>
                <td style="text-align: center;">${index + 1}</td>
                <td style="text-align: center;">${country.id}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                        <span class="country-badge-v2" style="background: ${countryInfo.bg}; color: ${countryInfo.color}; border-color: ${countryInfo.color}33;">
                            ${countryInfo.code ? `<img src="https://flagcdn.com/w40/${countryInfo.code}.png" class="flag-icon-img" alt="${country.name}">` : `<span class="flag-icon">${countryInfo.icon}</span>`}
                        </span>
                        <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${country.name}</strong>
                    </div>
                </td>
                <td style="text-align: center;"><span class="badge badge-primary">${countryInfo.code ? countryInfo.code.toUpperCase() : "N/A"}</span></td>
                <td style="text-align: center;">
                    <span class="badge" style="background: ${numMovies > 0 ? 'rgba(77, 184, 255, 0.15)' : 'rgba(255,255,255,0.05)'}; color: ${numMovies > 0 ? '#4db8ff' : '#888'}; font-weight: 600; padding: 4px 10px; border-radius: 6px;">
                        ${numMovies} phim
                    </span>
                </td>
                <td style="text-align: center;">
                    <button class="btn btn-sm btn-primary" onclick="editCountry('${country.id}')" title="Sửa">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCountry('${country.id}')" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    })
    .join("");

  // Render nút toggle Xem tất cả / Thu gọn
  _renderCountryToggleBtn(sorted.length, limit);

  // Tự động render biểu đồ thống kê khi load bảng quốc gia
  if (typeof populateCountryStatsDropdown === 'function') populateCountryStatsDropdown();
  if (typeof renderCountryStatsChart === 'function') {
    const sel = document.getElementById('countryStatsSelect');
    renderCountryStatsChart(sel ? sel.value : '', _countryStatsPeriod || 'all');
  }
}

/**
 * Render nút "Xem tất cả / Thu gọn" bên dưới bảng quốc gia
 */
function _renderCountryToggleBtn(total, shown) {
  // Tìm hoặc tạo container cho nút toggle
  let btnContainer = document.getElementById('countryToggleBtnWrapper');
  if (!btnContainer) {
    const table = document.getElementById('adminCountriesTable');
    if (!table) return;
    // Tìm phần tử cha của table và thêm vào sau
    const parentTable = table.closest('table') || table.parentElement;
    btnContainer = document.createElement('div');
    btnContainer.id = 'countryToggleBtnWrapper';
    btnContainer.style.cssText = 'text-align: center; padding: 12px 0 4px;';
    parentTable.insertAdjacentElement('afterend', btnContainer);
  }

  if (total <= 10) {
    // Không cần nút nếu tổng ≤ 10
    btnContainer.innerHTML = '';
    return;
  }

  const remaining = total - shown;
  btnContainer.innerHTML = _showAllCountries
    ? `<button onclick="_toggleAllCountries()" class="btn btn-sm" style="background: rgba(255,255,255,0.07); color: #aaa; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px 18px; cursor: pointer; font-size: 0.85rem;">
          <i class="fas fa-chevron-up" style="margin-right:6px;"></i>Thu gọn (hiện 10)
       </button>`
    : `<button onclick="_toggleAllCountries()" class="btn btn-sm" style="background: rgba(77,184,255,0.1); color: #4db8ff; border: 1px solid rgba(77,184,255,0.25); border-radius: 6px; padding: 6px 18px; cursor: pointer; font-size: 0.85rem;">
          <i class="fas fa-chevron-down" style="margin-right:6px;"></i>Xem tất cả (còn ${remaining} quốc gia)
       </button>`;
}

/**
 * Toggle trạng thái hiển thị tất cả / thu gọn
 */
window._toggleAllCountries = function() {
  _showAllCountries = !_showAllCountries;
  renderAdminCountries();
};




/* ============================================
   BIỂU ĐỒ THỐNG KÊ QUỐC GIA - TOP 10 PHIM
   ============================================ */

// Biến lưu trạng thái chart hiện tại
let _countryStatsChart = null;
let _countryStatsPeriod = 'all';

/**
 * Populate dropdown chọn quốc gia trong biểu đồ
 */
function populateCountryStatsDropdown() {
  const select = document.getElementById('countryStatsSelect');
  if (!select || !allCountries) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">🌐 Tất cả quốc gia</option>' +
    allCountries.map(c => {
      const info = (typeof getCountryInfo === 'function') ? getCountryInfo(c.name) : {};
      return `<option value="${c.id}">${c.name}</option>`;
    }).join('');
  
  if (currentVal) select.value = currentVal;
}

/**
 * Xử lý khi chọn quốc gia trong dropdown
 */
window.onCountryStatsSelectChange = function() {
  const select = document.getElementById('countryStatsSelect');
  const countryId = select ? select.value : '';
  renderCountryStatsChart(countryId, _countryStatsPeriod);
};

/**
 * Xử lý khi click tab lọc thời gian (Tất cả / Ngày / Tuần / Tháng)
 */
window.changeCountryStatsPeriod = function(period) {
  _countryStatsPeriod = period;

  // Cập nhật active tab
  document.querySelectorAll('.chart-period-tabs .chart-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });

  const select = document.getElementById('countryStatsSelect');
  const countryId = select ? select.value : '';
  renderCountryStatsChart(countryId, period);
};

/**
 * Render biểu đồ Top 10 phim xem nhiều nhất theo quốc gia + thời gian
 * @param {string} countryId - ID quốc gia (rỗng = tất cả)
 * @param {string} period - 'all' | 'day' | 'week' | 'month'
 */
async function renderCountryStatsChart(countryId, period) {
  const ctx = document.getElementById('countryStatsChart');
  const emptyEl = document.getElementById('countryChartEmpty');
  if (!ctx || !supabase) return;

  try {
    // Tính mốc thời gian lọc
    let fromDate = null;
    const now = new Date();
    if (period === 'day') {
      fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      fromDate = d.toISOString();
    } else if (period === 'month') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      fromDate = d.toISOString();
    }

    // Query view_logs từ Supabase
    let query = supabase.from('view_logs').select('movie_id');

    if (countryId) {
      query = query.eq('country_id', countryId);
    }
    if (fromDate) {
      query = query.gte('viewed_at', fromDate);
    }

    const { data: logs, error } = await query.limit(5000);
    if (error) throw error;

    // Đếm lượt xem theo movie_id
    const viewCounts = {};
    (logs || []).forEach(log => {
      viewCounts[log.movie_id] = (viewCounts[log.movie_id] || 0) + 1;
    });

    // Sắp xếp và lấy Top 10
    const sorted = Object.entries(viewCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Nếu không có dữ liệu view_logs, fallback sang allAdminMovies
    if (sorted.length === 0 && period === 'all') {
      // Dùng dữ liệu views từ allAdminMovies làm fallback
      let moviesPool = (typeof allAdminMovies !== 'undefined' && allAdminMovies.length > 0) 
        ? allAdminMovies : (allMovies || []);
      
      if (countryId) {
        moviesPool = moviesPool.filter(m => 
          (m.countryId || m.country_id || m.country) === countryId
        );
      }

      const fallback = moviesPool
        .filter(m => (m.views || 0) > 0)
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 10);

      if (fallback.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        ctx.style.display = 'none';
        if (_countryStatsChart) { _countryStatsChart.destroy(); _countryStatsChart = null; }
        return;
      }

      const labels = fallback.map(m => truncateText(m.title || 'N/A', 25));
      const data = fallback.map(m => m.views || 0);
      drawCountryChart(ctx, emptyEl, labels, data);
      return;
    }

    if (sorted.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      ctx.style.display = 'none';
      if (_countryStatsChart) { _countryStatsChart.destroy(); _countryStatsChart = null; }
      return;
    }

    // Map movie_id sang tên phim
    const allMoviesRef = (typeof allAdminMovies !== 'undefined' && allAdminMovies.length > 0) 
      ? allAdminMovies : (allMovies || []);

    const labels = sorted.map(([movieId]) => {
      const movie = allMoviesRef.find(m => m.id === movieId);
      return truncateText(movie ? movie.title : movieId, 25);
    });
    const data = sorted.map(([, count]) => count);

    drawCountryChart(ctx, emptyEl, labels, data);

  } catch (err) {
    console.error('Lỗi render biểu đồ quốc gia:', err);
  }
}

/**
 * Vẽ Chart.js Horizontal Bar
 */
function drawCountryChart(ctx, emptyEl, labels, data) {
  if (emptyEl) emptyEl.style.display = 'none';
  ctx.style.display = 'block';

  if (_countryStatsChart) _countryStatsChart.destroy();

  // Gradient màu cho mỗi bar
  const colors = [
    '#4db8ff', '#ff6b6b', '#ffd700', '#51cf66', '#da77f2',
    '#ff922b', '#20c997', '#748ffc', '#f06595', '#adb5bd'
  ];

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#ccc' : '#555';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';

  _countryStatsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Lượt xem',
        data: data,
        backgroundColor: colors.slice(0, data.length),
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 22,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
          titleColor: isDark ? '#fff' : '#333',
          bodyColor: isDark ? '#ddd' : '#555',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          callbacks: {
            label: (ctx) => `${ctx.parsed.x.toLocaleString()} lượt xem`
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 11 } }
        },
        y: {
          grid: { display: false },
          ticks: { color: textColor, font: { size: 11, weight: 500 } }
        }
      }
    }
  });
}

/**
 * Helper: Cắt ngắn text
 */
function truncateText(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}


function renderAdminMoviesList(movies) {
  const tbody = document.getElementById("adminMoviesTable");
  if (!tbody) return;

  // --- LOGIC PHÂN TRANG ---
  const totalItems = movies.length;
  const totalPages = Math.ceil(totalItems / adminPerPage);
  
  if (currentAdminMoviePage > totalPages && totalPages > 0) currentAdminMoviePage = totalPages;
  if (currentAdminMoviePage < 1) currentAdminMoviePage = 1;

  const startIndex = (currentAdminMoviePage - 1) * adminPerPage;
  const paginatedMovies = movies.slice(startIndex, startIndex + adminPerPage);

  if (totalItems === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center">Không tìm thấy phim nào.</td></tr>';
    const paginationContainer = document.getElementById("adminMoviePagination");
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  tbody.innerHTML = paginatedMovies
    .map((movie) => {
      // Resolve country ID sang tên quốc gia
      let countryDisplayName = movie.country || "";
      if (countryDisplayName && typeof allCountries !== 'undefined' && allCountries.length > 0) {
          const foundCountry = allCountries.find(c => c.id === countryDisplayName || c.name === countryDisplayName);
          if (foundCountry) countryDisplayName = foundCountry.name;
      }
      const countryInfo = getCountryInfo(countryDisplayName);
      
      // Tính toán số tập cho cột Tình trạng (dữ liệu thật từ DB)
      const currentEps = movie._episodeCount || (movie.episodes ? movie.episodes.length : 0);
      const totalEps = movie.totalEpisodes || movie.total_episodes || null;
      let episodeStatus = "";
      
      if (currentEps === 0) {
        // Phim chưa có tập nào → cảnh báo đỏ
        episodeStatus = '<span style="color: #e74c3c; font-weight: 600; font-size: 0.85rem;"><i class="fas fa-exclamation-triangle" style="margin-right: 4px;"></i>Chưa có tập</span>';
      } else if (movie.type === "series") {
        if (totalEps && currentEps >= parseInt(totalEps)) {
          // Phim bộ đã hoàn tất
          episodeStatus = `<span style="color: #2ecc71; font-weight: 600;">${currentEps}/${totalEps} tập ✓</span>`;
        } else {
          // Phim bộ đang chiếu
          episodeStatus = `<span style="color: #f1c40f; font-weight: 600;">${currentEps}/${totalEps || '??'} tập</span>`;
        }
      } else {
        // Phim lẻ: hiển thị số tập thực tế (thường là 1)
        episodeStatus = `<span style="color: #2ecc71; font-weight: 600;">${currentEps} tập ✓</span>`;
      }

      const typeBadge =
        movie.type === "series"
          ? '<span class="movie-type-badge series" style="background: #9b59b6; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Phim Bộ</span>'
          : '<span class="movie-type-badge single" style="background: #7f8c8d; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Phim Lẻ</span>';

      const statusBadge =
        movie.status === "public"
          ? '<span class="status-badge public">Công khai</span>'
          : movie.status === "hidden"
          ? '<span class="status-badge hidden">Đã ẩn</span>'
          : '<span class="status-badge pending">Chờ duyệt</span>';

      // Resolve category IDs sang tên thể loại
      let genres = "N/A";
      const movieCats = movie.categories || (movie.category_id ? [movie.category_id] : (movie.category ? [movie.category] : []));
      
      if (Array.isArray(movieCats) && movieCats.length > 0) {
          if (typeof allCategories !== 'undefined' && allCategories.length > 0) {
              genres = movieCats.slice(0, 3).map(catId => {
                  const found = allCategories.find(c => c.id === catId || c.name === catId);
                  return found ? found.name : catId;
              }).join(", ");
          } else {
              genres = movieCats.slice(0, 3).join(", ");
          }
      }
      const poster = movie.posterUrl || movie.poster_url || movie.poster || 'https://placehold.co/50x75/2a2a3a/FFFFFF?text=NO';

      return `
        <tr>
          <td><img src="${poster}" class="admin-table-poster" style="width: 50px; height: 75px; object-fit: cover; border-radius: 4px;" onerror="this.onerror=null; this.src='https://placehold.co/50x75/2a2a3a/FFFFFF?text=NO'"></td>
          <td>
            <div style="display: flex; flex-direction: column; max-width: 220px;">
                <strong style="font-size: 1.05rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${movie.title}">${movie.title}</strong>
                <small class="text-muted" style="font-size: 0.85rem; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${movie.originTitle || movie.origin_title || movie.originalTitle || ""}</small>
                <small class="text-muted" style="font-size: 0.75rem; opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${movie.id}">ID: ${movie.id}</small>
            </div>
          </td>
          <td>
            <div class="country-column">
                <span class="country-badge-v2" style="background: ${countryInfo.bg}; color: ${countryInfo.color}; border-color: ${countryInfo.color}33;">
                    ${countryInfo.code ? `<img src="https://flagcdn.com/w40/${countryInfo.code}.png" class="flag-icon-img" alt="${countryDisplayName}">` : `<span class="flag-icon">${countryInfo.icon}</span>`}
                    <span class="country-name">${countryDisplayName || "N/A"}</span>
                </span>
            </div>
          </td>
          <td>${typeBadge}</td>
          <td><div style="max-width: 150px; white-space: normal; line-height: 1.4;"><small class="genres-text">${genres}</small></div></td>
          <td style="text-align: center;">${episodeStatus}</td>
          <td>${movie.price ? `<span class="text-accent" style="color: #4db8ff; font-weight: 600;">${movie.price} CRO</span>` : '<span class="status-badge free">Miễn phí</span>'}</td>
          <td style="text-align: center;"><i class="fas fa-eye text-muted"></i> ${formatNumber(movie.views || 0)}</td>
          <td>${statusBadge}</td>
          <td style="text-align: center; white-space: nowrap;">
            ${(() => {
              // Hiển thị thời gian phim được upload lên (ngày/tháng/năm + giờ:phút:giây)
              const rawDate = movie.created_at || movie.createdAt;
              if (!rawDate) return '<span class="text-muted" style="font-size: 0.8rem;">N/A</span>';
              const d = new Date(rawDate);
              if (isNaN(d.getTime())) return '<span class="text-muted" style="font-size: 0.8rem;">N/A</span>';
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const year = d.getFullYear();
              const hours = String(d.getHours()).padStart(2, '0');
              const mins = String(d.getMinutes()).padStart(2, '0');
              const secs = String(d.getSeconds()).padStart(2, '0');
              return `<div style="font-size: 0.82rem; line-height: 1.5;">`
                + `<div style="font-weight: 600; color: var(--text-primary, #ddd);">${day}/${month}/${year}</div>`
                + `<div style="color: var(--text-muted, #888); font-size: 0.75rem;"><i class="fas fa-clock" style="margin-right: 3px; font-size: 0.7rem;"></i>${hours}:${mins}:${secs}</div>`
                + `</div>`;
            })()}
          </td>
          <td>
            <div class="admin-actions" style="display: flex; flex-direction: column; gap: 5px;">
              <button class="btn btn-sm btn-secondary" onclick="editMovie('${movie.id}')" title="Sửa" style="background: #34495e; border: none; padding: 6px;">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-sm btn-danger" onclick="deleteMovie('${movie.id}')" title="Xóa" style="background: #e74c3c; border: none; padding: 6px;">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    // Render nút phân trang
    if (typeof renderAdminPagination === 'function') {
        renderAdminPagination("adminMoviePagination", totalItems, currentAdminMoviePage, adminPerPage, "changeAdminMoviePage", "phim");
    }
}

/**
 * Chuyển trang Phim
 */
window.changeAdminMoviePage = function(page) {
    currentAdminMoviePage = page;
    // Lưu trang vào sessionStorage để khôi phục khi quay lại
    try { sessionStorage.setItem('adminMoviePage', page); } catch(e) {}
    filterAdminMovies(true); // true = không reset trang về 1, giữ nguyên trang đã chọn
    const panel = document.getElementById("moviesPanel");
    if (panel) panel.scrollIntoView({ behavior: 'smooth' });
};

function openCountryModal(countryId = null) {
  const modalTitle = document.getElementById("countryModalTitle");
  const idInput = document.getElementById("countryId");
  const nameInput = document.getElementById("countryName");
  const codeInput = document.getElementById("countryCode");

  document.getElementById("countryForm").reset();

  if (countryId) {
    const country = allCountries.find((c) => c.id === countryId);
    if (country) {
      modalTitle.textContent = "Cập nhật Quốc Gia";
      idInput.value = country.id;
      nameInput.value = country.name;
      codeInput.value = country.code || country.id.toUpperCase();
      codeInput.disabled = true; // Không cho sửa mã khi cập nhật
    }
  } else {
    modalTitle.textContent = "Thêm Quốc Gia Mới";
    idInput.value = "";
    codeInput.disabled = false;
    
    // Tự động gợi ý mã khi nhập tên (chỉ khi thêm mới) - Dùng debounce để mượt hơn
    nameInput.oninput = debounce(function() {
        if (!idInput.value) { // Chỉ tự động khi đang thêm mới
            const name = this.value;
            // Lấy thông tin từ bộ quy tắc getCountryInfo nếu có
            const info = getCountryInfo(name);
            if (info.code && info.code !== 'un') {
                codeInput.value = info.code.toUpperCase();
            } else if (name.length >= 2) {
                // Nếu không có trong bộ quy tắc, lấy 2 chữ cái đầu của các từ
                const words = name.split(' ');
                let suggested = '';
                if (words.length >= 2) {
                    suggested = (words[0][0] + words[1][0]).toUpperCase();
                } else {
                    suggested = name.substring(0, 2).toUpperCase();
                }
                codeInput.value = suggested;
            }
        }
    }, 300);
  }

  openModal("countryModal");
}

function editCountry(countryId) {
  openCountryModal(countryId);
}

async function handleCountrySubmit(event) {
  event.preventDefault();

  const countryId = document.getElementById("countryId").value;
  const name = document.getElementById("countryName").value.trim();
  let code = document.getElementById("countryCode").value.toUpperCase().trim();

  // Nếu code trống, cố gắng lấy từ name
  if (!code && name) {
      const info = getCountryInfo(name);
      code = info.code && info.code !== 'un' ? info.code.toUpperCase() : name.substring(0, 2).toUpperCase();
  }

  if (!code) {
      showNotification("Vui lòng nhập mã quốc gia!", "warning");
      return;
  }

  // Chống trùng lặp (chỉ kiểm tra khi thêm mới)
  if (!countryId) {
      const isDuplicateName = allCountries.some(c => c.name.toLowerCase() === name.toLowerCase());
      const isDuplicateCode = allCountries.some(c => (c.code || '').toUpperCase() === code || c.id.toUpperCase() === code);
      
      if (isDuplicateName) {
          showNotification(`Quốc gia "${name}" đã tồn tại!`, "warning");
          return;
      }
      if (isDuplicateCode) {
          showNotification(`Mã quốc gia "${code}" đã được sử dụng!`, "warning");
          return;
      }
  }

  const countryData = { name, slug: code.toLowerCase() };

  try {
    showLoading(true, "Đang lưu...");

    if (countryId) {
      const { error } = await supabase.from('countries').update(countryData).eq('id', countryId);
      if (error) throw error;
    } else {
      const newId = code.toLowerCase(); 
      const { error } = await supabase.from('countries').insert({ id: newId, ...countryData });
      if (error) throw error;
    }

    showNotification("Đã lưu quốc gia!", "success");
    notifyDataChange("countries"); 
    closeModal("countryModal");

    if (typeof loadCountries === "function") await loadCountries();
    renderAdminCountries();
    if (typeof populateFilters === 'function') populateFilters();
    if (typeof populateAdminMovieFilters === 'function') populateAdminMovieFilters(); 
  } catch (error) {
    console.error("Lỗi lưu country Supabase:", error);
    showNotification("Lỗi: " + error.message, "error");
  } finally {
    showLoading(false);
  }
}

async function deleteCountry(countryId) {
  if (!await customConfirm("Bạn có chắc muốn xóa quốc gia này?", { title: "Xóa quốc gia", type: "danger", confirmText: "Xóa" })) return;

  try {
    showLoading(true, "Đang xóa...");
    const { error } = await supabase.from('countries').delete().eq('id', countryId);
    if (error) throw error;

    showNotification("Đã xóa quốc gia!", "success");
    notifyDataChange("countries"); 
    if (typeof loadCountries === "function") await loadCountries();
    renderAdminCountries();
    if (typeof populateFilters === 'function') populateFilters();
  } catch (error) {
    console.error("Lỗi xóa country Supabase:", error);
    showNotification("Lỗi xóa!", "error");
  } finally {
    showLoading(false);
  }
}

// ============================================
// ADMIN CRUD - ACTORS (DIỄN VIÊN)
// ============================================

/**
 * Hiển thị bảng Diễn Viên (Admin)
 */
function renderAdminActors() {
  const tbody = document.getElementById("adminActorsTable");
  const searchInput = document.getElementById("adminSearchActor");
  if (!tbody) return;

  let actorsToRender = allActors || [];

  if (searchInput) {
    const searchText = searchInput.value.toLowerCase().trim();
    if (searchText) {
      actorsToRender = actorsToRender.filter(a => 
        (a.name && a.name.toLowerCase().includes(searchText)) || 
        (a.id && a.id.toLowerCase().includes(searchText))
      );
    }
  }

  // Sắp xếp diễn viên
  const sortSelect = document.getElementById("adminSortActor");
  if (sortSelect) {
    const sortVal = sortSelect.value;
    actorsToRender.sort((a, b) => {
      if (sortVal === "az") return (a.name || "").localeCompare(b.name || "");
      if (sortVal === "za") return (b.name || "").localeCompare(a.name || "");
      
      // Sắp xếp theo thời gian (createdAt)
      const timeA = a.createdAt ? (a.createdAt.seconds || new Date(a.createdAt).getTime() / 1000 || 0) : 0;
      const timeB = b.createdAt ? (b.createdAt.seconds || new Date(b.createdAt).getTime() / 1000 || 0) : 0;
      
      if (sortVal === "newest") return timeB - timeA;
      if (sortVal === "oldest") return timeA - timeB;
      
      return 0;
    });
  }

  // --- LOGIC PHÂN TRANG ---
  const totalItems = actorsToRender.length;
  const totalPages = Math.ceil(totalItems / actorsPerPage);
  
  // Đảm bảo currentActorPage hợp lệ
  if (currentActorPage > totalPages && totalPages > 0) currentActorPage = totalPages;
  if (currentActorPage < 1) currentActorPage = 1;

  const startIndex = (currentActorPage - 1) * actorsPerPage;
  const paginatedActors = actorsToRender.slice(startIndex, startIndex + actorsPerPage);

  if (totalItems === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">Không tìm thấy diễn viên nào.</td></tr>';
    const paginationContainer = document.getElementById("adminActorPagination");
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  // Render bảng
  tbody.innerHTML = paginatedActors
    .map((actor, index) => {
      const avatarUrl = actor.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(actor.name)}&background=random&color=fff&size=100`;
      const isSelected = selectedActorIds.includes(actor.id);
      
      return `
            <tr>
                <td>
                  <input type="checkbox" class="actor-checkbox" value="${actor.id}" 
                    ${isSelected ? 'checked' : ''} 
                    onchange="toggleActorSelection('${actor.id}', this.checked)" />
                </td>
                <td>${startIndex + index + 1}</td>
                <td>
                  <img src="${avatarUrl}" alt="${actor.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                </td>
                <td>
                  <strong>${actor.name}</strong>
                  ${(window.latestAutoActorIds || []).includes(actor.id) 
                    ? '<span class="badge-new" style="background: var(--warning-color, #ffc107); color: #000;">Mới (Từ Phim)</span>' 
                    : (window.latestAddedActorIds || []).includes(actor.id) ? '<span class="badge-new">NEW</span>' : ''}
                  <br><small class="text-muted">ID: ${actor.id}</small>
                </td>
                <td><span style="font-size: 0.75rem; padding: 3px 6px; border-radius: 4px; font-weight: bold; background: ${actor.role === 'director' ? '#9c27b0' : '#4dabf7'}; color: #fff;">${actor.role === 'director' ? 'Đạo diễn' : 'Diễn viên'}</span></td>
                <td>${actor.gender || "Không rõ"}</td>
                <td>${actor.dob ? new Date(actor.dob).toLocaleDateString('vi-VN') : "Không rõ"}</td>
                <td>
                  <div class="country-column">
                      <span class="country-badge-v2" style="background: ${getCountryInfo(actor.country).bg}; color: ${getCountryInfo(actor.country).color}; border-color: ${getCountryInfo(actor.country).color}33;">
                          ${getCountryInfo(actor.country).code ? `<img src="https://flagcdn.com/w40/${getCountryInfo(actor.country).code}.png" class="flag-icon-img" alt="${actor.country}">` : `<span class="flag-icon">${getCountryInfo(actor.country).icon}</span>`}
                          <span class="country-name">${actor.country || "Không rõ"}</span>
                      </span>
                  </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editActor('${actor.id}')" title="Sửa">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteActor('${actor.id}')" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    })
    .join("");

  // Kiểm tra trạng thái "Chọn tất cả" của trang hiện tại
  const allCurrentSelected = paginatedActors.length > 0 && paginatedActors.every(a => selectedActorIds.includes(a.id));
  const selectAllCb = document.getElementById("selectAllActors");
  if (selectAllCb) selectAllCb.checked = allCurrentSelected;

  // Cập nhật thanh bulk actions
  updateBulkActionsBar();

  // Render nút phân trang
  renderAdminPagination("adminActorPagination", totalItems, currentActorPage, actorsPerPage, "changeActorPage", "diễn viên");
}

/**
 * Hàm phân trang dùng chung cho toàn hệ thống Admin
 * @param {string} containerId - ID của div chứa phân trang
 * @param {number} totalItems - Tổng số mục
 * @param {number} currentPage - Trang hiện tại
 * @param {number} perPage - Số mục mỗi trang
 * @param {string} changePageFuncName - Tên hàm xử lý chuyển trang (dạng chuỗi để gọi qua window)
 * @param {string} unitName - Tên đơn vị hiển thị (VD: "phim", "người dùng")
 */
function renderAdminPagination(containerId, totalItems, currentPage, perPage, changePageFuncName, unitName = "mục") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.ceil(totalItems / perPage);
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  const startItem = (currentPage - 1) * perPage + 1;
  const endItem = Math.min(totalItems, currentPage * perPage);

  let html = `
    <div class="pagination-info">
      Hiển thị ${startItem}-${endItem} / ${totalItems} ${unitName}
    </div>
    <div class="pagination-controls">
      <button class="btn-page btn-page-nav" onclick="window.${changePageFuncName}(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left"></i> <span>Trước</span>
      </button>
  `;

  // Hiển thị tối đa 5 nút số trang quanh trang hiện tại
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

  for (let i = startPage; i <= endPage; i++) {
    html += `
      <button class="btn-page ${i === currentPage ? 'active' : ''}" onclick="window.${changePageFuncName}(${i})">
        ${i}
      </button>
    `;
  }

  html += `
      <button class="btn-page btn-page-nav" onclick="window.${changePageFuncName}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        <span>Sau</span> <i class="fas fa-chevron-right"></i>
      </button>
    </div>
    <div class="pagination-jump">
      <span>Trang ${currentPage} / ${totalPages}</span>
      <input type="number" class="jump-input" min="1" max="${totalPages}" value="${currentPage}" 
        placeholder="Số trang"
        onkeydown="if(event.key==='Enter') { 
          const val = parseInt(this.value); 
          if(val >= 1 && val <= ${totalPages}) window.${changePageFuncName}(val);
          else showNotification('Số trang không hợp lệ (1-${totalPages})', 'warning');
        }">
      <button class="btn-jump" onclick="const val = parseInt(this.previousElementSibling.value); if(val >= 1 && val <= ${totalPages}) window.${changePageFuncName}(val); else showNotification('Số trang không hợp lệ (1-${totalPages})', 'warning');">Vào</button>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Chuyển sang trang diễn viên cụ thể
 */
window.changeActorPage = function(page) {
  currentActorPage = page;
  renderAdminActors();
  // Cuộn lên đầu bảng để dễ nhìn
  const actorsPanel = document.getElementById("actorsPanel");
  if (actorsPanel) actorsPanel.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Mở modal Thêm/Sửa Diễn Viên
 */
function openActorModal(actorId = null) {
  const modalTitle = document.getElementById("actorModalTitle");
  const idInput = document.getElementById("actorId");
  const nameInput = document.getElementById("actorName");
  const avatarInput = document.getElementById("actorAvatar");
  const roleInput = document.getElementById("actorRole");
  const genderInput = document.getElementById("actorGender");
  const dobInput = document.getElementById("actorDob");
  const bioInput = document.getElementById("actorBio");

  document.getElementById("actorForm").reset();
  if (typeof updateActorPreview === 'function') updateActorPreview();

  if (actorId) {
    const actor = allActors.find((a) => a.id === actorId);
    if (actor) {
      modalTitle.textContent = "Cập nhật Thông tin";
      idInput.value = actor.id;
      nameInput.value = actor.name || "";
      avatarInput.value = actor.avatar || "";
      roleInput.value = actor.role || "actor";
      genderInput.value = actor.gender || "";
      dobInput.value = actor.dob || "";
      document.getElementById("actorCountry").value = actor.country || "";
      bioInput.value = actor.bio || "";
      document.getElementById("actorAltNames").value = (actor.altNames || []).join(", ");
      if (typeof updateActorPreview === 'function') updateActorPreview();
    }
  } else {
    modalTitle.textContent = "Thêm Mới Người Năng Khiếu";
    idInput.value = "";
    roleInput.value = "actor";
  }

  window.pendingUploads = {};
  openModal("actorModal");
}

function editActor(actorId) {
  openActorModal(actorId);
}

/**
 * Tạo ID thân thiện từ tên (Tương tự slug)
 */
function createActorIdFromName(name) {
  return name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/([^0-9a-z-\s])/g, '')
    .replace(/(\s+)/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Cập nhật ảnh Preview khi gõ tên hoặc dán link ảnh
 */
window.updateActorPreview = function() {
  const nameInput = document.getElementById("actorName");
  const avatarInput = document.getElementById("actorAvatar");
  const previewImg = document.getElementById("actorAvatarPreview");
  
  if (!previewImg) return;

  const defaultName = nameInput && nameInput.value.trim() ? encodeURIComponent(nameInput.value.trim()) : "Actor";
  const defaultAvatar = `https://ui-avatars.com/api/?name=${defaultName}&background=random&color=fff&size=120`;
  
  const customAvatar = avatarInput && avatarInput.value.trim() ? avatarInput.value.trim() : "";
  
  previewImg.src = customAvatar || defaultAvatar;
}

/**
 * Bật/tắt khung Import diễn viên từ API
 */
window.toggleActorApiImport = function() {
    const oBox = document.getElementById("actorApiImportBox");
    const rBox = document.getElementById("rapActorApiImportBox");
    const display = (oBox && oBox.style.display === "none") ? "block" : "none";
    
    if (oBox) oBox.style.display = display;
    if (rBox) rBox.style.display = display;
}

/**
 * Quét và import diễn viên từ OPhim peoples API
 */
window.fetchActorsFromAPI = async function() {
    const slugInput = document.getElementById("actorApiSlugInput");
    const resultsDiv = document.getElementById("actorApiImportResults");
    let slug = (slugInput ? slugInput.value.trim() : "");
    
    if (!slug) {
        showNotification("Vui lòng nhập slug phim!", "error");
        return;
    }
    
    // Hỗ trợ dán cả URL đầy đủ, tự bóc slug
    const urlMatch = slug.match(/phim\/([^\/\?]+)/);
    if (urlMatch) slug = urlMatch[1];
    
    const API_URL = `https://ophim1.com/v1/api/phim/${slug}/peoples`;
    
    try {
        showLoading(true, "Đang quét danh sách diễn viên & đạo diễn từ OPhim...");
        
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`Mã lỗi: ${response.status}`);
        
        const result = await response.json();
        if (!result.success || !result.data || !result.data.peoples) {
            throw new Error("API không trả về dữ liệu diễn viên!");
        }
        
        const peoples = result.data.peoples;
        const profileSizes = result.data.profile_sizes || {};
        const imgBase = profileSizes.w185 || "https://image.tmdb.org/t/p/w185";
        
        let imported = 0;
        let skipped = 0;
        let updatesAvailable = [];
        let importedNames = [];
        let newActorIds = []; // Mảng tạm lưu ID mới của đợt này
        
        for (const person of peoples) {
            // Chỉ lấy Acting và Directing
            if (person.known_for_department !== "Acting" && person.known_for_department !== "Directing") continue;
            
            // Tên chính: ưu tiên tên tiếng Anh trong also_known_as, nếu không thì dùng name
            const allNames = person.also_known_as || [];
            const englishName = allNames.find(n => /^[A-Za-z\s\-\.]+$/.test(n.trim()));
            const displayName = englishName ? englishName.trim() : person.name.trim();
            
            // Chuẩn bị dữ liệu từ API để so sánh
            const avatarUrl = person.profile_path ? `${imgBase}${person.profile_path}` : "";
            const gender = person.gender_name === "Male" ? "Nam" : (person.gender_name === "Female" ? "Nữ" : "");
            const altNamesSet = new Set(allNames.map(n => n.trim()).filter(n => n));
            altNamesSet.add(person.name.trim());
            altNamesSet.delete(displayName);

            const incomingData = {
                name: displayName,
                avatar: avatarUrl,
                gender: gender,
                altNames: Array.from(altNamesSet),
                bio: "", 
                dob: "",
                country: ""
            };

            // Kiểm tra trùng lặp
            const allSearchNames = [person.name.trim(), ...allNames.map(n => n.trim())].map(n => n.toLowerCase());
            const existingActor = (allActors || []).find(a => {
                if (allSearchNames.includes(a.name.toLowerCase())) return true;
                if (a.altNames && a.altNames.some(alt => allSearchNames.includes(alt.toLowerCase()))) return true;
                return false;
            });
            
            if (existingActor) {
                // KIỂM TRA XEM CÓ CẢI THIỆN DỮ LIỆU KHÔNG
                const improvements = checkActorDataImprovement(existingActor, incomingData);
                if (improvements) {
                    updatesAvailable.push({ current: existingActor, incoming: incomingData, improvements });
                } else {
                    skipped++;
                }
                continue;
            }
            
            // Tạo ID và lưu mới
            const baseId = createActorIdFromName(displayName);
            const newId = `${baseId}-${Date.now().toString().slice(-4)}`;
            const role = person.known_for_department === "Directing" ? "director" : "actor";
            
            const actorData = {
                id: newId,
                name: displayName,
                avatar: avatarUrl,
                gender: gender,
                alt_names: Array.from(altNamesSet).join(", "),
                bio: "", 
                dob: null,
                country: "",
                role: role,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            const { error: insertError } = await supabase.from('actors').insert(actorData);
            if (insertError) throw insertError;

            imported++;
            importedNames.push(displayName);
            // Fix sorting: Dùng Date thực tế cho local copy
            const localActor = { ...actorData };
            allActors.push(localActor); 
            newActorIds.push(newId); // Lưu ID mới
        }
        
        // Cập nhật danh sách ID mới nhất toàn cục
        if (newActorIds.length > 0) {
            window.setLatestActorIds(newActorIds, false); // Nạp từ API OPhim: reset batch mới
            const sortSelect = document.getElementById("adminSortActor");
            if (sortSelect) sortSelect.value = "newest";
        }
        
        // Reload lại kho diễn viên
        await loadActors();
        renderAdminActors();
        
        // Hiển thị kết quả
        let resultHtml = `
            <div style="background: var(--bg-tertiary); border-radius: 8px; padding: 12px; font-size: 0.9rem; border: 1px solid rgba(77,171,247,0.3);">
                <div style="color: #51cf66; font-weight: 600; margin-bottom: 5px;">✅ Đã thêm mới: ${imported}</div>
                ${imported > 0 ? `<div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 10px;">(${importedNames.join(", ")})</div>` : ""}
                <div style="color: #aaa; margin-bottom: ${updatesAvailable.length > 0 ? '10px' : '0'};">⏭️ Đã bỏ qua (đã đầy đủ): ${skipped}</div>
                ${updatesAvailable.length > 0 ? `
                    <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; margin-top: 5px;">
                        <div style="color: var(--accent-secondary); font-weight: 600; margin-bottom: 8px;">✨ Có ${updatesAvailable.length} diễn viên có thể bổ sung thông tin!</div>
                        <button class="btn btn-primary btn-sm" onclick='showImportComparison(${JSON.stringify(updatesAvailable).replace(/'/g, "&apos;")})' style="width: 100%; font-size: 0.8rem; padding: 6px;">
                            Xem & Duyệt bổ sung ngay
                        </button>
                    </div>
                ` : ""}
            </div>
        `;
        
        if (resultsDiv) resultsDiv.innerHTML = resultHtml;
        showNotification(`Đã quét xong! Thêm mới: ${imported}, Chờ duyệt bổ sung: ${updatesAvailable.length}`, "success");
        
    } catch (err) {
        console.error("Lỗi fetch actors:", err);
        showNotification("Lỗi khi quét API: " + err.message, "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Lưu thông tin diễn viên (Submit form)
 */
async function handleActorSubmit(event) {
  event.preventDefault();

  if (typeof window.uploadPendingImages === "function") {
      const uploadSuccess = await window.uploadPendingImages();
      if (!uploadSuccess) return; 
  }

  const idInput = document.getElementById("actorId").value;
  const name = document.getElementById("actorName").value.trim();
  const avatar = document.getElementById("actorAvatar").value.trim();
  const role = document.getElementById("actorRole").value;
  const gender = document.getElementById("actorGender").value;
  const dob = document.getElementById("actorDob").value;
  const bio = document.getElementById("actorBio").value.trim();

  if (!name) {
    showNotification("Vui lòng nhập tên!", "warning");
    return;
  }

  if (!idInput) {
    const duplicate = (allActors || []).find(a => a.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
        showNotification(`Diễn viên "${name}" đã tồn tại! Hệ thống đã chuyển sang chế độ chỉnh sửa.`, "warning");
        if (typeof selectDuplicateActor === 'function') selectDuplicateActor(duplicate.id);
        return;
    }
  }

  const altNamesRaw = document.getElementById("actorAltNames").value.trim();
  const altNames = altNamesRaw ? altNamesRaw.split(",").map(n => n.trim()).filter(n => n).join(", ") : "";

  const actorData = {
    name,
    avatar,
    role,
    gender,
    dob: dob || null,
    country: document.getElementById("actorCountry").value.trim(),
    bio,
    alt_names: altNames,
    updated_at: new Date().toISOString()
  };

  try {
    showLoading(true, "Đang lưu diễn viên...");

    if (idInput) {
      const { error } = await supabase.from('actors').update(actorData).eq('id', idInput);
      if (error) throw error;
    } else {
      const baseId = createActorIdFromName(name);
      const newId = `${baseId}-${Date.now().toString().slice(-4)}`;
      
      const insertData = {
          id: newId,
          ...actorData,
          created_at: new Date().toISOString()
      };
      
      const { error } = await supabase.from('actors').insert(insertData);
      if (error) throw error;
      
      showNotification("Đã thêm diễn viên!", "success");
      if (typeof window.setLatestActorIds === 'function') window.setLatestActorIds(newId, false);
      
      const sortSelect = document.getElementById("adminSortActor");
      if (sortSelect) sortSelect.value = "newest";
    }
    
    notifyDataChange("actors"); 

    showNotification("Đã lưu thông tin!", "success");
    closeModal("actorModal");

    if (typeof loadActors === "function") await loadActors();
    renderAdminActors();
    
    if (typeof renderActorsPage === 'function' && document.getElementById("actorsGrid")) {
       renderActorsPage();
    }
  } catch (error) {
    console.error("Lỗi lưu actor Supabase:", error);
    showNotification("Lỗi: " + error.message, "error");
  } finally {
    showLoading(false);
  }
}

/**
 * XỬ LÝ GỢI Ý QUỐC GIA THÔNG MINH (SMART COUNTRY SUGGESTIONS)
 */
let currentSuggestionIndex = -1;

function handleCountryInput(query) {
    const suggestionsDiv = document.getElementById("actorCountrySuggestions");
    if (!suggestionsDiv) return;

    query = query.trim().toLowerCase();
    
    if (!query) {
        suggestionsDiv.innerHTML = "";
        suggestionsDiv.style.display = "none";
        return;
    }

    // Lọc từ mảng allCountries (đã có sẵn trong hệ thống)
    const filtered = allCountries.filter(c => 
        (c.name && c.name.toLowerCase().includes(query)) || 
        (c.id && c.id.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        suggestionsDiv.innerHTML = "";
        suggestionsDiv.style.display = "none";
        return;
    }

    currentSuggestionIndex = -1;
    suggestionsDiv.innerHTML = filtered.map((c, index) => `
        <div class="suggestion-item" onclick="selectCountrySuggestion('${c.name}')" data-index="${index}">
            <i class="fas fa-globe-asia" style="margin-right: 8px; opacity: 0.6;"></i>
            <span>${c.name}</span>
        </div>
    `).join("");
    
    suggestionsDiv.style.display = "block";
}

function handleCountryKeydown(event) {
    const suggestionsDiv = document.getElementById("actorCountrySuggestions");
    if (!suggestionsDiv || suggestionsDiv.style.display === "none") return;

    const items = suggestionsDiv.querySelectorAll(".suggestion-item");
    
    if (event.key === "ArrowDown") {
        event.preventDefault();
        currentSuggestionIndex = (currentSuggestionIndex + 1) % items.length;
        updateSuggestionFocus(items);
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        currentSuggestionIndex = (currentSuggestionIndex - 1 + items.length) % items.length;
        updateSuggestionFocus(items);
    } else if (event.key === "Enter") {
        if (currentSuggestionIndex >= 0) {
            event.preventDefault();
            const selectedName = items[currentSuggestionIndex].querySelector("span").textContent;
            selectCountrySuggestion(selectedName);
        }
    } else if (event.key === "Escape") {
        suggestionsDiv.style.display = "none";
    }
}

function updateSuggestionFocus(items) {
    items.forEach((item, index) => {
        if (index === currentSuggestionIndex) {
            item.classList.add("active");
            item.scrollIntoView({ block: "nearest" });
        } else {
            item.classList.remove("active");
        }
    });
}

function selectCountrySuggestion(name) {
    const input = document.getElementById("actorCountry");
    const suggestionsDiv = document.getElementById("actorCountrySuggestions");
    
    if (input) {
        input.value = name;
        // Trigger potential validation or other logic
        input.dispatchEvent(new Event('change'));
    }
    
    if (suggestionsDiv) {
        suggestionsDiv.style.display = "none";
    }
}

// Click ra ngoài để ẩn gợi ý
document.addEventListener("click", function(e) {
    const suggestionsDiv = document.getElementById("actorCountrySuggestions");
    const input = document.getElementById("actorCountry");
    
    if (suggestionsDiv && input && !suggestionsDiv.contains(e.target) && e.target !== input) {
        suggestionsDiv.style.display = "none";
    }
});

/**
 * LOGIC HÀNH ĐỘNG HÀNG LOẠT (BULK ACTIONS)
 */

window.toggleActorSelection = function(actorId, isChecked) {
    if (isChecked) {
        if (!selectedActorIds.includes(actorId)) {
            selectedActorIds.push(actorId);
        }
    } else {
        selectedActorIds = selectedActorIds.filter(id => id !== actorId);
    }
    updateBulkActionsBar();
}

window.toggleSelectAllActors = function(isChecked) {
    const checkboxes = document.querySelectorAll(".actor-checkbox");
    
    checkboxes.forEach(cb => {
        const id = cb.value;
        cb.checked = isChecked;
        if (isChecked) {
            if (!selectedActorIds.includes(id)) selectedActorIds.push(id);
        } else {
            selectedActorIds = selectedActorIds.filter(item => item !== id);
        }
    });
    
    updateBulkActionsBar();
}

window.clearActorSelection = function() {
    selectedActorIds = [];
    const selectAllCb = document.getElementById("selectAllActors");
    if (selectAllCb) selectAllCb.checked = false;
    
    const checkboxes = document.querySelectorAll(".actor-checkbox");
    checkboxes.forEach(cb => cb.checked = false);
    
    updateBulkActionsBar();
}

function updateBulkActionsBar() {
    const bar = document.getElementById("actorBulkActionsBar");
    const countSpan = document.getElementById("selectedActorsCount");
    
    if (selectedActorIds.length > 0) {
        bar.classList.add("active");
        countSpan.textContent = selectedActorIds.length;
    } else {
        bar.classList.remove("active");
    }
}

window.deleteSelectedActors = async function() {
    if (selectedActorIds.length === 0) return;
    
    const confirm = await customConfirm(`Bạn có chắc chắn muốn xóa ${selectedActorIds.length} diễn viên đã chọn không?`, {
        title: "Xóa hàng loạt",
        type: "danger",
        confirmText: "Xóa ngay"
    });
    if (!confirm) return;
    
    try {
        showLoading(true, `Đang xóa ${selectedActorIds.length} diễn viên...`);
        
        const { error } = await supabase
            .from('actors')
            .delete()
            .in('id', selectedActorIds);
        
        if (error) throw error;
        
        showNotification(`Đã xóa thành công ${selectedActorIds.length} diễn viên!`, "success");
        notifyDataChange("actors"); // 📡 Đồng bộ cache
        
        selectedActorIds = [];
        updateBulkActionsBar();
        await loadActors();
        renderAdminActors();
        
    } catch (error) {
        console.error("Lỗi xóa hàng loạt Supabase:", error);
        showNotification("Lỗi khi xóa hàng loạt: " + error.message, "error");
    } finally {
        showLoading(false);
    }
}

window.openBulkUpdateModal = function(field) {
    if (!selectedActorIds || selectedActorIds.length === 0) {
        showNotification("Vui lòng chọn ít nhất một diễn viên!", "warning");
        return;
    }
    
    const modal = document.getElementById("bulkUpdateActorModal");
    const title = document.getElementById("bulkUpdateModalTitle");
    const fieldInput = document.getElementById("bulkUpdateField");
    const countLabel = document.getElementById("bulkUpdateCount");
    
    if (!modal || !fieldInput) {
        console.error("Không tìm thấy modal hoặc input trường cập nhật hàng loạt!");
        return;
    }

    fieldInput.value = field;
    if (countLabel) countLabel.textContent = selectedActorIds.length;
    
    // Reset fields
    const genderField = document.getElementById("bulkGenderField");
    const countryField = document.getElementById("bulkCountryField");
    
    if (genderField) genderField.classList.add("hidden");
    if (countryField) countryField.classList.add("hidden");
    
    if (field === 'gender') {
        if (title) title.textContent = "Cập nhật giới tính hàng loạt";
        if (genderField) genderField.classList.remove("hidden");
    } else if (field === 'country') {
        if (title) title.textContent = "Cập nhật Nơi sống hàng loạt";
        if (countryField) countryField.classList.remove("hidden");
        const countryInput = document.getElementById("bulkActorCountry");
        if (countryInput) countryInput.value = "";
    }
    
    openModal("bulkUpdateActorModal");
}

window.handleBulkUpdateSubmit = async function(e) {
    if (e) e.preventDefault();
    const field = document.getElementById("bulkUpdateField").value;
    let newValue = "";
    
    if (field === 'gender') {
        newValue = document.getElementById("bulkActorGender").value;
    } else if (field === 'country') {
        newValue = document.getElementById("bulkActorCountry").value.trim();
    }
    
    if (field === 'country' && !newValue) {
        showNotification("Vui lòng nhập nơi sống mới!", "warning");
        return;
    }
    
    const confirm = await customConfirm(`Cập nhật ${field === 'gender' ? 'giới tính' : 'nơi sống'} cho ${selectedActorIds.length} diễn viên?`, {
        title: "Cập nhật hàng loạt",
        confirmText: "Cập nhật"
    });
    if (!confirm) return;
    
    try {
        showLoading(true, `Đang cập nhật ${selectedActorIds.length} diễn viên...`);
        
        const updateData = {
            [field]: newValue,
            updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase
            .from('actors')
            .update(updateData)
            .in('id', selectedActorIds);
            
        if (error) throw error;
        
        showNotification(`Đã cập nhật xong ${selectedActorIds.length} diễn viên!`, "success");
        notifyDataChange("actors");
        
        closeModal("bulkUpdateActorModal");
        selectedActorIds = [];
        updateBulkActionsBar();
        await loadActors();
        renderAdminActors();
    } catch (error) {
        console.error("Lỗi cập nhật hàng loạt Supabase:", error);
        showNotification("Lỗi: " + error.message, "error");
    } finally {
        showLoading(false);
    }
}

window.handleBulkCountryInput = function(query) {
    const suggestionsDiv = document.getElementById("bulkActorCountrySuggestions");
    if (!suggestionsDiv) return;

    query = query.trim().toLowerCase();
    
    if (!query) {
        suggestionsDiv.innerHTML = "";
        suggestionsDiv.style.display = "none";
        return;
    }

    const filtered = allCountries.filter(c => 
        (c.name && c.name.toLowerCase().includes(query)) || 
        (c.id && c.id.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        suggestionsDiv.innerHTML = "";
        suggestionsDiv.style.display = "none";
        return;
    }

    suggestionsDiv.innerHTML = filtered.map(c => `
        <div class="suggestion-item" onclick="selectBulkCountrySuggestion('${c.name}')">
            <i class="fas fa-globe-asia" style="margin-right: 8px; opacity: 0.6;"></i>
            <span>${c.name}</span>
        </div>
    `).join("");
    
    suggestionsDiv.style.display = "block";
}

window.selectBulkCountrySuggestion = function(name) {
    document.getElementById("bulkActorCountry").value = name;
    document.getElementById("bulkActorCountrySuggestions").style.display = "none";
}

/**
 * Xóa diễn viên
 */
async function deleteActor(actorId) {
  if (!supabase) return;

  if (!await customConfirm("Bạn có chắc muốn xóa diễn viên này?", { title: "Xóa diễn viên", type: "danger", confirmText: "Xóa" })) return;

  try {
    showLoading(true, "Đang xóa...");
    const { error } = await supabase.from('actors').delete().eq('id', actorId);
    if (error) throw error;

    showNotification("Đã xóa diễn viên thành công!", "success");
    notifyDataChange("actors"); 

    if (typeof loadActors === "function") await loadActors();
    renderAdminActors();
  } catch (error) {
    console.error("Lỗi xóa actor Supabase:", error);
    showNotification("Không thể xóa diễn viên!", "error");
  } finally {
    showLoading(false);
  }
}

/**
 * Load danh sách bình luận (Đã sửa lỗi ID để xóa được ngay)
 */
async function loadAdminComments() {
  const tbody = document.getElementById("adminCommentsTable");
  if (!tbody || !supabase) return;

  try {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        profiles (display_name, avatar),
        movies (title)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Lưu vào biến toàn cục và map lại cho UI dễ đọc
    allAdminComments = (data || []).map(c => ({
        ...c,
        userName: c.profiles?.display_name || "Ẩn danh",
        userAvatar: c.profiles?.avatar,
        movieTitle: c.movies?.title || "N/A"
    }));

    // Render toàn bộ
    renderAdminCommentsList(allAdminComments);

  } catch (error) {
    console.error("Lỗi fetch comments Supabase:", error);
  }
}

/**
 * Hàm lọc comment theo nội dung và đánh giá
 */
function filterAdminComments() {
  const searchText = document.getElementById("adminSearchComments").value.toLowerCase().trim();
  const ratingFilter = document.getElementById("adminFilterCommentRating").value;

  const filtered = allAdminComments.filter(comment => {
    // Resolve tên phim chuẩn từ ID (giống logic render)
    let movieName = comment.movieTitle || "";
    if (comment.movieId && typeof allMovies !== 'undefined') {
        const foundMovie = allMovies.find(m => m.id === comment.movieId);
        if (foundMovie) movieName = foundMovie.title;
    }

    const matchContent = (comment.content || "").toLowerCase().includes(searchText);
    const matchUser = (comment.userName || "").toLowerCase().includes(searchText);
    const matchMovie = (movieName || "").toLowerCase().includes(searchText);
    
    const matchRating = ratingFilter ? parseInt(comment.rating) === parseInt(ratingFilter) : true;

    return (matchContent || matchUser || matchMovie) && matchRating;
  });

  renderAdminCommentsList(filtered);
}

/**
 * Render danh sách comment (UI)
 */
function renderAdminCommentsList(comments) {
  const tbody = document.getElementById("adminCommentsTable");
  if (!tbody) return;

  if (comments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Không tìm thấy bình luận nào</td></tr>`;
    return;
  }

  tbody.innerHTML = comments
    .map((comment) => {
      const date = comment.created_at ? formatDate(new Date(comment.created_at)) : "N/A";
      const movieDisplay = comment.movieTitle || "N/A";

      const ratingStars = Array(5)
        .fill(0)
        .map(
          (_, i) =>
            `<i class="fas fa-star ${i < comment.rating ? "text-warning" : "text-muted"}"></i>`,
        )
        .join("");

      const initial = (comment.userName || "U")[0].toUpperCase();
      const avatarHtml = comment.userAvatar
        ? `<img src="${comment.userAvatar}" class="comment-avatar-small" style="width:30px;height:30px;border-radius:50%">`
        : `<div class="comment-avatar-small" style="width:30px;height:30px;background:#E50914;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;">${initial}</div>`;

      return `
          <tr>
              <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                      ${avatarHtml}
                      <span>${comment.userName || "Ẩn danh"}</span>
                  </div>
              </td>
              <td>${movieDisplay}</td>
              <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${comment.content}">${comment.content}</td>
              <td style="color:#ffaa00; font-size:12px;">⭐ ${comment.rating}</td>
              <td>${date}</td>
              <td>
                  <button class="btn btn-sm btn-danger" onclick="deleteAdminComment('${comment.id}')">
                      <i class="fas fa-trash"></i>
                  </button>
              </td>
          </tr>
      `;
    })
    .join("");
}
/**
 * Xóa bình luận Admin (Xóa dòng ngay lập tức)
 */
async function deleteAdminComment(commentId) {
  if (!await customConfirm("Bạn có chắc muốn xóa bình luận này vĩnh viễn?", { title: "Xóa bình luận", type: "danger", confirmText: "Xóa" })) return;

  try {
    showLoading(true, "Đang xóa...");

    // 1. Xóa trong Supabase
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) throw error;

    // 2. Xóa dòng đó trên giao diện NGAY LẬP TỨC
    const row = document.getElementById(`row-comment-${commentId}`);
    if (row) {
      // Hiệu ứng mờ dần cho đẹp
      row.style.transition = "all 0.5s ease";
      row.style.opacity = "0";
      row.style.backgroundColor = "#ffcccc"; // Nháy đỏ nhẹ

      // Đợi 0.5s rồi xóa hẳn khỏi HTML
      setTimeout(() => row.remove(), 500);
    }

    showNotification("Đã xóa bình luận!", "success");
  } catch (error) {
    console.error("Lỗi xóa comment:", error);
    showNotification("Lỗi xóa!", "error");
  } finally {
    showLoading(false);
  }
}
/**
 * Load lịch sử giao dịch (Đã cập nhật hiện giờ chi tiết)
 */
async function loadAdminTransactions() {
  const tbody = document.getElementById("adminTransactionsTable");
  if (!tbody) return;

  if (!supabase) return;

  try {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center">Đang tải...</td></tr>';

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center">Chưa có giao dịch nào</td></tr>';
      return;
    }

    tbody.innerHTML = data
      .map((tx) => {
        // 👇 SỬA DÒNG NÀY: Dùng formatDateTime thay vì formatDate
        const date = tx.created_at ? formatDateTime(tx.created_at) : "N/A";

        // Format trạng thái màu sắc
        let statusBadge = "";
        if (tx.status === "completed")
          statusBadge = '<span class="status-badge active">Thành công</span>';
        else if (tx.status === "pending")
          statusBadge = '<span class="status-badge warning">Đang chờ</span>';
        else
          statusBadge = `<span class="status-badge blocked">${tx.status}</span>`;

        return `
            <tr>
                <td>
                    <a href="https://cronoscan.com/tx/${tx.tx_hash}" target="_blank" style="color:var(--accent-primary); text-decoration:none;">
                        ${tx.tx_hash ? tx.tx_hash.substring(0, 10) + "..." : "N/A"} <i class="fas fa-external-link-alt" style="font-size:10px;"></i>
                    </a>
                </td>
                <td title="${tx.user_id}">${tx.user_id ? tx.user_id.substring(0, 8) + "..." : "N/A"}</td>
                <td><span style="font-weight:bold; color:#fff;">${tx.package || "VIP"}</span></td>
                <td style="color:#00ff88; font-weight:bold;">${formatNumber(tx.amount || 0)} CRO</td>
                <td>${statusBadge}</td>
                
                <td style="font-size: 13px;">${date}</td>
            </tr>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Lỗi load transactions:", error);
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center text-danger">Lỗi tải dữ liệu</td></tr>';
  }
}

/**
 * Cập nhật biểu tượng nguồn ảnh (Cloudinary hoặc Link) cho khung xem trước
 * @param {string} url - URL của ảnh
 * @param {string} previewId - ID của container preview
 */
window.updateSourceIndicator = function(url, previewId) {
    const container = document.getElementById(previewId);
    if (!container) return;

    const indicator = container.querySelector('.image-source-indicator');
    if (!indicator) return;

    const isCloudinary = url && (url.includes("cloudinary.com") || url.startsWith("blob:") || url.startsWith("data:"));
    // Nhận dạng URL từ Cloudflare R2 Worker (workers.dev hoặc r2.dev)
    const isCloudflare = url && (url.includes("workers.dev") || url.includes(".r2.dev"));
    // Nhận dạng file đang chờ upload lên R2
    const isPendingR2 = url && url.startsWith("[File R2 chờ tải lên]");
    const isPending = url && url.startsWith("[File chờ tải lên]");

    const icon = indicator.querySelector('i');
    
    if (isCloudflare || isPendingR2) {
        indicator.className = "image-source-indicator cloudflare";
        indicator.title = isPendingR2 ? "Ảnh chờ tải lên Cloudflare R2 (sẽ upload khi bấm Lưu)" : "Ảnh lưu trên Cloudflare R2";
        // Hiển thị logo Cloudflare (chữ CF)
        if (icon) {
            icon.className = "";
            icon.textContent = "CF";
            icon.style.fontWeight = "bold";
            icon.style.fontSize = "8px";
            icon.style.fontFamily = "Arial, sans-serif";
        }
    } else if (isCloudinary || isPending) {
        indicator.className = "image-source-indicator cloudinary";
        indicator.title = "Ảnh từ Cloudinary (Hoặc file cục bộ sẵn sàng upload)";
        if (icon) { icon.className = "fas fa-cloud"; icon.textContent = ""; icon.style = ""; }
    } else {
        indicator.className = "image-source-indicator direct-link";
        indicator.title = "Link ảnh trực tiếp từ bên ngoài";
        if (icon) { icon.className = "fas fa-link"; icon.textContent = ""; icon.style = ""; }
    }
}

/**
 * Cập nhật ảnh xem trước khi dán link online
 */
window.updateImagePreview = function(url, previewId) {
    const previewContainer = document.getElementById(previewId);
    if (!previewContainer) return;

    // Nếu người dùng xóa trống input, ẩn ảnh đi
    if (!url || url.trim() === "") {
        previewContainer.style.display = "none";
        const img = previewContainer.querySelector('img');
        if (img) img.src = "";
        return;
    }

    // Nếu là file chọn từ máy (đang chờ), preview đã được set qua uploadMovieImage()
    if (url.startsWith("[File chờ tải lên]")) return;

    // Nếu là link ảnh online, hiển thị luôn
    const img = previewContainer.querySelector('img');
    if (img) {
        img.src = url;
        previewContainer.style.display = "block";
        // Cập nhật biểu tượng nguồn
        window.updateSourceIndicator(url, previewId);
    }
}

/**
 * Hoán đổi link Poster ↔ Background (khi API trả ảnh sai vị trí)
 */
window.swapPosterBackground = function() {
    const posterInput = document.getElementById("moviePoster");
    const bgInput = document.getElementById("movieBackground");
    if (!posterInput || !bgInput) return;

    // Hoán đổi giá trị
    const temp = posterInput.value;
    posterInput.value = bgInput.value;
    bgInput.value = temp;

    // Cập nhật preview 2 ảnh
    if (typeof window.updateImagePreview === 'function') {
        window.updateImagePreview(posterInput.value, 'posterPreview');
        window.updateImagePreview(bgInput.value, 'bgPreview');
    }

    showNotification("Đã hoán đổi Poster ↔ Background!", "success");
}

/**
 * Tải ảnh lên Cloudinary và cập nhật URL vào input tương ứng
 * @param {HTMLInputElement} input - Input file vừa chọn
 * @param {string} targetUrlId - ID của ô input nhận URL ảnh
 * @param {string} previewId - ID của vùng chứa ảnh xem trước
 */
window.pendingUploads = window.pendingUploads || {};

window.uploadMovieImage = async function(input, targetUrlId, previewId) {
  const file = input.files[0];
  if (!file) return;

  // 1. Kiểm tra định dạng
  if (!file.type.startsWith('image/')) {
    showNotification("Vui lòng chọn file hình ảnh!", "error");
    return;
  }

  // 2. Hiển thị Preview cục bộ ngay lập tức
  const previewContainer = document.getElementById(previewId);
  if (previewContainer) {
    const previewImg = previewContainer.querySelector('img');
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewContainer.style.display = "block";
      // Cập nhật biểu tượng nguồn (Mặc định là Cloudinary khi upload từ máy)
      window.updateSourceIndicator(e.target.result, previewId);
    };
    reader.readAsDataURL(file);
  }

  // 3. Lưu vào pendingUploads và hiển thị trạng thái chờ
  window.pendingUploads[targetUrlId] = file;
  
  const targetInput = document.getElementById(targetUrlId);
  if (targetInput) {
    targetInput.value = `[File chờ tải lên] ${file.name}`;
    targetInput.type = "text"; // Bỏ qua validate URL tạm thời
    
    // Nếu user sửa tay URL, tự động xoá ảnh khỏi hàng đợi
    targetInput.oninput = () => {
        if (!targetInput.value.startsWith("[File chờ tải lên]")) {
            delete window.pendingUploads[targetUrlId];
            targetInput.oninput = null; // Xóa listener
        }
    };
  }

  input.value = ""; // Reset để có thể chọn lại cùng 1 file
}

/**
 * Chuyển chuỗi tiếng Việt có dấu thành không dấu, thay khoảng trắng + ký tự đặc biệt bằng _
 * Ví dụ: "Venom: Kèo Chung Sống" → "venom_keo_chung_song"
 * @param {string} str - Chuỗi cần chuyển
 * @returns {string} Chuỗi không dấu, lowercase, nối bằng _
 */
function removeVietnameseDiacritics(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Xóa ký tự đặc biệt (giữ chữ, số, khoảng trắng)
        .replace(/\s+/g, '_') // Khoảng trắng → _
        .replace(/_+/g, '_') // Gộp nhiều _ liên tiếp
        .replace(/^_|_$/g, ''); // Xóa _ đầu/cuối
}

/**
 * Chọn ảnh để tải lên Cloudflare R2 - CHỈ PREVIEW CỤC BỘ, không upload ngay.
 * Ảnh thực sự được upload khi Admin bấm nút "Lưu" (uploadPendingR2Images).
 * @param {HTMLInputElement} input - Input file vừa chọn
 * @param {string} targetUrlId - ID của ô input nhận URL ảnh
 * @param {string} previewId - ID của vùng chứa ảnh xem trước (nếu có)
 * @param {string} folderMode - Loại ảnh trên R2: 'poster' hoặc 'background'
 */
window.uploadImageToR2 = function(input, targetUrlId, previewId, folderMode = 'poster') {
  const file = input.files[0];
  if (!file) return;

  // 1. Kiểm tra định dạng
  if (!file.type.startsWith('image/')) {
    showNotification("Vui lòng chọn file hình ảnh (Cloudflare R2)!", "error");
    return;
  }

  // 2. Hiển thị Preview cục bộ ngay lập tức (không cần upload)
  const previewContainer = document.getElementById(previewId);
  if (previewContainer) {
    const previewImg = previewContainer.querySelector('img');
    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg) previewImg.src = e.target.result;
      previewContainer.style.display = "block";
      // Hiển thị badge "CF" chờ upload
      window.updateSourceIndicator("[File R2 chờ tải lên]", previewId);
    };
    reader.readAsDataURL(file);
  }

  // 3. Lưu file vào hàng đợi R2, chờ khi bấm Lưu mới thực sự upload
  window.pendingR2Uploads = window.pendingR2Uploads || {};
  window.pendingR2Uploads[targetUrlId] = { file, folderMode, previewId };

  // 4. Đánh dấu input đang chờ để bỏ qua validate URL
  const targetInput = document.getElementById(targetUrlId);
  if (targetInput) {
    targetInput.value = `[File R2 chờ tải lên] ${file.name}`;
    targetInput.type = "text";

    // Nếu admin sửa tay URL thì hủy hàng đợi R2 cho field này
    targetInput.oninput = () => {
      if (!targetInput.value.startsWith("[File R2 chờ tải lên]")) {
        delete window.pendingR2Uploads[targetUrlId];
        targetInput.oninput = null;
      }
    };
  }

  input.value = ""; // Reset để có thể chọn lại cùng file
  showNotification("Ảnh đã sẵn sàng! Bấm Lưu để tải lên Cloudflare R2. 🟠", "info");
};

/**
 * Queue ảnh từ URL để upload lên Cloudflare R2 khi bấm Lưu
 * Chỉ xếp hàng đợi + preview, KHÔNG upload ngay
 * @param {string} targetUrlId - ID input chứa URL ảnh (moviePoster / movieBackground)
 * @param {string} previewId - ID container preview ảnh
 * @param {string} folderMode - Loại ảnh: 'poster' hoặc 'background'
 */
window.reuploadFromUrlToR2 = function(targetUrlId, previewId, folderMode) {
    const targetInput = document.getElementById(targetUrlId);
    if (!targetInput) return;

    const imageUrl = targetInput.value.trim();
    if (!imageUrl || imageUrl.startsWith("[File")) {
        showNotification("Chưa có link ảnh để tải lên!", "warning");
        return;
    }

    // Nếu ảnh đã trên Cloudflare R2 thì không cần re-upload
    if (imageUrl.includes("workers.dev") || imageUrl.includes(".r2.dev")) {
        showNotification("Ảnh này đã nằm trên Cloudflare R2 rồi!", "info");
        return;
    }

    // Đưa URL vào hàng đợi R2 (flag fromUrl để phân biệt với file upload)
    window.pendingR2Uploads = window.pendingR2Uploads || {};
    window.pendingR2Uploads[targetUrlId] = { fromUrl: true, url: imageUrl, folderMode, previewId };

    // Đánh dấu input đang chờ upload
    targetInput.value = `[File R2 chờ tải lên] ${imageUrl.split('/').pop().split('?')[0]}`;
    targetInput.type = "text";

    // Cập nhật badge preview
    window.updateSourceIndicator("[File R2 chờ tải lên]", previewId);

    // Nếu admin sửa tay URL thì hủy hàng đợi
    targetInput.oninput = () => {
        if (!targetInput.value.startsWith("[File R2 chờ tải lên]")) {
            delete window.pendingR2Uploads[targetUrlId];
            targetInput.oninput = null;
        }
    };

    showNotification("Ảnh đã sẵn sàng! Bấm Lưu để tải lên Cloudflare R2. 🟠", "info");
};

/**
 * Thực sự upload tất cả ảnh đang chờ trong hàng đợi R2 lên Cloudflare Worker.
 * Gọi khi admin bấm nút Lưu trong form phim.
 * @returns {Promise<boolean>} true nếu upload hết thành công, false nếu có lỗi
 */
window.uploadPendingR2Images = async function() {
  if (!window.pendingR2Uploads || Object.keys(window.pendingR2Uploads).length === 0) {
    return true; // Không có gì cần upload R2
  }

  const WORKER_BASE = "https://r2-uploader.thinhnd-2003.workers.dev";
  showLoading(true, "Đang tải ảnh lên Cloudflare R2...");

  try {
    // Lấy thông tin phim từ form để xây dựng folder + filename
    const movieId = document.getElementById('movieId')?.value || window._preGeneratedMovieId || '';
    const movieTitle = document.getElementById('movieTitle')?.value || '';
    const titleSlug = removeVietnameseDiacritics(movieTitle);

    for (const [targetUrlId, entry] of Object.entries(window.pendingR2Uploads)) {
      const { folderMode, previewId } = entry;
      
      // Xây dựng folder và filename theo cấu trúc: movies/{ten_khong_dau}/{ten_khong_dau}_{poster|background}.ext
      let folder = folderMode; // Fallback nếu không có thông tin phim
      let customFilename = null;

      if (titleSlug) {
        // Dùng movieId + titleSlug nếu có ID, hoặc chỉ titleSlug nếu phim mới
        const numericId = movieId ? (movieId.replace(/[^0-9]/g, '') || movieId) : '';
        folder = numericId ? `movies/${numericId}_${titleSlug}` : `movies/${titleSlug}`;
      }

      let response;

      if (entry.fromUrl) {
        // === Upload từ URL: gọi Worker endpoint /upload-from-url ===
        const urlFilename = entry.url.split('/').pop().split('?')[0];
        const ext = urlFilename.match(/\.(jpg|jpeg|png|gif|webp|avif)$/i)?.[1] || 'jpg';
        customFilename = titleSlug ? `${titleSlug}_${folderMode}.${ext}` : null;

        response = await fetch(WORKER_BASE + "/upload-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: entry.url,
            folder: folder,
            customFilename: customFilename
          })
        });
      } else {
        // === Upload file từ máy: gọi Worker endpoint /upload (flow cũ) ===
        const file = entry.file;
        const ext = file.name.split('.').pop() || 'jpg';
        customFilename = titleSlug ? `${titleSlug}_${folderMode}.${ext}` : null;

        const formData = new FormData();
        formData.append("file", file, customFilename || file.name);
        formData.append("folder", folder);
        if (customFilename) {
          formData.append("customFilename", customFilename);
        }

        response = await fetch(WORKER_BASE + "/upload", {
          method: "POST",
          body: formData
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Lỗi HTTP ${response.status}`);
      }

      const data = await response.json();
      const downloadURL = data.url;

      // Gán URL thực vào input
      const targetInput = document.getElementById(targetUrlId);
      if (targetInput) {
        targetInput.value = downloadURL;
        targetInput.type = "url";
        targetInput.oninput = null;
      }

      // Cập nhật preview và badge thành Cloudflare chính thức
      window.updateSourceIndicator(downloadURL, previewId);

      console.log(`✅ R2 Upload OK [${folder}/${customFilename || 'auto'}]: ${downloadURL}`);
    }

    // Xóa hàng đợi sau khi upload xong
    window.pendingR2Uploads = {};
    return true;
  } catch (error) {
    console.error("Lỗi upload R2:", error);
    showNotification("Lỗi khi tải ảnh lên Cloudflare R2: " + error.message, "error");
    return false;
  } finally {
    showLoading(false);
  }
}

/**
 * Xóa ảnh khỏi Cloudflare R2 thông qua Worker DELETE endpoint
 * @param {string} url - URL của ảnh cần xóa (phải là từ R2 Worker)
 */
window.deleteImageFromR2 = async function(url) {
  if (!url || (!url.includes("workers.dev") && !url.includes(".r2.dev"))) return;

  try {
    const urlObj = new URL(url);
    // Lấy key từ pathname (bỏ dấu / ở đầu)
    const key = urlObj.pathname.substring(1);
    
    if (!key) return;

    const WORKER_DELETE_URL = "https://r2-uploader.thinhnd-2003.workers.dev/delete";
    
    console.log(`📡 Đang gửi yêu cầu xóa file trên R2: ${key}`);

    const response = await fetch(WORKER_DELETE_URL, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });

    if (response.ok) {
      console.log(`✅ Đã xóa file trên R2 thành công: ${key}`);
    } else {
      const errText = await response.text();
      console.warn(`⚠️ Không thể xóa file trên R2: ${key}`, errText);
    }
  } catch (error) {
    console.warn("⚠️ Lỗi khi thực hiện yêu cầu xóa ảnh R2:", error);
  }
};

/**
 * Tải các ảnh đang chờ lên Cloudinary, có kiểm tra trùng lặp để tiết kiệm request
 * @returns {Promise<boolean>} Trả về true nếu thành công tất cả
 */
window.uploadPendingImages = async function() {
  if (!window.pendingUploads || Object.keys(window.pendingUploads).length === 0) {
      return true; // Không có gì để tải
  }

  showLoading(true, "Đang tải ảnh và thông tin lên máy chủ...");

  const CLOUD_NAME = "drhr0h7dd";
  const UPLOAD_PRESET = "tramphim_preset";
  const API_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  // Map file hash -> Cloudinary URL để tránh upload trùng nội dung
  const uploadedFilesMap = new Map();

  try {
      for (const [targetUrlId, file] of Object.entries(window.pendingUploads)) {
          // Tạo mã băm từ các thuộc tính của file
          const fileHash = `${file.name}_${file.size}_${file.lastModified}`;

          if (uploadedFilesMap.has(fileHash)) {
              // Đã upload file này trong đợt này, tái sử dụng URL
              const downloadURL = uploadedFilesMap.get(fileHash);
              const targetInput = document.getElementById(targetUrlId);
              if (targetInput) {
                  targetInput.value = downloadURL;
              }
              continue; // Bỏ qua đoạn code upload bên dưới
          }

          // Phân loại thư mục
          let targetFolder = "movie_assets";
          if (targetUrlId === 'actorAvatar') {
              targetFolder = "Dien_Vien";
          } else if (targetUrlId === 'moviePoster' || targetUrlId === 'movieBackground') {
              const typeSelect = document.getElementById("movieType");
              if (typeSelect && typeSelect.value === 'single') {
                  targetFolder = "Phim_Le";
              } else if (typeSelect && typeSelect.value === 'series') {
                  targetFolder = "Phim_Bo";
              }
          }

          const formData = new FormData();
          formData.append("file", file);
          formData.append("upload_preset", UPLOAD_PRESET);
          formData.append("folder", targetFolder);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          const response = await fetch(API_URL, {
              method: "POST",
              body: formData,
              signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error?.message || "Lỗi API Cloudinary");
          }

          const data = await response.json();
          const downloadURL = data.secure_url;

          // Lưu vào map để tái sử dụng
          uploadedFilesMap.set(fileHash, downloadURL);

          // Cập nhật lại input
          const targetInput = document.getElementById(targetUrlId);
          if (targetInput) {
              targetInput.value = downloadURL;
          }
      }

      // Xóa queue
      window.pendingUploads = {};
      return true;
  } catch (error) {
      console.error("Lỗi upload ảnh:", error);
      let msg = "Lỗi khi tải ảnh lên Cloudinary. Đã hủy lưu dữ liệu!";
      if (error.name === 'AbortError') {
          msg = "Quá thời gian tải lên (30s). Vui lòng kiểm tra mạng!";
      } else if (error.message.includes('preset')) {
          msg = "Lỗi Preset Cloudinary!";
      }
      showNotification(msg, "error");
      showLoading(false);
      return false;
  }
}

/* ============================================
   QUẢN LÝ THÔNG BÁO (ADMIN)
   ============================================ */

// (Đã được khai báo ở đầu file admin.js)
// window.allAdminNotifications = []; 
// window.adminNotifUnsubscribe = null;

/**
 * Load danh sách tất cả thông báo từ Supabase (Realtime)
 */
function loadAdminNotifications() {
    if (!supabase) return;

    // Lắng nghe realtime qua Channel
    if (adminNotifUnsubscribe) {
        adminNotifUnsubscribe.unsubscribe();
    }

    // Tải dữ liệu ban đầu
    const fetchNotifs = async () => {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            allAdminNotifications = data || [];
            filterAdminNotifications();
        } catch (err) {
            console.error("Lỗi load admin notifications Supabase:", err);
        }
    };

    fetchNotifs();

    // Đăng ký realtime
    adminNotifUnsubscribe = supabase
        .channel('admin-notifications-realtime')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'notifications' 
        }, () => {
            fetchNotifs();
        })
        .subscribe();
}

/**
 * Lọc và render danh sách thông báo
 */
function filterAdminNotifications() {
    const searchText = (document.getElementById("adminSearchNotif")?.value || "").toLowerCase().trim();
    const filterType = document.getElementById("adminFilterNotifType")?.value || "";

    let filtered = allAdminNotifications;

    // Lọc theo text
    if (searchText) {
        filtered = filtered.filter(n =>
            (n.title || "").toLowerCase().includes(searchText) ||
            (n.message || "").toLowerCase().includes(searchText)
        );
    }

    // Lọc theo loại
    if (filterType) {
        filtered = filtered.filter(n => n.type === filterType);
    }

    renderAdminNotifications(filtered);
}

// Mảng lưu danh sách thông báo đã gom nhóm để thao tác UI (Xóa, v.v.)
let currentGroupedNotifications = [];

/**
 * Render bảng thông báo
 */
function renderAdminNotifications(notifications) {
    const tbody = document.getElementById("adminNotificationsTable");
    if (!tbody) return;

    // Cập nhật thống kê
    const totalEl = document.getElementById("notifStatTotal");
    const unreadEl = document.getElementById("notifStatUnread");
    const readEl = document.getElementById("notifStatRead");
    const allTotal = allAdminNotifications.length;
    const allUnread = allAdminNotifications.filter(n => !n.is_read).length;
    if (totalEl) totalEl.textContent = allTotal;
    if (unreadEl) unreadEl.textContent = allUnread;
    if (readEl) readEl.textContent = allTotal - allUnread;

    // GOM NHÓM THÔNG BÁO GỬI HÀNG LOẠT
    let grouped = [];
    notifications.forEach(n => {
        let nTime = n.created_at ? new Date(n.created_at).getTime() : 0;
        
        let foundGroup = grouped.find(g => {
            return g.type === n.type && 
                   g.title === n.title && 
                   g.message === n.message &&
                   (Math.abs(g.time - nTime) < 5 * 60 * 1000); // Các notif cách nhau tối đa 5 phút -> Cùng 1 lần gửi
        });

        if (foundGroup) {
            foundGroup.count += 1;
            foundGroup.readCount += n.is_read ? 1 : 0;
            if (n.is_for_admin) foundGroup.is_for_admin = true;
            foundGroup.ids.push(n.id);
        } else {
            grouped.push({
                id: n.id, // ID đại diện
                type: n.type,
                title: n.title,
                message: n.message,
                time: nTime,
                created_at: n.created_at,
                count: 1,
                readCount: n.is_read ? 1 : 0,
                is_for_admin: n.is_for_admin,
                user_id: n.user_id, // Cho trường hợp gửi cá nhân / hệ thống
                ids: [n.id]
            });
        }
    });

    currentGroupedNotifications = grouped; // Lưu ra biến global để dùng khi click

    // --- LOGIC PHÂN TRANG TRÊN DỮ LIỆU ĐÃ NHÓM ---
    const totalItems = grouped.length;
    const totalPages = Math.ceil(totalItems / adminPerPage);
    
    if (currentAdminNotifPage > totalPages && totalPages > 0) currentAdminNotifPage = totalPages;
    if (currentAdminNotifPage < 1) currentAdminNotifPage = 1;

    const startIndex = (currentAdminNotifPage - 1) * adminPerPage;
    const paginatedGrouped = grouped.slice(startIndex, startIndex + adminPerPage);

    if (totalItems === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 30px; color: var(--text-muted);">Không có thông báo nào</td></tr>';
        const paginationContainer = document.getElementById("adminNotificationsPagination");
        if (paginationContainer) paginationContainer.innerHTML = "";
        return;
    }

    // Map tên loại thông báo
    const typeMap = {
        system: { label: "🔔 Hệ thống", cls: "system" },
        new_movie: { label: "🎬 Phim mới", cls: "new_movie" },
        promotion: { label: "🎁 Khuyến mãi", cls: "promotion" },
        maintenance: { label: "🔧 Bảo trì", cls: "maintenance" },
        vip_request: { label: "⭐ VIP Request", cls: "vip_request" },
        vip_approved: { label: "✅ VIP Approved", cls: "vip_approved" }
    };

    tbody.innerHTML = paginatedGrouped.map((g, index) => {
        // Loại thông báo
        const typeInfo = typeMap[g.type] || { label: g.type || "Khác", cls: "system" };

        // Người nhận
        let recipientHtml = "—";
        if (g.is_for_admin) {
            recipientHtml = '<span style="color: #ff6b6b;">Admin</span>';
        } else if (g.count > 1) {
            recipientHtml = `<span style="color: #4db8ff;">Tất cả Users (${g.count})</span>`;
        } else if (g.user_id) {
            recipientHtml = `<span style="font-size: 0.8rem; color: var(--text-muted);" title="${g.user_id}">User: ${g.user_id.substring(0, 8)}...</span>`;
        }

        // Trạng thái đã đọc
        let statusHtml = "";
        if (g.count > 1) {
            statusHtml = `<span style="color: #51cf66; font-size: 0.85rem;">Đã đọc: ${g.readCount}/${g.count}</span>`;
        } else {
            statusHtml = g.readCount > 0
                ? '<span style="color: #51cf66; font-size: 0.85rem;">Đã đọc</span>'
                : '<span style="color: #ff6b6b; font-size: 0.85rem;">Chưa đọc</span>';
        }

        // Thời gian
        let timeStr = "—";
        if (g.created_at) {
            const date = new Date(g.created_at);
            timeStr = date.toLocaleString('vi-VN', {
                hour: '2-digit', minute: '2-digit',
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
        }

        return `
            <tr>
                <td><span class="notif-type-badge ${typeInfo.cls}">${typeInfo.label}</span></td>
                <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${(g.title || '').replace(/"/g, '&quot;')}">${g.title || '—'}</td>
                <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${(g.message || '').replace(/"/g, '&quot;')}">${g.message || '—'}</td>
                <td>${recipientHtml}</td>
                <td>${statusHtml}</td>
                <td style="white-space: nowrap; font-size: 0.85rem;">${timeStr}</td>
                <td>
                    ${g.is_for_admin ? '' : `
                        <button class="btn btn-sm btn-danger" onclick="adminDeleteNotificationGroup('${index}')" title="Xóa thông báo này cho tất cả người nhận">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join("");
}

/**
 * Admin gửi thông báo tùy chỉnh tới tất cả users
 */
async function adminSendNotifToAll() {
    const titleInput = document.getElementById("adminNotifTitle");
    const messageInput = document.getElementById("adminNotifMessage");
    const typeSelect = document.getElementById("adminNotifType");

    const title = titleInput?.value.trim();
    const message = messageInput?.value.trim();
    const type = typeSelect?.value || "system";

    if (!title) {
        showNotification("Vui lòng nhập tiêu đề thông báo!", "warning");
        return;
    }
    if (!message) {
        showNotification("Vui lòng nhập nội dung thông báo!", "warning");
        return;
    }

    if (!await customConfirm(`Bạn có chắc muốn gửi thông báo "${title}" tới TẤT CẢ người dùng?`, { title: "Gửi thông báo", type: "info", confirmText: "Gửi" })) {
        return;
    }

    try {
        showLoading(true, "Đang gửi thông báo...");
        await sendNotificationToAllUsers(title, message, type);
        showNotification("Đã gửi thông báo tới tất cả người dùng!", "success");

        // Reset form
        if (titleInput) titleInput.value = "";
        if (messageInput) messageInput.value = "";
        if (typeSelect) typeSelect.value = "system";
    } catch (err) {
        console.error("Lỗi gửi thông báo:", err);
        showNotification("Có lỗi xảy ra khi gửi thông báo!", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Admin xóa cá nhân một nhóm thông báo (Ẩn khỏi bảng của tài khoản Admin)
 */
async function adminDeleteNotificationGroup(groupIndex) {
    if (!supabase) return;

    const group = currentGroupedNotifications[groupIndex];
    if (!group || !group.ids || group.ids.length === 0) return;

    const count = group.ids.length;
    if (!await customConfirm(
        `Bạn có chắc muốn XÓA vĩnh viễn ${count} thông báo thuộc nhóm "${group.title}"?\n\nHành động này chỉ xóa thông báo ĐÃ LƯU TRONG LỊCH SỬ. Nó sẽ xóa cả thông báo ở phía user do cùng chung ID database. Để thu hồi chính xác, vui lòng dùng nút Thu Hồi!`, 
        { title: "Xóa Lịch Sử", type: "danger", confirmText: "Xóa" }
    )) {
        return;
    }

    try {
        showLoading(true, `Đang xóa ${count} thông báo...`);

        const { error } = await supabase
            .from('notifications')
            .delete()
            .in('id', group.ids);

        if (error) throw error;

        showNotification(`Đã xóa ${count} thông báo!`, "success");
        loadAdminNotifications();
    } catch (err) {
        console.error("Lỗi xóa nhóm thông báo Supabase:", err);
        showNotification("Không thể xóa thông báo!", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Admin THU HỒI thông báo từ tất cả người dùng (dựa theo tiêu đề và loại)
 */
async function adminRecallNotification(notifId, title, type) {
    if (!supabase || !title) return;

    if (!await customConfirm(`Bạn có chắc muốn THU HỒI thông báo "${title}" từ TẤT CẢ người dùng? Hành động này sẽ xóa thông báo đó khỏi hộp thư của mọi user!`, { title: "Thu hồi thông báo", type: "warning", confirmText: "Thu hồi" })) {
        return;
    }

    try {
        showLoading(true, "Đang thu hồi thông báo...");

        // Xóa tất cả các thông báo của user có cùng title và type (không phải của admin)
        const { error, count } = await supabase
            .from('notifications')
            .delete()
            .eq('is_for_admin', false)
            .eq('title', title)
            .eq('type', type);

        if (error) throw error;

        showNotification(`Đã thu hồi thành công ${count || 0} thông báo từ người dùng!`, "success");
        loadAdminNotifications();
    } catch (err) {
        console.error("Lỗi thu hồi thông báo Supabase:", err);
        showNotification("Lỗi khi thu hồi thông báo!", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Admin xóa TẤT CẢ thông báo trong hệ thống
 */
async function adminDeleteAllNotifications() {
    if (!supabase || allAdminNotifications.length === 0) {
        showNotification("Không có thông báo nào để xóa!", "info");
        return;
    }

    if (!await customConfirm(`Bạn có chắc muốn xóa TẤT CẢ ${allAdminNotifications.length} thông báo? Hành động này không thể hoàn tác!`, { title: "Xóa tất cả thông báo", type: "danger", confirmText: "Xóa tất cả" })) {
        return;
    }

    try {
        showLoading(true, "Đang xóa thông báo...");

        // Xóa tất cả trong bảng notifications (Thường dùng cho admin cá nhân hoặc dọn dẹp)
        const { error } = await supabase.from('notifications').delete().neq('id', '0'); // Mẹo xóa tất cả
        if (error) throw error;

        showNotification(`Đã xóa tất cả thông báo!`, "success");
        loadAdminNotifications();
    } catch (err) {
        console.error("Lỗi xóa tất cả thông báo Supabase:", err);
        showNotification("Có lỗi xảy ra khi xóa!", "error");
    } finally {
        showLoading(false);
    }
}

/* ============================================
   LẬP LỊCH GỬI THÔNG BÁO TỰ ĐỘNG
   ============================================ */

// (Đã được khai báo ở đầu file admin.js)
// window.allScheduledNotifs = []; 
// window.scheduledNotifUnsubscribe = null;
/**
 * Load danh sách lịch hẹn từ Supabase (Realtime)
 */
function loadScheduledNotifications() {
    if (!supabase) return;

    if (scheduledNotifUnsubscribe) {
        scheduledNotifUnsubscribe.unsubscribe();
    }

    const fetchSchedules = async () => {
        try {
            const { data, error } = await supabase
                .from('scheduled_notifications')
                .select('*')
                .order('scheduled_at', { ascending: true });
            
            if (error) throw error;
            allScheduledNotifs = data || [];
            renderScheduledNotifications();
        } catch (err) {
            console.error("Lỗi load scheduled notifications Supabase:", err);
        }
    };

    fetchSchedules();

    scheduledNotifUnsubscribe = supabase
        .channel('scheduled-notifications-realtime')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'scheduled_notifications' 
        }, () => {
            fetchSchedules();
        })
        .subscribe();
}

/**
 * Render bảng lịch hẹn
 */
function renderScheduledNotifications() {
    const tbody = document.getElementById("adminScheduledTable");
    if (!tbody) return;

    const statTotal = document.getElementById("schedStatTotal");
    if (statTotal) statTotal.textContent = allScheduledNotifs.length;

    // Map loại thông báo
    const typeMap = {
        system: { label: "🔔 Hệ thống", cls: "system" },
        new_movie: { label: "🎬 Phim mới", cls: "new_movie" },
        promotion: { label: "🎁 Khuyến mãi", cls: "promotion" },
        maintenance: { label: "🔧 Bảo trì", cls: "maintenance" }
    };

    // Map lặp lại
    const repeatMap = {
        once: "Một lần",
        daily: "Hàng ngày",
        weekly: "Hàng tuần",
        monthly: "Hàng tháng"
    };

    if (allScheduledNotifs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px; color: var(--text-muted);">Chưa có lịch hẹn nào</td></tr>';
        return;
    }

    const now = new Date();

    tbody.innerHTML = allScheduledNotifs.map(s => {
        const typeInfo = typeMap[s.type] || { label: s.type || "Khác", cls: "system" };
        const repeatLabel = repeatMap[s.repeat] || s.repeat || "Một lần";

        // Thời gian gửi
        let timeStr = "—";
        let scheduledDate = null;
        if (s.scheduled_at) {
            scheduledDate = new Date(s.scheduled_at);
            timeStr = scheduledDate.toLocaleString('vi-VN', {
                hour: '2-digit', minute: '2-digit',
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
        }

        // Trạng thái
        let statusHtml = '';
        if (s.status === "paused") {
            statusHtml = '<span class="sched-status paused"><i class="fas fa-pause"></i> Tạm dừng</span>';
        } else if (s.status === "sent" && s.repeat === "once") {
            statusHtml = '<span class="sched-status sent"><i class="fas fa-check"></i> Đã gửi</span>';
        } else if (scheduledDate && scheduledDate > now) {
            statusHtml = '<span class="sched-status pending"><i class="fas fa-clock"></i> Đang chờ</span>';
        } else {
            statusHtml = '<span class="sched-status pending"><i class="fas fa-sync"></i> Hoạt động</span>';
        }

        // Nút thao tác
        const isPaused = s.status === "paused";
        const toggleIcon = isPaused ? "fa-play" : "fa-pause";
        const toggleTitle = isPaused ? "Kích hoạt" : "Tạm dừng";
        const toggleColor = isPaused ? "btn-success" : "btn-secondary";

        return `
            <tr>
                <td><span class="notif-type-badge ${typeInfo.cls}">${typeInfo.label}</span></td>
                <td style="max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${(s.title || '').replace(/"/g, '&quot;')}">${s.title || '—'}</td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${(s.message || '').replace(/"/g, '&quot;')}">${s.message || '—'}</td>
                <td style="white-space: nowrap; font-size: 0.85rem;">${timeStr}</td>
                <td><span style="font-size: 0.85rem;">${repeatLabel}</span></td>
                <td>${statusHtml}</td>
                <td style="white-space: nowrap;">
                    <button class="btn btn-sm ${toggleColor}" onclick="adminToggleScheduled('${s.id}')" title="${toggleTitle}" style="margin-right: 4px;">
                        <i class="fas ${toggleIcon}"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="adminDeleteScheduled('${s.id}')" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

/**
 * Tạo lịch hẹn thông báo mới
 */
async function adminCreateScheduledNotif() {
    const title = document.getElementById("schedNotifTitle")?.value.trim();
    const message = document.getElementById("schedNotifMessage")?.value.trim();
    const type = document.getElementById("schedNotifType")?.value || "system";
    const dateStr = document.getElementById("schedNotifDate")?.value;
    const timeStr = document.getElementById("schedNotifTime")?.value;
    const repeat = document.getElementById("schedNotifRepeat")?.value || "once";

    if (!title) {
        showNotification("Vui lòng nhập tiêu đề!", "warning");
        return;
    }
    if (!message) {
        showNotification("Vui lòng nhập nội dung!", "warning");
        return;
    }
    if (!dateStr || !timeStr) {
        showNotification("Vui lòng chọn ngày và giờ gửi!", "warning");
        return;
    }

    // Parse ngày giờ
    const scheduledDate = new Date(`${dateStr}T${timeStr}:00`);
    const now = new Date();

    if (scheduledDate <= now && repeat === "once") {
        showNotification("Thời gian gửi phải ở tương lai!", "warning");
        return;
    }

    try {
        showLoading(true, "Đang tạo lịch hẹn...");

        await supabase.from('scheduled_notifications').insert({
            title: title,
            message: message,
            type: type,
            scheduled_at: scheduledDate.toISOString(),
            repeat: repeat,
            status: "pending", // pending | sent | paused
            created_at: new Date().toISOString(),
            last_sent_at: null
        });

        showNotification("Đã tạo lịch hẹn thành công!", "success");

        // Reset form
        document.getElementById("schedNotifTitle").value = "";
        document.getElementById("schedNotifMessage").value = "";
        document.getElementById("schedNotifType").value = "system";
        document.getElementById("schedNotifDate").value = "";
        document.getElementById("schedNotifTime").value = "";
        document.getElementById("schedNotifRepeat").value = "once";
    } catch (err) {
        console.error("Lỗi tạo lịch hẹn:", err);
        showNotification("Không thể tạo lịch hẹn!", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Tạm dừng / Kích hoạt lịch hẹn
 */
async function adminToggleScheduled(schedId) {
    if (!supabase || !schedId) return;
    try {
        const item = allScheduledNotifs.find(s => s.id === schedId);
        if (!item) return;

        const newStatus = (item.status === "paused") ? "pending" : "paused";

        const { error } = await supabase
            .from('scheduled_notifications')
            .update({ status: newStatus })
            .eq('id', schedId);

        if (error) throw error;

        showNotification(newStatus === "paused" ? "Đã tạm dừng lịch hẹn" : "Đã kích hoạt lại lịch hẹn", "success");
        loadScheduledNotifications();
    } catch (err) {
        console.error("Lỗi toggle scheduled Supabase:", err);
    }
}

/**
 * Xóa 1 lịch hẹn
 */
async function adminDeleteScheduled(schedId) {
    if (!supabase || !schedId) return;
    if (!await customConfirm("Bạn có chắc muốn xóa lịch hẹn này?", { title: "Xóa lịch hẹn", type: "danger", confirmText: "Xóa" })) return;
    try {
        const { error } = await supabase.from('scheduled_notifications').delete().eq('id', schedId);
        if (error) throw error;
        showNotification("Đã xóa lịch hẹn!", "success");
        loadScheduledNotifications();
    } catch (err) {
        console.error("Lỗi xóa scheduled Supabase:", err);
        showNotification("Không thể xóa lịch hẹn!", "error");
    }
}

/**
 * Xóa tất cả lịch hẹn
 */
async function adminDeleteAllScheduled() {
    if (!supabase || allScheduledNotifs.length === 0) {
        showNotification("Không có lịch hẹn nào để xóa!", "info");
        return;
    }
    if (!await customConfirm(`Xóa tất cả ${allScheduledNotifs.length} lịch hẹn? Không thể hoàn tác!`, { title: "Xóa tất cả lịch", type: "danger", confirmText: "Xóa tất cả" })) return;

    try {
        showLoading(true, "Đang xóa...");
        const { error } = await supabase.from('scheduled_notifications').delete().neq('id', '0');
        if (error) throw error;

        showNotification(`Đã xóa tất cả lịch hẹn!`, "success");
        loadScheduledNotifications();
    } catch (err) {
        console.error("Lỗi xóa tất cả scheduled Supabase:", err);
        showNotification("Có lỗi xảy ra!", "error");
    } finally {
        showLoading(false);
    }
}

// Schedule checker đã chuyển sang notifications.js (chạy ngầm cho mọi user)

window.copyApiUrlBackup = function() {
    const input = document.getElementById("movieApiUrlBackup");
    if (!input || !input.value) {
        showNotification("Không có Link API để copy!", "info");
        return;
    }
    
    navigator.clipboard.writeText(input.value)
        .then(() => {
            showNotification("Đã copy Link API vào khay nhớ tạm!", "success");
        })
        .catch(err => {
            console.error("Lỗi copy clipboard:", err);
            // Fallback copy logic
            input.select();
            document.execCommand("copy");
            showNotification("Đã copy Link API vào khay nhớ tạm!", "success");
        });
}

// --- SMART ACTOR SELECTION LOGIC ---
window.selectedMovieActors = [];

window.initSmartActorsFromCastString = function(castString, castData = []) {
    window.selectedMovieActors = [];
    
    // 1. Ưu tiên sử dụng castData (nếu phim đã được đồng bộ ID)
    if (Array.isArray(castData) && castData.length > 0) {
        castData.forEach(item => {
            // Tìm thông tin mới nhất từ kho
            const dbActor = allActors.find(a => a.id === item.id);
            window.selectedMovieActors.push({
                id: item.id,
                name: item.name,
                avatar: dbActor ? dbActor.avatar : null,
                isFallback: !dbActor
            });
        });
    } 
    // 2. Dự phòng dùng chuỗi văn bản (cho phim cũ chưa sync)
    else if (castString) {
        const names = castString.split(",").map(n => n.trim()).filter(n => n);
        names.forEach(name => {
            const actorObj = allActors.find(a => 
                a.name.toLowerCase() === name.toLowerCase() ||
                (a.altNames || []).some(alt => alt.toLowerCase() === name.toLowerCase())
            );
            if (actorObj) {
                window.selectedMovieActors.push({
                    id: actorObj.id,
                    name: actorObj.name,
                    avatar: actorObj.avatar,
                    isFallback: false
                });
            } else {
                window.selectedMovieActors.push({
                    id: 'fallback-' + Date.now().toString().slice(-8) + Math.random(),
                    name: name,
                    avatar: null,
                    isFallback: true
                });
            }
        });
    }
    
    // Luôn gọi render để cập nhật UI
    renderSelectedActors();
}

/**
 * Tự động tạo diễn viên mới vào collection actors nếu chưa tồn tại
 * Trả về mảng {id, name} của các diễn viên để lưu vào phim
 */
async function autoCreateNewActors(castString) {
    if (!castString || !supabase) return [];
    
    // Đảm bảo load diễn viên mới nhất để so sánh
    if (typeof loadActors === 'function' && (!allActors || allActors.length === 0)) {
        await loadActors();
    }
    
    const names = castString.split(",").map(n => n.trim()).filter(n => n);
    let createdCount = 0;
    let finalCastData = [];
    
    for (const name of names) {
        // Kiểm tra đã có trong allActors chưa
        const actorObj = allActors.find(a => 
            a.name.toLowerCase() === name.toLowerCase() ||
            (a.altNames || []).some(alt => alt.toLowerCase() === name.toLowerCase())
        );
        
        if (actorObj) {
            finalCastData.push({ id: actorObj.id, name: actorObj.name });
            continue;
        }
        
        // Tạo slug từ tên
        const slug = name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '-');
        const id = slug + '-' + Math.floor(Math.random() * 10000);
        
        try {
            const newActor = {
                id: id,
                name: name,
                avatar: '',
                dob: null, // Sử dụng null thay cho chuỗi rỗng cho cột Date
                gender: '',
                role: 'actor',
                alt_names: '', // Database đang để là Text
                bio: '',
                auto_created: true,
                created_at: new Date().toISOString()
            };
            
            console.log(`DEBUG: Đang tạo diễn viên ${name}...`, newActor);
            const { error } = await supabase.from('actors').insert(newActor);
            if (error) {
                console.error(`Chi tiết lỗi tạo diễn viên ${name}:`, error);
                throw error;
            }
            
            // Tạo bản sao local với Date thực tế để sort newest hoạt động ngay
            const localActor = { ...newActor, createdAt: new Date() };
            
            // Thêm vào allActors local
            allActors.push(localActor);
            finalCastData.push({ id: id, name: name });
            createdCount++;
        } catch (err) {
            console.error(`Lỗi tạo diễn viên mới "${name}":`, err);
            // Fallback nếu lỗi tạo
            finalCastData.push({ id: 'fallback-' + Date.now().toString().slice(-8), name: name });
        }
    }
    
    
    if (createdCount > 0) {
        // Cập nhật danh sách "Mới (Từ Phim)" - Reset mỗi đợt mới như user yêu cầu
        const createdIds = finalCastData.filter(a => !a.id.startsWith('fallback-')).map(a => a.id);
        if (createdIds.length > 0) {
            window.setLatestAutoActorIds(createdIds, false); // Nạp từ API OPhim: reset batch mới
            
            // Đồng bộ luôn vào latestAddedActorIds để nó hiện lên đầu khi sort newest
            window.setLatestActorIds(createdIds, true); // Append vào list NEW chung
        }

        console.log(`✅ Đã tự động tạo ${createdCount} diễn viên mới vào kho`);
        showNotification(`Đã tự động thêm ${createdCount} diễn viên mới vào kho quản lý`, "info");
        
        // Refresh bảng diễn viên và bắt buộc sort Newest để hiện lên đầu
        const sortSelect = document.getElementById("adminSortActor");
        if (sortSelect) {
            sortSelect.value = "newest"; // Tự động chuyển sang mới nhất
        }
        
        if (typeof renderAdminActors === 'function') {
            renderAdminActors();
        }
    }
    
    return finalCastData;
}

/**
 * Đồng bộ hóa dữ liệu diễn viên cho tất cả các phim (Batch Update)
 * Quét toàn bộ phim, đối chiếu tên diễn viên với kho và cập nhật ID chính xác vào castData
 */
window.syncAllMoviesActors = async function() {
    if (!supabase) return;
    
    const confirmed = await customConfirm("Hệ thống sẽ quét toàn bộ phim để chuẩn hóa liên kết diễn viên. Bạn có chắc chắn muốn thực hiện?", {
        title: "Xác nhận đồng bộ hóa",
        type: "warning"
    });
    if (!confirmed) return;
    
    try {
        showLoading(true, "Đang chuẩn hóa liên kết Diễn viên - Phim...");
        
        // 1. Tải toàn bộ diễn viên mới nhất
        if (typeof loadActors === 'function') await loadActors();
        
        // 2. Lấy toàn bộ phim
        const { data: movies, error: fetchError } = await supabase.from('movies').select('*');
        if (fetchError) throw fetchError;
        
        let updateCount = 0;
        let totalMovies = movies.length;
        
        console.log(`🚀 Bắt đầu đồng bộ cho ${totalMovies} phim...`);
        
        for (let i = 0; i < totalMovies; i++) {
            const movie = movies[i];
            const castString = movie.cast || "";
            
            if (!castString) continue;
            
            // Xử lý lấy IDs cho danh sách tên trong cast
            const newCastData = await autoCreateNewActors(castString);
            
            // Chỉ cập nhật nếu cast_data thay đổi hoặc chưa có
            const currentCastDataJson = JSON.stringify(movie.cast_data || []);
            const newCastDataJson = JSON.stringify(newCastData);
            
            if (currentCastDataJson !== newCastDataJson) {
                const { error: updateErr } = await supabase.from('movies')
                    .update({
                        cast_data: newCastData,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', movie.id);
                
                if (updateErr) throw updateErr;
                
                updateCount++;
                console.log(`✅ Đã đồng bộ phim: ${movie.title}`);
            }
            
            // Cập nhật text loading
            const loadingText = document.getElementById("loadingText");
            if (loadingText) {
                loadingText.textContent = `Đang đồng bộ: ${i + 1}/${totalMovies} phim... (Đã cập nhật ${updateCount})`;
            }
        }
        
        showNotification(`Đồng bộ thành công! Đã chuẩn hóa dữ liệu cho ${updateCount} phim.`, "success");
        
        // Reload lại danh sách phim nếu đang ở trang quản lý
        if (typeof loadAdminMovies === 'function') await loadAdminMovies();
        
    } catch (err) {
        console.error("Lỗi khi đồng bộ Diễn viên - Phim:", err);
        showNotification("Có lỗi xảy ra trong quá trình đồng bộ!", "error");
    } finally {
        showLoading(false);
    }
}

window.renderSelectedActors = function() {
    const container = document.getElementById("actorPillsContainer");
    if (!container) return;
    
    container.innerHTML = window.selectedMovieActors.map(actor => {
        // --- REACTIVE LOOKUP: Luôn tìm thông tin mới nhất từ kho allActors ---
        let latestAvatar = actor.avatar;
        let isFallback = actor.isFallback;
        
        if (typeof allActors !== 'undefined' && allActors) {
            // Tìm theo ID (bền vững) hoặc Tên (dự phòng)
            const dbActor = allActors.find(a => 
                (actor.id && a.id === actor.id) || 
                a.name.toLowerCase() === actor.name.toLowerCase() ||
                (a.altNames || []).some(alt => alt.toLowerCase() === actor.name.toLowerCase())
            );
            
            if (dbActor) {
                latestAvatar = dbActor.avatar;
                isFallback = false; // "Nâng cấp" từ fallback lên chính quy nếu đã có trong kho
            }
        }

        const avatarHtml = isFallback 
            ? `<div style="width:24px;height:24px;border-radius:50%;background:#555;display:flex;align-items:center;justify-content:center;font-size:10px;"><i class="fas fa-user"></i></div>`
            : `<img src="${latestAvatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(actor.name)+'&background=random&color=fff'}" alt="${actor.name}">`;
            
        return `
            <div class="actor-pill ${isFallback ? 'fallback' : ''}">
                ${avatarHtml}
                <span>${actor.name}</span>
                <span class="actor-pill-remove" onclick="removeActorFromMovie('${actor.id}')"><i class="fas fa-times"></i></span>
            </div>
        `;
    }).join("");
    
    // Sync to hidden input
    document.getElementById("movieCast").value = window.selectedMovieActors.map(a => a.name).join(", ");
}

window.searchActorInput = function(query) {
    const dropdown = document.getElementById("actorSuggestionsDropdown");
    if (!dropdown) return;
    
    if (!query || query.trim() === "") {
        dropdown.style.display = "none";
        return;
    }
    
    const q = query.toLowerCase().trim();
    // Lọc diễn viên có tên hoặc tên gọi khác chứa query, và chưa được chọn
    const results = allActors.filter(a => {
        const nameMatch = a.name.toLowerCase().includes(q);
        const altMatch = (a.altNames || []).some(alt => alt.toLowerCase().includes(q));
        const isNotSelected = !window.selectedMovieActors.some(sel => sel.id === a.id);
        return (nameMatch || altMatch) && isNotSelected;
    }).slice(0, 10); // Lấy tối đa 10 kết quả
    
    if (results.length === 0) {
        dropdown.innerHTML = `<div style="padding: 10px 15px; color: var(--text-muted); font-size: 0.9rem;">Nhấn Enter để thêm "${query}"</div>`;
    } else {
        dropdown.innerHTML = results.map(actor => {
            const avatarUrl = actor.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(actor.name)}&background=random&color=fff`;
            return `
                <div class="actor-suggestion-item" onmousedown="addActorToMovie('${actor.id}', '${actor.name}', '${avatarUrl}')">
                    <img src="${avatarUrl}" alt="${actor.name}">
                    <div class="actor-suggestion-info">
                        <span class="actor-suggestion-name">${actor.name}</span>
                        <span class="actor-suggestion-id">ID: ${actor.id}</span>
                    </div>
                </div>
            `;
        }).join("");
    }
    
    dropdown.style.display = "block";
}

window.addActorToMovie = function(id, name, avatar) {
    // Check nếu đã có
    if (window.selectedMovieActors.some(a => a.id === id)) return;
    
    window.selectedMovieActors.push({ id, name, avatar, isFallback: false });
    renderSelectedActors();
    
    // Clear input
    const input = document.getElementById("smartActorInput");
    if (input) {
        input.value = "";
        input.focus();
    }
    closeActorSuggestions();
}

window.addFallbackActorToMovie = function(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    
    // Check nếu đã có tên này
    if (window.selectedMovieActors.some(a => a.name.toLowerCase() === trimmed.toLowerCase())) return;
    
    window.selectedMovieActors.push({
        id: 'fallback-' + Date.now().toString().slice(-8) + Math.random(),
        name: trimmed,
        avatar: null,
        isFallback: true
    });
    renderSelectedActors();
    
    // Clear input
    const input = document.getElementById("smartActorInput");
    if (input) input.value = "";
    closeActorSuggestions();
}

window.removeActorFromMovie = function(id) {
    window.selectedMovieActors = window.selectedMovieActors.filter(a => a.id !== id);
    renderSelectedActors();
}

window.closeActorSuggestions = function() {
    const dropdown = document.getElementById("actorSuggestionsDropdown");
    if (dropdown) dropdown.style.display = "none";
}

window.handleSmartActorKeyDown = function(event) {
    if (event.key === "Enter") {
        event.preventDefault(); // Tránh submit form
        const input = document.getElementById("smartActorInput");
        if (input && input.value.trim() !== "") {
            addFallbackActorToMovie(input.value);
        }
    }
}

/**
 * Import diễn viên từ RapChieuPhim.com API
 */
window.fetchActorsFromRapChieuPhim = async function() {
    const apiKey = document.getElementById("rapApiKeyInput").value.trim();
    const page = document.getElementById("rapApiPageInput").value || 1;
    const resultsDiv = document.getElementById("rapActorApiImportResults");
    
    if (!apiKey) {
        showNotification("Vui lòng nhập API Key!", "warning");
        return;
    }
    
    const API_URL = `https://rapchieuphim.com/api/v1/actors?page=${page}`;
    
    try {
        showLoading(true, "Đang tải dữ liệu từ RapChieuPhim...");
        
        const response = await fetch(API_URL, {
            headers: {
                'x-api-key': apiKey
            }
        });
        
        if (!response.ok) throw new Error(`Lỗi kết nối: ${response.status}`);
        
        const actors = await response.json();
        if (!Array.isArray(actors)) {
            throw new Error("Dữ liệu trả về không phải mảng diễn viên!");
        }
        
        let imported = 0;
        let skipped = 0;
        let updatesAvailable = [];
        let importedNames = [];
        let newActorIds = [];
        
        for (const act of actors) {
            const name = act.name || "";
            if (!name) { skipped++; continue; }

            const incomingData = {
                name: name,
                avatar: act.thumb_url || act.avatar || act.thumb || "",
                bio: act.bio || act.content || "",
                birthday: act.birthday || "",
                gender: act.gender || "",
                alt_names: act.alt_names || [],
                auto_created: true
            };

            const existingActor = allActors.find(a => 
                (a.name && a.name.toLowerCase() === name.toLowerCase()) ||
                (a.alt_names && a.alt_names.some(alt => alt.toLowerCase() === name.toLowerCase()))
            );

            if (existingActor) {
                // Kiểm tra xem có thông tin mới để bổ sung không
                const hasNewInfo = 
                    (!existingActor.avatar && incomingData.avatar) ||
                    (!existingActor.bio && incomingData.bio) ||
                    (!existingActor.birthday && incomingData.birthday);
                
                if (hasNewInfo) {
                    updatesAvailable.push({
                        local: existingActor,
                        remote: incomingData
                    });
                }
                skipped++;
                continue;
            }
            
            // Tạo ID từ slug
            const baseId = act.slug || createActorIdFromName(name);
            const newId = `${baseId}-${Date.now()}`;
            
            const actorData = {
                id: newId,
                ...incomingData,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            const { error } = await supabase.from('actors').insert(actorData);
            if (error) throw error;
            
            // Fix sorting: Dùng Date thực tế cho local copy
            const localActor = { ...actorData, createdAt: new Date() };
            allActors.push(localActor);
            imported++;
            importedNames.push(name);
            newActorIds.push(newId);
        }

        if (newActorIds.length > 0) {
            window.setLatestActorIds(newActorIds, false); // Nạp từ API RapChieuPhim: reset batch mới
            const sortSelect = document.getElementById("adminSortActor");
            if (sortSelect) sortSelect.value = "newest";
        }
        
        // Reload lại kho diễn viên
        await loadActors();
        renderAdminActors();
        
        // Hiển thị kết quả
        let resultHtml = `
            <div style="background: var(--bg-tertiary); border-radius: 8px; padding: 12px; font-size: 0.9rem; border: 1px solid rgba(255,107,107,0.3);">
                <div style="color: #51cf66; font-weight: 600; margin-bottom: 5px;">✅ Đã thêm mới: ${imported}</div>
                ${imported > 0 ? `<div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 10px;">(${importedNames.join(", ")})</div>` : ""}
                <div style="color: #aaa; margin-bottom: ${updatesAvailable.length > 0 ? '10px' : '0'};">⏭️ Đã bỏ qua (đã đầy đủ): ${skipped}</div>
                ${updatesAvailable.length > 0 ? `
                    <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; margin-top: 5px;">
                        <div style="color: var(--accent-secondary); font-weight: 600; margin-bottom: 8px;">✨ Có ${updatesAvailable.length} diễn viên có thể bổ sung thông tin!</div>
                        <button class="btn btn-primary btn-sm" onclick='showImportComparison(${JSON.stringify(updatesAvailable).replace(/'/g, "&apos;")})' style="width: 100%; font-size: 0.8rem; padding: 6px;">
                            Xem & Duyệt bổ sung ngay
                        </button>
                    </div>
                ` : ""}
            </div>
        `;
        
        if (resultsDiv) resultsDiv.innerHTML = resultHtml;
        showNotification(`Đã quét xong từ RapChieuPhim! Thêm mới: ${imported}, Chờ duyệt bổ sung: ${updatesAvailable.length}`, "success");
        
    } catch (error) {
        console.error("Lỗi RapChieuPhim API:", error);
        showNotification(error.message, "error");
    } finally {
        showLoading(false);
    }
}



/**
 * Lưu API Key RapChieuPhim vào Supabase
 */
async function saveRapApiKey() {
    const apiKey = document.getElementById("rapApiKeyInput")?.value.trim();
    if (!apiKey) {
        showNotification("Vui lòng nhập API Key!", "warning");
        return;
    }

    try {
        showLoading(true, "Đang lưu API Key...");
        
        const { error } = await supabase.from('app_configs').upsert({
            key: 'api_keys',
            value: { rapchieuphim: apiKey },
            updated_at: new Date().toISOString()
        });

        if (error) throw error;
        
        showNotification("Đã lưu API Key RapChieuPhim thành công!", "success");
    } catch (error) {
        console.error("Lỗi lưu API Key Supabase:", error);
        showNotification("Lỗi khi lưu API Key: " + error.message, "error");
    } finally {
        showLoading(false);
    }
}
window.saveRapApiKey = saveRapApiKey;

/**
 * Tải API Key RapChieuPhim từ Supabase
 */
window.loadRapApiKey = async function() {
    const input = document.getElementById("rapApiKeyInput");
    if (!input || !supabase) return;

    try {
        const { data, error } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'api_keys')
            .maybeSingle();
        
        if (data && data.value && data.value.rapchieuphim) {
            input.value = data.value.rapchieuphim;
        }
    } catch (error) {
        console.error("Lỗi tải API Key Supabase:", error);
    }
}

/**
 * Sao chép API Key RapChieuPhim vào khay nhớ tạm
 */
window.copyRapApiKey = function() {
    const input = document.getElementById("rapApiKeyInput");
    if (!input || !input.value) {
        showNotification("Không có Key để sao chép!", "warning");
        return;
    }

    input.select();
    input.setSelectionRange(0, 99999); // Cho mobile

    navigator.clipboard.writeText(input.value)
        .then(() => {
            showNotification("Đã sao chép API Key vào khay nhớ tạm!", "success");
        })
        .catch(err => {
            console.error("Lỗi copy:", err);
            showNotification("Lỗi khi sao chép!", "error");
        });

}

/**
 * Kiểm tra trùng lặp diễn viên thời gian thực
 */
window.checkActorDuplicate = function(name) {
    const suggestionsDiv = document.getElementById("actorDuplicateSuggestions");
    if (!suggestionsDiv) return;

    name = name.trim().toLowerCase();
    
    if (!name || name.length < 2) {
        suggestionsDiv.innerHTML = "";
        suggestionsDiv.style.display = "none";
        return;
    }

    // Tìm kiếm trong allActors (bao gồm cả tên gọi khác)
    const duplicates = (allActors || []).filter(a => {
        const primaryMatch = a.name && a.name.toLowerCase().includes(name);
        const altMatch = a.altNames && a.altNames.some(alt => alt.toLowerCase().includes(name));
        return primaryMatch || altMatch;
    }).slice(0, 5); // Giới hạn 5 kết quả gợi ý

    if (duplicates.length === 0) {
        suggestionsDiv.innerHTML = "";
        suggestionsDiv.style.display = "none";
        return;
    }

    suggestionsDiv.innerHTML = `
        <div style="padding: 10px 15px; font-size: 0.8rem; color: #ff4444; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,68,68,0.05);">
            <i class="fas fa-exclamation-triangle"></i> Phát hiện diễn viên tương tự đã có:
        </div>
        ${duplicates.map(a => `
            <div class="suggestion-item warning-item" onclick="selectDuplicateActor('${a.id}')">
                <img src="${a.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(a.name)}" 
                     style="width: 24px; height: 24px; border-radius: 50%; margin-right: 10px; object-fit: cover;">
                <div style="flex:1">
                    <div style="font-weight: 600; font-size: 0.9rem;">${a.name}</div>
                    <div style="font-size: 0.75rem; opacity: 0.7;">${a.country || 'Nơi sống: Chưa rõ'} • ${a.gender || 'Giới tính: Chưa rõ'}</div>
                </div>
                <div style="color: var(--accent-secondary); font-size: 0.7rem; font-weight: bold; border: 1px solid currentColor; padding: 2px 6px; border-radius: 4px;">CHỌN ĐỂ SỬA</div>
            </div>
        `).join("")}
    `;
    
    suggestionsDiv.style.display = "block";
}

/**
 * Chọn diễn viên trùng để chuyển sang chế độ chỉnh sửa
 */
window.selectDuplicateActor = function(actorId) {
    const actor = (allActors || []).find(a => a.id === actorId);
    if (!actor) return;

    // Đóng danh sách gợi ý
    const suggestionsDiv = document.getElementById("actorDuplicateSuggestions");
    if (suggestionsDiv) suggestionsDiv.style.display = "none";

    // Điền thông tin vào form
    document.getElementById("actorId").value = actor.id;
    document.getElementById("actorName").value = actor.name;
    document.getElementById("actorAvatar").value = actor.avatar || "";
    document.getElementById("actorAltNames").value = (actor.altNames || []).join(", ");
    document.getElementById("actorRole").value = actor.role || "actor";
    document.getElementById("actorGender").value = actor.gender || "";
    document.getElementById("actorDob").value = actor.dob || "";
    document.getElementById("actorBio").value = actor.bio || "";
    document.getElementById("actorCountry").value = actor.country || "";

    // Cập nhật tiêu đề và preview
    const title = document.getElementById("actorModalTitle");
    if (title) title.textContent = "Chỉnh Sửa Diễn Viên (Trùng lặp)";
    
    if (typeof updateActorPreview === 'function') updateActorPreview();

    showNotification("Đã chuyển sang chế độ chỉnh sửa diễn viên đã có!", "info");
}

// --- LOGIC SO SÁNH & CẬP NHẬT DIỄN VIÊN TỪ API ---
let pendingActorUpdates = [];
let currentCompareIndex = 0;

/**
 * Kiểm tra xem dữ liệu mới có "đầy đủ" hoặc "tốt hơn" dữ liệu cũ không
 */
function checkActorDataImprovement(current, incoming) {
    let improvements = {};
    let hasImprovement = false;

    // Các trường cần so sánh
    const fields = [
        { key: 'avatar', label: 'Ảnh đại diện', type: 'image' },
        { key: 'gender', label: 'Giới tính', type: 'text' },
        { key: 'dob', label: 'Ngày sinh', type: 'text' },
        { key: 'country', label: 'Nơi sống', type: 'text' },
        { key: 'bio', label: 'Tiểu sử', type: 'longtext' }
    ];

    fields.forEach(f => {
        const valOld = (current[f.key] || "").toString().trim();
        const valNew = (incoming[f.key] || "").toString().trim();

        // Nếu bản cũ trống mà bản mới có dữ liệu -> Improvement
        if (!valOld && valNew) {
            improvements[f.key] = { old: valOld, new: valNew, label: f.label, type: f.type };
            hasImprovement = true;
        } 
        // Nếu là tiểu sử, bản mới dài hơn đáng kể (> 20 ký tự) -> Improvement
        else if (f.key === 'bio' && valNew.length > valOld.length + 20) {
            improvements[f.key] = { old: valOld, new: valNew, label: f.label, type: f.type };
            hasImprovement = true;
        }
    });

    // So sánh alt_names (tên gọi khác)
    const altOldRaw = current.alt_names || "";
    const altOld = altOldRaw.split(",").map(n => n.trim()).filter(n => n);
    const altNew = incoming.altNames || []; // incoming từ API OPhim là mảng
    const missingAlts = altNew.filter(n => !altOld.map(x => x.toLowerCase()).includes(n.toLowerCase()));
    
    if (missingAlts.length > 0) {
        improvements['alt_names'] = { 
            old: altOld.join(", "), 
            new: [...new Set([...altOld, ...altNew])].join(", "), 
            label: 'Tên gọi khác', 
            type: 'text' 
        };
        hasImprovement = true;
    }

    return hasImprovement ? improvements : null;
}

/**
 * Hiển thị giao diện so sánh khi kết thúc quét API
 */
window.showImportComparison = function(updates) {
    if (!updates || updates.length === 0) return;
    
    pendingActorUpdates = updates;
    currentCompareIndex = 0;
    
    const modal = document.getElementById("actorImportCompareModal");
    if (!modal) return;
    
    renderCompareTable();
    openModal("actorImportCompareModal");
}

/**
 * Render dữ liệu so sánh của diễn viên hiện tại trong mảng pending
 */
function renderCompareTable() {
    const item = pendingActorUpdates[currentCompareIndex];
    if (!item) return;
    
    const tbody = document.getElementById("actorCompareList");
    const currentIndexLabel = document.getElementById("compareCurrentIndex");
    const totalLabel = document.getElementById("compareTotal");
    const totalAllLabel = document.getElementById("compareTotalAll");
    const countLabel = document.getElementById("compareCount");
    
    if (currentIndexLabel) currentIndexLabel.textContent = currentCompareIndex + 1;
    if (totalLabel) totalLabel.textContent = pendingActorUpdates.length;
    if (totalAllLabel) totalAllLabel.textContent = pendingActorUpdates.length;
    if (countLabel) countLabel.textContent = pendingActorUpdates.length;
    
    let html = `
        <tr style="background: rgba(255,255,255,0.02);">
            <td colspan="3" style="text-align: center; font-weight: bold; color: var(--accent-secondary);">
                Đối chiếu Diễn viên: ${item.current.name}
            </td>
        </tr>
    `;
    
    const improvements = item.improvements;
    Object.keys(improvements).forEach(key => {
        const info = improvements[key];
        
        let oldDisplay = info.old || '<span class="compare-empty">(Trống)</span>';
        let newDisplay = `<span class="compare-highlight">${info.new}</span>`;
        
        if (info.type === 'image') {
            oldDisplay = info.old ? `<img src="${info.old}" class="compare-avatar-img">` : '<span class="compare-empty">(Chưa có ảnh)</span>';
            newDisplay = `<img src="${info.new}" class="compare-avatar-img" style="border: 2px solid #51cf66;">`;
        } else if (info.type === 'longtext') {
            oldDisplay = `<div style="max-height: 100px; overflow-y: auto; font-size: 0.85rem;">${info.old || '(Trống)'}</div>`;
            newDisplay = `<div style="max-height: 100px; overflow-y: auto; font-size: 0.85rem;" class="compare-highlight">${info.new}</div>`;
        }
        
        html += `
            <tr>
                <td class="compare-label">${info.label}</td>
                <td class="compare-old">${oldDisplay}</td>
                <td class="compare-new">${newDisplay}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Cập nhật trạng thái nút
    const btnPrev = document.getElementById("btnPrevCompare");
    const btnNext = document.getElementById("btnNextCompare");
    if (btnPrev) btnPrev.disabled = currentCompareIndex === 0;
    if (btnNext) btnNext.disabled = currentCompareIndex === pendingActorUpdates.length - 1;
}

/**
 * Điều hướng giữa các diễn viên chờ duyệt
 */
window.navigateCompare = function(dir) {
    const nextIdx = currentCompareIndex + dir;
    if (nextIdx >= 0 && nextIdx < pendingActorUpdates.length) {
        currentCompareIndex = nextIdx;
        renderCompareTable();
    }
}

/**
 * Duyệt cập nhật cho diễn viên hiện tại
 */
window.applyCurrentActorUpdate = async function() {
    const item = pendingActorUpdates[currentCompareIndex];
    if (!item) return;
    
    try {
        showLoading(true, "Đang cập nhật diễn viên...");
        
        const updateData = {};
        Object.keys(item.improvements).forEach(key => {
            updateData[key] = item.improvements[key].new;
        });
        updateData.updated_at = new Date().toISOString();
        
        const { error } = await supabase.from('actors').update(updateData).eq('id', item.current.id);
        if (error) throw error;
        
        showNotification(`Đã bổ sung thông tin cho ${item.current.name}!`, "success");
        
        if (typeof window.setLatestActorIds === 'function') window.setLatestActorIds(item.current.id, true);
        const sortSelect = document.getElementById("adminSortActor");
        if (sortSelect) sortSelect.value = "newest";

        // Xóa khỏi danh sách chờ
        pendingActorUpdates.splice(currentCompareIndex, 1);
        
        if (pendingActorUpdates.length === 0) {
            closeModal("actorImportCompareModal");
            if (typeof loadActors === "function") await loadActors();
            renderAdminActors();
        } else {
            if (currentCompareIndex >= pendingActorUpdates.length) {
                currentCompareIndex = pendingActorUpdates.length - 1;
            }
            renderCompareTable();
        }
    } catch (err) {
        console.error("Lỗi cập nhật diễn viên Supabase:", err);
        showNotification("Lỗi: " + err.message, "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Duyệt cập nhật cho tất cả diễn viên trong danh sách chờ
 */
window.applyAllActorUpdates = async function() {
    if (pendingActorUpdates.length === 0) return;
    
    const confirmed = await customConfirm(`Bạn có chắc muốn cập nhật thông tin bổ sung cho TẤT CẢ ${pendingActorUpdates.length} diễn viên này không?`);
    if (!confirmed) return;
    
    try {
        showLoading(true, `Đang cập nhật ${pendingActorUpdates.length} diễn viên...`);
        
        const updatedIds = []; 

        for (const item of pendingActorUpdates) {
            const updateData = {};
            updatedIds.push(item.current.id);
            Object.keys(item.improvements).forEach(key => {
                updateData[key] = item.improvements[key].new;
            });
            updateData.updated_at = new Date().toISOString();
            
            const { error } = await supabase.from('actors').update(updateData).eq('id', item.current.id);
            if (error) throw error;
        }
        
        if (updatedIds.length > 0) {
            if (typeof window.setLatestActorIds === 'function') window.setLatestActorIds(updatedIds, true);
            const sortSelect = document.getElementById("adminSortActor");
            if (sortSelect) sortSelect.value = "newest";
        }
        
        showNotification(`Đã hoàn tất bổ sung dữ liệu cho ${updatedIds.length} diễn viên!`, "success");
        pendingActorUpdates = [];
        closeModal("actorImportCompareModal");
        
        if (typeof loadActors === "function") await loadActors();
        renderAdminActors();
    } catch (err) {
        console.error("Lỗi cập nhật hàng loạt Supabase:", err);
        showNotification("Lỗi: " + err.message, "error");
    } finally {
        showLoading(false);
    }
}

/**
 * QUẢN LÝ KHO AVATAR (AVATAR LIBRARY)
 */
let currentAvatarLibraryFilter = 'all'; 
let selectedAvatarIds = []; // Danh sách IDs avatar đang được chọn

// Load danh sách avatar trong trang Admin
async function adminLoadAvatarLibrary() {
    // Load danh mục trước để có dữ liệu cho dropdown và filter
    await adminLoadAvatarCategories();
    
    const grid = document.getElementById("adminAvatarLibraryGrid");
    const countSpan = document.getElementById("adminAvatarCount");
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner" style="margin: 20px auto;"></div>';

    try {
        // Query * và joined table nếu cần, nhưng ở đây ta map text từ cache cho nhanh
        let query = supabase.from('avatar_library').select('*').order('created_at', { ascending: false });
        
        if (currentAvatarLibraryFilter !== 'all') {
            query = query.eq('category_id', currentAvatarLibraryFilter);
        }

        const { data: avatars, error } = await query;
        if (error) throw error;

        countSpan.innerText = `Số lượng: ${avatars.length}`;

        if (avatars.length === 0) {
            grid.innerHTML = `<p class="text-muted" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                Không tìm thấy ảnh nào.
            </p>`;
            return;
        }

        // Lấy danh sách danh mục để render trong dropdown từng item
        const categories = window.avatarCategoriesCache || [];

        grid.innerHTML = avatars.map(item => {
            const isCloudinary = item.url && item.url.includes("cloudinary.com");
            const sourceIcon = isCloudinary ? "fas fa-cloud" : "fas fa-link";
            const sourceTitle = isCloudinary ? "Ảnh từ Cloudinary" : "Link ảnh trực tiếp";
            const sourceClass = isCloudinary ? "cloudinary" : "direct-link";

            return `
                <div class="avatar-item" data-id="${item.id}" style="border-radius: 12px; border-color: rgba(255,255,255,0.05); cursor: default; position: relative; overflow: hidden;">
                    <!-- Checkbox chọn nhiều -->
                    <input type="checkbox" class="avatar-checkbox" 
                        ${selectedAvatarIds.includes(item.id) ? 'checked' : ''} 
                        onclick="adminToggleAvatarSelection('${item.id}', this.checked)" />

                    <!-- Chỉ báo nguồn ảnh -->
                    <div class="image-source-indicator ${sourceClass}" title="${sourceTitle}">
                        <i class="${sourceIcon}"></i>
                    </div>

                    <img src="${item.url}" alt="Avatar">
                    
                    <!-- Dropdown đổi danh mục trực tiếp (Dùng category_id UUID) -->
                    <select class="avatar-cat-select" onchange="adminChangeAvatarCategory('${item.id}', this.value)">
                        <option value="Chưa phân loại" ${!item.category_id ? 'selected' : ''}>Chưa phân loại</option>
                        ${categories.map(cat => `
                            <option value="${cat.id}" ${item.category_id === cat.id ? 'selected' : ''}>${cat.name}</option>
                        `).join("")}
                    </select>

                    <button class="btn btn-danger btn-sm" onclick="adminDeleteAvatar('${item.id}')" 
                        style="position: absolute; top: 5px; right: 5px; width: 24px; height: 24px; border-radius: 50%; padding: 0; opacity: 0.8; background: #e50914; font-size: 10px; z-index: 2;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }).join("");

        // Cập nhật trạng thái "Chọn tất cả" nếu có dữ liệu
        adminUpdateSelectAllState(avatars);

    } catch (error) {
        console.error("Lỗi load avatar library Supabase:", error);
        grid.innerHTML = '<p class="text-error">Lỗi khi tải dữ liệu.</p>';
    }
}

// Lọc avatar theo danh mục
function adminFilterAvatarsByCat(category) {
    currentAvatarLibraryFilter = category;
    
    // Cập nhật class active cho nút lọc (Dùng thuộc tính onclick hoặc data để so sánh chính xác)
    const buttons = document.querySelectorAll(".avatar-filter-btn");
    buttons.forEach(btn => {
        // Lấy category từ hàm onclick: adminFilterAvatarsByCat('...')
        const onclickAttr = btn.getAttribute("onclick") || "";
        if (onclickAttr.includes(`'${category}'`)) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // Load lại bộ sưu tập
    adminLoadAvatarLibrary();
}

/**
 * Đổi danh mục cho avatar hiện có (Đã đồng bộ UUID)
 * @param {string} avatarId 
 * @param {string} newCategoryId 
 */
async function adminChangeAvatarCategory(avatarId, newCategoryId) {
    try {
        showLoading(true, "Đang cập nhật danh mục...");
        const val = newCategoryId === 'Chưa phân loại' ? null : newCategoryId;
        
        const { error } = await supabase
            .from('avatar_library')
            .update({
                category_id: val
            })
            .eq('id', avatarId);
        
        if (error) throw error;
        
        // Nếu đang ở chế độ lọc và danh mục mới khác danh mục hiện tại -> load lại để ẩn item đó
        if (currentAvatarLibraryFilter !== 'all' && newCategoryId !== currentAvatarLibraryFilter) {
            await adminLoadAvatarLibrary();
        }
        
        showNotification("Cập nhật danh mục thành công!", "success");
    } catch (error) {
        console.error("Lỗi đổi danh mục avatar Supabase:", error);
        showNotification("Lỗi khi cập nhật danh mục", "error");
    } finally {
        showLoading(false);
    }
}

// --- LOGIC CHỌN NHIỀU AVATAR ---

function adminToggleAvatarSelection(id, isChecked) {
    if (isChecked) {
        if (!selectedAvatarIds.includes(id)) selectedAvatarIds.push(id);
    } else {
        selectedAvatarIds = selectedAvatarIds.filter(item => item !== id);
    }
    adminUpdateBulkAvatarBar();
}

function adminToggleSelectAllAvatars(isChecked) {
    const checkboxes = document.querySelectorAll(".avatar-checkbox");
    checkboxes.forEach(cb => {
        const id = cb.closest(".avatar-item").dataset.id;
        cb.checked = isChecked;
        if (isChecked) {
            if (!selectedAvatarIds.includes(id)) selectedAvatarIds.push(id);
        } else {
            selectedAvatarIds = selectedAvatarIds.filter(item => item !== id);
        }
    });
    adminUpdateBulkAvatarBar();
}

function adminClearAvatarSelection() {
    selectedAvatarIds = [];
    document.querySelectorAll(".avatar-checkbox").forEach(cb => cb.checked = false);
    const selectAll = document.getElementById("adminAvatarSelectAll");
    if (selectAll) selectAll.checked = false;
    adminUpdateBulkAvatarBar();
}

function adminUpdateBulkAvatarBar() {
    const bar = document.getElementById("avatarBulkActionsBar");
    const countText = document.getElementById("adminSelectedAvatarCount");
    if (!bar || !countText) return;

    if (selectedAvatarIds.length > 0) {
        bar.classList.add("active");
        countText.innerText = selectedAvatarIds.length;
    } else {
        bar.classList.remove("active");
    }
}

function adminUpdateSelectAllState(currentAvatars) {
    const selectAll = document.getElementById("adminAvatarSelectAll");
    if (!selectAll || currentAvatars.length === 0) return;

    const allCurrentSelected = currentAvatars.every(a => selectedAvatarIds.includes(a.id));
    selectAll.checked = allCurrentSelected;
}

/**
 * Cập nhật danh mục hàng loạt cho các avatar đã chọn
 */
/**
 * Cập nhật danh mục hàng loạt cho các avatar đã chọn (Đã đồng bộ UUID)
 */
async function adminBulkUpdateAvatarCategory() {
    const bulkSelect = document.getElementById("adminBulkAvatarCategory");
    const categoryId = bulkSelect.value;
    if (!categoryId) {
        showNotification("Vui lòng chọn danh mục!", "warning");
        return;
    }

    // Lấy tên danh mục để hiển thị thông báo
    const categoryName = bulkSelect.options[bulkSelect.selectedIndex].text;
    const finalCategoryId = categoryId === 'Chưa phân loại' ? null : categoryId;

    const confirmed = await customConfirm(`Xác nhận đổi danh mục cho ${selectedAvatarIds.length} ảnh sang "${categoryName}"?`, {
        title: "Xác nhận cập nhật hàng loạt",
        type: "warning"
    });
    if (!confirmed) return;

    try {
        showLoading(true, "Đang cập nhật hàng loạt...");
        
        const { error } = await supabase
            .from('avatar_library')
            .update({ 
                category_id: finalCategoryId // Dùng UUID hoặc null
            })
            .in('id', selectedAvatarIds);

        if (error) throw error;
        showNotification(`Đã cập nhật ${selectedAvatarIds.length} ảnh sang danh mục "${categoryName}" thành công!`, "success");
        
        // Hoàn tất
        adminClearAvatarSelection();
        adminLoadAvatarLibrary();
    } catch (error) {
        console.error("Lỗi cập nhật hàng loạt avatar:", error);
        showNotification("Lỗi khi cập nhật hàng loạt. Vui lòng thử lại.", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Xóa hàng loạt avatar đã chọn
 */
async function adminBulkDeleteAvatars() {
    if (selectedAvatarIds.length === 0) return;

    const confirmed = await customConfirm(`Bạn có chắc chắn muốn xóa ${selectedAvatarIds.length} ảnh đã chọn? Hành động này không thể hoàn tác!`, {
        title: "Xác nhận xóa hàng loạt",
        type: "danger"
    });
    if (!confirmed) return;

    try {
        showLoading(true, `Đang xóa ${selectedAvatarIds.length} ảnh...`);
        
        const { error } = await supabase
            .from('avatar_library')
            .delete()
            .in('id', selectedAvatarIds);

        if (error) throw error;

        showNotification(`Đã xóa ${selectedAvatarIds.length} ảnh thành công!`, "success");
        
        // Xóa cache để User load lại
        if (typeof allAvatarsCache !== 'undefined') allAvatarsCache = [];
        
        adminClearAvatarSelection();
        adminLoadAvatarLibrary();
    } catch (error) {
        console.error("Lỗi xóa hàng loạt avatar:", error);
        showNotification("Lỗi khi xóa hàng loạt dữ liệu.", "error");
    } finally {
        showLoading(false);
    }
}

// Biến tạm để lưu file được chọn
// Biến tạm để lưu danh sách file được chọn
let pendingAvatarFiles = [];

// Xử lý khi Admin dán URL
function adminHandleAvatarUrlInput(input) {
    const url = input.value.trim();
    const previewBox = document.getElementById("adminAvatarPreviewBox");
    const previewGrid = document.getElementById("adminAvatarPreviewGrid");
    const previewCount = document.getElementById("adminAvatarPreviewCount");
    const saveBtn = document.getElementById("btnSaveAdminAvatar");
    const cancelBtn = document.getElementById("btnCancelAdminAvatar");

    if (url) {
        // Nếu dán URL, xóa hết các file đang chờ
        pendingAvatarFiles = [];
        document.getElementById("adminAvatarFileUpload").value = "";
        
        previewGrid.innerHTML = `
            <div style="width: 70px; height: 70px; border-radius: 8px; overflow: hidden; border: 2px solid var(--accent-primary); position: relative;">
                <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" />
                <div onclick="adminCancelAvatarAdd()" style="position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; background: #ff4757; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; cursor: pointer; z-index: 10;">
                    <i class="fas fa-times"></i>
                </div>
            </div>
        `;
        previewCount.innerText = "1";
        previewBox.style.display = "flex";
        saveBtn.style.display = "block";
        cancelBtn.style.display = "block";
    } else if (pendingAvatarFiles.length === 0) {
        previewBox.style.display = "none";
        saveBtn.style.display = "none";
        cancelBtn.style.display = "none";
    }
}

// Xử lý khi Admin chọn tệp từ máy (Hỗ trợ nhiều tệp)
function adminHandleAvatarFileSelect(input) {
    if (!input.files || input.files.length === 0) return;

    // Chuyển FileList thành Array và cộng dồn vào danh sách đang chờ (để có thể chọn nhiều lần)
    const newFiles = Array.from(input.files);
    pendingAvatarFiles = [...pendingAvatarFiles, ...newFiles];
    
    // Clear input để có thể chọn lại cùng 1 file nếu đã xóa
    input.value = "";

    // Xóa URL input nếu đang chọn file
    document.getElementById("newAdminAvatarUrl").value = "";
    
    renderAdminAvatarPreviews();
}

/**
 * Hàm render danh sách ảnh xem trước với nút xóa từng ảnh
 */
function renderAdminAvatarPreviews() {
    const previewBox = document.getElementById("adminAvatarPreviewBox");
    const previewGrid = document.getElementById("adminAvatarPreviewGrid");
    const previewCount = document.getElementById("adminAvatarPreviewCount");
    const saveBtn = document.getElementById("btnSaveAdminAvatar");
    const cancelBtn = document.getElementById("btnCancelAdminAvatar");

    if (pendingAvatarFiles.length === 0) {
        previewBox.style.display = "none";
        saveBtn.style.display = "none";
        cancelBtn.style.display = "none";
        previewGrid.innerHTML = "";
        return;
    }

    previewGrid.innerHTML = "";
    previewCount.innerText = pendingAvatarFiles.length;

    pendingAvatarFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const thumb = document.createElement("div");
            thumb.style.cssText = "width: 70px; height: 70px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2); position: relative; group:";
            thumb.className = "preview-thumb-container"; 
            
            thumb.innerHTML = `
                <img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover;" />
                <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); font-size: 8px; color: white; text-align: center; padding: 2px;">
                    ${(file.size / 1024).toFixed(0)}KB
                </div>
                <!-- Nút xóa từng ảnh -->
                <div onclick="adminRemovePendingAvatar(${index})" style="position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; background: #ff4757; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 10;">
                    <i class="fas fa-times"></i>
                </div>
            `;
            previewGrid.appendChild(thumb);
        };
        reader.readAsDataURL(file);
    });

    previewBox.style.display = "flex";
    saveBtn.style.display = "block";
    cancelBtn.style.display = "block";
}

/**
 * Xóa một ảnh cụ thể khỏi danh sách chờ
 */
function adminRemovePendingAvatar(index) {
    pendingAvatarFiles.splice(index, 1);
    renderAdminAvatarPreviews();
}

// Hủy bỏ việc thêm avatar
function adminCancelAvatarAdd() {
    document.getElementById("newAdminAvatarUrl").value = "";
    document.getElementById("adminAvatarFileUpload").value = "";
    document.getElementById("adminAvatarPreviewBox").style.display = "none";
    document.getElementById("adminAvatarPreviewGrid").innerHTML = "";
    document.getElementById("btnSaveAdminAvatar").style.display = "none";
    document.getElementById("btnCancelAdminAvatar").style.display = "none";
    pendingAvatarFiles = [];
}

// Lưu avatar vào kho (Xử lý upload hàng loạt - Đã đồng bộ UUID)
async function adminSaveAvatarToLibrary() {
    const urlInput = document.getElementById("newAdminAvatarUrl");
    const categorySelect = document.getElementById("newAdminAvatarCategory");
    const categoryId = categorySelect.value; // Đây là UUID hoặc 'Chưa phân loại'
    
    const finalUrls = [];
    const urlFromInput = urlInput.value.trim();

    try {
        // 1. Nếu có file đang chờ, tải lên Cloudinary hàng loạt
        if (pendingAvatarFiles.length > 0) {
            showLoading(true, `Đang tải ${pendingAvatarFiles.length} ảnh lên Cloudinary...`);
            
            for (let i = 0; i < pendingAvatarFiles.length; i++) {
                showLoading(true, `Đang tải ảnh (${i + 1}/${pendingAvatarFiles.length})...`);
                const file = pendingAvatarFiles[i];
                const uploadedUrl = await adminPerformCloudinaryUpload(file);
                finalUrls.push(uploadedUrl);
            }
        } else if (urlFromInput) {
            finalUrls.push(urlFromInput);
        }

        if (finalUrls.length === 0) {
            showNotification("Vui lòng chọn ảnh hoặc nhập link!", "warning");
            return;
        }

        // 2. Lưu vào Supabase hàng loạt
        showLoading(true, `Đang lưu ${finalUrls.length} ảnh vào cơ sở dữ liệu...`);
        
        const insertData = finalUrls.map(url => ({
            url: url,
            category_id: categoryId === 'Chưa phân loại' ? null : categoryId,
            created_at: new Date().toISOString()
        }));

        const { error } = await supabase.from('avatar_library').insert(insertData);

        if (error) throw error;

        showNotification(`Đã lưu thành công ${finalUrls.length} avatar!`, "success");
        adminCancelAvatarAdd(); // Reset UI
        
        // Xóa cache để User load lại danh sách mới nhất
        if (typeof allAvatarsCache !== 'undefined') allAvatarsCache = [];
        
        adminLoadAvatarLibrary();
    } catch (error) {
        console.error("Lỗi lưu avatar hàng loạt:", error);
        showNotification("Lỗi khi tải lên hoặc lưu dữ liệu.", "error");
    } finally {
        showLoading(false);
    }
}

// Xóa avatar khỏi kho
async function adminDeleteAvatar(id) {
    const confirmed = await customConfirm("Bạn có chắc chắn muốn xóa avatar này khỏi kho?", {
        title: "Xóa Avatar",
        type: "danger",
        confirmText: "Xóa ngay"
    });

    if (!confirmed) return;

    try {
        const { error } = await supabase.from('avatar_library').delete().eq('id', id);
        if (error) throw error;
        
        showNotification("Đã xóa avatar!", "success");
        adminLoadAvatarLibrary();
    } catch (error) {
        console.error("Lỗi xóa avatar Supabase:", error);
        showNotification("Lỗi khi xóa. Vui lòng thử lại.", "error");
    }
}

// Helper hàm upload Cloudinary
async function adminPerformCloudinaryUpload(file) {
    const CLOUD_NAME = "drhr0h7dd";
    const UPLOAD_PRESET = "tramphim_preset";
    const API_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    formData.append("folder", "movie_assets/Avatar_Accout");

    const response = await fetch(API_URL, {
        method: "POST",
        body: formData
    });

    if (!response.ok) throw new Error("Upload thất bại");

    const data = await response.json();
    return data.secure_url;
}

// --- QUẢN LÝ DANH MỤC AVATAR ---

/**
 * Load danh mục avatar từ Supabase
 */
async function adminLoadAvatarCategories() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('avatar_categories')
            .select('id, name') // Lấy cả ID (UUID)
            .order('name', { ascending: true });
        
        if (error) throw error;
        
        window.avatarCategoriesCache = data || []; // Lưu object để có cả ID
        renderAvatarCategoriesTable(data || []);
    } catch (error) {
        console.error("Lỗi tải danh mục avatar Supabase:", error);
        showNotification("Lỗi khi tải danh sách danh mục.", "error");
    }
}

/**
 * Thêm danh mục mới
 */
async function adminAddAvatarCategory() {
    const input = document.getElementById("newAvatarCategoryName"); // Đã sửa ID cho đúng với HTML
    if (!input || !input.value.trim()) {
        showNotification("Vui lòng nhập tên danh mục!", "warning");
        return;
    }
    
    const name = input.value.trim();
    
    try {
        showLoading(true, "Đang thêm danh mục...");
        const { error } = await supabase.from('avatar_categories').insert({ name: name });
        if (error) throw error;
        
        showNotification(`Đã thêm danh mục "${name}"`, "success");
        input.value = "";
        await adminLoadAvatarCategories();
    } catch (error) {
        console.error("Lỗi thêm danh mục avatar Supabase:", error);
        showNotification("Lỗi khi thêm danh mục. Có thể tên đã tồn tại.", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Hiển thị danh sách danh mục dưới dạng Badge có nút xóa
 */
function renderAvatarCategoriesTable(categories) {
    const listContainer = document.getElementById("adminAvatarCategoryList");
    if (!listContainer) return;

    if (categories.length === 0) {
        listContainer.innerHTML = '<span class="text-muted" style="font-size: 0.85rem;">Chưa có danh mục nào.</span>';
        return;
    }

    listContainer.innerHTML = categories.map(cat => `
        <div class="category-badge" style="display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); font-size: 0.85rem;">
            <span>${cat.name}</span>
            <i class="fas fa-times" onclick="adminDeleteAvatarCategory('${cat.id}', '${cat.name}')" style="cursor: pointer; color: #ff6b6b; font-size: 10px;" title="Xóa danh mục"></i>
        </div>
    `).join("");

    // Cập nhật các dropdown chọn danh mục trong modal thêm mới
    const catSelect = document.getElementById("newAdminAvatarCategory");
    if (catSelect) {
        catSelect.innerHTML = `
            <option value="Chưa phân loại">Sơ khai...</option>
            ${categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join("")}
        `;
    }

    // Cập nhật dropdown bulk update
    const bulkCatSelect = document.getElementById("adminBulkAvatarCategory");
    if (bulkCatSelect) {
        bulkCatSelect.innerHTML = `
            <option value="">Đổi danh mục...</option>
            <option value="Chưa phân loại">Chưa phân loại</option>
            ${categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join("")}
        `;
    }

    // Cập nhật bộ lọc (Filter buttons)
    const filterContainer = document.getElementById("adminAvatarFilters");
    if (filterContainer) {
        const currentFilter = currentAvatarLibraryFilter;
        filterContainer.innerHTML = `
            <button class="avatar-filter-btn ${currentFilter === 'all' ? 'active' : ''}" onclick="adminFilterAvatarsByCat('all')">Tất cả</button>
            ${categories.map(cat => `
                <button class="avatar-filter-btn ${currentFilter === cat.id ? 'active' : ''}" onclick="adminFilterAvatarsByCat('${cat.id}')">
                    ${cat.name}
                </button>
            `).join("")}
        `;
    }
}

/**
 * Xóa danh mục
 */
// Xóa danh mục (Sửa để dùng ID - UUID)
async function adminDeleteAvatarCategory(id, name) {
    if (!await customConfirm(`Xóa danh mục "${name}"? Các avatar thuộc danh mục này sẽ chuyển về "Chưa phân loại".`, { title: "Xóa danh mục", type: "warning" })) return;

    try {
        showLoading(true, "Đang xóa danh mục...");
        // 1. Cập nhật các avatar thuộc danh mục này về 'null' (Chưa phân loại)
        const { error: updError } = await supabase
            .from('avatar_library')
            .update({ category_id: null })
            .eq('category_id', id);
            
        if (updError) throw updError;

        // 2. Xóa danh mục
        const { error: delError } = await supabase.from('avatar_categories').delete().eq('id', id);
        if (delError) throw delError;

        showNotification(`Đã xóa danh mục "${name}"`, "success");
        await adminLoadAvatarCategories();
        adminLoadAvatarLibrary();
    } catch (error) {
        console.error("Lỗi xóa danh mục avatar Supabase:", error);
        showNotification("Lỗi khi xóa danh mục.", "error");
    } finally {
        showLoading(false);
    }
}

// Bổ sung vào showAdminPanel (Hook) - ĐÃ DỜI VÀO index.html
// Bổ sung vào showAdminPanel (Hook) - ĐÃ DỜI VÀO index.html

/**
 * QUẢN LÝ TẬP PHIM: BULK ACTIONS & DRAG & DROP
 */

// Chọn tất cả / Bỏ chọn tất cả tập phim
function toggleAllEpisodes(checked) {
    const checkboxes = document.querySelectorAll(".episode-checkbox");
    checkboxes.forEach(cb => cb.checked = checked);
    updateEpisodeSelection();
}

// Cập nhật trạng thái thanh công cụ bulk actions
function updateEpisodeSelection() {
    const checkboxes = document.querySelectorAll(".episode-checkbox:checked");
    const bar = document.getElementById("episodeBulkActionsBar");
    const countSpan = document.getElementById("episodeSelectedCount");
    const selectAllBar = document.getElementById("episodeSelectAll");
    const selectAllHeader = document.getElementById("episodeSelectAllHeader");

    const totalCount = document.querySelectorAll(".episode-checkbox").length;
    
    if (checkboxes.length > 0) {
        bar.classList.add("active");
        countSpan.textContent = checkboxes.length;
    } else {
        bar.classList.remove("active");
    }

    const isAllSelected = (checkboxes.length === totalCount && totalCount > 0);
    if (selectAllBar) selectAllBar.checked = isAllSelected;
    if (selectAllHeader) selectAllHeader.checked = isAllSelected;
}

// Bỏ chọn tất cả
function clearEpisodeSelection() {
    toggleAllEpisodes(false);
}

// Xóa hàng loạt tập phim
async function bulkDeleteEpisodes() {
    const selectedCheckboxes = document.querySelectorAll(".episode-checkbox:checked");
    const indicesToDelete = Array.from(selectedCheckboxes)
        .map(cb => parseInt(cb.getAttribute("data-index")))
        .sort((a, b) => b - a); // Sắp xếp giảm dần để xóa không bị lệch index

    if (indicesToDelete.length === 0) return;

    const confirmed = await customConfirm(`Bạn có chắc muốn xóa ${indicesToDelete.length} tập phim đã chọn?`, {
        title: "Xóa tập hàng loạt",
        type: "danger",
        confirmText: "Xóa tất cả"
    });

    if (!confirmed) return;

    try {
        showLoading(true, "Đang xóa các tập đã chọn...");
        const movieId = selectedMovieForEpisodes;
        const movie = allMovies.find(m => m.id === movieId);
        if (!movie || !movie.episodes) return;

        const episodesToDelete = indicesToDelete.map(idx => movie.episodes[idx]).filter(Boolean);
        const idsToDelete = episodesToDelete.map(ep => ep.id);

        if (idsToDelete.length > 0) {
            const { error } = await supabase.from('episodes').delete().in('id', idsToDelete);
            if (error) throw error;
        }

        showNotification(`Đã xóa thành công ${idsToDelete.length} tập phim.`, "success");
        loadEpisodesForMovie(movieId);
    } catch (error) {
        console.error("Lỗi xóa hàng loạt:", error);
        showNotification("Lỗi khi xóa tập phim.", "error");
    } finally {
        showLoading(false);
    }
}

// Mở modal sửa hàng loạt
function openBulkEpisodeEditModal() {
    const selectedCount = document.querySelectorAll(".episode-checkbox:checked").length;
    document.getElementById("bulkEditInfo").textContent = `Đang chỉnh sửa cho ${selectedCount} tập phim đã chọn`;
    
    // Reset form
    document.getElementById("bulkEpisodeQuality").value = "";
    document.getElementById("bulkEpisodeHour").value = "";
    document.getElementById("bulkEpisodeMinute").value = "";
    document.getElementById("bulkEpisodeIntroMinute").value = "";
    document.getElementById("bulkEpisodeIntroSecond").value = "";
    document.getElementById("bulkEpisodeOutroMinute").value = "";
    document.getElementById("bulkEpisodeOutroSecond").value = "";
    
    openModal("bulkEpisodeEditModal");
}

// Lưu thay đổi hàng loạt
async function saveBulkEpisodeChanges() {
    const selectedCheckboxes = document.querySelectorAll(".episode-checkbox:checked");
    const indicesToUpdate = Array.from(selectedCheckboxes).map(cb => parseInt(cb.getAttribute("data-index")));
    
    const newQuality = document.getElementById("bulkEpisodeQuality").value;
    const h = parseInt(document.getElementById("bulkEpisodeHour").value);
    const m = parseInt(document.getElementById("bulkEpisodeMinute").value);
    
    // [NEW] Lấy thông tin Intro mới
    const introM = parseInt(document.getElementById("bulkEpisodeIntroMinute").value);
    const introS = parseInt(document.getElementById("bulkEpisodeIntroSecond").value);
    
    // [NEW] Lấy thông tin Outro mới
    const outroM = parseInt(document.getElementById("bulkEpisodeOutroMinute").value);
    const outroS = parseInt(document.getElementById("bulkEpisodeOutroSecond").value);
    
    let newDuration = null;
    if (!isNaN(h) || !isNaN(m)) {
        newDuration = formatDuration(h || 0, m || 0);
    }
    
    let newIntroEndTime = null;
    if (!isNaN(introM) || !isNaN(introS)) {
        newIntroEndTime = (introM || 0) * 60 + (introS || 0);
    }

    let newOutroStartTime = null;
    if (!isNaN(outroM) || !isNaN(outroS)) {
        newOutroStartTime = (outroM || 0) * 60 + (outroS || 0);
    }

    if (!newQuality && !newDuration && newIntroEndTime === null && newOutroStartTime === null) {
        showNotification("Bạn chưa thay đổi thông tin nào!", "warning");
        return;
    }

    try {
        showLoading(true, "Đang áp dụng thay đổi...");
        const movieId = selectedMovieForEpisodes;
        const movie = allMovies.find(m => m.id === movieId);
        if (!movie || !movie.episodes) {
            showNotification("Không tìm thấy dữ liệu tập phim!", "error");
            return;
        }

        const episodesToUpdate = indicesToUpdate.map(idx => movie.episodes[idx]).filter(Boolean);
        if (episodesToUpdate.length === 0) {
            showNotification("Không có tập nào được chọn!", "warning");
            return;
        }

        const updates = episodesToUpdate.map(ep => {
            const up = { id: ep.id };
            if (newQuality) up.quality = newQuality;
            if (newDuration) up.duration = newDuration;
            if (newIntroEndTime !== null) up.intro_end = newIntroEndTime;
            if (newOutroStartTime !== null) up.intro_start = newOutroStartTime;
            up.updated_at = new Date().toISOString();
            return up;
        });

        const { error } = await supabase.from('episodes').upsert(updates);
        if (error) throw error;

        showNotification(`Đã cập nhật thành công ${updates.length} tập phim.`, "success");
        closeModal("bulkEpisodeEditModal");
        loadEpisodesForMovie(movieId);
    } catch (error) {
        console.error("Lỗi cập nhật hàng loạt Supabase:", error);
        showNotification("Lỗi khi cập nhật tập phim.", "error");
    } finally {
        showLoading(false);
    }
}

// Khởi tạo kéo thả SortableJS
let episodesSortable = null;
function initEpisodesSortable() {
    const tbody = document.getElementById("adminEpisodesTable");
    if (!tbody || typeof Sortable === "undefined") return;

    if (episodesSortable) {
        episodesSortable.destroy();
    }

    episodesSortable = new Sortable(tbody, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: async function() {
            // Lấy thứ tự mới từ DOM
            const newOrder = Array.from(tbody.querySelectorAll("tr")).map(tr => parseInt(tr.getAttribute("data-index")));
            
            // So sánh xem thứ tự có thực sự thay đổi không
            const isChanged = newOrder.some((val, idx) => val !== idx);
            if (!isChanged) return;

            try {
                showLoading(true, "Đang cập nhật vị trí tập phim...");
                const movieId = selectedMovieForEpisodes;
                const movie = allMovies.find(m => m.id === movieId);
                if (!movie || !movie.episodes) return;

                const oldEpisodes = movie.episodes || [];
                const reordered = newOrder.map(oldIndex => oldEpisodes[oldIndex]);

                // Update index in Supabase for each episode
                const updates = reordered.map((ep, newIdx) => ({
                    id: ep.id,
                    episode_index: newIdx
                }));

                const { error } = await supabase.from('episodes').upsert(updates);
                if (error) throw error;

                movie.episodes = reordered;
                showNotification("Đã cập nhật vị trí tập phim qua kéo thả!", "success");
                loadEpisodesForMovie(movieId, false); // Reload để reset index trong DOM
            } catch (error) {
                console.error("Lỗi cập nhật vị trí Supabase:", error);
                showNotification("Lỗi khi đổi vị trí tập phim.", "error");
                loadEpisodesForMovie(); // Revert UI
            } finally {
                showLoading(false);
            }
        }
    });
}

// Sửa nhanh số tập (Quick Edit)
async function saveQuickEditEpisodeNumber(index, newNumber) {
    const movieId = selectedMovieForEpisodes;
    const movie = allMovies.find(m => m.id === movieId);
    if (!movie || !movie.episodes) return;

    const targetEpisode = movie.episodes[index];
    if (!targetEpisode) return;

    const oldNumber = targetEpisode.title || targetEpisode.episode_name || targetEpisode.episode_number || targetEpisode.episodeNumber;
    if (oldNumber === newNumber) return;

    try {
        const { error } = await supabase
            .from('episodes')
            .update({ 
                title: newNumber, // Đổi từ episode_name -> title
            })
            .eq('id', targetEpisode.id);

        if (error) throw error;

        // Cập nhật local
        targetEpisode.title = newNumber;
        targetEpisode.episode_name = newNumber;
        targetEpisode.episodeNumber = newNumber;

        showNotification(`Đã sửa tập ${oldNumber} thành ${newNumber}`, "success");
    } catch (error) {
        console.error("Lỗi sửa nhanh số tập Supabase:", error);
        showNotification("Lỗi khi sửa số tập.", "error");
        loadEpisodesForMovie(movieId); // Revert UI if needed
    }
}

/* ============================================
   QUẢN LÝ PHÒNG XEM CHUNG (ADMIN WATCH PARTY)
   ============================================ */

let allAdminWatchRooms = [];
let roomTypeChart = null;
let popularMoviesChart = null;
let adminWatchRoomsInterval = null;

/**
 * Load danh sách phòng xem chung từ Supabase (Realtime)
 */
function loadAdminWatchRooms() {
    if (!supabase) return;

    // Hủy đăng ký realtime trước đó nếu có
    if (adminWatchRoomsInterval) {
        adminWatchRoomsInterval.unsubscribe();
    }

    const tableBody = document.getElementById("adminWatchRoomsTable");
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center"><i class="fas fa-spinner fa-spin"></i> Đang tải danh sách phòng...</td></tr>';
    }

    const fetchRooms = async () => {
        try {
            // Tải cấu hình giới hạn phòng trước
            await loadUserRoomLimit();

            const { data, error } = await supabase
                .from('watch_rooms')
                .select(`
                    *,
                    host:profiles!watch_rooms_host_id_fkey(display_name, email),
                    movie:movies(title)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            allAdminWatchRooms = data || [];
            filterAdminWatchRooms();
            updateWatchPartyStats(allAdminWatchRooms);
        } catch (error) {
            console.error("Lỗi load admin watch rooms Supabase:", error);
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Lỗi khi tải dữ liệu.</td></tr>';
            }
        }
    };

    fetchRooms();

    // Đăng ký realtime
    adminWatchRoomsInterval = supabase
        .channel('admin-watch-rooms-realtime')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'watch_rooms' 
        }, () => {
            fetchRooms();
        })
        .subscribe();
}

function updateWatchPartyStats(rooms) {
    const totalRooms = rooms.length;
    let totalViewers = 0;
    let publicCount = 0;
    let privateCount = 0;
    const movieCounts = {};

    rooms.forEach(room => {
        totalViewers += (room.member_count || 0); // Changed from memberCount to member_count
        if (room.type === 'public') publicCount++;
        else privateCount++;
        
        const title = room.movie ? room.movie.title : 'Chưa chọn phim'; // Changed from room.movieTitle
        movieCounts[title] = (movieCounts[title] || 0) + 1;
    });

    // Sắp xếp top phim
    const sortedMovies = Object.entries(movieCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // Lấy giới hạn hệ thống từ input để tính %
    const totalLimitInput = document.getElementById('totalRoomLimitInput');
    const totalLimit = totalLimitInput ? parseInt(totalLimitInput.value) || 50 : 50;
    const roomPercent = Math.min((totalRooms / totalLimit) * 100, 100);

    // Cập nhật các số liệu văn bản
    const elTotalRooms = document.getElementById('statTotalRooms');
    const elRoomProgress = document.getElementById('statRoomProgress');
    const elTotalViewers = document.getElementById('statTotalViewers');
    const elPublicRatio = document.getElementById('statPublicRatio');
    const elPublicCount = document.getElementById('statPublicCount');

    if (elTotalRooms) elTotalRooms.textContent = `${totalRooms} / ${totalLimit}`;
    if (elRoomProgress) elRoomProgress.style.width = `${roomPercent}%`;
    if (elTotalViewers) elTotalViewers.textContent = totalViewers.toLocaleString();
    
    if (elPublicRatio) {
        const ratio = totalRooms > 0 ? Math.round((publicCount / totalRooms) * 100) : 0;
        elPublicRatio.textContent = `${ratio}%`;
    }
    if (elPublicCount) elPublicCount.textContent = `${publicCount} phòng công khai`;

    // 2. Cập nhật các biểu đồ
    initOrUpdateCharts(publicCount, privateCount, sortedMovies);
}

function initOrUpdateCharts(publicCount, privateCount, topMovies) {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js chưa sẵn sàng, đang thử lại sau 500ms...");
        setTimeout(() => initOrUpdateCharts(publicCount, privateCount, topMovies), 500);
        return;
    }

    // 1. Biểu đồ Room Type
    const ctxType = document.getElementById('roomTypeChart');
    if (ctxType) {
        try {
            if (!roomTypeChart) {
                roomTypeChart = new Chart(ctxType, {
                    type: 'doughnut',
                    data: {
                        labels: ['Công khai', 'Riêng tư'],
                        datasets: [{
                            data: [publicCount, privateCount],
                            backgroundColor: ['#33cf66', '#ff4444'],
                            borderWidth: 0,
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        cutout: '70%',
                        plugins: { 
                            legend: { display: false }, 
                            tooltip: { 
                                enabled: true,
                                callbacks: {
                                    label: function(context) {
                                        return ` ${context.label}: ${context.raw} phòng`;
                                    }
                                }
                            } 
                        },
                        maintainAspectRatio: false,
                        responsive: true
                    }
                });
            } else {
                roomTypeChart.data.datasets[0].data = [publicCount, privateCount];
                roomTypeChart.update();
            }
        } catch (e) {
            console.error("Lỗi khởi tạo biểu đồ tròn:", e);
        }
    }

    // 2. Biểu đồ Top Movies (Chart.js)
    const ctxMovies = document.getElementById('popularMoviesChart');
    if (ctxMovies) {
        try {
            const labels = topMovies.map(m => {
                let title = m[0] || 'Phòng không tên';
                if (title.startsWith(':')) title = title.substring(1).trim();
                // Tăng lên 50 ký tự vì tên phim nằm trên thanh bar nên có nhiều diện tích
                return title.length > 50 ? title.substring(0, 48) + '...' : title;
            });
            const data = topMovies.map(m => m[1]);

            if (!popularMoviesChart) {
                popularMoviesChart = new Chart(ctxMovies, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Số phòng',
                            data: data,
                            backgroundColor: '#fcd535',
                            borderRadius: 4,
                            barThickness: 8 // Giảm độ dày thanh bar để tăng khoảng trống
                        }]
                    },
                    plugins: [{
                        id: 'customLabels',
                        afterDatasetsDraw(chart) {
                            const {ctx, data, chartArea: {left}, scales: {y}} = chart;
                            ctx.save();
                            ctx.font = '500 11px Montserrat';
                            ctx.fillStyle = 'rgba(255,255,255,0.95)';
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'bottom';
                            data.labels.forEach((label, index) => {
                                const yPos = y.getPixelForTick(index);
                                // Vẽ tên phim phía trên thanh bar
                                ctx.fillText(label, left, yPos - 6);
                            });
                            ctx.restore();
                        }
                    }],
                    options: {
                        indexAxis: 'y',
                        layout: {
                            padding: { left: 0, right: 30, top: 25, bottom: 0 }
                        },
                        scales: {
                            x: { 
                                display: false, 
                                grid: { display: false },
                                beginAtZero: true,
                                ticks: { stepSize: 1 }
                            },
                            y: { 
                                ticks: { 
                                    display: false 
                                }, 
                                grid: { display: false },
                                // Tăng khoảng cách giữa các category
                                categoryPercentage: 0.8,
                                barPercentage: 0.9
                            }
                        },
                        plugins: { 
                            legend: { display: false },
                            tooltip: { 
                                enabled: true,
                                callbacks: {
                                    title: function(context) {
                                        return topMovies[context[0].dataIndex][0];
                                    }
                                }
                            }
                        },
                        maintainAspectRatio: false,
                        responsive: true
                    }
                });
            } else {
                popularMoviesChart.data.labels = labels;
                popularMoviesChart.data.datasets[0].data = data;
                popularMoviesChart.update();
            }
        } catch (e) {
            console.error("Lỗi khởi tạo biểu đồ cột:", e);
        }
    }
}

function renderAdminWatchRooms(rooms) {
    const tableBody = document.getElementById("adminWatchRoomsTable");
    if (!tableBody) return;

    // --- LOGIC PHÂN TRANG ---
    const totalItems = rooms.length;
    const totalPages = Math.ceil(totalItems / adminPerPage);
    
    if (currentAdminRoomPage > totalPages && totalPages > 0) currentAdminRoomPage = totalPages;
    if (currentAdminRoomPage < 1) currentAdminRoomPage = 1;

    const startIndex = (currentAdminRoomPage - 1) * adminPerPage;
    const paginatedRooms = rooms.slice(startIndex, startIndex + adminPerPage);

    if (totalItems === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Không có phòng nào đang hoạt động.</td></tr>';
        const paginationContainer = document.getElementById("adminWatchRoomPagination");
        if (paginationContainer) paginationContainer.innerHTML = "";
        return;
    }

    tableBody.innerHTML = paginatedRooms.map(room => {
        const createdDate = room.created_at ? new Date(room.created_at).toLocaleString('vi-VN') : 'N/A'; // Changed from createdAt
        const typeBadge = room.type === 'private' 
            ? '<span class="badge bg-danger"><i class="fas fa-lock"></i> Riêng tư</span>' 
            : '<span class="badge bg-success"><i class="fas fa-globe"></i> Công khai</span>';
        
        // --- Xử lý trạng thái / Lên lịch ---
        let scheduleBadge = `<span class="badge bg-danger" style="animation: wp-live-pulse 2s infinite;"><i class="fas fa-circle" style="font-size: 8px;"></i> LIVE</span>`;
        if (room.status === 'ended' || (room.current_time && room.status === 'paused' && room.duration && room.current_time >= room.duration)) { // Changed from currentTime
            scheduleBadge = `<span class="badge bg-secondary">Đã Kết Thúc</span>`;
        } else if (room.scheduled_time) { // Changed from scheduledTime
            const now = new Date();
            const targetDate = new Date(room.scheduled_time); // Changed from scheduledTime
            if (targetDate > now) {
                const timeStr = `${targetDate.getHours().toString().padStart(2, '0')}:${targetDate.getMinutes().toString().padStart(2, '0')} ${targetDate.getDate().toString().padStart(2, '0')}/${(targetDate.getMonth()+1).toString().padStart(2, '0')}`;
                scheduleBadge = `<span class="badge bg-purple" style="background-color: #9c27b0;"><i class="fas fa-clock"></i> ${timeStr}</span>`;
            }
        }

        // --- Tính toán thời gian xóa tự động ---
        let deleteStatusHTML = '<span class="text-muted">-</span>';
        const { isActuallyEnded, endedAt } = checkIfRoomEnded(room);
        
        if (isActuallyEnded && endedAt) {
            const now = new Date();
            const endDate = new Date(endedAt); // Changed from endedAt.toDate()
            
            // Lấy giới hạn thời gian (đọc từ input nếu có, nếu không lấy mặc định 6)
            const autoDeleteHoursInput = document.getElementById('autoDeleteHoursInput');
            const autoDeleteHoursLimit = autoDeleteHoursInput ? (parseInt(autoDeleteHoursInput.value) || 6) : 6;
            
            const diffMs = now.getTime() - endDate.getTime();
            const limitMs = autoDeleteHoursLimit * 60 * 60 * 1000;
            const remainingMs = limitMs - diffMs;
            
            if (remainingMs <= 0) {
               deleteStatusHTML = '<span class="text-danger" style="font-weight: 500;"><i class="fas fa-spinner fa-spin"></i> Đang xóa...</span>';
            } else {
               const rh = Math.floor(remainingMs / (1000 * 60 * 60));
               const rm = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
               const rs = Math.floor((remainingMs % (1000 * 60)) / 1000);
               deleteStatusHTML = `<span class="text-warning" style="font-weight: 500; font-family: monospace;" title="Xóa sau ${autoDeleteHoursLimit}h kể từ khi đóng">${rh.toString().padStart(2, '0')}:${rm.toString().padStart(2, '0')}:${rs.toString().padStart(2, '0')}</span>`;
            }
        }

        // Poster phim
        const posterUrl = room.movie_poster || 'https://via.placeholder.com/40x60/1a1a2e/ffffff?text=No+Img'; // Changed from moviePoster

        return `
            <tr>
                <td><img src="${posterUrl}" style="width: 40px; height: 60px; object-fit: cover; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></td>
                <td><strong>${room.name || 'Phòng không tên'}</strong></td>
                <td>${room.movie ? room.movie.title : 'Chưa chọn phim'}</td>
                <td>${room.host ? room.host.display_name : 'Ẩn danh'}</td>
                <td><span class="badge bg-info">${room.member_count || 0}</span></td>
                <td>${typeBadge}</td>
                <td>${scheduleBadge}</td>
                <td><small>${createdDate}</small></td>
                <td>${deleteStatusHTML}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-action-glass" onclick="adminJoinRoom('${room.id}', '${room.type}')" title="Vào xem">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-action-glass text-danger" onclick="adminDeleteRoom('${room.id}')" title="Xóa phòng">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    // Render nút phân trang
    renderAdminPagination("adminRoomPagination", totalItems, currentAdminRoomPage, adminPerPage, "changeAdminRoomPage", "phòng");
}

/**
 * Chuyển trang Phòng xem chung
 */
window.changeAdminRoomPage = function(page) {
    currentAdminRoomPage = page;
    filterAdminWatchRooms();
    const panel = document.getElementById("watchRoomsPanel");
    if (panel) panel.scrollIntoView({ behavior: 'smooth' });
};

// --- Cấu hình giới hạn phòng ---
function toggleRoomLimitSettings() {
    const el = document.getElementById('roomLimitSettings');
    if (el) el.classList.toggle('hidden');
}

async function loadUserRoomLimit() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'watch_party_config')
            .maybeSingle(); // Sử dụng maybeSingle thay vì single để tránh lỗi 406

        if (data && data.value) {
            const config = data.value;
            const userLimit = config.userRoomLimit || 1;
            const totalLimit = config.totalRoomLimit || 50;
            const autoDeleteHours = config.autoDeleteHours || 24;

            const userInput = document.getElementById('userRoomLimitInput');
            const totalInput = document.getElementById('totalRoomLimitInput');
            const deleteInput = document.getElementById('autoDeleteHoursInput');

            if (userInput) userInput.value = userLimit;
            if (totalInput) totalInput.value = totalLimit;
            if (deleteInput) deleteInput.value = autoDeleteHours;
        }
    } catch (error) {
        console.error("Lỗi tải giới hạn phòng Supabase:", error);
    }
}

async function saveUserRoomLimit() {
    const userInput = document.getElementById('userRoomLimitInput');
    const totalInput = document.getElementById('totalRoomLimitInput');
    const deleteInput = document.getElementById('autoDeleteHoursInput');
    
    if (!userInput || !totalInput || !deleteInput) return;
    
    const userLimit = parseInt(userInput.value);
    const totalLimit = parseInt(totalInput.value);
    const autoDeleteHours = parseInt(deleteInput.value);

    if (isNaN(userLimit) || userLimit < 1 || isNaN(totalLimit) || totalLimit < 1 || isNaN(autoDeleteHours) || autoDeleteHours < 1) {
        showNotification("Cấu hình giới hạn và thời gian phải là số dương!", "error");
        return;
    }

    try {
        showLoading(true);
        const { error } = await supabase.from('app_configs').upsert({
            key: 'watch_party_config',
            value: {
                userRoomLimit: userLimit,
                totalRoomLimit: totalLimit,
                autoDeleteHours: autoDeleteHours
            },
            updated_at: new Date().toISOString()
        });

        if (error) throw error;
        
        showNotification("Đã lưu cấu hình phòng xem chung mới!", "success");
        toggleRoomLimitSettings();
    } catch (error) {
        console.error("Lỗi lưu cấu hình Supabase:", error);
        showNotification("Lỗi khi lưu cấu hình.", "error");
    } finally {
        showLoading(false);
    }
}

function filterAdminWatchRooms() {
    const searchTerm = removeDiacritics(document.getElementById("adminSearchRooms").value);
    const filterType = document.getElementById("adminFilterRoomType") ? document.getElementById("adminFilterRoomType").value : 'all';
    const sortBy = document.getElementById("adminSortRooms") ? document.getElementById("adminSortRooms").value : 'newest';
    
    let filtered = [...allAdminWatchRooms];

    // 1. Phân loại theo text (hỗ trợ không dấu)
    if (searchTerm) {
        filtered = filtered.filter(room => {
            return (room.name && removeDiacritics(room.name).includes(searchTerm)) ||
                   (room.movie && room.movie.title && removeDiacritics(room.movie.title).includes(searchTerm)) ||
                   (room.host && room.host.display_name && removeDiacritics(room.host.display_name).includes(searchTerm));
        });
    }

    // 2. Phân loại theo loại phòng
    if (filterType !== 'all') {
        filtered = filtered.filter(room => room.type === filterType);
    }

    // 3. Sắp xếp
    filtered.sort((a, b) => {
        if (sortBy === 'newest') {
            const dateA = a.created_at ? new Date(a.created_at) : 0; // Changed from createdAt
            const dateB = b.created_at ? new Date(b.created_at) : 0; // Changed from createdAt
            return dateB - dateA;
        } else if (sortBy === 'oldest') {
            const dateA = a.created_at ? new Date(a.created_at) : 0; // Changed from createdAt
            const dateB = b.created_at ? new Date(b.created_at) : 0; // Changed from createdAt
            return dateA - dateB;
        } else if (sortBy === 'members') {
            return (b.member_count || 0) - (a.member_count || 0); // Changed from memberCount
        }
        return 0;
    });

    renderAdminWatchRooms(filtered);
}

// Chức năng xóa tất cả phòng (Bulk Delete)
async function adminDeleteAllWatchRooms() {
    if (!supabase || allAdminWatchRooms.length === 0) {
        showNotification("Không có phòng nào để xóa!", "info");
        return;
    }

    const confirmDelete = await customConfirm(
        `Bạn có chắc chắn muốn xóa TẤT CẢ ${allAdminWatchRooms.length} phòng đang hoạt động?`,
        { title: "Cảnh báo xóa tất cả", type: "danger", confirmText: "Xóa tất cả" }
    );

    if (!confirmDelete) return;

    const btn = document.querySelector('[onclick="adminDeleteAllWatchRooms()"]');
    const originalText = btn ? btn.innerHTML : "";

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xóa...';
        }

        // Supabase doesn't have a direct "delete all" without a condition.
        // Using a condition that is always true for existing rooms (e.g., id is not a zero UUID)
        // or deleting based on a specific column if applicable.
        // For simplicity, deleting all where id is not a known invalid UUID.
        const { error } = await supabase.from('watch_rooms').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
        
        showNotification("Đã xóa toàn bộ phòng thành công!", "success");
        allAdminWatchRooms = [];
        filterAdminWatchRooms();
    } catch (error) {
        console.error("Lỗi khi xóa hàng loạt Supabase:", error);
        showNotification("Có lỗi xảy ra khi xóa toàn bộ phòng!", "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

/**
 * Hàm xóa phòng dành riêng cho Admin (Có cập nhật UI ngay lập tức)
 * @param {string} roomId 
 */
async function adminDeleteRoom(roomId) {
    const confirmDelete = await customConfirm(
        "Bạn có chắc chắn muốn xóa phòng này không? Hành động này sẽ giải tán toàn bộ thành viên trong phòng.",
        { title: "Xác nhận xóa phòng", type: "danger", confirmText: "Xóa ngay" }
    );
    
    if (!confirmDelete) return;

    try {
        showLoading(true, "Đang xóa phòng...");
        const { error } = await supabase.from('watch_rooms').delete().eq('id', roomId);
        if (error) throw error;
        
        // Cập nhật mảng local nhanh chóng
        allAdminWatchRooms = allAdminWatchRooms.filter(r => r.id !== roomId);
        
        // Render lại bảng và cập nhật biểu đồ
        filterAdminWatchRooms();
        updateWatchPartyStats(allAdminWatchRooms);
        
        showNotification("Đã xóa phòng thành công!", "success");
    } catch (error) {
        console.error("Lỗi xóa phòng (Admin) Supabase:", error);
        showNotification("Không thể xóa phòng. Vui lòng thử lại!", "error");
    } finally {
        showLoading(false);
    }
}

// Hàm hỗ trợ admin vào phòng 
async function adminJoinRoom(roomId, type) {
    if (typeof joinRoom === 'function') {
        const adminPage = document.getElementById('adminPage');
        if (adminPage) adminPage.classList.remove('active');
        
        const homePage = document.getElementById('homePage');
        if (homePage) homePage.classList.add('active');

        showPage('watchParty');
        setTimeout(() => {
            joinRoom(roomId, type);
        }, 100);
    }
}

/* ============================================
   QUẢN LÝ GIAO DIỆN & HIỆU ỨNG (VISUAL EFFECTS)
   ============================================ */

// Cache settings hiện tại
let currentVisualEffects = { snow: false, stars: false, firework: false, bubbles: false, hearts: false, leaves: false, rain: false, confetti: false };

/**
 * Load cài đặt hiệu ứng từ Supabase
 */
async function loadVisualEffectsSettings() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'visual_effects')
            .single();

        if (error) throw error;

        currentVisualEffects = data.value || { snow: false, stars: false, firework: false, bubbles: false, hearts: false, leaves: false, rain: false, confetti: false };

        // Cập nhật UI toggle cho tất cả hiệu ứng
        const effectKeys = ['snow', 'stars', 'firework', 'bubbles', 'hearts', 'leaves', 'rain', 'confetti'];
        effectKeys.forEach(key => {
            const toggleId = 'veToggle' + key.charAt(0).toUpperCase() + key.slice(1);
            const toggle = document.getElementById(toggleId);
            if (toggle) toggle.checked = !!currentVisualEffects[key];

            const cardId = 'veCard' + key.charAt(0).toUpperCase() + key.slice(1);
            updateEffectCardState(cardId, !!currentVisualEffects[key]);
        });

        console.log('✅ Loaded visual effects settings:', currentVisualEffects);
    } catch (err) {
        console.error('❌ Lỗi load visual effects:', err);
    }
}

/**
 * Cập nhật class active cho card hiệu ứng
 */
function updateEffectCardState(cardId, isActive) {
    const card = document.getElementById(cardId);
    if (card) {
        if (isActive) card.classList.add('active');
        else card.classList.remove('active');
    }
}

/**
 * Toggle bật/tắt hiệu ứng + lưu Supabase
 */
async function toggleVisualEffect(effectName, isEnabled) {
    if (!supabase) return;
    try {
        // Cập nhật local
        currentVisualEffects[effectName] = isEnabled;

        // Cập nhật card active
        const cardId = 'veCard' + effectName.charAt(0).toUpperCase() + effectName.slice(1);
        updateEffectCardState(cardId, isEnabled);

        // Lưu lên Supabase
        const { error } = await supabase
            .from('site_settings')
            .update({ 
                value: currentVisualEffects,
                updated_at: new Date().toISOString()
            })
            .eq('key', 'visual_effects');

        if (error) throw error;

        const effectNames = { snow: 'Tuyết rơi', stars: 'Sao rơi', firework: 'Pháo hoa', bubbles: 'Bong bóng', hearts: 'Trái tim', leaves: 'Lá rơi', rain: 'Mưa rơi', confetti: 'Confetti' };
        showNotification(
            `${isEnabled ? '✅ Đã bật' : '⛔ Đã tắt'} hiệu ứng "${effectNames[effectName]}"`,
            isEnabled ? 'success' : 'info'
        );

        // Render/Remove hiệu ứng ngay trên trang chủ nếu đang mở
        if (isEnabled) {
            renderHomeEffect(effectName);
        } else {
            removeHomeEffect(effectName);
        }

    } catch (err) {
        console.error('❌ Lỗi toggle visual effect:', err);
        showNotification('Lỗi khi cập nhật hiệu ứng!', 'error');
        // Revert toggle
        const toggle = document.getElementById(`veToggle${effectName.charAt(0).toUpperCase() + effectName.slice(1)}`);
        if (toggle) toggle.checked = !isEnabled;
    }
}

/**
 * Render hiệu ứng trên banner trang chủ
 */
function renderHomeEffect(effectName) {
    // Tìm banner container
    const banner = document.querySelector('.banner-slider') || document.querySelector('.hero-section') || document.querySelector('#homePage');
    if (!banner) return;

    // Xóa hiệu ứng cũ nếu có
    removeHomeEffect(effectName);

    // Tạo canvas cho hiệu ứng
    const canvas = document.createElement('canvas');
    canvas.id = `effect-${effectName}`;
    canvas.className = 'home-effect-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    
    // Đảm bảo banner có position relative
    if (getComputedStyle(banner).position === 'static') {
        banner.style.position = 'relative';
    }
    banner.appendChild(canvas);

    // Khởi tạo animation
    const ctx = canvas.getContext('2d');
    canvas.width = banner.offsetWidth;
    canvas.height = banner.offsetHeight;

    const particles = [];
    const config = getEffectConfig(effectName, canvas);

    // Tạo particles
    for (let i = 0; i < config.count; i++) {
        particles.push(createParticle(config, canvas));
    }

    // Animation loop
    function animate() {
        if (!document.getElementById(`effect-${effectName}`)) return; // Dừng nếu canvas bị xóa
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach((p, i) => {
            config.update(p, canvas);
            config.draw(ctx, p);

            // Reset khi ra ngoài
            if (p.y > canvas.height + 10 || p.x > canvas.width + 10 || p.x < -10) {
                particles[i] = createParticle(config, canvas);
                particles[i].y = -10;
            }
        });

        requestAnimationFrame(animate);
    }
    animate();

    // Resize handler
    const resizeHandler = () => {
        const currentCanvas = document.getElementById(`effect-${effectName}`);
        if (currentCanvas && banner) {
            currentCanvas.width = banner.offsetWidth;
            currentCanvas.height = banner.offsetHeight;
        }
    };
    window.addEventListener('resize', resizeHandler);
    canvas._resizeHandler = resizeHandler;
}

/**
 * Cấu hình cho mỗi loại hiệu ứng
 */
function getEffectConfig(type, canvas) {
    switch (type) {
        case 'snow':
            return {
                count: 60,
                update: (p) => {
                    p.y += p.speed;
                    p.x += Math.sin(p.angle) * 0.5;
                    p.angle += 0.01;
                },
                draw: (ctx, p) => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
                    ctx.fill();
                }
            };
        case 'stars':
            return {
                count: 30,
                update: (p) => {
                    p.y += p.speed;
                    p.x += p.speedX;
                    p.opacity = 0.3 + Math.abs(Math.sin(p.angle)) * 0.7;
                    p.angle += 0.03;
                },
                draw: (ctx, p) => {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation);
                    ctx.fillStyle = `rgba(255, 215, 0, ${p.opacity})`;
                    drawStar(ctx, 0, 0, 5, p.size, p.size / 2);
                    ctx.restore();
                    p.rotation += 0.02;
                }
            };
        case 'firework':
            return {
                count: 40,
                update: (p) => {
                    p.y += p.speed;
                    p.x += p.speedX;
                    p.opacity -= 0.005;
                    p.size *= 0.99;
                    if (p.opacity <= 0) {
                        p.opacity = 0.8;
                        p.x = Math.random() * canvas.width;
                        p.y = Math.random() * canvas.height * 0.5;
                        p.speed = (Math.random() - 0.5) * 2;
                        p.speedX = (Math.random() - 0.5) * 3;
                        p.size = Math.random() * 3 + 1;
                    }
                },
                draw: (ctx, p) => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.opacity})`;
                    ctx.fill();
                }
            };
        case 'bubbles':
            return {
                count: 25,
                update: (p) => {
                    p.y -= p.speed; // Bay lên
                    p.x += Math.sin(p.angle) * 0.8;
                    p.angle += 0.02;
                    p.opacity = 0.15 + Math.abs(Math.sin(p.angle * 2)) * 0.25;
                },
                draw: (ctx, p) => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(150, 220, 255, ${p.opacity})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    // Ánh sáng nhỏ trong bong bóng
                    ctx.beginPath();
                    ctx.arc(p.x - p.size, p.y - p.size, p.size * 0.5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity * 0.6})`;
                    ctx.fill();
                }
            };
        case 'hearts':
            return {
                count: 20,
                update: (p) => {
                    p.y -= p.speed * 0.8; // Bay lên
                    p.x += Math.sin(p.angle) * 0.6;
                    p.angle += 0.02;
                    p.scale = 0.8 + Math.sin(p.angle * 3) * 0.2;
                },
                draw: (ctx, p) => {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    const s = p.size * (p.scale || 1);
                    ctx.fillStyle = `rgba(255, ${80 + Math.floor(p.r * 0.3)}, ${120 + Math.floor(p.g * 0.2)}, ${p.opacity})`;
                    ctx.beginPath();
                    ctx.moveTo(0, s * 0.3);
                    ctx.bezierCurveTo(-s, -s * 0.5, -s * 0.5, -s * 1.2, 0, -s * 0.5);
                    ctx.bezierCurveTo(s * 0.5, -s * 1.2, s, -s * 0.5, 0, s * 0.3);
                    ctx.fill();
                    ctx.restore();
                }
            };
        case 'leaves':
            return {
                count: 20,
                update: (p) => {
                    p.y += p.speed * 0.6;
                    p.x += Math.sin(p.angle) * 1.2;
                    p.angle += 0.015;
                    p.rotation += 0.03;
                },
                draw: (ctx, p) => {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation);
                    // Vẽ lá hình oval
                    const leafColors = ['rgba(200, 150, 50,', 'rgba(180, 100, 30,', 'rgba(220, 180, 60,', 'rgba(160, 80, 20,'];
                    const colorBase = leafColors[Math.floor(p.r / 70) % leafColors.length];
                    ctx.fillStyle = `${colorBase} ${p.opacity})`;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, p.size * 2.5, p.size, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // Gân lá
                    ctx.strokeStyle = `${colorBase} ${p.opacity * 0.5})`;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(-p.size * 2, 0);
                    ctx.lineTo(p.size * 2, 0);
                    ctx.stroke();
                    ctx.restore();
                }
            };
        case 'rain':
            return {
                count: 80,
                update: (p) => {
                    p.y += p.speed * 3;
                    p.x += 1.5; // Xiên
                },
                draw: (ctx, p) => {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x + 1.5, p.y + p.size * 5);
                    ctx.strokeStyle = `rgba(174, 194, 224, ${p.opacity * 0.5})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            };
        case 'confetti':
            return {
                count: 45,
                update: (p) => {
                    p.y += p.speed;
                    p.x += Math.sin(p.angle) * 1.5;
                    p.angle += 0.04;
                    p.rotation += 0.08;
                },
                draw: (ctx, p) => {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation);
                    ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.opacity})`;
                    ctx.fillRect(-p.size * 1.5, -p.size * 0.5, p.size * 3, p.size);
                    ctx.restore();
                }
            };
        default:
            return { count: 0, update: () => {}, draw: () => {} };
    }
}

/**
 * Tạo 1 particle mới
 */
function createParticle(config, canvas) {
    const colors = [
        [255, 100, 100], [100, 200, 255], [255, 215, 0],
        [150, 255, 150], [255, 150, 255], [255, 180, 100]
    ];
    const c = colors[Math.floor(Math.random() * colors.length)];
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 3 + 1,
        speed: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 1,
        opacity: Math.random() * 0.6 + 0.2,
        angle: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        r: c[0], g: c[1], b: c[2]
    };
}

/**
 * Vẽ ngôi sao 5 cánh
 */
function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fill();
}

/**
 * Xóa hiệu ứng khỏi DOM
 */
function removeHomeEffect(effectName) {
    const canvas = document.getElementById(`effect-${effectName}`);
    if (canvas) {
        if (canvas._resizeHandler) {
            window.removeEventListener('resize', canvas._resizeHandler);
        }
        canvas.remove();
    }
}

/**
 * Load hiệu ứng khi mở trang chủ (gọi từ home.js hoặc main.js)
 */
async function loadAndApplyHomeEffects() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'visual_effects')
            .single();

        if (error || !data) return;

        const effects = data.value || {};
        // Tự động render tất cả hiệu ứng đang bật
        Object.keys(effects).forEach(key => {
            if (effects[key]) renderHomeEffect(key);
        });
    } catch (err) {
        console.error('Lỗi load home effects:', err);
    }
}

/* ============================================
   TÙY CHỈNH GIAO DIỆN (APPEARANCE SETTINGS)
   ============================================ */

// Biến tạm lưu cài đặt đang chỉnh
let pendingAppearance = {
    accentColor: '#4db8ff',
    fontFamily: 'Inter',
    defaultTheme: 'dark'
};

/**
 * Chọn màu accent chính — preview ngay trên trang
 */
function selectAccentColor(color) {
    pendingAppearance.accentColor = color;

    // Cập nhật UI preset buttons
    document.querySelectorAll('.ve-color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === color);
    });

    // Cập nhật color input + text
    const customInput = document.getElementById('veCustomColor');
    const codeText = document.getElementById('veCurrentColorCode');
    if (customInput) customInput.value = color;
    if (codeText) codeText.textContent = color;

    // Preview realtime — áp dụng CSS variables tạm
    applyAccentColor(color);
}

/**
 * Áp dụng màu accent lên CSS variables
 */
function applyAccentColor(color) {
    const root = document.documentElement;
    root.style.setProperty('--accent-primary', color);

    // Tính accent-secondary (đậm hơn 20%)
    const secondary = adjustBrightness(color, -30);
    root.style.setProperty('--accent-secondary', secondary);

    // Tính accent-tertiary (sáng hơn 20%)
    const tertiary = adjustBrightness(color, 30);
    root.style.setProperty('--accent-tertiary', tertiary);

    // Cập nhật gradient
    root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${secondary} 0%, ${color} 100%)`);
    root.style.setProperty('--accent-neon', `linear-gradient(135deg, ${color}, ${secondary})`);
    root.style.setProperty('--shadow-neon', `0 0 20px ${color}80`);
}

/**
 * Điều chỉnh độ sáng hex color
 */
function adjustBrightness(hex, amount) {
    hex = hex.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/**
 * Chọn font chữ — preview ngay
 */
function selectSiteFont(fontName) {
    pendingAppearance.fontFamily = fontName;

    // Load font từ Google Fonts
    loadGoogleFont(fontName);

    // Preview
    const preview = document.getElementById('veFontPreview');
    if (preview) preview.style.fontFamily = `'${fontName}', sans-serif`;
}

/**
 * Load Google Font động
 */
function loadGoogleFont(fontName) {
    const linkId = 'dynamic-google-font';
    let link = document.getElementById(linkId);
    if (!link) {
        link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }
    const encodedFont = fontName.replace(/ /g, '+');
    link.href = `https://fonts.googleapis.com/css2?family=${encodedFont}:wght@300;400;500;600;700&display=swap`;
}

/**
 * Áp dụng font cho toàn trang
 */
function applySiteFont(fontName) {
    loadGoogleFont(fontName);
    document.documentElement.style.setProperty('font-family', `'${fontName}', sans-serif`);
    document.body.style.fontFamily = `'${fontName}', sans-serif`;
}

/**
 * Chọn theme mặc định
 */
function selectDefaultTheme(theme) {
    pendingAppearance.defaultTheme = theme;
}

/**
 * Lưu tất cả cài đặt giao diện lên Supabase
 */
async function saveAppearanceSettings() {
    if (!supabase) return;
    try {
        // Kiểm tra đã có row 'appearance' chưa
        const { data: existing } = await supabase
            .from('site_settings')
            .select('key')
            .eq('key', 'appearance')
            .single();

        let error;
        if (existing) {
            // Update
            const result = await supabase
                .from('site_settings')
                .update({
                    value: pendingAppearance,
                    updated_at: new Date().toISOString()
                })
                .eq('key', 'appearance');
            error = result.error;
        } else {
            // Insert
            const result = await supabase
                .from('site_settings')
                .insert({
                    key: 'appearance',
                    value: pendingAppearance
                });
            error = result.error;
        }

        if (error) throw error;

        showNotification('✅ Đã lưu cài đặt giao diện thành công!', 'success');

        // Áp dụng ngay
        applyAccentColor(pendingAppearance.accentColor);
        applySiteFont(pendingAppearance.fontFamily);

    } catch (err) {
        console.error('❌ Lỗi lưu appearance:', err);
        showNotification('Lỗi khi lưu cài đặt giao diện!', 'error');
    }
}

/**
 * Load cài đặt giao diện từ Supabase (Gọi khi mở tab admin)
 */
async function loadAppearanceSettings() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'appearance')
            .single();

        if (error || !data) return;

        const settings = data.value || {};
        pendingAppearance = {
            accentColor: settings.accentColor || '#4db8ff',
            fontFamily: settings.fontFamily || 'Inter',
            defaultTheme: settings.defaultTheme || 'dark'
        };

        // Cập nhật UI
        selectAccentColor(pendingAppearance.accentColor);

        const fontSelect = document.getElementById('veFontSelect');
        if (fontSelect) fontSelect.value = pendingAppearance.fontFamily;
        selectSiteFont(pendingAppearance.fontFamily);

        const themeRadio = document.querySelector(`input[name="veDefaultTheme"][value="${pendingAppearance.defaultTheme}"]`);
        if (themeRadio) themeRadio.checked = true;

        console.log('✅ Loaded appearance settings:', pendingAppearance);
    } catch (err) {
        console.error('❌ Lỗi load appearance:', err);
    }
}

/**
 * Áp dụng cài đặt giao diện khi load trang (Gọi từ main.js hoặc utils.js)
 */
async function applyAppearanceOnLoad() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'appearance')
            .single();

        if (error || !data) return;

        const s = data.value || {};

        // Áp dụng màu accent
        if (s.accentColor && s.accentColor !== '#4db8ff') {
            applyAccentColor(s.accentColor);
        }

        // Áp dụng font
        if (s.fontFamily && s.fontFamily !== 'Inter') {
            applySiteFont(s.fontFamily);
        }

        // Áp dụng theme mặc định cho user mới (chưa chọn theme)
        if (s.defaultTheme && !localStorage.getItem('theme')) {
            document.documentElement.setAttribute('data-theme', s.defaultTheme);
            const icon = document.getElementById('themeIcon');
            if (icon) icon.className = s.defaultTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
    } catch (err) {
        console.error('Lỗi apply appearance on load:', err);
    }
}

/* ============================================
   MARQUEE — THÔNG BÁO CHẠY CHỮ
   ============================================ */

/**
 * Lưu cài đặt Marquee lên Supabase
 */
/**
 * Cập nhật preview Marquee realtime khi chỉnh tốc độ/màu
 */
function updateMarqueePreview() {
    const preview = document.getElementById('veMarqueePreview');
    const previewText = document.getElementById('veMarqueePreviewText');
    const bg = document.getElementById('veMarqueeBg');
    const color = document.getElementById('veMarqueeColor');
    const speed = document.getElementById('veMarqueeSpeed');
    const alignInput = document.getElementById('veMarqueeAlign');
    const posInput = document.getElementById('veMarqueePosition');

    if (preview && bg) preview.style.background = bg.value;
    if (previewText && color) previewText.style.color = color.value;

    const alignVal = alignInput ? alignInput.value : 'scroll';

    if (previewText) {
        if (alignVal === 'scroll') {
            // Chạy ngang — bật animation
            previewText.style.animation = '';
            previewText.style.display = 'inline-block';
            previewText.style.textAlign = '';
            previewText.style.width = '';
            previewText.style.whiteSpace = 'nowrap';
            previewText.style.transform = '';
            previewText.style.position = '';
            previewText.style.left = '';
            if (speed) {
                const durations = { slow: '20s', normal: '12s', fast: '5s' };
                previewText.style.animationDuration = durations[speed.value] || '12s';
            }
        } else {
            // Căn cố định — tắt animation, dùng vị trí tùy chỉnh
            previewText.style.animation = 'none';
            previewText.style.display = 'block';
            previewText.style.whiteSpace = 'nowrap';
            previewText.style.width = 'auto';
            previewText.style.position = 'relative';

            // Tính vị trí từ slider (0-100%)
            const pos = posInput ? parseInt(posInput.value) : 50;
            // Dùng text-align cho các vị trí preset, hoặc transform cho custom
            if (alignVal === 'left') {
                previewText.style.transform = `translateX(${pos}%)`;
                previewText.style.textAlign = 'left';
            } else if (alignVal === 'center') {
                // 50% = giữa, 0% = trái, 100% = phải
                const offset = pos - 50; // -50 -> +50
                previewText.style.transform = `translateX(${offset}%)`;
                previewText.style.textAlign = 'center';
            } else if (alignVal === 'right') {
                previewText.style.transform = `translateX(-${100 - pos}%)`;
                previewText.style.textAlign = 'right';
            }
        }
    }
}

/**
 * Chọn chế độ căn chỉnh vị trí chữ Marquee (gọi từ nút bấm)
 */
function setMarqueeAlign(mode) {
    // Cập nhật hidden input
    const alignInput = document.getElementById('veMarqueeAlign');
    if (alignInput) alignInput.value = mode;

    // Highlight nút active
    document.querySelectorAll('.ve-align-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.align === mode);
    });

    // Hiện/ẩn slider
    const sliderWrap = document.getElementById('veMarqueeSliderWrap');
    if (sliderWrap) {
        sliderWrap.style.display = mode === 'scroll' ? 'none' : 'block';
    }

    // Reset slider về giá trị mặc định theo chế độ
    const slider = document.getElementById('veMarqueePosition');
    const label = document.getElementById('veMarqueePosLabel');
    if (slider && mode !== 'scroll') {
        const defaults = { left: 0, center: 50, right: 100 };
        slider.value = defaults[mode] || 50;
        if (label) label.textContent = slider.value + '%';
    }

    // Cập nhật preview
    updateMarqueePreview();
}

/**
 * Cập nhật vị trí từ slider kéo thả (gọi khi kéo thanh range)
 */
function updateMarqueePositionFromSlider(val) {
    const label = document.getElementById('veMarqueePosLabel');
    const posInput = document.getElementById('veMarqueePositionValue');
    if (label) label.textContent = val + '%';
    if (posInput) posInput.value = val;
    updateMarqueePreview();
}

/**
 * Cập nhật vị trí chiều dọc từ slider (gọi khi kéo thanh range dọc)
 */
function updateMarqueeVOffset(val) {
    const label = document.getElementById('veMarqueeVLabel');
    if (label) label.textContent = val + 'px';

    // Cập nhật preview và frontend
    const previewText = document.getElementById('veMarqueePreviewText');
    if (previewText) {
        previewText.style.position = 'relative';
        previewText.style.top = val + 'px';
    }
}

async function saveMarqueeSettings() {
    if (!supabase) return;
    try {
        const settings = {
            enabled: document.getElementById('veMarqueeEnabled')?.checked || false,
            text: document.getElementById('veMarqueeText')?.value || '',
            speed: document.getElementById('veMarqueeSpeed')?.value || 'normal',
            textAlign: document.getElementById('veMarqueeAlign')?.value || 'scroll',
            textPosition: parseInt(document.getElementById('veMarqueePosition')?.value || '50'),
            vOffset: parseInt(document.getElementById('veMarqueeVOffset')?.value || '0'),
            bgColor: document.getElementById('veMarqueeBg')?.value || '#1a1a2e',
            textColor: document.getElementById('veMarqueeColor')?.value || '#fbbf24'
        };

        // Upsert (insert nếu chưa có, update nếu có)
        const { data: existing } = await supabase
            .from('site_settings').select('key').eq('key', 'marquee').single();

        let error;
        if (existing) {
            const r = await supabase.from('site_settings')
                .update({ value: settings, updated_at: new Date().toISOString() })
                .eq('key', 'marquee');
            error = r.error;
        } else {
            const r = await supabase.from('site_settings')
                .insert({ key: 'marquee', value: settings });
            error = r.error;
        }

        if (error) throw error;
        showNotification('✅ Đã lưu cài đặt Marquee!', 'success');
    } catch (err) {
        console.error('❌ Lỗi lưu marquee:', err);
        showNotification('Lỗi khi lưu Marquee!', 'error');
    }
}

/**
 * Load cài đặt Marquee (gọi khi mở tab admin)
 */
async function loadMarqueeSettings() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings').select('value').eq('key', 'marquee').single();
        if (error || !data) return;

        const s = data.value || {};
        const toggle = document.getElementById('veMarqueeEnabled');
        const text = document.getElementById('veMarqueeText');
        const speed = document.getElementById('veMarqueeSpeed');
        const align = document.getElementById('veMarqueeAlign');
        const bg = document.getElementById('veMarqueeBg');
        const color = document.getElementById('veMarqueeColor');
        const preview = document.getElementById('veMarqueePreviewText');

        if (toggle) toggle.checked = s.enabled || false;
        if (text) text.value = s.text || '';
        if (speed) speed.value = s.speed || 'normal';
        if (align) align.value = s.textAlign || 'scroll';
        if (bg) bg.value = s.bgColor || '#1a1a2e';
        if (color) color.value = s.textColor || '#fbbf24';
        if (preview && s.text) {
            preview.textContent = s.text;
            preview.style.color = s.textColor || '#fbbf24';
            preview.parentElement.style.background = s.bgColor || '#1a1a2e';
        }

        // Khôi phục vị trí chữ
        const posSlider = document.getElementById('veMarqueePosition');
        const posLabel = document.getElementById('veMarqueePosLabel');
        if (posSlider && s.textPosition !== undefined) {
            posSlider.value = s.textPosition;
        }
        if (posLabel && s.textPosition !== undefined) {
            posLabel.textContent = s.textPosition + '%';
        }
        // Gọi setMarqueeAlign để highlight nút + hiện/ẩn slider + cập nhật preview
        setMarqueeAlign(s.textAlign || 'scroll');

        // Khôi phục chiều dọc
        const vSlider = document.getElementById('veMarqueeVOffset');
        const vLabel = document.getElementById('veMarqueeVLabel');
        if (vSlider) vSlider.value = s.vOffset || 0;
        if (vLabel) vLabel.textContent = (s.vOffset || 0) + 'px';
        updateMarqueeVOffset(s.vOffset || 0);
    } catch (err) {
        console.error('Lỗi load marquee settings:', err);
    }
}

/**
 * Hiển thị Marquee trên trang chủ (gọi khi load trang)
 */
async function loadAndShowMarquee() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings').select('value').eq('key', 'marquee').single();
        if (error || !data) return;

        const s = data.value || {};
        if (!s.enabled || !s.text) return;

        const bar = document.getElementById('siteMarqueeBar');
        const inner = document.getElementById('siteMarqueeInner');
        if (!bar || !inner) return;

        inner.textContent = s.text;
        const bgCol = s.bgColor || '#1a1a2e';
        bar.style.background = `linear-gradient(90deg, ${bgCol} 0%, ${adjustBrightness(bgCol, 15)} 50%, ${bgCol} 100%)`;
        bar.style.setProperty('--marquee-bg', bgCol); /* Cho icon loa dùng cùng màu nền */
        inner.style.color = s.textColor || '#fbbf24';
        bar.setAttribute('data-speed', s.speed || 'normal');

        // Xử lý vị trí chữ (scroll / center / left / right + position %)
        const alignMode = s.textAlign || 'scroll';
        const textPos = s.textPosition !== undefined ? s.textPosition : 50;
        if (alignMode === 'scroll') {
            // Chạy ngang — mặc định
            inner.style.animation = '';
            inner.style.display = 'inline-block';
            inner.style.textAlign = '';
            inner.style.width = '';
            inner.style.whiteSpace = 'nowrap';
            inner.style.transform = '';
            inner.style.position = '';
            inner.style.left = '';
        } else {
            // Căn cố định — tắt animation, dùng position tùy chỉnh
            inner.style.animation = 'none';
            inner.style.display = 'block';
            inner.style.whiteSpace = 'nowrap';
            inner.style.width = 'auto';
            inner.style.position = 'relative';

            if (alignMode === 'left') {
                inner.style.textAlign = 'left';
                inner.style.transform = `translateX(${textPos}%)`;
            } else if (alignMode === 'center') {
                inner.style.textAlign = 'center';
                const offset = textPos - 50;
                inner.style.transform = `translateX(${offset}%)`;
            } else if (alignMode === 'right') {
                inner.style.textAlign = 'right';
                inner.style.transform = `translateX(-${100 - textPos}%)`;
            }
        }

        bar.style.display = 'block';
        document.body.classList.add('marquee-active');

        // Áp dụng chiều dọc (vOffset)
        if (s.vOffset && s.vOffset !== 0) {
            inner.style.position = 'relative';
            inner.style.top = s.vOffset + 'px';
        }
    } catch (err) {
        console.error('Lỗi show marquee:', err);
    }
}

/**
 * Đóng Marquee (user click X)
 */
function closeSiteMarquee() {
    const bar = document.getElementById('siteMarqueeBar');
    if (bar) {
        bar.style.display = 'none';
        document.body.classList.remove('marquee-active');
    }
}

/* ============================================
   POPUP — THÔNG BÁO TOÀN SITE
   ============================================ */

/**
 * Lưu cài đặt Popup lên Supabase
 */
async function savePopupSettings() {
    if (!supabase) return;
    try {
        const settings = {
            enabled: document.getElementById('vePopupEnabled')?.checked || false,
            frequency: getSelectedFrequencies(),
            title: document.getElementById('vePopupTitle')?.value || '',
            content: document.getElementById('vePopupContent')?.value || '',
            titleColor: document.getElementById('vePopupTitleColor')?.value || '#ffffff',
            contentColor: document.getElementById('vePopupContentColor')?.value || '#d9d9d9',
            image: document.getElementById('vePopupImage')?.value || '',
            btnText: document.getElementById('vePopupBtnText')?.value || 'Khám phá ngay',
            btnLink: document.getElementById('vePopupBtnLink')?.value || '',
            btnColor: document.getElementById('vePopupBtnColor')?.value || '#ffffff'
        };

        // Upload ảnh pending lên Cloudflare R2 trước nếu có
        if (window._pendingPopupImage) {
            showNotification('☁️ Đang tải ảnh lên Cloudflare R2...', 'info');
            const file = window._pendingPopupImage;
            const R2_URL = 'https://r2-uploader.thinhnd-2003.workers.dev';
            const customFilename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '')}`;
            const formData = new FormData();
            formData.append('file', file, customFilename);
            formData.append('folder', 'popup-images');
            formData.append('customFilename', customFilename);

            const resp = await fetch(`${R2_URL}/upload`, { method: 'POST', body: formData });
            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error('Upload ảnh thất bại: ' + (errData.error || resp.statusText));
            }
            const result = await resp.json();
            settings.image = result.url;
            document.getElementById('vePopupImage').value = result.url;
            window._pendingPopupImage = null; // Xóa pending

        }

        const { data: existing } = await supabase
            .from('site_settings').select('key').eq('key', 'popup').single();

        let error;
        if (existing) {
            const r = await supabase.from('site_settings')
                .update({ value: settings, updated_at: new Date().toISOString() })
                .eq('key', 'popup');
            error = r.error;
        } else {
            const r = await supabase.from('site_settings')
                .insert({ key: 'popup', value: settings });
            error = r.error;
        }

        if (error) throw error;
        showNotification('✅ Đã lưu cài đặt Popup!', 'success');
    } catch (err) {
        console.error('❌ Lỗi lưu popup:', err);
        showNotification('Lỗi khi lưu Popup!', 'error');
    }
}

/**
 * Load cài đặt Popup (gọi khi mở tab admin)
 */
async function loadPopupSettings() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings').select('value').eq('key', 'popup').single();
        if (error || !data) return;

        const s = data.value || {};
        const toggle = document.getElementById('vePopupEnabled');
        const title = document.getElementById('vePopupTitle');
        const content = document.getElementById('vePopupContent');
        const image = document.getElementById('vePopupImage');
        const btnText = document.getElementById('vePopupBtnText');
        const btnLink = document.getElementById('vePopupBtnLink');

        if (toggle) toggle.checked = s.enabled || false;
        // Load frequency (radio - single value)
        let freq = s.frequency || 'once_day';
        // Tương thích dữ liệu cũ (array) → lấy phần tử đầu
        if (Array.isArray(freq)) freq = freq[0] || 'once_day';
        const radio = document.querySelector(`input[name="popupFrequency"][value="${freq}"]`);
        if (radio) radio.checked = true;
        if (title) title.value = s.title || '';
        if (content) content.value = s.content || '';
        const titleColor = document.getElementById('vePopupTitleColor');
        const contentColor = document.getElementById('vePopupContentColor');
        if (titleColor) titleColor.value = s.titleColor || '#ffffff';
        if (contentColor) contentColor.value = s.contentColor || '#d9d9d9';
        // Áp dụng màu xem trước vào ô tiêu đề + nội dung
        if (title) title.style.color = s.titleColor || '#ffffff';
        if (content) content.style.color = s.contentColor || '#d9d9d9';
        if (image) {
            image.value = s.image || '';
            // Hiện preview nếu có ảnh
            if (s.image) {
                showPopupImagePreview(s.image);
                const urlInput = document.getElementById('vePopupImageUrl');
                if (urlInput) urlInput.value = s.image;
            }
        }
        if (btnText) btnText.value = s.btnText || 'Khám phá ngay';
        if (btnLink) btnLink.value = s.btnLink || '';
        const btnColor = document.getElementById('vePopupBtnColor');
        if (btnColor) btnColor.value = s.btnColor || '#ffffff';
        if (btnText) btnText.style.color = s.btnColor || '#ffffff';
    } catch (err) {
        console.error('Lỗi load popup settings:', err);
    }
}

/**
 * Kiểm tra có nên hiện popup hay không (dựa vào frequency)
 */
function shouldShowPopup(freq) {
    const now = Date.now();
    // Tương thích dữ liệu cũ (array)
    if (Array.isArray(freq)) freq = freq[0] || 'once_day';

    switch (freq) {
        case 'every_visit':
            return !window._sitePopupShownThisLoad;
        case '30min': {
            const last30 = parseInt(localStorage.getItem('sitePopupLast30m') || '0');
            return (now - last30) >= 30 * 60 * 1000;
        }
        case '1hour': {
            const last1h = parseInt(localStorage.getItem('sitePopupLast1h') || '0');
            return (now - last1h) >= 60 * 60 * 1000;
        }
        case 'once_day': {
            const today = new Date().toISOString().split('T')[0];
            return localStorage.getItem('sitePopupLastDate') !== today;
        }
        case 'once_week':
            return localStorage.getItem('sitePopupLastWeek') !== getWeekNumber();
        case 'once_only':
            return !localStorage.getItem('sitePopupShownOnce');
        case 'new_user':
            return !localStorage.getItem('sitePopupNewUserSeen');
        default:
            return false;
    }
}

/**
 * Đánh dấu đã hiện popup (cập nhật localStorage theo frequency)
 */
function markPopupShown(freq) {
    const now = Date.now();
    // Tương thích dữ liệu cũ (array)
    if (Array.isArray(freq)) freq = freq[0] || 'once_day';

    switch (freq) {
        case 'every_visit':
            window._sitePopupShownThisLoad = true;
            break;
        case '30min':
            localStorage.setItem('sitePopupLast30m', now.toString());
            break;
        case '1hour':
            localStorage.setItem('sitePopupLast1h', now.toString());
            break;
        case 'once_day':
            localStorage.setItem('sitePopupLastDate', new Date().toISOString().split('T')[0]);
            break;
        case 'once_week':
            localStorage.setItem('sitePopupLastWeek', getWeekNumber());
            break;
        case 'once_only':
            localStorage.setItem('sitePopupShownOnce', '1');
            break;
        case 'new_user':
            localStorage.setItem('sitePopupNewUserSeen', '1');
            break;
    }
}

/**
 * Lấy danh sách frequency đã chọn từ checkboxes
 */
/**
 * Upload ảnh popup lên Cloudflare R2
 */
async function handlePopupImageUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showNotification('Vui lòng chọn file hình ảnh!', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showNotification('Ảnh quá lớn! Tối đa 5MB.', 'error');
        return;
    }

    // Chỉ preview cục bộ, KHÔNG upload ngay
    const previewUrl = URL.createObjectURL(file);
    window._pendingPopupImage = file; // Lưu file chờ upload khi bấm Lưu
    showPopupImagePreview(previewUrl);
    
    showNotification('📷 Ảnh đã sẵn sàng! Bấm "Lưu Popup" để tải lên Cloudflare R2.', 'info');
    
    // Reset file input
    input.value = '';
}

/**
 * Xóa ảnh popup (xóa trên R2 nếu là URL R2 + xóa preview)
 */
async function removePopupImage() {
    // Xác nhận trước khi xóa
    const result = await Swal.fire({
        title: 'Xóa ảnh minh họa?',
        text: 'Ảnh sẽ bị xóa khỏi Cloudflare R2 (nếu có). Bạn chắc chắn?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '🗑️ Xóa',
        cancelButtonText: 'Hủy',
        background: 'var(--bg-secondary, #1a1a2e)',
        color: '#fff'
    });
    if (!result.isConfirmed) return;

    const imageInput = document.getElementById('vePopupImage');
    const currentUrl = imageInput?.value || '';

    // Xóa trên Cloudflare R2 nếu URL từ workers.dev
    if (currentUrl && (currentUrl.includes('workers.dev') || currentUrl.includes('.r2.dev'))) {
        try {
            const R2_URL = 'https://r2-uploader.thinhnd-2003.workers.dev';
            const urlObj = new URL(currentUrl);
            const key = urlObj.pathname.substring(1); // Bỏ dấu / đầu

            if (key) {
                const resp = await fetch(`${R2_URL}/delete`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key })
                });
                if (resp.ok) {

                } else {
                    console.warn('⚠️ Không thể xóa ảnh R2:', await resp.text());
                }
            }
        } catch (err) {
            console.error('Lỗi xóa ảnh R2:', err);
        }
    }

    // Xóa pending image nếu có
    window._pendingPopupImage = null;

    // Xóa UI
    if (imageInput) imageInput.value = '';
    const preview = document.getElementById('vePopupImagePreview');
    const uploadArea = document.getElementById('vePopupUploadArea');
    const urlInput = document.getElementById('vePopupImageUrl');

    if (preview) preview.style.display = 'none';
    if (uploadArea) {
        uploadArea.style.display = 'block';
        uploadArea.innerHTML = `
            <i class="fas fa-cloud-upload-alt" style="font-size:1.5rem; color:var(--accent-primary, #4db8ff); margin-bottom:6px;"></i>
            <p style="margin:0; font-size:0.85rem; color:var(--text-muted);">Click để chọn ảnh hoặc nhập URL</p>
            <p style="margin:4px 0 0; font-size:0.75rem; color:rgba(255,255,255,0.3);">PNG, JPG, GIF • Tối đa 5MB • Lưu trên Cloudflare R2</p>`;
    }
    if (urlInput) urlInput.value = '';

    showNotification('🗑️ Đã xóa ảnh minh họa!', 'info');

    // Cập nhật Supabase: xóa URL ảnh khỏi DB
    try {
        const { data: existing } = await supabase
            .from('site_settings').select('value').eq('key', 'popup').single();
        if (existing && existing.value) {
            existing.value.image = '';
            await supabase.from('site_settings')
                .update({ value: existing.value, updated_at: new Date().toISOString() })
                .eq('key', 'popup');
            console.log('✅ Đã xóa URL ảnh trong Supabase');
        }
    } catch (err) {
        console.error('Lỗi cập nhật DB sau xóa ảnh:', err);
    }
}

/**
 * Preview ảnh khi dán URL
 */
function previewPopupImageUrl(url) {
    if (!url || url.length < 10) return;
    document.getElementById('vePopupImage').value = url;
    showPopupImagePreview(url);
}

/**
 * Hiện preview ảnh + ẩn upload area
 */
function showPopupImagePreview(url) {
    const preview = document.getElementById('vePopupImagePreview');
    const previewImg = document.getElementById('vePopupImagePreviewImg');
    const uploadArea = document.getElementById('vePopupUploadArea');

    if (previewImg) previewImg.src = url;
    if (preview) preview.style.display = 'block';
    if (uploadArea) uploadArea.style.display = 'none';
}

function getSelectedFrequencies() {
    const selected = document.querySelector('input[name="popupFrequency"]:checked');
    return selected ? selected.value : 'once_day';
}

/**
 * Lấy số tuần hiện tại (năm-tuần)
 */
function getWeekNumber() {
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = d - start;
    const oneWeek = 604800000;
    const week = Math.ceil(diff / oneWeek);
    return `${d.getFullYear()}-W${week}`;
}

/**
 * Hiển thị Popup trên trang (gọi khi load trang — kiểm tra frequency)
 */
async function loadAndShowPopup() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings').select('value').eq('key', 'popup').single();
        
        if (error || !data) return;

        const s = data.value || {};


        if (!s.enabled) return;
        if (!s.title && !s.content) return;

        let frequency = s.frequency || 'once_day';
        // Tương thích dữ liệu cũ (array) → lấy phần tử đầu
        if (Array.isArray(frequency)) frequency = frequency[0] || 'once_day';

        // Kiểm tra tần suất
        if (!shouldShowPopup(frequency)) return;



        // Render popup
        renderSitePopup(s);

        // Hiện popup sau 2 giây
        setTimeout(() => {
            const overlay = document.getElementById('sitePopupOverlay');
            if (overlay) overlay.style.display = 'flex';
        }, 2000);

        // Đánh dấu đã hiện
        markPopupShown(frequency);
    } catch (err) {
        console.error('Lỗi show popup:', err);
    }
}

/**
 * Render nội dung popup
 */
function renderSitePopup(settings) {
    const titleEl = document.getElementById('sitePopupTitle');
    const contentEl = document.getElementById('sitePopupContent');
    const imageEl = document.getElementById('sitePopupImage');
    const btnEl = document.getElementById('sitePopupBtn');
    const card = document.querySelector('.site-popup-card');

    if (titleEl) titleEl.textContent = settings.title || '';
    if (contentEl) contentEl.textContent = settings.content || '';

    // Áp dụng màu chữ tùy chỉnh
    if (titleEl) titleEl.style.color = settings.titleColor || '#ffffff';
    if (contentEl) contentEl.style.color = settings.contentColor || '#d9d9d9';

    // Dùng ảnh làm background cho popup card
    if (imageEl) imageEl.style.display = 'none'; // Ẩn img riêng
    if (card) {
        if (settings.image) {
            card.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 35%, rgba(0,0,0,0.1) 55%, rgba(0,0,0,0.65) 100%), url('${settings.image}')`;
            card.style.backgroundSize = 'cover';
            card.style.backgroundPosition = 'center';
            card.style.minHeight = window.innerWidth <= 768 ? '240px' : '380px';
        } else {
            card.style.backgroundImage = 'none';
            card.style.minHeight = 'auto';
        }
    }

    if (btnEl) {
        btnEl.textContent = settings.btnText || 'Khám phá ngay';
        btnEl.style.color = settings.btnColor || '#ffffff';
        if (settings.btnLink) {
            btnEl.href = settings.btnLink;
        } else {
            btnEl.href = '#';
            btnEl.onclick = (e) => { e.preventDefault(); closeSitePopup(); };
        }
    }

    // Áp dụng vị trí tùy chỉnh nếu admin đã kéo thả
    if (card && (settings.titlePos || settings.contentPos || settings.btnPos)) {
        card.style.position = 'relative';
        const elPad = window.innerWidth <= 768 ? '24px' : '48px';
        const posMap = [
            { sel: '.site-popup-top', pos: settings.titlePos },
            { sel: '.site-popup-middle', pos: settings.contentPos },
            { sel: '.site-popup-bottom', pos: settings.btnPos }
        ];
        setTimeout(() => {
            posMap.forEach(({ sel, pos }) => {
                const el = card.querySelector(sel);
                if (el && pos) {
                    el.style.position = 'absolute';
                    el.style.left = pos.leftPct + '%';
                    el.style.top = pos.topPct + '%';
                    el.style.width = `calc(100% - ${elPad})`;
                    el.style.textAlign = 'center';
                }
            });
        }, 100);
    }
}

/**
 * Xem trước Popup (Admin click "Xem trước")
 */
async function previewSitePopup() {
    // Nếu có ảnh pending (chưa upload), dùng blob URL để preview
    let imageUrl = document.getElementById('vePopupImage')?.value || '';
    if (window._pendingPopupImage) {
        imageUrl = URL.createObjectURL(window._pendingPopupImage);
    }

    const settings = {
        title: document.getElementById('vePopupTitle')?.value || '(Chưa có tiêu đề)',
        content: document.getElementById('vePopupContent')?.value || '(Chưa có nội dung)',
        titleColor: document.getElementById('vePopupTitleColor')?.value || '#ffffff',
        contentColor: document.getElementById('vePopupContentColor')?.value || '#d9d9d9',
        image: imageUrl,
        btnText: document.getElementById('vePopupBtnText')?.value || 'Khám phá ngay',
        btnLink: document.getElementById('vePopupBtnLink')?.value || '',
        btnColor: document.getElementById('vePopupBtnColor')?.value || '#ffffff'
    };

    // Load vị trí đã lưu từ Supabase
    try {
        const { data } = await supabase
            .from('site_settings').select('value').eq('key', 'popup').single();
        if (data && data.value) {
            if (data.value.titlePos) settings.titlePos = data.value.titlePos;
            if (data.value.contentPos) settings.contentPos = data.value.contentPos;
            if (data.value.btnPos) settings.btnPos = data.value.btnPos;
        }
    } catch (err) {
        console.warn('Không load được vị trí đã lưu:', err);
    }

    renderSitePopup(settings);

    const overlay = document.getElementById('sitePopupOverlay');
    if (overlay) overlay.style.display = 'flex';

    // Sau khi layout ổn định → kích hoạt drag mode + auto-center trên mobile
    setTimeout(() => {
        setupPopupDragMode();
        // Trên mobile: auto-center ngang tất cả elements để tránh lệch
        if (window.innerWidth <= 768) {
            setTimeout(() => alignPopupCenter(), 100);
        }
    }, 500);
}

/**
 * Thiết lập chế độ kéo thả + toolbar Hủy/Cập nhật
 */
function setupPopupDragMode() {
    const card = document.getElementById('sitePopupCard');
    if (!card) return;

    const sections = [
        { sel: '.site-popup-top', name: 'titlePos' },
        { sel: '.site-popup-middle', name: 'contentPos' },
        { sel: '.site-popup-bottom', name: 'btnPos' }
    ];

    card.style.position = 'relative';
    const cardRect = card.getBoundingClientRect();

    // Ẩn nút X để tránh ấn nhầm
    const closeBtn = card.querySelector('.site-popup-close');
    if (closeBtn) closeBtn.style.display = 'none';

    // Chặn click link nút khi đang kéo thả
    const btnEl = card.querySelector('.site-popup-btn');
    if (btnEl) {
        btnEl._origHref = btnEl.href;
        btnEl.href = 'javascript:void(0)';
        btnEl.onclick = (e) => e.preventDefault();
    }

    // Ghi nhận vị trí gốc trước khi chuyển absolute
    const origPositions = [];
    sections.forEach(({ sel }) => {
        const el = card.querySelector(sel);
        if (el) {
            const r = el.getBoundingClientRect();
            origPositions.push({
                el,
                left: r.left - cardRect.left,
                top: r.top - cardRect.top,
                width: r.width
            });
        }
    });

    // Biến lưu phần tử đang chọn
    window._selectedPopupEl = null;
    const nameMap = {
        'site-popup-top': '📌 Tiêu đề',
        'site-popup-middle': '📝 Nội dung',
        'site-popup-bottom': '🔘 Nút bấm'
    };

    // Hàm chọn phần tử
    function selectElement(el) {
        // Bỏ chọn cũ
        origPositions.forEach(({ el: e }) => {
            e.style.outline = '2px dashed rgba(255,255,255,0.25)';
            e.style.boxShadow = 'none';
        });
        // Chọn mới
        window._selectedPopupEl = el;
        el.style.outline = '2px solid #4db8ff';
        el.style.boxShadow = '0 0 12px rgba(77,184,255,0.4)';
        // Cập nhật toolbar hiện tên
        const badge = document.querySelector('.popup-drag-selected-name');
        if (badge) {
            const clsName = [...el.classList].find(c => nameMap[c]);
            badge.textContent = nameMap[clsName] || 'Đang chọn';
        }
    }

    // Chuyển sang absolute giữ nguyên vị trí gốc
    origPositions.forEach(({ el, left, top, width }) => {
        el.style.position = 'absolute';
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.style.width = window.innerWidth <= 768 ? 'calc(100% - 24px)' : 'calc(100% - 48px)';
        el.style.cursor = 'grab';
        el.style.zIndex = '10';
        el.style.userSelect = 'none';
        el.style.transition = 'none';
        el.style.borderRadius = '8px';
        el.style.outline = '2px dashed rgba(255,255,255,0.25)';

        // Click để chọn + bắt đầu kéo
        let isDragging = false, startX, startY, origL, origT;

        const onDown = (e) => {
            e.preventDefault(); e.stopPropagation();
            selectElement(el);
            isDragging = true;
            el.style.cursor = 'grabbing';
            el.style.zIndex = '20';
            const p = e.touches ? e.touches[0] : e;
            startX = p.clientX; startY = p.clientY;
            origL = parseInt(el.style.left) || 0;
            origT = parseInt(el.style.top) || 0;
        };
        const onMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const p = e.touches ? e.touches[0] : e;
            el.style.left = (origL + p.clientX - startX) + 'px';
            el.style.top = (origT + p.clientY - startY) + 'px';
        };
        const onUp = () => {
            if (!isDragging) return;
            isDragging = false;
            el.style.cursor = 'grab';
            el.style.zIndex = '10';
        };

        el.addEventListener('mousedown', onDown);
        el.addEventListener('touchstart', onDown, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchend', onUp);

        // Lưu cleanup reference
        el._dragCleanup = () => {
            el.removeEventListener('mousedown', onDown);
            el.removeEventListener('touchstart', onDown);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchend', onUp);
        };
    });

    // Thêm toolbar nằm ngoài popup (dưới cùng màn hình)
    let toolbar = document.querySelector('.popup-drag-toolbar');
    if (toolbar) toolbar.remove();
    toolbar = document.createElement('div');
    toolbar.className = 'popup-drag-toolbar';
    const isMobile = window.innerWidth <= 768;
    toolbar.style.cssText = `position:fixed; bottom:${isMobile ? '10px' : '20px'}; left:50%; transform:translateX(-50%); display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:${isMobile ? '4px' : '8px'}; padding:${isMobile ? '8px 10px' : '12px 20px'}; background:rgba(20,20,40,0.95); backdrop-filter:blur(10px); z-index:100000; border-radius:${isMobile ? '10px' : '14px'}; box-shadow:0 4px 24px rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.15); max-width:${isMobile ? '95vw' : '90vw'};`;
    const btnStyle = `padding:${isMobile ? '5px 8px' : '6px 12px'}; border:1px solid rgba(255,255,255,0.25); background:rgba(255,255,255,0.1); color:#fff; border-radius:8px; cursor:pointer; font-size:${isMobile ? '0.7rem' : '0.8rem'};`;
    const actionBtnStyle = `padding:${isMobile ? '5px 10px' : '6px 16px'}; border-radius:8px; cursor:pointer; font-size:${isMobile ? '0.75rem' : '0.85rem'};`;
    toolbar.innerHTML = `
        <span class="popup-drag-selected-name" style="font-size:${isMobile ? '0.7rem' : '0.8rem'}; color:#4db8ff; width:100%; text-align:center; margin-bottom:${isMobile ? '2px' : '4px'}; font-weight:600;">👆 Bấm chọn phần tử để chỉnh</span>
        <button onclick="alignPopupCenter()" title="Canh giữa ngang" style="${btnStyle}">↔️ Giữa ngang</button>
        <button onclick="alignPopupVertical()" title="Canh giữa dọc" style="${btnStyle}">↕️ Giữa dọc</button>
        <button onclick="alignPopupAll()" title="Canh giữa cả ngang lẫn dọc" style="${btnStyle}">⊞ Giữa tất cả</button>
        <button onclick="alignPopupSpreadVertical()" title="Dàn đều dọc tất cả" style="${btnStyle}">☰ Đều dọc</button>
        ${isMobile ? '' : '<span style="width:1px; height:24px; background:rgba(255,255,255,0.2); margin:0 4px;"></span>'}
        <button onclick="cancelPopupDrag()" style="${actionBtnStyle} border:1px solid rgba(255,255,255,0.3); background:transparent; color:#fff;">Hủy</button>
        <button onclick="savePopupPositions()" style="${actionBtnStyle} background:linear-gradient(135deg,#007aff,#4db8ff); border:none; color:#fff; font-weight:600;">✅ Cập nhật</button>
    `;
    document.body.appendChild(toolbar);
}

/**
 * Canh giữa ngang phần đang chọn (hoặc tất cả nếu chưa chọn)
 */
function alignPopupCenter() {
    const card = document.getElementById('sitePopupCard');
    if (!card) return;
    const cardW = card.offsetWidth;
    const el = window._selectedPopupEl;
    if (el && el.style.position === 'absolute') {
        el.style.left = ((cardW - el.offsetWidth) / 2) + 'px';
    } else {
        // Chưa chọn → canh tất cả
        ['.site-popup-top', '.site-popup-middle', '.site-popup-bottom'].forEach(sel => {
            const e = card.querySelector(sel);
            if (e && e.style.position === 'absolute') {
                e.style.left = ((cardW - e.offsetWidth) / 2) + 'px';
            }
        });
    }
}

/**
 * Canh giữa dọc phần đang chọn (hoặc tất cả)
 */
function alignPopupVertical() {
    const card = document.getElementById('sitePopupCard');
    if (!card) return;
    const cardH = card.offsetHeight;
    const el = window._selectedPopupEl;
    if (el && el.style.position === 'absolute') {
        el.style.top = ((cardH - el.offsetHeight) / 2) + 'px';
    } else {
        ['.site-popup-top', '.site-popup-middle', '.site-popup-bottom'].forEach(sel => {
            const e = card.querySelector(sel);
            if (e && e.style.position === 'absolute') {
                e.style.top = ((cardH - e.offsetHeight) / 2) + 'px';
            }
        });
    }
}

/**
 * Canh giữa tất cả (ngang + dọc) phần đang chọn
 */
function alignPopupAll() {
    alignPopupCenter();
    alignPopupVertical();
}

/**
 * Dàn đều dọc TẤT CẢ phần tử (luôn áp dụng cho cả 3)
 */
function alignPopupSpreadVertical() {
    const card = document.getElementById('sitePopupCard');
    if (!card) return;
    const cardH = card.offsetHeight;
    const sels = ['.site-popup-top', '.site-popup-middle', '.site-popup-bottom'];
    const els = sels.map(s => card.querySelector(s)).filter(e => e && e.style.position === 'absolute');
    if (els.length === 0) return;

    const totalH = els.reduce((sum, el) => sum + el.offsetHeight, 0);
    const gap = (cardH - totalH) / (els.length + 1);
    let y = gap;
    els.forEach(el => {
        el.style.top = y + 'px';
        y += el.offsetHeight + gap;
    });
}

/**
 * Hủy chỉnh vị trí → đóng popup, reset layout
 */
function cancelPopupDrag() {
    cleanupDragMode();
    const overlay = document.getElementById('sitePopupOverlay');
    if (overlay) overlay.style.display = 'none';
}

/**
 * Lưu vị trí đã kéo thả vào Supabase
 */
async function savePopupPositions() {
    const card = document.getElementById('sitePopupCard');
    if (!card) return;

    const cardRect = card.getBoundingClientRect();
    const positions = {};

    ['.site-popup-top', '.site-popup-middle', '.site-popup-bottom'].forEach((sel, i) => {
        const el = card.querySelector(sel);
        if (el) {
            const names = ['titlePos', 'contentPos', 'btnPos'];
            // Lưu vị trí dạng % so với card
            positions[names[i]] = {
                leftPct: ((parseInt(el.style.left) || 0) / cardRect.width * 100).toFixed(1),
                topPct: ((parseInt(el.style.top) || 0) / cardRect.height * 100).toFixed(1)
            };
        }
    });

    // Cập nhật vào Supabase
    try {
        const { data } = await supabase
            .from('site_settings').select('value').eq('key', 'popup').single();
        if (data && data.value) {
            Object.assign(data.value, positions);
            await supabase.from('site_settings')
                .update({ value: data.value, updated_at: new Date().toISOString() })
                .eq('key', 'popup');
            showNotification('✅ Đã cập nhật vị trí hiển thị popup!', 'success');
        }
    } catch (err) {
        console.error('Lỗi lưu vị trí popup:', err);
        showNotification('Lỗi lưu vị trí!', 'error');
    }

    cleanupDragMode();
    const overlay = document.getElementById('sitePopupOverlay');
    if (overlay) overlay.style.display = 'none';
}

/**
 * Dọn dẹp drag mode, reset styles
 */
function cleanupDragMode() {
    const card = document.getElementById('sitePopupCard');
    if (!card) return;

    // Xóa toolbar (nằm ở body)
    const toolbar = document.querySelector('.popup-drag-toolbar');
    if (toolbar) toolbar.remove();
    window._selectedPopupEl = null;

    // Hiện lại nút X
    const closeBtn = card.querySelector('.site-popup-close');
    if (closeBtn) closeBtn.style.display = '';

    // Reset styles
    ['.site-popup-top', '.site-popup-middle', '.site-popup-bottom'].forEach(sel => {
        const el = card.querySelector(sel);
        if (el) {
            if (el._dragCleanup) { el._dragCleanup(); el._dragCleanup = null; }
            el.style.position = '';
            el.style.left = '';
            el.style.top = '';
            el.style.width = '';
            el.style.cursor = '';
            el.style.zIndex = '';
            el.style.userSelect = '';
            el.style.outline = '';
            el.style.transition = '';
            el.style.borderRadius = '';
            el.style.boxShadow = '';
            el.onmouseenter = null;
            el.onmouseleave = null;
        }
    });
}

/**
 * Đóng Popup (user thường + click overlay)
 */
function closeSitePopup() {
    cleanupDragMode();
    const overlay = document.getElementById('sitePopupOverlay');
    if (overlay) overlay.style.display = 'none';
}

/* ============================================================
   API EXPLORER — Đã tách ra file riêng:
   js/admin-api-explorer.js
   ============================================================ */
