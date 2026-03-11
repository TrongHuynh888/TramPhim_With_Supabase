/**
 * COMMUNITY MODULE (CineConnect/CineChat Inspired)
 * Chứa logic load trang Cộng Đồng, Feed, Chat, Profile.
 */

// Global state
let isCommunityLoaded = false;
let currentCommView = 'feed'; // feed | chat | profile
let communityPresenceChannel = null;
let userPresenceMap = new Map(); // userId -> { online: boolean, last_seen: string }
let currentChatTarget = null; // Thông tin người đang chat cùng

// 1. MODULE LOADER (Tương tự Watch Party)
async function initCommunityModule() {
  console.log("🚀 Đang tải module Cộng Đồng...");

  if (!document.getElementById("communityPage")) {
    try {
      const response = await fetch("./components/community.html?v=" + new Date().getTime());
      if (!response.ok) throw new Error("Không tìm thấy file giao diện community.html");
      const html = await response.text();
      document.getElementById("mainContent").insertAdjacentHTML("beforeend", html);
    } catch (error) {
      console.error("Lỗi tải trang Cộng Đồng:", error);
      return;
    }
  }

  // 1.2 Inject Navbar
  const navMenu = document.getElementById("navMenu");
  // Tìm nút Watch Party (xem chung)
  const wpLink = navMenu.querySelector('[data-page="watchParty"]');
  if (wpLink && !navMenu.querySelector('[data-page="community"]')) {
      const link = document.createElement("a");
      link.href = "javascript:void(0)";
      link.className = "nav-link";
      link.dataset.page = "community";
      link.innerHTML = '<i class="fas fa-users-rays"></i> Cộng Đồng';
      link.onclick = (e) => {
          e.preventDefault();
          showPage("community");
          if (!isCommunityLoaded) {
              initCommunity();
              isCommunityLoaded = true;
          }
      };
      
      // Chèn ngay sau nút Xem Chung
      wpLink.insertAdjacentElement('afterend', link);
  }
}

// Chạy khởi tạo
initCommunityModule().then(() => {
    // Tự động load data nếu user refresh lại trang ở mục Cộng Đồng
    setTimeout(() => {
        if (window.location.hash.includes('community') && !isCommunityLoaded) {
            initCommunity();
            isCommunityLoaded = true;
        }
    }, 1000); // Đợi 1s cho Firebase Auth chuẩn bị currentUser
});

// 2. MAIN LOGIC (Sẽ cần Supabase schema)
async function initCommunity() {
    console.log("Loading community data...");
    // Assuming currentUser is already set globally or fetched by a parent function
    // If not, uncomment and ensure getCurrentUser() is defined:
    // currentUser = await getCurrentUser(); 
    if (!currentUser) return;
    
    // Khởi tạo Presence (Trạng thái Online)
    initPresence();
    
    // Bắt đầu Heartbeat (Cập nhật last_seen mỗi 2 phút)
    startHeartbeat();
    
    // Original loadCommunityData content moved here
    if (currentUser) {
        // Cập nhật Avatar ở khung post
        const avatarImg = document.getElementById("commUserAvatar");
        if (avatarImg) {
            avatarImg.src = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || "User")}&background=random`;
        }
        
        // Tải lời mời kết bạn ban đầu nếu có
        fetchFriendRequests();
        // Bắt đầu lắng nghe realtime thay đổi kết bạn
        subscribeToFriends();
    }
    
    // Gọi tải bảng tin
    await fetchPosts();
    // Tải danh sách gợi ý
    fetchSuggestedFriends();
    // Start Realtime subscriptions for interactions
    subscribeToInteractions();
    
    // Khởi tạo PeerJS Call (Đã dời ra ngoài để chạy Global)
}

// Global Init cho PeerJS ngay khi file script được load (Nếu đã login)
setTimeout(() => {
    if (currentUser) {
        initCineChatCall();
    }
}, 3000); // Delay 3 giây để đợi Firebase auth check xong

// 3. SWITCH VIEWS
function switchCommView(viewName) {
    try {
        currentCommView = viewName;
        
        // Ẩn tất cả và quản lý trạng thái body (lock scroll/hide footer)
        const views = ["commFeedView", "commChatView", "commProfileView"];
        views.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });
        
        // Mặc định xóa class chat-active khi chuyển view, sẽ add lại nếu vào chat
        document.body.classList.remove('comm-chat-active');
        
        // Update active nav state
        const navItems = document.querySelectorAll(".comm-left-sidebar .comm-nav-item");
        navItems.forEach(i => i.classList.remove('active'));

        // Hiện view tương ứng
        if (viewName === 'feed') {
            const el = document.getElementById("commFeedView");
            if (el) el.style.display = "grid";
            if (navItems[0]) navItems[0].classList.add("active");
            
            const tabs = document.querySelector(".comm-feed-tabs");
            if(tabs) {
                tabs.innerHTML = `
                    <button class="comm-tab active">Tất cả bài viết</button>
                    <button class="comm-tab">Đang theo dõi</button>
                    <button class="comm-tab">Thịnh hành</button>
                `;
            }
            const composer = document.querySelector(".comm-composer");
            if (composer) composer.style.display = "flex";
            
            fetchPosts();
            
        } else if (viewName === 'chat') {
            const el = document.getElementById("commChatView");
            if (el) el.style.display = "grid";
            if (navItems[1]) navItems[1].classList.add("active");
            
            // Kích hoạt trạng thái khóa cuộn và ẩn footer
            document.body.classList.add('comm-chat-active');
            
            // Nếu đã chọn người chat trước đó, tự động đánh dấu đã xem khi quay lại tab
            if (currentChatUserId) {
                markMessagesAsSeen(currentChatUserId);
            }

            // Nếu chưa chọn người chat -> Hiện màn hình chào mừng, ẩn khung chat
            if (!currentChatUserId) {
                const welcomeEl = document.getElementById("commChatWelcome");
                const contentEl = document.getElementById("commChatContent");
                if (welcomeEl) welcomeEl.style.display = "flex";
                if (contentEl) contentEl.style.display = "none";
                loadChatList();
            }
        } else if (viewName === 'friends') {
            const el = document.getElementById("commFeedView");
            if (el) el.style.display = "grid";
            if (navItems[2]) navItems[2].classList.add("active");
            renderFriendsView();
        } else if (viewName === 'profile') {
            const el = document.getElementById("commProfileView");
            if (el) el.style.display = "flex";
            if (navItems[3]) navItems[3].classList.add("active");
            renderMyProfile();
        }
    } catch (e) {
        console.error("Lỗi chuyển View:", e);
    }
}

function viewUserProfile(userId) {
    if (!userId) return;
    switchCommView('profile');
    renderUserProfile(userId);
}

// 4. SUPABASE RENDER POSTS
async function fetchPosts() {
    const container = document.getElementById("commFeedContainer");
    if (!container) return;
    
    container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 40px;">
            <div class="loading-spinner"></div>
            <p>Đang tải bảng tin...</p>
        </div>
    `;

    try {
        const { data, error } = await supabase
            .from('community_posts')
            .select(`
                id, content, media_url, movie_id, likes_count, comments_count, shares_count, created_at,
                profiles:user_id ( id, display_name, avatar, role )
            `)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        // Lấy danh sách post đã like của user hiện tại
        let userLikes = [];
        if (currentUser) {
            const { data: likes } = await supabase
                .from('community_post_likes')
                .select('post_id')
                .eq('user_id', currentUser.id);
            userLikes = likes.map(l => l.post_id);
        }

        if (!data || data.length === 0) {
            container.innerHTML = `<p class="text-center text-muted" style="padding: 20px;">Chưa có bài viết nào. Hãy là người đầu tiên khơi mào!</p>`;
            return;
        }

        container.innerHTML = data.map(post => {
            const user = post.profiles || {};
            const name = user.display_name || "Nhà báo vô danh";
            const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
            const timeAgo = formatTimeAgo(new Date(post.created_at));
            const isLiked = userLikes.includes(post.id);
            const isOwner = currentUser && (currentUser.id === user.id || currentUser.role === 'admin');
            
            return `
                <div class="comm-post-card" id="post-${post.id}">
                    <div class="comm-post-header">
                        <div class="comm-post-user" onclick="viewUserProfile('${user.id}')">
                            <img src="${avatar}" alt="${name}">
                            <div class="comm-post-meta">
                                <span class="comm-post-name">${name} ${user.role==='admin' ? '<i class="fas fa-check-circle" style="color:#4db8ff; font-size:0.8em;" title="Admin"></i>' : ''}</span>
                                <span class="comm-post-time">${timeAgo}</span>
                            </div>
                        </div>
                        
                        ${isOwner ? `
                        <div class="comm-post-options-container">
                            <button class="comm-post-options" onclick="togglePostOptions('${post.id}')">
                                <i class="fas fa-ellipsis-h"></i>
                            </button>
                            <div class="comm-post-dropdown" id="dropdown-${post.id}">
                                <button class="comm-dropdown-item" onclick="prepareEditPost('${post.id}')">
                                    <i class="fas fa-edit"></i> Chỉnh sửa
                                </button>
                                <button class="comm-dropdown-item delete" onclick="deletePost('${post.id}')">
                                    <i class="fas fa-trash-alt"></i> Xóa bài viết
                                </button>
                            </div>
                        </div>
                        ` : '<button class="comm-post-options"><i class="fas fa-ellipsis-h"></i></button>'}
                    </div>
                    <div class="comm-post-content" id="post-content-${post.id}">${escapeHtml(post.content)}</div>
                    ${post.media_url ? `<img src="${post.media_url}" class="comm-post-image">` : ''}
                    <div class="comm-post-footer">
                        <button class="comm-btn-interact" onclick="likePost('${post.id}')"><i class="${isLiked ? 'fas' : 'far'} fa-heart" style="${isLiked ? 'color:#ff4d4d' : ''}"></i> <span id="like-count-${post.id}">${post.likes_count || 0} Thích</span></button>
                        <button class="comm-btn-interact" onclick="showPostComments('${post.id}', '${user.id}')"><i class="far fa-comment"></i> ${post.comments_count || 0} Bình luận</button>
                        <button class="comm-btn-interact" onclick="sharePost('${post.id}')"><i class="fas fa-share"></i> <span id="share-count-${post.id}">${post.shares_count || 0} Chia sẻ</span></button>
                    </div>
                </div>
            `;
        }).join("");

    } catch(e) {
        console.error("Lỗi tải post:", e);
        container.innerHTML = `<p class="text-center text-danger" style="padding: 20px;">Lỗi tải dữ liệu. Vui lòng thử lại sau.</p>`;
    }
}

// 5. SUBMIT POST
async function submitPost() {
    const input = document.getElementById("commPostContent");
    const content = input.value.trim();
    if (!content) return;
    
    if (!currentUser) {
        showNotification("Vui lòng đăng nhập để đăng bài", "warning");
        openAuthModal();
        return;
    }
    
    try {
        const btn = document.querySelector(".comm-btn-post");
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const { error } = await supabase
            .from('community_posts')
            .insert({
                user_id: currentUser.id,
                content: content
            });

        if (error) throw error;

        showNotification("Đã đăng bài thành công!", "success");
        input.value = "";
        
        // Refresh feed
        await fetchPosts();

    } catch(e) {
        console.error("Lỗi đăng bài:", e);
        showNotification("Có lỗi xảy ra, thử lại sau!", "error");
    } finally {
        const btn = document.querySelector(".comm-btn-post");
        if(btn) {
            btn.innerHTML = 'Đăng bài';
            btn.disabled = false;
        }
    }
}

// Hàm format thời gian giống MXH
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " năm trước";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " tháng trước";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " ngày trước";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " giờ trước";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " phút trước";
    return Math.floor(seconds) + " giây trước";
}

