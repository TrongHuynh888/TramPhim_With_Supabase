/**
 * Render phim nổi bật — Top 10 phim view cao nhất trong ngày
 * Query bảng view_logs trên Supabase để lấy lượt xem theo ngày
 * Fallback: nếu không có dữ liệu view_logs → dùng tổng views
 */
async function renderFeaturedMovies() {
  const container = document.getElementById("featuredMovies");
  if (!container) return;

  let featured = [];

  try {
    // Tính mốc đầu ngày hôm nay (00:00:00)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Query view_logs trong ngày hôm nay từ Supabase
    if (typeof supabase !== 'undefined' && supabase) {
      const { data, error } = await supabase
        .from('view_logs')
        .select('movie_id')
        .gte('viewed_at', todayStart)
        .limit(10000);

      if (!error && data && data.length > 0) {
        // Đếm lượt xem theo movie_id
        const viewCounts = {};
        data.forEach(log => {
          viewCounts[log.movie_id] = (viewCounts[log.movie_id] || 0) + 1;
        });

        // Sort và lấy top 20 movie_id
        const top20Ids = Object.entries(viewCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([movieId]) => movieId);

        // Map về object phim từ allMovies
        featured = top20Ids
          .map(id => allMovies.find(m => m.id === id))
          .filter(Boolean);
      }
    }
  } catch (err) {
    console.warn('⚠️ Lỗi query view_logs cho Phim Nổi Bật:', err.message);
  }

  // Fallback: nếu chưa có dữ liệu trong ngày → dùng tổng views
  if (featured.length === 0) {
    featured = [...allMovies]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 20);
  }

  container.innerHTML = featured
    .map((movie) => createMovieCard(movie))
    .join("");

  // Đồng bộ kích thước thẻ phim với grid gốc + kích hoạt kéo cuộn
  syncFeaturedCardWidth();
  initFeaturedDragScroll();
}

/**
 * Đồng bộ kích thước thẻ #featuredMovies = kích thước cột grid "Phim Mới Cập Nhật"
 * Đọc computed grid column width từ #newMovies và set --card-width cho #featuredMovies
 */
function syncFeaturedCardWidth() {
  const featured = document.getElementById('featuredMovies');
  if (!featured) return;

  // Tìm grid tham chiếu: "Phim Mới Cập Nhật" hoặc "Tất Cả Phim"
  const refGrid = document.getElementById('newMovies') || document.getElementById('allMoviesGrid');

  if (refGrid) {
    // Đọc chiều rộng cột đầu tiên từ grid tham chiếu
    const cols = window.getComputedStyle(refGrid).gridTemplateColumns;
    if (cols && cols !== 'none') {
      const firstColWidth = parseFloat(cols.split(' ')[0]);
      if (!isNaN(firstColWidth) && firstColWidth > 0) {
        featured.style.setProperty('--card-width', firstColWidth + 'px');
        return;
      }
    }
  }

  // Fallback: tự tính dựa trên container width (giống auto-fill minmax(200px, 1fr))
  const containerWidth = featured.parentElement ? featured.parentElement.clientWidth - 80 : 1200;
  const gap = 24;
  const numCols = Math.floor((containerWidth + gap) / (200 + gap));
  const colWidth = (containerWidth - (numCols - 1) * gap) / numCols;
  featured.style.setProperty('--card-width', Math.max(200, colWidth) + 'px');
}

// Cập nhật kích thước thẻ khi resize cửa sổ
window.addEventListener('resize', debounce(syncFeaturedCardWidth, 200));

/**
 * Kéo chuột để cuộn ngang cho wrapper Phim Nổi Bật (PC)
 * preventDefault trên mousedown chặn browser kéo ảnh
 * Ngưỡng 5px phân biệt click vs drag
 */
function initFeaturedDragScroll() {
  const el = document.getElementById('featuredScrollWrapper');
  if (!el || el._dragInitialized) return;
  el._dragInitialized = true;

  let isDown = false;
  let isDragging = false;
  let startX = 0;
  let scrollLeft = 0;

  el.addEventListener('mousedown', (e) => {
    isDown = true;
    isDragging = false;
    startX = e.pageX;
    scrollLeft = el.scrollLeft;
    // Chặn browser kéo ảnh mặc định — cho phép kéo cuộn từ mọi vị trí
    e.preventDefault();
  });

  el.addEventListener('mouseleave', () => {
    isDown = false;
    isDragging = false;
    el.style.cursor = 'grab';
  });

  el.addEventListener('mouseup', () => {
    isDown = false;
    el.style.cursor = 'grab';
    // Giữ isDragging = true cho đến khi click handler xử lý xong
    // Reset bằng setTimeout để click event kịp kiểm tra
    if (isDragging) {
      setTimeout(() => { isDragging = false; }, 0);
    }
  });

  // Chặn click nếu vừa drag xong (tránh mở popup/chuyển trang sau khi kéo)
  el.addEventListener('click', (e) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      isDragging = false;
    }
  }, true); // capture phase — chặn trước khi onclick trên card xử lý

  el.addEventListener('mousemove', (e) => {
    if (!isDown) return;

    const diff = Math.abs(e.pageX - startX);
    if (diff > 5) {
      isDragging = true;
      el.style.cursor = 'grabbing';
      e.preventDefault();
    }

    if (isDragging) {
      const walk = (e.pageX - startX) * 1.5;
      el.scrollLeft = scrollLeft - walk;
    }
  });
}

/**
 * Render phim mới
 */
function renderNewMovies() {
  const container = document.getElementById("newMovies");
  if (!container) return;

  // Render tạm tối đa 24 thẻ để grid tính số cột thực tế
  const sortedMovies = [...allMovies]
    .sort((a, b) => {
      const dateA = a.createdAt?.toDate
        ? a.createdAt.toDate()
        : new Date(a.createdAt);
      const dateB = b.createdAt?.toDate
        ? b.createdAt.toDate()
        : new Date(b.createdAt);
      return dateB - dateA;
    })
    .slice(0, 30);

  container.innerHTML = sortedMovies
    .map((movie) => createMovieCard(movie))
    .join("");

  // Cắt thẻ thừa để grid PC chỉ hiện đúng 2 hàng
  // Double requestAnimationFrame đảm bảo grid đã layout xong
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const display = window.getComputedStyle(container).display;
      if (display === 'grid') {
        const cols = window.getComputedStyle(container).gridTemplateColumns;
        if (cols && cols !== 'none') {
          const numCols = cols.split(' ').length;
          const maxCards = numCols * 2;
          const cards = container.querySelectorAll(':scope > .movie-card-wrapper');
          cards.forEach((card, i) => {
            if (i >= maxCards) card.remove();
          });
        }
      }
    });
  });
}

/**
 * Render tất cả phim
 */
function renderAllMovies(movies = null) {
  const container = document.getElementById("allMoviesGrid");
  if (!container) return;

  const moviesToRender = movies || allMovies;

  if (moviesToRender.length === 0) {
    container.innerHTML =
      '<p class="text-center text-muted">Không có phim nào</p>';
    return;
  }

  container.innerHTML = moviesToRender
    .map((movie) => createMovieCard(movie))
    .join("");
}

/**
 * Tạo HTML cho movie card (Phiên bản Netflix Pro - Nút to & Rõ chữ)
 * Tạo HTML cho movie card (Đã tích hợp nút Thích thông minh)
 */
/* ============================================================
   HÀM TẠO THẺ PHIM (ĐÃ FIX MOBILE TOUCH & GIỮ NGUYÊN TÍNH NĂNG CŨ)
   ============================================================ */
