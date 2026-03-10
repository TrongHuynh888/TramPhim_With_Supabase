// js/notifications.js

let notificationsUnsubscribeUser = null;
let notificationsUnsubscribeAdmin = null;

let allNotifications = []; // Lưu trữ mảng notifs hiện tại

/**
 * Khởi tạo listener thông báo
 * @param {Object} user Firebase user object
 * @param {boolean} isAdmin Cờ kiểm tra Admin
 */
function initNotifications(user, isAdmin) {
    if (!supabase || !user) return;
    
    console.log("🔔 Bắt đầu lắng nghe thông báo cho UID:", user.id, "| Cờ Admin:", isAdmin);

    // 1. Tải thông báo ban đầu
    loadInitialNotifications(user.id, isAdmin);

    // 2. Lắng nghe Realtime qua Channel
    const notificationChannel = supabase
      .channel('public:notifications')
      .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'notifications'
      }, payload => {
          console.log("🔔 [Realtime] Thông báo thay đổi:", payload.eventType);
          // Load lại để đơn giản hoặc xử lý payload.new/payload.old
          loadInitialNotifications(user.id, isAdmin);
      })
      .subscribe();

    // 3. Bắt đầu checker ngầm kiểm tra lịch hẹn
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

        const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
        if (error) throw error;

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

    // Cập nhật badge
    const unreadCount = allNotifications.filter(n => !n.isRead).length;
    if (badgeEl) {
        if (unreadCount > 0) {
            badgeEl.textContent = unreadCount > 99 ? "99+" : unreadCount;
            badgeEl.style.display = "block";
        } else {
            badgeEl.style.display = "none";
        }
    }

    // Nếu không có thông báo
    if (allNotifications.length === 0) {
        listEl.innerHTML = `<li style="padding: 15px; text-align: center; color: var(--text-muted);">Không có thông báo mới</li>`;
        return;
    }

    listEl.innerHTML = "";
    allNotifications.forEach(notif => {
        const li = document.createElement("li");
        li.className = `notification-item ${notif.isRead ? "read" : "unread"}`;
        
        // Icon theo loại thông báo
        let iconHtml = '<i class="fas fa-bell text-info"></i>';
        if (notif.type === "vip_request") iconHtml = '<i class="fas fa-star text-warning"></i>';
        if (notif.type === "vip_approved") iconHtml = '<i class="fas fa-check-circle text-success"></i>';
        if (notif.type === "new_movie") iconHtml = '<i class="fas fa-film" style="color: #e50914;"></i>';

        // Format thời gian
        let timeStr = "Vừa xong";
        if (notif.created_at) {
            const date = new Date(notif.created_at);
            timeStr = date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
        }

        // Xử lý action click
        const clickAction = `markAsRead('${notif.id}'); handleNotificationClick('${notif.type}')`;

        li.innerHTML = `
            <div class="notif-content" onclick="${clickAction}">
                <div class="notif-icon">${iconHtml}</div>
                <div class="notif-text">
                    <div class="notif-title">${notif.title}</div>
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
}

/**
 * Xử lý click trên thông báo tuỳ theo type
 */
function handleNotificationClick(type) {
    const dropdown = document.getElementById("notificationDropdown");
    if (dropdown) dropdown.classList.add("hidden");

    // Chỉ cho Admin chuyển sang trang quản lý VIP, user thường bỏ qua
    if (type === "vip_request" && typeof isAdmin !== "undefined" && isAdmin && typeof showPage === "function" && typeof window.showAdminPanel === "function") {
        showPage('admin');
        setTimeout(() => {
            window.showAdminPanel('vipRequests');
        }, 100);
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
    } catch(err) {
        console.error("Lỗi xóa thông báo:", err);
    }
}

/**
 * Xóa TẤT CẢ thông báo
 */
async function deleteAllNotifications() {
    if (!supabase || !currentUser || allNotifications.length === 0) return;
    
    if (await customConfirm("Bạn có chắc chắn muốn xoá TẤT CẢ thông báo không?", { title: "Xóa thông báo", type: "danger", confirmText: "Xóa tất cả" })) {
        try {
            await supabase.from('notifications').delete().eq('user_id', currentUser.id);
            showNotification("Đã xoá tất cả thông báo", "success");
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
    } catch(err) {
        console.error("Lỗi thêm thông báo:", err);
    }
}

/**
 * Gửi thông báo tới TẤT CẢ users (dùng khi admin đăng phim mới)
 * Sử dụng batch write để tối ưu hiệu suất
 * @param {string} title Tiêu đề thông báo
 * @param {string} message Nội dung thông báo
 * @param {string} type Loại thông báo (mặc định: "new_movie")
 */
async function sendNotificationToAllUsers(title, message, type = "new_movie") {
    if (!supabase) return;
    try {
        const { data: profiles, error } = await supabase.from('profiles').select('id');
        if (error || !profiles) return;

        const notifs = profiles.map(p => ({
            user_id: p.id,
            is_for_admin: false,
            title: title,
            message: message,
            type: type,
            is_read: false
        }));

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
