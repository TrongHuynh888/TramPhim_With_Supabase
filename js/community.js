/**
 * COMMUNITY MODULE (CineConnect/CineChat Inspired)
 * Chứa logic load trang Cộng Đồng, Feed, Chat, Profile.
 */

// Global state
let isCommunityLoaded = false;
let currentCommView = 'feed'; // feed | chat | profile | friends
let previousCommView = 'feed'; // Lưu view trước đó để nút quay lại
let communityPresenceChannel = null;
let userPresenceMap = new Map(); // userId (string) -> { online: boolean, last_seen: string }
let currentChatTarget = null; // Thông tin người đang chat cùng
let replyingTo = null; // { id, name, text }
let currentPinnedMessages = []; // Danh sách tin nhắn gim hiện tại [{id, content, senderName}]
let isPinnedListExpanded = false; // Trạng thái mở rộng danh sách ghim
let confirmModalResolver = null; // Promise resolver cho confirm modal
let currentConfirmActionId = null; // ID hành động hiện tại để lưu suppression
const IMGBB_API_KEY = '82e6c87383e2d42e3dbcb62a798eca36';
let pendingImages = []; // Mảng chứa các đối tượng {blob, previewUrl} đang chờ gửi
let currentLightboxImages = []; // Danh sách toàn bộ ảnh trong hội thoại hiện tại
let currentLightboxIndex = -1;  // Index ảnh đang xem
let currentLightboxRotation = 0; // Trạng thái xoay (độ)
let currentLightboxZoom = 1;     // Trạng thái thu phóng
let isDraggingLightbox = false;
let startX, startY, scrollLeft, scrollTop;
let forwardingMsgId = null; // ID tin nhắn đang được chuẩn bị chuyển tiếp
let forwardFriendsData = []; // Cache danh sách bạn bè để filter nhanh
let selectedForwardUserIds = []; // Danh sách các ID người dùng được chọn để chuyển tiếp
let myAppBlocks = []; // [MỚI] Lưu trữ toàn bộ danh sách chặn của tôi để dùng chung cho Sidebar/Chat
let postSelectedImages = []; // Mảng file ảnh đã chọn để đăng bài (tối đa 10, chờ upload R2)
const MAX_POST_IMAGES = 10; // Giới hạn số ảnh tối đa mỗi bài
let postSelectedMovieId = null; // ID phim đã chọn để gắn thẻ vào bài viết
const R2_WORKER_URL = 'https://r2-uploader.thinhnd-2003.workers.dev'; // URL Cloudflare R2 Worker

/**
 * Tạo HTML thẻ phim chi tiết cho bài viết (dùng chung feed + profile)
 * Hiển thị: poster, tên phim, thể loại, quốc gia (lá cờ), thời lượng, mô tả ngắn, loại phim, số tập, nút xem phim
 * @param {Object} movieData - Dữ liệu phim từ allMovies
 * @returns {string} HTML thẻ phim hoặc '' nếu không có phim
 */
function buildMovieRefHtml(movieData) {
    if (!movieData || !movieData.title) return '';

    const poster = movieData.posterUrl || movieData.poster_url || '';
    const title = escapeHtml(movieData.title);
    const country = movieData.country || '';
    const duration = movieData.duration || '';
    const description = movieData.description || '';
    const type = movieData.type || '';
    const totalEps = movieData.totalEpisodes || movieData.total_episodes || 0;
    const currentEps = movieData._episodeCount || movieData.current_episode || 0;

    // Lấy tên thể loại từ allCategories (vì movie.categories lưu mảng ID)
    let categoryNames = [];
    const catIds = movieData.categories || [];
    if (catIds.length > 0 && typeof allCategories !== 'undefined' && allCategories) {
        catIds.forEach(catId => {
            const catObj = allCategories.find(c => c.id === catId);
            if (catObj && catObj.name) categoryNames.push(catObj.name);
        });
    }
    // Fallback: dùng movie.category nếu có
    if (categoryNames.length === 0 && movieData.category) {
        categoryNames.push(movieData.category);
    }

    // Tạo meta badges
    let metaBadges = '';
    if (categoryNames.length > 0) metaBadges += `<span class="comm-movie-tag-badge"><i class="fas fa-tags"></i> ${escapeHtml(categoryNames.join(', '))}</span>`;
    
    // Quốc gia với lá cờ (tra cứu allCountries bằng ID)
    if (country) {
        let countryName = country;
        let flagHtml = '<i class="fas fa-globe-asia"></i>';
        if (typeof allCountries !== 'undefined' && allCountries && allCountries.length > 0) {
            const cObj = allCountries.find(c => c.id === country || (c.name && c.name.toLowerCase() === country.toLowerCase()));
            if (cObj) {
                countryName = cObj.name || country;
                const flagCode = (cObj.code || cObj.id || '').toLowerCase();
                if (flagCode) {
                    flagHtml = `<img src="https://flagcdn.com/w20/${flagCode}.png" alt="${escapeHtml(countryName)}" style="width:14px; height:10px; border-radius:1px; vertical-align:middle;">`;
                }
            }
        }
        metaBadges += `<span class="comm-movie-tag-badge">${flagHtml} ${escapeHtml(countryName)}</span>`;
    }
    
    if (duration) metaBadges += `<span class="comm-movie-tag-badge"><i class="fas fa-clock"></i> ${escapeHtml(duration)}</span>`;

    // Badge loại phim + số tập
    let episodeBadge = '';
    if (type === 'series') {
        const epsText = totalEps > 0 ? `${currentEps}/${totalEps} tập` : `${currentEps} tập hiện có`;
        episodeBadge = `<span class="comm-movie-episodes-badge"><i class="fas fa-list-ol"></i> Phim Bộ • ${epsText}</span>`;
    } else if (type === 'single') {
        episodeBadge = `<span class="comm-movie-episodes-badge"><i class="fas fa-film"></i> Phim Lẻ</span>`;
    }

    // Mô tả ngắn
    const descHtml = description ? `<div class="comm-post-movie-desc">${escapeHtml(description)}</div>` : '';

    return `
        <div class="comm-post-movie-ref">
            ${poster ? `<img src="${poster}" alt="${title}" onerror="this.style.display='none'" onclick="if(typeof viewMovieDetail==='function') viewMovieDetail('${movieData.id}')">` : ''}
            <div class="comm-post-movie-info">
                <div class="comm-post-movie-title">🎬 ${title}</div>
                ${(metaBadges || episodeBadge) ? `<div class="comm-post-movie-meta">${metaBadges}${episodeBadge}</div>` : ''}
                ${descHtml}
                <div class="comm-post-movie-actions">
                    <button class="comm-movie-watch-btn" onclick="event.stopPropagation(); if(typeof viewMovieDetail==='function') viewMovieDetail('${movieData.id}')">
                        <i class="fas fa-play-circle"></i> Xem phim
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Trạng thái typing indicator
let typingTimeout = null;
let isCurrentlyTyping = false;
let hideTypingIndicatorTimeout = null;
let lastTypingBroadcastTime = 0; // [MỚI] Thời điểm gửi tín hiệu typing gần nhất

const WALLPAPER_GALLERY = [
    "images/backgroundChat/bg1.png",
    "images/backgroundChat/bg2.png",
    "images/backgroundChat/bg3.png",
    "images/backgroundChat/bg4.png",
    "images/backgroundChat/bg5.png",
    "images/backgroundChat/bg6.png"
];

// Biến lưu trạng thái tạm thời cho Wallpaper Preview
let originalWallpaperState = { url: null, opacity: 0.4, position: 'center' };
let currentPreviewWallpaper = null;
let currentPreviewOpacity = 0.4;
let currentPreviewPosition = 'center';


/**
 * Điều khiển Dropdown Menu Chat - ĐƯA LÊN ĐẦU ĐỂ TRÁNH REFERENCE ERROR
 */
function toggleChatItemDropdown(event, chatId) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById(`dropdown-chat-${chatId}`);
    if (!dropdown) return;

    const isActive = dropdown.classList.contains('active');
    
    // Đóng tất cả dropdown khác
    closeAllChatDropdowns();
    
    // Nếu trước đó chưa active thì giờ bật lên
    if (!isActive) {
        dropdown.classList.add('active');
    }
}

function closeAllChatDropdowns() {
    document.querySelectorAll('.comm-chat-item-dropdown.active').forEach(d => {
        d.classList.remove('active');
    });
}

// --- CUSTOM CONFIRM MODAL LOGIC ---
function showConfirmModal(title, message, iconClass = "fas fa-exclamation-triangle", actionId = "default") {
    return new Promise((resolve) => {
        // 1. Kiểm tra suppression từ localStorage
        const suppressKey = `confirm_suppress_${actionId}`;
        const suppressExpiry = localStorage.getItem(suppressKey);
        
        if (suppressExpiry) {
            const expiryTime = parseInt(suppressExpiry);
            if (Date.now() < expiryTime) {
                console.log(`🚀 Action [${actionId}] đang trong thời gian ẩn thông báo. Tự động xác nhận.`);
                resolve(true);
                return;
            } else {
                localStorage.removeItem(suppressKey); // Hết hạn thì xóa luôn
            }
        }

        const modal = document.getElementById("commConfirmModal");
        const titleEl = document.getElementById("commConfirmTitle");
        const msgEl = document.getElementById("commConfirmMessage");
        const iconEl = document.getElementById("commConfirmIcon");
        const suppressCheck = document.getElementById("commConfirmSuppress");
        
        if (!modal || !titleEl || !msgEl) {
            // Fallback nếu không tìm thấy modal
            resolve(confirm(message));
            return;
        }

        currentConfirmActionId = actionId;
        titleEl.textContent = title;
        msgEl.textContent = message;
        if (iconEl) iconEl.className = iconClass;
        if (suppressCheck) suppressCheck.checked = false; // Reset checkbox mỗi lần hiện
        
        modal.classList.add("active");
        confirmModalResolver = resolve;
    });
}

function closeCommConfirm(result) {
    const modal = document.getElementById("commConfirmModal");
    const suppressCheck = document.getElementById("commConfirmSuppress");
    const durationSelect = document.getElementById("commConfirmDuration");

    // Nếu người dùng nhấn xác nhận VÀ có tick vào "Không nhắc lại"
    if (result && suppressCheck && suppressCheck.checked && currentConfirmActionId) {
        const hours = parseInt(durationSelect.value) || 24;
        const expiryTime = Date.now() + (hours * 3600 * 1000);
        localStorage.setItem(`confirm_suppress_${currentConfirmActionId}`, expiryTime.toString());
        console.log(`💾 Đã lưu suppression cho [${currentConfirmActionId}] trong ${hours} giờ.`);
    }

    if (modal) modal.classList.remove("active");
    if (confirmModalResolver) {
        confirmModalResolver(result);
        confirmModalResolver = null;
    }
    currentConfirmActionId = null;
}

// --- NEW FIX: CUSTOM BLOCK MODAL LOGIC ---
let blockModalResolver = null;

function showBlockConfirmModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById("commBlockModal");
        const msgEl = document.getElementById("commBlockMessage");
        
        if (!modal || !msgEl || !currentChatTarget) {
            resolve({ confirmed: false, duration: null });
            return;
        }

        // Fix lỗi hiển thị undefined tên:
        const targetName = currentChatTarget.name || currentChatTarget.display_name || "người dùng này";
        msgEl.textContent = `Bạn có chắc chắn muốn chặn ${targetName}? Người này sẽ không thể nhắn tin cho bạn nữa.`;
        
        modal.classList.add("active");
        blockModalResolver = resolve;
    });
}

function closeCommBlockModal(isConfirmed) {
    const modal = document.getElementById("commBlockModal");
    const durationSelect = document.getElementById("commBlockDuration");
    
    let result = {
        confirmed: false,
        duration: null
    };

    if (isConfirmed && durationSelect) {
        result.confirmed = true;
        result.duration = parseInt(durationSelect.value); // -1 (vĩnh viễn) hoặc số giờ
    }

    if (modal) modal.classList.remove("active");
    if (blockModalResolver) {
        blockModalResolver(result);
        blockModalResolver = null;
    }
}

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

  // 1.2 Navbar: Đã chuyển sang HTML tĩnh trong index.html (dễ tìm code)
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
    // Tải phim đang hot
    loadTrendingMovies();
    // Start Realtime subscriptions for interactions
    subscribeToInteractions();
    
    // Khởi tạo PeerJS Call (Đã dời ra ngoài để chạy Global)
    
    // Đăng ký nhận thông báo tin nhắn mới để refresh danh sách chat
    subscribeToMessageNotifications();

    // Khởi tạo kho Emoji đa dạng
    if (typeof initEmojiPicker === 'function') {
        initEmojiPicker();
    }

    // Khởi tạo tính năng kéo cho Lightbox
    initLightBoxDrag();

    // [MỚI] Tải danh sách chat ngay từ đầu để sẵn sàng dữ liệu chặn cho Sidebar/Real-time
    if (currentUser) {
        loadChatList().catch(err => console.error("Lỗi loadChatList ban đầu:", err));
    }
}

// Global Init cho PeerJS ngay khi file script được load (Nếu đã login)
setTimeout(() => {
    if (currentUser) {
        initCineChatCall();
    }
}, 3000); // Delay 3 giây để đợi Firebase auth check xong

// 3. SWITCH VIEWS
function switchCommView(viewName, skipRender = false) {
    try {
        // Lưu view trước đó (trừ khi đang ở profile chuyển sang profile)
        if (currentCommView !== 'profile' && viewName === 'profile') {
            previousCommView = currentCommView;
        }
        currentCommView = viewName;
        
        // Ẩn tất cả bằng inline !important (override mọi CSS !important rule)
        const views = ["commFeedView", "commChatView", "commProfileView"];
        views.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.setProperty('display', 'none', 'important');
        });
        
        // Mặc định xóa class chat-active và friends-active khi chuyển view
        document.body.classList.remove('comm-chat-active');
        const feedView = document.getElementById('commFeedView');
        if (feedView) feedView.classList.remove('comm-friends-active');
        
        // Hiện lại footer khi rời tab Chat (sẽ ẩn lại nếu vào chat bên dưới)
        const footerEl = document.getElementById('footer');
        if (footerEl && viewName !== 'chat') {
            footerEl.style.display = 'block';
        }
        
        // Update active nav state
        const navItems = document.querySelectorAll(".comm-left-sidebar .comm-nav-item");
        navItems.forEach(i => i.classList.remove('active'));

        // Hiện view tương ứng
        if (viewName === 'feed') {
            const el = document.getElementById("commFeedView");
            if (el) el.style.setProperty('display', 'grid', 'important');
            if (navItems[0]) navItems[0].classList.add("active");
            
            const tabs = document.querySelector(".comm-feed-tabs");
            if(tabs) {
                tabs.innerHTML = `
                    <button class="comm-tab active" onclick="switchFeedTab('all', this)">Tất cả bài viết</button>
                    <button class="comm-tab" onclick="switchFeedTab('following', this)">Đang theo dõi</button>
                    <button class="comm-tab" onclick="switchFeedTab('trending', this)">Thịnh hành</button>
                `;
            }
            const composer = document.querySelector(".comm-composer");
            if (composer) composer.style.display = "flex";
            
            fetchPosts();
            
        } else if (viewName === 'chat') {
            const el = document.getElementById("commChatView");
            if (el) el.style.setProperty('display', 'grid', 'important');
            if (navItems[1]) navItems[1].classList.add("active");
            
            // Kích hoạt trạng thái khóa cuộn và ẩn footer
            document.body.classList.add('comm-chat-active');
            
            // Ẩn footer khi ở tab nhắn tin để không che ô nhập tin nhắn
            const chatFooter = document.getElementById('footer');
            if (chatFooter) chatFooter.style.display = 'none';
            
            // Nếu chưa chọn người chat hoặc session đang ẩn, ẩn sidebar thông tin
            const layout = document.getElementById("commChatView");
            if (layout) {
                if (!currentChatUserId || isChatInfoSidebarHiddenInSession) {
                    layout.classList.add("info-hidden");
                    const icon = document.getElementById("iconToggleChatInfo");
                    if (icon) icon.className = 'far fa-address-card';
                } else {
                    layout.classList.remove("info-hidden");
                    const icon = document.getElementById("iconToggleChatInfo");
                    if (icon) icon.className = 'fas fa-address-card';
                }
            }
            
            // Nếu đã chọn người chat trước đó, đánh dấu đã xem khi quay lại tab
            // DOM giữ nguyên tin nhắn (trang chỉ ẩn/hiện bằng class, không xóa nội dung)
            if (currentChatUserId) {
                markMessagesAsSeen(currentChatUserId);
            }

            // Nếu chưa chọn người chat -> Hiện màn hình chào mừng, ẩn khung chat
            const welcomeEl = document.getElementById("commChatWelcome");
            const contentEl = document.getElementById("commChatContent");
            if (!currentChatUserId) {
                if (welcomeEl) welcomeEl.style.display = "flex";
                if (contentEl) contentEl.style.display = "none";
            }
            loadChatList(); // Luôn load danh sách chat khi vào tab Chat
        } else if (viewName === 'friends') {
            const el = document.getElementById("commFeedView");
            if (el) {
                el.style.setProperty('display', 'grid', 'important');
                el.classList.add('comm-friends-active'); // Hiện sidebar phải trên tablet
            }
            if (navItems[2]) navItems[2].classList.add("active");
            renderFriendsView();
        } else if (viewName === 'profile') {
            const el = document.getElementById("commProfileView");
            if (el) el.style.setProperty('display', 'flex', 'important');
            if (navItems[3]) navItems[3].classList.add("active");
            if (!skipRender) renderMyProfile();
        }
    } catch (e) {
        console.error("Lỗi chuyển View:", e);
    }
}

/**
 * Quay lại view trước đó từ trang cá nhân
 * Thông minh: nhớ view trước (feed/friends/chat), mặc định về feed
 */
function goBackFromProfile() {
    const target = previousCommView || 'feed';
    switchCommView(target);
}

function viewUserProfile(userId) {
    if (!userId) return;
    switchCommView('profile', true);
    renderUserProfile(userId);
}


// Quay lại danh sách chat trên Mobile/Tablet dọc (Slide-View)
function closeChatConversation() {
    const layoutEl = document.getElementById("commChatView");
    if (layoutEl) {
        layoutEl.classList.remove('chat-conversation-open');
    }
}

/**
 * Thu gọn / Mở rộng sidebar danh sách chat
 * Thu gọn: chỉ hiện avatar tròn — Mở rộng: hiện đầy đủ
 * Chỉ hoạt động trên PC (>1024px)
 */
function toggleChatSidebar() {
    // Chặn toggle trên mobile/tablet
    if (window.innerWidth <= 1024) return;

    const sidebar = document.getElementById('commChatSidebar');
    const layout = document.getElementById('commChatView');
    if (!sidebar) return;

    sidebar.classList.toggle('collapsed');
    if (layout) layout.classList.toggle('sidebar-collapsed');
}

// Tự remove collapsed khi resize về mobile
window.addEventListener('resize', function() {
    if (window.innerWidth <= 1024) {
        const sidebar = document.getElementById('commChatSidebar');
        const layout = document.getElementById('commChatView');
        if (sidebar) sidebar.classList.remove('collapsed');
        if (layout) layout.classList.remove('sidebar-collapsed');
    }
});

/**
 * Thu gọn / Mở rộng left sidebar (nav trái)
 * Thu gọn: chỉ hiện icon — Mở rộng: hiện đầy đủ text
 * Chỉ hoạt động trên PC (>768px)
 */
function toggleLeftSidebar() {
    if (window.innerWidth <= 768) return;

    const sidebar = document.getElementById('commLeftSidebar');
    const wrapper = document.querySelector('.community-wrapper');
    if (!sidebar) return;

    sidebar.classList.toggle('collapsed');
    if (wrapper) wrapper.classList.toggle('left-collapsed');
}

// Reset left sidebar khi resize về mobile
window.addEventListener('resize', function() {
    if (window.innerWidth <= 768) {
        const leftSidebar = document.getElementById('commLeftSidebar');
        const wrapper = document.querySelector('.community-wrapper');
        if (leftSidebar) leftSidebar.classList.remove('collapsed');
        if (wrapper) wrapper.classList.remove('left-collapsed');
    }
});

/**
 * Render gallery ảnh cho bài post (hỗ trợ 1 hoặc nhiều ảnh)
 * Tương thích ngược: bài cũ chỉ có media_url vẫn hiển thị bình thường
 * @param {Object} post - Dữ liệu bài post từ Supabase
 * @returns {string} HTML gallery hoặc chuỗi rỗng
 */
function renderPostGallery(post) {
    // Ưu tiên media_urls (mảng), fallback về media_url (string đơn)
    const urls = post.media_urls && post.media_urls.length > 0
        ? post.media_urls
        : (post.media_url ? [post.media_url] : []);

    if (urls.length === 0) return '';

    // 1 ảnh: hiển thị full-width như cũ
    if (urls.length === 1) {
        return `<img src="${urls[0]}" class="comm-post-image" alt="Ảnh bài đăng" loading="lazy" onclick="openPostImageViewer('${post.id}', 0)">`;
    }

    // Nhiều ảnh: grid adaptive
    const maxShow = 4; // Hiển thị tối đa 4 ảnh trong grid
    const remaining = urls.length - maxShow;

    let gridItems = urls.slice(0, maxShow).map((url, idx) => {
        const isLast = idx === maxShow - 1 && remaining > 0;
        return `
            <div class="comm-gallery-item ${urls.length === 2 ? 'half' : ''} ${urls.length === 3 && idx === 0 ? 'full-row' : ''}" onclick="openPostImageViewer('${post.id}', ${idx})">
                <img src="${url}" alt="Ảnh ${idx + 1}" loading="lazy">
                ${isLast ? `<div class="comm-gallery-more">+${remaining}</div>` : ''}
            </div>
        `;
    }).join('');

    // Lưu data URLs vào attribute để viewer lấy
    const dataUrls = encodeURIComponent(JSON.stringify(urls));
    return `<div class="comm-post-gallery count-${Math.min(urls.length, maxShow)}" data-urls="${dataUrls}">${gridItems}</div>`;
}

/**
 * Mở viewer xem ảnh bài post (fullscreen)
 * @param {string} postId - ID bài viết
 * @param {number} startIndex - Vị trí ảnh bắt đầu xem
 */
function openPostImageViewer(postId, startIndex = 0) {
    // Tìm gallery element gần nhất chứa data-urls
    const galleries = document.querySelectorAll('.comm-post-gallery');
    let urls = [];
    for (const g of galleries) {
        try {
            const parsed = JSON.parse(decodeURIComponent(g.dataset.urls));
            // Tìm gallery thuộc post đúng
            if (g.closest(`#post-${postId}`) || g.closest('.comm-post-card')) {
                urls = parsed;
                break;
            }
        } catch(e) {}
    }

    // Fallback: lấy từ ảnh đơn
    if (urls.length === 0) {
        const singleImg = document.querySelector(`#post-${postId} .comm-post-image`);
        if (singleImg) urls = [singleImg.src];
    }

    if (urls.length === 0) return;

    // Tạo viewer overlay
    let viewer = document.getElementById('postImageViewer');
    if (!viewer) {
        viewer = document.createElement('div');
        viewer.id = 'postImageViewer';
        viewer.className = 'post-image-viewer-overlay';
        document.body.appendChild(viewer);
    }

    let currentIdx = startIndex;

    function renderViewer() {
        viewer.innerHTML = `
            <div class="post-image-viewer-content">
                <button class="post-viewer-close" onclick="document.getElementById('postImageViewer').remove()">&times;</button>
                <span class="post-viewer-counter">${currentIdx + 1} / ${urls.length}</span>
                ${urls.length > 1 ? `<button class="post-viewer-prev" onclick="navigatePostViewer(-1)"><i class="fas fa-chevron-left"></i></button>` : ''}
                <img src="${urls[currentIdx]}" alt="Ảnh ${currentIdx + 1}">
                ${urls.length > 1 ? `<button class="post-viewer-next" onclick="navigatePostViewer(1)"><i class="fas fa-chevron-right"></i></button>` : ''}
            </div>
        `;
        viewer.style.display = 'flex';
        viewer.onclick = (e) => { if (e.target === viewer) viewer.remove(); };
    }

    window.navigatePostViewer = function(dir) {
        currentIdx = (currentIdx + dir + urls.length) % urls.length;
        renderViewer();
    };

    renderViewer();
}

/**
 * Render top 10 phim hot nhất vào widget sidebar
 * Sắp xếp theo views từ allMovies cache
 */
function loadTrendingMovies() {
    const container = document.getElementById('commTrendingMovies');
    if (!container) return;

    if (typeof allMovies === 'undefined' || !allMovies || allMovies.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size: 0.85rem; padding: 5px;">Đang tải...</p>';
        // Thử lại sau 2s khi allMovies chưa load
        setTimeout(loadTrendingMovies, 2000);
        return;
    }

    // Sort theo views giảm dần, lấy top 10
    const topMovies = [...allMovies]
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 10);

    if (topMovies.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size: 0.85rem;">Chưa có dữ liệu phim</p>';
        return;
    }

    // Format số lượt xem
    const formatViews = (v) => {
        if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
        if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
        return v || 0;
    };

    container.innerHTML = topMovies.map((m, idx) => {
        const poster = m.posterUrl || m.poster_url || m.poster || '';
        const title = m.title || 'Không rõ';
        const views = formatViews(m.views);
        const rating = m.rating || '—';
        const rank = idx + 1;
        const rankClass = rank <= 3 ? 'hot-rank-top' : '';

        return `
            <div class="comm-trending-movie" onclick="if(typeof viewMovieDetail==='function') viewMovieDetail('${m.id}')">
                <span class="comm-trending-rank ${rankClass}">${rank}</span>
                <img class="comm-trending-poster" src="${poster}" alt="${title}" onerror="this.src='https://via.placeholder.com/40x56/1a1a2e/666?text=🎬'" loading="lazy">
                <div class="comm-trending-info">
                    <span class="comm-trending-title">${escapeHtml(title)}</span>
                    <span class="comm-trending-meta">
                        <i class="fas fa-eye"></i> ${views}
                        <i class="fas fa-star" style="color: #f5c518; margin-left: 6px;"></i> ${rating}
                    </span>
                </div>
            </div>`;
    }).join('');
}

// Biến lưu tab feed hiện tại
let currentFeedTab = 'all';

/**
 * Chuyển tab feed (Tất cả / Đang theo dõi / Thịnh hành)
 */