// ==========================================
// TRẠNG THÁI TRUY CẬP (PRESENCE & LAST SEEN)
// ==========================================

function initPresence() {
    if (!currentUser) return;

    communityPresenceChannel = supabase.channel('community_presence', {
        config: {
            presence: {
                key: currentUser.id,
            },
        },
    });

    communityPresenceChannel
        .on('presence', { event: 'sync' }, () => {
            const newState = communityPresenceChannel.presenceState();
            userPresenceMap.clear();
            
            // Duyệt qua tất cả các key (user_id) đang hiện diện
            for (const id in newState) {
                userPresenceMap.set(id, { online: true });
            }
            
            // Cập nhật UI nếu đang ở trang cá nhân hoặc chat
            refreshPresenceUI();
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            userPresenceMap.set(key, { online: true });
            refreshPresenceUI();
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            userPresenceMap.set(key, { online: false, last_seen: new Date().toISOString() });
            refreshPresenceUI();
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await communityPresenceChannel.track({
                    online_at: new Date().toISOString(),
                    user_id: currentUser.id,
                    username: currentUser.username
                });
            }
        });
}

// Cập nhật database last_seen mỗi khi hoạt động
function startHeartbeat() {
    if (!currentUser) return;
    
    // Cập nhật ngay khi vào
    updateLastSeen();
    
    // Chạy định kỳ mỗi 2 phút
    setInterval(updateLastSeen, 2 * 60 * 1000);
}

async function updateLastSeen() {
    if (!currentUser) return;
    try {
        await supabase
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', currentUser.id);
    } catch (e) {
        console.error("Heartbeat error:", e);
    }
}

function refreshPresenceUI() {
    // 1. Cập nhật trong danh sách chat (CineChat)
    const chatItems = document.querySelectorAll('.comm-chat-item');
    chatItems.forEach(item => {
        const userId = item.getAttribute('data-user-id');
        if (userId) {
            const indicator = item.querySelector('.comm-online-indicator');
            const statusText = item.querySelector('.comm-chat-item-status'); // Assuming this element exists
            const isOnline = userPresenceMap.get(userId)?.online;
            
            if (indicator) {
                indicator.style.background = isOnline ? '#4caf50' : '#888';
            }
            if (statusText) {
                if (isOnline) {
                    statusText.textContent = 'Đang hoạt động';
                    statusText.style.color = '#4caf50';
                } else {
                    // If offline, try to fetch last_seen from DB for more accurate info
                    fetchUserLastSeen(userId, statusText);
                }
            }
        }
    });

    // 2. Cập nhật trong hội thoại đang mở
    if (currentChatTarget) {
        const headerStatus = document.querySelector('.comm-chat-box-status');
        if (headerStatus) {
            const isOnline = userPresenceMap.get(currentChatTarget.id)?.online;
            if (isOnline) {
                headerStatus.innerHTML = '<span style="color: #4caf50;"><i class="fas fa-circle" style="font-size: 8px;"></i> Đang hoạt động</span>';
            } else {
                // Nếu offline, hiển thị thời gian cuối cùng từ db (nếu đã có) hoặc mặc định
                fetchUserLastSeen(currentChatTarget.id, headerStatus);
            }
        }
    }
}

async function fetchUserLastSeen(userId, element) {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('last_seen')
            .eq('id', userId)
            .single();
        
        if (data && data.last_seen) {
            element.innerHTML = `Truy cập ${formatTimeAgo(new Date(data.last_seen))}`;
            element.style.color = 'var(--text-muted)';
        } else {
            element.innerHTML = 'Ngoại tuyến';
            element.style.color = 'var(--text-muted)';
        }
    } catch (e) {
        element.innerHTML = 'Ngoại tuyến';
        element.style.color = 'var(--text-muted)';
    }
}

// Encode HTML tránh XSS
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return "";
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// function likePost(postId) {
//    showNotification("Tính năng Like đang được cập nhật", "info");
// }
async function sharePost(postId) {
    // Copy link hoặc gì đó
    const shareUrl = window.location.origin + window.location.pathname + "#/community/post/" + postId;
    navigator.clipboard.writeText(shareUrl);
    showNotification("Đã sao chép liên kết bài viết!", "success");
    
    // Tăng lượt chia sẻ trong DB (Sử dụng RPC đã tối ưu)
    try {
        await supabase.rpc('increment_shares', { post_id: postId });
        // UI sẽ tự cập nhật nhờ Realtime lắng nghe UPDATE trên community_posts
    } catch (e) {
        console.error("Lỗi cập nhật lượt chia sẻ:", e);
    }
}
function viewUserProfile(userId) {
    if (!userId) return;
    switchCommView('profile');
    renderUserProfile(userId);
}

// ===========================================
// 5. TƯƠNG TÁC PROFILE (Avatar & Cover)
// ===========================================

let currentProfileCommentTarget = { type: '', userId: '' };

async function interactProfile(targetType, actionType) {
    if (!currentUser) {
        showNotification("Vui lòng đăng nhập để tương tác", "warning");
        openAuthModal();
        return;
    }

    const targetUserId = document.getElementById("commProfileView").dataset.userId;
    if (!targetUserId) return;

    if (actionType === 'like') {
        const prefix = targetType === 'avatar' ? 'commAvatar' : 'commCover';
        const likesCountEl = document.getElementById(`${prefix}Likes`);
        const icon = likesCountEl.parentElement.querySelector('i');
        const isCurrentlyLiked = icon.classList.contains('fas');
        
        // --- OPTIMISTIC UI: Cập nhật ngay lập tức ---
        const currentCount = parseInt(likesCountEl.textContent) || 0;
        const nextCount = isCurrentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
        
        likesCountEl.textContent = nextCount;
        icon.className = isCurrentlyLiked ? 'far fa-heart' : 'fas fa-heart';
        icon.style.color = isCurrentlyLiked ? '' : '#ff4d4d';
        // ------------------------------------------

        try {
            const { data: existing } = await supabase
                .from('community_profile_interactions')
                .select('id')
                .eq('user_id', currentUser.id)
                .eq('target_user_id', targetUserId)
                .eq('target_type', targetType)
                .eq('action_type', 'like')
                .maybeSingle();

            if (existing) {
                await supabase.from('community_profile_interactions').delete().eq('id', existing.id);
            } else {
                await supabase.from('community_profile_interactions').insert({
                    user_id: currentUser.id,
                    target_user_id: targetUserId,
                    target_type: targetType,
                    action_type: 'like'
                });
            }
            // Không cần gọi fetchProfileInteractions(targetUserId) nữa vì Realtime hoặc UI đã khớp
        } catch (e) {
            console.error("Lỗi interact profile:", e);
            // Rollback nếu lỗi thực sự (hiếm khi xảy ra)
            fetchProfileInteractions(targetUserId);
        }
    }
}

async function fetchProfileInteractions(userId) {
    try {
        const types = ['avatar', 'cover'];
        for (const type of types) {
            // Lấy số Like
            const { count: likes } = await supabase
                .from('community_profile_interactions')
                .select('*', { count: 'exact', head: true })
                .eq('target_user_id', userId)
                .eq('target_type', type)
                .eq('action_type', 'like');

            // Lấy số Comment
            const { count: comments } = await supabase
                .from('community_profile_interactions')
                .select('*', { count: 'exact', head: true })
                .eq('target_user_id', userId)
                .eq('target_type', type)
                .eq('action_type', 'comment');

            // Kiểm tra currentUser đã like chưa
            let isLiked = false;
            if (currentUser) {
                const { data: liked } = await supabase
                    .from('community_profile_interactions')
                    .select('id')
                    .eq('user_id', currentUser.id)
                    .eq('target_user_id', userId)
                    .eq('target_type', type)
                    .eq('action_type', 'like')
                    .maybeSingle();
                isLiked = !!liked;
            }

            const prefix = type === 'avatar' ? 'commAvatar' : 'commCover';
            const likesCountEl = document.getElementById(`${prefix}Likes`);
            const commentsCountEl = document.getElementById(`${prefix}Comments`);
            
            if (likesCountEl) {
                likesCountEl.textContent = `${likes || 0} Thích`;
                // Cập nhật icon tim của nút cha
                const icon = likesCountEl.parentElement.querySelector('i');
                if (icon) {
                    icon.className = isLiked ? 'fas fa-heart' : 'far fa-heart';
                    icon.style.color = isLiked ? '#ff4d4d' : '';
                }
            }
            if (commentsCountEl) commentsCountEl.textContent = `${comments || 0} Bình luận`;
        }
    } catch (e) {
        console.error("Lỗi fetch interactions:", e);
    }
}

function showProfileComments(type) {
    const targetUserId = document.getElementById("commProfileView").dataset.userId;
    currentProfileCommentTarget = { type, userId: targetUserId };
    
    document.getElementById("profileCommentsTitle").textContent = `Bình luận ${type === 'avatar' ? 'ảnh đại diện' : 'ảnh bìa'}`;
    document.getElementById("profileCommentsModal").style.display = "flex";
    
    loadProfileComments();
}

function closeProfileComments() {
    document.getElementById("profileCommentsModal").style.display = "none";
}