/* ============================================================
   1. HÀM TẠO THẺ PHIM (Cập nhật để hỗ trợ Mobile chuẩn)
   ============================================================ */
function createMovieCard(movie, matchedTags = []) {
  // Logic xử lý dữ liệu (giữ nguyên)
  // Logic xử lý hiển thị Phần/Mùa (Tránh lặp chữ "Phần Phần")
  let displayPart = movie.part || "";
  if (displayPart && !displayPart.toString().toLowerCase().includes("phần") && 
      !displayPart.toString().toLowerCase().includes("season") && 
      !displayPart.toString().toLowerCase().includes("chapter")) {
      displayPart = `Phần ${displayPart}`;
  }

  const partHtml = movie.part
    ? `<span style="background: var(--accent-primary); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 6px; text-transform: uppercase; vertical-align: middle;">${displayPart}</span>`
    : "";

  // Badge phần hiển thị trên ảnh nền popup (góc phải dưới)
  const partBadgeOnImage = movie.part
    ? `<span class="popup-part-badge">${displayPart}</span>`
    : "";

  let isLiked = false;
  if (
    typeof currentUser !== "undefined" &&
    currentUser &&
    currentUser.favorites
  ) {
    isLiked = currentUser.favorites.includes(movie.id);
  }
  const likeIcon = isLiked ? "fas fa-heart" : "far fa-heart";
  const likeClass = isLiked ? "liked" : "";
  const fallbackImage =
    "https://placehold.co/300x450/2a2a3a/FFFFFF?text=NO+POSTER";
  const matchScore = movie.rating ? Math.round(movie.rating * 20) : 95;

  // Tính badge trạng thái tập
  let episodeBadgeHtml = "";
  if (movie.type === "series") {
    const currentEps = movie._episodeCount || (movie.episodes || []).length;
    const totalEps = movie.totalEpisodes || 0;
    if (totalEps > 0 && currentEps >= totalEps) {
      episodeBadgeHtml = `<span class="episode-badge episode-badge-completed">Hoàn Tất (${currentEps}/${totalEps})</span>`;
    } else if (totalEps > 0) {
      episodeBadgeHtml = `<span class="episode-badge episode-badge-ongoing">Tập ${currentEps}/${totalEps}</span>`;
    } else if (currentEps > 0) {
      episodeBadgeHtml = `<span class="episode-badge episode-badge-ongoing">Tập ${currentEps}</span>`;
    }
  } else {
    // Phim lẻ (single) → hiện badge "Full"
    episodeBadgeHtml = `<span class="episode-badge episode-badge-full">Full</span>`;
  }

  // Tính text hiển thị tập cho popup
  let popupEpisodeText = '';
  if (movie.type === 'series') {
    const currentEps = movie._episodeCount || (movie.episodes || []).length;
    if (currentEps > 0) {
      popupEpisodeText = `Tập ${currentEps}`;
    } else {
      popupEpisodeText = 'Đang cập nhật';
    }
  } else {
    // Phim lẻ: không hiện text tập trong popup
    popupEpisodeText = '';
  }

  // Logic hiển thị nhãn khớp (Match Badges) - CHI HIÊN KHI LỌC
  let matchBadgesHtml = "";
  if (matchedTags && matchedTags.length > 0) {
    matchBadgesHtml = `
      <div class="match-badges-container">
        ${matchedTags.map(tag => `
          <div class="match-badge match-badge-${tag.type}">
            <i class="fas fa-${tag.icon}"></i>
            <span>${tag.label}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <div class="movie-card-wrapper" id="movie-wrapper-${movie.id}" onclick="handleMovieClick(event, '${movie.id}')">
        
        <div class="card movie-card movie-card-static ${window.userWatchHistoryCache?.[movie.id] ? 'has-watched' : ''}">
            <div class="card-image">
                <img src="${movie.posterUrl}" alt="${movie.title}" loading="lazy" onerror="this.src='${fallbackImage}';">
                ${episodeBadgeHtml}
                ${matchBadgesHtml}
                <!-- Watch Progress Bar -->
                <div class="watch-progress-container" id="progress-${movie.id}" style="${window.userWatchHistoryCache?.[movie.id] ? 'display: block;' : ''}">
                    <div class="watch-progress-bar" style="width: ${window.userWatchHistoryCache?.[movie.id] || 0}%"></div>
                </div>
            </div>
            <div class="card-body">
                <h4 class="card-title">${movie.title}</h4>
                ${movie.originTitle ? `<p class="card-origin-title" style="font-size: 0.8em; color: #555; margin: 3px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-style: italic; font-weight: 500;">${movie.originTitle}</p>` : ''}
                <div class="card-meta">
                    <span>${movie.year || "2026"}</span>
                    <span class="card-rating" style="color: var(--accent-secondary); font-weight: bold;">
                        ${movie.price ? movie.price + " CRO" : "Free"}
                    </span>
                </div>
            </div>
        </div>

        <div class="movie-popup-nfx" onclick="event.stopPropagation()">
            <div class="popup-header-img">
                <img src="${movie.backgroundUrl || movie.posterUrl}" onerror="this.onerror=null; this.src='${fallbackImage}';">
                ${partBadgeOnImage}
            </div>
            <div class="popup-body">
                <div class="popup-actions">
                    <button class="btn-popup-play" onclick="event.stopPropagation(); viewMovieIntro('${movie.id}')">
                        <i class="fas fa-play"></i> Xem ngay
                    </button>
                    <button class="btn-popup-icon ${likeClass} btn-like-${movie.id}" onclick="event.stopPropagation(); toggleFavorite('${movie.id}')">
                        <i class="${likeIcon}"></i>
                    </button>
                    <button class="btn-popup-icon ml-auto" onclick="event.stopPropagation(); viewMovieIntro('${movie.id}')">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <h3 class="popup-title-new">${movie.title}</h3>
                ${movie.originTitle ? `<p style="font-size: 0.85em; color: #555; margin: -5px 0 5px; font-style: italic; font-weight: 500;">${movie.originTitle}</p>` : ''}
                <div class="popup-meta-row">
                    <!-- Khối thông tin gốc -->
                    <div class="marquee-content">
                        <span class="meta-match">${matchScore}% Phù hợp</span>
                        <span class="meta-age">${movie.ageLimit || "T13"}</span>
                        <span>${movie.year || "2026"}</span>
                        <span>${(movie.duration || '90p').replace(/\s*\/\s*tập/gi, '')}</span>
                        ${popupEpisodeText ? `<span>${popupEpisodeText}</span>` : ''}
                        <span class="meta-quality">${movie.quality || "HD"}</span>
                    </div>
                    <!-- Bản sao chỉ dành cho hiệu ứng cuộn Marquee trên điện thoại -->
                    <div class="marquee-content marquee-duplicate mobile-only-marquee" aria-hidden="true">
                        <span class="meta-match">${matchScore}% Phù hợp</span>
                        <span class="meta-age">${movie.ageLimit || "T13"}</span>
                        <span>${movie.year || "2026"}</span>
                        <span>${(movie.duration || '90p').replace(/\s*\/\s*tập/gi, '')}</span>
                        ${popupEpisodeText ? `<span>${popupEpisodeText}</span>` : ''}
                        <span class="meta-quality">${movie.quality || "HD"}</span>
                    </div>
                </div>
                <div class="popup-genres-row">
                    <span class="desktop-genres">
                        ${(() => {
                            if (!movie.categories || movie.categories.length === 0) return movie.category || "Phim mới";
                            const names = movie.categories.map(catId => {
                                const found = (typeof allCategories !== 'undefined') ? allCategories.find(c => c.id === catId || c.name === catId) : null;
                                return found ? found.name : catId;
                            });
                            return names.slice(0, 2).join(', ') + (names.length > 2 ? '...' : '');
                        })()}
                    </span>
                    <span class="mobile-genres" style="display: none;">
                        ${(() => {
                            if (!movie.categories || movie.categories.length === 0) return movie.category || "Phim mới";
                            const firstCatId = movie.categories[0];
                            const found = (typeof allCategories !== 'undefined') ? allCategories.find(c => c.id === firstCatId || c.name === firstCatId) : null;
                            const firstName = found ? found.name : firstCatId;
                            return firstName + (movie.categories.length > 1 ? '...' : '');
                        })()}
                    </span>
                    <span class="dot">•</span>
                    <span class="popup-country">
                        ${(() => {
                            const foundCountry = (typeof allCountries !== 'undefined') ? allCountries.find(c => c.id === movie.country_id || c.name === movie.country) : null;
                            return foundCountry ? foundCountry.name : (movie.country || "Quốc tế");
                        })()}
                    </span>
                </div>
            </div>
        </div>
    </div>
  `;
}
/* ============================================================
   2. HÀM XỬ LÝ CLICK THÔNG MINH (Dán vào cuối file home.js)
   ============================================================ */

/* --- HÀM ĐÃ SỬA LỖI TRÙNG ID --- */
/* --- DÁN ĐÈ VÀO js/home.js --- */

function handleMovieClick(event, movieId) {
  // 1. PC: Chuyển trang luôn
  if (window.innerWidth > 1366) {
    viewMovieIntro(movieId);
    return;
  }

  // 2. MOBILE:
  // Nếu bấm vào nút bên trong popup (Play, Like) thì giữ nguyên
  if (event.target.closest(".movie-popup-nfx")) {
    return;
  }

  // 👇 FIX: Sử dụng event.currentTarget để lấy chính xác thẻ đang được click
  // (Thay vì getElementById vì 1 phim có thể xuất hiện ở nhiều danh sách -> Trùng ID)
  const currentWrapper = event.currentTarget.closest(".movie-card-wrapper") || event.currentTarget;
  if (!currentWrapper) return;

  // Kiểm tra xem nó đang mở hay đóng
  const isAlreadyOpen = currentWrapper.classList.contains("active-mobile");

  // Đóng tất cả popup khác
  closeAllPopups();

  // Nếu chưa mở thì mở ra (Nếu đang mở rồi thì ở trên đã đóng lại -> Tắt)
  if (!isAlreadyOpen) {
    // --- LOGIC TÍNH TOÁN VỊ TRÍ THÔNG MINH ---
    const rect = currentWrapper.getBoundingClientRect();
    const screenWidth = window.innerWidth;
    const isPortrait = window.innerHeight > window.innerWidth;
    
    // Reset các class định vị cũ
    currentWrapper.classList.remove("popup-align-left", "popup-align-right");

    // Phân biệt tablet để tính popup width
    const isTabletCheck = screenWidth > 768 && screenWidth <= 1366;
    const isLandscapeCard = currentWrapper.classList.contains('movie-card-landscape');
    
    // Ước tính popup width theo thiết bị
    const estPopupW = isTabletCheck
        ? (isLandscapeCard ? 340 : 330)
        : (isLandscapeCard ? 250 : 220);

    // Tính tâm thẻ phim
    const cardCenterX = rect.left + rect.width / 2;
    const safeMargin = 10; // Margin an toàn cách lề viewport

    // Smart Positioning: kiểm tra popup có bị tràn viewport không
    // Áp dụng cho: tablet (tất cả), mobile landscape row
    const isHorizontalRow = currentWrapper.closest(".country-movies-row");
    const shouldSmartPosition = isTabletCheck || (isHorizontalRow && !isPortrait);

    if (shouldSmartPosition) {
        // Popup sẽ tràn trái nếu: tâm card - nửa popup < margin
        if (cardCenterX - estPopupW / 2 < safeMargin) {
            currentWrapper.classList.add("popup-align-left"); // Mở sang phải
        } 
        // Popup sẽ tràn phải nếu: tâm card + nửa popup > viewport - margin
        else if (cardCenterX + estPopupW / 2 > screenWidth - safeMargin) {
            currentWrapper.classList.add("popup-align-right"); // Mở sang trái
        }
    }
    // Mặc định: CENTER (Không cần add class gì)

    currentWrapper.classList.add("active-mobile");

    // Phân biệt tablet vs mobile
    const isTabletDevice = window.matchMedia('(min-width: 769px) and (max-width: 1366px)').matches
                        || (window.innerWidth > 768 && window.innerWidth <= 1366);

    // TABLET: Popup giữ trong wrapper gốc, CSS tablet (position: absolute) xử lý — giống PC
    // MOBILE: Di chuyển popup ra <body> với position: fixed để thoát overflow container
    if (!isTabletDevice) {
        // === MOBILE ONLY ===
        const popup = currentWrapper.querySelector('.movie-popup-nfx');
        if (popup) {
            const cardRect = currentWrapper.getBoundingClientRect();
            const isLandscapeCard = currentWrapper.classList.contains('movie-card-landscape');
            const popupW = isLandscapeCard ? 250 : 220;
            const margin = 8;
            const navbarH = 70;
            const viewW = window.innerWidth;
            const viewH = window.innerHeight;
            const maxH = Math.floor(viewH * 0.65);
            const estHalfH = 140;

            let centerX = cardRect.left + cardRect.width / 2;
            let centerY = cardRect.top + cardRect.height / 2;

            // CLAMP NGANG
            centerX = Math.max(margin + popupW / 2, Math.min(viewW - margin - popupW / 2, centerX));

            // CLAMP DỌC
            if (centerY - estHalfH < navbarH + margin) {
                centerY = navbarH + margin + estHalfH;
            }
            if (centerY + estHalfH > viewH - margin) {
                centerY = viewH - margin - estHalfH;
            }

            popup._originalParent = currentWrapper;
            popup._originalNextSibling = popup.nextSibling;
            document.body.appendChild(popup);

            popup.classList.add('popup-body-level');
            if (isLandscapeCard) popup.classList.add('popup-body-landscape');

            popup.style.cssText = `
              position: fixed !important;
              top: ${centerY}px !important;
              left: ${centerX}px !important;
              transform: translate(-50%, -50%) !important;
              z-index: 2500 !important;
              width: ${popupW}px !important;
              height: auto !important;
              min-height: unset !important;
              max-height: ${maxH}px !important;
              overflow-y: auto !important;
              overflow-x: hidden !important;
              display: flex !important;
              flex-direction: column !important;
              visibility: visible !important;
              opacity: 1 !important;
              pointer-events: auto !important;
              border-radius: 12px !important;
              background: #1f1f2e !important;
              color: #fff !important;
              box-shadow: 0 10px 50px rgba(0, 0, 0, 0.95) !important;
              border: 1px solid var(--accent-primary) !important;
            `;
        }
    }
    // TABLET: CSS responsive.css tablet rules xử lý (popup giữ trong wrapper, position: absolute)

    // Thêm section-active-popup cho trường hợp không phải scroll container
    if (!currentWrapper.closest('.featured-scroll-wrapper') && !currentWrapper.closest('#newMovies') && !currentWrapper.closest('.country-movies-row')) {
        const parentSection = currentWrapper.closest(".country-section") || currentWrapper.closest(".section");
        if (parentSection) {
            parentSection.classList.add("section-active-popup");
        }
    }
  }

  // Ngăn click lan ra ngoài
  event.stopPropagation();
}

function closeAllPopups() {
  // Trả popup đã di chuyển ra body về vị trí gốc trong wrapper
  document.querySelectorAll('.popup-body-level').forEach(p => {
    p.classList.remove('popup-body-level', 'popup-body-landscape');
    p.style.cssText = ''; // Xóa inline styles
    // Trả popup về wrapper gốc
    if (p._originalParent) {
      if (p._originalNextSibling) {
        p._originalParent.insertBefore(p, p._originalNextSibling);
      } else {
        p._originalParent.appendChild(p);
      }
      delete p._originalParent;
      delete p._originalNextSibling;
    }
  });

  // Dọn dẹp popup fixed position (fallback cũ)
  document.querySelectorAll('.popup-fixed-position').forEach(p => {
    p.classList.remove('popup-fixed-position');
    p.style.removeProperty('--popup-fixed-top');
    p.style.removeProperty('--popup-fixed-left');
  });

  document.querySelectorAll(".movie-card-wrapper").forEach((el) => {
    el.classList.remove("active-mobile", "popup-align-left", "popup-align-right");
  });
  
  // Xóa class z-index khỏi các section
  document.querySelectorAll(".country-section, .section").forEach((sec) => {
    sec.classList.remove("section-active-popup");
  });
}

// Bấm ra ngoài khoảng trống thì đóng hết
document.addEventListener("click", function (event) {
    // Nếu không bấm vào bất kỳ card nào chứa popup
    if (!event.target.closest(".movie-card-wrapper")) {
        closeAllPopups();
    }
});

// Đóng mọi popup khi cuộn trang dọc
window.addEventListener("scroll", function () {
    if (document.querySelector('.movie-card-wrapper.active-mobile')) {
        closeAllPopups();
    }
}, { passive: true });

// Đóng mọi popup khi cuộn ngang scroll containers
document.addEventListener("scroll", function () {
    if (document.querySelector('.movie-card-wrapper.active-mobile')) {
        closeAllPopups();
    }
}, { capture: true, passive: true });

// Đóng mọi popup khi swipe (touchmove)
document.addEventListener("touchmove", function () {
    if (document.querySelector('.movie-card-wrapper.active-mobile')) {
        closeAllPopups();
    }
}, { passive: true });

/**
 * Search movies
 */
/**
 * Search movies (Đã tối ưu hóa với Debounce)
 */
const searchMovies = debounce(function () {
  const query = removeDiacritics(document.getElementById("searchMovies").value);
  filterMovies(query);
}, 300);
/**
 * Filter movies
 */
function filterMovies(searchQuery = null) {
  const query =
    searchQuery !== null
      ? searchQuery
      : removeDiacritics(document.getElementById("searchMovies")?.value || "");
      
  const categoryStr = document.getElementById("inputFilterCategory")?.value.trim() || "";
  const countryStr = document.getElementById("inputFilterCountry")?.value.trim() || "";
  const yearStr = document.getElementById("inputFilterYear")?.value.trim() || "";

  // Chuẩn hóa bộ lọc: Loại bỏ "Tất cả..."
  const categories = categoryStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));
  const countries = countryStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));
  const years = yearStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));

  console.log("🔍 [Tất cả Phim] Đang lọc với:", { categories, countries, years, query });

  let filteredData = allMovies.map((movie) => {
    // 1. Ô tìm kiếm (Luôn là AND) - hỗ trợ không dấu
    const matchQuery = !query || removeDiacritics(movie.title).includes(query) || (movie.originTitle && removeDiacritics(movie.originTitle).includes(query));
    if (!matchQuery) return null;

    let matchedTags = [];
    
    // 2. Kiểm tra Thể loại (AND với các nhóm khác)
    if (categories.length > 0) {
      const movieCatNames = (movie.categories || []).map(catId => {
        const searchId = String(catId).trim().toLowerCase();
        const found = (typeof allCategories !== 'undefined' && allCategories) 
          ? allCategories.find(c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId) 
          : null;
        return found ? found.name.toLowerCase() : catId.toLowerCase();
      });
      if (movie.category) {
        const searchId = String(movie.category).trim().toLowerCase();
        const found = (typeof allCategories !== 'undefined' && allCategories) 
          ? allCategories.find(c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId) 
          : null;
        movieCatNames.push(found ? found.name.toLowerCase() : movie.category.toLowerCase());
      }

      const matchedCats = categories.filter(c => movieCatNames.includes(c.toLowerCase()));
      if (matchedCats.length === 0) return null; // Không khớp thể loại
      matchedCats.forEach(cat => matchedTags.push({ type: 'category', icon: 'tag', label: cat }));
    }
    
    // 3. Kiểm tra Quốc gia (AND)
    if (countries.length > 0) {
      let movieCountryName = movie.country || "";
      const foundCountry = (typeof allCountries !== 'undefined') ? allCountries.find(c => c.id === movie.country_id || c.name === movie.country) : null;
      if (foundCountry) movieCountryName = foundCountry.name;

      const matchedCts = countries.filter(c => movieCountryName && c.toLowerCase() === movieCountryName.toLowerCase());
      if (matchedCts.length === 0) return null; // Không khớp quốc gia
      matchedCts.forEach(cty => matchedTags.push({ type: 'country', icon: 'globe', label: cty }));
    }
    
    // 4. Kiểm tra Năm (AND)
    if (years.length > 0) {
      const matchedYrs = years.filter(y => movie.year && y.toString() === movie.year.toString());
      if (matchedYrs.length === 0) return null; // Không khớp năm
      matchedYrs.forEach(y => matchedTags.push({ type: 'year', icon: 'calendar-alt', label: y }));
    }

    return { movie, matchedTags };
  }).filter(Boolean);

  console.log(`✅ [Tất cả Phim] Tìm thấy ${filteredData.length} phim thỏa mãn.`);

  // Lưu vào biến global để dùng khi chuyển trang (không filter lại)
  allMoviesFilteredData = filteredData;

  // Reset về trang 1 khi filter mới
  allMoviesCurrentPage = 1;

  // Render trang đầu tiên
  _renderAllMoviesPage();
  
  // Hiển thị tóm tắt kết quả (Categories, Countries, Years)
  if (typeof updateFilterSummary === 'function') {
    updateFilterSummary(categories, countries, years, allMovies, "homeFilterResultSummary");
  }
}

// --- STATE PHÂN TRANG TRANG TẤT CẢ PHIM ---
const ALL_MOVIES_PER_PAGE = 60;
let allMoviesCurrentPage = 1;
let allMoviesFilteredData = [];

/** Render phim theo trang hiện tại và vẽ pagination */
function _renderAllMoviesPage() {
  const container = document.getElementById("allMoviesGrid");
  if (!container) return;

  const total = allMoviesFilteredData.length;
  const totalPages = Math.ceil(total / ALL_MOVIES_PER_PAGE) || 1;

  if (allMoviesCurrentPage < 1) allMoviesCurrentPage = 1;
  if (allMoviesCurrentPage > totalPages) allMoviesCurrentPage = totalPages;

  const start = (allMoviesCurrentPage - 1) * ALL_MOVIES_PER_PAGE;
  const end = start + ALL_MOVIES_PER_PAGE;
  const pageData = allMoviesFilteredData.slice(start, end);

  // Render grid
  if (total === 0) {
    container.innerHTML = '<div class="text-center w-100">Không tìm thấy phim phù hợp.</div>';
  } else {
    container.innerHTML = pageData.map(item => createMovieCard(item.movie, item.matchedTags)).join("");
  }

  // Render UI phân trang
  _renderAllMoviesPagination(total, totalPages);

  // Cuộn lên grid khi chuyển trang (bỏ qua trang 1)
  if (allMoviesCurrentPage > 1) {
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/** Vẽ UI phân trang cho Tất Cả Phim */
function _renderAllMoviesPagination(total, totalPages) {
  const paginationEl = document.getElementById("allMoviesPagination");
  if (!paginationEl) return;

  if (total === 0 || totalPages <= 1) {
    paginationEl.innerHTML = '';
    paginationEl.style.display = 'none';
    return;
  }

  paginationEl.style.display = 'flex';

  const page = allMoviesCurrentPage;
  const start = (page - 1) * ALL_MOVIES_PER_PAGE + 1;
  const end = Math.min(page * ALL_MOVIES_PER_PAGE, total);

  // Số trang hiển thị: tối đa 5 trang xung quanh trang hiện tại
  let pages = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
    pages.push(i);
  }

  paginationEl.innerHTML = `
    <span class="pagination-info">Hiển thị ${start}–${end} / ${total} phim</span>
    <div class="pagination-controls">
      <button class="btn-page" onclick="changeAllMoviesPage(1)" ${page === 1 ? 'disabled' : ''} title="Trang đầu">
        <i class="fas fa-angle-double-left"></i>
      </button>
      <button class="btn-page" onclick="changeAllMoviesPage(${page - 1})" ${page === 1 ? 'disabled' : ''} title="Trang trước">
        <i class="fas fa-angle-left"></i>
      </button>
      ${pages.map(p => `
        <button class="btn-page ${p === page ? 'active' : ''}" onclick="changeAllMoviesPage(${p})">${p}</button>
      `).join('')}
      <button class="btn-page" onclick="changeAllMoviesPage(${page + 1})" ${page === totalPages ? 'disabled' : ''} title="Trang sau">
        <i class="fas fa-angle-right"></i>
      </button>
      <button class="btn-page" onclick="changeAllMoviesPage(${totalPages})" ${page === totalPages ? 'disabled' : ''} title="Trang cuối">
        <i class="fas fa-angle-double-right"></i>
      </button>
    </div>
    <div class="pagination-jump">
      <span>Đến trang</span>
      <input type="number" min="1" max="${totalPages}" value="${page}" id="allMoviesPaginationJump" class="jump-input"
        onkeydown="if(event.key==='Enter') changeAllMoviesPage(parseInt(this.value))">
      <button class="btn-jump" onclick="changeAllMoviesPage(parseInt(document.getElementById('allMoviesPaginationJump').value))">→</button>
    </div>
  `;
}

/** Chuyển trang Tất Cả Phim */
window.changeAllMoviesPage = function(page) {
  const totalPages = Math.ceil(allMoviesFilteredData.length / ALL_MOVIES_PER_PAGE) || 1;
  if (isNaN(page) || page < 1 || page > totalPages) return;
  allMoviesCurrentPage = page;
  _renderAllMoviesPage();
};

/**
 * Lọc phim theo Loại (Lẻ / Bộ)
 */
function filterByMovieType(type) {
  // 1. Chuyển sang trang danh sách phim
  showPage("movies");

  // 2. Cập nhật tiêu đề cho ngầu
  const titleMap = {
    single: "Danh sách Phim Lẻ",
    series: "Danh sách Phim Bộ",
  };
  document.querySelector("#moviesPage .section-title").textContent =
    titleMap[type] || "Tất cả Phim";

  // 3. Lọc danh sách (dùng filterMovies để có pagination)
  filterMovies();
}
// ============================================
// LOGIC YÊU THÍCH & LỊCH SỬ (USER LIBRARY)
// ============================================
/**
 * Hàm xóa phim khỏi danh sách Yêu thích (Dành riêng cho Modal)
 */
async function removeFavoriteFromModal(movieId, btnElement) {
  // 1. Gọi hàm toggle cũ để xử lý logic xóa trong Database
  await toggleFavorite(movieId);

  // 2. Xử lý giao diện: Tìm cái thẻ chứa nút bấm và xóa nó đi
  const card = btnElement.closest(".card");

  if (card) {
    // Tạo hiệu ứng mờ dần và thu nhỏ
    card.style.transition = "all 0.3s ease";
    card.style.opacity = "0";
    card.style.transform = "scale(0.8)";

    // Đợi 0.3s cho hiệu ứng chạy xong rồi mới xóa hẳn khỏi HTML
    setTimeout(() => {
      card.remove();

      // Kiểm tra nếu xóa hết sạch phim thì hiện thông báo trống
      const container = document.getElementById("libraryList");
      if (container && container.children.length === 0) {
        container.innerHTML =
          '<p class="text-center text-muted">Bạn chưa thích phim nào.</p>';
      }
    }, 300);
  }
}
/**
 * Populate filter dropdowns
 */
function populateFilters() {
  // 1. Thể loại
  const catList = document.getElementById("listFilterCategory");
  const catInput = document.getElementById("inputFilterCategory");
  if (catList && catInput) {
    const categories = ['Tất cả thể loại', ...allCategories.map(c => c.name)];
    initFilterBox("boxFilterCategory", catInput, catList, categories);
  }

  // 2. Quốc gia
  const countryList = document.getElementById("listFilterCountry");
  const countryInput = document.getElementById("inputFilterCountry");
  if (countryList && countryInput) {
    const countries = ['Tất cả quốc gia', ...allCountries.map(c => c.name)];
    initFilterBox("boxFilterCountry", countryInput, countryList, countries);
  }

  // 3. Năm
  const yearList = document.getElementById("listFilterYear");
  const yearInput = document.getElementById("inputFilterYear");
  if (yearList && yearInput) {
    const years = ['Tất cả năm', ...[...new Set(allMovies.map((m) => m.year))].sort((a, b) => b - a)];
    initFilterBox("boxFilterYear", yearInput, yearList, years);
  }
}

/**
 * Khởi tạo logic cho Filter Box tùy chỉnh
 */
function initFilterBox(boxId, input, list, data, filterFunctionId = 'filterMovies') {
    const box = document.getElementById(boxId);
    
    const renderList = (inputValue = "") => {
        // Lấy danh sách đã chọn thực tế - xử lý an toàn
        const selectedValues = input.value.split(',').map(v => v.trim()).filter(Boolean);
        
        // Tách từ khóa tìm kiếm (chỉ lấy phần sau dấu phẩy cuối cùng)
        const parts = inputValue.split(',');
        const filterText = removeDiacritics(parts[parts.length - 1].trim());
        
        let filtered = data.filter(item => 
            removeDiacritics(item.toString()).includes(filterText)
        );

        list.innerHTML = filtered.map(item => {
            const isSelected = selectedValues.includes(item.toString());
            const isAllMode = item.toString().includes("Tất cả");
            return `
                <div class="suggestion-item ${isSelected ? 'selected' : ''} ${isAllMode ? 'item-all' : ''}" 
                     onclick="selectFilterItem(event, '${boxId}', '${input.id}', '${item}', '${filterFunctionId}')">
                    <span class="item-label">${item}</span>
                    ${isSelected ? '<i class="fas fa-times btn-remove-item"></i>' : ''}
                </div>
            `;
        }).join("");
    };

    renderList();

    input.oninput = (e) => {
        renderList(e.target.value);
    };

    // Chuyển sang onclick để nhấn là mở, kể cả khi đã focus
    input.onclick = (e) => {
        e.stopPropagation(); // Ngăn sự kiện click global đóng nó ngay lập tức
        const isActive = box.classList.contains('active');
        
        // Nếu click vào cái đang mở thì không đóng (theo yêu cầu user)
        // Nhưng nếu click sang cái khác thì đóng cái cũ mở cái mới
        if (!isActive) {
            document.querySelectorAll('.custom-filter-box').forEach(b => b.classList.remove('active'));
            box.classList.add('active');
            renderList(input.value);
            input.select(); // Tự động bôi đen để gõ tìm kiếm mới nhanh hơn
        }
    };

    box.onclick = (e) => {
        e.stopPropagation();
        if (!box.classList.contains('active')) {
            input.click(); // Giả lập click vào input để mở
        }
    };
}

/**
 * Chọn một món trong danh sách gợi ý
 */
function selectFilterItem(event, boxId, inputId, value, filterFunctionId = 'filterMovies') {
    if (event) {
        event.stopPropagation(); // QUAN TRỌNG: Ngăn bọt khí (bubbles) làm đóng menu
    }
    
    const input = document.getElementById(inputId);
    const box = document.getElementById(boxId);
    
    let currentValues = input.value.split(',').map(v => v.trim()).filter(Boolean);
    
    if (value.includes("Tất cả")) {
        currentValues = []; // Clear all
    } else {
        const index = currentValues.indexOf(value);
        if (index > -1) {
            currentValues.splice(index, 1); // Deselect
        } else {
            currentValues.push(value); // Select
        }
    }
    
    input.value = currentValues.join(', ');
    
    // Tự động thêm dấu phẩy nếu danh sách không trống để báo hiệu chọn tiếp
    if (input.value && !input.value.endsWith(', ')) {
        input.value += ', ';
    }

    // Render lại trạng thái list mà không đóng menu
    const eventInput = new Event('input', { bubbles: true });
    input.dispatchEvent(eventInput);
    
    // Đảm bảo tiêu điểm vẫn ở input để user gõ tiếp
    input.focus();
}

// Đóng mọi dropdown khi bấm ra ngoài
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-filter-box').forEach(box => {
        box.classList.remove('active');
    });
});
// ... (Code cũ giữ nguyên)

/**
 * ==========================================
 * BỔ SUNG: RENDER TRANG THỂ LOẠI
 * ==========================================
 */
/**
 * ==========================================
 * BỔ SUNG: RENDER TRANG THỂ LOẠI (GIAO DIỆN PRO)
 * ==========================================
 */
function renderCategoriesList() {
  const container = document.getElementById("categoriesList");
  if (!container) return;

  if (allCategories.length === 0) {
    container.innerHTML =
      '<p class="text-center text-muted">Đang cập nhật thể loại...</p>';
    return;
  }

  // Danh sách các bộ màu Gradient đẹp (Tím, Xanh, Hồng, Cam...)
  const gradients = [
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", // Tím mộng mơ
    "linear-gradient(135deg, #FF3CAC 0%, #784BA0 50%, #2B86C5 100%)", // Cầu vồng tối
    "linear-gradient(135deg, #FA8BFF 0%, #2BD2FF 52%, #2BFF88 90%)", // Neon sáng
    "linear-gradient(135deg, #F5576C 0%, #F093FB 100%)", // Hồng cam
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", // Xanh biển
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", // Xanh lá
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)", // Vàng cam
    "linear-gradient(135deg, #30cfd0 0%, #330867 100%)", // Tím than
  ];

  const defaultIcon = "fa-film";

  // Lọc: chỉ giữ thể loại có ít nhất 1 phim trong allMovies
  const movies = (typeof allMovies !== 'undefined' && allMovies) ? allMovies : [];

  const categoriesWithMovies = allCategories
    .map(cat => {
      // Đếm số phim thuộc thể loại này (so sánh theo id hoặc name)
      const count = movies.filter(m => {
        const ids = m.category_ids || m.categories || [];
        return ids.some(cid => {
          const s = String(cid).trim().toLowerCase();
          return s === cat.id.toLowerCase() || s === cat.name.toLowerCase();
        });
      }).length;
      return { cat, count };
    })
    .filter(item => item.count > 0); // Chỉ lấy thể loại có phim

  if (categoriesWithMovies.length === 0) {
    container.innerHTML =
      '<p class="text-center text-muted">Chưa có thể loại nào có phim.</p>';
    return;
  }

  container.innerHTML = categoriesWithMovies
    .map((item, index) => {
      const { cat, count } = item;
      const bgStyle = gradients[index % gradients.length];

      return `
        <div class="category-card-pro" 
             onclick="filterByCategoryFromList('${cat.name}')" 
             style="background: ${bgStyle};">
            
            <div class="cat-overlay"></div>
            
            <div class="cat-content">
                <div class="cat-icon-box">
                    <i class="fas ${cat.icon || defaultIcon}"></i>
                </div>
                <h3 class="cat-title">${cat.name}</h3>
                <span class="cat-subtitle">${count} phim &nbsp;<i class="fas fa-arrow-right"></i></span>
            </div>
        </div>
    `;
    })
    .join("");
}

// Hàm hỗ trợ: Khi bấm vào thẻ thể loại -> Chuyển sang trang danh sách phim và lọc luôn
function filterByCategoryFromList(categoryName) {
  // 1. Chuyển trang
  showPage("movies");

  // 2. Gán giá trị vào ô lọc mới
  const input = document.getElementById("inputFilterCategory");
  if (input) {
    input.value = categoryName;
    // 3. Gọi hàm lọc
    filterMovies();
  }
}
/**
 * ==========================================
 * BỔ SUNG: RENDER TRANG QUỐC GIA (GIAO DIỆN PRO)
 * ==========================================
 */
function renderCountriesList() {
  const container = document.getElementById("countriesList");
  if (!container) return; // Nếu chưa tạo trang HTML thì bỏ qua

  if (allCountries.length === 0) {
    container.innerHTML =
      '<p class="text-center text-muted">Đang cập nhật quốc gia...</p>';
    return;
  }

  // Bộ màu Gradient riêng cho Quốc gia (Tông Xanh - Tím - Đỏ)
  const countryGradients = [
    "linear-gradient(135deg, #0093E9 0%, #80D0C7 100%)", // Xanh ngọc
    "linear-gradient(135deg, #85FFBD 0%, #FFFB7D 100%)", // Vàng chanh
    "linear-gradient(135deg, #FF9A8B 0%, #FF6A88 55%, #FF99AC 100%)", // Đỏ hồng
    "linear-gradient(135deg, #21D4FD 0%, #B721FF 100%)", // Xanh tím
    "linear-gradient(135deg, #3EECAC 0%, #EE74E1 100%)", // Xanh hồng
    "linear-gradient(135deg, #D4145A 0%, #FBB03B 100%)", // Cam đỏ
  ];

  container.innerHTML = allCountries
    .map((country, index) => {
      const bgStyle = countryGradients[index % countryGradients.length];
      // Nếu có mã quốc gia (VN, US...) thì hiện, không thì hiện icon Trái đất
      const iconCode = country.code ? country.code.toUpperCase() : null;

      return `
        <div class="category-card-pro" 
             onclick="filterByCountryFromList('${country.name}')" 
             style="background: ${bgStyle};">
            
            <div class="cat-overlay"></div>
            
            <div class="cat-content">
                <div class="cat-icon-box">
                    ${
                      iconCode
                        ? `<span style="font-size: 2rem; font-weight: 900; border: 2px solid #fff; padding: 5px 10px; border-radius: 8px;">${iconCode}</span>`
                        : `<i class="fas fa-globe-asia"></i>`
                    }
                </div>
                <h3 class="cat-title">${country.name}</h3>
                <span class="cat-subtitle">Xem phim <i class="fas fa-arrow-right"></i></span>
            </div>
        </div>
    `;
    })
    .join("");
}

// Hàm chuyển trang và lọc theo quốc gia
function filterByCountryFromList(countryName) {
  showPage("movies");
  const input = document.getElementById("inputFilterCountry");
  if (input) {
    input.value = countryName;
    filterMovies();
  }
}

/**
 * --- PHẦN PHIM THEO QUỐC GIA (LANDSCAPE 16:9) ---
 */

/**
 * Render các phần phim theo quốc gia
 */
function renderCountrySections() {
  const container = document.getElementById("countrySections");
  if (!container || !allMovies || allMovies.length === 0) return;

  // Danh sách các quốc gia cần hiển thị và từ khóa lọc
  const sections = [
    { id: "korea", name: "Hàn Quốc", icon: "🎎", filter: "Hàn Quốc" },
    { id: "china", name: "Trung Quốc", icon: "🐉", filter: "Trung Quốc" },
    { id: "usuk", name: "US-UK", icon: "🗽", filter: "Mỹ" }, // Có thể lọc theo 'Mỹ' hoặc thêm logic linh hoạt
  ];

  container.innerHTML = sections
    .map((section) => {
      // Lọc phim theo quốc gia
      const filteredMovies = allMovies
        .filter((m) => {
          if (!m.country) return false;
          const c = m.country.toLowerCase();
          
          if (section.id === "korea") {
            return c.includes("hàn") || c.includes("korea") || c.includes("kr");
          }
          if (section.id === "china") {
            return c.includes("trung") || c.includes("china") || c.includes("cn");
          }
          if (section.id === "usuk") {
            return (
              c.includes("mỹ") ||
              c.includes("anh") ||
              c.includes("âu") ||
              c.includes("us") ||
              c.includes("uk")
            );
          }
          return c.includes(section.filter.toLowerCase());
        })
        .slice(0, 10); // Lấy tối đa 10 phim mỗi phần

      if (filteredMovies.length === 0) return "";

      return `
            <section class="country-section" id="section-${section.id}">
                <div class="sidebar-decoration">${section.icon}</div>
                <div class="country-sidebar">
                    <h2>Phim <span>${section.name}</span> mới</h2>
                    <button class="btn-view-all" onclick="filterByCountryFromList('${section.filter}')">
                        Xem toàn bộ <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                <div class="country-movies-wrapper">
                    <div class="country-movies-row">
                        ${filteredMovies
                          .map((movie) => createLandscapeMovieCard(movie))
                          .join("")}
                    </div>
                </div>
            </section>
        `;
    })
    .join("");

  // Bật vuốt kéo thả cho PC sau khi DOM đã được chèn vào
  initDragToScroll();
}

/**
 * Tính năng kéo để cuộn dành cho Máy tính (Desktop Drag to Scroll)
 */
function initDragToScroll() {
  const sliders = document.querySelectorAll(".country-movies-row");
  
  sliders.forEach(slider => {
    let isDown = false;
    let isDragging = false;
    let startX;
    let scrollLeft;

    slider.addEventListener("mousedown", (e) => {
      isDown = true;
      isDragging = false; // Reset trạng thái kéo
      
      // Lấy vị trí click ban đầu (bỏ qua offset ngoài lề)
      startX = e.pageX - slider.offsetLeft;
      // Lưu lại vị trí cuộn hiện hành
      scrollLeft = slider.scrollLeft;
    });

    slider.addEventListener("mouseleave", () => {
      isDown = false;
      slider.classList.remove("active-drag");
    });

    slider.addEventListener("mouseup", () => {
      isDown = false;
      slider.classList.remove("active-drag");
    });

    slider.addEventListener("mousemove", (e) => {
      if (!isDown) return; // Chỉ chạy khi đang nhấn giữ chuột
      e.preventDefault(); // Ngăn chọn văn bản hoặc hình ảnh mặc định của trình duyệt
      
      const x = e.pageX - slider.offsetLeft;
      // Tính quãng đường kéo
      const walk = (x - startX) * 2; 

      // 🔥 THRESHOLD: Tăng lên 20px để tránh "nhận nhầm" tap thành drag trên Tablet/Mobile
      if (Math.abs(walk) > 20) {
          isDragging = true;
          slider.classList.add("active-drag"); // Khóa pointer-events của thẻ phim
      }

      // Cuộn thẻ div tương ứng với quãng đường kéo
      if (isDragging) {
          slider.scrollLeft = scrollLeft - walk;
      }
    });

    // Bắt sự kiện click để chặn nếu vừa thực hiện kéo chuột
    slider.addEventListener("click", (e) => {
      if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true); // Use capture phase
  });
}

/**
 * Tạo thẻ phim ngang (Landscape 16:9)
 */
function createLandscapeMovieCard(movie) {
  const fallbackImage =
    "https://placehold.co/300x169/2a2a3a/FFFFFF?text=NO+IMAGE";
  // Ưu tiên backgroundUrl (ảnh ngang), fallback về posterUrl
  const imageUrl = movie.backgroundUrl || movie.posterUrl || fallbackImage;

  // Logic xử lý hiển thị Phần/Mùa (Tránh lặp chữ "Phần Phần")
  let displayPart = movie.part || "";
  if (displayPart && !displayPart.toString().toLowerCase().includes("phần") && 
      !displayPart.toString().toLowerCase().includes("season") && 
      !displayPart.toString().toLowerCase().includes("chapter")) {
      displayPart = `Phần ${displayPart}`;
  }

  let isLiked = false;
  if (
    typeof currentUser !== "undefined" &&
    currentUser &&
    currentUser.favorites
  ) {
    isLiked = currentUser.favorites.includes(movie.id);
  }
  const likeIcon = isLiked ? "fas fa-heart" : "far fa-heart";
  const likeClass = isLiked ? "liked" : "";
  const matchScore = movie.rating ? Math.round(movie.rating * 20) : 95;

  // Tính badge trạng thái tập (phim bộ: Tập X/Y, phim lẻ: Full)
  let lsEpisodeBadge = "";
  if (movie.type === "series") {
    const currentEps = movie._episodeCount || (movie.episodes || []).length;
    const totalEps = movie.totalEpisodes || 0;
    if (totalEps > 0 && currentEps >= totalEps) {
      lsEpisodeBadge = `<div class="landscape-badge landscape-badge-completed" style="left: 10px; right: auto; top: 10px; bottom: auto;">Hoàn Tất (${currentEps}/${totalEps})</div>`;
    } else if (totalEps > 0) {
      lsEpisodeBadge = `<div class="landscape-badge landscape-badge-ongoing" style="left: 10px; right: auto; top: 10px; bottom: auto;">Tập ${currentEps}/${totalEps}</div>`;
    } else if (currentEps > 0) {
      lsEpisodeBadge = `<div class="landscape-badge landscape-badge-ongoing" style="left: 10px; right: auto; top: 10px; bottom: auto;">Tập ${currentEps}</div>`;
    }
  } else {
    // Phim lẻ (single) → hiện badge "Full"
    lsEpisodeBadge = `<div class="landscape-badge" style="left: 10px; right: auto; top: 10px; bottom: auto; background: rgba(81,207,102,0.9);">Full</div>`;
  }

  return `
        <div class="movie-card-landscape movie-card-wrapper ${window.userWatchHistoryCache?.[movie.id] ? 'has-watched' : ''}" id="movie-wrapper-ls-${movie.id}" onclick="handleMovieClick(event, '${movie.id}')">
            <div class="landscape-img-container" style="background-image: url('${imageUrl}');">
                <div class="landscape-badge">${movie.quality || "HD"}</div>
                ${
                  movie.part
                    ? `<div class="landscape-badge" style="left: auto; right: 10px;">${displayPart}</div>`
                    : ""
                }
                ${lsEpisodeBadge}
                <!-- Watch Progress Bar -->
                <div class="watch-progress-container" id="progress-ls-${movie.id}" style="${window.userWatchHistoryCache?.[movie.id] ? 'display: block;' : ''}">
                    <div class="watch-progress-bar" style="width: ${window.userWatchHistoryCache?.[movie.id] || 0}%"></div>
                </div>
            </div>
            <div class="landscape-info">
                <div class="landscape-title">${movie.title}</div>
                <div class="landscape-subtitle">
                    ${movie.originTitle || (() => {
                        const found = (typeof allCategories !== 'undefined') ? allCategories.find(c => c.id === movie.category || c.name === movie.category) : null;
                        return found ? found.name : (movie.category || "");
                    })()}
                </div>
            </div>

            <!-- Popup khi rê chuột (Giao diện nâng cấp theo mẫu) -->
            <div class="movie-popup-nfx" onclick="event.stopPropagation()">
                <div class="popup-header-img">
                    <img src="${imageUrl}" onerror="this.src='${fallbackImage}';">
                </div>
                <div class="popup-body">
                    <h3 class="popup-title-main">${movie.title}</h3>
                    <div class="popup-subtitle-orig">${movie.originTitle || ""}</div>
                    
                    <div class="popup-actions" style="margin-top: 10px;">
                        <button class="btn-play-pink" onclick="event.stopPropagation(); viewMovieIntro('${movie.id}')">
                            <i class="fas fa-play"></i> Xem ngay
                        </button>
                        <button class="btn-action-glass ${likeClass} btn-like-${movie.id}" onclick="event.stopPropagation(); toggleFavorite('${movie.id}')">
                            <i class="${likeIcon}"></i> Thích
                        </button>
                        <button class="btn-action-glass" onclick="event.stopPropagation(); viewMovieIntro('${movie.id}')">
                             <i class="fas fa-info-circle"></i> Chi tiết
                        </button>
                    </div>

                    <div class="meta-badges-row">
                        ${movie.imdbRating ? `<span class="badge-item imdb">IMDb ${movie.imdbRating}</span>` : ''}
                        <span class="badge-item year">${movie.year || "2026"}</span>
                        ${movie.part ? `<span class="badge-item">${displayPart}</span>` : ""}
                        ${(() => {
                          if (movie.type === 'series') {
                            const curEps = movie._episodeCount || (movie.episodes || []).length;
                            return curEps > 0 ? `<span class="badge-item">Tập ${curEps}</span>` : '';
                          }
                          return '<span class="badge-item">Full</span>';
                        })()}
                        <span class="badge-item">${movie.quality || "HD"}</span>
                    </div>

                    <div class="popup-genres-text">
                        ${(() => {
                            if (!movie.categories || movie.categories.length === 0) return movie.category || "Phim mới";
                            return movie.categories.map(catId => {
                                const searchId = String(catId).trim().toLowerCase();
                                const found = (typeof allCategories !== 'undefined' && allCategories) 
                                    ? allCategories.find(c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId) 
                                    : null;
                                return found ? found.name : catId;
                            }).join(' <span class="dot">•</span> ');
                        })()}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// NAV TÌM KIẾM TRỰC TIẾP (HEADER)
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    const navSearchInput = document.getElementById("navSearchInput");
    const clearNavSearch = document.getElementById("clearNavSearch");
    const navSearchDropdown = document.getElementById("navSearchDropdown");
    const navSearchList = document.getElementById("navSearchList");

    if (!navSearchInput) return;

    // Sử dụng hàm debounce có sẵn nếu có, không thì fallback
    const debounceNavSearch = typeof debounce === 'function' ? debounce : (func, wait) => {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    };

    const renderNavSearchDebounced = debounceNavSearch(function(query) {
        renderNavSearchResults(query);
    }, 300);

    navSearchInput.addEventListener("input", function() {
        const query = (typeof removeDiacritics === 'function' ? removeDiacritics(this.value.trim()) : this.value.trim().toLowerCase());
        
        if (query.length > 0) {
            clearNavSearch.classList.remove("hidden");
            navSearchDropdown.classList.remove("hidden");
            renderNavSearchDebounced(query);
        } else {
            clearNavSearch.classList.add("hidden");
            navSearchDropdown.classList.add("hidden");
        }
    });

    // Đóng dropdown khi click ra ngoài
    document.addEventListener("click", function(e) {
        const container = document.getElementById("navSearchContainer");
        if (container && !container.contains(e.target) && navSearchDropdown) {
            navSearchDropdown.classList.add("hidden");
        }
    });
    
    // Mở lại dropdown nếu click vào input mà đã có chữ
    navSearchInput.addEventListener("focus", function() {
        if (this.value.trim().length > 0) {
            navSearchDropdown.classList.remove("hidden");
        }
    });
});