function switchFeedTab(tabName, btnEl) {
    currentFeedTab = tabName;

    // Cập nhật active tab
    const tabs = document.querySelectorAll('.comm-feed-tabs .comm-tab');
    tabs.forEach(t => t.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    // Fetch bài viết theo tab
    fetchPosts();
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
        let query = supabase
            .from('community_posts')
            .select(`
                id, content, media_url, media_urls, movie_id, likes_count, comments_count, shares_count, created_at,
                profiles:user_id ( id, display_name, avatar, role )
            `);

        // === TAB: ĐANG THEO DÕI ===
        if (currentFeedTab === 'following' && currentUser) {
            // Lấy danh sách user_id mà mình đang follow
            const { data: follows } = await supabase
                .from('community_follows')
                .select('following_id')
                .eq('follower_id', currentUser.id);

            const followingIds = (follows || []).map(f => f.following_id);

            if (followingIds.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                        <i class="fas fa-user-friends" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                        <p>Bạn chưa theo dõi ai. Hãy theo dõi người khác để xem bài viết ở đây!</p>
                    </div>`;
                return;
            }

            query = query.in('user_id', followingIds);
        } else if (currentFeedTab === 'following' && !currentUser) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                    <i class="fas fa-sign-in-alt" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                    <p>Vui lòng đăng nhập để xem bài viết từ người theo dõi!</p>
                </div>`;
            return;
        }

        // === TAB: THỊNH HÀNH === (bài trong 7 ngày gần nhất, sort theo likes + comments)
        if (currentFeedTab === 'trending') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            query = query.gte('created_at', sevenDaysAgo.toISOString());
        }

        // Sắp xếp theo tab
        if (currentFeedTab === 'trending') {
            query = query.order('likes_count', { ascending: false }).limit(20);
        } else {
            query = query.order('created_at', { ascending: false }).limit(20);
        }

        const { data, error } = await query;

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
            const emptyMessages = {
                'all': 'Chưa có bài viết nào. Hãy là người đầu tiên khơi mào!',
                'following': 'Chưa có bài viết nào từ người bạn theo dõi.',
                'trending': 'Chưa có bài viết thịnh hành trong 7 ngày qua.'
            };
            container.innerHTML = `<p class="text-center text-muted" style="padding: 20px;">${emptyMessages[currentFeedTab] || emptyMessages.all}</p>`;
            return;
        }

        container.innerHTML = data.map(post => {
            const user = post.profiles || {};
            // Tra cứu phim từ allMovies global thay vì join Supabase
            let movieData = null;
            if (post.movie_id && typeof allMovies !== 'undefined' && allMovies) {
                movieData = allMovies.find(m => m.id === post.movie_id) || null;
            }
            const name = user.display_name || "Nhà báo vô danh";
            const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
            const timeAgo = formatTimeAgo(new Date(post.created_at));
            const isLiked = userLikes.includes(post.id);
            const isOwner = currentUser && (currentUser.id === user.id || currentUser.role === 'admin');

            // Render thẻ phim nếu có movie_id (dùng hàm helper)
            const movieRefHtml = buildMovieRefHtml(movieData);
            
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
                    ${post.content ? `<div class="comm-post-content" id="post-content-${post.id}">${escapeHtml(post.content)}</div>` : ''}
                    ${renderPostGallery(post)}
                    ${movieRefHtml}
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
    // Cho phép đăng bài nếu có text HOẶC ảnh HOẶC phim
    if (!content && postSelectedImages.length === 0 && !postSelectedMovieId) {
        showNotification("Vui lòng nhập nội dung hoặc chọn ảnh/phim", "warning");
        return;
    }
    
    if (!currentUser) {
        showNotification("Vui lòng đăng nhập để đăng bài", "warning");
        openAuthModal();
        return;
    }
    
    try {
        const btn = document.querySelector(".comm-btn-post");
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        let uploadedUrls = [];

        // 1. Upload ảnh lên Cloudflare R2 TRƯỚC (nếu có)
        if (postSelectedImages.length > 0) {
            const userName = currentUser.display_name || currentUser.displayName || 'user';
            const shortId = Date.now();

            for (let i = 0; i < postSelectedImages.length; i++) {
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Tải ảnh ${i + 1}/${postSelectedImages.length}...`;
                const url = await uploadPostImageToR2(postSelectedImages[i], shortId, userName, i + 1);
                if (url) uploadedUrls.push(url);
            }

            if (uploadedUrls.length === 0 && postSelectedImages.length > 0) {
                showNotification("Lỗi upload ảnh, thử lại sau!", "error");
                return;
            }
        }

        // 2. Tạo dữ liệu bài viết (đã có URLs ảnh)
        const postData = {
            user_id: currentUser.id,
            content: content || null
        };
        if (postSelectedMovieId) postData.movie_id = postSelectedMovieId;
        if (uploadedUrls.length > 0) {
            postData.media_url = uploadedUrls[0]; // Tương thích ngược
            postData.media_urls = uploadedUrls;    // Mảng đầy đủ
        }

        // 3. INSERT 1 lần duy nhất (tránh bị RLS chặn UPDATE)
        const { error } = await supabase
            .from('community_posts')
            .insert(postData);

        if (error) throw error;

        showNotification("Đã đăng bài thành công!", "success");
        input.value = "";
        
        // Reset preview ảnh và thẻ phim
        removePostImage(); // Xóa hết ảnh preview
        removePostMovie();
        
        // Gửi notification cho followers và bạn bè
        notifyFollowersAndFriends(content || '📷 Đã chia sẻ ảnh mới');
        
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

/**
 * Chuyển chuỗi tiếng Việt có dấu thành không dấu, thay khoảng trắng + ký tự đặc biệt bằng _
 * @param {string} str - Chuỗi cần chuyển
 * @returns {string} Chuỗi không dấu, lowercase, nối bằng _
 */
function removeVietnameseDiacritics(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/**
 * Upload ảnh bài đăng lên Cloudflare R2
 * Folder: community-posts/{shortId}_{userName_no_dau}
 * Filename: {imageIndex}_{tên gốc file}
 * @param {File} file - File ảnh cần upload
 * @param {number} shortId - ID ngắn (Date.now) để đặt tên folder
 * @param {string} userName - Tên user hiển thị
 * @param {number} imageIndex - Thứ tự ảnh trong bài (1, 2, 3...)
 * @returns {string|null} - URL ảnh đã upload hoặc null nếu lỗi
 */
async function uploadPostImageToR2(file, shortId, userName, imageIndex = 1) {
    try {
        // Nén ảnh trước khi upload
        const compressedBlob = await compressImage(file, 1200, 0.85);
        
        // Xây dựng folder và filename theo cấu trúc mới
        const userSlug = removeVietnameseDiacritics(userName);
        const folder = `community-posts/${shortId}_${userSlug}`;
        const originalName = file.name || 'post_image.jpg';
        const customFilename = `${imageIndex}_${originalName}`;

        const formData = new FormData();
        formData.append('file', compressedBlob, customFilename);
        formData.append('folder', folder);
        formData.append('customFilename', customFilename);

        const response = await fetch(`${R2_WORKER_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Upload ảnh bài đăng R2 OK: ${data.url}`);
        return data.url;
    } catch (e) {
        console.error('Lỗi upload ảnh bài đăng R2:', e);
        return null;
    }
}

/**
 * Xử lý khi chọn ảnh từ input file để đăng bài
 */
function handlePostImageSelect(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showNotification(`"${file.name}" không phải ảnh, đã bỏ qua.`, 'warning');
            continue;
        }
        if (file.size > 10 * 1024 * 1024) {
            showNotification(`"${file.name}" quá lớn (>10MB), đã bỏ qua.`, 'warning');
            continue;
        }
        if (postSelectedImages.length >= MAX_POST_IMAGES) {
            showNotification(`Tối đa ${MAX_POST_IMAGES} ảnh mỗi bài!`, 'warning');
            break;
        }
        postSelectedImages.push(file);
    }

    renderPostImagePreview();
    event.target.value = '';
}

/**
 * Render grid preview ảnh đã chọn trong composer
 */
function renderPostImagePreview() {
    const container = document.getElementById('commPostImagePreview');
    const grid = document.getElementById('commPreviewGrid');
    const counter = document.getElementById('commPreviewCount');
    if (!container || !grid) return;

    if (postSelectedImages.length === 0) {
        container.style.display = 'none';
        grid.innerHTML = '';
        return;
    }

    container.style.display = 'block';
    if (counter) counter.textContent = `${postSelectedImages.length}/${MAX_POST_IMAGES} ảnh`;

    grid.innerHTML = postSelectedImages.map((file, idx) => {
        const url = URL.createObjectURL(file);
        return `
            <div class="comm-preview-item">
                <img src="${url}" alt="Preview ${idx + 1}">
                <button class="comm-preview-remove-item" onclick="removePostImage(${idx})" title="Xóa ảnh này">&times;</button>
                <span class="comm-preview-index">${idx + 1}</span>
            </div>
        `;
    }).join('');
}

/**
 * Xóa ảnh preview trong composer
 * @param {number|undefined} index - Nếu truyền index, xóa ảnh tại vị trí đó. Nếu không, xóa hết.
 */
function removePostImage(index) {
    if (typeof index === 'number') {
        postSelectedImages.splice(index, 1);
    } else {
        postSelectedImages = [];
    }
    renderPostImagePreview();
}

/**
 * Mở/đóng dropdown tìm kiếm phim
 */
function toggleMovieSearchDropdown(forceState) {
    const dropdown = document.getElementById('commMovieSearchDropdown');
    if (!dropdown) return;

    const isVisible = dropdown.style.display !== 'none';
    const shouldShow = forceState !== undefined ? forceState : !isVisible;

    dropdown.style.display = shouldShow ? 'flex' : 'none';

    if (shouldShow) {
        const searchInput = document.getElementById('commMovieSearchInput');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        // Hiện top 10 phim mặc định
        searchMovieForPost('');
    }
}

/**
 * Tìm kiếm phim trong allMovies để gắn thẻ vào bài viết
 */
function searchMovieForPost(query) {
    const container = document.getElementById('commMovieSearchResults');
    if (!container) return;

    if (typeof allMovies === 'undefined' || !allMovies || allMovies.length === 0) {
        container.innerHTML = '<p class="text-muted" style="padding: 15px; font-size: 0.85rem; text-align: center;">Chưa có dữ liệu phim.</p>';
        return;
    }

    const q = query.toLowerCase().trim();
    let results;
    if (!q) {
        // Hiện 10 phim mới nhất
        results = allMovies.slice(0, 10);
    } else {
        results = allMovies.filter(m => 
            (m.title || '').toLowerCase().includes(q) ||
            (m.originTitle || m.origin_title || '').toLowerCase().includes(q)
        ).slice(0, 15);
    }

    if (results.length === 0) {
        container.innerHTML = '<p class="text-muted" style="padding: 15px; font-size: 0.85rem; text-align: center;">Không tìm thấy phim nào.</p>';
        return;
    }

    container.innerHTML = results.map(m => {
        const poster = m.posterUrl || m.poster_url || '';
        const year = m.year || '';
        const category = m.category || '';
        const meta = [year, category].filter(Boolean).join(' • ');
        return `
            <div class="comm-movie-search-item" onclick="selectMovieForPost('${m.id}')">
                <img src="${poster || 'https://via.placeholder.com/32x44/1a1a2e/666?text=🎬'}" alt="" onerror="this.src='https://via.placeholder.com/32x44/1a1a2e/666?text=🎬'">
                <div class="comm-movie-search-item-info">
                    <span class="movie-title">${escapeHtml(m.title)}</span>
                    ${meta ? `<span class="movie-meta">${escapeHtml(meta)}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Chọn phim để gắn thẻ vào bài viết
 */
function selectMovieForPost(movieId) {
    if (typeof allMovies === 'undefined') return;
    const movie = allMovies.find(m => m.id === movieId);
    if (!movie) return;

    postSelectedMovieId = movieId;

    // Render thẻ phim trong composer
    const tagContainer = document.getElementById('commPostMovieTag');
    const tagContent = document.getElementById('commMovieTagContent');
    if (tagContainer && tagContent) {
        const poster = movie.posterUrl || movie.poster_url || '';
        const year = movie.year || '';
        const category = movie.category || '';
        const meta = [year, category].filter(Boolean).join(' • ');
        
        tagContent.innerHTML = `
            <img src="${poster || 'https://via.placeholder.com/36x50/1a1a2e/666?text=🎬'}" alt="" onerror="this.src='https://via.placeholder.com/36x50/1a1a2e/666?text=🎬'">
            <div class="comm-movie-tag-info">
                <span class="tag-title">${escapeHtml(movie.title)}</span>
                ${meta ? `<span class="tag-meta">🎬 ${escapeHtml(meta)}</span>` : ''}
            </div>
        `;
        tagContainer.style.display = 'flex';
    }

    // Đóng dropdown
    toggleMovieSearchDropdown(false);
}

/**
 * Xóa thẻ phim đã chọn trong composer
 */
function removePostMovie() {
    postSelectedMovieId = null;
    const tagContainer = document.getElementById('commPostMovieTag');
    if (tagContainer) tagContainer.style.display = 'none';
}

/**
 * Gửi notification cho tất cả followers và bạn bè khi đăng bài mới
 * @param {string} postContent - Nội dung bài đăng (preview)
 */
async function notifyFollowersAndFriends(postContent) {
    if (!currentUser || !supabase || typeof sendNotification !== 'function') return;
    
    try {
        const posterName = currentUser.displayName || currentUser.display_name || 'Người dùng';
        const preview = postContent.length > 60 ? postContent.substring(0, 57) + '...' : postContent;
        const isAdminPoster = currentUser.role === 'admin';
        
        const recipientIds = new Set();
        
        if (isAdminPoster) {
            // Admin: gửi cho TẤT CẢ users
            const { data: allProfiles } = await supabase
                .from('profiles')
                .select('id');
            if (allProfiles) {
                allProfiles.forEach(p => recipientIds.add(p.id));
            }
        } else {
            // User thường: chỉ gửi cho followers + bạn bè
            const { data: followers } = await supabase
                .from('community_follows')
                .select('follower_id')
                .eq('following_id', currentUser.id);
            
            const { data: friends } = await supabase
                .from('community_friends')
                .select('user_id, friend_id')
                .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
                .eq('status', 'accepted');
            
            if (followers) {
                followers.forEach(f => recipientIds.add(f.follower_id));
            }
            if (friends) {
                friends.forEach(f => {
                    const friendId = f.user_id === currentUser.id ? f.friend_id : f.user_id;
                    recipientIds.add(friendId);
                });
            }
        }
        
        // Gửi notification (loại bỏ chính mình)
        const notifs = [];
        for (const uid of recipientIds) {
            if (uid === currentUser.id && !isAdminPoster) continue; // Admin vẫn nhận notif chính mình
            
            notifs.push({
                user_id: uid,
                is_for_admin: false,
                title: `📝 ${posterName} đã đăng bài mới`,
                message: preview,
                type: 'community_post',
                is_read: false
            });
        }
        
        if (notifs.length > 0) {
            await supabase.from('notifications').insert(notifs);
            console.log(`🔔 Đã gửi notification bài đăng cho ${notifs.length} người ${isAdminPoster ? '(Admin)' : ''}`);
            // Cập nhật UI ngay cho chính người đăng
            if (typeof loadInitialNotifications === 'function') {
                loadInitialNotifications(currentUser.id, typeof isAdmin !== 'undefined' && isAdmin);
            }
        }
    } catch (e) {
        console.warn('Lỗi gửi notification bài đăng:', e);
    }
}

// Hàm format thời gian giống MXH
function formatTimeAgo(date) {
    const diff = new Date() - date;
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 30) return "vừa xong";
    
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
    if (communityPresenceChannel) return; // Prevent multiple initializations
    
    // Bắt đầu bộ đếm làm mới trạng thái realtime
    if (typeof startStatusRefresh === 'function') startStatusRefresh();

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
                userPresenceMap.set(String(id).trim(), { online: true });
            }
            
            // Cập nhật UI nếu đang ở trang cá nhân hoặc chat
            refreshPresenceUI();
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            userPresenceMap.set(String(key), { online: true });
            refreshPresenceUI();
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            // Anti-flicker: check if the user is truly out of presence state
            const newState = communityPresenceChannel.presenceState();
            if (!newState[key] || newState[key].length === 0) {
                userPresenceMap.set(String(key), { online: false, last_seen: new Date().toISOString() });
            }
            refreshPresenceUI();
        })
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (typeof handleTypingEvent === 'function') {
                handleTypingEvent(payload.payload);
            }
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

// Xử lý sự kiện khi có người đang nhập tin nhắn
function handleTypingEvent({ sender_id, receiver_id, is_typing }) {
    if (!currentUser || receiver_id !== currentUser.id || sender_id !== currentChatUserId) return;
    
    const indicator = document.getElementById('commTypingIndicator');
    if (!indicator) return;

    if (is_typing) {
        indicator.style.display = 'flex';
        scrollToBottomChat();
        
        clearTimeout(hideTypingIndicatorTimeout);
        hideTypingIndicatorTimeout = setTimeout(() => {
            indicator.style.display = 'none';
        }, 1500); // Rút ngắn còn 1.5s để tắt liền nếu lỡ bị rớt mạng
    } else {
        indicator.style.display = 'none';
        clearTimeout(hideTypingIndicatorTimeout);
    }
}

// Gọi hàm này từ main.js hoặc auth.js ngay khi đăng nhập thành công
window.initGlobalCommunityPresence = function() {
    if (!currentUser) return;
    initPresence();
    startHeartbeat();
};

// Cập nhật database last_seen mỗi khi hoạt động
let heartbeatCommunityInterval = null;
function startHeartbeat() {
    if (!currentUser) return;
    
    // Cập nhật ngay khi vào
    updateLastSeen();
    
    // Chạy định kỳ mỗi 30 giây để đảm bảo luôn Online khi treo máy
    if (heartbeatCommunityInterval) clearInterval(heartbeatCommunityInterval);
    heartbeatCommunityInterval = setInterval(updateLastSeen, 30 * 1000);
}

async function updateLastSeen() {
    if (!currentUser) return;
    try {
        await supabase
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', currentUser.id);
    } catch (e) {
        console.error("Lỗi cập nhật last_seen:", e);
    }
}
let statusRefreshInterval = null;

function startStatusRefresh() {
    if (statusRefreshInterval) clearInterval(statusRefreshInterval);
    statusRefreshInterval = setInterval(() => {
        refreshPresenceUI();
    }, 2000);
}

function refreshPresenceUI() {
    // 1. Cập nhật trong danh sách chat (CineChat)
    const chatItems = document.querySelectorAll('.comm-chat-item');
    chatItems.forEach(item => {
        const userId = item.getAttribute('data-user-id')?.trim();
        if (userId) {
            const indicator = item.querySelector('.comm-online-indicator');
            const statusText = item.querySelector('.comm-chat-item-status'); 
            const presence = userPresenceMap.get(userId);
            
            let isOnline = false;
            let forceLastSeen = null;

            if (presence) {
                if (presence.online) {
                    isOnline = true;
                } else {
                    isOnline = false;
                    forceLastSeen = presence.last_seen;
                }
            } else {
                const lastSeenStr = item.getAttribute('data-last-seen') || statusText?.getAttribute('data-last-seen');
                if (lastSeenStr && (new Date() - new Date(lastSeenStr) < 80000)) {
                    isOnline = true;
                }
            }

            // 1. Cập nhật chấm xanh trên avatar
            if (indicator) {
                indicator.style.backgroundColor = isOnline ? '#4caf50' : '#888';
            }
            
            // 2. Cập nhật văn bản trạng thái (Đảm bảo LUÔN cập nhật để tránh treo chữ "Đang hoạt động" ảo)
            if (statusText) {
                if (isOnline) {
                    statusText.innerHTML = ''; 
                    if (presence?.last_seen) {
                        statusText.setAttribute('data-last-seen', presence.last_seen);
                    }
                } else {
                    statusText.innerHTML = ''; // Xóa bỏ văn bản "Truy cập..." theo yêu cầu
                    if (forceLastSeen) {
                        statusText.setAttribute('data-last-seen', forceLastSeen);
                    } else {
                        const existingLastSeen = statusText.getAttribute('data-last-seen');
                        // Vẫn giữ attribute để logic JS hoạt động ngầm nhưng không hiện text
                    }
                }
            }
        }
    });

    // 2. Cập nhật chấm online trong danh sách bạn bè (Friends view)
    const friendCards = document.querySelectorAll('.comm-friend-card[data-friend-id]');
    friendCards.forEach(card => {
        const friendId = card.getAttribute('data-friend-id')?.trim();
        if (!friendId) return;
        const dot = card.querySelector('.comm-friend-online-dot');
        const roleEl = card.querySelector('.comm-friend-role');
        const presence = userPresenceMap.get(friendId);
        const isOnline = presence?.online === true;

        if (dot) {
            dot.classList.toggle('online', isOnline);
            dot.classList.toggle('offline', !isOnline);
        }
        if (roleEl) {
            roleEl.innerHTML = isOnline
                ? '<i class="fas fa-user-check" style="font-size:0.6em;"></i> <span style="color:#4caf50;">Đang hoạt động</span>'
                : '<i class="fas fa-user-check" style="font-size:0.6em;"></i> Bạn bè';
        }
    });

    // 3. Cập nhật trong hội thoại đang mở
    if (currentChatTarget) {
        const headerStatus = document.getElementById('commChatTargetStatus');
        const infoStatus = document.getElementById('commInfoStatus');
        const targetId = String(currentChatTarget.id);
        const presence = userPresenceMap.get(targetId);
        
        let isOnline = false;
        let forceLastSeen = null;

        if (presence) {
            if (presence.online) isOnline = true;
            else {
                isOnline = false;
                forceLastSeen = presence.last_seen;
            }
        } else {
            const lastSeenStr = (headerStatus || infoStatus)?.getAttribute('data-last-seen');
            if (lastSeenStr && (new Date() - new Date(lastSeenStr) < 80000)) {
                isOnline = true;
            }
        }

        if (isOnline) {
            const onlineHTML = '<span style="color: #4caf50;"><i class="fas fa-circle" style="font-size: 8px;"></i> Đang hoạt động</span>';
            if (headerStatus) {
                headerStatus.innerHTML = onlineHTML;
                headerStatus.classList.remove('comm-last-seen-realtime');
            }
            if (infoStatus) {
                infoStatus.innerHTML = onlineHTML;
                infoStatus.classList.remove('comm-last-seen-realtime');
            }
        } else {
            const setOffline = (el) => {
                if (!el) return;
                if (forceLastSeen) {
                    el.innerHTML = `Truy cập ${formatTimeAgo(new Date(forceLastSeen))}`;
                    el.setAttribute('data-last-seen', forceLastSeen);
                    el.classList.add('comm-last-seen-realtime');
                } else {
                    fetchUserLastSeen(targetId, el);
                }
            };
            setOffline(headerStatus);
            setOffline(infoStatus);
        }
    }
}

async function fetchUserLastSeen(userId, element) {
    if (!element) return; // Bảo vệ nếu element bị null
    try {
        const { data } = await supabase
            .from('profiles')
            .select('last_seen')
            .eq('id', userId)
            .single();
        
        // RACE CONDITION PROTECT: Nếu đang cập nhật Header/Info, phải kiểm tra xem có còn đúng người đó không
        if (element.id === 'commChatTargetStatus' || element.id === 'commInfoStatus') {
            if (String(currentChatTarget?.id) !== String(userId)) return;
        }
        
        if (data && data.last_seen) {
            element.setAttribute('data-last-seen', data.last_seen);
            element.classList.add('comm-last-seen-realtime');
            element.innerHTML = `Truy cập ${formatTimeAgo(new Date(data.last_seen))}`;
            element.style.color = 'var(--text-muted)';
        } else {
            element.innerHTML = 'Ngoại tuyến';
            element.style.color = 'var(--text-muted)';
        }
    } catch (e) {
        if (element) {
            element.innerHTML = 'Ngoại tuyến';
            element.style.color = 'var(--text-muted)';
        }
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

/**
 * Hàm nén ảnh phía client bằng Canvas
 * @param {File} file - File ảnh gốc
 * @param {number} maxWidth - Chiều rộng tối đa (mặc định 1200)
 * @param {number} quality - Độ nén (0.1 - 1.0)
 */
function compressImage(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Tính toán kích thước mới
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Xuất ra dạng blob để upload
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
        };
    });
}

/**
 * Upload ảnh lên ImgBB
 * @param {Blob} blob - Ảnh đã nén
 */
async function uploadToImgBB(blob) {
    const formData = new FormData();
    formData.append('image', blob);
    formData.append('key', IMGBB_API_KEY);

    try {
        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.success) {
            return result.data.url;
        } else {
            throw new Error(result.error.message || 'Lỗi upload ImgBB');
        }
    } catch (error) {
        console.error('Lỗi upload ảnh:', error);
        throw error;
    }
}

/**
 * Xử lý khi người dùng chọn nhiều ảnh hoặc dán ảnh - Hiển thị Preview Grid
 * @param {Event|File[]} input - Có thể là event từ input file hoặc mảng File[]
 */
async function handleImageSelect(input) {
    let files = [];
    if (input instanceof Event) {
        files = Array.from(input.target.files);
        input.target.value = ''; // Reset input file
    } else if (Array.isArray(input)) {
        files = input;
    }

    if (files.length === 0) return;
    
    try {
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            
            // 1. Nén ảnh
            const blob = await compressImage(file);
            const previewUrl = URL.createObjectURL(blob);
            
            // 2. Thêm vào mảng tạm
            pendingImages.push({ blob, previewUrl });
        }
        
        // 3. Render danh sách preview
        renderImagePreviewList();
        
    } catch (error) {
        showNotification("Xử lý ảnh thất bại: " + error.message, "error");
    }
}

/**
 * Render danh sách ảnh trong khung preview
 */
function renderImagePreviewList() {
    const container = document.getElementById('commImagePreviewContainer');
    const listEl = document.getElementById('commPreviewList');
    const countEl = document.getElementById('commPreviewCount');

    if (!container || !listEl) return;

    if (pendingImages.length === 0) {
        container.style.display = 'none';
        return;
    }

    listEl.innerHTML = pendingImages.map((img, index) => `
        <div class="comm-preview-item">
            <img src="${img.previewUrl}" alt="Preview ${index}">
            <button class="remove-btn" onclick="removeSelectedImage(${index})"><i class="fas fa-times"></i></button>
        </div>
    `).join('');

    countEl.innerText = pendingImages.length;
    container.style.display = 'flex';
    scrollToBottomChat();
}

/**
 * Xóa một ảnh khỏi danh sách chờ
 */
function removeSelectedImage(index) {
    const img = pendingImages[index];
    if (img && img.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(img.previewUrl);
    }
    pendingImages.splice(index, 1);
    renderImagePreviewList();
}

/**
 * Hủy toàn bộ danh sách xem trước
 */
function cancelImagePreview() {
    pendingImages.forEach(img => {
        if (img.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(img.previewUrl);
        }
    });
    pendingImages = [];
    const container = document.getElementById('commImagePreviewContainer');
    if (container) container.style.display = 'none';
}

/**
 * Xác nhận gửi tất cả ảnh trong danh sách
 */
async function confirmSendImage() {
    if (pendingImages.length === 0) return;

    const btn = document.getElementById('btnConfirmSendImage');
    const originalText = btn.innerText;
    btn.disabled = true;
    
    const total = pendingImages.length;
    let successCount = 0;

    // showNotification(`Đang tải lên ${total} ảnh...`, "info");

    try {
        // Gửi tuần tự để tránh quá tải API và đảm bảo thứ tự
        for (let i = 0; i < pendingImages.length; i++) {
            const imgObj = pendingImages[i];
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> (${i+1}/${total})`;
            
            try {
                // 1. Upload lên ImgBB
                const imageUrl = await uploadToImgBB(imgObj.blob);
                
                // 2. Gửi tin nhắn
                await sendImageMessage(imageUrl);
                successCount++;
            } catch (err) {
                console.error(`Lỗi gửi ảnh thứ ${i+1}:`, err);
            }
        }
        
        // 3. Đóng preview
        cancelImagePreview();
        
        if (successCount === total) {
            showNotification(`Đã gửi thành công ${total} ảnh!`, "success");
        } else {
            showNotification(`Đã gửi ${successCount}/${total} ảnh. Một số ảnh bị lỗi.`, "warning");
        }
        
    } catch (error) {
        showNotification("Lỗi hệ thống khi gửi ảnh!", "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }
}

/**
 * Gửi tin nhắn chứa ảnh
 */
async function sendImageMessage(imageUrl) {
    let content = `[IMAGE]${imageUrl}`;

    // [MỚI] Kiểm tra người kia có chặn mình không để gắn nhãn
    const theyBlockedMe = currentChatBlocks.some(b => b.user_id === currentChatUserId);
    if (theyBlockedMe) {
        content = `[BLOCKED_MSG] ${content}`;
    }

    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Giả lập tempId để UI mượt
    const tempId = 'temp-img-' + Date.now();
    const container = document.getElementById("commChatMessages");
    if (container) {
        if(container.innerHTML.includes("Hãy gửi lời chào đầu tiên!")) container.innerHTML = "";
        container.insertAdjacentHTML('beforeend', `
            <div class="comm-msg sent" style="opacity: 0.7;" id="${tempId}">
                <div class="comm-msg-body-wrapper">
                    <div class="comm-msg-bubble">${parseMessageContent(content)}</div>
                    <div class="comm-msg-actions-quick">
                        <button title="Trả lời"><i class="fas fa-quote-left"></i></button>
                        <button title="Chia sẻ"><i class="fas fa-share"></i></button>
                        <button class="btn-more"><i class="fas fa-ellipsis-h"></i></button>
                    </div>
                </div>
                <div class="comm-msg-time">${time} <i class="fas fa-clock" style="font-size: 0.75rem; margin-left: 5px; color: var(--text-muted);" title="Đang gửi..."></i></div>
            </div>
        `);
        scrollToBottomChat();
    }

    try {
        const isTargetOnline = userPresenceMap.get(currentChatUserId)?.online;
        const { data, error } = await supabase
            .from('community_messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: currentChatUserId,
                content: content,
                status: isTargetOnline ? 'delivered' : 'sent'
            })
            .select()
            .single();

        if (error) throw error;
        
        // Cập nhật ID thật và gắn đầy đủ các nút hành động
        const msgEl = document.getElementById(tempId);
        if (msgEl) {
            msgEl.id = `msg-${data.id}`;
            msgEl.style.opacity = "1";

            // Thay thế bộ nút tạm bằng bộ nút thật có onclick
            const actionsQuick = msgEl.querySelector('.comm-msg-actions-quick');
            if (actionsQuick) {
                actionsQuick.innerHTML = `
                    <button onclick="prepareReply('${data.id}')" title="Trả lời"><i class="fas fa-quote-left"></i></button>
                    <button onclick="shareMsg('${data.id}')" title="Chia sẻ"><i class="fas fa-share"></i></button>
                    <button class="btn-more" onclick="toggleMsgDropdown(event, '${data.id}')" title="Thêm"><i class="fas fa-ellipsis-h"></i></button>
                    
                    <div class="comm-msg-dropdown" id="dropdown-msg-${data.id}">
                        <div class="comm-dropdown-item" onclick="copyMsgText('${data.id}')"><i class="far fa-copy"></i> Copy tin nhắn</div>
                        ${data.content && data.content.startsWith('[IMAGE]') ? `<div class="comm-dropdown-item download-direct" onclick="downloadImage('${data.content.replace('[IMAGE]', '').trim()}')"><i class="fas fa-download"></i> Tải xuống ảnh</div>` : ''}
                        <div class="comm-dropdown-item" onclick="togglePinMsg('${data.id}')"><i class="fas fa-thumbtack"></i> Ghim / Bỏ ghim</div>
                        <div class="comm-dropdown-item"><i class="far fa-star"></i> Đánh dấu tin nhắn</div>
                        <div class="comm-dropdown-divider"></div>
                        <div class="comm-dropdown-item recall" onclick="recallMsg('${data.id}')"><i class="fas fa-undo"></i> Thu hồi</div>
                        <div class="comm-dropdown-item delete" onclick="deleteMsgForMe('${data.id}')"><i class="far fa-trash-alt"></i> Xóa chỉ ở phía tôi</div>
                    </div>
                `;
            }

            const timeEl = msgEl.querySelector('.comm-msg-time');
            if (timeEl) {
                const timeStr = new Date(data.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const statusHtml = data.status === 'delivered' 
                    ? `<div class="comm-msg-status delivered">Đã nhận <i class="fas fa-check-double"></i></div>`
                    : `<div class="comm-msg-status sent">Đã gửi <i class="fas fa-check"></i></div>`;
                timeEl.innerHTML = `${timeStr} ${statusHtml}`;
            }
        }
    } catch (e) {
        console.error("Lỗi gửi ảnh lên DB:", e);
        const msgEl = document.getElementById(tempId);
        if (msgEl) msgEl.remove();
        showNotification("Lỗi gửi ảnh!", "error");
    }
}

// Parse nội dung tin nhắn: xử lý [STICKER]url và [REPLY:id:name:text] nội_dung
function parseMessageContent(content) {
    if (content === null || content === undefined) return "";
    let str = String(content);

    // Chuẩn hóa hiển thị cho tin nhắn đã thu hồi
    if (str === '[TIN NHẮN ĐÃ THU HỒI]' || str === 'Tin nhắn đã được thu hồi' || str === 'Tin nhắn đã thu hồi') {
        return 'Tin nhắn đã thu hồi';
    }

    // Biến để lưu nhãn chặn nếu có
    let blockedLabelHtml = "";
    if (str.startsWith("[BLOCKED_MSG]")) {
        str = str.replace("[BLOCKED_MSG]", "").trim();
        blockedLabelHtml = `<span class="comm-msg-blocked-label"><i class="fas fa-history"></i> Gửi lúc bị chặn</span>`;
    }

    // Pattern 1: [STICKER]http://...
    const stickerMatch = str.match(/^\[STICKER\](.+)$/);
    if (stickerMatch) {
        const url = stickerMatch[1].trim();
        if (url.includes('images/stickers/')) {
            // Hợp lệ
        } else if (url.includes('popcorn_1.png') || url.includes('127.0.0.1:5501') || url.includes('githubusercontent.com')) {
            return '<span style="font-style:italic; color:var(--text-muted); font-size:0.8rem;">(Sticker không tồn tại)</span>' + blockedLabelHtml;
        }
        return `<img src="${escapeHtml(url)}" class="comm-msg-sticker" alt="sticker" 
                     style="max-width:120px;max-height:120px;border-radius:8px;display:block;" 
                     onerror="this.style.display='none';">` + blockedLabelHtml;
    }

    // Pattern 2: [IMAGE]url
    const imageMatch = str.match(/^\[IMAGE\](.+)$/);
    if (imageMatch) {
        const url = imageMatch[1].trim();
        return `<img src="${escapeHtml(url)}" class="comm-msg-image-content" alt="image" 
                     style="max-width:350px; max-height:320px; border-radius:12px; display:block; cursor:pointer; object-fit: cover;" 
                     onclick="openImageViewer('${escapeHtml(url)}')">` + blockedLabelHtml;
    }

    // Pattern 3: [REPLY:...]
    const replyMatch = str.match(/^\[REPLY:([^:]+):([^:]+):([^\]]+)\](.*)$/s);
    if (replyMatch) {
        const replyMsgId   = escapeHtml(replyMatch[1].trim());
        const replySender  = escapeHtml(replyMatch[2].trim());
        const replyPreview = escapeHtml(replyMatch[3].trim());
        const mainContent  = escapeHtml(replyMatch[4].trim());
        return `<div class="comm-msg-reply-wrapper">
            <div class="comm-msg-reply-quote" onclick="scrollToMsg('${replyMsgId}')">
                <span class="comm-msg-reply-name">${replySender}</span>
                <span class="comm-msg-reply-text">${replyPreview}</span>
            </div>
            <div class="comm-msg-reply-body">${mainContent}</div>
        </div>` + blockedLabelHtml;
    }

    // Mặc định
    return (escapeHtml(str).replace(/\n/g, '<br>')) + blockedLabelHtml;
}

// Scroll đến tin nhắn được reply
function scrollToMsg(msgId) {
    const el = document.getElementById('msg-' + msgId);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('comm-msg-highlight');
        setTimeout(() => el.classList.remove('comm-msg-highlight'), 1500);
    }
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
    switchCommView('profile', true);
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
// 5.5 CHAT TOGGLE SIDEBAR
// ===========================================
// Biến toàn cục để nhớ trạng thái ẩn/hiện sidebar trong phiên làm việc (mặc định ẩn khi mới vào)
let isChatInfoSidebarHiddenInSession = true;

// Bật/tắt tab thông tin bên phải trong CineChat
function toggleChatInfoSidebar() {
    const layout = document.getElementById("commChatView");
    const icon = document.getElementById("iconToggleChatInfo");
    if (!layout) return;

    layout.classList.toggle("info-hidden");
    isChatInfoSidebarHiddenInSession = layout.classList.contains("info-hidden");

    // Đổi icon theo trạng thái: filled khi đang hiện, outlined khi ẩn
    if (icon) {
        icon.className = isChatInfoSidebarHiddenInSession ? 'far fa-address-card' : 'fas fa-address-card';
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
            .select(`
                id, content, media_url, media_urls, movie_id, created_at, likes_count, comments_count, shares_count
            `)
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
            // Tra cứu phim từ allMovies global
            let movieData = null;
            if (post.movie_id && typeof allMovies !== 'undefined' && allMovies) {
                movieData = allMovies.find(m => m.id === post.movie_id) || null;
            }

            // Render thẻ phim nếu có (dùng hàm helper)
            const movieRefHtml = buildMovieRefHtml(movieData);

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
                    ${post.content ? `<div class="comm-post-content" id="post-content-${post.id}">${escapeHtml(post.content)}</div>` : ''}
                    ${renderPostGallery(post)}
                    ${movieRefHtml}
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
            // Lấy media_url và media_urls trước khi xóa để dọn ảnh trên R2
            const { data: postData } = await supabase
                .from('community_posts')
                .select('media_url, media_urls')
                .eq('id', postId)
                .single();

            const { error } = await supabase
                .from('community_posts')
                .delete()
                .eq('id', postId);

            if (error) throw error;

            // Xóa tất cả ảnh trên Cloudflare R2 nếu có
            if (postData && typeof window.deleteImageFromR2 === 'function') {
                const urls = postData.media_urls || (postData.media_url ? [postData.media_url] : []);
                urls.forEach(url => window.deleteImageFromR2(url));
            }

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

// Biến trạng thái cho edit post
let editExistingUrls = [];   // URLs ảnh hiện tại từ DB
let editNewFiles = [];       // File ảnh mới chọn thêm
let editRemovedUrls = [];    // URLs ảnh đã xóa (cần xóa trên R2)
let editSelectedMovieId = null; // ID phim đang chọn

/**
 * Mở modal chỉnh sửa bài viết — load đầy đủ nội dung, ảnh, phim
 */
async function prepareEditPost(postId) {
    editingPostId = postId;
    editNewFiles = [];
    editRemovedUrls = [];

    // Đóng dropdown
    const dropdown = document.getElementById(`dropdown-${postId}`);
    if (dropdown) dropdown.classList.remove('active');

    try {
        // Lấy dữ liệu post đầy đủ từ Supabase
        const { data: post, error } = await supabase
            .from('community_posts')
            .select('content, media_url, media_urls, movie_id')
            .eq('id', postId)
            .single();

        if (error) throw error;

        // 1. Nội dung
        document.getElementById("editPostContent").value = post.content || '';

        // 2. Ảnh hiện tại
        editExistingUrls = post.media_urls && post.media_urls.length > 0
            ? [...post.media_urls]
            : (post.media_url ? [post.media_url] : []);
        renderEditPostImages();

        // 3. Phim gắn thẻ
        editSelectedMovieId = post.movie_id || null;
        if (editSelectedMovieId) {
            loadEditPostMovie(editSelectedMovieId);
        } else {
            document.getElementById('editPostMovieTag').style.display = 'none';
        }

        // Reset ô tìm phim
        const searchInput = document.getElementById('editPostMovieSearch');
        if (searchInput) searchInput.value = '';
        const results = document.getElementById('editPostMovieResults');
        if (results) results.innerHTML = '';

        document.getElementById("editPostModal").style.display = "flex";
    } catch(e) {
        console.error('Lỗi load bài viết để sửa:', e);
        showNotification('Không thể tải bài viết', 'error');
    }
}

/**
 * Render grid ảnh trong modal chỉnh sửa
 */
function renderEditPostImages() {
    const grid = document.getElementById('editPostImageGrid');
    const counter = document.getElementById('editImageCount');
    if (!grid) return;

    const allImages = [
        ...editExistingUrls.map(url => ({ type: 'existing', src: url })),
        ...editNewFiles.map((file, idx) => ({ type: 'new', src: URL.createObjectURL(file), idx }))
    ];
    const total = allImages.length;
    if (counter) counter.textContent = total > 0 ? `(${total}/${MAX_POST_IMAGES})` : '';

    if (total === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Chưa có ảnh</p>';
        return;
    }

    grid.innerHTML = allImages.map((img, i) => {
        if (img.type === 'existing') {
            return `
                <div class="comm-preview-item">
                    <img src="${img.src}" alt="Ảnh ${i + 1}">
                    <button class="comm-preview-remove-item" onclick="removeEditExistingImage(${editExistingUrls.indexOf(img.src)})" title="Xóa ảnh">&times;</button>
                    <span class="comm-preview-index">${i + 1}</span>
                </div>`;
        } else {
            return `
                <div class="comm-preview-item" style="border-color: #4db8ff;">
                    <img src="${img.src}" alt="Ảnh mới ${img.idx + 1}">
                    <button class="comm-preview-remove-item" onclick="removeEditNewImage(${img.idx})" title="Xóa ảnh mới">&times;</button>
                    <span class="comm-preview-index" style="background: rgba(77,184,255,0.7);">Mới</span>
                </div>`;
        }
    }).join('');
}

/**
 * Xóa ảnh hiện tại (từ DB) — đánh dấu để xóa trên R2 khi lưu
 */
function removeEditExistingImage(idx) {
    const removed = editExistingUrls.splice(idx, 1);
    if (removed[0]) editRemovedUrls.push(removed[0]);
    renderEditPostImages();
}

/**
 * Xóa ảnh mới chọn thêm
 */
function removeEditNewImage(idx) {
    editNewFiles.splice(idx, 1);
    renderEditPostImages();
}

/**
 * Thêm ảnh mới vào bài viết đang sửa
 */
function handleEditPostImageAdd(event) {
    const files = Array.from(event.target.files);
    const currentTotal = editExistingUrls.length + editNewFiles.length;

    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 10 * 1024 * 1024) {
            showNotification(`"${file.name}" quá lớn (>10MB)`, 'warning');
            continue;
        }
        if (currentTotal + editNewFiles.length >= MAX_POST_IMAGES) {
            showNotification(`Tối đa ${MAX_POST_IMAGES} ảnh mỗi bài!`, 'warning');
            break;
        }
        editNewFiles.push(file);
    }
    renderEditPostImages();
    event.target.value = '';
}

/**
 * Load thông tin phim gắn thẻ vào modal chỉnh sửa (dùng allMovies cache)
 */
function loadEditPostMovie(movieId) {
    if (typeof allMovies === 'undefined' || !allMovies) return;
    const movie = allMovies.find(m => m.id === movieId);
    if (!movie) {
        console.warn('Không tìm thấy phim với ID:', movieId);
        return;
    }

    const poster = movie.posterUrl || movie.poster_url || movie.poster || '';
    const title = movie.title || '';
    const year = movie.year || '';
    const category = movie.category || '';
    const meta = [year, category].filter(Boolean).join(' • ');

    document.getElementById('editPostMovieContent').innerHTML = `
        <img src="${poster || 'https://via.placeholder.com/36x50/1a1a2e/666?text=🎬'}" alt="${title}" onerror="this.src='https://via.placeholder.com/36x50/1a1a2e/666?text=🎬'">
        <div class="comm-movie-tag-info">
            <span class="tag-title">${escapeHtml(title)}</span>
            ${meta ? `<span class="tag-meta">${escapeHtml(meta)}</span>` : ''}
        </div>`;
    document.getElementById('editPostMovieTag').style.display = 'flex';
}

/**
 * Tìm phim trong modal chỉnh sửa (dùng allMovies cache)
 */
function searchMovieForEditPost(query) {
    const container = document.getElementById('editPostMovieResults');
    if (!container || !query || query.length < 2) {
        if (container) container.innerHTML = '';
        return;
    }

    if (typeof allMovies === 'undefined' || !allMovies) return;

    const q = query.toLowerCase();
    const results = allMovies.filter(m => 
        m.title && m.title.toLowerCase().includes(q)
    ).slice(0, 8);

    if (results.length === 0) {
        container.innerHTML = '<p style="padding: 10px; color: var(--text-muted); text-align: center;">Không tìm thấy</p>';
        return;
    }

    container.innerHTML = results.map(m => {
        const poster = m.posterUrl || m.poster_url || m.poster || '';
        const year = m.year || '';
        const category = m.category || '';
        const meta = [year, category].filter(Boolean).join(' • ');
        return `
            <div class="comm-movie-search-item" onclick="selectEditPostMovie('${m.id}')">
                <img src="${poster || 'https://via.placeholder.com/32x44/1a1a2e/666?text=🎬'}" alt="" onerror="this.src='https://via.placeholder.com/32x44/1a1a2e/666?text=🎬'">
                <div class="comm-movie-search-item-info">
                    <span class="movie-title">${escapeHtml(m.title)}</span>
                    ${meta ? `<span class="movie-meta">${escapeHtml(meta)}</span>` : ''}
                </div>
            </div>`;
    }).join('');
}

/**
 * Chọn phim cho bài viết đang sửa (dùng allMovies cache)
 */
function selectEditPostMovie(movieId) {
    if (typeof allMovies === 'undefined') return;
    const movie = allMovies.find(m => m.id === movieId);
    if (!movie) return;

    editSelectedMovieId = movieId;
    const poster = movie.posterUrl || movie.poster_url || movie.poster || '';
    const title = movie.title || '';
    const year = movie.year || '';
    const category = movie.category || '';
    const meta = [year, category].filter(Boolean).join(' • ');

    document.getElementById('editPostMovieContent').innerHTML = `
        <img src="${poster || 'https://via.placeholder.com/36x50/1a1a2e/666?text=🎬'}" alt="${title}" onerror="this.src='https://via.placeholder.com/36x50/1a1a2e/666?text=🎬'">
        <div class="comm-movie-tag-info">
            <span class="tag-title">${escapeHtml(title)}</span>
            ${meta ? `<span class="tag-meta">${escapeHtml(meta)}</span>` : ''}
        </div>`;
    document.getElementById('editPostMovieTag').style.display = 'flex';
    document.getElementById('editPostMovieResults').innerHTML = '';
    document.getElementById('editPostMovieSearch').value = '';
}

/**
 * Bỏ chọn phim khỏi bài viết đang sửa
 */
function removeEditPostMovie() {
    editSelectedMovieId = null;
    document.getElementById('editPostMovieTag').style.display = 'none';
    document.getElementById('editPostMovieContent').innerHTML = '';
}

function closeEditPostModal() {
    document.getElementById("editPostModal").style.display = "none";
    editingPostId = null;
    editExistingUrls = [];
    editNewFiles = [];
    editRemovedUrls = [];
    editSelectedMovieId = null;
}

/**
 * Cập nhật bài viết — xử lý nội dung + ảnh + phim
 */
async function updatePost() {
    if (!editingPostId || !currentUser) return;
    
    const newContent = document.getElementById("editPostContent").value.trim();
    const hasImages = editExistingUrls.length > 0 || editNewFiles.length > 0;

    if (!newContent && !hasImages && !editSelectedMovieId) {
        showNotification("Bài viết cần có nội dung, ảnh hoặc phim", "warning");
        return;
    }

    const btn = document.getElementById('editPostSaveBtn');
    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        btn.disabled = true;

        // 1. Upload ảnh mới (nếu có)
        let newUrls = [];
        if (editNewFiles.length > 0) {
            const userName = currentUser.display_name || currentUser.displayName || 'user';
            const shortId = Date.now();
            const startIdx = editExistingUrls.length + 1;

            for (let i = 0; i < editNewFiles.length; i++) {
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Tải ảnh ${i + 1}/${editNewFiles.length}...`;
                const url = await uploadPostImageToR2(editNewFiles[i], shortId, userName, startIdx + i);
                if (url) newUrls.push(url);
            }
        }

        // 2. Gom tất cả URLs (cũ giữ lại + mới upload)
        const allUrls = [...editExistingUrls, ...newUrls];

        // 3. Cập nhật DB
        const updateData = {
            content: newContent || null,
            movie_id: editSelectedMovieId || null,
            media_url: allUrls.length > 0 ? allUrls[0] : null,
            media_urls: allUrls.length > 0 ? allUrls : []
        };

        const { error } = await supabase
            .from('community_posts')
            .update(updateData)
            .eq('id', editingPostId);

        if (error) throw error;

        // 4. Xóa ảnh đã bỏ trên R2
        if (editRemovedUrls.length > 0 && typeof window.deleteImageFromR2 === 'function') {
            editRemovedUrls.forEach(url => window.deleteImageFromR2(url));
        }

        showNotification("Cập nhật bài viết thành công!", "success");
        closeEditPostModal();
        await fetchPosts(); // Refresh feed
    } catch (e) {
        console.error("Lỗi sửa bài:", e);
        showNotification("Không thể cập nhật bài viết", "error");
    } finally {
        btn.innerHTML = 'Cập nhật';
        btn.disabled = false;
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
let blockCountdownInterval = null;

// Cập nhật trạng thái "Đã xem" cho các tin nhắn
async function markMessagesAsSeen(senderId) {
    if (!currentUser || !senderId) return;

    // [BẢO MẬT NÂNG CAO] Kiểm tra xem mình có đang chặn người này không
    const iBlockedThem = myAppBlocks.some(b => 
        String(b.user_id).trim() === String(currentUser.id).trim() && 
        String(b.blocked_id).trim() === String(senderId).trim()
    );

    if (iBlockedThem) {
        console.log("🛡️ Chế độ chặn đang bật: Từ chối đánh dấu 'Đã xem'.");
        return;
    }

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

// ===========================================
// INFINITE SCROLL - Load thêm tin nhắn cũ khi cuộn lên
// ===========================================
const CHAT_PAGE_SIZE = 50; // Số tin nhắn load mỗi lần
let chatHasMore = true; // Còn tin nhắn cũ để load không
let chatIsLoadingMore = false; // Đang load thêm không (tránh gọi trùng)
let chatAllMessages = []; // Mảng tất cả tin nhắn đã load
let chatOldestCreatedAt = null; // Mốc thời gian tin nhắn cũ nhất đã load

// Hàm thiết lập scroll listener cho container tin nhắn
function setupChatScrollListener() {
    const container = document.getElementById("commChatMessages");
    if (!container) return;
    // Xóa listener cũ nếu có
    container.removeEventListener('scroll', handleChatScroll);
    container.addEventListener('scroll', handleChatScroll);
}

// Handler khi cuộn - load thêm tin cũ khi cuộn gần đầu
function handleChatScroll() {
    const container = document.getElementById("commChatMessages");
    if (!container || chatIsLoadingMore || !chatHasMore) return;
    // Khi cuộn cách đỉnh < 80px → load thêm
    if (container.scrollTop < 80) {
        loadOlderMessages();
    }
}

// Hàm load thêm tin nhắn cũ hơn
async function loadOlderMessages() {
    if (!currentChatUserId || !currentUser || chatIsLoadingMore || !chatHasMore) return;
    chatIsLoadingMore = true;

    const container = document.getElementById("commChatMessages");
    if (!container) { chatIsLoadingMore = false; return; }

    // Hiện spinner ở đầu
    const spinner = document.createElement('div');
    spinner.className = 'comm-load-more-spinner';
    spinner.innerHTML = '<div class="loading-spinner" style="margin: 10px auto; width: 24px; height: 24px;"></div>';
    container.prepend(spinner);

    // Lưu vị trí scroll trước khi thêm tin cũ
    const prevScrollHeight = container.scrollHeight;

    try {
        // Query: lấy tin cũ hơn mốc chatOldestCreatedAt
        let query = supabase
            .from('community_messages')
            .select('id, sender_id, receiver_id, content, status, created_at, deleted_by_sender, deleted_by_receiver')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatUserId}),and(sender_id.eq.${currentChatUserId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: false })
            .limit(CHAT_PAGE_SIZE);

        if (chatOldestCreatedAt) {
            query = query.lt('created_at', chatOldestCreatedAt);
        }

        let { data: olderMsgs, error } = await query;
        if (error) throw error;

        // Lọc tin nhắn đã xóa
        if (olderMsgs) {
            olderMsgs = olderMsgs.filter(msg => {
                if (msg.sender_id === currentUser.id) return !msg.deleted_by_sender;
                return !msg.deleted_by_receiver;
            });
        }

        // Xóa spinner
        spinner.remove();

        if (!olderMsgs || olderMsgs.length === 0) {
            chatHasMore = false;
            chatIsLoadingMore = false;
            return;
        }

        // Nếu ít hơn PAGE_SIZE → hết tin nhắn
        if (olderMsgs.length < CHAT_PAGE_SIZE) chatHasMore = false;

        // Đảo ngược (vì query desc) để cũ nhất trước
        olderMsgs.reverse();

        // Cập nhật mốc cũ nhất
        chatOldestCreatedAt = olderMsgs[0].created_at;

        // Thêm vào đầu mảng tổng
        chatAllMessages = [...olderMsgs, ...chatAllMessages];

        // Render lại toàn bộ
        renderMessages(chatAllMessages);

        // Giữ nguyên vị trí cuộn (không nhảy lên đầu)
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeight;

    } catch (e) {
        console.error('Lỗi load tin nhắn cũ:', e);
        spinner.remove();
    }
    chatIsLoadingMore = false;
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
        
        // Đánh dấu đã đọc tất cả notification chat_message của người này
        if (typeof markChatNotifAsRead === 'function') {
            markChatNotifAsRead(targetUserName);
        }
        
        // Cập nhật highlight item đang chọn trong danh sách chat
        document.querySelectorAll('.comm-chat-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-user-id') === targetUserId) {
                item.classList.add('active');
            }
        });
        
        // 2. Điều phối hiển thị (Hiện Content Chat, ẩn Welcome)
        const welcomeEl = document.getElementById("commChatWelcome");
        const contentEl = document.getElementById("commChatContent");
        const layoutEl = document.getElementById("commChatView");
        
        if (welcomeEl) welcomeEl.style.display = "none";
        if (contentEl) contentEl.style.display = "flex";
        
        // [SLIDE-VIEW] Thêm class để CSS ẩn danh sách chat + hiện khung chat trên mobile/tablet dọc
        if (layoutEl) layoutEl.classList.add('chat-conversation-open');
        
        // Đồng bộ trạng thái sidebar theo session (Mặc định ẩn khi mới vào)
        if (layoutEl) {
            if (isChatInfoSidebarHiddenInSession) {
                layoutEl.classList.add("info-hidden");
            } else {
                layoutEl.classList.remove("info-hidden");
            }
            
            const toggleIcon = document.getElementById("iconToggleChatInfo");
            if (toggleIcon) {
                toggleIcon.className = isChatInfoSidebarHiddenInSession ? 'far fa-address-card' : 'fas fa-address-card';
            }
        }

        // [MỚI] Reset UI banner nếu đổi người chat để tránh "nhảy" banner cũ
        const chatBox = document.querySelector('.comm-chat-box');
        if (chatBox && currentChatUserId !== targetUserId) {
            chatBox.removeAttribute('data-last-block-status');
            updateBlockUI(null);
        }

        // 3. Tìm các phần tử giao diện (Dùng ID mới tránh xung đột)
        const nameEl = document.getElementById("commChatTargetName");
        const avatarEl = document.getElementById("commChatTargetAvatar");
        const inputEl = document.getElementById("commChatInputMessage");
        const messagesContainer = document.getElementById("commChatMessages");
        const chatBoxStatus = document.getElementById("commChatTargetStatus");

        // Info Sidebar elements
        const infoAvatarEl = document.getElementById("commInfoAvatar");
        const infoNameEl = document.getElementById("commInfoName");
        const infoStatusEl = document.getElementById("commInfoStatus");

        console.log("🔍 Checking DOM elements (Comm):", { nameEl:!!nameEl, avatarEl:!!avatarEl, container:!!messagesContainer });

        // 3. Cập nhật header ngay lập tức
        if (nameEl) nameEl.textContent = targetUserName;
        if (avatarEl) avatarEl.src = targetAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(targetUserName)}&background=random`;
        
        // Cập nhật Info Sidebar
        if (infoNameEl) infoNameEl.textContent = targetUserName;
        if (infoAvatarEl) infoAvatarEl.src = targetAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(targetUserName)}&background=random`;
        // Gán @username thật (dùng ID rút gọn 8 ký tự đầu)
        const infoUsernameEl = document.getElementById("commInfoUsername");
        if (infoUsernameEl) infoUsernameEl.textContent = "@" + (targetUserId || '').slice(0, 8);

        if (inputEl) {
            inputEl.disabled = false;
            inputEl.value = ""; // Clear input khi chuyển người chat
            // Auto-focus đã được gỡ bỏ để tối ưu UX cho mobile (không bật keyboard ảo)
        }
        
        // Cập nhật Status (Xóa sạch dấu vết người cũ nhưng giữ lại dữ liệu gợi ý của người mới từ Sidebar)
        const sidebarItem = document.querySelector(`.comm-chat-item[data-user-id="${targetUserId}"]`);
        const suggestedLastSeen = sidebarItem ? sidebarItem.getAttribute('data-last-seen') : null;

        const setStatus = (statusHTML) => {
            [chatBoxStatus, infoStatusEl].forEach(el => {
                if (el) {
                    el.innerHTML = statusHTML;
                    if (suggestedLastSeen) {
                        el.setAttribute('data-last-seen', suggestedLastSeen);
                    } else {
                        el.removeAttribute('data-last-seen');
                    }
                    el.classList.remove('comm-last-seen-realtime');
                }
            });
        };

        setStatus('<span style="color: var(--text-muted);">Đang tải trạng thái...</span>');
        refreshPresenceUI(); // Update status immediately
        
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="loading-spinner"></div></div>';
        } else {
            throw new Error("Không tìm thấy container tin nhắn (commChatMessages)");
        }

        // 4. Lấy tin nhắn (Lọc tin nhắn chưa bị xóa bởi người dùng hiện tại)
        // 4. Reset state infinite scroll
        chatHasMore = true;
        chatIsLoadingMore = false;
        chatAllMessages = [];
        chatOldestCreatedAt = null;

        // 5. Lấy 50 tin nhắn MỚI NHẤT (desc rồi reverse)
        console.log("💾 Fetching messages...");
        let { data: messages, error } = await supabase
            .from('community_messages')
            .select('id, sender_id, receiver_id, content, status, created_at, deleted_by_sender, deleted_by_receiver')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: false })
            .limit(CHAT_PAGE_SIZE);
            
        // Lọc tin nhắn đã xóa ở phía người dùng hiện tại
        if (messages) {
            messages = messages.filter(msg => {
                if (msg.sender_id === currentUser.id) {
                    return !msg.deleted_by_sender;
                } else {
                    return !msg.deleted_by_receiver;
                }
            });
        }
            
        // Nếu lỗi (có thể do thiếu cột status/created_at), thử lại bản thu gọn
        if (error) {
            console.warn("⚠️ Lỗi truy vấn đầy đủ, đang thử truy vấn rút gọn:", error.message);
            const retry = await supabase
                .from('community_messages')
                .select('id, sender_id, receiver_id, content')
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUser.id})`)
                .order('created_at', { ascending: false })
                .limit(CHAT_PAGE_SIZE);
            
            if (retry.error) throw retry.error;
            messages = retry.data;
        }

        // Nếu ít hơn PAGE_SIZE → hết tin nhắn cũ
        if (messages && messages.length < CHAT_PAGE_SIZE) chatHasMore = false;

        // Đảo ngược: cũ → mới (vì query desc)
        if (messages) messages.reverse();
        
        console.log("✅ Fetched messages:", messages?.length || 0);

        // Lưu vào state và mốc thời gian cũ nhất
        chatAllMessages = messages || [];
        if (chatAllMessages.length > 0) {
            chatOldestCreatedAt = chatAllMessages[0].created_at;
        }
        
        // 6. Kiểm tra trạng thái chặn 2 chiều
        console.log("🛡️ Checking block status for:", targetUserId);
        const blockStatus = await fetchBlockStatusDB(targetUserId);
        updateBlockUI(blockStatus);

        // 7. Hiển thị tin nhắn + cuộn xuống mới nhất
        renderMessages(chatAllMessages);
        isPinnedListExpanded = false;
        loadPinnedMessages();
        scrollToBottomChat();
        
        // 8. Thiết lập scroll listener cho load thêm tin cũ
        setupChatScrollListener();
        
        // 6. Tác vụ phụ (không block UI)
        if (blockStatus !== 'i_blocked' && blockStatus !== 'both') {
            markMessagesAsSeen(targetUserId).catch(err => console.error("Lỗi markAsSeen:", err));
        }
        fetchChatMediaStats(targetUserId); // Luôn đếm ảnh khi mở chat
        subscribeToChat(targetUserId);
        cancelReply(); // Reset trạng thái reply khi chuyển người chat

        // Nâng cấp V2: Cập nhật hình nền riêng cho cuộc trò chuyện này
        initChatWallpaper();

        // [MỚI] Cập nhật trạng thái nút Mute/Unmute cho hội thoại này
        updateMuteUI(targetUserId);

        // initChatWallpaper() đã gọi updateBlockUI thông qua openChat -> fetchBlockStatusDB -> updateBlockUI
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
    
    // Lọc tin nhắn dựa trên logic chặn
    const filteredMessages = messages.filter(msg => {
        const isMe = msg.sender_id === currentUser.id;
        if (isMe) return true; // Tin nhắn của mình luôn hiện

        // Kiểm tra xem tin nhắn này có nằm trong bất kỳ khoảng thời gian chặn nào của mình không
        const myBlockOnThem = currentChatBlocks.find(b => String(b.user_id).trim() === String(currentUser.id).trim());
        if (myBlockOnThem) {
            const blockTime = new Date(myBlockOnThem.created_at).getTime();
            const msgTime = new Date(msg.created_at).getTime();
            
            // Nếu tin nhắn gửi sau khi chặn
            if (msgTime >= blockTime) {
                // Nếu vẫn đang chặn (hiện diện trong currentChatBlocks) -> Ẩn
                return false;
            }
        }
        return true;
    });

    if (filteredMessages.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin: auto;">Hãy gửi lời chào đầu tiên!</div>';
        return;
    }

    container.innerHTML = filteredMessages.map(msg => {
        const isMe = msg.sender_id === currentUser.id;
        const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // logic nhãn chặn đã chuyển vào parseMessageContent
        let displayContent = msg.content || "";
        
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
            <div class="comm-msg ${isMe ? 'sent' : 'received'} ${msg.status === 'recalled' ? 'recalled-style' : ''}" id="msg-${msg.id}">
                <div class="comm-msg-body-wrapper">
                    <div class="comm-msg-bubble">
                        ${parseMessageContent(displayContent)}
                    </div>
                    <div class="comm-msg-actions-quick">
                        <button onclick="prepareReply('${msg.id}')" title="Trả lời"><i class="fas fa-quote-left"></i></button>
                        <button onclick="shareMsg('${msg.id}')" title="Chia sẻ"><i class="fas fa-share"></i></button>
                        <button class="btn-more" onclick="toggleMsgDropdown(event, '${msg.id}')" title="Thêm"><i class="fas fa-ellipsis-h"></i></button>
                        
                        <div class="comm-msg-dropdown" id="dropdown-msg-${msg.id}">
                            <div class="comm-dropdown-item" onclick="copyMsgText('${msg.id}')"><i class="far fa-copy"></i> Copy tin nhắn</div>
                            ${msg.content && msg.content.startsWith('[IMAGE]') ? `<div class="comm-dropdown-item download-direct" onclick="downloadImage('${msg.content.replace('[IMAGE]', '').trim()}')"><i class="fas fa-download"></i> Tải xuống ảnh</div>` : ''}
                            <div class="comm-dropdown-item" onclick="togglePinMsg('${msg.id}')"><i class="fas fa-thumbtack"></i> Ghim / Bỏ ghim</div>
                            <div class="comm-dropdown-item"><i class="far fa-star"></i> Đánh dấu tin nhắn</div>
                            <div class="comm-dropdown-item"><i class="fas fa-list-ul"></i> Chọn nhiều tin nhắn</div>
                            <div class="comm-dropdown-divider"></div>
                            ${isMe ? `<div class="comm-dropdown-item recall" onclick="recallMsg('${msg.id}')"><i class="fas fa-undo"></i> Thu hồi</div>` : ''}
                            <div class="comm-dropdown-item delete" onclick="deleteMsgForMe('${msg.id}')"><i class="far fa-trash-alt"></i> Xóa chỉ ở phía tôi</div>
                        </div>
                    </div>
                </div>
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
    if (container) {
        container.scrollTop = container.scrollHeight;
        // Cuộn lần 2 sau delay để đảm bảo DOM đã render xong (ảnh, sticker...)
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 150);
    }
}

// State block 
let isCurrentlyBlocked = false;
let currentChatBlocks = []; // Lưu trữ lịch sử chặn để lọc tin nhắn

/**
 * Kiểm tra trạng thái chặn từ Database (Supabase)
 * @returns {string|null} 'i_blocked' | 'they_blocked' | 'both' | null
 */
async function fetchBlockStatusDB(targetUserId) {
    if (!currentUser || !targetUserId) return null;

    // [CẬP NHẬT] Sử dụng dữ liệu tập trung myAppBlocks thay vì query riêng lẻ
    const targetUserIdStr = String(targetUserId).trim();
    currentChatBlocks = myAppBlocks.filter(block => {
        const uId = String(block.user_id).trim();
        const bId = String(block.blocked_id).trim();
        
        // Lấy các block liên quan đến cặp (tôi, người kia)
        const isRelevant = (uId === String(currentUser.id).trim() && bId === targetUserIdStr) ||
                           (uId === targetUserIdStr && bId === String(currentUser.id).trim());
        
        if (!isRelevant) return false;

        if (block.duration_hours === -1) return true; // Vĩnh viễn
        
        const expiryTime = new Date(block.created_at).getTime() + (block.duration_hours * 3600 * 1000);
        const isExpired = Date.now() > expiryTime;
        
        if (isExpired) {
            if (uId === String(currentUser.id).trim()) removeBlockDB(block.blocked_id);
            return false;
        }
        return true;
    });
    
    let iBlocked = currentChatBlocks.some(b => String(b.user_id).trim() === String(currentUser.id).trim());
    let theyBlocked = currentChatBlocks.some(b => String(b.user_id).trim() === targetUserIdStr);

    const status = (iBlocked && theyBlocked) ? 'both' : (iBlocked ? 'i_blocked' : (theyBlocked ? 'they_blocked' : null));
    isCurrentlyBlocked = (status === 'i_blocked' || status === 'both');
    
    return status;
}

/**
 * Lưu trạng thái chặn vào Database
 */
async function saveBlockDB(blockedId, durationHours) {
    if (!currentUser || !blockedId) return;
    try {
        const blockData = {
            user_id: currentUser.id,
            blocked_id: blockedId,
            duration_hours: durationHours,
            created_at: new Date().toISOString()
        };

        const { error } = await supabase.from('community_blocks').upsert(blockData);
        if (error) throw error;

        // Cập nhật local state
        myAppBlocks = myAppBlocks.filter(b => !(String(b.user_id).trim() === String(currentUser.id).trim() && String(b.blocked_id).trim() === String(blockedId).trim()));
        myAppBlocks.push(blockData);

    } catch (e) {
        console.error("Lỗi lưu block vào DB:", e);
    }
}

/**
 * Xóa trạng thái chặn khỏi Database
 */
async function removeBlockDB(blockedId) {
    if (!currentUser || !blockedId) return;
    try {
        const { error } = await supabase
            .from('community_blocks')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('blocked_id', blockedId);
        
        if (error) throw error;

        // Cập nhật local state
        myAppBlocks = myAppBlocks.filter(b => !(String(b.user_id).trim() === String(currentUser.id).trim() && String(b.blocked_id).trim() === String(blockedId).trim()));
    } catch (e) {
        console.error("Lỗi xóa block khỏi DB:", e);
    }
}

/**
 * Cập nhật UI Chat khi bị chặn
 */
function updateBlockUI(blockStatus) {
    const chatBox = document.querySelector('.comm-chat-box');
    if (!chatBox) return;

    // [TỐI ƯU] Chỉ cập nhật nếu trạng thái thực sự thay đổi để tránh "nhảy" giao diện
    const lastStatus = chatBox.getAttribute('data-last-block-status');
    const lastUser = chatBox.getAttribute('data-last-block-user');
    if (lastStatus === String(blockStatus) && lastUser === String(currentChatUserId)) return; 
    
    chatBox.setAttribute('data-last-block-status', String(blockStatus));
    chatBox.setAttribute('data-last-block-user', String(currentChatUserId));

    const inputWrapper = document.querySelector('.comm-chat-input-wrapper');
    const sendBtn = document.querySelector('.comm-btn-send');
    
    // Xóa TẤT CẢ banner cũ
    document.querySelectorAll('.comm-block-banner').forEach(el => el.remove());

    if (blockStatus) {
        isCurrentlyBlocked = (blockStatus === 'i_blocked' || blockStatus === 'both');
        
        // Tạo banner cảnh báo
        let bannerMsg = "";
        let bannerIcon = "fa-ban";
        
        if (blockStatus === 'both') {
            bannerMsg = "Bạn đã chặn người này và bạn cũng đã bị chặn.";
            if (inputWrapper) inputWrapper.style.display = 'none';
            if (sendBtn) sendBtn.style.display = 'none';
        } else if (blockStatus === 'i_blocked') {
            // [MỚI] Theo yêu cầu người dùng: Không hiện banner khi mình chặn họ (tránh phiền khi spam click)
            bannerMsg = ""; 
            if (inputWrapper) inputWrapper.style.display = 'flex';
            if (sendBtn) sendBtn.style.display = 'flex';
        } else if (blockStatus === 'they_blocked') {
            bannerMsg = "Bạn đã bị chặn. Bạn vẫn có thể gửi tin nhắn nhưng người kia sẽ không nhận được ngay.";
            bannerIcon = "fa-exclamation-circle";
            if (inputWrapper) inputWrapper.style.display = 'flex';
            if (sendBtn) sendBtn.style.display = 'flex';
        }

        const chatBox = document.querySelector('.comm-chat-box');
        if (chatBox && bannerMsg) {
            const banner = document.createElement('div');
            banner.id = 'commBlockBanner';
            banner.className = 'comm-block-banner';
            banner.innerHTML = `<i class="fas ${bannerIcon}"></i> <span>${bannerMsg}</span>`;
            chatBox.appendChild(banner);
        }
    } else {
        isCurrentlyBlocked = false;
        if (inputWrapper) inputWrapper.style.display = 'flex';
        if (sendBtn) sendBtn.style.display = 'flex';
    }

    // [MỚI] Đồng bộ nút Danger Zone và Bộ đếm ngược trong sidebar
    const dangerItem = document.querySelector('.comm-info-danger-item');
    const countdownEl = document.getElementById('commBlockCountdown');
    
    if (blockCountdownInterval) {
        clearInterval(blockCountdownInterval);
        blockCountdownInterval = null;
    }

    if (dangerItem) {
        if (blockStatus === 'i_blocked' || blockStatus === 'both') {
            dangerItem.innerHTML = '<i class="fas fa-unlock"></i> <span>Bỏ chặn người dùng</span>';
            dangerItem.setAttribute('onclick', 'unblockCurrentUser()');

            // Hiển thị đếm ngược nếu có thời hạn, hoặc báo "Vĩnh viễn"
            const myBlock = currentChatBlocks.find(b => String(b.user_id).trim() === String(currentUser.id).trim());
            const countdownLabelEl = document.getElementById('commBlockCountdownLabel');
            const countdownTimeEl = document.getElementById('commBlockCountdownTime');

            if (myBlock) {
                if (countdownEl) countdownEl.style.display = 'flex';
                
                if (myBlock.duration_hours === -1) {
                    if (countdownLabelEl) countdownLabelEl.textContent = "Thời hạn:";
                    if (countdownTimeEl) countdownTimeEl.innerHTML = '<span style="color: #ff4d4d;">Vĩnh viễn</span>';
                    if (blockCountdownInterval) clearInterval(blockCountdownInterval);
                } else {
                    if (countdownLabelEl) countdownLabelEl.textContent = "Mở chặn sau:";
                    updateBlockCountdownText(myBlock);
                    blockCountdownInterval = setInterval(() => updateBlockCountdownText(myBlock), 1000);
                }
            } else {
                if (countdownEl) countdownEl.style.display = 'none';
            }
        } else {
            dangerItem.innerHTML = '<i class="fas fa-ban"></i> <span>Chặn người dùng</span>';
            dangerItem.setAttribute('onclick', 'confirmBlockUser()');
            if (countdownEl) countdownEl.style.display = 'none';
        }
    }
}

/**
 * Cập nhật chuỗi thời gian đếm ngược
 */
function updateBlockCountdownText(blockData) {
    const countdownTimeEl = document.getElementById('commBlockCountdownTime');
    const countdownEl = document.getElementById('commBlockCountdown');
    if (!countdownTimeEl || !blockData) return;

    const expiryTime = new Date(blockData.created_at).getTime() + (blockData.duration_hours * 3600 * 1000);
    const now = Date.now();
    const diff = expiryTime - now;

    if (diff <= 0) {
        if (blockCountdownInterval) clearInterval(blockCountdownInterval);
        if (countdownEl) countdownEl.style.display = 'none';
        // Tự động refresh trạng thái chặn khi hết hạn
        fetchBlockStatusDB(currentChatUserId).then(status => updateBlockUI(status));
        return;
    }

    const days = Math.floor(diff / (24 * 3600 * 1000));
    const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
    const minutes = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    const seconds = Math.floor((diff % (60 * 1000)) / 1000);

    const pad = (num) => String(num).padStart(2, '0');
    
    let timeStr = "";
    if (days > 0) {
        timeStr = `${days} ngày, ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    } else {
        timeStr = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    countdownTimeEl.textContent = timeStr;
}

/**
 * Bỏ chặn người đang chat hiện tại
 */
async function unblockCurrentUser() {
    if (!currentUser || !currentChatUserId) return;
    
    // Clear countdown interval
    if (blockCountdownInterval) {
        clearInterval(blockCountdownInterval);
        blockCountdownInterval = null;
    }

    await removeBlockDB(currentChatUserId);
    showNotification("Đã bỏ chặn người dùng này", "success");
    
    // Refresh lại trạng thái và tin nhắn
    const blockStatus = await fetchBlockStatusDB(currentChatUserId);
    updateBlockUI(blockStatus);
    
    // Refresh tin nhắn để hiện những tin bị ẩn
    openChat(currentChatUserId, currentChatTarget.display_name, currentChatTarget.avatar);
    if(typeof loadChatList === 'function') loadChatList();
}


// Gửi tin nhắn
async function sendMessage() {
    if(!currentChatUserId || !currentUser) return;
    if(isCurrentlyBlocked) {
        showNotification("Bạn không thể trả lời cuộc trò chuyện này.", "error");
        return;
    }
    
    const input = document.getElementById("commChatInputMessage");
    let content = input.value.trim();
    if(!content) return;

    // Nếu đang reply, chèn pattern [REPLY:...]
    if (replyingTo) {
        content = `[REPLY:${replyingTo.id}:${replyingTo.name}:${replyingTo.text}] ${content}`;
    }

    // [MỚI] Nếu người kia đang chặn mình, đánh dấu tin nhắn bằng prefix để sau này gỡ chặn vẫn nhận ra
    const theyBlockedMe = currentChatBlocks.some(b => b.user_id === currentChatUserId);
    if (theyBlockedMe) {
        content = `[BLOCKED_MSG] ${content}`;
    }

    
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
            <div class="comm-msg-body-wrapper">
                <div class="comm-msg-bubble">${parseMessageContent(tempMsg.content)}</div>
                <div class="comm-msg-actions-quick">
                    <button title="Trả lời"><i class="fas fa-quote-left"></i></button>
                    <button title="Chia sẻ"><i class="fas fa-share"></i></button>
                    <button class="btn-more"><i class="fas fa-ellipsis-h"></i></button>
                </div>
            </div>
            <div class="comm-msg-time">${time} <i class="fas fa-clock" style="font-size: 0.75rem; margin-left: 5px; color: var(--text-muted);" title="Đang gửi..."></i></div>
        </div>
    `);
    // Khôi phục chiều cao mặc định cho textarea
    input.style.height = 'auto';
    input.style.height = '48px';
    input.value = "";
    input.focus(); // Khôi phục focus sau khi nhấn gửi
    cancelReply();
    
    // [MỚI] Tắt typing indicator lập tức khi gửi
    isCurrentlyTyping = false;
    clearTimeout(typingTimeout);
    communityPresenceChannel?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { sender_id: currentUser.id, receiver_id: currentChatUserId, is_typing: false }
    });
    
    // 2. Gửi lên Supabase
    try {
        // [QUAN TRỌNG] Bỏ ẩn và bỏ trạng thái xóa hội thoại này khi có tin nhắn mới
        supabase.from('community_friends')
            .update({ hidden_by: [], deleted_by: [] }) 
            .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${currentChatUserId}),and(user_id.eq.${currentChatUserId},friend_id.eq.${currentUser.id})`)
            .then(({error: hideErr}) => {
                if(hideErr) console.warn("Lỗi tự động bỏ ẩn hội thoại:", hideErr);
                // Refresh list chat nếu đang hiện màn hình chat
                if(currentCommView === 'chat') loadChatList();
            });

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
        
        // Cập nhật lại ID thật và gắn đầy đủ các nút hành động
        const msgEl = document.getElementById(tempId);
        if(msgEl) {
            msgEl.style.opacity = "1";
            msgEl.id = `msg-${data.id}`;
            
            // Thay thế bộ nút tạm bằng bộ nút thật có onclick
            const actionsQuick = msgEl.querySelector('.comm-msg-actions-quick');
            if (actionsQuick) {
                actionsQuick.innerHTML = `
                    <button onclick="prepareReply('${data.id}')" title="Trả lời"><i class="fas fa-quote-left"></i></button>
                    <button onclick="shareMsg('${data.id}')" title="Chia sẻ"><i class="fas fa-share"></i></button>
                    <button class="btn-more" onclick="toggleMsgDropdown(event, '${data.id}')" title="Thêm"><i class="fas fa-ellipsis-h"></i></button>
                    
                    <div class="comm-msg-dropdown" id="dropdown-msg-${data.id}">
                        <div class="comm-dropdown-item" onclick="copyMsgText('${data.id}')"><i class="far fa-copy"></i> Copy tin nhắn</div>
                        ${data.content && data.content.startsWith('[IMAGE]') ? `<div class="comm-dropdown-item download-direct" onclick="downloadImage('${data.content.replace('[IMAGE]', '').trim()}')"><i class="fas fa-download"></i> Tải xuống ảnh</div>` : ''}
                        <div class="comm-dropdown-item" onclick="togglePinMsg('${data.id}')"><i class="fas fa-thumbtack"></i> Ghim / Bỏ ghim</div>
                        <div class="comm-dropdown-item"><i class="far fa-star"></i> Đánh dấu tin nhắn</div>
                        <div class="comm-dropdown-divider"></div>
                        <div class="comm-dropdown-item recall" onclick="recallMsg('${data.id}')"><i class="fas fa-undo"></i> Thu hồi</div>
                        <div class="comm-dropdown-item delete" onclick="deleteMsgForMe('${data.id}')"><i class="far fa-trash-alt"></i> Xóa chỉ ở phía tôi</div>
                    </div>
                `;
            }

            const timeEl = msgEl.querySelector('.comm-msg-time');
            if (timeEl) {
                const timeStr = new Date(data.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                let statusHtml = data.status === 'delivered' 
                    ? `<div class="comm-msg-status delivered">Đã nhận <i class="fas fa-check-double"></i></div>`
                    : `<div class="comm-msg-status sent">Đã gửi <i class="fas fa-check"></i></div>`;
                
                timeEl.innerHTML = `${timeStr} ${statusHtml}`;
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

// Lắng nghe phím Enter khi chat, sự kiện chọn ảnh và dán ảnh
document.addEventListener("DOMContentLoaded", () => {
    document.body.addEventListener('keydown', function(e) {
        if(e.target && e.target.id === 'commChatInputMessage') {
            if (e.key === 'Enter') {
                if (!e.shiftKey) {
                    e.preventDefault(); // Ngăn hiển thị dòng mới
                    sendMessage();
                }
            } else if (e.key === 'Escape') {
                cancelReply();
            }
        }
    });

    // Lắng nghe sự kiện chọn ảnh qua input file
    document.body.addEventListener('change', function(e) {
        if(e.target && e.target.id === 'commImageInput') {
            handleImageSelect(e);
        }
    });

    // Lắng nghe sự kiện đang gõ phím (Typing Indicator) và Auto Resize Textarea
    document.body.addEventListener('input', function(e) {
        if(e.target && e.target.id === 'commChatInputMessage') {
            // Auto resize logic - reset về auto để trình duyệt tính lại scrollHeight chính xác
            e.target.style.height = 'auto';
            e.target.style.height = Math.max(48, e.target.scrollHeight) + 'px';

            if (!currentChatUserId || isCurrentlyBlocked) return;
            
            // Nếu xóa hết chữ, tắt typing ngay lập tức
            if (e.target.value.trim() === '') {
                if (isCurrentlyTyping) {
                    isCurrentlyTyping = false;
                    lastTypingBroadcastTime = 0;
                    clearTimeout(typingTimeout);
                    communityPresenceChannel?.send({
                        type: 'broadcast',
                        event: 'typing',
                        payload: { sender_id: currentUser.id, receiver_id: currentChatUserId, is_typing: false }
                    });
                }
                return;
            }

            const now = Date.now();
            // Đạt chuẩn Realtime tuyệt đối bằng cách báo cáo lại liên tục mỗi 0.5s nếu vẫn đang liên tục gõ
            if (!isCurrentlyTyping || (now - lastTypingBroadcastTime > 500)) {
                isCurrentlyTyping = true;
                lastTypingBroadcastTime = now;
                communityPresenceChannel?.send({
                    type: 'broadcast',
                    event: 'typing',
                    payload: { sender_id: currentUser.id, receiver_id: currentChatUserId, is_typing: true }
                });
            }

            // Chỉ cần ngưng tay 0.8 giây là lập tức báo "không gõ nữa" cho đầu bên kia
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                isCurrentlyTyping = false;
                lastTypingBroadcastTime = 0;
                communityPresenceChannel?.send({
                    type: 'broadcast',
                    event: 'typing',
                    payload: { sender_id: currentUser.id, receiver_id: currentChatUserId, is_typing: false }
                });
            }, 800);
        }
    });

    // Khi người dùng click ra ngoài hoặc ô nhập liệu mất focus -> Tắt typing
    document.body.addEventListener('focusout', function(e) {
        if(e.target && e.target.id === 'commChatInputMessage') {
            if (isCurrentlyTyping) {
                isCurrentlyTyping = false;
                clearTimeout(typingTimeout);
                communityPresenceChannel?.send({
                    type: 'broadcast',
                    event: 'typing',
                    payload: { sender_id: currentUser.id, receiver_id: currentChatUserId, is_typing: false }
                });
            }
        }
    });

    // v10.5: Lắng nghe sự kiện dán ảnh (Paste)
    document.body.addEventListener('paste', function(e) {
        // Chỉ xử lý khi đang ở tab Chat và focus vào input chat hoặc đang trong vùng chat
        const isChatInput = e.target && e.target.id === 'commChatInputMessage';
        const isInChatBox = e.target && e.target.closest('.comm-chat-box');
        
        if (!isChatInput && !isInChatBox) return;

        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        const imageFiles = [];

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) imageFiles.push(blob);
            }
        }

        if (imageFiles.length > 0) {
            e.preventDefault(); // Ngăn chặn dán text/url ảnh nếu là file ảnh
            handleImageSelect(imageFiles);
        }
    });
});

/**
 * Reload tin nhắn cho cuộc chat hiện tại (KHÔNG reconnect subscription)
 * Dùng khi quay lại tab chat sau khi rời đi
 */
async function _reloadChatMessages(targetUserId) {
    try {
        const { data: messages, error } = await supabase
            .from('community_messages')
            .select('id, sender_id, receiver_id, content, status, created_at, deleted_by_sender, deleted_by_receiver')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true })
            .limit(200);
        
        if (error) { console.warn("Lỗi reload tin nhắn:", error); return; }
        
        // Lọc tin đã xóa
        const filtered = (messages || []).filter(msg => {
            return msg.sender_id === currentUser.id ? !msg.deleted_by_sender : !msg.deleted_by_receiver;
        });
        
        renderMessages(filtered);
        scrollToBottomChat();
    } catch (e) {
        console.warn("Lỗi _reloadChatMessages:", e);
    }
}

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
            
            // Nếu là Update (Trạng thái hoặc Nội dung - Thu hồi)
            if (payload.eventType === 'UPDATE') {
                const isOurChat = (msg.sender_id === currentUser.id && msg.receiver_id === targetUserId) ||
                                  (msg.sender_id === targetUserId && msg.receiver_id === currentUser.id);
                
                if (isOurChat) {
                    const domMsg = document.getElementById(`msg-${msg.id}`);
                    if (domMsg) {
                        // 0. Kiểm tra nếu mình vừa xóa tin nhắn này ở thiết bị khác
                        const isDeletedByMe = msg.sender_id === currentUser.id ? msg.deleted_by_sender : msg.deleted_by_receiver;
                        if (isDeletedByMe) {
                            domMsg.style.transition = 'all 0.3s ease';
                            domMsg.style.opacity = '0';
                            domMsg.style.transform = 'translateX(20px)';
                            setTimeout(() => domMsg.remove(), 300);
                            return; // Thoát vì tin nhắn đã bị xóa khỏi UI của mình
                        }

                        // 1. Cập nhật nội dung (CHỈ khi thu hồi tin nhắn, không re-render cho status update)
                        if (msg.status === 'recalled') {
                            const bubbleEl = domMsg.querySelector('.comm-msg-bubble');
                            if (bubbleEl) {
                                bubbleEl.innerHTML = parseMessageContent(msg.content);
                                domMsg.classList.add('recalled-style');
                                const actionsEl = domMsg.querySelector('.comm-msg-actions-quick');
                                if (actionsEl) actionsEl.style.display = 'none';
                            }
                        }

                        // 2. Cập nhật trạng thái Seen/Delivered (Chỉ cho tin nhắn của chính mình gửi)
                        if (msg.sender_id === currentUser.id) {
                            const timeEl = domMsg.querySelector('.comm-msg-time');
                            const timeStr = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                            if (timeEl) {
                                let statusHtml = '';
                                if (msg.status === 'seen') {
                                    statusHtml = `<div class="comm-msg-status seen">Đã xem <i class="fas fa-check-double"></i></div>`;
                                } else if (msg.status === 'delivered') {
                                    statusHtml = `<div class="comm-msg-status delivered">Đã nhận <i class="fas fa-check-double"></i></div>`;
                                } else if (msg.status === 'recalled') {
                                    statusHtml = `<div class="comm-msg-status recalled">Đã thu hồi <i class="fas fa-undo"></i></div>`;
                                } else {
                                    statusHtml = `<div class="comm-msg-status sent">Đã gửi <i class="fas fa-check"></i></div>`;
                                }
                                timeEl.innerHTML = `${timeStr} ${statusHtml}`;
                            }
                        }
                    }
                }
                return;
            }

            // Nếu là Insert tin nhắn mới
            if (payload.eventType === 'INSERT') {
                if ((msg.sender_id === currentUser.id && msg.receiver_id === targetUserId) ||
                    (msg.sender_id === targetUserId && msg.receiver_id === currentUser.id)) {
                    
                    // Kiểm tra xem tin nhắn có bị ẩn bởi mình không (trường hợp hiếm khi insert nhưng tốt để có)
                    const isDeleted = msg.sender_id === currentUser.id ? msg.deleted_by_sender : msg.deleted_by_receiver;
                    if (isDeleted) return;

                    // Nếu mình là người nhận, VÀ ĐANG Ở TRONG TAB CHAT VỚI ĐÚNG NGƯỜI ĐÓ
                    // [MỚI] CHỈ ĐÁNH DẤU ĐÃ XEM NẾU KHÔNG CHẶN HỌ
                    const iBlockedThem = currentChatBlocks.some(b => b.user_id === currentUser.id);
                    // Kiểm tra user THỰC SỰ đang nhìn chat (tab đang focus + khung chat nhìn thấy)
                    const chatContainer = document.getElementById('commChatMessages');
                    const isChatVisible = chatContainer && chatContainer.offsetHeight > 0 && document.hasFocus();
                    
                    if (msg.receiver_id === currentUser.id && currentCommView === 'chat' && currentChatUserId === targetUserId && !iBlockedThem && isChatVisible) {
                        markMessagesAsSeen(targetUserId);
                    }

                    // Tránh render đúp tin nhắn của chính mình
                    if(msg.sender_id !== currentUser.id) {
                        console.log("📩 [RT] Tin nhắn mới từ người khác, đang render...");
                        // [MỚI] LỌC TIN NHẮN THEO TRẠNG THÁI CHẶN (REAL-TIME)
                        const myBlockOnThem = currentChatBlocks.find(b => b.user_id === currentUser.id);
                        if (myBlockOnThem) {
                            const blockTime = new Date(myBlockOnThem.created_at).getTime();
                            const msgTime = new Date(msg.created_at).getTime();
                            // Nếu tin nhắn gửi sau khi mình bắt đầu chặn -> Không hiển thị lên UI
                            if (msgTime >= blockTime) {
                                console.log("🛡️ Realtime: Tin nhắn đã bị chặn hiển thị.");
                                return;
                            }
                        }

                        const container = document.getElementById("commChatMessages");
                        console.log("📩 [RT] Container found:", !!container, "offsetHeight:", container?.offsetHeight);
                        if (container) {
                            if(container.innerHTML.includes("Hãy gửi lời chào đầu tiên!")) container.innerHTML = "";
                            const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                            
                            // Xử lý nội dung đã tập trung vào parseMessageContent
                            let displayContent = msg.content || "";

                            container.insertAdjacentHTML('beforeend', `
                                <div class="comm-msg received ${msg.status === 'recalled' ? 'recalled-style' : ''}" id="msg-${msg.id}">
                                    <div class="comm-msg-body-wrapper">
                                        <div class="comm-msg-bubble">
                                            ${parseMessageContent(displayContent)}
                                        </div>
                                        <div class="comm-msg-actions-quick">
                                            <button onclick="prepareReply('${msg.id}')" title="Trả lời"><i class="fas fa-quote-left"></i></button>
                                            <button onclick="shareMsg('${msg.id}')" title="Chia sẻ"><i class="fas fa-share"></i></button>
                                            <button class="btn-more" onclick="toggleMsgDropdown(event, '${msg.id}')" title="Thêm"><i class="fas fa-ellipsis-h"></i></button>
                                            
                                            <div class="comm-msg-dropdown" id="dropdown-msg-${msg.id}">
                                                <div class="comm-dropdown-item" onclick="copyMsgText('${msg.id}')"><i class="far fa-copy"></i> Copy tin nhắn</div>
                                                ${msg.content && msg.content.startsWith('[IMAGE]') ? `<div class="comm-dropdown-item download-direct" onclick="downloadImage('${msg.content.replace('[IMAGE]', '').trim()}')"><i class="fas fa-download"></i> Tải xuống ảnh</div>` : ''}
                                                <div class="comm-dropdown-item" onclick="togglePinMsg('${msg.id}')"><i class="fas fa-thumbtack"></i> Ghim / Bỏ ghim</div>
                                                <div class="comm-dropdown-divider"></div>
                                                <div class="comm-dropdown-item delete" onclick="deleteMsgForMe('${msg.id}')"><i class="far fa-trash-alt"></i> Xóa chỉ ở phía tôi</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="comm-msg-time">${time}</div>
                                </div>
                            `);
                            scrollToBottomChat();
                        }
                    }
                }
                return;
            }

            // Nếu là DELETE (Trường hợp Hard Delete khi cả 2 cùng xóa)
            if (payload.eventType === 'DELETE') {
                const deletedId = payload.old.id;
                const domMsg = document.getElementById(`msg-${deletedId}`);
                if (domMsg) domMsg.remove();
                return;
            }
        }
      )
      .subscribe();
}

/**
 * Đăng ký lắng nghe toàn cục cho bảng tin nhắn
 * Mục đích: Refresh danh sách chat (loadChatList) khi có tin nhắn mới từ bất kỳ ai
 */
let globalMessageSubscription = null;
let globalBlocksSubscription = null;
let _msgSubRetryCount = 0;

function subscribeToMessageNotifications() {
    if (!currentUser) return;
    
    // === CHANNEL 1: Thông báo tin nhắn mới (QUAN TRỌNG NHẤT) ===
    if (globalMessageSubscription) {
        supabase.removeChannel(globalMessageSubscription);
    }
    
    _msgSubRetryCount = 0;
    _subscribeToMessages();
    
    // === CHANNEL 2: Theo dõi thay đổi block (PHỤ, không ảnh hưởng toast) ===
    if (globalBlocksSubscription) {
        supabase.removeChannel(globalBlocksSubscription);
    }
    
    try {
        globalBlocksSubscription = supabase.channel('global-blocks-watch')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'community_blocks' },
                async (payload) => {
                    const uId = payload.new ? payload.new.user_id : (payload.old ? payload.old.user_id : null);
                    const bId = payload.new ? payload.new.blocked_id : (payload.old ? payload.old.blocked_id : null);
                    
                    if (uId === currentUser.id || bId === currentUser.id) {
                        console.log("🛡️ Cập nhật danh sách chặn (Realtime)");
                        const { data: allBlocks } = await supabase
                            .from('community_blocks')
                            .select('*')
                            .or(`user_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);
                            
                        if (allBlocks) {
                            myAppBlocks = allBlocks;
                            if (currentChatUserId && (uId === currentChatUserId || bId === currentChatUserId)) {
                                const status = await fetchBlockStatusDB(currentChatUserId);
                                updateBlockUI(status);
                            }
                        }
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR') {
                    console.warn("⚠️ Blocks subscription lỗi (không ảnh hưởng toast)");
                }
            });
    } catch(e) {
        console.warn("Không thể subscribe blocks:", e);
    }
}