async function loadProfileComments() {
    const list = document.getElementById("profileCommentsList");
    list.innerHTML = `<div class="loading-spinner"></div>`;
    
    try {
        const { data, error } = await supabase
            .from('community_profile_interactions')
            .select(`
                id, content, created_at,
                profiles:user_id ( display_name, avatar )
            `)
            .eq('target_user_id', currentProfileCommentTarget.userId)
            .eq('target_type', currentProfileCommentTarget.type)
            .eq('action_type', 'comment')
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = `<p class="text-center text-muted" style="padding: 20px;">Chưa có bình luận nào.</p>`;
            return;
        }

        list.innerHTML = data.map(c => {
            const u = c.profiles || {};
            const name = u.display_name || u.username || "User";
            const avatar = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
            const isMe = currentUser && (currentUser.id === c.user_id || currentUser.role === 'admin' || currentUser.id === currentProfileCommentTarget.userId);
            
            return `
                <div class="comm-comment-item" id="comment-${c.id}">
                    <img src="${avatar}">
                    <div class="comm-comment-item-content">
                        <div class="comm-comment-user-name">${name}</div>
                        <div class="comm-comment-text">${escapeHtml(c.content)}</div>
                        <div class="comm-comment-time">
                            ${formatTimeAgo(new Date(c.created_at))}
                            ${isMe ? `<button class="comm-btn-delete-comment" onclick="deleteComment('${c.id}', 'profile')"><i class="fas fa-trash-alt"></i> Xóa</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join("");
        
        list.scrollTop = list.scrollHeight;
    } catch (e) {
        console.error("Lỗi load comments:", e);
    }
}

async function submitProfileComment() {
    if (!currentUser) return;
    const input = document.getElementById("profileCommentInput");
    const content = input.value.trim();
    if (!content) return;

    try {
        const { error } = await supabase
            .from('community_profile_interactions')
            .insert({
                user_id: currentUser.id,
                target_user_id: currentProfileCommentTarget.userId,
                target_type: currentProfileCommentTarget.type,
                action_type: 'comment',
                content: content
            });

        if (error) throw error;
        input.value = "";
        loadProfileComments();
        fetchProfileInteractions(currentProfileCommentTarget.userId);
    } catch (e) {
        console.error("Lỗi submit comment:", e);
    }
}

// ===========================================
// 6. TƯƠNG TÁC BÀI VIẾT (Like & Comment)
// ===========================================

let currentPostCommentId = null;

async function likePost(postId) {
    if (!currentUser) {
        showNotification("Vui lòng đăng nhập để thích bài viết", "warning");
        openAuthModal();
        return;
    }

    const postEl = document.getElementById(`post-${postId}`);
    const likesBtn = postEl ? postEl.querySelector('.comm-btn-interact:first-child') : null;
    const icon = likesBtn ? likesBtn.querySelector('i') : null;
    
    if (!likesBtn || !icon) return;

    const isCurrentlyLiked = icon.classList.contains('fas');
    
    // --- OPTIMISTIC UI: Cập nhật ngay ---
    const currentText = likesBtn.textContent.trim();
    const currentCount = parseInt(currentText) || 0;
    const nextCount = isCurrentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
    
    likesBtn.innerHTML = `<i class="${isCurrentlyLiked ? 'far' : 'fas'} fa-heart" ${!isCurrentlyLiked ? 'style="color:#ff4d4d"' : ''}></i> <span id="like-count-${postId}">${nextCount} Thích</span>`;
    // ------------------------------------

    try {
        const { data: existing } = await supabase
            .from('community_post_likes')
            .select('*')
            .eq('post_id', postId)
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (existing) {
            await supabase.from('community_post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
        } else {
            await supabase.from('community_post_likes').insert({ post_id: postId, user_id: currentUser.id });
        }
    } catch (e) {
        console.error("Lỗi like post:", e);
        // Sync lại UI nếu lỗi
        setTimeout(() => fetchPosts(), 500);
    }
}



function showPostComments(postId, postOwnerId = null) {
    currentPostCommentId = postId;
    currentPostOwnerId = postOwnerId;
    currentProfileCommentTarget = { type: 'post', userId: '' }; // reset profile target
    document.getElementById("profileCommentsTitle").textContent = "Bình luận bài viết";
    document.getElementById("profileCommentsModal").style.display = "flex";
    
    loadPostComments();
}

async function loadPostComments() {
    const list = document.getElementById("profileCommentsList");
    list.innerHTML = `<div class="loading-spinner"></div>`;
    
    try {
        const { data, error } = await supabase
            .from('community_comments')
            .select(`
                id, content, created_at, user_id,
                profiles:user_id ( display_name, avatar )
            `)
            .eq('post_id', currentPostCommentId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = `<p class="text-center text-muted" style="padding: 20px;">Chưa có bình luận nào cho bài viết này.</p>`;
            return;
        }

        list.innerHTML = data.map(c => {
            const u = c.profiles || {};
            const name = u.display_name || "User";
            const avatar = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
            const isMe = currentUser && (currentUser.id === c.user_id || currentUser.role === 'admin' || currentUser.id === currentPostOwnerId);

            return `
                <div class="comm-comment-item" id="comment-${c.id}">
                    <img src="${avatar}">
                    <div class="comm-comment-item-content">
                        <div class="comm-comment-user-name">${name}</div>
                        <div class="comm-comment-text">${escapeHtml(c.content)}</div>
                        <div class="comm-comment-time">
                            ${formatTimeAgo(new Date(c.created_at))}
                            ${isMe ? `<button class="comm-btn-delete-comment" onclick="deleteComment('${c.id}', 'post')"><i class="fas fa-trash-alt"></i> Xóa</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join("");
        list.scrollTop = list.scrollHeight;
    } catch (e) {
        console.error("Lỗi load post comments:", e);
    }
}

// Cập nhật submitProfileComment để hỗ trợ cả Post
async function submitProfileComment() {
    if (!currentUser) return;
    const input = document.getElementById("profileCommentInput");
    const content = input.value.trim();
    if (!content) return;

    try {
        if (currentProfileCommentTarget.type === 'post') {
            const { error } = await supabase
                .from('community_comments')
                .insert({
                    user_id: currentUser.id,
                    post_id: currentPostCommentId,
                    content: content
                });
            if (error) throw error;
            
            // LƯU Ý: Không cần update count thủ công nữa vì đã có SQL Trigger tự động đếm
            loadPostComments();
        } else {
            // Logic cho Avatar/Cover cũ
            const { error } = await supabase
                .from('community_profile_interactions')
                .insert({
                    user_id: currentUser.id,
                    target_user_id: currentProfileCommentTarget.userId,
                    target_type: currentProfileCommentTarget.type,
                    action_type: 'comment',
                    content: content
                });

            if (error) throw error;
            loadProfileComments();
            fetchProfileInteractions(currentProfileCommentTarget.userId);
        }
        input.value = "";
    } catch (e) {
        console.error("Lỗi submit comment:", e);
    }
}

async function deleteComment(commentId, type) {
    if (!currentUser) return;

    const result = await Swal.fire({
        title: 'Xóa bình luận?',
        text: "Bạn chắc chắn muốn xóa bình luận này chứ?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--accent-primary)',
        cancelButtonColor: 'var(--bg-dark)',
        confirmButtonText: 'Xóa ngay',
        cancelButtonText: 'Hủy',
        background: 'var(--bg-secondary)',
        color: '#fff'
    });

    if (result.isConfirmed) {
        try {
            const table = type === 'post' ? 'community_comments' : 'community_profile_interactions';
            const { error } = await supabase
                .from(table)
                .delete()
                .eq('id', commentId);

            if (error) throw error;

            showNotification("Đã xóa bình luận thành công!", "success");
            
            // Xóa element khỏi UI (Optimistic)
            const el = document.getElementById(`comment-${commentId}`);
            if (el) el.remove();
            
            // Nếu là bài viết, Realtime sẽ tự update count nhờ Trigger (đã implement ở v4.0)
            // Nếu là profile, cập nhật count UI
            if (type === 'profile') {
                fetchProfileInteractions(currentProfileCommentTarget.userId);
            }

        } catch (e) {
            console.error("Lỗi xóa bình luận:", e);
            showNotification("Không thể xóa bình luận lúc này", "error");
        }
    }
}

// REALTIME SUBSCRIPTIONS
function subscribeToInteractions() {
    // 1. Theo dõi tương tác profile (Avatar/Cover)
    supabase.channel('profile-interactions')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'community_profile_interactions' }, payload => {
            const targetUserId = document.getElementById("commProfileView").dataset.userId;
            if (targetUserId && (payload.new.target_user_id === targetUserId || payload.old.target_user_id === targetUserId)) {
                fetchProfileInteractions(targetUserId);
                if (document.getElementById("profileCommentsModal").style.display === "flex") {
                     if (currentProfileCommentTarget.type !== 'post') loadProfileComments();
                }
            }
        })
        .subscribe();

    // 2. Theo dõi Like/Comment/Share bài viết (Post Stats)
    supabase.channel('post-changes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_posts' }, async payload => {
            console.log("🔔 Realtime Post Update:", payload.new);
            if (payload.new) {
                const postEl = document.getElementById(`post-${payload.new.id}`);
                if (postEl) {
                    const likesBtn = postEl.querySelector('.comm-btn-interact:nth-child(1)');
                    const commentsBtn = postEl.querySelector('.comm-btn-interact:nth-child(2)');
                    const sharesBtn = postEl.querySelector('.comm-btn-interact:nth-child(3)');
                    
                    if (likesBtn) {
                        const icon = likesBtn.querySelector('i');
                        const isLikedByMe = icon.classList.contains('fas');
                        likesBtn.innerHTML = `<i class="${isLikedByMe ? 'fas' : 'far'} fa-heart" ${isLikedByMe ? 'style="color:#ff4d4d"' : ''}></i> <span id="like-count-${payload.new.id}">${payload.new.likes_count || 0} Thích</span>`;
                    }
                    if (commentsBtn) {
                        commentsBtn.innerHTML = `<i class="far fa-comment"></i> ${payload.new.comments_count || 0} Bình luận`;
                    }
                    if (sharesBtn) {
                        sharesBtn.innerHTML = `<i class="fas fa-share"></i> <span id="share-count-${payload.new.id}">${payload.new.shares_count || 0} Chia sẻ</span>`;
                    }
                }
            }
        })
        .subscribe();

    // 3. Theo dõi Bình luận bài viết (Post Comments List)
    supabase.channel('post-comments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'community_comments' }, payload => {
            if (document.getElementById("profileCommentsModal").style.display === "flex" && 
                currentProfileCommentTarget.type === 'post' && 
                (payload.new.post_id === currentPostCommentId)) {
                loadPostComments();
            }
        })
        .subscribe();
}

// Khởi tạo Realtime
// Moved to initCommunity()
// subscribeToInteractions();


async function fetchSuggestedFriends() {
    const list = document.getElementById("commSuggestedFriends");
    if(!list) return;
    
    if (!currentUser) {
        list.innerHTML = `<p class="text-muted" style="font-size: 0.85rem; text-align: center;">Đăng nhập để xem gợi ý.</p>`;
        return;
    }

    list.innerHTML = `<div class="loading-spinner"></div>`;

    try {
        // 1. Lọc bỏ chính mình và những người đã có quan hệ bạn bè
        const { data: relations } = await supabase
            .from('community_friends')
            .select('user_id, friend_id')
            .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`);
            
        let excludedIds = [currentUser.id];
        let myFriends = [];
        if (relations) {
            relations.forEach(r => {
                const fId = r.user_id === currentUser.id ? r.friend_id : r.user_id;
                excludedIds.push(fId);
                myFriends.push(fId);
            });
        }

        // 2. Lấy danh sách phim yêu thích của tôi
        const { data: myFavs } = await supabase
            .from('user_favorites')
            .select('movie_id')
            .eq('user_id', currentUser.id);
        const myMovieIds = myFavs ? myFavs.map(f => f.movie_id) : [];

        // 3. Tìm các ứng viên tiềm năng (Lấy nhiều hơn để lọc)
        let { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar, role')
            .neq('id', currentUser.id)
            .limit(50); // Lấy 50 người để lọc cho chắc chắn

        if (pError) throw pError;

        if (!profiles || profiles.length === 0) {
            list.innerHTML = `<p class="text-muted" style="font-size: 0.85rem; text-align: center;">Chưa có gợi ý mới.</p>`;
            return;
        }

        // 4. LỌC THỦ CÔNG: Loại bỏ những người đã có trong excludedIds
        const filteredProfiles = profiles.filter(p => !excludedIds.includes(p.id));

        if (filteredProfiles.length === 0) {
            list.innerHTML = `<p class="text-muted" style="font-size: 0.85rem; text-align: center;">Chưa có gợi ý mới.</p>`;
            return;
        }

        // 5. Lấy dữ liệu gộp để tính toán điểm số cho danh sách đã lọc
        const topCandidates = filteredProfiles.slice(0, 15); // Chỉ tính toán cho 15 người tiềm năng nhất
        const profileIds = topCandidates.map(p => p.id);
        
        let sharedFavsMap = {};
        if (myMovieIds.length > 0) {
            const { data: commonFavs } = await supabase
                .from('user_favorites')
                .select('user_id, movie_id')
                .in('user_id', profileIds)
                .in('movie_id', myMovieIds);
            
            if (commonFavs) {
                commonFavs.forEach(f => {
                    sharedFavsMap[f.user_id] = (sharedFavsMap[f.user_id] || 0) + 1;
                });
            }
        }

        let mutualFriendsMap = {};
        if (myFriends.length > 0) {
            const { data: mutuals } = await supabase
                .from('community_friends')
                .select('user_id, friend_id')
                .in('user_id', profileIds)
                .in('friend_id', myFriends)
                .eq('status', 'accepted');
            
            if (mutuals) {
                mutuals.forEach(m => {
                    mutualFriendsMap[m.user_id] = (mutualFriendsMap[m.user_id] || 0) + 1;
                });
            }
        }

        // 6. Tổng hợp dữ liệu hiển thị
        const suggestedUsers = topCandidates.map(user => {
            let score = 0;
            let reason = "Thành viên mới";
            
            const sharedCount = sharedFavsMap[user.id] || 0;
            if (sharedCount > 0) {
                score += sharedCount * 10;
                reason = `Chung ${sharedCount} phim yêu thích`;
            }
            
            const mutualCount = mutualFriendsMap[user.id] || 0;
            if (mutualCount > 0) {
                score += mutualCount * 15;
                reason = reason === "Thành viên mới" ? `Có ${mutualCount} bạn chung` : `${reason} & ${mutualCount} bạn chung`;
            }
            
            return { ...user, score, reason };
        });

        // Sắp xếp và lấy 5 người tốt nhất
        suggestedUsers.sort((a, b) => b.score - a.score || Math.random() - 0.5);
        const finalTop5 = suggestedUsers.slice(0, 5);

        list.innerHTML = finalTop5.map(user => {
            const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || "User")}&background=random`;
            return `
                <div class="comm-user-item">
                    <div class="comm-user-info" onclick="viewUserProfile('${user.id}')" style="cursor: pointer;">
                        <img src="${avatar}" alt="${user.display_name}">
                        <div class="comm-user-details">
                            <span class="name">${user.display_name} ${user.role==='admin' ? '<i class="fas fa-check-circle" style="color:#4db8ff; font-size:0.8em;" title="Admin"></i>' : ''}</span>
                            <span class="role" style="color: var(--accent-primary); font-weight: 500;">${user.reason}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px; flex-direction: column;">
                        <button class="comm-btn-follow" id="follow-btn-${user.id}" onclick="toggleFollow('${user.id}')">Theo dõi</button>
                        <button class="comm-btn-follow" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-color);" id="add-friend-btn-${user.id}" onclick="sendFriendRequest('${user.id}')">Kết bạn</button>
                    </div>
                </div>
            `;
        }).join("");

    } catch (e) {
        console.error("Lỗi lấy danh sách gợi ý:", e);
        list.innerHTML = `<p class="text-danger" style="font-size: 0.85rem; text-align: center; padding: 10px;">Lỗi tải dữ liệu.</p>`;
    }
}

