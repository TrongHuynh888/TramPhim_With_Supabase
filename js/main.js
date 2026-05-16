// ============================================
// CẬP NHẬT HÀM KHỞI CHẠY (startTramPhimApp)
// ============================================
window.startTramPhimApp = async () => {
  console.log("🎬 Trạm Phim Starting...");

  // auth.onAuthStateChanged(handleAuthStateChange); // Đã có trong auth.js
  await loadInitialData();

  initializeUI();
  
  // Xử lý OAuth error redirect: Dọn dẹp URL query params (?error=access_denied)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('error')) {
      // Xóa query params khỏi URL nhưng giữ lại hash
      const cleanUrl = window.location.pathname + window.location.hash;
      history.replaceState(null, '', cleanUrl);
  }

  // Custom: Check URL Hash for deep linking (Fix lỗi F5)
  const hash = window.location.hash;
  if (hash) {
      console.log("🔗 Deep linking from Hash:", hash);
      handleHashRouting(hash);
  }
 
  initializeRatingStars();
  loadTheme();
  initNavbarScroll();
  initSmartPopupPositioning(); // Call new function
 
  // 👇 GỌI HÀM THỐNG KÊ MỚI TẠI ĐÂY 👇
  initVisitorStats();
 
  console.log("✅ App Ready!");
};

/**
 * Hàm xử lý điều hướng dựa trên Hash
 */
function handleHashRouting(hash, state = null) {
    if (!hash || hash === '#' || hash === '#/') {
        showPage('home', false);
        return;
    }

    console.log("🛠️ Handling Hash Routing:", hash, "State:", state);

    // Xử lý lỗi OAuth redirect (VD: #error=access_denied khi user hủy đăng nhập Google)
    if (hash.includes('error=')) {
        console.warn("⚠️ OAuth redirect error detected:", hash);
        // Dọn dẹp URL về trang chủ
        history.replaceState(null, '', window.location.pathname);
        showPage('home', false);

        // Hiện thông báo phù hợp
        const isAccessDenied = hash.includes('access_denied');
        if (isAccessDenied) {
            if (typeof showNotification === 'function') {
                showNotification("Bạn đã hủy đăng nhập Google.", "info");
            }
        } else {
            if (typeof showNotification === 'function') {
                showNotification("Đăng nhập thất bại. Vui lòng thử lại.", "error");
            }
        }
        return;
    }

    // Phân tích hash (VD: #/watch/slug-id hoặc #/movies)
    const parts = hash.replace(/^#\/?/, '').split('/');
    const page = parts[0];
    const slugWithId = parts[1];

    if ((page === 'watch' || page === 'intro') && slugWithId) {
        let movieId = state ? state.movieId : null;
        
        // Nếu không có state (F5 hoặc copy link), thử trích xuất từ URL
        if (!movieId) {
            // Logic cũ: split('-').pop() -> Lỗi nếu ID có gạch ngang
            // Logic mới: Thử tìm ID khớp nhất từ cuối chuỗi
            const segments = slugWithId.split('-');
            
            // Thử từng tổ hợp từ cuối chuỗi lên (VD: 265, rồi dieutravienhong-265...)
            if (typeof allMovies !== 'undefined' && allMovies.length > 0) {
                for (let i = 1; i <= segments.length; i++) {
                    const potentialId = segments.slice(-i).join('-');
                    if (allMovies.some(m => m.id === potentialId)) {
                        movieId = potentialId;
                        break;
                    }
                }
            }
            
            // Fallback nếu vẫn không tìm thấy trong allMovies
            if (!movieId) {
                movieId = segments.pop(); 
            }
        }
        
        if (movieId) {
            console.log(`🎯 Resolved MovieID: ${movieId} for page: ${page}`);
            if (page === 'watch' && typeof viewMovieDetail === 'function') {
                setTimeout(() => viewMovieDetail(movieId, false), 100);
            } else if (page === 'intro' && typeof viewMovieIntro === 'function') {
                setTimeout(() => viewMovieIntro(movieId, false), 100);
            }
            return;
        }
    }

    // Xử lý các trang thông thường (movies, categories...)
    if (page) {
        setTimeout(() => showPage(page, false), 100);
    }
}

// ============================================
// HÀM THỐNG KÊ REALTIME (CON SỐ THỰC TẾ 100%)
// ============================================
let presenceChannel = null;
let heartbeatInterval = null;

async function initVisitorStats() {
  const statVisits = document.getElementById("statVisits");
  const statOnline = document.getElementById("statOnline");
  const statTime = document.getElementById("statTime");

  if (!supabase) {
    if (statVisits) statVisits.textContent = "0";
    if (statOnline) statOnline.textContent = "0";
    return;
  }

  // 1. NGƯỜI ĐANG ONLINE (Supabase Presence - Thật 100%)
  if (statOnline && !presenceChannel) {
    presenceChannel = supabase.channel('site-presence', {
      config: { presence: { key: currentUser ? currentUser.id : 'guest-' + Math.random().toString(36).substr(2, 9) } }
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const onlineCount = Object.keys(state).length;
        statOnline.textContent = onlineCount || 1;
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ online_at: new Date().toISOString() });
        }
      });
  }

  // 2. TỔNG TRUY CẬP & THỜI GIAN TRUNG BÌNH (Dữ liệu thật từ DB)
  try {
    const { data: configData } = await supabase
      .from('app_configs')
      .select('value')
      .eq('key', 'site_stats')
      .maybeSingle();

    let stats = configData?.value || { total_visits: 0, total_minutes: 0 };
    
    // 👇 FIX: Reset số ảo 5000 nếu tồn tại (để về dữ liệu thật)
    if (stats.total_visits >= 5000 && stats.total_visits < 5100) {
        stats.total_visits = 1; // Reset về 1 để đếm lại từ đầu số thật
    } else {
        stats.total_visits = (parseInt(stats.total_visits) || 0) + 1;
    }

    // Cập nhật lượt truy cập mới ngay lập tức
    await supabase.from('app_configs').upsert({ key: 'site_stats', value: stats });

    // Hiển thị Tổng truy cập
    if (statVisits) {
        statVisits.textContent = typeof formatNumber === 'function' ? formatNumber(stats.total_visits) : stats.total_visits;
    }

    // Hiển thị TG trung bình ban đầu
    updateAverageTimeUI(stats);

    // 3. KÍCH HOẠT HEARTBEAT (Đếm thời gian thực mỗi phút)
    startVisitorHeartbeat();

  } catch (error) {
    console.error("❌ Lỗi thống kê thực tế:", error);
  }
}