/**
 * Subscribe riêng cho tin nhắn — có retry tự động
 */
function _subscribeToMessages() {
    globalMessageSubscription = supabase.channel('global-chat-notif-' + Date.now())
        .on(
            'postgres_changes',
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'community_messages',
                filter: `receiver_id=eq.${currentUser.id}`
            },
            async (payload) => {
                const msg = payload.new;
                console.log("📨 Có tin nhắn mới từ:", msg.sender_id);
                
                // Tự động bỏ ẩn hội thoại
                try {
                    await supabase.from('community_friends')
                        .update({ hidden_by: [], deleted_by: [] }) 
                        .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${msg.sender_id}),and(user_id.eq.${msg.sender_id},friend_id.eq.${currentUser.id})`);
                } catch (e) {
                    console.warn("Lỗi tự động bỏ ẩn:", e);
                }

                // Cập nhật badge
                loadChatList();

                // Toast + âm thanh
                const senderId = String(msg.sender_id).trim();
                const currentChatId = currentChatUserId ? String(currentChatUserId).trim() : null;
                // Chỉ coi là "đang chat" nếu THỰC SỰ đang nhìn khung chat (không phải đã rời đi)
                const chatEl = document.getElementById('commChatMessages');
                const isChatActuallyVisible = chatEl && chatEl.offsetHeight > 0;
                const isChattingWithSender = (currentCommView === 'chat' && currentChatId === senderId && isChatActuallyVisible);
                
                // Nếu tắt cả thông báo → không hiện toast + không phát âm thanh
                if (!isChattingWithSender && !isChatMuted(senderId)) {
                    try {
                        const { data: senderProfile } = await supabase
                            .from('profiles')
                            .select('display_name, avatar')
                            .eq('id', senderId)
                            .single();
                        
                        if (senderProfile) {
                            const senderName = senderProfile.display_name || 'Người dùng';
                            const senderAvatar = senderProfile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=random`;
                            
                            let preview = msg.content || '';
                            if (preview.startsWith('[STICKER]')) preview = '🎭 Sticker';
                            else if (preview.startsWith('[IMAGE]')) preview = '📷 Hình ảnh';
                            else if (preview.startsWith('[REPLY:')) {
                                const match = preview.match(/\]\s*(.*)$/s);
                                preview = match ? match[1].trim() : preview;
                            }
                            preview = preview.replace('[BLOCKED_MSG]', '').trim();
                            if (preview.length > 50) preview = preview.substring(0, 47) + '...';
                            
                            showChatToast(senderName, senderAvatar, preview, senderId);
                            
                            // Lưu notification vào DB (type: chat_message)
                            // Sẽ đánh dấu đã đọc khi user mở chat với người này
                            if (typeof sendNotification === 'function') {
                                sendNotification(
                                    currentUser.id,
                                    `💬 ${senderName}`,
                                    preview || 'Đã gửi tin nhắn cho bạn',
                                    'chat_message'
                                );
                            }
                        }
                    } catch (e) {
                        console.warn('Lỗi lấy thông tin người gửi:', e);
                    }
                    
                    // Phát âm thanh (chỉ khi không tắt sound riêng)
                    if (!isChatSoundOff(senderId)) {
                        playChatNotificationSound();
                    }
                }
            }
        )
        .subscribe((status) => {
            console.log("🔔 [Chat Notif] Status:", status);
            if (status === 'SUBSCRIBED') {
                console.log("✅ Đăng ký thông báo tin nhắn thành công!");
                _msgSubRetryCount = 0;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error("❌ Lỗi subscription:", status);
                // Retry tự động (tối đa 3 lần)
                if (_msgSubRetryCount < 3) {
                    _msgSubRetryCount++;
                    console.log("🔄 Retry lần " + _msgSubRetryCount + "...");
                    setTimeout(() => {
                        if (globalMessageSubscription) supabase.removeChannel(globalMessageSubscription);
                        _subscribeToMessages();
                    }, 2000 * _msgSubRetryCount);
                } else {
                    showNotification("⚠️ Không thể kết nối thông báo tin nhắn", "error");
                }
            }
        });
}