function renderMyProfile() {
    if (!currentUser) {
        showNotification("Bạn cần đăng nhập để xem hồ sơ", "warning");
        switchCommView('feed');
        return;
    }
    renderUserProfile(currentUser.id);
}

async function renderUserProfile(userId) {
    try {
        const isMe = currentUser && currentUser.id === userId;
        const view = document.getElementById("commProfileView");
        if (view) view.dataset.userId = userId;
        
        // 1. Lấy thông tin profile từ bảng profiles
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
            
        if (error) throw error;

        // 2. Cập nhật giao diện cơ bản
        document.getElementById("commProfileName").textContent = profile.display_name || "User";
        document.getElementById("commProfileBio").textContent = profile.bio || "Người yêu điện ảnh";
        
        const avatar = profile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.display_name || "U")}&background=random`;
        document.getElementById("commProfileAvatar").src = avatar;
        
        if (profile.cover_url) {
            document.getElementById("commProfileCover").style.backgroundImage = `url('${profile.cover_url}')`;
        } else {
            document.getElementById("commProfileCover").style.backgroundImage = `url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80')`;
        }

        // 3. Quản lý nút hành động
        const btnEdit = document.getElementById("btnEditProfile");
        const btnMsg = document.getElementById("btnMessageUser");
        const btnFollow = document.getElementById("btnFollowUser");
        
        if (isMe) {
            if(btnEdit) btnEdit.style.display = "block";
            if(btnMsg) btnMsg.style.display = "none";
            if(btnFollow) btnFollow.style.display = "none";
        } else {
            if(btnEdit) btnEdit.style.display = "none";
            if(btnMsg) {
                btnMsg.style.display = "block";
                btnMsg.onclick = () => openChat(userId, profile.display_name, avatar);
            }
            if(btnFollow) {
                btnFollow.style.display = "block";
                checkFollowStatus(userId);
                btnFollow.onclick = () => toggleFollow(userId);
            }
        }

        // 4. Lấy thống kê và bài viết
        fetchProfileStats(userId);
        fetchMyPosts(userId);
        fetchProfileInteractions(userId);

    } catch (e) {
        console.error("Lỗi render profile:", e);
        showNotification("Không thể tải thông tin hồ sơ", "error");
    }
}

async function fetchProfileStats(userId) {
    try {
        // Đếm followers
        const { count: followers } = await supabase
            .from('community_follows')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', userId);
            
        // Đếm following
        const { count: following } = await supabase
            .from('community_follows')
            .select('*', { count: 'exact', head: true })
            .eq('follower_id', userId);

        document.getElementById("commStatFollowers").textContent = followers || 0;
        document.getElementById("commStatFollowing").textContent = following || 0;
    } catch (e) {
        console.error("Lỗi lấy thống kê:", e);
    }
}

// MODAL EDIT PROFILE
function openEditProfileModal() {
    const modal = document.getElementById("editProfileModal");
    if (!modal) return;
    
    // Nạp dữ liệu hiện tại vào form
    const bio = document.getElementById("commProfileBio").textContent;
    const avatarUrl = document.getElementById("commProfileAvatar").src;
    const coverFull = document.getElementById("commProfileCover").style.backgroundImage;
    const coverUrl = coverFull.replace('url("', '').replace('")', '');

    document.getElementById("editProfileBio").value = bio === "Người yêu điện ảnh" ? "" : bio;
    document.getElementById("editProfileAvatar").value = avatarUrl.includes('ui-avatars') ? "" : avatarUrl;
    document.getElementById("editProfileCover").value = coverUrl.includes('unsplash') ? "" : coverUrl;
    
    modal.style.display = "flex";
}

function closeEditProfileModal() {
    const modal = document.getElementById("editProfileModal");
    if (modal) modal.style.display = "none";
}

async function saveProfileChanges() {
    if (!currentUser) return;
    
    const bio = document.getElementById("editProfileBio").value;
    const avatarUrl = document.getElementById("editProfileAvatar").value;
    const coverUrl = document.getElementById("editProfileCover").value;
    
    try {
        const { error } = await supabase
            .from('profiles')
            .update({
                bio: bio,
                avatar: avatarUrl || null,
                cover_url: coverUrl || null
            })
            .eq('id', currentUser.id);
            
        if (error) throw error;
        
        // Cập nhật avatar ở khung post nếu là profile của mình
        const composerAvatar = document.getElementById("commUserAvatar");
        if (composerAvatar && avatarUrl) {
            composerAvatar.src = avatarUrl;
        }
        
        showNotification("Cập nhật hồ sơ thành công!", "success");
        closeEditProfileModal();
        renderMyProfile(); // Refresh
        
    } catch (e) {
        console.error("Lỗi lưu hồ sơ:", e);
        showNotification("Không thể lưu thay đổi", "error");
    }
}

async function checkFollowStatus(targetUserId) {
    if (!currentUser) return;
    const btn = document.getElementById("btnFollowUser");
    if (!btn) return;

    const { data } = await supabase
        .from('community_follows')
        .select('*')
        .eq('follower_id', currentUser.id)
        .eq('following_id', targetUserId)
        .maybeSingle();

    if (data) {
        btn.innerHTML = `<i class="fas fa-user-check"></i> Đang theo dõi`;
        btn.classList.add("following");
    } else {
        btn.innerHTML = `<i class="fas fa-user-plus"></i> Theo dõi`;
        btn.classList.remove("following");
    }
}