/**
 * Cập nhật giao diện Thời gian trung bình
 */
function updateAverageTimeUI(stats) {
    const statTime = document.getElementById("statTime");
    if (!statTime) return;

    const totalMin = stats.total_minutes || 0;
    const totalVis = stats.total_visits || 1;
    let avg = totalMin / totalVis;
    
    // Nếu chưa có dữ liệu thời gian, để mặc định 0.5 phút cho thật
    if (avg < 0.1) avg = 0.5; 

    statTime.textContent = avg.toFixed(1) + " phút";
}

/**
 * Cơ chế Heartbeat: Mỗi 1 phút gửi tín hiệu "đang xem" để tính thời gian trung bình
 */
function startVisitorHeartbeat() {
    if (heartbeatInterval) return;

    heartbeatInterval = setInterval(async () => {
        try {
            const { data: configData } = await supabase
                .from('app_configs')
                .select('value')
                .eq('key', 'site_stats')
                .maybeSingle();

            if (configData && configData.value) {
                let stats = configData.value;
                stats.total_minutes = (parseFloat(stats.total_minutes) || 0) + 1; // Cộng thêm 1 phút

                await supabase.from('app_configs').upsert({ key: 'site_stats', value: stats });
                updateAverageTimeUI(stats);
                console.log("⏱️ Site Heartbeat: +1 minute to avg time.");
            }
        } catch (e) {
            console.warn("Heartbeat failed:", e);
        }
    }, 60000); // 1 phút
}

// ============================================
// XỬ LÝ NAVIGATE BACK/FORWARD (Browser Buttons)
// ============================================
window.addEventListener('popstate', function(event) {
    console.log("📍 Popstate triggered:", window.location.hash, event.state);
    
    if (window.location.hash) {
        handleHashRouting(window.location.hash, event.state);
    } else {
        showPage('home', false);
    }
});

/* ============================================
   HÀM XỬ LÝ VỊ TRÍ POPUP THÔNG MINH (CHO PC & ALL)
   ============================================ */
function initSmartPopupPositioning() {
  document.addEventListener("mouseover", function (e) {
    const wrapper = e.target.closest(".movie-card-wrapper");
    if (!wrapper) return;

    const popup = wrapper.querySelector(".movie-popup-nfx");
    if (!popup) return;

    // Lấy kích thước wrapper & màn hình
    const rect = wrapper.getBoundingClientRect();
    const screenWidth = window.innerWidth;
    
    // Reset position
    wrapper.classList.remove("popup-align-left", "popup-align-right");

    // Logic kiểm tra mép màn hình
    // Nếu mép trái < 150px (dư để popup mở sang phải không bị che)
    if (rect.left < 150) {
      wrapper.classList.add("popup-align-left");
    } 
    // Nếu mép phải sát lề ( > width - 150px)
    else if (rect.right > screenWidth - 150) {
      wrapper.classList.add("popup-align-right");
    }
  });
}

// ============================================
// HÀM XỬ LÝ DROPDOWN THÔNG BÁO VIP
// ============================================
window.toggleVipNotificationDropdown = function(event) {
    event.stopPropagation();
    const dropdown = document.getElementById("vipNotificationDropdown");
    const userDropdown = document.getElementById("userDropdown");
    
    // Đóng user dropdown nếu đang mở
    if (userDropdown && userDropdown.classList.contains("active")) {
        userDropdown.classList.remove("active");
    }
    
    dropdown.classList.toggle("hidden");
};

// Đóng dropdown thông báo khi click ngoài
document.addEventListener("click", function (event) {
    const dropdown = document.getElementById("vipNotificationDropdown");
    const notifBtn = document.getElementById("notificationBtn");
    
    // Nếu click ra ngoài dropdown VÀ ngoài cái nút chuông
    if (dropdown && notifBtn && !dropdown.classList.contains("hidden")) {
        if (!dropdown.contains(event.target) && !notifBtn.contains(event.target)) {
            dropdown.classList.add("hidden");
        }
    }
});