// 7.1 LOGIC TƯƠNG TÁC TIN NHẮN
function toggleMsgDropdown(event, msgId) {
    if (event) event.stopPropagation();
    
    // Đóng tất cả dropdown khác
    document.querySelectorAll('.comm-msg-dropdown.active').forEach(d => {
        if (d.id !== `dropdown-msg-${msgId}`) d.classList.remove('active');
    });

    const dropdown = document.getElementById(`dropdown-msg-${msgId}`);
    if (dropdown) {
        // Kiểm tra khoảng trống phía trên
        const button = event.currentTarget;
        const chatContainer = document.getElementById("commChatMessages");
        if (button && chatContainer) {
            const buttonRect = button.getBoundingClientRect();
            const containerRect = chatContainer.getBoundingClientRect();
            const spaceAbove = buttonRect.top - containerRect.top;

            // Nếu khoảng trống phía trên < 250px thì cho drop xuống dưới
            if (spaceAbove < 250) {
                dropdown.classList.add('dropdown-down');
            } else {
                dropdown.classList.remove('dropdown-down');
            }
        }

        const isActive = dropdown.classList.toggle('active');
        const parent = dropdown.parentElement;
        if (parent) {
            parent.classList.toggle('has-active-dropdown', isActive);
        }

        // Ngăn chặn click bên trong dropdown làm đóng chính nó
        if (isActive && !dropdown.dataset.hasListener) {
            dropdown.addEventListener('click', (e) => e.stopPropagation());
            dropdown.dataset.hasListener = "true";
        }
    }
}