async function fetchMyPosts(userId) {
    const container = document.getElementById("profileFeedContainer");
    if (!container) return;
    
    container.innerHTML = `<div class="loading-spinner"></div>`;
    
    try {
        const { data, error } = await supabase
            .from('community_posts')
            .select('id, content, created_at, likes_count, comments_count, shares_count')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        // Lấy danh sách post đã like của user hiện tại
        let userLikes = [];
        if (currentUser) {
            const { data: likes } = await supabase
                .from('community_post_likes')
                .select('post_id')
                .eq('user_id', currentUser.id);
            userLikes = likes.map(l => l.post_id);
        }

        if (!data || data.length === 0) {
            container.innerHTML = `<p class="text-center text-muted" style="padding: 20px;">Bạn chưa có bài viết nào.</p>`;
            return;
        }
        
        document.getElementById("commStatPosts").textContent = data.length;
        
        container.innerHTML = data.map(post => {
            const timeAgo = formatTimeAgo(new Date(post.created_at));
            const isLiked = userLikes.includes(post.id);
            const isMe = currentUser && currentUser.id === userId;

            return `
                <div class="comm-post-card" id="post-${post.id}">
                    <div class="comm-post-header">
                        <div class="comm-post-user">
                            <img src="${document.getElementById('commProfileAvatar').src}">
                            <div class="comm-post-meta">
                                <span class="comm-post-name">${document.getElementById('commProfileName').textContent}</span>
                                <span class="comm-post-time">${timeAgo}</span>
                            </div>
                        </div>

                        ${isMe ? `
                        <div class="comm-post-options-container">
                            <button class="comm-post-options" onclick="togglePostOptions('${post.id}')">
                                <i class="fas fa-ellipsis-h"></i>
                            </button>
                            <div class="comm-post-dropdown" id="dropdown-${post.id}">
                                <button class="comm-dropdown-item" onclick="prepareEditPost('${post.id}')">
                                    <i class="fas fa-edit"></i> Chỉnh sửa
                                </button>
                                <button class="comm-dropdown-item delete" onclick="deletePost('${post.id}')">
                                    <i class="fas fa-trash-alt"></i> Xóa bài viết
                                </button>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    <div class="comm-post-content" id="post-content-${post.id}">${escapeHtml(post.content)}</div>
                    <div class="comm-post-footer">
                        <button class="comm-btn-interact" onclick="likePost('${post.id}')"><i class="${isLiked ? 'fas' : 'far'} fa-heart" style="${isLiked ? 'color:#ff4d4d' : ''}"></i> <span id="like-count-${post.id}">${post.likes_count || 0} Thích</span></button>
                        <button class="comm-btn-interact" onclick="showPostComments('${post.id}', '${userId}')"><i class="far fa-comment"></i> ${post.comments_count || 0} Bình luận</button>
                        <button class="comm-btn-interact" onclick="sharePost('${post.id}')"><i class="fas fa-share"></i> <span id="share-count-${post.id}">${post.shares_count || 0} Chia sẻ</span></button>
                    </div>
                </div>
            `;
        }).join("");
    } catch(e) {
        console.error("Lỗi lấy bài viết cá nhân", e);
    }
}

// --- QUẢN LÝ BÀI VIẾT (Xóa & Sửa) ---
let editingPostId = null;

function togglePostOptions(postId) {
    const dropdown = document.getElementById(`dropdown-${postId}`);
    const isActive = dropdown.classList.contains('active');
    
    // Đóng tất cả dropdown khác trước
    document.querySelectorAll('.comm-post-dropdown').forEach(d => d.classList.remove('active'));
    
    if (!isActive) {
        dropdown.classList.add('active');
    }
    
    // Đóng khi click ra ngoài
    const closeListener = (e) => {
        if (!dropdown.contains(e.target) && !e.target.closest('.comm-post-options')) {
            dropdown.classList.remove('active');
            document.removeEventListener('click', closeListener);
        }
    };
    document.addEventListener('click', closeListener);
}

async function deletePost(postId) {
    if (!currentUser) return;
    
    const result = await Swal.fire({
        title: 'Xóa bài viết?',
        text: "Hành động này không thể hoàn tác!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--accent-primary)',
        cancelButtonColor: 'var(--bg-dark)',
        confirmButtonText: 'Xóa ngay',
        cancelButtonText: 'Đóng lại',
        background: 'var(--bg-secondary)',
        color: '#fff'
    });

    if (result.isConfirmed) {
        try {
            const { error } = await supabase
                .from('community_posts')
                .delete()
                .eq('id', postId);

            if (error) throw error;

            showNotification("Đã xóa bài viết thành công!", "success");
            
            // Xóa element ngay lập tức (Optimistic UI)
            const el = document.getElementById(`post-${postId}`);
            if (el) el.remove();
            
            // Nếu xóa trong profile, cập nhật lại thống kê
            if (document.getElementById("commProfileView").style.display !== "none") {
                const userId = document.getElementById("commProfileView").dataset.userId;
                fetchProfileStats(userId);
            }

        } catch (e) {
            console.error("Lỗi xóa bài:", e);
            showNotification("Có lỗi xảy ra khi xóa!", "error");
        }
    }
}

function prepareEditPost(postId) {
    const contentEl = document.getElementById(`post-content-${postId}`);
    if (!contentEl) return;
    
    editingPostId = postId;
    document.getElementById("editPostContent").value = contentEl.textContent;
    document.getElementById("editPostModal").style.display = "flex";
    
    // Đóng dropdown
    const dropdown = document.getElementById(`dropdown-${postId}`);
    if (dropdown) dropdown.classList.remove('active');
}

function closeEditPostModal() {
    document.getElementById("editPostModal").style.display = "none";
    editingPostId = null;
}

async function updatePost() {
    if (!editingPostId || !currentUser) return;
    
    const newContent = document.getElementById("editPostContent").value.trim();
    if (!newContent) {
        showNotification("Nội dung không được để trống", "warning");
        return;
    }

    try {
        const { error } = await supabase
            .from('community_posts')
            .update({ content: newContent })
            .eq('id', editingPostId);

        if (error) throw error;

        showNotification("Cập nhật bài viết thành công!", "success");
        
        // Cập nhật UI ngay lập tức
        const contentEl = document.getElementById(`post-content-${editingPostId}`);
        if (contentEl) contentEl.textContent = newContent;
        
        closeEditPostModal();
    } catch (e) {
        console.error("Lỗi sửa bài:", e);
        showNotification("Không thể cập nhật bài viết", "error");
    }
}

// 6. LOGIC KẾT BẠN (Friends & Follows)
async function toggleFollow(targetUserId) {
    if (!currentUser) {
        showNotification("Vui lòng đăng nhập để theo dõi", "warning");
        openAuthModal();
        return;
    }

    try {
        const btn = document.getElementById(`follow-btn-${targetUserId}`);
        let isFollowing = false;

        // Kiểm tra trạng thái hiện tại
        const { data: existingFollow } = await supabase
            .from('community_follows')
            .select('*')
            .eq('follower_id', currentUser.id)
            .eq('following_id', targetUserId)
            .maybeSingle();

        if (existingFollow) {
            // Unfollow
            await supabase
                .from('community_follows')
                .delete()
                .eq('follower_id', currentUser.id)
                .eq('following_id', targetUserId);
            
            if(btn) {
                btn.textContent = "Theo dõi";
                btn.classList.remove("following");
            }
        } else {
            // Follow
            await supabase
                .from('community_follows')
                .insert({
                    follower_id: currentUser.id,
                    following_id: targetUserId
                });
            
            if(btn) {
                btn.textContent = "Đã theo dõi";
                btn.classList.add("following");
            }
        }
    } catch (e) {
        console.error("Lỗi toggle follow:", e);
        showNotification("Có lỗi xảy ra!", "error");
    }
}

// ===========================================
// 7. LOGIC CINECHAT (Realtime 1-1)
// ===========================================

let currentChatUserId = null;
let chatSubscription = null;

// Cập nhật trạng thái "Đã xem" cho các tin nhắn
async function markMessagesAsSeen(senderId) {
    if (!currentUser) return;
    try {
        await supabase
            .from('community_messages')
            .update({ status: 'seen' })
            .eq('sender_id', senderId)
            .eq('receiver_id', currentUser.id)
            .neq('status', 'seen');
    } catch (e) {
        console.error("Error marking messages as seen:", e);
    }
}

// Hàm mở khung chat với 1 người cụ thể
async function openChat(targetUserId, targetUserName, targetAvatar) {
    console.log("🎬 openChat start:", targetUserId, targetUserName);
    
    if (!currentUser) {
        showNotification("Vui lòng đăng nhập để chat", "warning");
        openAuthModal();
        return;
    }

    try {
        // 1. Chuyển View trước
        switchCommView('chat');
        currentChatUserId = targetUserId;
        currentChatTarget = { id: targetUserId, display_name: targetUserName, avatar: targetAvatar }; // Store target user info
        
        // 2. Điều phối hiển thị (Hiện Content Chat, ẩn Welcome)
        const welcomeEl = document.getElementById("commChatWelcome");
        const contentEl = document.getElementById("commChatContent");
        if (welcomeEl) welcomeEl.style.display = "none";
        if (contentEl) contentEl.style.display = "flex";

        // 3. Tìm các phần tử giao diện (Dùng ID mới tránh xung đột)
        const nameEl = document.getElementById("commChatTargetName");
        const avatarEl = document.getElementById("commChatTargetAvatar");
        const inputEl = document.getElementById("commChatInputMessage");
        const messagesContainer = document.getElementById("commChatMessages");
        const chatBoxStatus = document.querySelector('.comm-chat-box-status');

        console.log("🔍 Checking DOM elements (Comm):", { nameEl:!!nameEl, avatarEl:!!avatarEl, container:!!messagesContainer });

        // 3. Cập nhật header ngay lập tức
        if (nameEl) nameEl.textContent = targetUserName;
        if (avatarEl) avatarEl.src = targetAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(targetUserName)}&background=random`;
        if (inputEl) inputEl.disabled = false;
        if (chatBoxStatus) {
            chatBoxStatus.innerHTML = '<span style="color: var(--text-muted);">Đang tải trạng thái...</span>';
            refreshPresenceUI(); // Update status immediately
        }
        
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="loading-spinner"></div></div>';
        } else {
            throw new Error("Không tìm thấy container tin nhắn (commChatMessages)");
        }

        // 4. Lấy tin nhắn (Thử lấy mọi cột, nếu lỗi thì lấy cột cơ bản)
        console.log("💾 Fetching messages...");
        let { data: messages, error } = await supabase
            .from('community_messages')
            .select('id, sender_id, receiver_id, content, status, created_at')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true })
            .limit(50);
            
        // Nếu lỗi (có thể do thiếu cột status/created_at), thử lại bản thu gọn
        if (error) {
            console.warn("⚠️ Lỗi truy vấn đầy đủ, đang thử truy vấn rút gọn:", error.message);
            const retry = await supabase
                .from('community_messages')
                .select('id, sender_id, receiver_id, content')
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUser.id})`)
                .limit(50);
            
            if (retry.error) throw retry.error;
            messages = retry.data;
        }
        
        console.log("✅ Fetched messages:", messages?.length || 0);
        
        // 5. Hiển thị
        renderMessages(messages || []);
        scrollToBottomChat();
        
        // 6. Tác vụ phụ (không block UI)
        markMessagesAsSeen(targetUserId).catch(err => console.error("Lỗi markAsSeen:", err));
        subscribeToChat(targetUserId);

    } catch (e) {
        console.error("❌ CRITICAL ERROR in openChat:", e);
        showNotification("Lỗi mở chat: " + e.message, "error");
        const container = document.getElementById("commChatMessages");
        if (container) {
            container.innerHTML = `<div style="margin: auto; color: #ff4d4d; text-align:center; padding:20px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom:10px;"></i>
                <p>Lỗi tải dữ liệu: ${escapeHtml(e.message)}</p>
                <button onclick="openChat('${targetUserId}', '${targetUserName.replace(/'/g, "\\'")}', '${targetAvatar}')" 
                        style="background:var(--primary-color); color:white; border:none; padding:8px 15px; border-radius:5px; margin-top:10px; cursor:pointer;">
                    Thử lại
                </button>
            </div>`;
        }
    }
}

// Hàm render danh sách tin nhắn
function renderMessages(messages) {
    const container = document.getElementById("commChatMessages");
    if (!container) return;
    
    if(!messages || messages.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin: auto;">Hãy gửi lời chào đầu tiên!</div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => {
        const isMe = msg.sender_id === currentUser.id;
        const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let statusHtml = '';
        if (isMe) {
            if (msg.status === 'seen') {
                statusHtml = `<div class="comm-msg-status seen">Đã xem <i class="fas fa-check-double"></i></div>`;
            } else if (msg.status === 'delivered') {
                statusHtml = `<div class="comm-msg-status delivered">Đã nhận <i class="fas fa-check-double"></i></div>`;
            } else {
                statusHtml = `<div class="comm-msg-status sent">Đã gửi <i class="fas fa-check"></i></div>`;
            }
        }
        
        return `
            <div class="comm-msg ${isMe ? 'sent' : 'received'}" id="msg-${msg.id}">
                <div class="comm-msg-bubble">${escapeHtml(msg.content)}</div>
                <div class="comm-msg-time">
                    ${time}
                    ${statusHtml}
                </div>
            </div>
        `;
    }).join("");
}

function scrollToBottomChat() {
    const container = document.getElementById("commChatMessages");
    if (container) container.scrollTop = container.scrollHeight;
}

// Gửi tin nhắn
async function sendMessage() {
    if(!currentChatUserId || !currentUser) return;
    
    const input = document.getElementById("commChatInputMessage");
    const content = input.value.trim();
    if(!content) return;
    
    // Tạo ID tạm thời riêng cho tin nhắn này
    const tempId = 'temp-msg-' + Date.now();
    
    // Optistic UI Update
    const tempMsg = {
        sender_id: currentUser.id,
        content: content,
        created_at: new Date().toISOString()
    };
    
    const container = document.getElementById("commChatMessages");
    if (!container) return;
    // Xóa placeholder nếu có
    if(container.innerHTML.includes("Hãy gửi lời chào đầu tiên!")) container.innerHTML = "";
    
    const time = new Date(tempMsg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    container.insertAdjacentHTML('beforeend', `
        <div class="comm-msg sent" style="opacity: 0.7;" id="${tempId}">
            <div class="comm-msg-bubble">${escapeHtml(tempMsg.content)}</div>
            <div class="comm-msg-time">${time} <i class="fas fa-clock" style="font-size: 0.75rem; margin-left: 5px; color: var(--text-muted);" title="Đang gửi..."></i></div>
        </div>
    `);
    scrollToBottomChat();
    input.value = "";
    
    // 2. Gửi lên Supabase
    try {
        // Xác định trạng thái ban đầu: Nếu người nhận đang Online thì để 'delivered', ngược lại 'sent'
        const isTargetOnline = userPresenceMap.get(currentChatUserId)?.online;
        const initialStatus = isTargetOnline ? 'delivered' : 'sent';

        const { data, error } = await supabase
            .from('community_messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: currentChatUserId,
                content: content,
                status: initialStatus
            })
            .select()
            .single();
            
        if (error) throw error;
        
        // Cập nhật lại ID thật thay vì tạm thời (Nếu cần)
        const msgEl = document.getElementById(tempId);
        if(msgEl) {
            msgEl.style.opacity = "1";
            msgEl.id = `msg-${data.id}`;
            const timeEl = msgEl.querySelector('.comm-msg-time');
            if (timeEl) {
                const time = new Date(data.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                let statusHtml = data.status === 'delivered' 
                    ? `<div class="comm-msg-status delivered">Đã nhận <i class="fas fa-check-double"></i></div>`
                    : `<div class="comm-msg-status sent">Đã gửi <i class="fas fa-check"></i></div>`;
                
                timeEl.innerHTML = `${time} ${statusHtml}`;
            }
        }
        
    } catch (e) {
        console.error("Lỗi gửi tin nhắn", e);
        showNotification("Gửi tin nhắn thất bại", "error");
        const msgEl = document.getElementById(tempId);
        if(msgEl) msgEl.remove(); // Xóa tin nhắn ảo đi
    }
}

// Gửi tin nhắn tự động (hệ thống) cho lịch sử cuộc gọi
async function sendSystemCallLog(content, targetUserId) {
    if(!currentUser || !targetUserId) return;
    
    // Optistic UI Update
    const container = document.getElementById("commChatMessages");
    if (container && currentChatUserId === targetUserId) {
        if(container.innerHTML.includes("Hãy gửi lời chào đầu tiên!")) container.innerHTML = "";
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        container.insertAdjacentHTML('beforeend', `
            <div class="comm-msg sent" style="opacity: 0.9;">
                <div class="comm-msg-bubble" style="background: rgba(255, 255, 255, 0.1); color: var(--text-color); border: 1px solid var(--border-color); font-style: italic;">${escapeHtml(content)}</div>
                <div class="comm-msg-time">${time}</div>
            </div>
        `);
        scrollToBottomChat();
    }
    
    try {
        const isTargetOnline = userPresenceMap.get(targetUserId)?.online;
        const initialStatus = isTargetOnline ? 'delivered' : 'sent';

        const { error } = await supabase
            .from('community_messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: targetUserId,
                content: content,
                status: initialStatus
            });
            
        if (error) console.error("Lỗi lưu Call log", error);
    } catch (e) {
        console.error("Lỗi gửi log cuộc gọi", e);
    }
}

// Lắng nghe phím Enter khi chat
document.addEventListener("DOMContentLoaded", () => {
    // Sẽ chạy khi JS tải, nhưng id có thể chưa có do load html động.
    // Nên gán bằng Event Delegation trên body là chắc nhất
    document.body.addEventListener('keypress', function(e) {
        if(e.target && e.target.id === 'commChatInputMessage' && e.key === 'Enter') {
            sendMessage();
        }
    });
});

function subscribeToChat(targetUserId) {
    if(chatSubscription) {
        supabase.removeChannel(chatSubscription);
    }
    
    chatSubscription = supabase.channel('custom-message-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_messages' },
        (payload) => {
            const msg = payload.new;
            if (!msg) return;
            
            // Nếu là Update trạng thái tin nhắn của mình
            if (payload.eventType === 'UPDATE' && msg.sender_id === currentUser.id && msg.receiver_id === targetUserId) {
                const domMsg = document.getElementById(`msg-${msg.id}`);
                if (domMsg) {
                    const timeEl = domMsg.querySelector('.comm-msg-time');
                    const timeStr = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    if (timeEl) {
                        let statusHtml = '';
                        if (msg.status === 'seen') {
                            statusHtml = `<div class="comm-msg-status seen">Đã xem <i class="fas fa-check-double"></i></div>`;
                        } else if (msg.status === 'delivered') {
                            statusHtml = `<div class="comm-msg-status delivered">Đã nhận <i class="fas fa-check-double"></i></div>`;
                        } else {
                            statusHtml = `<div class="comm-msg-status sent">Đã gửi <i class="fas fa-check"></i></div>`;
                        }
                        timeEl.innerHTML = `${timeStr} ${statusHtml}`;
                    }
                }
                return;
            }

            // Nếu là Insert tin nhắn mới
            if (payload.eventType === 'INSERT') {
                if ((msg.sender_id === currentUser.id && msg.receiver_id === targetUserId) ||
                    (msg.sender_id === targetUserId && msg.receiver_id === currentUser.id)) {
                    
                    // Nếu mình là người nhận, VÀ ĐANG Ở TRONG TAB CHAT VỚI ĐÚNG NGƯỜI ĐÓ
                    if (msg.receiver_id === currentUser.id && currentCommView === 'chat' && currentChatUserId === targetUserId) {
                        markMessagesAsSeen(targetUserId);
                    }

                    // Tránh render đúp tin nhắn của chính mình
                    if(msg.sender_id !== currentUser.id) {
                        const container = document.getElementById("commChatMessages");
                        if (container) {
                            if(container.innerHTML.includes("Hãy gửi lời chào đầu tiên!")) container.innerHTML = "";
                            const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                            container.insertAdjacentHTML('beforeend', `
                                <div class="comm-msg received" id="msg-${msg.id}">
                                    <div class="comm-msg-bubble">${escapeHtml(msg.content)}</div>
                                    <div class="comm-msg-time">${time}</div>
                                </div>
                            `);
                            scrollToBottomChat();
                        }
                    }
                }
                return;
            }
        }
      )
      .subscribe();
}

async function loadChatList() {
    if(!currentUser) return;
    const container = document.getElementById("commChatList");
    if(!container) return;
    
    container.innerHTML = '<div style="text-align:center; padding: 20px;"><div class="loading-spinner"></div></div>';
    
    // Logic thực tế cần group by tin nhắn mới nhất. 
    // Tạm thời lấy danh sách những người là bạn bè (accepted) làm list chat
    try {
        const { data: friendsData, error } = await supabase
            .from('community_friends')
            .select(`
                friend_id,
                user_id
            `)
            .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
            .eq('status', 'accepted')
            .limit(20);
            
        if(error) throw error;
        
        if(!friendsData || friendsData.length===0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Bạn chưa kết bạn với ai để bắt đầu tính năng chat. Hãy gửi lời mời kết bạn!</div>';
            return;
        }

        const friendIds = friendsData.map(f => f.user_id === currentUser.id ? f.friend_id : f.user_id);
        
        const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar')
            .in('id', friendIds);
            
        if (pError) throw pError;
        
        container.innerHTML = profiles.map(user => {
            const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name)}&background=random`;
            const friendId = user.id;
            const name = user.display_name;
            const lastMsg = "Click để chat..."; // Placeholder, actual last message would require more complex query
            
            return `
                <div class="comm-chat-item ${currentChatTarget && currentChatTarget.id === friendId ? 'active' : ''}" data-user-id="${friendId}" onclick="openChat('${user.id}', '${user.display_name.replace(/'/g, "\\'")}', '${avatar}')">
                    <div class="comm-chat-item-avatar">
                        <img src="${avatar}">
                        <div class="comm-online-indicator"></div>
                    </div>
                    <div class="comm-chat-item-info">
                        <div class="comm-chat-item-name">${name}</div>
                        <div class="comm-chat-item-msg">${lastMsg}</div>
                        <div class="comm-chat-item-status" style="font-size: 0.75rem; color: var(--text-muted);"></div>
                    </div>
                </div>
            `;
        }).join("");
        
        refreshPresenceUI(); // Update presence indicators after rendering list
        
    } catch(e) {
        console.error("Lỗi lấy danh sách chat", e);
        container.innerHTML = '<div style="padding: 20px; color: red;">Lỗi tải dữ liệu.</div>';
    }
}

