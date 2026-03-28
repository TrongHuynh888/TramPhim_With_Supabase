// js/notifications.js

let notificationsUnsubscribeUser = null;
let notificationsUnsubscribeAdmin = null;

let allNotifications = []; // Lưu trữ mảng notifs hiện tại
let currentNotifTab = 'movie'; // Tab hiện tại: 'movie' hoặc 'community'
const _notifMetaMap = {}; // Lưu metadata theo notif.id để xử lý click
let _realtimeDebounceTimer = null; // Biến debounce chống spam Realtime

// Danh sách type thuộc nhóm Cộng đồng
const COMMUNITY_NOTIF_TYPES = [
    'community_post', 'community_comment', 'community_like',
    'friend_request', 'friend_accepted', 'new_comment', 'new_like',
    'mention', 'chat_message'
];

let _notifUserId = null;
let _notifIsAdmin = false;
let _notifPollTimer = null;

/**
 * Khởi tạo listener thông báo
 * @param {Object} user Firebase user object
 * @param {boolean} isAdmin Cờ kiểm tra Admin
 */
function initNotifications(user, isAdmin) {
    if (!supabase || !user) return;
    
    _notifUserId = user.id;
    _notifIsAdmin = isAdmin;
    
    console.log("🔔 Bắt đầu lắng nghe thông báo cho UID:", user.id, "| Cờ Admin:", isAdmin);

    // 1. Tải thông báo ban đầu
    loadInitialNotifications(user.id, isAdmin);

    // 2. Lắng nghe Realtime qua Channel (kênh chính)
    const notificationChannel = supabase
      .channel('public:notifications')
      .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'notifications'
      }, payload => {
          console.log("🔔 [Realtime] Thông báo thay đổi:", payload.eventType);
          // DEBOUNCE: Gom hàng loạt event vào 1 lần gọi duy nhất (chống sập server khi xoá hàng loạt)
          if (_realtimeDebounceTimer) clearTimeout(_realtimeDebounceTimer);
          _realtimeDebounceTimer = setTimeout(() => {
              loadInitialNotifications(user.id, isAdmin);
          }, 1000);
      })
      .subscribe();

    // 3. Fallback polling: kiểm tra thông báo mới mỗi 30 giây
    // Phòng trường hợp Realtime bị mất kết nối
    if (_notifPollTimer) clearInterval(_notifPollTimer);
    _notifPollTimer = setInterval(() => {
        loadInitialNotifications(_notifUserId, _notifIsAdmin);
    }, 30000);

    // 4. Bắt đầu checker ngầm kiểm tra lịch hẹn
    startSilentScheduleChecker();
}

async function loadInitialNotifications(userId, isAdmin) {
    try {
        let query = supabase.from('notifications').select('*');
        
        // Điều kiện: Thông báo cá nhân HOẶC thông báo cho admin (nếu là admin)
        if (isAdmin) {
            query = query.or(`user_id.eq.${userId},is_for_admin.eq.true`);
        } else {
            query = query.eq('user_id', userId).eq('is_for_admin', false);
        }

        const { data, error } = await query.order('created_at', { ascending: false }).limit(201);
        if (error) throw error;

        // 🧹 [TỰ ĐỘNG DỌN RÁC]: Xóa thông báo cũ nếu có nhiều hơn 200 tin
        if (data && data.length > 200) {
            const oldestNotif = data[199]; // Mốc là tin thứ 200
            if (oldestNotif && oldestNotif.created_at) {
                let delQuery = supabase.from('notifications').delete().lt('created_at', oldestNotif.created_at);
                if (isAdmin) {
                    delQuery = delQuery.or(`user_id.eq.${userId},is_for_admin.eq.true`);
                } else {
                    delQuery = delQuery.eq('user_id', userId).eq('is_for_admin', false);
                }
                
                // Chạy ngầm không await để không khóa UI
                delQuery.then(({error: delErr}) => {
                    if (delErr) console.warn("[Dọn Rác] Lỗi xóa quá 200 thông báo:", delErr.message);
                });
            }
            // Loại bỏ các tin từ 201 trở đi khỏi mảng để UI chỉ hiển thị đúng 200 tin
            data.splice(200); 
        }

        allNotifications = data || [];
        renderNotifications();
    } catch (e) {
        console.error("Lỗi load thông báo:", e);
    }
}