// Click ra ngoài để đóng dropdown
document.addEventListener('click', () => {
    document.querySelectorAll('.comm-msg-dropdown.active').forEach(d => {
        d.classList.remove('active');
        const parent = d.parentElement;
        if (parent) parent.classList.remove('has-active-dropdown');
    });

    const pd = document.getElementById("commPinnedDropdown");
    if (pd) pd.classList.remove("active");

    // Đóng tất cả menu ghim (popup nhỏ)
    document.querySelectorAll('.comm-pinned-item-menu.active').forEach(m => m.classList.remove('active'));

    // Đóng tất cả dropdown của chat item (3 chấm)
    closeAllChatDropdowns();
});

async function copyMsgText(msgId) {
    const msgEl = document.getElementById(`msg-${msgId}`);
    if (!msgEl) return;
    
    const bubble = msgEl.querySelector('.comm-msg-bubble');
    if (!bubble) return;

    // Kiểm tra các loại nội dung đặc biệt
    const sticker = bubble.querySelector('img.comm-msg-sticker');
    const image = bubble.querySelector('img.comm-msg-image-content');
    
    if (image || sticker) {
        const url = (image || sticker).src;
        try {
            // Giải pháp tối ưu: Vẽ ảnh lên Canvas và export ra PNG chuẩn
            // Điều này giúp vượt qua các hạn chế định dạng của trình duyệt
            const img = new Image();
            img.crossOrigin = "anonymous"; // Cực kỳ quan trọng để xử lý ảnh từ domain khác
            
            img.onload = async () => {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    
                    canvas.toBlob(async (blob) => {
                        try {
                            const item = new ClipboardItem({ "image/png": blob });
                            await navigator.clipboard.write([item]);
                            showNotification("Đã copy hình ảnh (PNG) vào bộ nhớ tạm", "success");
                        } catch (err) {
                            throw err;
                        }
                    }, "image/png");
                } catch (e) {
                    // Fallback nếu canvas bị lỗi
                    navigator.clipboard.writeText(url).then(() => {
                        showNotification("Đã copy liên kết ảnh (do chính sách bảo mật)", "success");
                    });
                }
            };
            
            img.onerror = () => {
                // Fallback nếu không load được ảnh qua JS
                navigator.clipboard.writeText(url).then(() => {
                    showNotification("Đã copy liên kết ảnh", "success");
                });
            };
            
            img.src = url;
        } catch (err) {
            navigator.clipboard.writeText(url).then(() => {
                showNotification("Đã copy liên kết ảnh", "success");
            });
        }
        return;
    }

    // Mặc định copy text
    const textToCopy = bubble.innerText;
    navigator.clipboard.writeText(textToCopy).then(() => {
        showNotification("Đã copy tin nhắn vào bộ nhớ tạm", "success");
    }).catch(err => {
        console.error("Lỗi khi copy:", err);
        showNotification("Không thể copy tin nhắn", "error");
    });
}

async function recallMsg(msgId) {
    const ok = await showConfirmModal("Thu hồi tin nhắn", "Bạn có chắc chắn muốn thu hồi tin nhắn này?", "fas fa-undo-alt", "recall_msg");
    if (!ok) return;
    
    try {
        const { error } = await supabase
            .from('community_messages')
            .update({ content: 'Tin nhắn đã thu hồi', status: 'recalled' })
            .eq('id', msgId)
            .eq('sender_id', currentUser.id);

        if (error) throw error;
        showNotification("Đã thu hồi tin nhắn", "info");
        
        // Cập nhật lại danh sách hội thoại để hiện preview mới
        loadChatList();
    } catch (e) {
        console.error("Lỗi thu hồi:", e);
        showNotification("Không thể thu hồi tin nhắn", "error");
    }
}

async function deleteMsgForMe(msgId) {
    const ok = await showConfirmModal("Xóa tin nhắn", "Xóa tin nhắn này ở phía bạn? (Hành động này không thể hoàn tác)", "fas fa-trash-alt", "delete_msg");
    if (!ok) return;
    
    try {
        // 1. Lấy thông tin tin nhắn hiện tại để kiểm tra vai trò
        const { data: msg, error: fetchError } = await supabase
            .from('community_messages')
            .select('*')
            .eq('id', msgId)
            .single();
            
        if (fetchError || !msg) throw new Error("Không tìm thấy tin nhắn");

        const isSender = msg.sender_id === currentUser.id;
        const updateData = isSender ? { deleted_by_sender: true } : { deleted_by_receiver: true };

        // 2. Cập nhật flag xóa của người hiện tại
        const { data: updatedMsg, error: updateError } = await supabase
            .from('community_messages')
            .update(updateData)
            .eq('id', msgId)
            .select()
            .single();

        if (updateError) throw updateError;

        // 3. Ẩn ngay trên UI
        const el = document.getElementById(`msg-${msgId}`);
        if (el) {
            el.style.transition = 'all 0.3s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateX(20px)';
            setTimeout(() => el.remove(), 300);
        }

        // 4. [QUAN TRỌNG] Kiểm tra nếu cả hai bên đều đã xóa thì thực hiện Hard Delete (xóa khỏi DB)
        if (updatedMsg.deleted_by_sender && updatedMsg.deleted_by_receiver) {
            console.log("🗑️ Cả hai bên đã xóa, đang thực hiện xóa vĩnh viễn khỏi DB...");
            await supabase
                .from('community_messages')
                .delete()
                .eq('id', msgId);
        }

        showNotification("Đã xóa tin nhắn ở phía bạn", "info");

        // Cập nhật lại danh sách hội thoại để hiện preview mới
        loadChatList();
    } catch (e) {
        console.error("Lỗi xóa tin nhắn:", e);
        showNotification("Không thể xóa tin nhắn", "error");
    }
}

function shareMsg(msgId) {
    if (!msgId) return;
    openForwardModal(msgId);
}

function prepareReply(msgId) {
    const msgEl = document.getElementById(`msg-${msgId}`);
    if (!msgEl) return;

    const isMe = msgEl.classList.contains('sent');
    const senderName = isMe ? (currentUser.display_name || "Tôi") : (currentChatTarget ? currentChatTarget.display_name : "Bạn");
    
    // Đóng dropdown nếu mở từ đó
    document.querySelectorAll('.comm-msg-dropdown.active').forEach(d => d.classList.remove('active'));
    
    const bubble = msgEl.querySelector('.comm-msg-bubble');
    // Lấy text preview, bỏ qua phần reply cũ nếu có
    let text = "";
    const replyBody = bubble.querySelector('.comm-msg-reply-body');
    if (replyBody) {
        text = replyBody.innerText;
    } else {
        const sticker = bubble.querySelector('img.comm-msg-sticker');
        const image = bubble.querySelector('img.comm-msg-image-content');
        if (sticker) text = "[Sticker]";
        else if (image) text = "📷 Hình ảnh";
        else text = bubble.innerText;
    }

    replyingTo = {
        id: msgId,
        name: senderName,
        text: text.substring(0, 50) + (text.length > 50 ? "..." : "")
    };

    // Hiển thị thanh bar reply phía trên input (Sẽ cần CSS)
    showReplyBar();
}

function showReplyBar() {
    let bar = document.getElementById("commChatReplyBar");
    if (!bar) {
        const inputArea = document.querySelector(".comm-chat-input-area");
        bar = document.createElement("div");
        bar.id = "commChatReplyBar";
        bar.className = "comm-chat-reply-bar";
        inputArea.parentNode.insertBefore(bar, inputArea);
    }

    bar.innerHTML = `
        <div class="reply-content">
            <i class="fas fa-reply"></i>
            <div class="reply-text-wrapper">
                <span class="reply-name">Đang trả lời ${replyingTo.name}</span>
                <span class="reply-preview">${replyingTo.text}</span>
            </div>
        </div>
        <button class="reply-cancel" onclick="cancelReply()"><i class="fas fa-times"></i></button>
    `;
    bar.classList.add('active');
}

function cancelReply() {
    replyingTo = null;
    const bar = document.getElementById("commChatReplyBar");
    if (bar) bar.classList.remove('active');
}


/**
 * Hàm tải danh sách hội thoại - VIẾT LẠI HOÀN TOÀN
 */
async function loadChatList() {
    if (!currentUser) return;
    const container = document.getElementById("commChatList");
    if (!container) return;

    const myIdStr = String(currentUser.id).trim();
    console.log(`[CineChat] --- BẮT ĐẦU LOAD CHAT LIST (My ID: ${myIdStr}) ---`);

    try {
        // 1. Lấy dữ liệu hội thoại
        const { data: friendsData, error: fError } = await supabase
            .from('community_friends')
            .select('*')
            .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
            .eq('status', 'accepted');

        if (fError) throw fError;

        // 2. Lọc bỏ ẩn
        const activeChats = (friendsData || []).filter(chat => {
            const hiddenBy = Array.isArray(chat.hidden_by) ? chat.hidden_by : [];
            return !hiddenBy.some(id => String(id).trim() === myIdStr);
        });

        if (activeChats.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Không có hội thoại nào.</div>';
            return;
        }

        // 3. Lấy profile bạn bè
        const friendIds = activeChats.map(c => c.user_id === currentUser.id ? c.friend_id : c.user_id);
        const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar, last_seen')
            .in('id', friendIds);

        if (pError) throw pError;
        
        // 4. [CẬP NHẬT] Lấy TOÀN BỘ danh sách chặn liên quan (cả người chặn và người bị chặn)
        try {
            const { data: allBlocks, error: bError } = await supabase
                .from('community_blocks')
                .select('*')
                .or(`user_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);
            
            if (bError) {
                console.error("[CineChat] Lỗi lấy danh sách chặn:", bError);
                myAppBlocks = [];
            } else {
                myAppBlocks = allBlocks || [];
            }
        } catch (e) {
            console.error("[CineChat] Kiểm tra lại bảng community_blocks:", e);
            myAppBlocks = [];
        }

        const validBlocks = myAppBlocks.filter(b => {
             if (b.user_id !== currentUser.id) return false; // Chỉ lấy những người MÌNH chặn để lọc Sidebar
             if (b.duration_hours === -1) return true;
             const expiryTime = new Date(b.created_at).getTime() + (b.duration_hours * 3600 * 1000);
             return Date.now() < expiryTime;
        });

        // 5. Lấy tin nhắn mới nhất để hiển thị preview
        const { data: recentMessages, error: mError } = await supabase
            .from('community_messages')
            .select('id, sender_id, receiver_id, content, status, created_at, deleted_by_sender, deleted_by_receiver')
            .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(100);

        // [MỚI] Đếm số tin chưa đọc cho mỗi hội thoại
        const unreadCountMap = {};
        if (recentMessages) {
            recentMessages.forEach(msg => {
                const senderId = String(msg.sender_id).trim();
                // Chỉ đếm tin nhắn người khác gửi cho mình, chưa xem
                if (senderId !== myIdStr && String(msg.receiver_id).trim() === myIdStr && msg.status !== 'seen' && msg.status !== 'recalled') {
                    const isDeletedByMe = msg.deleted_by_receiver;
                    if (!isDeletedByMe) {
                        unreadCountMap[senderId] = (unreadCountMap[senderId] || 0) + 1;
                    }
                }
            });
        }

        // Tạo map friendId -> tin nhắn mới nhất
        const latestMsgMap = {};
        if (recentMessages) {
            recentMessages.forEach(msg => {
                const myId = String(currentUser.id).trim();
                const senderId = String(msg.sender_id).trim();
                const receiverId = String(msg.receiver_id).trim();
                
                // Kiểm tra xem tin nhắn này có bị mình xóa không
                const isDeletedByMe = (senderId === myId) ? msg.deleted_by_sender : msg.deleted_by_receiver;
                if (isDeletedByMe) return; // Bỏ qua tin nhắn đã xóa ở phía mình

                // [MỚI] Lọc tin nhắn của người bị mình chặn
                const blockEntry = validBlocks.find(b => String(b.blocked_id).trim() === senderId);
                if (blockEntry) {
                    const blockTime = new Date(blockEntry.created_at).getTime();
                    const msgTime = new Date(msg.created_at).getTime();
                    if (msgTime >= blockTime) return; // Bỏ qua tin nhắn này nếu gửi sau lúc chặn
                }

                const friendId = (senderId === myId) ? receiverId : senderId;
                if (!latestMsgMap[friendId]) {
                    latestMsgMap[friendId] = msg;
                }
            });
        }

        // 5. Xử lý dữ liệu hiển thị
        let displayItems = profiles.map(profile => {
            const row = activeChats.find(c => String(c.user_id).trim() === String(profile.id).trim() || String(c.friend_id).trim() === String(profile.id).trim());
            const pinnedBy = Array.isArray(row.pinned_by) ? row.pinned_by : [];
            
            // So sánh ID cực kỳ cẩn thận
            const isPinned = pinnedBy.some(id => String(id).trim() === myIdStr);

            // Lấy nội dung tin nhắn cuối
            const friendIdStr = String(profile.id).trim();
            const lastMsgObj = latestMsgMap[friendIdStr];
            let lastMsgText = "Nhấn để bắt đầu chat";
            
            if (lastMsgObj) {
                const myId = String(currentUser.id).trim();
                const senderId = String(lastMsgObj.sender_id).trim();
                const isFromMe = (senderId === myId);
                const content = lastMsgObj.content || "";
                
                if (lastMsgObj.status === 'recalled' || content === 'Tin nhắn đã thu hồi' || content === '[Tin nhắn đã thu hồi]') {
                    lastMsgText = "Tin nhắn đã thu hồi";
                } else if (lastMsgObj.status === 'deleted') {
                    lastMsgText = "Tin nhắn đã bị xóa";
                } else if (content.startsWith('[STICKER]')) {
                    lastMsgText = (isFromMe ? "Bạn: " : "") + "[Sticker]";
                } else if (content.startsWith('[IMAGE]')) {
                    lastMsgText = (isFromMe ? "Bạn: " : "") + "📷 Hình ảnh";
                } else if (content.startsWith('[REPLY:')) {
                    // Trích xuất nội dung chính sau phần [REPLY:...]
                    const mainContentMatch = content.match(/\]\s*(.*)$/s);
                    const mainContent = mainContentMatch ? mainContentMatch[1].trim() : content;
                    lastMsgText = (isFromMe ? "Bạn: " : "") + mainContent;
                } else {
                    lastMsgText = (isFromMe ? "Bạn: " : "") + content.replace("[BLOCKED_MSG]", "").trim();
                }
                
                // Trình bày ngắn gọn
                if (lastMsgText.length > 35) lastMsgText = lastMsgText.substring(0, 32) + "...";
            }

            // [MỚI] Lấy số tin chưa đọc cho hội thoại này
            const unreadCount = unreadCountMap[friendIdStr] || 0;

            return {
                ...profile,
                rowId: row.id,
                isPinned: isPinned,
                lastMsg: lastMsgText,
                last_seen: profile.last_seen,
                unreadCount: unreadCount
            };
        });

        // Sắp xếp: Ghim lên đầu
        displayItems.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

        console.log("[CineChat] Danh sách sau khi xử lý ghim:");
        console.table(displayItems.map(i => ({ Tên: i.display_name, 'Ghim?': i.isPinned, 'FriendID': i.id })));
        // 6. Render HTML
        container.innerHTML = displayItems.map(item => {
            const avatar = item.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.display_name)}&background=random`;
            const isActive = currentChatUserId === item.id;
            const isPresenceOnline = userPresenceMap.get(String(item.id).trim())?.online;
            const lastSeenDate = item.last_seen ? new Date(item.last_seen) : null;
            const isRecentlyActive = lastSeenDate && (new Date() - lastSeenDate < 80000);
            const isOnline = isPresenceOnline || isRecentlyActive;
            
            // [MỚI] Xác định có tin chưa đọc không (ẩn badge nếu đang active)
            const showUnread = item.unreadCount > 0 && !isActive;

            return `
                <div class="comm-chat-item ${isActive ? 'active' : ''} ${item.isPinned ? 'pinned' : ''} ${showUnread ? 'has-unread' : ''}" 
                     id="chat-item-${item.id}"
                     data-user-id="${item.id}"
                     data-user-name="${item.display_name}"
                     data-last-seen="${item.last_seen || ''}"
                     onclick="openChat('${item.id}', '${item.display_name.replace(/'/g, "\\'")}', '${avatar}')">
                    
                    ${item.isPinned ? '<div class="comm-pinned-badge"><i class="fas fa-thumbtack"></i> GHIM</div>' : ''}
                    
                    <div class="comm-chat-item-avatar">
                        <img src="${avatar}">
                        <div class="comm-online-indicator" style="background: ${isOnline ? '#4caf50' : '#888'}"></div>
                    </div>
                    <div class="comm-chat-item-info">
                        <div class="comm-chat-item-name">${item.display_name}</div>
                        <div class="comm-chat-item-status" data-last-seen="${item.last_seen || ''}"></div>
                        <div class="comm-chat-item-msg">${item.lastMsg}</div>
                    </div>
                    ${showUnread ? `<div class="comm-unread-badge">${item.unreadCount > 99 ? '99+' : item.unreadCount}</div>` : ''}

                    <div class="comm-chat-item-actions">
                        <button class="comm-chat-btn-more" onclick="event.stopPropagation(); toggleChatItemDropdown(event, '${item.id}')">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        
                        <div class="comm-chat-item-dropdown" id="dropdown-chat-${item.id}">
                            <div class="comm-chat-dropdown-item" onclick="event.stopPropagation(); processPin('${item.rowId}', ${item.isPinned})">
                                <i class="fas fa-thumbtack" style="${item.isPinned ? 'color: #ffcc00' : ''}"></i> 
                                ${item.isPinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
                            </div>
                            <div class="comm-chat-dropdown-item" onclick="event.stopPropagation(); processHide('${item.rowId}', '${item.id}')">
                                <i class="fas fa-eye-slash"></i> Ẩn trò chuyện
                            </div>
                            <div class="comm-chat-dropdown-divider"></div>
                            <div class="comm-chat-dropdown-item delete" onclick="event.stopPropagation(); processDelete('${item.rowId}', '${item.id}')">
                                <i class="fas fa-trash-alt"></i> Xóa hội thoại
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        if (typeof refreshPresenceUI === 'function') refreshPresenceUI();

        // [MỚI] Cập nhật badge tổng trên nav CineChat
        updateNavUnreadBadge(displayItems);

    } catch (e) {
        console.error("[CineChat] Lỗi loadChatList:", e);
    }
}

/**
 * Xử lý Ghim (Pin) - v4.7 Bulletproof
 */
async function processPin(rowId, currentPinnedStatus) {
    if (!currentUser || !rowId) {
        console.error("[CineChat] Thiếu thông tin để Ghim:", { currentUser, rowId });
        return;
    }
    
    try {
        const myId = String(currentUser.id).trim();
        console.log(`[CineChat] --- Bắt đầu ${currentPinnedStatus ? 'BỎ GHIM' : 'GHIM'} ---`);
        console.log(`[CineChat] Row ID: ${rowId}, My ID: ${myId}`);
        
        // 1. Lấy trạng thái mới nhất từ DB
        const { data: currentData, error: fetchErr } = await supabase
            .from('community_friends')
            .select('pinned_by, user_id, friend_id')
            .eq('id', rowId)
            .single();

        if (fetchErr) throw fetchErr;

        let pinnedBy = Array.isArray(currentData.pinned_by) ? [...currentData.pinned_by] : [];
        // Làm sạch mảng (ép kiểu string cho tất cả)
        pinnedBy = pinnedBy.map(id => String(id).trim());

        if (currentPinnedStatus) {
            pinnedBy = pinnedBy.filter(id => id !== myId);
        } else {
            if (!pinnedBy.includes(myId)) pinnedBy.push(myId);
        }

        console.log("[CineChat] Mảng pinned_by mới chuẩn bị gửi:", pinnedBy);

        // 2. Cập nhật DB và YÊU CẦU TRẢ VỀ DỮ LIỆU MỚI (.select())
        const { data: updatedRows, error: updateErrCount } = await supabase
            .from('community_friends')
            .update({ pinned_by: pinnedBy })
            .eq('id', rowId)
            .select();

        if (updateErrCount) throw updateErrCount;

        // KIỂM TRA THỰC TẾ: Supabase update thành công nhưng có trúng dòng nào không?
        if (!updatedRows || updatedRows.length === 0) {
            console.error("[CineChat] CRITICAL: Update thành công nhưng 0 dòng bị ảnh hưởng!");
            showNotification("Lỗi: Không có quyền cập nhật dòng này (Kiểm tra RLS Database)", "error");
            return;
        }

        const actualPinnedBy = updatedRows[0].pinned_by || [];
        console.log("[CineChat] Dữ liệu thực tế từ SERVER sau khi update:", actualPinnedBy);

        // Kiểm tra xem ID của mình có thực sự nằm trong mảng vừa lưu không
        const isActuallySaved = actualPinnedBy.some(id => String(id).trim() === myId);
        
        if (!currentPinnedStatus && !isActuallySaved) {
            console.warn("[CineChat] WARNING: Bạn đã ghim nhưng Server không lưu ID của bạn!");
            showNotification("Database không lưu được trạng thái Ghim. Vui lòng kiểm tra phân quyền.", "warning");
        } else {
            showNotification(currentPinnedStatus ? "Đã bỏ ghim" : "Đã ghim hội thoại thành công", "success");
        }
        
        // 3. Đợi 200ms cho DB ổn định rồi load lại
        setTimeout(() => loadChatList(), 200);

    } catch (err) {
        console.error("[CineChat] Lỗi triệt để processPin:", err);
        showNotification("Lỗi kỹ thuật: " + err.message, "error");
    } finally {
        closeAllChatDropdowns();
    }
}

/**
 * Xử lý Ẩn (Hide) - VIẾT LẠI HOÀN TOÀN
 */
async function processHide(rowId, targetUserId) {
    if (!currentUser || !rowId) return;
    try {
        const { data, error: fError } = await supabase
            .from('community_friends')
            .select('hidden_by')
            .eq('id', rowId)
            .single();

        if (fError) throw fError;

        let hiddenBy = Array.isArray(data.hidden_by) ? data.hidden_by : [];
        const myId = String(currentUser.id);

        if (!hiddenBy.some(id => String(id) === myId)) {
            hiddenBy.push(myId);
        }

        const { error: uError } = await supabase
            .from('community_friends')
            .update({ hidden_by: hiddenBy })
            .eq('id', rowId);

        if (uError) throw uError;

        showNotification("Đã ẩn cuộc trò chuyện", "info");
        if (currentChatUserId === targetUserId) switchCommView('chat');
        await loadChatList();

    } catch (err) {
        console.error("[CineChat] Lỗi khi ẩn:", err);
    } finally {
        closeAllChatDropdowns();
    }
}

/**
 * Xử lý Xóa (Delete/Hard-Delete) - VIẾT LẠI HOÀN TOÀN
 */
async function processDelete(rowId, targetUserId) {
    if (!currentUser || !rowId) return;
    
    const confirm = await showConfirmModal("Xác nhận xóa?", "Tin nhắn sẽ biến mất khỏi danh sách của bạn. Nếu cả 2 cùng xóa, toàn bộ dữ liệu sẽ được quét sạch khỏi hệ thống.", "fas fa-trash-alt", "delete_conv");
    if (!confirm) return;

    try {
        // 1. Lấy thông tin hiện tại - dùng id trực tiếp
        const { data, error: fError } = await supabase
            .from('community_friends')
            .select('*')
            .eq('id', rowId)
            .single();

        if (fError) throw fError;

        let deletedBy = Array.isArray(data.deleted_by) ? data.deleted_by : [];
        let hiddenBy = Array.isArray(data.hidden_by) ? data.hidden_by : [];
        const myId = String(currentUser.id);

        if (!deletedBy.some(id => String(id) === myId)) deletedBy.push(myId);
        if (!hiddenBy.some(id => String(id) === myId)) hiddenBy.push(myId);

        // 2. Cập nhật DB
        const { error: uError } = await supabase
            .from('community_friends')
            .update({ deleted_by: deletedBy, hidden_by: hiddenBy })
            .eq('id', rowId);

        if (uError) throw uError;

        // 3. Xử lý Hard Delete nếu cần
        const otherId = (data.user_id === currentUser.id) ? data.friend_id : data.user_id;
        
        if (deletedBy.some(id => String(id) === String(otherId))) {
            console.log("🔥 Đã xác nhận cả 2 bên cùng xóa. Đang quét sạch database...");
            await supabase
                .from('community_messages')
                .delete()
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUser.id})`);
            
            showNotification("Cả hai đã xóa. Toàn bộ tin nhắn đã được quét sạch.", "success");
        } else {
            showNotification("Đã xóa hội thoại phía bạn.", "info");
        }

        if (currentChatUserId === targetUserId) switchCommView('chat');
        await loadChatList();

    } catch (err) {
        console.error("[CineChat] Lỗi khi xóa:", err);
    } finally {
        closeAllChatDropdowns();
    }
}