// Khi nhấn vào tab 'friends', gọi hàm này thay vì feed
async function renderFriendsView() {
    const container = document.getElementById("commFeedContainer");
    if (!container) return;
    
    // Đổi tiêu đề tab thành Bạn bè
    const tabs = document.querySelector(".comm-feed-tabs");
    if(tabs) {
        tabs.innerHTML = `<button class="comm-tab active">Danh sách bạn bè</button>`;
    }
    
    // Ẩn bảng soạn thảo đăng bài
    const composer = document.querySelector(".comm-composer");
    if (composer) composer.style.display = "none";

    if (!currentUser) {
        container.innerHTML = `<p class="text-center text-muted" style="padding: 20px;">Bạn cần đăng nhập để xem danh sách bạn bè.</p>`;
        return;
    }

    container.innerHTML = `<div class="loading-spinner" style="margin: 40px auto;"></div>`;

    try {
        // Lấy danh sách bạn bè (status='accepted')
        const { data: friendsData, error } = await supabase
            .from('community_friends')
            .select(`
                friend_id,
                user_id,
                status
            `)
            .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
            .eq('status', 'accepted');

        if (error) throw error;

        if (!friendsData || friendsData.length === 0) {
            container.innerHTML = `<p class="text-center text-muted" style="padding: 20px;">Bạn chưa có kết bạn với ai cả. Hãy tìm kiếm và kết bạn nhé!</p>`;
            return;
        }

        // Tạo mảng lấy thông tin profile của những người bạn
        const friendIds = friendsData.map(f => f.user_id === currentUser.id ? f.friend_id : f.user_id);
        
        const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar, role')
            .in('id', friendIds);
            
        if (pError) throw pError;

        let html = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px;">`;
        
        profiles.forEach(user => {
            const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name)}&background=random`;
            
            html += `
                <div class="comm-post-card" style="align-items: center; text-align: center; padding: 20px;">
                    <img src="${avatar}" onclick="viewUserProfile('${user.id}')" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px; cursor: pointer;" alt="${user.display_name}">
                    <h3 onclick="viewUserProfile('${user.id}')" style="font-size: 1.1rem; margin-bottom: 5px; cursor: pointer;">${user.display_name} ${user.role==='admin' ? '<i class="fas fa-check-circle" style="color:#4db8ff; font-size:0.8em;" title="Admin"></i>' : ''}</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px;">Bạn bè</p>
                    <div style="display: flex; gap: 10px; justify-content: center; width: 100%;">
                        <button class="comm-btn-follow" style="flex: 1;" onclick="openChat('${user.id}', '${user.display_name.replace(/'/g, "\\'")}', '${avatar}')"><i class="fas fa-comment-dots"></i> Chat</button>
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
        container.innerHTML = html;

    } catch (e) {
        console.error("Lỗi lấy danh sách bạn bè:", e);
        container.innerHTML = `<p class="text-center text-danger" style="padding: 20px;">Lỗi tải dữ liệu.</p>`;
    }
}

// ===========================================
// 8. LOGIC KẾT BẠN (FRIEND SYSTEM)
// ===========================================

async function sendFriendRequest(targetUserId) {
    if (!currentUser) return openAuthModal();
    try {
        const { error } = await supabase
            .from('community_friends')
            .insert({ user_id: currentUser.id, friend_id: targetUserId, status: 'pending' });
        if (error) throw error;
        showNotification("Đã gửi lời mời kết bạn!", "success");
        // Opt UI update here if needed
        const btn = document.getElementById(`add-friend-btn-${targetUserId}`);
        if(btn) {
            btn.textContent = "Đã gửi lời mời";
            btn.disabled = true;
        }
        fetchSuggestedFriends(); // Refresh gợi ý để ẩn người này đi
    } catch (e) {
        console.error("Lỗi gửi kết bạn:", e);
        showNotification("Có lỗi xảy ra", "error");
    }
}

async function acceptFriendRequest(senderId) {
    if (!currentUser) return;
    try {
        const { error } = await supabase
            .from('community_friends')
            .update({ status: 'accepted' })
            .eq('user_id', senderId)
            .eq('friend_id', currentUser.id);
        if (error) throw error;
        
        showNotification("Đã chấp nhận kết bạn!", "success");
        fetchFriendRequests(); // Refresh list
        fetchSuggestedFriends(); // Refresh gợi ý
    } catch (e) {
        console.error("Lỗi chấp nhận kết bạn:", e);
    }
}

async function rejectFriendRequest(senderId) {
    if (!currentUser) return;
    try {
        const { error } = await supabase
            .from('community_friends')
            .delete()
            .eq('user_id', senderId)
            .eq('friend_id', currentUser.id);
        if (error) throw error;
        
        showNotification("Đã từ chối lời mời", "info");
        fetchFriendRequests(); // Refresh list
    } catch (e) {
        console.error("Lỗi từ chối kết bạn:", e);
    }
}