// Xóa nội dung thanh tìm kiếm header
window.clearNavSearchInput = function() {
    const navSearchInput = document.getElementById("navSearchInput");
    if (navSearchInput) {
        navSearchInput.value = "";
        navSearchInput.dispatchEvent(new Event("input"));
        navSearchInput.focus();
    }
};

// Render kết quả dropdown tìm kiếm
function renderNavSearchResults(query) {
    const navSearchList = document.getElementById("navSearchList");
    if (!navSearchList) return;

    if (typeof allMovies === 'undefined' || !allMovies || allMovies.length === 0) {
        navSearchList.innerHTML = "<li class='nav-search-noresult'>Đang tải dữ liệu...</li>";
        return;
    }

    const filtered = allMovies.filter(movie => {
        const q = query.toLowerCase();
        let match = false;
        if (typeof removeDiacritics === 'function') {
            match = removeDiacritics(movie.title).includes(query) || (movie.originTitle && removeDiacritics(movie.originTitle).includes(query));
        } else {
            match = movie.title.toLowerCase().includes(q) || (movie.originTitle && movie.originTitle.toLowerCase().includes(q));
        }
        return match;
    }).slice(0, 5); // Lấy top 5

    if (filtered.length === 0) {
        navSearchList.innerHTML = "<li class='nav-search-noresult'>Không tìm thấy phim phù hợp</li>";
        return;
    }

    const dfImage = "https://placehold.co/300x450/2a2a3a/FFFFFF?text=NO+POSTER";
    
    navSearchList.innerHTML = filtered.map(movie => `
        <li>
            <a href="javascript:void(0)" class="nav-search-item" onclick="document.getElementById('navSearchDropdown').classList.add('hidden'); viewMovieIntro('${movie.id}')">
                <img src="${movie.posterUrl}" onerror="this.onerror=null; this.src='${dfImage}'">
                <div class="nav-search-info">
                    <h4>${movie.title}</h4>
                    <p>${movie.originTitle || movie.year || "Đang cập nhật"}</p>
                </div>
            </a>
        </li>
    `).join("");
}