// XÓA CÁC HÀM CŨ Ở CUỐI FILE VÌ ĐÃ ĐƯA LÊN ĐẦU

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

        /* Dùng CSS class thay inline style để responsive mobile hoạt động */
        let html = `<div class="comm-friends-grid">`;
        
        profiles.forEach(user => {
            const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name)}&background=random`;
            // Kiểm tra trạng thái online từ userPresenceMap
            const presence = userPresenceMap.get(String(user.id).trim());
            const isOnline = presence?.online === true;
            const dotClass = isOnline ? 'online' : 'offline';
            
            html += `
                <div class="comm-post-card comm-friend-card" data-friend-id="${user.id}">
                    <div class="comm-friend-avatar-wrap">
                        <img src="${avatar}" onclick="viewUserProfile('${user.id}')" class="comm-friend-avatar" alt="${user.display_name}">
                        <span class="comm-friend-online-dot ${dotClass}"></span>
                    </div>
                    <div class="comm-friend-info">
                        <h3 onclick="viewUserProfile('${user.id}')" class="comm-friend-name">${user.display_name} ${user.role==='admin' ? '<i class="fas fa-check-circle" style="color:#4db8ff; font-size:0.75em;" title="Admin"></i>' : ''}</h3>
                        <p class="comm-friend-role"><i class="fas fa-user-check" style="font-size:0.6em;"></i> ${isOnline ? '<span style="color:#4caf50;">Đang hoạt động</span>' : 'Bạn bè'}</p>
                    </div>
                    <div class="comm-friend-actions">
                        <button class="comm-btn-follow" onclick="openChat('${user.id}', '${user.display_name.replace(/'/g, "\\'")}', '${avatar}')"><i class="fas fa-comment-dots"></i> Chat</button>
                        <button class="comm-btn-profile" onclick="viewUserProfile('${user.id}')" title="Xem trang cá nhân"><i class="fas fa-user"></i></button>
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
    let query = event.target.value.trim();
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
            let data, error;

            // Kiểm tra nếu nhập URI QR: tramphim://user/<uuid>
            if (query.startsWith('tramphim://user/')) {
                const userId = query.replace('tramphim://user/', '').trim();
                ({ data, error } = await supabase
                    .from('profiles')
                    .select('id, display_name, avatar, role')
                    .eq('id', userId)
                    .limit(1));
            }
            // Kiểm tra nếu nhập @id — partial match ngay từ 2 ký tự
            else if (query.startsWith('@')) {
                const userId = query.substring(1).trim().toLowerCase(); // Bỏ ký tự @
                if (!userId || userId.length < 2) {
                    resultsContainer.innerHTML = `<p class="text-muted" style="font-size: 0.85rem; text-align: center; padding: 10px;">Nhập thêm vài ký tự ID... (VD: @3a5b...)</p>`;
                    return;
                }
                // Supabase không hỗ trợ ilike trên UUID, fetch rồi filter JS
                const { data: allProfiles, error: fetchErr } = await supabase
                    .from('profiles')
                    .select('id, display_name, avatar, role')
                    .neq('id', currentUser ? currentUser.id : '00000000-0000-0000-0000-000000000000')
                    .limit(500);
                error = fetchErr;
                data = allProfiles ? allProfiles.filter(p => p.id.toLowerCase().includes(userId)).slice(0, 8) : [];
            }
            // Tìm theo tên (logic gốc)
            else {
                ({ data, error } = await supabase
                    .from('profiles')
                    .select('id, display_name, avatar, role')
                    .ilike('display_name', `%${query}%`)
                    .neq('id', currentUser ? currentUser.id : '00000000-0000-0000-0000-000000000000')
                    .limit(5));
            }
                
            if (error) throw error;
            
            if (!data || data.length === 0) {
                resultsContainer.innerHTML = `<p class="text-muted" style="font-size: 0.85rem; text-align: center; padding: 10px;">Không tìm thấy ai</p>`;
                return;
            }

            // Lấy danh sách bạn bè + lời mời đã gửi để hiển thị nút phù hợp
            let friendIds = new Set();
            let pendingIds = new Set();
            if (currentUser) {
                const { data: friends } = await supabase
                    .from('community_friends')
                    .select('user_id, friend_id, status')
                    .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`);
                if (friends) {
                    friends.forEach(f => {
                        const otherId = f.user_id === currentUser.id ? f.friend_id : f.user_id;
                        if (f.status === 'accepted') friendIds.add(otherId);
                        else if (f.status === 'pending' && f.user_id === currentUser.id) pendingIds.add(otherId);
                    });
                }
            }
            
            resultsContainer.innerHTML = data.map(user => {
                const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name)}&background=random`;
                // Hiển thị ID rút gọn nếu tìm bằng @id
                const idBadge = query.startsWith('@') || query.startsWith('tramphim://')
                    ? `<span style="font-size: 0.7rem; color: var(--text-muted); display: block;">ID: ${user.id.slice(0, 8)}...</span>`
                    : '';
                
                // Nút hành động tùy theo trạng thái bạn bè
                let actionBtn = '';
                if (friendIds.has(user.id)) {
                    // Đã là bạn bè → nút Chat
                    actionBtn = `<button class="comm-btn-follow" style="padding: 4px 8px; font-size: 0.75rem" onclick="openChat('${user.id}', '${user.display_name.replace(/'/g, "\\'")}', '${avatar}')"><i class="fas fa-comment-dots"></i> Chat</button>`;
                } else if (pendingIds.has(user.id)) {
                    // Đã gửi lời mời → nút disabled
                    actionBtn = `<button class="comm-btn-follow" style="padding: 4px 8px; font-size: 0.75rem; opacity: 0.5; cursor: default;" disabled>Đã gửi</button>`;
                } else {
                    // Chưa kết bạn → nút Kết bạn
                    actionBtn = `<button class="comm-btn-follow" style="padding: 4px 8px; font-size: 0.75rem" onclick="sendFriendRequest('${user.id}')">Kết bạn</button>`;
                }

                return `
                    <div class="comm-user-item" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                        <div class="comm-user-info" onclick="event.stopPropagation(); document.getElementById('commSearchResults').style.display='none'; document.getElementById('commSearchUserInput').value=''; viewUserProfile('${user.id}')" style="cursor: pointer; display: flex; align-items: center; gap: 10px;">
                            <img src="${avatar}" style="width: 30px; height: 30px; border-radius: 50%;">
                            <div>
                                <span class="name" style="font-size: 0.9rem;">${user.display_name}</span>
                                ${idBadge}
                            </div>
                        </div>
                        ${actionBtn}
                    </div>
                `;
            }).join("");
            
        } catch (e) {
            console.error("Lỗi tìm kiếm:", e);
            resultsContainer.innerHTML = `<p class="text-danger" style="font-size: 0.85rem; text-align: center; padding: 10px;">Lỗi tìm kiếm</p>`;
        }
    }, 500); // debounce 500ms
}

/**
 * Toggle hiện/ẩn phần mã QR của tôi trong modal
 */
function toggleMyQRCode() {
    const section = document.getElementById('qrMyCodeSection');
    const btn = document.querySelector('.comm-qr-toggle-btn');
    if (!section) return;

    const isHidden = section.style.display === 'none';
    section.style.display = isHidden ? 'flex' : 'none';

    if (btn) {
        btn.classList.toggle('active', isHidden);
        // Đổi text nút
        const icon = btn.querySelector('.fa-qrcode');
        if (icon) icon.nextSibling.textContent = isHidden ? ' Ẩn mã QR của tôi' : ' Hiện mã QR của tôi';
    }
}

/**
 * Mở modal QR để tìm kiếm user từ nút QR trên ô tìm kiếm
 * Sử dụng lại modal QR đã tạo, nhưng focus vào phần tìm kiếm
 */
function openSearchQRModal() {
    const modal = document.getElementById('commUserQRModal');
    if (!modal) {
        showNotification('Modal QR chưa sẵn sàng', 'warning');
        return;
    }

    // Cập nhật thông tin QR cho user hiện tại (mình)
    if (currentUser) {
        const avatarEl = document.getElementById('qrUserAvatar');
        const nameEl = document.getElementById('qrUserName');
        const usernameEl = document.getElementById('qrUserUsername');

        const myName = currentUser.displayName || currentUser.display_name || 'User';
        const myAvatar = currentUser.photoURL || currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(myName)}&background=random`;

        if (avatarEl) avatarEl.src = myAvatar;
        if (nameEl) nameEl.textContent = myName;
        if (usernameEl) usernameEl.textContent = `@${currentUser.id.slice(0, 8)}`;

        // Tạo QR cho chính mình
        generateUserQR(currentUser.id);
    }

    // Hiện modal
    modal.style.display = 'flex';
    modal.classList.add('active');

    // Focus vào ô tìm kiếm trong modal QR
    setTimeout(() => {
        const searchInput = document.getElementById('qrSearchInput');
        if (searchInput) searchInput.focus();
    }, 300);
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

            // 1. Có lời mời kết bạn mới (INSERT)
            if (payload.eventType === 'INSERT' && row.friend_id === currentUser.id && row.status === 'pending') {
                showNotification("Bạn có 1 lời mời kết bạn mới!", "info");
                if (typeof fetchFriendRequests === 'function') fetchFriendRequests();
                
                // Lưu notification lời mời kết bạn
                if (typeof sendNotification === 'function') {
                    (async () => {
                        try {
                            const { data: senderProfile } = await supabase.from('profiles').select('display_name').eq('id', row.user_id).single();
                            const senderName = senderProfile?.display_name || 'Người dùng';
                            sendNotification(currentUser.id, `👋 Lời mời kết bạn`, `${senderName} đã gửi lời mời kết bạn cho bạn`, 'friend_request');
                        } catch(e) { console.warn('Lỗi gửi notif kết bạn:', e); }
                    })();
                }
            }
            
            // 2. Chấp nhận kết bạn (UPDATE -> accepted)
            if (payload.eventType === 'UPDATE' && row.status === 'accepted') {
                // KIỂM TRA THÔNG MINH (v4.8): Chỉ hiện thông báo nếu trạng thái thực sự thay đổi từ pending -> accepted
                // Tránh hiện thông báo khi người dùng chỉ đang Ghim/Xóa/Ẩn hội thoại
                const oldStatus = payload.old ? payload.old.status : null;
                const isActualApproval = oldStatus === 'pending';

                if (row.user_id === currentUser.id || row.friend_id === currentUser.id) {
                    if (isActualApproval) {
                        showNotification("Có 1 yêu cầu kết bạn đã được phê duyệt!", "success");
                        
                        // Lưu notification chấp nhận kết bạn cho người gửi lời mời
                        if (typeof sendNotification === 'function') {
                            const recipientId = (row.user_id === currentUser.id) ? row.friend_id : row.user_id;
                            (async () => {
                                try {
                                    const { data: accepterProfile } = await supabase.from('profiles').select('display_name').eq('id', currentUser.id).single();
                                    const accepterName = accepterProfile?.display_name || 'Người dùng';
                                    sendNotification(recipientId, `🤝 Đã kết bạn`, `${accepterName} đã chấp nhận lời mời kết bạn của bạn`, 'friend_accepted');
                                } catch(e) { console.warn('Lỗi gửi notif accepted:', e); }
                            })();
                        }
                    }
                    
                    // Cập nhật UI (Luôn cập nhật nếu có thay đổi để đảm bảo đồng bộ Ghim/Ẩn/Xóa)
                    if (currentCommView === 'friends' && typeof renderFriendsView === 'function') renderFriendsView();
                    if (currentCommView === 'chat' && typeof loadChatList === 'function') loadChatList();
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
let peerRetryCount = 0; // v10.0: Thêm biến giới hạn số lần thử lại
const MAX_PEER_RETRIES = 3;

let isAudioMuted = false;
let isVideoMuted = false;
let isCallMinimized = false;
let ringTimeout = null;
let callTimerInterval = null; // Interval dem thoi gian cuoc goi
let callSeconds = 0; // So giay cuoc goi

// --- AUDIO CHUÔNG CUỘC GỌI ---
const incomingRingtone = new Audio("assets/incoming_call.wav");
incomingRingtone.loop = true;
const callingRingtone = new Audio("assets/calling_tone.wav"); // Tiếng tút tút khi gọi
callingRingtone.loop = true;

function stopAllRingtones() {
    try {
        incomingRingtone.pause();
        incomingRingtone.currentTime = 0;
        callingRingtone.pause();
        callingRingtone.currentTime = 0;
    } catch(e) { console.error("Lỗi ngắt chuông:", e); }
}

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

    // v9.5: ĐIỀU QUAN TRỌNG - Phải dọn dẹp instance cũ trước khi tạo mới
    if (myCommPeer) {
        console.log("♻️ Dọn dẹp Peer cũ trước khi khởi tạo mới...");
        try {
            myCommPeer.off("error"); // Gỡ bỏ các listener cũ để tránh loop
            myCommPeer.off("call");
            myCommPeer.disconnect();
            myCommPeer.destroy();
        } catch(e) {}
        myCommPeer = null;
    }
    
    // Dùng ID người dùng làm PeerID (Thêm tiền tố để tránh đụng với Watch Party nếu chạy song song)
    const peerId = "cinechat_" + currentUser.id;
    
    myCommPeer = new Peer(peerId, {
        host: "0.peerjs.com",
        port: 443,
        path: "/",
        debug: 0, // v10.0: Giảm debug xuống 0 để console sạch sẽ tuyệt đối
    });

    // v10.0: Tối ưu logic xử lý lỗi trùng ID
    myCommPeer.on("error", (err) => {
        if (err.type === 'id-taken') {
            if (peerRetryCount < MAX_PEER_RETRIES) {
                peerRetryCount++;
                console.warn(`⚠️ Peer ID bị trùng (Lần ${peerRetryCount}). Đang thử kết nối lại sau 3s...`);
                
                setTimeout(() => {
                    if (myCommPeer && !myCommPeer.destroyed) {
                        setupCommPeer();
                    }
                }, 3000);
            } else {
                console.error("❌ Không thể khởi tạo PeerJS sau nhiều lần thử. Có thể bạn đang mở web trên tab khác.");
            }
            return;
        }
        
        // Nếu là lỗi máy chủ hoặc kết nối, thử reconnect
        if (err.type === 'server-error' || err.type === 'network') {
             console.warn("🌐 Lỗi kết nối PeerJS, đang thử kết nối lại...");
             setTimeout(() => myCommPeer.reconnect(), 5000);
             return;
        }

        console.error("❌ CineChat Peer lỗi:", err);
    });

    myCommPeer.on("open", () => {
        console.log("✅ CineChat Peer đã sẵn sàng với ID:", myCommPeer.id);
        peerRetryCount = 0; // Reset số lần thử khi thành công
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
        
        // Phát âm thanh chuông gọi đến
        incomingRingtone.play().catch(e => console.log("Lỗi phát chuông incoming:", e));
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
        
        // Phát chuông chờ cuộc gọi (tiếng tút tút)
        callingRingtone.play().catch(e => console.log("Lỗi phát chuông calling:", e));
        
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
    
    // Ngắt chuông báo cuộc gọi
    stopAllRingtones();
    
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
        // Ngắt nhạc chuông báo
        stopAllRingtones();
        
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
        
        // Ngắt tiếng tút tút chờ cuộc gọi
        stopAllRingtones();
        
        // Khi nhận được luồng của người kia
        console.log("🔗 Nhận stream từ", call.peer);
        document.getElementById("activeCallStatus").textContent = "Đã kết nối";
        const remoteVidEl = document.getElementById("remoteVideo");
        remoteVidEl.srcObject = remoteStream;
        
        // Bắt đầu đếm thời gian cuộc gọi
        startCallTimer();
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
    
    // Nếu chỉ gọi audio, hiện placeholder + ẩn khung camera local
    const audioPlaceholder = document.getElementById("audioCallPlaceholder");
    const localVidPreview = document.getElementById("localVideo");
    if (!isVideo) {
        audioPlaceholder.style.display = "flex";
        localVidPreview.style.display = "none"; // Ẩn khung cam khi gọi thoại
        // Lấy avatar của người đang gọi nhét vào
        const targetAvatar = isInitiator ? 
              document.getElementById("commChatTargetAvatar")?.src : 
              document.getElementById("incomingCallAvatar")?.src;
              
        if (targetAvatar) document.getElementById("activeCallAvatar").src = targetAvatar;
    } else {
        audioPlaceholder.style.display = "none";
        localVidPreview.style.display = ""; // Hiện khung cam khi gọi video
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
    
    // Toggle placeholder + ẩn/hiện khung camera local
    const audioPlaceholder = document.getElementById("audioCallPlaceholder");
    const localVidPreview = document.getElementById("localVideo");
    if(isVideoMuted) {
        audioPlaceholder.style.display = "flex";
        localVidPreview.style.display = "none"; // Ẩn khung cam khi tắt
    } else {
        audioPlaceholder.style.display = "none";
        localVidPreview.style.display = ""; // Hiện khung cam khi bật
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

// Bộ đếm thời gian cuộc gọi (MM:SS)
function startCallTimer() {
    stopCallTimer(); // Reset nếu đang chạy
    callSeconds = 0;
    const timerEl = document.getElementById("callTimerDisplay");
    
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const secs = String(callSeconds % 60).padStart(2, '0');
        const timeStr = `${mins}:${secs}`;
        
        // Cập nhật timer trên thanh minimize
        if (timerEl) timerEl.textContent = timeStr;
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    callSeconds = 0;
    const timerEl = document.getElementById("callTimerDisplay");
    if (timerEl) timerEl.textContent = "00:00";
}

// Tái sử dụng logic kéo thả chuẩn xác của Mini Player (Chống dính chuột, khóa cuộn)
function dragElement(elmnt) {
    // Gắn drag vào chính element để kéo được cả khi minimize (header bị ẩn)
    const target = elmnt;
    
    // Cleanup cũ để tránh thêm event nhiều lần
    if (elmnt._dragCleanup) elmnt._dragCleanup();

    let isDragging = false;
    let startX, startY, startTop, startLeft;

    // --- MOUSE DRAG ---
    function onMouseDown(e) {
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
        
        // Thêm thời lượng cuộc gọi vào tin nhắn hệ thống
        let durationStr = "";
        if (callSeconds > 0) {
            const m = Math.floor(callSeconds / 60);
            const s = callSeconds % 60;
            if (m > 0) durationStr = ` (${m} phút ${s} giây)`;
            else durationStr = ` (${s} giây)`;
        }
        
        sendSystemCallLog(isVideo ? `📹 Cuộc gọi Video kết thúc${durationStr}` : `📞 Cuộc gọi thoại kết thúc${durationStr}`, peerId);
        
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
    
    // Ngắt tất cả âm thanh chuông bị kẹt (nếu có)
    stopAllRingtones();
    
    // Dừng bộ đếm thời gian cuộc gọi
    stopCallTimer();
    
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

// --- PINNED MESSAGES LOGIC ---
async function loadPinnedMessages() {
    if (!currentChatUserId || !currentUser) return;
    
    try {
        const { data, error } = await supabase
            .from('community_messages')
            .select('id, content, sender_id')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatUserId}),and(sender_id.eq.${currentChatUserId},receiver_id.eq.${currentUser.id})`)
            .eq('is_pinned', true)
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;
        
        currentPinnedMessages = data.map(msg => ({
            id: msg.id,
            content: msg.content,
            senderName: msg.sender_id === currentUser.id ? (currentUser.display_name || 'Tôi') : (currentChatTarget ? currentChatTarget.display_name : 'Bạn')
        }));
    } catch (e) {
        console.warn('is_pinned column might not exist. Fallback to LocalStorage.', e.message);
        const stored = localStorage.getItem(`pinned_${currentUser.id}_${currentChatUserId}`);
        currentPinnedMessages = stored ? JSON.parse(stored) : [];
    }
    renderPinnedBanner();
}

async function togglePinMsg(msgId) {
    document.querySelectorAll('.comm-msg-dropdown.active').forEach(d => d.classList.remove('active'));

    const isPinned = currentPinnedMessages.some(m => m.id === msgId);
    
    if (!isPinned) {
        if (currentPinnedMessages.length >= 5) {
            showNotification('Chỉ được ghim tối đa 5 tin nhắn!', 'warning');
            return;
        }
        
        const msgEl = document.getElementById(`msg-${msgId}`);
        if (!msgEl) return;

        const isMe = msgEl.classList.contains('sent');
        const senderName = isMe ? (currentUser.display_name || 'Tôi') : (currentChatTarget ? currentChatTarget.display_name : 'Bạn');
        
        const bubble = msgEl.querySelector('.comm-msg-bubble');
        let text = '';
        const replyBody = bubble.querySelector('.comm-msg-reply-body');
        if (replyBody) text = replyBody.innerText;
        else {
            const sticker = bubble.querySelector('img.comm-msg-sticker');
            text = sticker ? '[Sticker]' : bubble.innerText;
        }

        currentPinnedMessages.push({
            id: msgId,
            content: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
            senderName: senderName
        });
        showNotification('Đã ghim tin nhắn', 'success');
    } else {
        currentPinnedMessages = currentPinnedMessages.filter(m => m.id !== msgId);
        showNotification('Đã bỏ ghim', 'info');
    }
    
    // Save state
    try {
        await supabase.from('community_messages').update({ is_pinned: !isPinned }).eq('id', msgId);
    } catch (e) {} // Ignore if column doesn't exist
    localStorage.setItem(`pinned_${currentUser.id}_${currentChatUserId}`, JSON.stringify(currentPinnedMessages));
    
    renderPinnedBanner();
}

function renderPinnedBanner() {
    const banner = document.getElementById('commChatPinnedBanner');
    if (!banner) return;

    if (currentPinnedMessages.length === 0) {
        banner.style.display = 'none';
        isPinnedListExpanded = false;
        return;
    }

    banner.style.display = 'block'; // Đổi sang block để bao quát list
    banner.classList.toggle('expanded', isPinnedListExpanded);
    
    const latestPin = currentPinnedMessages[currentPinnedMessages.length - 1];

    if (isPinnedListExpanded) {
        // Giao diện khi MỞ RỘNG
        const itemsHtml = [...currentPinnedMessages].reverse().map(msg => `
            <div class="comm-pinned-item" onclick="scrollToMsg('${msg.id}')">
                <div class="comm-pinned-item-icon">
                    <i class="far fa-comment-dots"></i>
                </div>
                <div class="comm-pinned-item-info">
                    <div class="comm-pinned-item-label">Tin nhắn</div>
                    <div class="comm-pinned-item-content">${msg.senderName}: ${msg.content}</div>
                </div>
                <button class="comm-btn-unpin" onclick="event.stopPropagation(); togglePinnedItemMenu(event, '${msg.id}')" title="Tùy chọn">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
                <div class="comm-pinned-item-menu" id="menu-pinned-${msg.id}">
                    <div class="comm-pinned-menu-item" onclick="copyPinnedText('${msg.id}')"><i class="far fa-copy"></i> Copy</div>
                    <div class="comm-pinned-menu-item delete" onclick="togglePinMsg('${msg.id}')"><i class="fas fa-thumbtack"></i> Bỏ ghim</div>
                </div>
            </div>
        `).join('');

        banner.innerHTML = `
            <div class="comm-pinned-header">
                <div class="comm-pinned-header-title">Danh sách ghim (${currentPinnedMessages.length})</div>
                <div class="comm-pinned-header-collapse" onclick="togglePinnedDropdown(event)">Thu gọn <i class="fas fa-chevron-up"></i></div>
            </div>
            <div class="comm-pinned-list-items">
                ${itemsHtml}
            </div>
        `;
    } else {
        // Giao diện khi THU GỌN (Banner mặc định)
        let moreBtnHtml = '';
        if (currentPinnedMessages.length > 1) {
            moreBtnHtml = `<button class="comm-chat-pinned-more-btn" onclick="togglePinnedDropdown(event)">+<span style="color:#fff;font-weight:bold;margin:0 2px">${currentPinnedMessages.length - 1}</span> ghim <i class="fas fa-chevron-down"></i></button>`;
        }

        banner.innerHTML = `
            <div class="comm-chat-pinned-wrapper">
                <div class="comm-chat-pinned-icon">
                    <i class="far fa-comment-dots"></i>
                </div>
                <div class="comm-chat-pinned-content" onclick="scrollToMsg('${latestPin.id}')">
                    <div class="comm-chat-pinned-title">Tin nhắn</div>
                    <div class="comm-chat-pinned-text">${latestPin.senderName}: ${latestPin.content}</div>
                </div>
                <div class="comm-chat-pinned-actions">
                    ${moreBtnHtml}
                    <button class="comm-chat-pinned-menu-btn" title="Tùy chọn" onclick="event.stopPropagation(); togglePinnedItemMenu(event, '${latestPin.id}')"><i class="fas fa-ellipsis-h"></i></button>
                    <div class="comm-pinned-item-menu" id="menu-pinned-${latestPin.id}">
                        <div class="comm-pinned-menu-item" onclick="copyPinnedText('${latestPin.id}')"><i class="far fa-copy"></i> Copy</div>
                        <div class="comm-pinned-menu-item delete" onclick="togglePinMsg('${latestPin.id}')"><i class="fas fa-thumbtack"></i> Bỏ ghim</div>
                    </div>
                </div>
            </div>
        `;
    }
}

function togglePinnedItemMenu(event, msgId) {
    if (event) event.stopPropagation();
    // Đóng tất cả menu ghim khác
    document.querySelectorAll('.comm-pinned-item-menu.active').forEach(m => {
        if (m.id !== `menu-pinned-${msgId}`) m.classList.remove('active');
    });
    
    const menu = document.getElementById(`menu-pinned-${msgId}`);
    if (menu) menu.classList.toggle('active');
}

function copyPinnedText(msgId) {
    const pin = currentPinnedMessages.find(m => m.id === msgId);
    if (!pin) return;
    
    navigator.clipboard.writeText(pin.content).then(() => {
        showNotification("Đã copy nội dung ghim", "success");
        // Đóng menu
        document.querySelectorAll('.comm-pinned-item-menu.active').forEach(m => m.classList.remove('active'));
    });
}

function togglePinnedDropdown(event) {
    if (event) event.stopPropagation();
    isPinnedListExpanded = !isPinnedListExpanded;
    renderPinnedBanner();
}

/**
 * --- LIGHTBOX PRO FUNCTIONS ---
 */

/**
 * Mở trình xem ảnh và quét toàn bộ ảnh trong đoạn chat
 */
function openImageViewer(clickedUrl) {
    const modal = document.getElementById('commLightBoxModal');
    if (!modal) return;

    // 1. Quét toàn bộ ảnh trong container chat hiện tại
    const chatContainer = document.getElementById('commChatMessages');
    if (!chatContainer) return;

    const imgElements = Array.from(chatContainer.querySelectorAll('img.comm-msg-image-content'));
    
    // 2. Chuyển thành mảng URL (giữ nguyên thứ tự để dễ quản lý, nhưng User muốn Sidebar từ mới đến cũ)
    // Thứ tự DOM là từ cũ đến mới (trên xuống dưới), vậy mảng gốc là [cũ nhất -> mới nhất]
    currentLightboxImages = imgElements.map(img => img.src);
    
    // 3. Tìm index của ảnh vừa click
    currentLightboxIndex = currentLightboxImages.indexOf(clickedUrl);
    if (currentLightboxIndex === -1) {
        // Nếu không tìm thấy bằng index trực tiếp (có thể do URL absolute/relative), tìm bằng so sánh chuỗi
        currentLightboxIndex = currentLightboxImages.findIndex(src => src.includes(clickedUrl) || clickedUrl.includes(src));
    }

    // 4. Hiển thị UI
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    updateLightboxUI();
}

/**
 * Cập nhật giao diện Lightbox (Ảnh chính + Sidebar)
 */
function updateLightboxUI() {
    if (currentLightboxIndex < 0 || currentLightboxIndex >= currentLightboxImages.length) return;

    const url = currentLightboxImages[currentLightboxIndex];
    const imageEl = document.getElementById('lightboxImage');
    const indexEl = document.getElementById('lightboxCurrentIndex');
    const totalEl = document.getElementById('lightboxTotalCount');

    if (imageEl) {
        imageEl.src = url;
        imageEl.draggable = false; // Ngăn chặn kéo ảnh kiểu bóng mờ của trình duyệt
    }
    if (indexEl) indexEl.innerText = currentLightboxIndex + 1;
    if (totalEl) totalEl.innerText = currentLightboxImages.length;

    // Reset transform khi chuyển ảnh
    resetLightboxTransform();

    renderLightboxSidebar();
}

/**
 * Khởi tạo tính năng kéo để di chuyển ảnh
 */
function initLightBoxDrag() {
    const wrapper = document.querySelector('.lightbox-img-wrapper');
    if (!wrapper) return;

    wrapper.addEventListener('mousedown', (e) => {
        if (currentLightboxZoom <= 1) return; // Chỉ cho kéo khi đã phóng to
        
        e.preventDefault(); // Quan trọng: Ngăn chặn trình duyệt chọn văn bản hoặc kéo ảnh
        isDraggingLightbox = true;
        wrapper.classList.add('grabbing');
        startX = e.pageX - wrapper.offsetLeft;
        startY = e.pageY - wrapper.offsetTop;
        scrollLeft = wrapper.scrollLeft;
        scrollTop = wrapper.scrollTop;
    });

    // Ngăn chặn sự kiện dragstart mặc định của ảnh
    wrapper.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });

    wrapper.addEventListener('mouseleave', () => {
        isDraggingLightbox = false;
        wrapper.classList.remove('grabbing');
    });

    wrapper.addEventListener('mouseup', () => {
        isDraggingLightbox = false;
        wrapper.classList.remove('grabbing');
    });

    wrapper.addEventListener('mousemove', (e) => {
        if (!isDraggingLightbox) return;
        e.preventDefault();
        
        const x = e.pageX - wrapper.offsetLeft;
        const y = e.pageY - wrapper.offsetTop;
        const walkX = (x - startX) * 2; // Tốc độ di chuyển
        const walkY = (y - startY) * 2;
        
        wrapper.scrollLeft = scrollLeft - walkX;
        wrapper.scrollTop = scrollTop - walkY;
    });
}

function resetLightboxTransform() {
    currentLightboxRotation = 0;
    currentLightboxZoom = 1;
    applyLightboxTransform();
}

function applyLightboxTransform() {
    const wrapper = document.querySelector('.lightbox-img-wrapper');
    if (wrapper) {
        wrapper.style.setProperty('--zoom', currentLightboxZoom);
        wrapper.style.setProperty('--rotate', currentLightboxRotation + 'deg');
    }
}

/**
 * Xoay ảnh 90 độ
 */
function rotateLightboxImage() {
    currentLightboxRotation += 90;
    applyLightboxTransform();
}

/**
 * Thu phóng ảnh
 */
function zoomLightboxImage(step) {
    const newZoom = currentLightboxZoom + step;
    // Giới hạn zoom từ 0.5x đến 3x
    if (newZoom >= 0.5 && newZoom <= 3) {
        currentLightboxZoom = parseFloat(newZoom.toFixed(1));
        applyLightboxTransform();
    }
}

/**
 * Render danh sách ảnh bên phải (Mới nhất lên đầu)
 */
function renderLightboxSidebar() {
    const sidebar = document.getElementById('lightboxThumbnails');
    if (!sidebar) return;

    // Phải đảo ngược mảng để ảnh mới nhất lên đầu
    // Nhưng index của ảnh gốc phải được giữ đúng
    const reversedImages = [...currentLightboxImages].reverse();
    
    sidebar.innerHTML = reversedImages.map((src, idx) => {
        // idx trong reversedImages tương ứng với index trong mảng gốc:
        const originalIndex = currentLightboxImages.length - 1 - idx;
        const isActive = originalIndex === currentLightboxIndex;
        
        return `
            <div class="lightbox-thumb-item ${isActive ? 'active' : ''}" 
                 onclick="jumpToImage(${originalIndex})">
                <img src="${src}" alt="Thumb">
            </div>
        `;
    }).join('');

    // Tự động scroll đến ảnh đang active
    const activeThumb = sidebar.querySelector('.lightbox-thumb-item.active');
    if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * Điều hướng qua lại giữa các ảnh (Mũi tên)
 */
function navigateImage(direction) {
    const newIndex = currentLightboxIndex + direction;
    if (newIndex >= 0 && newIndex < currentLightboxImages.length) {
        currentLightboxIndex = newIndex;
        updateLightboxUI();
    }
}

/**
 * Nhảy trực tiếp đến 1 ảnh theo index
 */
function jumpToImage(index) {
    currentLightboxIndex = index;
    updateLightboxUI();
}

function closeImageViewer() {
    const modal = document.getElementById('commLightBoxModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Ép trình duyệt tải ảnh về máy (Force Download) thay vì chỉ mở tab mới
 */
async function downloadImage(urlParam = null) {
    let url = urlParam;
    
    // Nếu không truyền URL, lấy từ Lightbox đang mở
    if (!url) {
        if (currentLightboxIndex === -1) return;
        url = currentLightboxImages[currentLightboxIndex];
    }
    
    showNotification("Đang xử lý tải ảnh...", "info");

    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = 'CineChat_' + Date.now() + '.png';
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        
        showNotification("Đã tải ảnh thành công!", "success");
    } catch (error) {
        console.error("Download error:", error);
        window.open(url, '_blank');
        showNotification("Không thể tải trực tiếp, đã mở ảnh ở tab mới.", "warning");
    }
}

/**
 * Chia sẻ đường dẫn ảnh
 */
function shareImage() {
    if (currentLightboxIndex === -1) return;
    const url = currentLightboxImages[currentLightboxIndex];
    
    if (navigator.share) {
        navigator.share({ title: 'Chia sẻ ảnh từ CineChat', url: url });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showNotification("Đã copy link ảnh!", "success");
        });
    }
}