/**
 * Dừng lắng nghe thông báo (khi logout)
 */
function stopNotifications() {
    if (supabase) {
        supabase.removeAllChannels();
    }
    // Hủy polling timer khi logout
    if (_notifPollTimer) {
        clearInterval(_notifPollTimer);
        _notifPollTimer = null;
    }
    // Hủy schedule checker khi logout
    if (_schedCheckerTimer) {
        clearInterval(_schedCheckerTimer);
        _schedCheckerTimer = null;
    }
    allNotifications = [];
    renderNotifications(); 
}


/**
 * Render danh sách ra UI
 */
function renderNotifications() {
    const listEl = document.getElementById("notificationList");
    const badgeEl = document.getElementById("notificationBadge");
    
    if (!listEl) return;

    // Cập nhật badge tổng (đếm tất cả loại)
    const unreadCount = allNotifications.filter(n => !n.is_read).length;
    if (badgeEl) {
        if (unreadCount > 0) {
            badgeEl.textContent = unreadCount > 99 ? "99+" : unreadCount;
            badgeEl.style.display = "block";
        } else {
            badgeEl.style.display = "none";
        }
    }

    // Cập nhật badge riêng cho từng tab
    const movieNotifs = allNotifications.filter(n => !isCommunityType(n.type));
    const communityNotifs = allNotifications.filter(n => isCommunityType(n.type));
    
    const movieUnread = movieNotifs.filter(n => !n.is_read).length;
    const communityUnread = communityNotifs.filter(n => !n.is_read).length;
    
    // Yêu cầu: "hiển thị số lượng thông báo như 121/200"
    const movieCountEl = document.getElementById('notifTabCountMovie');
    const communityCountEl = document.getElementById('notifTabCountCommunity');
    if (movieCountEl) movieCountEl.textContent = `(${movieNotifs.length}/200)`;
    if (communityCountEl) communityCountEl.textContent = `(${communityNotifs.length}/200)`;
    
    const movieBadge = document.getElementById('notifTabBadgeMovie');
    const communityBadge = document.getElementById('notifTabBadgeCommunity');
    
    if (movieBadge) {
        movieBadge.textContent = movieUnread > 0 ? (movieUnread > 99 ? '99+' : movieUnread) : '';
        movieBadge.style.display = movieUnread > 0 ? 'inline-flex' : 'none';
    }
    if (communityBadge) {
        communityBadge.textContent = communityUnread > 0 ? (communityUnread > 99 ? '99+' : communityUnread) : '';
        communityBadge.style.display = communityUnread > 0 ? 'inline-flex' : 'none';
    }

    // Lọc thông báo theo tab hiện tại
    const filteredNotifs = allNotifications.filter(n => isCommunityType(n.type) === (currentNotifTab === 'community'));

    // Nếu không có thông báo ở tab hiện tại
    if (filteredNotifs.length === 0) {
        const emptyMsg = currentNotifTab === 'movie' ? 'Không có thông báo phim' : 'Không có thông báo cộng đồng';
        listEl.innerHTML = `<li style="padding: 15px; text-align: center; color: var(--text-muted);">${emptyMsg}</li>`;
        return;
    }

    listEl.innerHTML = "";
    filteredNotifs.forEach(notif => {
        const li = document.createElement("li");
        li.className = `notification-item ${notif.is_read ? "read" : "unread"}`;
        
        // Icon theo loại thông báo
        let iconHtml = '<i class="fas fa-bell text-info"></i>';
        if (notif.type === "vip_request") iconHtml = '<i class="fas fa-star text-warning"></i>';
        if (notif.type === "vip_approved") iconHtml = '<i class="fas fa-check-circle text-success"></i>';
        if (notif.type === "new_movie" || notif.type === "new_episode") iconHtml = '<i class="fas fa-film" style="color: #e50914;"></i>';
        // Icon cho nhóm cộng đồng
        if (notif.type === "friend_request" || notif.type === "friend_accepted") iconHtml = '<i class="fas fa-user-friends" style="color: #3b82f6;"></i>';
        if (notif.type === "community_comment" || notif.type === "new_comment") iconHtml = '<i class="fas fa-comment" style="color: #10b981;"></i>';
        if (notif.type === "community_like" || notif.type === "new_like") iconHtml = '<i class="fas fa-heart" style="color: #ef4444;"></i>';
        if (notif.type === "community_post") iconHtml = '<i class="fas fa-pen-fancy" style="color: #8b5cf6;"></i>';
        if (notif.type === "mention") iconHtml = '<i class="fas fa-at" style="color: #f59e0b;"></i>';
        if (notif.type === "chat_message") iconHtml = '<i class="fas fa-envelope" style="color: #06b6d4;"></i>';

        // Format thời gian
        let timeStr = "Vừa xong";
        if (notif.created_at) {
            const date = new Date(notif.created_at);
            timeStr = date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
        }

        // Xử lý action click - lưu metadata vào map, truyền notifId
        if (notif.metadata) _notifMetaMap[notif.id] = notif.metadata;

        // Click vào tiêu đề → điều hướng tới phim, click vùng khác → chỉ đánh dấu đã đọc
        const titleClickAction = `event.stopPropagation(); markAsRead('${notif.id}'); handleNotificationClick('${notif.type}', '${notif.id}')`;
        const contentClickAction = `markAsRead('${notif.id}')`;

        li.innerHTML = `
            <div class="notif-content" onclick="${contentClickAction}">
                <div class="notif-icon">${iconHtml}</div>
                <div class="notif-text">
                    <div class="notif-title" onclick="${titleClickAction}" style="cursor:pointer;">${notif.title}</div>
                    <div class="notif-message">${notif.message}</div>
                    <div class="notif-time">${timeStr}</div>
                </div>
            </div>
            <button class="notif-delete-btn" onclick="deleteNotification(event, '${notif.id}')" title="Xoá thông báo">
                <i class="fas fa-times"></i>
            </button>
        `;
        listEl.appendChild(li);
    });

    // Hiển thị thông báo giới hạn nếu số lượng đạt max (200)
    if (allNotifications.length >= 200) {
        const limitLi = document.createElement("li");
        limitLi.style.cssText = "text-align: center; padding: 12px; font-size: 0.85rem; color: var(--text-muted); background: rgba(255,255,255,0.02); border-top: 1px solid rgba(255,255,255,0.05); margin-top: 5px;";
        limitLi.innerHTML = '<i class="fas fa-info-circle"></i> Đã đạt giới hạn 200 thông báo gần nhất. Các tin cũ sẽ tự động bị xóa.';
        listEl.appendChild(limitLi);
    }
}