async function fetchFriendRequests() {
    const list = document.getElementById("commFriendRequests");
    if(!list || !currentUser) return;
    
    try {
        const { data, error } = await supabase
            .from('community_friends')
            .select(`
                user_id,
                profiles!community_friends_user_id_fkey(id, display_name, avatar)
            `)
            .eq('friend_id', currentUser.id)
            .eq('status', 'pending');
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            list.innerHTML = `<p class="text-muted" style="font-size: 0.85rem">Không có lời mời nào</p>`;
            return;
        }
        
        list.innerHTML = data.map(req => {
            const user = req.profiles;
            const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name)}&background=random`;
            return `
                <div class="comm-user-item">
                    <div class="comm-user-info" onclick="viewUserProfile('${user.id}')" style="cursor: pointer;">
                        <img src="${avatar}">
                        <div class="comm-user-details">
                            <span class="name">${user.display_name}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px; flex-direction: column;">
                        <button class="comm-btn-follow" style="background: var(--accent-primary); color: white;" onclick="acceptFriendRequest('${user.id}')">Chấp nhận</button>
                        <button class="comm-btn-follow" style="background: var(--surface-light); color: var(--text-muted);" onclick="rejectFriendRequest('${user.id}')">Từ chối</button>
                    </div>
                </div>
            `;
        }).join("");
        
    } catch (e) {
        console.error("Lỗi lấy request:", e);
    }
}

// ===========================================
// 9. TÌM KIẾM NGƯỜI DÙNG (TÌM BẠN BÈ)
// ===========================================
let searchTimeout;
async function searchCommunityUsers(event) {
    const query = event.target.value.trim();
    const resultsContainer = document.getElementById("commSearchResults");
    
    if (!query) {
        resultsContainer.style.display = "none";
        return;
    }

    clearTimeout(searchTimeout);
    
    searchTimeout = setTimeout(async () => {
        resultsContainer.style.display = "block";
        resultsContainer.innerHTML = `<div class="loading-spinner" style="margin: 10px auto;"></div>`;
        
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, display_name, avatar, role')
                .ilike('display_name', `%${query}%`)
                .neq('id', currentUser ? currentUser.id : '00000000-0000-0000-0000-000000000000')
                .limit(5);
                
            if (error) throw error;
            
            if (!data || data.length === 0) {
                resultsContainer.innerHTML = `<p class="text-muted" style="font-size: 0.85rem; text-align: center; padding: 10px;">Không tìm thấy ai</p>`;
                return;
            }
            
            resultsContainer.innerHTML = data.map(user => {
                const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name)}&background=random`;
                return `
                    <div class="comm-user-item" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                        <div class="comm-user-info" onclick="viewUserProfile('${user.id}')" style="cursor: pointer; display: flex; align-items: center; gap: 10px;">
                            <img src="${avatar}" style="width: 30px; height: 30px; border-radius: 50%;">
                            <span class="name" style="font-size: 0.9rem;">${user.display_name}</span>
                        </div>
                        <button class="comm-btn-follow" style="padding: 4px 8px; font-size: 0.75rem" onclick="sendFriendRequest('${user.id}')">Kết bạn</button>
                    </div>
                `;
            }).join("");
            
        } catch (e) {
            console.error("Lỗi tìm kiếm:", e);
            resultsContainer.innerHTML = `<p class="text-danger" style="font-size: 0.85rem; text-align: center; padding: 10px;">Lỗi tìm kiếm</p>`;
        }
    }, 500); // debounce 500ms
}

// Lắng nghe thay đổi kết bạn realtime
let friendSubscription;
function subscribeToFriends() {
    if (!currentUser) return;
    if (friendSubscription) {
        supabase.removeChannel(friendSubscription);
    }
    
    friendSubscription = supabase.channel('friends-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_friends' },
        (payload) => {
            const row = payload.new || payload.old;
            if (!row) return;

            // Nếu có ai đó gửi kết bạn cho mình (INSERT)
            if (payload.eventType === 'INSERT' && row.friend_id === currentUser.id && row.status === 'pending') {
                showNotification("Bạn có 1 lời mời kết bạn mới!", "info");
                fetchFriendRequests(); // Refresh danh sách lời mời
            }
            
            // Nếu có ai đó đồng ý kết bạn hoặc mình đồng ý (UPDATE -> accepted)
            if (payload.eventType === 'UPDATE' && row.status === 'accepted') {
                if (row.user_id === currentUser.id || row.friend_id === currentUser.id) {
                    showNotification("Có 1 yêu cầu kết bạn đã được phê duyệt!", "success");
                    // Refresh nếu đang ở trang bạn bè
                    if (currentCommView === 'friends') renderFriendsView();
                    // Refresh nếu đang ở trang chat
                    if (currentCommView === 'chat') loadChatList();
                }
            }
        }
      )
      .subscribe();
}

// ===========================================
// 9. LOGIC CINECHAT CALL (AUDIO/VIDEO)
// Sử dụng PeerJS để gọi P2P 1-1
// ===========================================

let myCommPeer = null;
let currentCall = null;
let currentLocalStream = null;
let incomingCallObj = null;

let isAudioMuted = false;
let isVideoMuted = false;
let isCallMinimized = false;
let ringTimeout = null;

// 1. Khởi tạo PeerJS
function initCineChatCall() {
    if (typeof Peer === "undefined") {
        console.log("Đang tải thư viện PeerJS cho CineChat...");
        const script = document.createElement("script");
        script.src = "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js";
        script.onload = setupCommPeer;
        document.head.appendChild(script);
    } else {
        setupCommPeer();
    }
}

function setupCommPeer() {
    if (!currentUser) return;
    
    // Dùng ID người dùng làm PeerID (Thêm tiền tố để tránh đụng với Watch Party nếu chạy song song)
    const peerId = "cinechat_" + currentUser.id;
    
    myCommPeer = new Peer(peerId, {
        host: "0.peerjs.com",
        port: 443,
        path: "/",
        debug: 1, // Để 1 để log lỗi cơ bản
    });

    myCommPeer.on("open", (id) => {
        console.log("✅ CineChat PeerJS sẵn sàng với ID:", id);
    });

    myCommPeer.on("error", (err) => {
        console.error("❌ CineChat Peer lỗi:", err);
        // showNotification("Lỗi kết nối cuộc gọi", "error");
    });

    // Lắng nghe cuộc gọi đến
    myCommPeer.on("call", (call) => {
        console.log("📞 Incoming call from:", call.peer);
        // Trích xuất ID thật (Bỏ 'cinechat_')
        const callerId = call.peer.replace("cinechat_", "");
        
        // Hiện Modal gọi đến
        incomingCallObj = call;
        showIncomingCallUI(callerId);
    });
}

// 2. Hiển thị UI Cuộc gọi đến
async function showIncomingCallUI(callerId) {
    try {
        // Lấy thông tin người gọi
        const { data } = await supabase.from('profiles').select('display_name, avatar').eq('id', callerId).single();
        const name = data ? (data.display_name || "User") : "Người dùng";
        const avatar = data ? (data.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`) : `https://ui-avatars.com/api/?name=U`;
        
        document.getElementById("incomingCallName").textContent = name;
        document.getElementById("incomingCallAvatar").src = avatar;
        
        document.getElementById("incomingCallModal").style.display = "flex";
        
        // Phát âm thanh chuông (Nếu có file âm thanh thì tạo đối tượng Audio chạy loop ở đây)
    } catch(e) {
        console.error("Lỗi show incoming call UI:", e);
    }
}

// 3. Khởi tạo cuộc gọi đi
async function startCall(isVideo = false) {
    if (!currentChatUserId) {
        showNotification("Vui lòng chọn người bạn muốn gọi", "warning");
        return;
    }
    
    if (!myCommPeer || myCommPeer.disconnected) {
        showNotification("Đang kết nối lại máy chủ cuộc gọi...", "warning");
        if(myCommPeer) myCommPeer.reconnect();
        return;
    }

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showNotification("Trình duyệt chặn quyền truy cập Mic/Cam. Vui lòng dùng HTTPS hoặc localhost.", "error");
            return;
        }
        
        // Xin quyền truy cập thiết bị
        currentLocalStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo ? { facingMode: "user" } : false,
            audio: true
        });

        // Thiết lập UI gọi
        setupActiveCallUI(true, isVideo);
        
        // Gắn local video
        const localVidEl = document.getElementById("localVideo");
        localVidEl.srcObject = currentLocalStream;
        
        // Thực hiện cuộc gọi tới đối tác
        const targetPeerId = "cinechat_" + currentChatUserId;
        const call = myCommPeer.call(targetPeerId, currentLocalStream, {
            metadata: { isVideo: isVideo }
        });
        
        currentCall = call;
        handleCallEvents(call, isVideo);
        
        document.getElementById("activeCallStatus").textContent = "Đang đổ chuông...";
        
        // Thiết lập bộ đếm thời gian cho tiếng chuông (Tối đa 30s)
        clearTimeout(ringTimeout);
        ringTimeout = setTimeout(() => {
            if (currentCall && !currentCall.open) {
                console.log("Cuộc gọi không ai nghe máy, tự động ngắt.");
                showNotification("Người dùng không trả lời", "info");
                
                // Hủy cuộc gọi đi
                currentCall.close();
                endCallLogic();
                
                // Gửi log cuộc gọi nhỡ
                sendSystemCallLog(isVideo ? "📵 Cuộc gọi Video nhỡ" : "📵 Cuộc gọi thoại nhỡ", targetPeerId.replace("cinechat_", ""));
            }
        }, 30000); // 30 giây

    } catch (err) {
        console.error("Lỗi xin quyền Webcam/Mic:", err);
        showNotification("Bạn đã từ chối quyền truy cập Mic/Cam hoặc thiết bị không hỗ trợ.", "error");
    }
}

// 4. Nhận & Từ chối cuộc gọi
async function acceptCall() {
    if (!incomingCallObj) return;
    
    // Lưu lại object trước khi reset UI để dùng trong try/catch
    const callToAccept = incomingCallObj;
    
    // Tạm thời Disable nút để tránh click đúp
    const acceptBtn = document.querySelector('.btn-call-accept');
    if (acceptBtn) acceptBtn.disabled = true;
    
    try {
        // Lấy cờ isVideo từ người gọi gửi qua
        const isVideoCall = callToAccept.metadata ? callToAccept.metadata.isVideo : true;
        let stream = null;
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showNotification("Trình duyệt chặn yêu cầu Mic/Cam. Yêu cầu môi trường HTTPS hoặc localhost.", "error");
        } else {
            try {
                // CẦN thiết bị trên Mobile: Yêu cầu quyền trực tiếp từ hành động Click bằng await
                stream = await navigator.mediaDevices.getUserMedia({
                    video: isVideoCall ? { facingMode: "user" } : false,
                    audio: true
                });
            } catch (err1) {
                console.warn("Lỗi getUserMedia 1 (Cần Cam+Mic):", err1);
                try {
                    // Fallback chỉ lấy Mic nếu không có/không cho phép Cam
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: false,
                        audio: true
                    });
                    if (isVideoCall) showNotification("Chỉ truy cập được Mic, Video giới hạn.", "warning");
                } catch (err2) {
                    console.warn("Lỗi getUserMedia 2 (Chỉ Mic):", err2);
                    showNotification("Bạn tham gia chế độ chỉ nghe do không cấp quyền Mic/Cam", "info");
                }
            }
        }
        
        currentLocalStream = stream;
        
        // Trả lời cuộc gọi
        if (currentLocalStream) {
            callToAccept.answer(currentLocalStream);
        } else {
            callToAccept.answer(); // Nhận cuộc gọi mà không có luồng trả về
        }
        
        currentCall = callToAccept;
        
        // Ẩn modal sau khi lấy luồng thành công
        document.getElementById("incomingCallModal").style.display = "none";
        if (acceptBtn) acceptBtn.disabled = false;
        
        // Xác định xem luồng mình có video không
        const hasVideo = currentLocalStream ? currentLocalStream.getVideoTracks().length > 0 : false;
        setupActiveCallUI(false, hasVideo);
        
        if (currentLocalStream) {
            const localVidEl = document.getElementById("localVideo");
            localVidEl.srcObject = currentLocalStream;
            localVidEl.muted = true; // Tránh vọng âm báo của mình
        } else {
            document.getElementById("localVideo").style.display = "none";
        }
        
        handleCallEvents(currentCall, hasVideo);
        
        document.getElementById("activeCallStatus").textContent = "Cuộc gọi đang diễn ra";
        
        // Log cuộc gọi được chấp nhận
        const callerId = incomingCallObj.peer.replace("cinechat_", "");
        sendSystemCallLog(hasVideo ? "📹 Bắt đầu cuộc gọi Video" : "📞 Bắt đầu cuộc gọi thoại", callerId);

    } catch(err) {
        console.error("Lỗi nhận cuộc gọi:", err);
        showNotification("Lỗi không thể kết nối tới cuộc gọi", "error");
        declineCall();
    }
}