// Lắng nghe phím mũi tên và Esc
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('commLightBoxModal');
    if (!modal || modal.style.display === 'none') return;

    if (e.key === 'Escape') closeImageViewer();
    if (e.key === 'ArrowLeft') navigateImage(-1);
    if (e.key === 'ArrowRight') navigateImage(1);
    
    // Thêm phím tắt cho xoay và zoom
    if (e.key.toLowerCase() === 'r') rotateLightboxImage();
    if (e.key === '+' || e.key === '=') zoomLightboxImage(0.2);
    if (e.key === '-' || e.key === '_') zoomLightboxImage(-0.2);
});

/**
 * 7.2 THƯ VIỆN ĐA PHƯƠNG TIỆN (Media Gallery)
 */
async function fetchChatMediaStats(targetUserId) {
    if (!currentUser || !targetUserId) return;
    
    try {
        const { count, error } = await supabase
            .from('community_messages')
            .select('*', { count: 'exact', head: true })
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUser.id})`)
            .like('content', '[IMAGE]%');

        if (error) throw error;

        const countEl = document.getElementById("commInfoPhotoCount");
        if (countEl) {
            countEl.textContent = `${count || 0} ảnh`;
        }
    } catch (e) {
        console.error("Lỗi đếm số lượng ảnh:", e);
    }
}

async function showChatMediaGallery() {
    if (!currentChatUserId || !currentUser) return;
    
    const modal = document.getElementById("commMediaGalleryModal");
    const grid = document.getElementById("mediaGalleryGrid");
    const empty = document.getElementById("mediaGalleryEmpty");
    
    if (!modal || !grid) return;
    
    modal.style.display = "flex";
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px;"><div class="loading-spinner"></div></div>';
    empty.style.display = "none";
    
    try {
        const { data, error } = await supabase
            .from('community_messages')
            .select('id, content, created_at')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatUserId}),and(sender_id.eq.${currentChatUserId},receiver_id.eq.${currentUser.id})`)
            .like('content', '[IMAGE]%')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            grid.innerHTML = "";
            empty.style.display = "block";
            return;
        }

        // Tạo danh sách URL để dùng cho lightbox
        const imageUrls = data.map(m => m.content.replace('[IMAGE]', '').trim());

        grid.innerHTML = data.map((msg, idx) => {
            const url = msg.content.replace('[IMAGE]', '').trim();
            const dateObj = new Date(msg.created_at);
            const dateStr = dateObj.toLocaleDateString('vi-VN');
            const timeStr = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

            return `
                <div class="gallery-item" onclick="openImageViewer('${url}', ${idx}, ${JSON.stringify(imageUrls).replace(/"/g, '&quot;')})">
                    <img src="${url}" loading="lazy">
                    <div class="gallery-item-info">
                        <span class="gallery-item-date">${dateStr}</span>
                        <span class="gallery-item-time">${timeStr}</span>
                    </div>
                </div>
            `;
        }).join("");

    } catch (e) {
        console.error("Lỗi tải thư viện ảnh:", e);
        grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:red;">Lỗi tải dữ liệu. Vui lòng thử lại.</p>';
    }
}

function closeMediaGallery() {
    const modal = document.getElementById("commMediaGalleryModal");
    if (modal) modal.style.display = "none";
}

/**
 * TÍNH NĂNG CHUYỂN TIẾP TIN NHẮN (FORWARD)
 */

async function openForwardModal(msgId) {
    if (!currentUser) {
        showNotification("Vui lòng đăng nhập để thực hiện", "warning");
        return;
    }

    forwardingMsgId = msgId;
    const modal = document.getElementById("commForwardModal");
    const previewEl = document.getElementById("forwardPreviewContent");
    if (!modal) return;

    modal.classList.add("active");

    // Reset UI
    const searchInput = document.getElementById("forwardSearchInput");
    if (searchInput) searchInput.value = "";
    selectedForwardUserIds = [];
    updateForwardSendButton();
    
    if (previewEl) {
        previewEl.innerHTML = '<div class="loading-spinner"></div>';
        
        // Lấy nội dung tin nhắn để preview
        try {
            const { data: msg, error } = await supabase
                .from('community_messages')
                .select(`
                    content,
                    sender:profiles!sender_id ( display_name )
                `)
                .eq('id', msgId)
                .single();

            if (error) throw error;

            const senderName = msg.sender?.display_name || "Người dùng";
            let displayContent = msg.content;
            
            if (displayContent.startsWith('[IMAGE]')) {
                const url = displayContent.replace('[IMAGE]', '').trim();
                displayContent = `<span class="forward-preview-sender">${senderName}:</span><br>[Hình ảnh]<br><img src="${url}">`;
            } else if (displayContent.startsWith('[STICKER]')) {
                const url = displayContent.replace('[STICKER]', '').trim();
                displayContent = `<span class="forward-preview-sender">${senderName}:</span><br>[Sticker]<br><img src="${url}" style="width: 60px;">`;
            } else if (displayContent.startsWith('[REPLY]')) {
                const parts = displayContent.split('|');
                displayContent = `<span class="forward-preview-sender">${senderName}:</span><br>[Trả lời] ${parts[parts.length - 1]}`;
            } else {
                displayContent = `<span class="forward-preview-sender">${senderName}:</span><br>${displayContent}`;
            }

            previewEl.innerHTML = displayContent;
        } catch (e) {
            console.error("Lỗi tải nội dung preview:", e);
            previewEl.innerHTML = '<span class="text-danger">Không thể tải nội dung tin nhắn</span>';
        }
    }
    
    // Tải danh sách bạn bè
    loadForwardFriends();
}

function closeForwardModal() {
    const modal = document.getElementById("commForwardModal");
    if (modal) modal.classList.remove("active");
    forwardingMsgId = null;
}

async function loadForwardFriends() {
    const listEl = document.getElementById("forwardFriendsList");
    if (!listEl) return;

    listEl.innerHTML = '<div class="loading-spinner"></div>';

    try {
        // Lấy danh sách bạn bè đã chấp nhận
        const { data, error } = await supabase
            .from('community_friends')
            .select(`
                user_id, friend_id,
                profiles_user:user_id ( id, display_name, avatar ),
                profiles_friend:friend_id ( id, display_name, avatar )
            `)
            .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
            .eq('status', 'accepted');

        if (error) throw error;

        // Xử lý dữ liệu để lấy thông tin người bạn
        forwardFriendsData = data.map(row => {
            const isUser = row.user_id === currentUser.id;
            return isUser ? row.profiles_friend : row.profiles_user;
        });

        renderForwardFriends(forwardFriendsData);

    } catch (e) {
        console.error("Lỗi tải danh sách bạn bè chuyển tiếp:", e);
        listEl.innerHTML = '<p class="text-center text-danger">Không thể tải danh sách bạn bè</p>';
    }
}

function renderForwardFriends(friends) {
    const listEl = document.getElementById("forwardFriendsList");
    if (!listEl) return;

    if (friends.length === 0) {
        listEl.innerHTML = '<p class="text-center text-muted" style="padding: 20px;">Không tìm thấy bạn bè nào</p>';
        return;
    }

    listEl.innerHTML = friends.map(friend => {
        const avatar = friend.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.display_name)}&background=random`;
        const isSelected = selectedForwardUserIds.includes(friend.id);
        return `
            <div class="forward-friend-item ${isSelected ? 'selected' : ''}" onclick="toggleForwardUser('${friend.id}', this)">
                <div class="forward-friend-info">
                    <img src="${avatar}" class="forward-friend-avatar" alt="${friend.display_name}">
                    <span class="forward-friend-name">${friend.display_name}</span>
                </div>
                <div class="forward-select-status">
                    <i class="fas fa-check"></i>
                </div>
            </div>
        `;
    }).join("");
}

function toggleForwardUser(userId, el) {
    const index = selectedForwardUserIds.indexOf(userId);
    if (index > -1) {
        selectedForwardUserIds.splice(index, 1);
        el.classList.remove('selected');
    } else {
        selectedForwardUserIds.push(userId);
        el.classList.add('selected');
    }
    updateForwardSendButton();
}

function updateForwardSendButton() {
    const btn = document.getElementById("btnSendMultiForward");
    if (!btn) return;
    
    const count = selectedForwardUserIds.length;
    btn.innerHTML = `Gửi (${count})`;
    btn.disabled = count === 0;
}

async function sendMultiForward() {
    if (!forwardingMsgId || selectedForwardUserIds.length === 0 || !currentUser) return;

    const btn = document.getElementById("btnSendMultiForward");
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
    btn.disabled = true;

    try {
        // 1. Lấy nội dung tin nhắn gốc
        const { data: originalMsg, error: fetchErr } = await supabase
            .from('community_messages')
            .select('content')
            .eq('id', forwardingMsgId)
            .single();

        if (fetchErr) throw fetchErr;

        // 2. Gửi cho tất cả người đã chọn
        const sendPromises = selectedForwardUserIds.map(async (targetUserId) => {
            let finalContent = originalMsg.content;
            
            // [MỚI] Kiểm tra chặn cho từng người nhận khi gửi hàng loạt
            const theirBlockOnMe = myAppBlocks.find(b => 
                String(b.user_id).trim() === String(targetUserId).trim() && 
                String(b.blocked_id).trim() === String(currentUser.id).trim()
            );
            if (theirBlockOnMe && !finalContent.startsWith("[BLOCKED_MSG]")) {
                finalContent = `[BLOCKED_MSG] ${finalContent}`;
            }

            const isTargetOnline = userPresenceMap.get(targetUserId)?.online;
            return supabase
                .from('community_messages')
                .insert({
                    sender_id: currentUser.id,
                    receiver_id: targetUserId,
                    content: finalContent,
                    status: isTargetOnline ? 'delivered' : 'sent'
                });
        });

        const results = await Promise.all(sendPromises);
        const hasError = results.some(r => r.error);

        if (hasError) throw new Error("Một số tin nhắn gửi thất bại");

        showNotification(`Đã chuyển tiếp tin nhắn tới ${selectedForwardUserIds.length} người bạn`, "success");
        closeForwardModal();

    } catch (e) {
        console.error("Lỗi chuyển tiếp hàng loạt:", e);
        showNotification("Gửi thất bại, vui lòng thử lại!", "error");
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

function filterForwardFriends() {
    const keyword = document.getElementById("forwardSearchInput").value.toLowerCase().trim();
    if (!keyword) {
        renderForwardFriends(forwardFriendsData);
        return;
    }

    const filtered = forwardFriendsData.filter(f => 
        f.display_name.toLowerCase().includes(keyword)
    );
    renderForwardFriends(filtered);
}

async function processForward(targetUserId, btn) {
    if (!forwardingMsgId || !targetUserId || !currentUser) return;

    // Đổi trạng thái nút
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        // 1. Lấy nội dung tin nhắn gốc
        const { data: originalMsg, error: fetchErr } = await supabase
            .from('community_messages')
            .select('content')
            .eq('id', forwardingMsgId)
            .single();

        if (fetchErr) throw fetchErr;

        // 2. Gửi tin nhắn mới tới người nhận
        let finalContent = originalMsg.content;
        
        // [MỚI] Kiểm tra chặn cho người nhận cụ thể
        const theirBlockOnMe = myAppBlocks.find(b => 
            String(b.user_id).trim() === String(targetUserId).trim() && 
            String(b.blocked_id).trim() === String(currentUser.id).trim()
        );
        if (theirBlockOnMe && !finalContent.startsWith("[BLOCKED_MSG]")) {
            finalContent = `[BLOCKED_MSG] ${finalContent}`;
        }

        const isTargetOnline = userPresenceMap.get(targetUserId)?.online;
        const { error: sendErr } = await supabase
            .from('community_messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: targetUserId,
                content: finalContent,
                status: isTargetOnline ? 'delivered' : 'sent'
            });

        if (sendErr) throw sendErr;

        // 3. Cập nhật UI nút
        btn.innerHTML = '<i class="fas fa-check"></i> Đã gửi';
        btn.classList.add('sent');

        // Nếu người nhận đang là người mình đang chat cùng, UI sẽ tự update qua Realtime
        // Nếu không, chỉ cần thông báo "Đã gửi" trên nút là đủ.

    } catch (e) {
        console.error("Lỗi chuyển tiếp tin nhắn:", e);
        showNotification("Gửi thất bại, vui lòng thử lại!", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/**
 * TÍNH NĂNG ĐỔI HÌNH NỀN CHAT
 */

function openWallpaperModal() {
    const modal = document.getElementById("commWallpaperModal");
    const sidebar = document.getElementById("commChatInfoSidebar");
    
    if (modal) modal.classList.add("active");
    if (sidebar) sidebar.style.visibility = "hidden"; // Ẩn sidebar để modal đè lên hoàn hảo
    
    // Lưu lại trạng thái hiện tại để có thể Hủy
    const storageKey = currentChatTarget ? `chat_wallpaper_${currentChatTarget.id}` : 'chat_wallpaper_global';
    const opacityKey = currentChatTarget ? `chat_wallpaper_opacity_${currentChatTarget.id}` : 'chat_wallpaper_opacity_global';
    const positionKey = currentChatTarget ? `chat_wallpaper_pos_${currentChatTarget.id}` : 'chat_wallpaper_pos_global';
    
    originalWallpaperState.url = localStorage.getItem(storageKey);
    originalWallpaperState.opacity = parseFloat(localStorage.getItem(opacityKey) || "0.4");
    originalWallpaperState.position = localStorage.getItem(positionKey) || "center";
    
    currentPreviewWallpaper = originalWallpaperState.url;
    currentPreviewOpacity = originalWallpaperState.opacity;
    currentPreviewPosition = originalWallpaperState.position;

    // Reset slider UI
    const slider = document.getElementById("wpOpacitySlider");
    const opacityVal = document.getElementById("wpOpacityValue");
    if (slider) slider.value = currentPreviewOpacity * 100;
    if (opacityVal) opacityVal.innerText = Math.round(currentPreviewOpacity * 100) + "%";

    // Reset position UI
    document.querySelectorAll(".wp-pos-btn").forEach(btn => {
        if (btn.dataset.pos === currentPreviewPosition) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    renderWallpaperGallery();
    renderCustomWallpapers();
}

function closeWallpaperModal() {
    const modal = document.getElementById("commWallpaperModal");
    const sidebar = document.getElementById("commChatInfoSidebar");
    
    if (modal) modal.classList.remove("active");
    if (sidebar) sidebar.style.visibility = "visible";
}

function switchWallpaperTab(tabName) {
    const tabs = document.querySelectorAll(".wp-tab");
    const contents = document.querySelectorAll(".wp-tab-content");

    tabs.forEach(t => t.classList.remove("active"));
    contents.forEach(c => c.style.display = "none");

    if (tabName === 'gallery') {
        tabs[0].classList.add("active");
        document.getElementById("wpTabGallery").style.display = "block";
    } else {
        tabs[1].classList.add("active");
        document.getElementById("wpTabCustom").style.display = "block";
    }
}

function renderWallpaperGallery() {
    const grid = document.getElementById("wpGalleryGrid");
    if (!grid) return;

    const storageKey = currentChatTarget ? `chat_wallpaper_${currentChatTarget.id}` : 'chat_wallpaper_global';
    const currentWp = localStorage.getItem(storageKey);
    
    grid.innerHTML = WALLPAPER_GALLERY.map(url => `
        <div class="wallpaper-item ${currentWp === url ? 'active' : ''}" onclick="applyChatWallpaper('${url}')">
            <img src="${url}" alt="Wallpaper">
        </div>
    `).join("");
}

function renderCustomWallpapers() {
    const grid = document.getElementById("wpCustomGrid");
    if (!grid) return;

    const customWps = JSON.parse(localStorage.getItem('custom_chat_wallpapers') || "[]");
    const storageKey = currentChatTarget ? `chat_wallpaper_${currentChatTarget.id}` : 'chat_wallpaper_global';
    const currentWp = localStorage.getItem(storageKey);

    if (customWps.length === 0) {
        grid.innerHTML = '<p class="text-center text-muted" style="grid-column: 1/-1; padding: 20px;">Bạn chưa tải lên hình nền nào.</p>';
        return;
    }

    grid.innerHTML = customWps.map(url => `
        <div class="wallpaper-item ${currentWp === url ? 'active' : ''}">
            <img src="${url}" alt="Custom" onclick="applyChatWallpaper('${url}')">
            <button class="wp-delete-btn" onclick="deleteChatWallpaper('${url}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
        </div>
    `).join("");
}

function applyChatWallpaper(url) {
    const chatContainer = document.getElementById("commChatContent");
    if (!chatContainer) return;

    currentPreviewWallpaper = url;

    if (url) {
        chatContainer.style.backgroundImage = `url('${url}')`;
        chatContainer.classList.add("has-wallpaper");
        chatContainer.style.setProperty('--wp-position', currentPreviewPosition);
    } else {
        chatContainer.style.backgroundImage = "none";
        chatContainer.classList.remove("has-wallpaper");
    }

    // Update active state in grid (UI only)
    document.querySelectorAll(".wallpaper-item").forEach(item => {
        const img = item.querySelector("img");
        if (img && img.src.includes(url)) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
}

function resetWallpaper() {
    applyChatWallpaper(null);
}

async function uploadWallpaperToR2(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        showNotification("Ảnh không được vượt quá 10MB", "warning");
        return;
    }

    const uploadArea = document.querySelector(".wp-upload-area");
    if (!uploadArea) return;

    const originalHTML = uploadArea.innerHTML;
    uploadArea.innerHTML = '<div class="loading-spinner"></div><p>Đang tải lên Cloudflare...</p>';
    uploadArea.style.pointerEvents = "none";

    try {
        // Upload lên Cloudflare R2 với folder chat-wallpapers/{userId}
        const folder = `chat-wallpapers/${currentUser.id}`;
        const formData = new FormData();
        formData.append('file', file, file.name || 'wallpaper.jpg');
        formData.append('folder', folder);

        const response = await fetch(`${R2_WORKER_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const url = data.url;

        if (url) {
            // Lưu URL vào danh sách ảnh nền cá nhân
            let customWps = JSON.parse(localStorage.getItem('custom_chat_wallpapers') || "[]");
            if (!customWps.includes(url)) {
                customWps.unshift(url);
                localStorage.setItem('custom_chat_wallpapers', JSON.stringify(customWps));
            }

            renderCustomWallpapers();
            applyChatWallpaper(url);
            console.log(`✅ Upload ảnh nền R2 OK: ${url}`);
            showNotification("Tải lên và áp dụng thành công!", "success");
        }
    } catch (e) {
        console.error("Lỗi upload hình nền R2:", e);
        showNotification("Tải ảnh thất bại: " + e.message, "error");
    } finally {
        uploadArea.innerHTML = originalHTML;
        uploadArea.style.pointerEvents = "auto";
    }
}

function deleteChatWallpaper(url) {
    if (typeof event !== 'undefined') event.stopPropagation();
    
    if (!confirm("Xóa hình nền này khỏi danh sách cá nhân?")) return;

    // Xóa ảnh trên Cloudflare R2 nếu URL từ R2
    deleteWallpaperFromR2(url);

    let customWps = JSON.parse(localStorage.getItem('custom_chat_wallpapers') || "[]");
    customWps = customWps.filter(item => item !== url);
    localStorage.setItem('custom_chat_wallpapers', JSON.stringify(customWps));

    const storageKey = currentChatTarget ? `chat_wallpaper_${currentChatTarget.id}` : 'chat_wallpaper_global';
    const currentWp = localStorage.getItem(storageKey);
    if (currentWp === url) {
        resetWallpaper();
    }

    renderCustomWallpapers();
}

/**
 * Xóa ảnh nền chat khỏi Cloudflare R2 thông qua Worker DELETE endpoint
 * Chỉ xóa nếu URL là từ R2 (chứa workers.dev hoặc .r2.dev)
 * @param {string} url - URL ảnh nền cần xóa
 */
async function deleteWallpaperFromR2(url) {
    if (!url || (!url.includes('workers.dev') && !url.includes('.r2.dev'))) return;

    try {
        const urlObj = new URL(url);
        // Lấy key từ pathname (bỏ dấu / ở đầu)
        const key = urlObj.pathname.substring(1);
        if (!key) return;

        console.log(`📡 Đang xóa ảnh nền trên R2: ${key}`);

        const response = await fetch(`${R2_WORKER_URL}/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });

        if (response.ok) {
            console.log(`✅ Đã xóa ảnh nền R2 thành công: ${key}`);
        } else {
            const errText = await response.text();
            console.warn(`⚠️ Không thể xóa ảnh nền R2: ${key}`, errText);
        }
    } catch (error) {
        console.warn('⚠️ Lỗi khi xóa ảnh nền R2:', error);
    }
}

function applyWallpaperFromLink() {
    const linkInput = document.getElementById("wpLinkInput");
    const url = linkInput?.value?.trim();

    if (!url) {
        showNotification("Vui lòng nhập link ảnh!", "warning");
        return;
    }

    applyChatWallpaper(url);
    linkInput.value = "";
}

function updateWallpaperOpacity(value) {
    const chatContainer = document.getElementById("commChatContent");
    if (!chatContainer) return;

    const opacity = value / 100;
    currentPreviewOpacity = opacity;
    
    chatContainer.style.setProperty('--wp-overlay-opacity', opacity);
    
    // Update label
    const opacityVal = document.getElementById("wpOpacityValue");
    if (opacityVal) opacityVal.innerText = Math.round(value) + "%";
}

function updateWallpaperPosition(pos) {
    const chatContainer = document.getElementById("commChatContent");
    if (!chatContainer) return;

    currentPreviewPosition = pos;
    chatContainer.style.setProperty('--wp-position', pos);

    // Update UI active state
    document.querySelectorAll(".wp-pos-btn").forEach(btn => {
        if (btn.dataset.pos === pos) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

function confirmWallpaperChanges() {
    const storageKey = currentChatTarget ? `chat_wallpaper_${currentChatTarget.id}` : 'chat_wallpaper_global';
    const opacityKey = currentChatTarget ? `chat_wallpaper_opacity_${currentChatTarget.id}` : 'chat_wallpaper_opacity_global';
    const positionKey = currentChatTarget ? `chat_wallpaper_pos_${currentChatTarget.id}` : 'chat_wallpaper_pos_global';

    if (currentPreviewWallpaper) {
        localStorage.setItem(storageKey, currentPreviewWallpaper);
    } else {
        localStorage.removeItem(storageKey);
    }
    
    localStorage.setItem(opacityKey, currentPreviewOpacity);
    localStorage.setItem(positionKey, currentPreviewPosition);
    
    showNotification("Đã lưu cài đặt hình nền!", "success");
    closeWallpaperModal();
}

function cancelWallpaperPreview() {
    const chatContainer = document.getElementById("commChatContent");
    if (chatContainer) {
        if (originalWallpaperState.url) {
            chatContainer.style.backgroundImage = `url('${originalWallpaperState.url}')`;
            chatContainer.classList.add("has-wallpaper");
        } else {
            chatContainer.style.backgroundImage = "none";
            chatContainer.classList.remove("has-wallpaper");
        }
        chatContainer.style.setProperty('--wp-overlay-opacity', originalWallpaperState.opacity);
        chatContainer.style.setProperty('--wp-position', originalWallpaperState.position);
    }
    closeWallpaperModal();
}

/**
 * Xử lý chặn người dùng (Danger Zone)
 */
async function confirmBlockUser() {
    if (!currentChatTarget || !currentUser) return;

    const result = await showBlockConfirmModal();

    if (result && result.confirmed) {
        const targetName = currentChatTarget.display_name || currentChatTarget.name || 'người dùng này';
        let durationText = "vĩnh viễn";
        if (result.duration !== -1) {
            durationText = result.duration >= 24 ? `${result.duration / 24} ngày` : `${result.duration} giờ`;
        }
        
        // [MỚI] Lưu trạng thái chặn vào Database (Supabase)
        await saveBlockDB(currentChatTarget.id, result.duration);
        
        showNotification(`Đã chặn ${targetName} ${durationText}`, "error");

        // [MỚI] Fetch lại trạng thái mới nhất từ DB
        const blockStatus = await fetchBlockStatusDB(currentChatTarget.id);
        updateBlockUI(blockStatus);

        // Cập nhật nút Danger Zone trong sidebar
        const dangerItem = document.querySelector('.comm-info-danger-item');
        if (dangerItem) {
            dangerItem.innerHTML = '<i class="fas fa-unlock"></i> <span>Bỏ chặn người dùng</span>';
            dangerItem.setAttribute('onclick', 'unblockCurrentUser()');
        }
        
        // Refresh tin nhắn để ẩn tin nhắn từ người vừa chặn
        openChat(currentChatTarget.id, targetName, currentChatTarget.avatar);
        if(typeof loadChatList === 'function') loadChatList();
    }
}

function initChatWallpaper() {
    const chatContainer = document.getElementById("commChatContent");
    if (!chatContainer) return;

    const storageKey = currentChatTarget ? `chat_wallpaper_${currentChatTarget.id}` : 'chat_wallpaper_global';
    const opacityKey = currentChatTarget ? `chat_wallpaper_opacity_${currentChatTarget.id}` : 'chat_wallpaper_opacity_global';
    const positionKey = currentChatTarget ? `chat_wallpaper_pos_${currentChatTarget.id}` : 'chat_wallpaper_pos_global';
    
    const savedWp = localStorage.getItem(storageKey);
    const savedOpacity = localStorage.getItem(opacityKey) || "0.4";
    const savedPos = localStorage.getItem(positionKey) || "center";

    if (savedWp) {
        chatContainer.style.backgroundImage = `url('${savedWp}')`;
        chatContainer.classList.add("has-wallpaper");
    } else {
        chatContainer.style.backgroundImage = "none";
        chatContainer.classList.remove("has-wallpaper");
    }
    
    chatContainer.style.setProperty('--wp-overlay-opacity', savedOpacity);
    chatContainer.style.setProperty('--wp-position', savedPos);
}

// ===========================================
// THÔNG BÁO CINECHAT - Mute, Toast, Sound, Badge
// ===========================================

/**
 * Hiện popup cài đặt thông báo cho hội thoại đang mở
 * Với toggle trực quan + hẹn giờ tự bật lại
 */
function showNotifSettingsPopup() {
    if (!currentChatUserId) {
        showNotification("Vui lòng mở một cuộc trò chuyện trước", "info");
        return;
    }
    
    // Xóa popup cũ nếu có
    const oldPopup = document.querySelector('.notif-settings-popup');
    if (oldPopup) { oldPopup.remove(); return; }
    
    // Kiểm tra hẹn giờ hết hạn chưa
    _checkMuteExpiry(currentChatUserId);
    
    const muted = isChatMuted(currentChatUserId);
    const soundOff = isChatSoundOff(currentChatUserId);
    const muteExpiry = _getMuteExpiry(currentChatUserId);
    
    const popup = document.createElement('div');
    popup.className = 'notif-settings-popup';
    popup.innerHTML = `
        <div class="notif-popup-header">
            <i class="fas fa-bell"></i> Cài đặt thông báo
        </div>
        <div class="notif-popup-options">
            <!-- Toggle tắt thông báo -->
            <div class="notif-popup-option" onclick="handleNotifToggle('mute')">
                <span class="notif-opt-icon ${muted ? 'active' : ''}">
                    <i class="fas ${muted ? 'fa-bell-slash' : 'fa-bell'}"></i>
                </span>
                <span class="notif-opt-text">Tắt thông báo</span>
                <span class="notif-toggle ${muted ? 'on' : ''}">
                    <span class="notif-toggle-knob"></span>
                </span>
            </div>
            
            <!-- Hẹn giờ (chỉ hiện khi tắt thông báo) -->
            <div class="notif-timer-section ${muted ? 'show' : ''}" id="notifTimerSection">
                <div class="notif-timer-label"><i class="fas fa-clock"></i> Tắt trong:</div>
                <div class="notif-timer-options">
                    <label class="notif-timer-opt">
                        <input type="radio" name="muteTimer" value="1" ${muteExpiry === '1h' ? 'checked' : ''} onchange="setMuteTimer('1h')">
                        <span>1 giờ</span>
                    </label>
                    <label class="notif-timer-opt">
                        <input type="radio" name="muteTimer" value="4" ${muteExpiry === '4h' ? 'checked' : ''} onchange="setMuteTimer('4h')">
                        <span>4 giờ</span>
                    </label>
                    <label class="notif-timer-opt">
                        <input type="radio" name="muteTimer" value="8am" ${muteExpiry === '8am' ? 'checked' : ''} onchange="setMuteTimer('8am')">
                        <span>Đến 8:00 sáng</span>
                    </label>
                    <label class="notif-timer-opt">
                        <input type="radio" name="muteTimer" value="forever" ${!muteExpiry || muteExpiry === 'forever' ? 'checked' : ''} onchange="setMuteTimer('forever')">
                        <span>Cho đến khi bật lại</span>
                    </label>
                </div>
            </div>
            
            <div class="notif-popup-divider"></div>
            
            <!-- Toggle tắt âm thanh -->
            <div class="notif-popup-option" onclick="handleNotifToggle('sound')">
                <span class="notif-opt-icon sound ${soundOff ? 'active' : ''}">
                    <i class="fas ${soundOff ? 'fa-volume-mute' : 'fa-volume-up'}"></i>
                </span>
                <span class="notif-opt-text">Tắt âm thanh</span>
                <span class="notif-toggle ${soundOff ? 'on' : ''}">
                    <span class="notif-toggle-knob"></span>
                </span>
            </div>
        </div>
    `;
    
    // Đặt popup cạnh nút chuông
    const btn = document.getElementById('btnChatMute');
    if (btn) {
        btn.parentElement.style.position = 'relative';
        btn.parentElement.appendChild(popup);
    } else {
        document.body.appendChild(popup);
    }
    
    // Click bên ngoài → đóng popup
    setTimeout(() => {
        document.addEventListener('click', function _closeNotifPopup(e) {
            if (!popup.contains(e.target) && e.target.id !== 'btnChatMute' && !e.target.closest('#btnChatMute')) {
                popup.remove();
                document.removeEventListener('click', _closeNotifPopup);
            }
        });
    }, 100);
}

/**
 * Xử lý toggle bật/tắt thông báo hoặc âm thanh
 */
function handleNotifToggle(type) {
    if (!currentChatUserId) return;
    
    if (type === 'mute') {
        const muted = isChatMuted(currentChatUserId);
        if (muted) {
            // Bật lại thông báo
            localStorage.removeItem(`cinechat_muted_${currentChatUserId}`);
            localStorage.removeItem(`cinechat_mute_expiry_${currentChatUserId}`);
            localStorage.removeItem(`cinechat_soundoff_${currentChatUserId}`);
            showNotification("🔔 Đã bật thông báo", "success");
        } else {
            // Tắt thông báo (mặc định = cho đến khi bật lại)
            localStorage.setItem(`cinechat_muted_${currentChatUserId}`, 'true');
            localStorage.setItem(`cinechat_mute_expiry_${currentChatUserId}`, 'forever');
            localStorage.setItem(`cinechat_soundoff_${currentChatUserId}`, 'true');
            showNotification("🔕 Đã tắt thông báo", "info");
        }
    } else if (type === 'sound') {
        const soundOff = isChatSoundOff(currentChatUserId);
        if (soundOff) {
            localStorage.removeItem(`cinechat_soundoff_${currentChatUserId}`);
            showNotification("🔊 Đã bật âm thanh", "success");
        } else {
            localStorage.setItem(`cinechat_soundoff_${currentChatUserId}`, 'true');
            showNotification("🔇 Đã tắt âm thanh", "info");
        }
    }
    
    updateMuteUI(currentChatUserId);
    
    // Cập nhật lại popup
    const popup = document.querySelector('.notif-settings-popup');
    if (popup) {
        popup.remove();
        showNotifSettingsPopup();
    }
}

/**
 * Đặt hẹn giờ tắt thông báo
 */
function setMuteTimer(duration) {
    if (!currentChatUserId) return;
    
    let expiryTime;
    let label;
    
    if (duration === '1h') {
        expiryTime = Date.now() + 1 * 60 * 60 * 1000;
        label = '1 giờ';
    } else if (duration === '4h') {
        expiryTime = Date.now() + 4 * 60 * 60 * 1000;
        label = '4 giờ';
    } else if (duration === '8am') {
        // Tính thời gian đến 8h sáng hôm sau
        const now = new Date();
        const next8am = new Date();
        next8am.setHours(8, 0, 0, 0);
        if (now.getHours() >= 8) next8am.setDate(next8am.getDate() + 1);
        expiryTime = next8am.getTime();
        label = '8:00 sáng';
    } else {
        // forever - không hẹn giờ
        localStorage.setItem(`cinechat_mute_expiry_${currentChatUserId}`, 'forever');
        showNotification("🔕 Tắt cho đến khi bạn bật lại", "info");
        return;
    }
    
    localStorage.setItem(`cinechat_muted_${currentChatUserId}`, 'true');
    localStorage.setItem(`cinechat_soundoff_${currentChatUserId}`, 'true');
    localStorage.setItem(`cinechat_mute_expiry_${currentChatUserId}`, expiryTime.toString());
    
    showNotification(`🔕 Tắt thông báo trong ${label}`, "info");
    updateMuteUI(currentChatUserId);
}

/**
 * Kiểm tra hẹn giờ hết hạn → tự bật lại thông báo
 */
function _checkMuteExpiry(userId) {
    if (!userId) return;
    const expiry = localStorage.getItem(`cinechat_mute_expiry_${userId}`);
    if (!expiry || expiry === 'forever') return;
    
    const expiryTime = parseInt(expiry);
    if (Date.now() >= expiryTime) {
        // Hết hạn → bật lại thông báo
        localStorage.removeItem(`cinechat_muted_${userId}`);
        localStorage.removeItem(`cinechat_mute_expiry_${userId}`);
        localStorage.removeItem(`cinechat_soundoff_${userId}`);
        updateMuteUI(userId);
    }
}

/**
 * Lấy loại hẹn giờ hiện tại (1h/4h/8am/forever)
 */
function _getMuteExpiry(userId) {
    const val = localStorage.getItem(`cinechat_mute_expiry_${userId}`);
    if (!val) return null;
    if (val === 'forever') return 'forever';
    
    const expiryTime = parseInt(val);
    const diff = expiryTime - Date.now();
    if (diff <= 0) return null;
    
    // Phỏng đoán loại timer theo khoảng thời gian
    if (diff <= 1.5 * 60 * 60 * 1000) return '1h';
    if (diff <= 5 * 60 * 60 * 1000) return '4h';
    return '8am';
}

// Giữ lại hàm toggleChatMute cho tương thích ngược
function toggleChatMute() {
    showNotifSettingsPopup();
}

/**
 * Kiểm tra hội thoại có bị tắt thông báo không (kiểm tra cả hẹn giờ)
 */
function isChatMuted(userId) {
    if (!userId) return false;
    _checkMuteExpiry(userId);
    return localStorage.getItem(`cinechat_muted_${userId}`) === 'true';
}

/**
 * Kiểm tra hội thoại có bị tắt âm thanh không
 */
function isChatSoundOff(userId) {
    if (!userId) return false;
    _checkMuteExpiry(userId);
    return localStorage.getItem(`cinechat_soundoff_${userId}`) === 'true';
}

/**
 * Cập nhật giao diện nút chuông + đếm ngược hẹn giờ
 */
let _muteCountdownInterval = null;

function updateMuteUI(userId) {
    const btn = document.getElementById('btnChatMute');
    const icon = document.getElementById('iconChatMute');
    const label = document.getElementById('labelChatMute');
    if (!btn || !icon) return;
    
    const muted = isChatMuted(userId);
    const soundOff = isChatSoundOff(userId);
    
    // Xóa countdown cũ
    if (_muteCountdownInterval) {
        clearInterval(_muteCountdownInterval);
        _muteCountdownInterval = null;
    }
    const oldCountdown = btn.parentElement.querySelector('.mute-countdown');
    if (oldCountdown) oldCountdown.remove();
    
    if (muted) {
        btn.classList.add('muted');
        btn.classList.remove('sound-off');
        icon.className = 'fas fa-bell-slash';
        if (label) label.textContent = 'Đã tắt';
        
        // Kiểm tra có hẹn giờ không → hiện đếm ngược
        const expiry = localStorage.getItem(`cinechat_mute_expiry_${userId}`);
        if (expiry && expiry !== 'forever') {
            _startMuteCountdown(btn.parentElement, parseInt(expiry), userId);
        }
    } else if (soundOff) {
        btn.classList.remove('muted');
        btn.classList.add('sound-off');
        icon.className = 'fas fa-volume-mute';
        if (label) label.textContent = 'Im lặng';
    } else {
        btn.classList.remove('muted');
        btn.classList.remove('sound-off');
        icon.className = 'fas fa-bell';
        if (label) label.textContent = 'Thông báo';
    }
}

/**
 * Bắt đầu đếm ngược hiển thị dưới nút chuông
 */
function _startMuteCountdown(container, expiryTime, userId) {
    // Tạo element đếm ngược
    const countdown = document.createElement('div');
    countdown.className = 'mute-countdown';
    container.appendChild(countdown);
    
    function updateCountdown() {
        const remaining = expiryTime - Date.now();
        if (remaining <= 0) {
            // Hết hạn → bật lại + xóa countdown
            clearInterval(_muteCountdownInterval);
            _muteCountdownInterval = null;
            countdown.remove();
            localStorage.removeItem(`cinechat_muted_${userId}`);
            localStorage.removeItem(`cinechat_mute_expiry_${userId}`);
            localStorage.removeItem(`cinechat_soundoff_${userId}`);
            updateMuteUI(userId);
            showNotification("🔔 Thông báo đã được bật lại", "success");
            return;
        }
        
        const hours = Math.floor(remaining / 3600000);
        const mins = Math.floor((remaining % 3600000) / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        
        if (hours > 0) {
            countdown.innerHTML = `<i class="fas fa-hourglass-half"></i> ${hours}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
        } else {
            countdown.innerHTML = `<i class="fas fa-hourglass-half"></i> ${mins}:${String(secs).padStart(2,'0')}`;
        }
    }
    
    updateCountdown();
    _muteCountdownInterval = setInterval(updateCountdown, 1000);
}