/**
 * Kiểm tra type có thuộc nhóm Cộng đồng không
 */
function isCommunityType(type) {
    if (!type) return false;
    return COMMUNITY_NOTIF_TYPES.includes(type) || type.startsWith('community_');
}

/**
 * Chuyển đổi tab thông báo (Phim / Cộng đồng)
 */
function switchNotifTab(tab) {
    currentNotifTab = tab;
    // Cập nhật UI nút tab
    document.querySelectorAll('.notif-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // Re-render danh sách theo tab mới
    renderNotifications();
}

/**
 * Xử lý click trên thông báo tuỳ theo type
 */
function handleNotificationClick(type, notifId) {
    const dropdown = document.getElementById("notificationDropdown");
    if (dropdown) dropdown.classList.add("hidden");

    // Lấy metadata từ map theo notifId
    const meta = _notifMetaMap[notifId] || {};

    // Phim mới / Tập mới: chuyển tới trang chi tiết phim
    if ((type === 'new_movie' || type === 'new_episode') && meta.movie_id) {
        if (typeof viewMovieDetail === 'function') {
            viewMovieDetail(meta.movie_id);
        }
        return;
    }

    // Admin: chuyển sang trang quản lý VIP
    if (type === "vip_request" && typeof isAdmin !== "undefined" && isAdmin && typeof showPage === "function" && typeof window.showAdminPanel === "function") {
        showPage('admin');
        setTimeout(() => {
            window.showAdminPanel('vipRequests');
        }, 100);
        return;
    }

    // Cộng đồng: chuyển sang trang Community
    if (isCommunityType(type) && typeof showPage === 'function') {
        showPage('community');
        if (!isCommunityLoaded && typeof initCommunity === 'function') {
            initCommunity();
            isCommunityLoaded = true;
        }
        
        // Chat message → mở tab Chat
        if (type === 'chat_message' && typeof switchCommView === 'function') {
            setTimeout(() => switchCommView('chat'), 300);
        }
        // Bài đăng → mở tab Feed
        else if (type === 'community_post' && typeof switchCommView === 'function') {
            setTimeout(() => switchCommView('feed'), 300);
        }
        // Kết bạn → mở tab Friends
        else if ((type === 'friend_request' || type === 'friend_accepted') && typeof switchCommView === 'function') {
            setTimeout(() => switchCommView('friends'), 300);
        }
    }
}

/**
 * Đánh dấu đã đọc tất cả notification chat_message từ 1 sender (theo tên hiển thị)
 * Gọi khi user mở chat với người đó
 * @param {string} senderName Tên người gửi (xuất hiện trong title notification)
 */
async function markChatNotifAsRead(senderName) {
    if (!supabase || !currentUser || !senderName) return;
    try {
        // Tìm tất cả notification chat_message chưa đọc có chứa tên sender
        const { data: chatNotifs } = await supabase
            .from('notifications')
            .select('id, title')
            .eq('user_id', currentUser.id)
            .eq('type', 'chat_message')
            .eq('is_read', false);
        
        if (!chatNotifs || chatNotifs.length === 0) return;
        
        // Lọc theo tên sender trong title (format: "💬 TênSender")
        const matchIds = chatNotifs
            .filter(n => n.title && n.title.includes(senderName))
            .map(n => n.id);
        
        if (matchIds.length > 0) {
            await supabase
                .from('notifications')
                .update({ is_read: true })
                .in('id', matchIds);
            
            console.log(`✅ Đánh dấu đã đọc ${matchIds.length} notification chat từ ${senderName}`);
            // Reload để cập nhật badge
            loadInitialNotifications(currentUser.id, typeof isAdmin !== 'undefined' && isAdmin);
        }
    } catch (e) {
        console.warn('Lỗi markChatNotifAsRead:', e);
    }
}

/**
 * Đánh dấu 1 thông báo đã đọc
 */
async function markAsRead(notifId) {
    if (!supabase) return;
    try {
        await supabase.from('notifications').update({
            is_read: true
        }).eq('id', notifId);
    } catch(err) {
        console.error("Lỗi đánh dấu đã đọc:", err);
    }
}

async function markAllAsRead() {
    if (!supabase || !currentUser) return;
    try {
        await supabase.from('notifications').update({
            is_read: true
        }).eq('user_id', currentUser.id).eq('is_read', false);
        
        showNotification("Đã đánh dấu tất cả là đã đọc", "success");
        loadInitialNotifications(currentUser.id, isAdmin);
    } catch(err) {
        console.error("Lỗi đánh dấu tất cả đã đọc:", err);
    }
}

/**
 * Xóa 1 thông báo
 */
async function deleteNotification(event, notifId) {
    if (event) event.stopPropagation();
    if (!supabase) return;
    try {
        await supabase.from('notifications').delete().eq('id', notifId);
        // Reload UI ngay lập tức
        loadInitialNotifications(currentUser.id, typeof isAdmin !== 'undefined' && isAdmin);
    } catch(err) {
        console.error("Lỗi xóa thông báo:", err);
    }
}

/**
 * Xóa TẤT CẢ thông báo (chỉ xóa tab đang mở)
 */
async function deleteAllNotifications() {
    if (!supabase || !currentUser || allNotifications.length === 0) return;
    
    const tabLabel = currentNotifTab === 'movie' ? 'Phim' : 'Cộng đồng';
    
    if (await customConfirm(`Bạn có chắc chắn muốn xoá tất cả thông báo "${tabLabel}" không?`, { title: "Xóa thông báo", type: "danger", confirmText: "Xóa tất cả" })) {
        try {
            // Lọc ID thông báo thuộc tab hiện tại để xóa
            const idsToDelete = allNotifications
                .filter(n => isCommunityType(n.type) === (currentNotifTab === 'community'))
                .map(n => n.id);
            
            if (idsToDelete.length === 0) return;
            
            await supabase.from('notifications').delete().in('id', idsToDelete);
            showNotification(`Đã xoá tất cả thông báo ${tabLabel}`, "success");
            loadInitialNotifications(currentUser.id, isAdmin);
        } catch(err) {
            console.error("Lỗi xóa tất cả thông báo:", err);
        }
    }
}

async function sendNotification(userId, title, message, type = "system") {
    if (!supabase) return;
    try {
        const isForAdmin = userId === "admin";
        await supabase.from('notifications').insert({
            user_id: isForAdmin ? null : userId,
            is_for_admin: isForAdmin,
            title: title,
            message: message,
            type: type,
            is_read: false
        });
        
        // Luôn cập nhật UI ngay lập tức (refresh badge + danh sách)
        if (currentUser && typeof loadInitialNotifications === 'function') {
            loadInitialNotifications(currentUser.id, typeof isAdmin !== 'undefined' && isAdmin);
        }
    } catch(err) {
        console.error("Lỗi thêm thông báo:", err);
    }
}

const _lastSentGlobalNotifs = new Set();

/**
 * Gửi thông báo tới TẤT CẢ users (dùng khi admin đăng phim mới)
 * Sử dụng batch write để tối ưu hiệu suất
 * @param {string} title Tiêu đề thông báo
 * @param {string} message Nội dung thông báo
 * @param {string} type Loại thông báo (mặc định: "new_movie")
 */
async function sendNotificationToAllUsers(title, message, type = "new_movie", metadata = null) {
    if (!supabase) return;
    try {
        // [CƠ CHẾ CHỐNG SPAM]: Chặn thông báo trùng lặp chuẩn xác trong vòng 60 giây
        // Giải quyết lỗi Auto-Sync quét đa nguồn sinh ra 2 thông báo cho cùng 1 tập phim
        const sig = `${title}|${message}`;
        if (_lastSentGlobalNotifs.has(sig)) {
            console.log(`[NotifDedupe] Bỏ qua thông báo trùng lặp: ${title}`);
            return;
        }
        _lastSentGlobalNotifs.add(sig);
        setTimeout(() => _lastSentGlobalNotifs.delete(sig), 60000);

        const { data: profiles, error } = await supabase.from('profiles').select('id');
        if (error || !profiles) return;

        const notifs = profiles.map(p => {
            const row = {
                user_id: p.id,
                is_for_admin: false,
                title: title,
                message: message,
                type: type,
                is_read: false
            };
            if (metadata) row.metadata = metadata;
            return row;
        });

        // Supabase có thể insert mảng lớn một cách hiệu quả
        const { error: insError } = await supabase.from('notifications').insert(notifs);
        if (insError) throw insError;

        console.log(`🔔 Đã gửi thông báo tới ${notifs.length} users`);
    } catch(err) {
        console.error("Lỗi gửi thông báo tới tất cả users:", err);
    }
}

/**
 * Toggle Dropdown Thông báo
 */
window.toggleNotificationDropdown = function(event) {
    if (event) event.stopPropagation();
    
    const dropdown = document.getElementById("notificationDropdown");
    if (!dropdown) return;

    dropdown.classList.toggle("hidden");

    if (!dropdown.classList.contains("hidden")) {
        // Đóng các dropdown khác nếu đang mở
        const userDropdown = document.getElementById("userDropdown");
        if (userDropdown) userDropdown.classList.remove("active");
    }
}

// Đóng dropdown khi click ra ngoài
document.addEventListener("click", function(event) {
    const dropdown = document.getElementById("notificationDropdown");
    const btn = document.getElementById("notificationBtn");
    
    if (dropdown && !dropdown.classList.contains("hidden")) {
        if (!dropdown.contains(event.target) && !btn.contains(event.target)) {
            dropdown.classList.add("hidden");
        }
    }
});

/* ============================================
   SILENT SCHEDULE CHECKER (CHẠY NGẦM CHO MỌI USER)
   Checker hoàn toàn ẩn - user không thấy bất kỳ dữ liệu lịch hẹn nào
   Chỉ tạo thông báo khi tới giờ đã hẹn
   ============================================ */

let _schedCheckerTimer = null;

/**
 * Bắt đầu checker ngầm - gọi bởi initNotifications
 * Chạy mỗi 30 giây, hoàn toàn invisible với user
 */
function startSilentScheduleChecker() {
    // 🔥 TỐI ƯU HÓA: Phân quyền tần suất
    // Admin: 1 phút (để xử lý nhanh các thông báo hệ thống)
    // User: 5 phút (để tiết kiệm lượt đọc Firestore cho hệ thống)
    const isAdminUser = typeof isAdmin !== 'undefined' && isAdmin;
    const intervalTime = isAdminUser ? 60000 : 300000; 

    // Hủy timer cũ nếu có
    if (_schedCheckerTimer) clearInterval(_schedCheckerTimer);

    // Check ngay lần đầu (delay 10s để trang load xong hẳn)
    setTimeout(() => { _silentCheckScheduled(); }, 10000);

    // Lặp lại theo tần suất đã tối ưu
    _schedCheckerTimer = setInterval(() => {
        _silentCheckScheduled();
    }, intervalTime);
    
    console.log(`🔔 Notification Checker: ${intervalTime/1000}s interval active.`);
}

/**
 * Kiểm tra ngầm các lịch hẹn đã tới giờ và gửi thông báo
 * Hoàn toàn silent - không log ra console ở chế độ bình thường
 */
async function _silentCheckScheduled() {
    if (!supabase) return;

    try {
        const now = new Date();
        const { data: dueDocs, error } = await supabase
            .from('scheduled_notifications')
            .select('*')
            .eq('status', 'pending');

        if (error || !dueDocs || dueDocs.length === 0) return;

        for (const sched of dueDocs) {
            const schedTime = new Date(sched.scheduled_at);
            if (schedTime > now) continue;

            // Dùng logic update với condition để tránh race condition (giả lập transaction lock)
            const { data: updated, error: lockError } = await supabase
                .from('scheduled_notifications')
                .update({ last_sent_at: now.toISOString() })
                .eq('id', sched.id)
                .eq('status', 'pending') // Chỉ update nếu vẫn pending
                .select();

            if (lockError || !updated || updated.length === 0) continue;

            // Gửi thông báo
            await sendNotificationToAllUsers(sched.title, sched.message, sched.type);
            console.log(`✅ Đã gửi thông báo hẹn giờ: "${sched.title}"`);

            // Cập nhật trạng thái/lịch tiếp theo
            const updateFields = {};
            if (sched.repeat === "once") {
                updateFields.status = "sent";
            } else {
                let nextDate = new Date(schedTime);
                if (sched.repeat === "daily") nextDate.setDate(nextDate.getDate() + 1);
                else if (sched.repeat === "weekly") nextDate.setDate(nextDate.getDate() + 7);
                else if (sched.repeat === "monthly") nextDate.setMonth(nextDate.getMonth() + 1);

                while (nextDate <= now) {
                    if (sched.repeat === "daily") nextDate.setDate(nextDate.getDate() + 1);
                    else if (sched.repeat === "weekly") nextDate.setDate(nextDate.getDate() + 7);
                    else if (sched.repeat === "monthly") nextDate.setMonth(nextDate.getMonth() + 1);
                }
                updateFields.scheduled_at = nextDate.toISOString();
            }

            await supabase.from('scheduled_notifications').update(updateFields).eq('id', sched.id);
        }
    } catch (err) {
        console.error("❌ Lỗi schedule checker:", err);
    }
}