function declineCall() {
    if (incomingCallObj) {
        const callerId = incomingCallObj.peer.replace("cinechat_", "");
        sendSystemCallLog("📞 Đã từ chối cuộc gọi", callerId);
        
        incomingCallObj.close();
        incomingCallObj = null;
    }
    document.getElementById("incomingCallModal").style.display = "none";
}

// 5. Xử lý sự kiện trong cuộc gọi
function handleCallEvents(call, isVideo) {
    call.on("stream", (remoteStream) => {
        // Hủy bộ hẹn giờ ngắt cuộc gọi (vì đầu kia đã nhấc máy)
        if (ringTimeout) {
            clearTimeout(ringTimeout);
            ringTimeout = null;
        }
        
        // Khi nhận được luồng của người kia
        console.log("🔗 Nhận stream từ", call.peer);
        document.getElementById("activeCallStatus").textContent = "Đã kết nối";
        const remoteVidEl = document.getElementById("remoteVideo");
        remoteVidEl.srcObject = remoteStream;
    });

    call.on("close", () => {
        console.log("Cuộc gọi kết thúc");
        endCallLogic();
    });

    call.on("error", (err) => {
        console.error("Lỗi cuộc gọi:", err);
        endCallLogic();
    });
}

// 6. UI Xử lý Active Call Window
function setupActiveCallUI(isInitiator, isVideo) {
    const windowEl = document.getElementById("activeCallWindow");
    windowEl.style.display = "flex";
    windowEl.classList.remove("minimized");
    
    // Kích hoạt kéo thả lúc này (đảm bảo DOM đã hiện thị)
    dragElement(windowEl);
    
    // Nếu chỉ gọi audio, hiện placeholder
    const audioPlaceholder = document.getElementById("audioCallPlaceholder");
    if (!isVideo) {
        audioPlaceholder.style.display = "flex";
        // Lấy avatar của người đang gọi nhét vào
        const targetAvatar = isInitiator ? 
              document.getElementById("commChatTargetAvatar")?.src : 
              document.getElementById("incomingCallAvatar")?.src;
              
        if (targetAvatar) document.getElementById("activeCallAvatar").src = targetAvatar;
    } else {
        audioPlaceholder.style.display = "none";
    }
    
    // Reset state nút
    isAudioMuted = false;
    isVideoMuted = !isVideo;
    updateCallControlsUI();
}

// Điều khiển tắt/bật thiết bị
function toggleCallMic() {
    if (!currentLocalStream) return;
    isAudioMuted = !isAudioMuted;
    currentLocalStream.getAudioTracks().forEach(track => track.enabled = !isAudioMuted);
    updateCallControlsUI();
}

async function toggleCallCam() {
    if (!currentLocalStream) return;
    
    let videoTracks = currentLocalStream.getVideoTracks();
    
    // Nếu chưa có luồng video nào (Do lúc đầu chọn gọi Thoại)
    if (videoTracks.length === 0) {
        try {
            document.getElementById("btnToggleCam").classList.add("loading"); // Optional UX
            const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const newVideoTrack = newStream.getVideoTracks()[0];
            
            // Thêm track vào stream hiện tại
            currentLocalStream.addTrack(newVideoTrack);
            
            // Cập nhật lên PeerJS connection
            if (currentCall && currentCall.peerConnection) {
                const senders = currentCall.peerConnection.getSenders();
                const sender = senders.find(s => s.track && s.track.kind === 'video');
                
                if (sender) {
                    sender.replaceTrack(newVideoTrack);
                } else {
                    currentCall.peerConnection.addTrack(newVideoTrack, currentLocalStream);
                }
            }
            
            // Cập nhật Local UI
            document.getElementById("localVideo").srcObject = currentLocalStream;
            isVideoMuted = false;
            
            // Lấy lại danh sách tracks sau khi add
            videoTracks = currentLocalStream.getVideoTracks();
            
        } catch (err) {
            console.error("Lỗi bật Camera giữa chừng:", err);
            showNotification("Không thể truy cập Camera. Vui lòng kiểm tra quyền.", "error");
            return;
        } finally {
            document.getElementById("btnToggleCam").classList.remove("loading");
        }
    } else {
        // Nếu đã có luồng video từ trước -> Chỉ bật/tắt
        isVideoMuted = !isVideoMuted;
        videoTracks.forEach(track => track.enabled = !isVideoMuted);
    }
    
    // Toggle placeholder
    const audioPlaceholder = document.getElementById("audioCallPlaceholder");
    if(isVideoMuted) {
        audioPlaceholder.style.display = "flex";
    } else {
        audioPlaceholder.style.display = "none";
    }
    
    updateCallControlsUI();
}

function updateCallControlsUI() {
    const btnMic = document.getElementById("btnToggleMic");
    const btnCam = document.getElementById("btnToggleCam");
    
    if (isAudioMuted) btnMic.classList.add("off");
    else btnMic.classList.remove("off");
    
    if (isVideoMuted) btnCam.classList.add("off");
    else btnCam.classList.remove("off");
}

function toggleMinimizeCall() {
    const windowEl = document.getElementById("activeCallWindow");
    isCallMinimized = !isCallMinimized;
    if(isCallMinimized) {
        windowEl.classList.add("minimized");
        document.querySelector(".btn-minimize-call i").className = "fas fa-expand-alt";
    } else {
        windowEl.classList.remove("minimized");
        document.querySelector(".btn-minimize-call i").className = "fas fa-compress-alt";
    }
}

// Tái sử dụng logic kéo thả chuẩn xác của Mini Player (Chống dính chuột, khóa cuộn)
function dragElement(elmnt) {
    const header = document.getElementById("activeCallHeader");
    const target = header || elmnt;
    
    // Cleanup cũ để tránh thêm event nhiều lần
    if (elmnt._dragCleanup) elmnt._dragCleanup();

    let isDragging = false;
    let startX, startY, startTop, startLeft;

    // --- MOUSE DRAG ---
    function onMouseDown(e) {
        if (isCallMinimized) return;
        if (e.target.closest('button')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = elmnt.getBoundingClientRect();
        startTop = rect.top;
        startLeft = rect.left;
        elmnt.style.transition = 'none'; // Tắt transition khi kéo
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        let newLeft = startLeft + deltaX;
        let newTop = startTop + deltaY;
        
        const margin = 10;
        newLeft = Math.max(margin, Math.min(newLeft, window.innerWidth - elmnt.offsetWidth - margin));
        newTop = Math.max(margin, Math.min(newTop, window.innerHeight - elmnt.offsetHeight - margin));
        
        elmnt.style.left = newLeft + "px";
        elmnt.style.top = newTop + "px";
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";
    }

    function onMouseUp() {
        if (isDragging) {
            isDragging = false;
            elmnt.style.transition = '';
        }
    }

    // --- TOUCH DRAG ---
    function onTouchStart(e) {
        if (isCallMinimized) return;
        if (e.target.closest('button')) return;
        
        const touch = e.touches[0];
        isDragging = true;
        startX = touch.clientX;
        startY = touch.clientY;
        const rect = elmnt.getBoundingClientRect();
        startTop = rect.top;
        startLeft = rect.left;
        elmnt.style.transition = 'none';
    }

    function onTouchMove(e) {
        if (!isDragging) return;
        // KHÔNG BAO GIỜ e.preventDefault() NẾU PASSSIVE: TRUE 
        // Thay vì khóa cuộn bằng preventDefault, Mobile sẽ bỏ qua nhờ touch-action: none trên CSS của header
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        let newLeft = startLeft + deltaX;
        let newTop = startTop + deltaY;
        
        const margin = 10;
        newLeft = Math.max(margin, Math.min(newLeft, window.innerWidth - elmnt.offsetWidth - margin));
        newTop = Math.max(margin, Math.min(newTop, window.innerHeight - elmnt.offsetHeight - margin));
        
        elmnt.style.left = newLeft + "px";
        elmnt.style.top = newTop + "px";
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";
    }

    function onTouchEnd() {
        if (isDragging) {
            isDragging = false;
            elmnt.style.transition = '';
        }
    }

    // Attach sự kiện
    target.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onMouseUp);

    target.addEventListener("touchstart", onTouchStart, { passive: true });
    // Dùng passive: false KIỂU MỚI: Chỉ block trong header qua touch-action CSS
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);

    // Lưu hảm dọn cục bộ
    elmnt._dragCleanup = () => {
        target.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        window.removeEventListener("blur", onMouseUp);
        
        target.removeEventListener("touchstart", onTouchStart);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
    };
}

// (Đã chuyển drag setup vào setupActiveCallUI)
// 7. Kết thúc cuộc gọi / Dọn dẹp
function endCall() {
    if (currentCall) {
        // Gửi log trước khi đóng
        let isVideo = currentLocalStream && currentLocalStream.getVideoTracks().length > 0;
        let peerId = currentCall.peer.replace("cinechat_", "");
        sendSystemCallLog(isVideo ? "📹 Cuộc gọi Video kết thúc" : "📞 Cuộc gọi thoại kết thúc", peerId);
        
        currentCall.close(); // Đóng kết nối
    }
    
    // Xóa bộ hẹn giờ ngắt cuộc gọi (nếu còn)
    if (ringTimeout) {
        clearTimeout(ringTimeout);
        ringTimeout = null;
    }
    
    endCallLogic();
}

function endCallLogic() {
    console.log("Đóng luồng media...");
    if (currentLocalStream) {
        currentLocalStream.getTracks().forEach(track => track.stop());
        currentLocalStream = null;
    }
    
    currentCall = null;
    
    // Ẩn UI
    const windowEl = document.getElementById("activeCallWindow");
    windowEl.style.display = "none";
    windowEl.style.top = "";
    windowEl.style.left = "";
    windowEl.style.bottom = "30px";
    windowEl.style.right = "30px";
    windowEl.classList.remove("minimized");
    isCallMinimized = false;
    
    // Đảm bảo Modal Nhận cuộc gọi bị ẩn hoàn toàn (Tránh lỗi đè 100vh chặn scroll trang)
    const incomingModal = document.getElementById("incomingCallModal");
    if(incomingModal) {
        incomingModal.style.display = "none";
    }
    
    // Đảm bảo không còn class khóa scroll nào bị kẹt lại trên body
    document.body.classList.remove("modal-open");
    
    // Xóa video tag source
    document.getElementById("localVideo").srcObject = null;
    document.getElementById("remoteVideo").srcObject = null;
}