/**
 * Hiện popup toast thông báo tin nhắn mới
 */
let chatToastTimer = null;
function showChatToast(senderName, senderAvatar, messagePreview, senderId) {
    // Xóa toast cũ nếu có
    const oldToast = document.querySelector('.comm-chat-toast');
    if (oldToast) oldToast.remove();
    if (chatToastTimer) clearTimeout(chatToastTimer);
    
    // Thoát nếu đang ở đúng hội thoại VÀ thực sự nhìn thấy chat
    const chatEl = document.getElementById('commChatMessages');
    const isChatVisible = chatEl && chatEl.offsetHeight > 0;
    if (currentCommView === 'chat' && currentChatUserId === senderId && isChatVisible) return;
    
    const toast = document.createElement('div');
    toast.className = 'comm-chat-toast';
    toast.innerHTML = `
        <img src="${senderAvatar}" class="comm-chat-toast-avatar" alt="${senderName}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=random'">
        <div class="comm-chat-toast-body">
            <div class="comm-chat-toast-label"><i class="fas fa-comment-dots"></i> Tin nhắn mới</div>
            <div class="comm-chat-toast-name">${escapeHtml(senderName)}</div>
            <div class="comm-chat-toast-msg">${escapeHtml(messagePreview)}</div>
            <div class="comm-chat-toast-mute" data-sender="${senderId}">
                <i class="fas fa-bell-slash"></i> Tắt thông báo 1h
            </div>
        </div>
        <button class="comm-chat-toast-close" onclick="event.stopPropagation(); closeChatToast()" title="Đóng">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Nút "Tắt thông báo 1h" — xử lý riêng, không mở chat
    const muteBtn = toast.querySelector('.comm-chat-toast-mute');
    if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sid = muteBtn.dataset.sender;
            // Tắt thông báo + sound cho sender này trong 1h
            localStorage.setItem(`cinechat_muted_${sid}`, 'true');
            localStorage.setItem(`cinechat_soundoff_${sid}`, 'true');
            const expiry = Date.now() + (1 * 60 * 60 * 1000);
            localStorage.setItem(`cinechat_mute_expiry_${sid}`, String(expiry));
            closeChatToast();
            showNotification(`🔕 Đã tắt thông báo từ ${senderName} trong 1 giờ`, "info");
            updateMuteUI(sid);
        });
    }

    // Click vào toast → chuyển tới trang Cộng Đồng → mở chat với người gửi
    toast.addEventListener('click', async () => {
        closeChatToast();
        
        // Nếu chưa ở trang Cộng Đồng → chuyển sang
        if (typeof showPage === 'function') {
            showPage('community');
        }
        
        // Đảm bảo community đã khởi tạo
        if (!isCommunityLoaded && typeof initCommunity === 'function') {
            await initCommunity();
            isCommunityLoaded = true;
        }
        
        // Chuyển sang tab CineChat
        if (typeof switchCommView === 'function') {
            switchCommView('chat');
        }
        
        // Mở chat với người gửi (chờ 1 chút để DOM sẵn sàng)
        setTimeout(() => {
            openChat(senderId, senderName, senderAvatar);
        }, 300);
    });
    
    document.body.appendChild(toast);
    
    // Tự ẩn sau 5 giây
    chatToastTimer = setTimeout(() => {
        closeChatToast();
    }, 5000);
}

/**
 * Đóng toast thông báo với animation
 */
function closeChatToast() {
    const toast = document.querySelector('.comm-chat-toast');
    if (!toast) return;
    
    toast.classList.add('toast-hiding');
    setTimeout(() => {
        toast.remove();
    }, 300); // Chờ animation kết thúc
    
    if (chatToastTimer) {
        clearTimeout(chatToastTimer);
        chatToastTimer = null;
    }
}

/**
 * Phát âm thanh thông báo tin nhắn mới
 * Dùng file WAV thật — tương thích mọi trình duyệt kể cả Safari iOS
 */
const _chatNotifAudio = new Audio('./assets/notification.wav');
_chatNotifAudio.preload = 'auto';
_chatNotifAudio.volume = 0.5;

// Unlock audio trên Safari: phát silent khi user tương tác lần đầu
let _audioUnlocked = false;
function _unlockAudio() {
    if (_audioUnlocked) return;
    _chatNotifAudio.volume = 0;
    const p = _chatNotifAudio.play();
    if (p) p.then(() => {
        _chatNotifAudio.pause();
        _chatNotifAudio.currentTime = 0;
        _chatNotifAudio.volume = 0.5;
        _audioUnlocked = true;
        console.log("🔊 Audio đã được mở khóa");
    }).catch(() => {});
}
['click', 'touchstart', 'touchend', 'keydown'].forEach(e => {
    document.addEventListener(e, _unlockAudio, { once: true, passive: true });
});

function playChatNotificationSound() {
    try {
        // iOS Safari: PHẢI dùng lại cùng Audio element đã unlock
        // Không được clone — clone tạo element mới chưa unlock
        _chatNotifAudio.currentTime = 0;
        _chatNotifAudio.volume = 0.5;
        const playPromise = _chatNotifAudio.play();
        if (playPromise) {
            playPromise.catch(() => {
                console.warn("🔇 Trình duyệt chặn âm thanh — cần click/chạm trang trước");
            });
        }
    } catch (e) {
        console.warn("Không thể phát âm thanh:", e);
    }
}

/**
 * Cập nhật badge tổng tin chưa đọc trên nav CineChat
 */
function updateNavUnreadBadge(displayItems) {
    const badge = document.getElementById('commNavUnreadBadge');
    if (!badge) return;
    
    // Tính tổng unread từ tất cả hội thoại
    const totalUnread = (displayItems || []).reduce((sum, item) => sum + (item.unreadCount || 0), 0);
    
    if (totalUnread > 0) {
        badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// ==========================================
// QR CODE USER - Tạo và hiển thị mã QR cho user
// ==========================================

/**
 * Hiển thị modal QR Code cho user đang xem trong Chat Info Sidebar
 * Lấy thông tin từ biến currentChatTarget (người đang chat cùng)
 */
function showUserQRCode() {
    try {
        if (!currentChatTarget) {
            showNotification('Không tìm thấy thông tin người dùng', 'error');
            return;
        }

        const userId = currentChatTarget.id || currentChatTarget.user_id;
        const userName = currentChatTarget.name || currentChatTarget.display_name || 'User';
        const userAvatar = currentChatTarget.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`;
        const username = currentChatTarget.username || userId.slice(0, 8);

        // Cập nhật thông tin trên section QR
        const avatarEl = document.getElementById('qrUserAvatar');
        const nameEl = document.getElementById('qrUserName');
        const usernameEl = document.getElementById('qrUserUsername');

        if (avatarEl) avatarEl.src = userAvatar;
        if (nameEl) nameEl.textContent = userName;
        if (usernameEl) usernameEl.textContent = `@${username}`;

        // Tạo mã QR
        generateUserQR(userId);

        // Hiện modal
        const modal = document.getElementById('commUserQRModal');
        if (!modal) return;
        modal.style.display = 'flex';
        modal.classList.add('active');

        // Ẩn phần quét — chỉ hiện QR người đó
        const scanActions = modal.querySelector('.comm-qr-scan-actions');
        const cameraPreview = document.getElementById('qrCameraPreview');
        const searchGroup = modal.querySelector('.comm-qr-search');
        const scanResult = document.getElementById('qrScanResult');
        const fileInput = document.getElementById('qrFileInput');

        const hideEls = [scanActions, cameraPreview, searchGroup, scanResult, fileInput];
        hideEls.forEach(el => { if (el) el.style.display = 'none'; });

        // Đổi tiêu đề
        const titleEl = modal.querySelector('.comm-qr-header-title');
        const descEl = modal.querySelector('.comm-qr-header-desc');
        const origTitle = titleEl ? titleEl.textContent : '';
        const origDesc = descEl ? descEl.textContent : '';
        if (titleEl) titleEl.textContent = `Mã QR - ${userName}`;
        if (descEl) descEl.textContent = 'Quét mã này để kết nối';

        // Hiện section QR
        const section = document.getElementById('qrMyCodeSection');
        if (section) section.style.display = 'block';

        // Khi đóng → khôi phục
        const closeBtn = modal.querySelector('.comm-modal-close');
        const origHandler = closeBtn ? closeBtn.onclick : null;
        if (closeBtn) {
            closeBtn.onclick = function() {
                hideEls.forEach(el => { if (el) el.style.display = ''; });
                if (titleEl) titleEl.textContent = origTitle;
                if (descEl) descEl.textContent = origDesc;
                if (section) section.style.display = 'none';
                modal.style.display = 'none';
                modal.classList.remove('active');
                if (origHandler) closeBtn.onclick = origHandler;
            };
        }

        console.log(`📱 Hiển thị QR Code cho user: ${userName} (${userId})`);
    } catch (e) {
        console.error('Lỗi hiển thị QR Code:', e);
        showNotification('Có lỗi khi tạo mã QR', 'error');
    }
}

/**
 * Tạo mã QR Code từ User ID và render vào container
 * QR data format: tramphim://user/<user_id>
 * @param {string} userId - UUID của user
 */
function generateUserQR(userId) {
    const container = document.getElementById('qrCodeContainer');
    if (!container) return;

    // Xóa QR cũ nếu có
    container.innerHTML = '';

    // Kiểm tra thư viện qrcode-generator đã load chưa
    if (typeof qrcode === 'undefined') {
        container.innerHTML = '<p style="color: #ff4d4d; font-size: 0.8rem;">Thư viện QR chưa sẵn sàng</p>';
        console.error('qrcode-generator chưa được load');
        return;
    }

    try {
        // Tạo dữ liệu QR (URI format)
        const qrData = `tramphim://user/${userId}`;

        // Tạo QR code (typeNumber 0 = auto, errorCorrectionLevel M = 15%)
        const qr = qrcode(0, 'M');
        qr.addData(qrData);
        qr.make();

        // Render QR thành thẻ img
        const imgTag = qr.createImgTag(5, 0); // cellSize=5, margin=0
        container.innerHTML = imgTag;

        // Lưu userId vào data attribute để dùng khi download
        container.dataset.userId = userId;
    } catch (e) {
        console.error('Lỗi tạo QR Code:', e);
        container.innerHTML = '<p style="color: #ff4d4d; font-size: 0.8rem;">Không thể tạo mã QR</p>';
    }
}

/**
 * Tải mã QR xuống dưới dạng ảnh PNG
 * Render canvas đẹp với avatar, tên, QR code và branding
 */
function downloadUserQR() {
    try {
        const container = document.getElementById('qrCodeContainer');
        const qrImg = container ? container.querySelector('img') : null;
        if (!qrImg) {
            showNotification('Chưa có mã QR để tải', 'warning');
            return;
        }

        const userName = document.getElementById('qrUserName')?.textContent || 'User';
        const userUsername = document.getElementById('qrUserUsername')?.textContent || '';

        // Tạo canvas để render ảnh QR đẹp
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 400;
        canvas.width = size;
        canvas.height = size + 120; // Thêm không gian cho tên + branding

        // Background gradient tối
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#0f1923');
        gradient.addColorStop(1, '#1a2332');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Viền trang trí accent
        ctx.strokeStyle = '#4db8ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

        // Tên user
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Montserrat", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(userName, size / 2, 40);

        // Username
        ctx.fillStyle = '#4db8ff';
        ctx.font = '14px "Montserrat", sans-serif';
        ctx.fillText(userUsername, size / 2, 62);

        // Vẽ nền trắng cho QR
        const qrBgSize = 220;
        const qrBgX = (size - qrBgSize) / 2;
        const qrBgY = 80;
        ctx.fillStyle = '#ffffff';
        // Bo góc cho nền
        const radius = 12;
        ctx.beginPath();
        ctx.moveTo(qrBgX + radius, qrBgY);
        ctx.lineTo(qrBgX + qrBgSize - radius, qrBgY);
        ctx.quadraticCurveTo(qrBgX + qrBgSize, qrBgY, qrBgX + qrBgSize, qrBgY + radius);
        ctx.lineTo(qrBgX + qrBgSize, qrBgY + qrBgSize - radius);
        ctx.quadraticCurveTo(qrBgX + qrBgSize, qrBgY + qrBgSize, qrBgX + qrBgSize - radius, qrBgY + qrBgSize);
        ctx.lineTo(qrBgX + radius, qrBgY + qrBgSize);
        ctx.quadraticCurveTo(qrBgX, qrBgY + qrBgSize, qrBgX, qrBgY + qrBgSize - radius);
        ctx.lineTo(qrBgX, qrBgY + radius);
        ctx.quadraticCurveTo(qrBgX, qrBgY, qrBgX + radius, qrBgY);
        ctx.closePath();
        ctx.fill();

        // Vẽ QR code lên canvas
        const qrSize = 200;
        const qrX = (size - qrSize) / 2;
        const qrY = 90;
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        // Branding
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '12px "Montserrat", sans-serif';
        ctx.fillText('Trạm Phim • TramPhim', size / 2, canvas.height - 50);

        // Gợi ý
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.font = '10px "Montserrat", sans-serif';
        ctx.fillText('Quét mã QR để kết nối', size / 2, canvas.height - 30);

        // Download
        const link = document.createElement('a');
        link.download = `QR_${userName.replace(/\s+/g, '_')}_TramPhim.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        showNotification('Đã tải mã QR thành công!', 'success');
    } catch (e) {
        console.error('Lỗi tải QR:', e);
        showNotification('Có lỗi khi tải mã QR', 'error');
    }
}

/**
 * Tìm kiếm user bằng ID (nhập từ ô input hoặc quét QR)
 * Query Supabase theo UUID rồi mở profile
 */
async function searchUserByQR() {
    const input = document.getElementById('qrSearchInput');
    if (!input) return;

    let searchId = input.value.trim();
    if (!searchId) {
        showNotification('Vui lòng nhập ID người dùng', 'warning');
        return;
    }

    // Hỗ trợ parse URI format: tramphim://user/<uuid>
    if (searchId.startsWith('tramphim://user/')) {
        searchId = searchId.replace('tramphim://user/', '');
    }

    try {
        // Query profile từ Supabase
        const { data, error } = await supabase
            .from('profiles')
            .select('id, display_name, avatar')
            .eq('id', searchId)
            .single();

        if (error || !data) {
            showNotification('Không tìm thấy người dùng với ID này', 'warning');
            return;
        }

        // Đóng modal QR
        closeUserQRModal();

        // Mở profile người dùng tìm được
        showNotification(`Đã tìm thấy: ${data.display_name || 'User'}`, 'success');
        viewUserProfile(data.id);

    } catch (e) {
        console.error('Lỗi tìm kiếm user:', e);
        showNotification('Có lỗi khi tìm kiếm người dùng', 'error');
    }
}

/**
 * Đóng modal QR Code + dừng camera nếu đang quét
 */
function closeUserQRModal() {
    // Dừng camera nếu đang quét
    stopQRCameraScanner();
    
    const modal = document.getElementById('commUserQRModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    // Reset ô tìm kiếm + kết quả
    const input = document.getElementById('qrSearchInput');
    if (input) input.value = '';
    const result = document.getElementById('qrScanResult');
    if (result) result.style.display = 'none';
    // Reset file input
    const fileInput = document.getElementById('qrFileInput');
    if (fileInput) fileInput.value = '';
}

// === QR SCANNER: Biến global ===
let qrCameraStream = null; // Stream camera đang mở
let qrScanAnimationId = null; // requestAnimationFrame ID

/**
 * Xử lý upload ảnh QR từ thiết bị, decode bằng jsQR
 * @param {Event} event - Sự kiện change của input file
 */
function handleQRImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const resultEl = document.getElementById('qrScanResult');
    if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.className = 'comm-qr-scan-result';
        resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đọc mã QR...';
    }

    // Kiểm tra thư viện jsQR
    if (typeof jsQR === 'undefined') {
        if (resultEl) {
            resultEl.className = 'comm-qr-scan-result error';
            resultEl.textContent = 'Thư viện quét QR chưa sẵn sàng. Thử tải lại trang.';
        }
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            try {
                // Vẽ ảnh lên canvas ẩn để lấy pixel data
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code && code.data) {
                    console.log('📱 Đã quét QR từ ảnh:', code.data);
                    processQRResult(code.data);
                } else {
                    if (resultEl) {
                        resultEl.className = 'comm-qr-scan-result error';
                        resultEl.textContent = '❌ Không tìm thấy mã QR trong ảnh. Hãy thử ảnh khác.';
                    }
                }
            } catch (err) {
                console.error('Lỗi decode QR:', err);
                if (resultEl) {
                    resultEl.className = 'comm-qr-scan-result error';
                    resultEl.textContent = '❌ Lỗi khi đọc mã QR. Vui lòng thử lại.';
                }
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Reset file input để cho phép chọn lại cùng file
    event.target.value = '';
}

/**
 * Mở camera và quét mã QR real-time
 * Sử dụng getUserMedia + jsQR để decode mỗi frame
 */
async function startQRCameraScanner() {
    const previewEl = document.getElementById('qrCameraPreview');
    const videoEl = document.getElementById('qrCameraVideo');
    const canvasEl = document.getElementById('qrCameraCanvas');
    const resultEl = document.getElementById('qrScanResult');

    if (!previewEl || !videoEl || !canvasEl) return;

    // Kiểm tra thư viện jsQR
    if (typeof jsQR === 'undefined') {
        showNotification('Thư viện quét QR chưa sẵn sàng', 'error');
        return;
    }

    // Kiểm tra camera có sẵn không
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showNotification('Trình duyệt không hỗ trợ camera. Hãy dùng tính năng tải ảnh QR.', 'warning');
        return;
    }

    try {
        // Mở camera (ưu tiên camera sau trên mobile)
        qrCameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
        });

        videoEl.srcObject = qrCameraStream;
        previewEl.style.display = 'block';

        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.className = 'comm-qr-scan-result';
            resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang quét...';
        }

        // Đợi video sẵn sàng rồi bắt đầu quét
        videoEl.onloadedmetadata = () => {
            canvasEl.width = videoEl.videoWidth;
            canvasEl.height = videoEl.videoHeight;
            scanQRFrame(videoEl, canvasEl, resultEl);
        };

        console.log('📷 Đã mở camera quét QR');
    } catch (err) {
        console.error('Lỗi mở camera:', err);
        if (err.name === 'NotAllowedError') {
            showNotification('Bạn cần cho phép truy cập camera để quét QR', 'warning');
        } else {
            showNotification('Không thể mở camera. Thử dùng tính năng tải ảnh QR.', 'error');
        }
    }
}

/**
 * Quét QR từ mỗi frame của video camera
 * Sử dụng requestAnimationFrame để quét liên tục
 */
function scanQRFrame(video, canvas, resultEl) {
    if (!qrCameraStream) return; // Đã dừng

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
            console.log('📱 Đã quét QR từ camera:', code.data);
            // Dừng camera khi quét thành công
            stopQRCameraScanner();
            processQRResult(code.data);
            return;
        }
    } catch (e) {
        // Bỏ qua lỗi nhỏ khi quét frame
    }

    // Tiếp tục quét frame tiếp theo (throttle ~300ms)
    qrScanAnimationId = setTimeout(() => {
        requestAnimationFrame(() => scanQRFrame(video, canvas, resultEl));
    }, 300);
}

/**
 * Dừng camera quét QR
 */
function stopQRCameraScanner() {
    // Dừng stream camera
    if (qrCameraStream) {
        qrCameraStream.getTracks().forEach(track => track.stop());
        qrCameraStream = null;
    }
    // Dừng animation loop
    if (qrScanAnimationId) {
        clearTimeout(qrScanAnimationId);
        qrScanAnimationId = null;
    }
    // Ẩn preview
    const previewEl = document.getElementById('qrCameraPreview');
    if (previewEl) previewEl.style.display = 'none';

    const videoEl = document.getElementById('qrCameraVideo');
    if (videoEl) videoEl.srcObject = null;

    // Cập nhật kết quả: nếu đang hiển thị "Đang quét..." thì đổi thành thông báo dừng
    const resultEl = document.getElementById('qrScanResult');
    if (resultEl && resultEl.style.display !== 'none') {
        const currentText = resultEl.textContent || '';
        if (currentText.includes('Đang quét')) {
            resultEl.className = 'comm-qr-scan-result error';
            resultEl.textContent = 'Đã dừng quét. Không tìm thấy mã QR nào.';
        }
    }
}

/**
 * Xử lý kết quả quét QR: parse URI, tìm user trên Supabase, mở profile
 * @param {string} qrData - Dữ liệu QR đã decode
 */
async function processQRResult(qrData) {
    const resultEl = document.getElementById('qrScanResult');

    // Parse user ID từ QR data
    let userId = qrData;
    if (qrData.startsWith('tramphim://user/')) {
        userId = qrData.replace('tramphim://user/', '').trim();
    }

    // Validate format UUID cơ bản
    if (!userId || userId.length < 8) {
        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.className = 'comm-qr-scan-result error';
            resultEl.textContent = '❌ Mã QR không hợp lệ. Không phải mã QR của Trạm Phim.';
        }
        return;
    }

    if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.className = 'comm-qr-scan-result';
        resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tìm người dùng...';
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, display_name, avatar')
            .eq('id', userId)
            .single();

        if (error || !data) {
            if (resultEl) {
                resultEl.className = 'comm-qr-scan-result error';
                resultEl.textContent = '❌ Không tìm thấy người dùng với mã QR này.';
            }
            return;
        }

        // Tìm thấy user!
        if (resultEl) {
            resultEl.className = 'comm-qr-scan-result success';
            resultEl.innerHTML = `✅ Đã tìm thấy: <strong>${data.display_name || 'User'}</strong>. Đang mở profile...`;
        }

        // Đợi 1s cho user đọc kết quả rồi mở profile
        setTimeout(() => {
            closeUserQRModal();
            viewUserProfile(data.id);
            showNotification(`Đã tìm thấy: ${data.display_name || 'User'}`, 'success');
        }, 1000);

    } catch (e) {
        console.error('Lỗi xử lý QR:', e);
        if (resultEl) {
            resultEl.className = 'comm-qr-scan-result error';
            resultEl.textContent = '❌ Có lỗi khi tìm kiếm. Vui lòng thử lại.';
        }
    }
}

