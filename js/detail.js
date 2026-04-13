const EPISODES_PER_PAGE = 10;
let currentEpisodePage = 0;
let reportLocks = {}; // Biến khóa toàn cục để chống race condition khi báo lỗi video

// Thêm CSS cho phần trả lời bình luận
const replyStyles = document.createElement("style");
replyStyles.innerHTML = `
    /* --- CẤP 1: Thụt lề bình thường --- */
    .replies-list { margin-top: 10px; border-left: 2px solid rgba(255,255,255,0.1); padding-left: 12px; margin-left: 0; }
    .replies-controls { margin-top: 5px; margin-left: 0; display: flex; align-items: center; gap: 10px; }

    /* --- CẤP 2 TRỞ ĐI: Kéo ngược sang trái để thẳng hàng với Cấp 1 (Flat Thread) --- */
    .replies-list .replies-list { margin-left: -45px !important; border-left: 2px solid rgba(255,255,255,0.15); }
    .replies-list .replies-controls { margin-left: -45px !important; }

    /* --- MOBILE --- */
    @media (max-width: 768px) {
        .replies-list .replies-list { margin-left: -38px !important; }
        .replies-list .replies-controls { margin-left: -38px !important; }
    }

    .reply-node.hidden-reply { display: none; }
    .btn-show-replies { background: transparent; border: none; color: #aaa; font-size: 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 5px; padding: 0; }
    .btn-show-replies:hover { color: var(--accent-primary); text-decoration: underline; }
    
    .btn-hide-replies { background: transparent; border: none; color: #aaa; font-size: 12px; font-weight: bold; cursor: pointer; display: none; align-items: center; gap: 5px; padding: 0; }
    .btn-hide-replies:hover { color: #ff4444; text-decoration: underline; }

    .reply-form-container { margin-top: 10px; display: none; }
    .reply-form-container.active { display: block; animation: fadeIn 0.3s ease; }
    .btn-reply { background: transparent; border: none; color: #aaa; font-size: 12px; cursor: pointer; margin-left: 10px; }
    .btn-reply:hover { color: var(--accent-primary); text-decoration: underline; }
    .reply-input-group { display: flex; gap: 10px; margin-top: 5px; }
    .reply-input-group input { flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 5px 10px; border-radius: 4px; font-size: 13px; }
    .reply-input-group button { padding: 5px 15px; font-size: 12px; }
    .comment-content { word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; max-width: 100%; }
    
    /* --- RESUME WATCH MODAL --- */
    .resume-watch-modal {
        max-width: 400px;
        border-radius: 16px;
        background: linear-gradient(145deg, #1a1a2e, #16213e);
        border: 1px solid rgba(229, 9, 20, 0.3);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    .resume-watch-modal .modal-header {
        background: linear-gradient(135deg, #E50914, #b2070f);
        padding: 20px 24px;
        border-radius: 16px 16px 0 0;
        text-align: center;
    }
    .resume-watch-modal .modal-header h3 {
        margin: 0;
        color: #fff;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
    }
    .resume-watch-modal .modal-body {
        padding: 24px;
        text-align: center;
    }
    .resume-watch-modal .modal-body p {
        color: #ccc;
        font-size: 15px;
        margin-bottom: 20px;
        line-height: 1.5;
    }
    .resume-watch-modal .resume-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(255,255,255,0.05);
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 10px;
    }
    .resume-watch-modal .resume-time-label,
    .resume-watch-modal .resume-progress-label {
        color: #888;
        font-size: 13px;
    }
    .resume-watch-modal .resume-time-value {
        color: #E50914;
        font-weight: bold;
        font-size: 16px;
    }
    .resume-watch-modal .resume-progress-value {
        color: #4ade80;
        font-weight: bold;
        font-size: 16px;
    }
    .resume-watch-modal .modal-footer {
        padding: 16px 24px 24px;
        display: flex;
        gap: 12px;
        justify-content: center;
    }
    .resume-watch-modal .btn {
        flex: 1;
        padding: 12px 20px;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        border: none;
        font-size: 14px;
    }
    .resume-watch-modal .btn-secondary {
        background: rgba(255,255,255,0.1);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.2);
    }
    .resume-watch-modal .btn-secondary:hover {
        background: rgba(255,255,255,0.2);
    }
    .resume-watch-modal .btn-primary {
        background: linear-gradient(135deg, #E50914, #ff6b6b);
        color: #fff;
    }
    .resume-watch-modal .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 5px 20px rgba(229, 9, 20, 0.4);
    }
`;
document.head.appendChild(replyStyles);

/**
 * Xem chi tiết phim (Đã nâng cấp: Tự động nhớ tập đang xem dở)
 */
async function viewMovieDetail(movieId, updateHistory = true) {
  if (!movieId || movieId === "undefined" || movieId === "") {
    console.error("❌ viewMovieDetail: movieId is missing!");
    return;
  }
  
  // Reset trạng thái trước khi load phim mới
  currentMovieId = movieId;
  window.hasCheckedResumeHistory = false;
  window.hasResumeHistory = false;
  
  // Đóng modal resume và modal tiếp tục xem nếu đang mở
  closeResumeModal();
  const continueModal = document.getElementById("continueWatchingModal");
  if (continueModal) {
      continueModal.classList.remove("active");
  }
  
  // [MOD] Chỉ reset tập về 0 nếu không phải đang ở Mini Player của chính phim này
  const isSeamless = (typeof isMiniPlayerActive !== 'undefined' && isMiniPlayerActive && currentMovieId === movieId);
  window.isSeamlessTransition = isSeamless;
  
  if (isSeamless) {
      console.log("🎥 [SEAMLESS] Keeping current episode and closing mini player:", currentEpisode + 1);
      // Tắt mini player ngay lập tức để video quay lại khung chính trước khi hiện giao diện
      if (typeof disableMiniPlayer === 'function') {
          // Lưu lại tập mini player trước khi disable để phục vụ check modal
          window.miniPlayerEpisodeIndex = currentEpisode;
          disableMiniPlayer(false); 
      }
  } else {
      currentMovieId = movieId;
      currentEpisode = 0;
  }

  // 1. Tìm thông tin phim
  let movie = allMovies.find((m) => m.id === movieId);

  // Nếu không có trong cache thì tìm trong Supabase (bao gồm cả danh sách tập)
  if (!movie && supabase) {
    try {
      const { data, error } = await supabase
        .from('movies')
        .select('*, episodes(*)')
        .eq('id', movieId)
        .order('episode_number', { foreignTable: 'episodes', ascending: true })
        .limit(5000, { foreignTable: 'episodes' })
        .single();
      
      if (data) {
        movie = typeof normalizeMovieData === 'function' ? normalizeMovieData(data) : data;
        // Map episodes vào mảng episodes để giữ tương thích với code cũ
        if (data.episodes) {
          movie.episodes = data.episodes;
        }
      }
    } catch (error) {
      console.error("Lỗi load movie detail từ Supabase:", error);
    }
  } else if (movie && (!movie.episodes || movie.episodes.length === 0 || (movie.episodes[0] && !movie.episodes[0].sources))) {
    // Nếu phim có trong cache nhưng chưa có tập (do load ở trang chủ chỉ lấy metadata)
    try {
      const data = await window.fetchAllEpisodesFromSupabase(movieId, '*', 'episode_index');
      
      if (data && data.length > 0) {
        movie.episodes = data;
      }
    } catch (error) {
      console.error("Lỗi load episodes từ Supabase:", error);
    }
  }

  // Đảm bảo các tập phim luôn được sắp xếp theo đúng thứ tự số (Fix lỗi "Tập 1, Tập 10...")
  if (movie && movie.episodes && Array.isArray(movie.episodes)) {
      movie.episodes.sort((a, b) => {
          const parseEp = (ep) => {
              let n = ep.episode_number !== undefined ? ep.episode_number : (ep.episodeNumber !== undefined ? ep.episodeNumber : ep.title);
              if (typeof n === 'string') {
                  const match = n.match(/\d+/);
                  return match ? parseInt(match[0], 10) : 99999;
              }
              return typeof n === 'number' ? n : 99999;
          };
          return parseEp(a) - parseEp(b);
      });
  }

  // Gán vào biến toàn cục để các hàm khác (như Skip Intro) có thể truy cập
  currentMovie = movie;

  if (!movie) {
    showNotification("Không tìm thấy phim!", "error");
    return;
  }

  // 👇 2. LOGIC MỚI: KHÔI PHỤC LỊCH SỬ XEM (Supabase) 👇
  if (currentUser && supabase) {
    try {
      const { data, error } = await supabase
        .from('watch_history')
        .select('episode_index, resume_time, duration')
        .eq('user_id', currentUser.id)
        .eq('movie_id', movieId)
        .single();

      if (data) {
        // ✅ SỬA: Nếu có resumeFromTime từ click lịch sử thì ưu tiên dùng
        // Nếu không thì dùng thời gian từ Supabase
        let resumeTime = 0;
        let lastEp = data.episode_index || 0;
        
        if (window.resumeFromTime && window.resumeFromTime > 0) {
          // Người dùng click từ lịch sử - dùng thời gian được truyền vào
          resumeTime = window.resumeFromTime;
          lastEp = window.resumeFromEpisode || lastEp;
          console.log("📍 Resume từ click lịch sử:", resumeTime, "giây, tập:", lastEp + 1);
        } else if (data.resume_time && data.resume_time > 0) {
          // Không có resumeFromTime nhưng có thời gian trong Supabase
          resumeTime = data.resume_time;
          console.log("📍 Resume từ Supabase:", resumeTime, "giây, tập:", lastEp + 1);
        }
        
        // Gán episode (nếu có)
        if (lastEp !== undefined) {
          currentEpisode = lastEp;
          console.log(
            `🔄 Đã khôi phục: Bạn đang xem tập ${currentEpisode + 1}`,
          );
        }
        
        // ✅ Lưu resume time vào biến toàn cục để checkAndShowContinueWatchingModal sử dụng
        if (resumeTime > 0) {
          window.hasResumeHistory = true;
          window.resumeTimeData = {
            timeWatched: resumeTime,
            episodeIndex: currentEpisode,
            minutesWatched: Math.floor(resumeTime / 60)
          };
        }
      }

      // Cập nhật lại thời gian "Vừa mới xem" lên đầu danh sách
      // ✅ Chỉ lưu episode, không lưu time ở đây (time sẽ được lưu khi xem)
      saveWatchHistory(movieId, currentEpisode);
    } catch (error) {
      console.error("Lỗi khôi phục lịch sử từ Supabase:", error);
    }
  }
  // 👆 HẾT PHẦN SỬA 👆

  // 3. Cập nhật lượt xem
  updateMovieViews(movieId);

  // 4. Điền thông tin vào giao diện (Redesign mới)
  const isFreeMovie = !movie.price || movie.price === 0;
  
  // Các phần tử cũ (vẫn giữ để tránh lỗi nếu có code khác dùng)
  if (document.getElementById("detailPoster")) document.getElementById("detailPoster").src = movie.posterUrl;
  if (document.getElementById("detailTitle")) document.getElementById("detailTitle").textContent = movie.title;
  // Cập nhật tên phim lên top bar player
  setTimeout(() => updatePlayerTopBar(), 100);
  // Hiển thị tên tiếng Anh nhỏ bên dưới (nếu có)
  const detailOriginEl = document.getElementById("detailOriginTitle");
  if (detailOriginEl) {
    if (movie.originTitle) {
      detailOriginEl.textContent = movie.originTitle;
      detailOriginEl.style.display = "";
    } else {
      detailOriginEl.style.display = "none";
    }
  }
  if (document.getElementById("detailYear")) document.getElementById("detailYear").textContent = movie.year || "N/A";
  if (document.getElementById("detailCountry")) document.getElementById("detailCountry").textContent = movie.country || "N/A";
  if (document.getElementById("detailCategory")) {
      document.getElementById("detailCategory").textContent = (movie.categories && movie.categories.length > 0) 
          ? movie.categories.map(catId => {
              const searchId = String(catId).trim().toLowerCase();
              const found = (typeof allCategories !== 'undefined' && allCategories) 
                ? allCategories.find(c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId) 
                : null;
              return found ? found.name : catId;
          }).join(', ') : (() => {
              const searchId = String(movie.category).trim().toLowerCase();
              const found = (typeof allCategories !== 'undefined' && allCategories) 
                ? allCategories.find(c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId) 
                : null;
              return found ? found.name : (movie.category || "N/A");
          })();
  }
  if (document.getElementById("detailRating")) document.getElementById("detailRating").textContent = movie.rating || 0;
  if (document.getElementById("detailViews")) document.getElementById("detailViews").textContent = formatNumber(movie.views || 0);
  if (document.getElementById("detailDescription")) document.getElementById("detailDescription").textContent = movie.description || "Chưa có mô tả";

  // Hiển thị giá CRO
  const croPriceValue = document.getElementById("croPriceValue");
  const purchasePriceTag = document.getElementById("purchasePriceTag");
  const paymentActionBox = document.getElementById("paymentActionBox");
  const btnCroPrice = document.getElementById("btnCroPrice");

  if (!isFreeMovie) {
    if (croPriceValue) croPriceValue.textContent = movie.price;
    if (btnCroPrice) btnCroPrice.textContent = movie.price;
    if (purchasePriceTag) purchasePriceTag.classList.remove("hidden");
  } else {
    if (purchasePriceTag) purchasePriceTag.classList.add("hidden");
    if (paymentActionBox) paymentActionBox.classList.add("hidden");
  }

  // Render tags
  const tagsContainer = document.getElementById("detailTags");
  if (tagsContainer) {
    tagsContainer.innerHTML = (movie.tags || [])
        .map((tag) => {
            let tagClass = "";
            if (tag === "hot") tagClass = "hot";
            else if (tag === "mới") tagClass = "new";
            return `<span class="tag ${tagClass}">${tag}</span>`;
        })
        .join("");
  }

  // 5. Render danh sách tập
  if (currentEpisode >= 0) {
      currentEpisodePage = Math.floor(currentEpisode / EPISODES_PER_PAGE);
  } else {
      currentEpisodePage = 0;
  }
  
  renderEpisodes(movie.episodes || []);
  
  // 5.1 Render các tính năng mới
  if (movie.episodes && movie.episodes[currentEpisode]) {
      renderDetailServers(movie.episodes[currentEpisode]);
  }
  renderRecommendedMovies(movie);
  renderMoviePartsSeries(movie);


  // 6. Kiểm tra lịch sử xem
  await checkAndShowContinueWatchingModal();

  // 7. Kiểm tra quyền xem và tải Video (Xử lý ẩn hiện paymentActionBox bên trong)
  await checkAndUpdateVideoAccess();

  // 8. Tải bình luận
  loadComments(movieId);
  // 9. Lắng nghe Reaction
  listenToReactions(movieId);

  // 10. Cập nhật giao diện Redesign mới
  updateDetailRedesignUI(movie);
  updatePlayerTopBar(); // Cập nhật thông tin trên khung video

  // 10.1 Render sidebar diễn viên
  renderDetailActorSidebar(movie);

  // 11. Chuyển trang
  showPage("movieDetail", false); // Không push state ở đây để tránh duplicate ?page=
  
  // 12. Cập nhật URL đẹp (Pretty URL) cho trang Xem phim
  let newUrl = window.location.href; // Mặc định tự động lấy url hiện tại
  if (movie && movie.title && updateHistory) {
      const slug = createSlug(movie.title || "video");
      let basePath = window.APP_BASE_PATH || "";
      const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
      newUrl = `${cleanBase}#/watch/${slug}-${movieId}`;
      console.log("🚀 Pushing Detail URL:", newUrl);
      history.pushState({ movieId: movieId, page: 'watch' }, movie.title, newUrl);
  }
  
  // 13. Cập nhật thẻ chia sẻ (Meta Data)
  if(movie && typeof updatePageMetadata === "function") {
      updatePageMetadata(
          "Xem phim " + movie.title + " - Trạm Phim", 
          movie.description || "Rạp Chiếu Phim Blockchain - Xem phim trực tuyến, thanh toán bằng CRO Token", 
          movie.posterUrl || movie.backgroundUrl || "icons/icon-512x512.png", 
          window.location.origin + window.location.pathname + newUrl.substring(newUrl.indexOf("#"))
      );
  }
}

/**
 * Cập nhật giao diện Redesign mới (Top bar, toolbar)
 */
function updateDetailRedesignUI(movie) {
    const topTitle = document.getElementById("redesignTopTitle");
    if (topTitle) {
        topTitle.textContent = `Xem phim ${movie.title}`;
    }

    // Cập nhật trạng thái nút Yêu thích
    const likeBtn = document.getElementById("btnLikeDetail");
    if (likeBtn && currentUser && currentUser.favorites) {
        const isLiked = currentUser.favorites.includes(movie.id);
        if (isLiked) {
            likeBtn.classList.add("active");
            likeBtn.style.color = "#e50914";
            likeBtn.innerHTML = '<i class="fas fa-heart" style="color: #e50914"></i> Đã thích';
        } else {
            likeBtn.classList.remove("active");
            likeBtn.style.color = "";
            likeBtn.innerHTML = '<i class="far fa-heart"></i> Yêu thích';
        }
    }
}

/**
 * Render sidebar diễn viên cho trang chi tiết phim
 */
function renderDetailActorSidebar(movie) {
    const grid = document.getElementById("detailActorGrid");
    if (!grid) return;

    if (!movie.cast && (!movie.castData || movie.castData.length === 0)) {
        grid.innerHTML = '<p style="color: #888; font-size: 13px; text-align: center;">Chưa có thông tin diễn viên.</p>';
        return;
    }

    // Ưu tiên dùng castData (mảng đối tượng ID & Name) để liên kết ID bền vững
    // Nếu chưa có castData (phim cũ), dùng cast (string) làm dự phòng (fallback)
    let actorsToRender = [];
    if (movie.castData && Array.isArray(movie.castData) && movie.castData.length > 0) {
        actorsToRender = movie.castData.map(a => ({ id: a.id, name: a.name }));
    } else if (movie.cast) {
        actorsToRender = movie.cast.split(",").map(n => ({ id: null, name: n.trim() })).filter(a => a.name);
    }

    grid.innerHTML = actorsToRender.map(actor => {
        const name = actor.name;
        // Tra cứu ảnh thật từ allActors
        let avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=120&bold=true&font-size=0.35`;

        if (typeof allActors !== 'undefined' && allActors) {
            let dbActor = null;
            
            // 1. Ưu tiên tìm theo ID
            if (actor.id) {
                dbActor = allActors.find(a => a.id === actor.id);
            }
            
            // 2. Dự phòng tìm theo tên nếu không tìm thấy ID (Phòng hờ dữ liệu cũ hoặc lỗi ID)
            if (!dbActor) {
                const q = name.toLowerCase();
                dbActor = allActors.find(a => 
                    a.name.toLowerCase() === q || 
                    (a.altNames && a.altNames.some(alt => alt.toLowerCase() === q))
                );
            }
            
            if (dbActor && dbActor.avatar) {
                avatarUrl = dbActor.avatar;
            }
        }

        const safeName = name.replace(/'/g, "\\'");
        return `
            <div class="sidebar-actor-item" onclick="viewActorDetail('${safeName}')" title="${name}">
                <img src="${avatarUrl}" alt="${name}" loading="lazy">
                <span class="sidebar-actor-name">${name}</span>
            </div>
        `;
    }).join("");

    // Xử lý nút Xem thêm diễn viên
    const sidebar = grid.closest('.detail-actor-sidebar');
    if (sidebar) {
        const existingBtn = sidebar.querySelector('.btn-toggle-actors');
        if (existingBtn) existingBtn.remove(); // Xóa nút cũ nếu có thư mục render lại

        // Hiển thị nút nếu số diễn viên nhiều hơn 6 (2 hàng)
        if (actorsToRender.length > 6) {
            const btn = document.createElement("button");
            btn.id = "toggleActorsBtn";
            btn.className = "btn-toggle-actors";
            btn.style.marginTop = "10px";
            btn.textContent = "Xem thêm diễn viên";
            btn.onclick = function() {
                grid.classList.toggle("expanded");
                this.textContent = grid.classList.contains("expanded") ? "Thu gọn" : "Xem thêm diễn viên";
            };
            sidebar.appendChild(btn);
        }
    }
}

// --- LOGIC ẨN HIỆN TOOLBAR TRONG CINEMA MODE ---
let cinemaHideTimeout = null;
let isMouseInToolbar = false;

function showCinemaControls() {
    if (!document.body.classList.contains("cinema-mode")) return;
    
    document.body.classList.add("controls-visible");
    
    // Reset timeout
    clearTimeout(cinemaHideTimeout);
    
    // Thời gian chờ: 5s cho mọi trường hợp đứng im, 2s nếu di chuyển ở vùng video
    const waitTime = isMouseInToolbar ? 5000 : 2000; 
    
    cinemaHideTimeout = setTimeout(() => {
        hideCinemaControls();
    }, waitTime);
}

function hideCinemaControls() {
    if (isMouseInToolbar) return; // Đang rê vào toolbar thì không ẩn
    document.body.classList.remove("controls-visible");
}

// Lắng nghe di chuyển chuột toàn trang
document.addEventListener("mousemove", () => {
    if (document.body.classList.contains("cinema-mode")) {
        showCinemaControls();
    }
});

// Sử dụng Event Delegation để theo dõi chuột vào/ra toolbar (Bền bỉ hơn trong SPA)
document.addEventListener("mouseover", (e) => {
    if (!document.body.classList.contains("cinema-mode")) return;
    
    const target = e.target.closest(".detail-top-bar, .detail-toolbar");
    if (target) {
        isMouseInToolbar = true;
        showCinemaControls(); // Hiện và đặt ngưỡng 5s
    }
});

document.addEventListener("mouseout", (e) => {
    if (!document.body.classList.contains("cinema-mode")) return;
    
    const target = e.target.closest(".detail-top-bar, .detail-toolbar");
    if (target) {
        // Kiểm tra xem chuột có thực sự rời khỏi vùng widget không (vào phần tử con thì không tính)
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || !target.contains(relatedTarget)) {
            isMouseInToolbar = false;
            // Di chuột ra ngoài ẩn siêu nhanh (0.5s)
            clearTimeout(cinemaHideTimeout);
            cinemaHideTimeout = setTimeout(() => {
                hideCinemaControls();
            }, 500);
        }
    }
});

/**
 * Lấy key lưu trạng thái switch theo tài khoản user
 */
function getSwitchStorageKey() {
    const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : 'guest';
    return 'switchStates_' + uid;
}

/**
 * Lưu trạng thái tất cả switch vào localStorage theo user
 */
function saveSwitchStates() {
    const switchIds = ['swNextEpisode', 'swCinemaMode', 'swAntiLe', 'swStrange', 'swReaction', 'swAutoFallback'];
    const states = {};
    switchIds.forEach(id => {
        const sw = document.getElementById(id);
        if (sw) states[id] = sw.classList.contains('on');
    });
    localStorage.setItem(getSwitchStorageKey(), JSON.stringify(states));
}

/**
 * Khôi phục trạng thái switch từ localStorage theo user (gọi khi trang load)
 */
function restoreSwitchStates() {
    const saved = JSON.parse(localStorage.getItem(getSwitchStorageKey()) || '{}');
    
    Object.keys(saved).forEach(id => {
        const sw = document.getElementById(id);
        if (!sw) return;
        
        const shouldBeOn = saved[id];
        const currentlyOn = sw.classList.contains('on');
        
        // Chỉ toggle nếu trạng thái hiện tại khác trạng thái đã lưu
        if (shouldBeOn !== currentlyOn) {
            toggleSwitch(id, true); // silent = true để không lưu lại lần nữa
        }
    });
}

/**
 * Xử lý bật/tắt các switch trên thanh công cụ
 * @param {string} id - ID của switch
 * @param {boolean} silent - Nếu true thì không lưu lại localStorage (dùng khi restore)
 */
function toggleSwitch(id, silent) {
    const sw = document.getElementById(id);
    if (!sw) return;

    const isOn = sw.classList.contains("on");
    if (isOn) {
        sw.classList.remove("on");
        sw.classList.add("off");
        sw.textContent = "OFF";
    } else {
        sw.classList.remove("off");
        sw.classList.add("on");
        sw.textContent = "ON";
    }

    // Xử lý logic riêng cho từng switch
    if (id === "swReaction") {
        const sidebar = document.getElementById("reactionSidebar");
        const playerSection = document.querySelector(".player-section");
        
        if (isOn) {
            if (sidebar) sidebar.classList.add("hidden");
            if (playerSection) playerSection.classList.remove("reaction-active");
        } else {
            if (sidebar) sidebar.classList.remove("hidden");
            if (playerSection) playerSection.classList.add("reaction-active");
        }
    } else if (id === "swCinemaMode") {
        const isActivating = !isOn;
        document.body.classList.toggle("cinema-mode", isActivating);
        
        if (isActivating) {
            // Hiện ngay lập tức khi vừa bật
            if (typeof showCinemaControls === 'function') {
                showCinemaControls();
            }
        } else {
            // Dọn dẹp khi tắt
            document.body.classList.remove("controls-visible");
            clearTimeout(cinemaHideTimeout);
        }
    } else if (id === "swAntiLe") {
        const isNativeOn = !isOn; // Trạng thái MỚI sau khi click (ngược với isOn)
        const html5Video = document.getElementById("html5Player");
        const container = document.getElementById("videoContainer");
        
        if (container) {
            if (isNativeOn) {
                // TRẠNG THÁI MỚI LÀ ON: Dùng native controls
                if (html5Video) {
                    html5Video.controls = true;
                    html5Video.setAttribute("controls", "controls");
                    html5Video.style.display = "block"; // Đảm bảo hiện video
                }
                container.classList.add("native-controls-active");
                // Ẩn custom controls
                if (typeof hideControls === 'function') {
                    hideControls();
                }
            } else {
                // TRẠNG THÁI MỚI LÀ OFF: Dùng custom controls
                if (html5Video) {
                    html5Video.controls = false;
                    html5Video.removeAttribute("controls");
                }
                container.classList.remove("native-controls-active");
                // Hiện custom controls
                if (typeof showControls === 'function') {
                    showControls();
                }
            }
        }
    }
    
    // Lưu trạng thái sau khi toggle (trừ khi đang restore)
    if (!silent) saveSwitchStates();
}

// Khôi phục trạng thái switch khi trang load xong
document.addEventListener('DOMContentLoaded', function() {
    // Delay nhẹ để chắc chắn DOM đã render xong
    setTimeout(restoreSwitchStates, 300);
});

/**
 * Tự động chuyển sang server khác khi video bị lỗi (switch Auto Server = ON)
 * Thử lần lượt tất cả server cho đến khi tìm được server hoạt động hoặc hết server
 */
let _isFallbacking = false; // Cờ chống gọi trùng
function autoFallbackToNextServer() {
    // Kiểm tra switch có bật không
    const sw = document.getElementById('swAutoFallback');
    if (!sw || !sw.classList.contains('on')) return false;
    
    // Chống gọi trùng khi đang fallback
    if (_isFallbacking) return false;

    if (!currentMovieId) return false;
    const movie = allMovies.find(m => m.id === currentMovieId);
    if (!movie || !movie.episodes || !movie.episodes[currentEpisode]) return false;

    const episode = movie.episodes[currentEpisode];
    if (!episode.sources || episode.sources.length === 0) return false;

    // Lấy danh sách server duy nhất, sắp theo thứ tự
    const SERVER_ORDER = { 'KKPhim': 1, 'OPhim': 2, 'NguonC': 3 };
    const allServers = [...new Set(episode.sources.map(s => s.server || 'Unknown'))]
        .sort((a, b) => (SERVER_ORDER[a] || 99) - (SERVER_ORDER[b] || 99));

    if (allServers.length <= 1) return false;

    const currentServer = localStorage.getItem('preferredServer') || allServers[0];
    const currentIdx = allServers.indexOf(currentServer);

    // Lấy danh sách server đã thử lỗi
    const fallbackKey = `fallback_${currentMovieId}_${currentEpisode}`;
    const triedServers = JSON.parse(sessionStorage.getItem(fallbackKey) || '[]');
    
    // Thêm server hiện tại vào danh sách lỗi
    if (!triedServers.includes(currentServer)) {
        triedServers.push(currentServer);
        sessionStorage.setItem(fallbackKey, JSON.stringify(triedServers));
    }

    // Tìm server tiếp theo CHƯA THỬ
    let nextServer = null;
    for (let i = 1; i < allServers.length; i++) {
        const candidate = allServers[(currentIdx + i) % allServers.length];
        if (!triedServers.includes(candidate)) {
            nextServer = candidate;
            break;
        }
    }

    // Đã thử hết tất cả server → dừng
    if (!nextServer) {
        console.log('⚠️ Đã thử hết tất cả server, không còn server nào khả dụng.');
        sessionStorage.removeItem(fallbackKey); // Reset để lần sau thử lại được
        return false;
    }

    // Đánh dấu đang fallback
    _isFallbacking = true;

    // Hiện thông báo với số server thân thiện
    const nextNum = SERVER_ORDER[nextServer] || '?';
    console.log(`🔄 Auto-Fallback: ${currentServer} lỗi → chuyển sang Server ${nextNum} (${nextServer})`);
    if (typeof showNotification === 'function') {
        showNotification(`Server lỗi! Đang chuyển sang Server ${nextNum}...`, 'warning');
    }

    localStorage.setItem('preferredServer', nextServer);
    // Lưu thời gian xem hiện tại để resume trên server mới
    let currentTime = 0;
    const video = document.getElementById("html5Player");
    if (video && !video.classList.contains("hidden") && video.currentTime > 0) {
        currentTime = video.currentTime;
    } else if (window.ytPlayer && typeof window.ytPlayer.getCurrentTime === 'function') {
        try { currentTime = window.ytPlayer.getCurrentTime() || 0; } catch(e) {}
    }
    window.isSwitchingSourceOrServer = true;
    window.switchResumeTime = currentTime;
    setTimeout(() => {
        _isFallbacking = false;
        viewMovieDetail(currentMovieId);
    }, 500);
    return true;
}

/**
 * Gửi Reaction (Emoji floating)
 */
window.sendReaction = async function(emoji) {
    console.log(`🎬 [ACTION] User clicked reaction: ${emoji}`);
    
    // 1. Hiển thị hiệu ứng bay lên NGAY LẬP TỨC (Local UI)
    if (window.showReactionOnScreen) {
        window.showReactionOnScreen(emoji);
    }

    // Guard: Bắt buộc phải có currentMovieId hợp lệ
    if (!currentMovieId || currentMovieId === "undefined" || currentMovieId === "" || currentMovieId === null) {
        console.warn("⚠️ sendReaction: currentMovieId is invalid, skipping sync.");
        return;
    }

    // 2. Gửi lên Supabase để các user khác cùng xem (Realtime)
    if (supabase && currentUser) {
        try {
            await supabase.from('movie_reactions').insert({
                movie_id: currentMovieId,
                user_id: currentUser.id,
                emoji: emoji
            });
            console.log("✅ Reaction synced to Supabase");
        } catch (e) {
            console.error("❌ Lỗi gửi reaction Supabase:", e);
        }
    } else {
        console.log("ℹ️ User not logged in or DB not ready, reaction only showed locally.");
    }
};

/**
 * Lắng nghe Reactions từ Supabase (Realtime)
 */
let reactionChannel = null;
window.listenToReactions = function(movieId) {
    if (!supabase || !movieId || movieId === "" || movieId === "undefined") return;
    
    if (reactionChannel) {
        supabase.removeChannel(reactionChannel);
    }

    console.log(`📡 Listening to reactions for: ${movieId}`);

    reactionChannel = supabase
        .channel('public:movie_reactions')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'movie_reactions',
                filter: `movie_id=eq.${movieId}`
            },
            (payload) => {
                const data = payload.new;
                // Nếu là reaction của chính mình thì bỏ qua (đã hiện local rồi)
                if (currentUser && data.user_id === currentUser.id) return;
                
                if (window.showReactionOnScreen) {
                    window.showReactionOnScreen(data.emoji);
                }
            }
        )
        .subscribe();
};

/**
 * Hàm hiển thị Emoji trôi lên màn hình (Dùng chung cho cả local và realtime)
 */
window.showReactionOnScreen = function(emoji) {
    const container = document.getElementById("videoContainer");
    if (!container) {
        console.error("❌ showReactionOnScreen: videoContainer not found!");
        return;
    }

    const reaction = document.createElement("div");
    reaction.className = "floating-reaction";
    reaction.textContent = emoji;
    reaction.style.position = "absolute";
    reaction.style.zIndex = "9999";
    
    // Vị trí góc dưới bên phải (Cố định vùng này)
    // Random nhẹ để không bị chồng khít lên nhau hoàn toàn
    const rightOffset = 20 + Math.random() * 40; // 20px - 60px từ lề phải
    const bottomOffset = 60 + Math.random() * 20; // 60px - 80px từ dưới (trên thanh controls tí)
    
    reaction.style.right = rightOffset + "px";
    reaction.style.bottom = bottomOffset + "px";
    reaction.style.pointerEvents = "none"; 
    
    container.appendChild(reaction);
    console.log(`✨ [UI] Emoji added to DOM: ${emoji} at bottom-right`);

    // Xóa sau khi animation kết thúc (Animation CSS floatingUp xử lý bay lên)
    setTimeout(() => {
        if (reaction.parentNode) {
            reaction.remove();
        }
    }, 3000);
};

// --- LOGIC ĐIỀU KHIỂN VIDEO TÙY CHỈNH ---

// function togglePlay() { ... } // Gỡ bỏ bản cũ, dùng bản window.togglePlay ở cuối file

/**
 * Tua tới/lui (giây)
 */
function skipTime(seconds) {
    const html5Player = document.getElementById("html5Player");
    if (!html5Player.classList.contains("hidden")) {
        html5Player.currentTime += seconds;
    } else if (window.ytPlayer && typeof window.ytPlayer.getCurrentTime === 'function') {
        const currentTime = window.ytPlayer.getCurrentTime();
        window.ytPlayer.seekTo(currentTime + seconds, true);
    }
}

/**
 * Bật/Tắt âm thanh
 */
function toggleMute() {
    const html5Player = document.getElementById("html5Player");
    const volumeBtn = document.getElementById("volumeBtn");
    const icon = volumeBtn.querySelector("i");

    if (!html5Player.classList.contains("hidden")) {
        html5Player.muted = !html5Player.muted;
        icon.className = html5Player.muted ? "fas fa-volume-mute" : "fas fa-volume-up";
    } else if (window.ytPlayer && typeof window.ytPlayer.isMuted === 'function') {
        if (window.ytPlayer.isMuted()) {
            window.ytPlayer.unMute();
            icon.className = "fas fa-volume-up";
        } else {
            window.ytPlayer.mute();
            icon.className = "fas fa-volume-mute";
        }
    }
}

/**
 * Mở/Đóng menu cài đặt
 */
function toggleSettingsMenu() {
    const menu = document.getElementById("settingsMenu");
    menu.classList.toggle("active");
    hideSubMenu(); // Đóng các submenu nếu đang mở
}

/**
 * Hiện submenu (Tốc độ, Màu, Chất lượng)
 */
function showSubMenu(type) {
    const menu = document.getElementById(type + "Menu");
    if (!menu) return;
    
    // Ẩn menu chính
    document.getElementById("settingsMenu").classList.remove("active");
    // Hiện submenu
    menu.classList.add("active");
}

/**
 * Ẩn tất cả submenu
 */
function hideSubMenu() {
    document.querySelectorAll(".settings-submenu").forEach(m => m.classList.remove("active"));
}

/**
 * Chỉnh tốc độ phát
 */
function setSpeed(rate) {
    const html5Player = document.getElementById("html5Player");
    const speedVal = document.getElementById("currentSpeedVal");
    
    if (!html5Player.classList.contains("hidden")) {
        html5Player.playbackRate = rate;
    } else if (window.ytPlayer && typeof window.ytPlayer.setPlaybackRate === 'function') {
        window.ytPlayer.setPlaybackRate(rate);
    }

    speedVal.textContent = rate === 1 ? "Chuẩn" : rate + "x";
    
    // Active UI
    document.querySelectorAll("#speedMenu .submenu-item").forEach(item => {
        item.classList.toggle("active", item.getAttribute("onclick").includes(rate));
    });
    
    hideSubMenu();
}



/**
 * Chỉnh chất lượng (HLS)
 */
function setQuality(level) {
    if (window.hlsInstance) {
        window.hlsInstance.currentLevel = level;
        const qualityVal = document.getElementById("currentQualityVal");
        qualityVal.textContent = level === -1 ? "Tự động" : window.hlsInstance.levels[level].height + "p";
    }
    hideSubMenu();
}

/**
 * Bật/Tắt Hình trong hình (PiP) — Native OS-level
 * iOS Safari/PWA dùng WebKit API riêng: webkitSetPresentationMode
 * Chrome/Edge/Firefox dùng API chuẩn W3C: requestPictureInPicture
 */
async function togglePiP() {
    const html5Player = document.getElementById("html5Player");
    if (html5Player.classList.contains("hidden")) {
        showNotification("PiP chỉ hỗ trợ trình phát trực tiếp (M3U8/MP4)", "warning");
        return;
    }

    try {
        // === iOS Safari / PWA: Dùng WebKit API riêng ===
        if (typeof html5Player.webkitSupportsPresentationMode === 'function' &&
            typeof html5Player.webkitSetPresentationMode === 'function') {
            const currentMode = html5Player.webkitPresentationMode;
            if (currentMode === 'picture-in-picture') {
                html5Player.webkitSetPresentationMode('inline');
            } else {
                html5Player.webkitSetPresentationMode('picture-in-picture');
            }
            return;
        }

        // === Chrome/Edge/Firefox: API chuẩn W3C ===
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else if (typeof html5Player.requestPictureInPicture === 'function') {
            await html5Player.requestPictureInPicture();
        } else {
            showNotification("Trình duyệt không hỗ trợ PiP!", "warning");
        }
    } catch (e) {
        console.error("Lỗi PiP:", e);
        showNotification("Không thể bật PiP: " + e.message, "error");
    }
}

// toggleFullscreen() - Đã gỡ bản cũ, dùng window.toggleFullscreen ở dòng dưới

// --- QUẢN LÝ ALBUM ---

/**
 * Mở modal Album
 */
async function openAlbumModal() {
    if (!currentUser) {
        showNotification("Vui lòng đăng nhập để sử dụng tính năng này!", "warning");
        openModal("authModal");
        return;
    }

    openModal("albumModal");
    loadUserAlbums();
}

/**
 * Load danh sách album của người dùng từ Supabase
 */
async function loadUserAlbums() {
    const container = document.getElementById("albumListContainer");
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner" style="margin: 20px auto;"></div>';

    try {
        if (!supabase || !currentUser) return;
        
        const { data, error } = await supabase
            .from('user_albums')
            .select('id, name, movies')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #888; padding: 20px;">
                    <i class="fas fa-folder-open" style="font-size: 30px; margin-bottom: 10px; display: block;"></i>
                    Bạn chưa có album nào.<br>Hãy tạo album đầu tiên bên dưới!
                </div>`;
            return;
        }

        let html = "";
        data.forEach(album => {
            const movieCount = album.movies ? album.movies.length : 0;
            const isInAlbum = album.movies && album.movies.some(m => m.id === currentMovieId);

            html += `
                <div class="album-item" onclick="addToAlbum('${album.id}', '${album.name.replace(/'/g, "\\'")}')" 
                     style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; cursor: pointer; transition: 0.2s;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-folder" style="color: var(--accent-primary);"></i>
                        <div>
                            <div style="font-weight: 600;">${album.name}</div>
                            <div style="font-size: 11px; color: #888;">${movieCount} phim</div>
                        </div>
                    </div>
                    ${isInAlbum ? '<i class="fas fa-check-circle" style="color: #4ade80;"></i>' : '<i class="far fa-circle" style="color: #444;"></i>'}
                </div>`;
        });
        container.innerHTML = html;

    } catch (error) {
        console.error("Lỗi load album từ Supabase:", error);
        container.innerHTML = '<div style="color: var(--error); text-align: center;">Lỗi khi tải danh sách album.</div>';
    }
}

/**
 * Tạo Album mới
 */
async function createNewAlbum() {
    const input = document.getElementById("newAlbumName");
    const name = input.value.trim();
    
    if (!name) {
        showNotification("Vui lòng nhập tên album!", "warning");
        return;
    }

    try {
        if (!supabase || !currentUser) return;

        const { error } = await supabase
            .from('user_albums')
            .insert({
                user_id: currentUser.id,
                name: name,
                movies: []
            });

        if (error) throw error;

        input.value = "";
        showNotification(`Đã tạo album "${name}"`, "success");
        loadUserAlbums(); // Refresh list

    } catch (error) {
        console.error("Lỗi tạo album trên Supabase:", error);
        showNotification("Không thể tạo album. Vui lòng thử lại!", "error");
    }
}

/**
 * Thêm phim hiện tại vào album
 */
async function addToAlbum(albumId, albumName) {
    if (!currentMovieId || !supabase || !currentUser) return;

    try {
        const { data: album, error: fetchError } = await supabase
            .from('user_albums')
            .select('id, movies')
            .eq('id', albumId)
            .single();
            
        if (fetchError || !album) return;

        let movies = album.movies || [];

        // Kiểm tra xem đã có trong album chưa
        const index = movies.findIndex(m => String(m.id) === String(currentMovieId));
        
        if (index > -1) {
            // Nếu đã có thì xóa ra (Toggle functionality)
            movies.splice(index, 1);
            const { error } = await supabase
                .from('user_albums')
                .update({ movies: movies })
                .eq('id', albumId);
                
            if (error) throw error;
            showNotification(`Đã xóa khỏi album "${albumName}"`, "info");
        } else {
            // Nếu chưa có thì thêm vào
            const movie = allMovies.find(m => m.id === currentMovieId);
            if (!movie) return;
            
            movies.push({
                id: movie.id,
                title: movie.title,
                posterUrl: movie.posterUrl || movie.backgroundUrl || "",
                addedAt: new Date().toISOString()
            });
            
            const { error } = await supabase
                .from('user_albums')
                .update({ movies: movies })
                .eq('id', albumId);
                
            if (error) throw error;
            showNotification(`Đã thêm vào album "${albumName}"`, "success");
        }

        loadUserAlbums(); // Refresh UI in modal

    } catch (error) {
        console.error("Lỗi cập nhật album trên Supabase:", error);
        showNotification("Có lỗi xảy ra khi cập nhật album!", "error");
    }
}

/**
 * Chia sẻ phim
 */
function shareMovie() {
    const movie = allMovies.find(m => m.id === currentMovieId);
    if (!movie) return;

    const url = window.location.href; // Hoặc logic tạo link share cụ thể
    if (navigator.share) {
        navigator.share({
            title: movie.title,
            text: `Đang xem phim ${movie.title} tại Trạm Phim. Xem ngay!`,
            url: url
        }).catch(console.error);
    } else {
        // Fallback: Copy to clipboard
        navigator.clipboard.writeText(url).then(() => {
            showNotification("Đã copy link phim vào bộ nhớ tạm!", "success");
        });
    }
}

/**
 * Báo lỗi phim
 */
async function reportError() {
    if (!currentUser) {
        if (await customConfirm("Vui lòng đăng nhập để gửi báo cáo lỗi. Bạn có muốn đăng nhập ngay?", { title: "Chưa Đăng Nhập", type: "warning", confirmText: "Đăng nhập" })) {
            openModal("authModal");
        }
        return;
    }

    // -- CHỐNG SPAM (60 giây / 1 lần báo cáo) --
    const lastReportTime = localStorage.getItem("lastErrorReportTime_" + currentUser.id);
    const now = Date.now();
    if (lastReportTime) {
        const diffSeconds = Math.floor((now - parseInt(lastReportTime)) / 1000);
        if (diffSeconds < 60) {
            showNotification(`Vui lòng đợi ${60 - diffSeconds} giây nữa để gửi báo cáo tiếp theo!`, "warning");
            return;
        }
    }

    if (!currentMovieId || !allMovies || !supabase) return;

    const movie = allMovies.find(m => m.id === currentMovieId);
    if (!movie) return;

    // Xác định tập phim đang xem
    let episodeName = "Tập phim/Phim lẻ";
    if (movie.episodes && movie.episodes[currentEpisode]) {
        const ep = movie.episodes[currentEpisode];
        episodeName = String(ep.episodeNumber).toLowerCase().includes('tập') ? ep.episodeNumber : `Tập ${ep.episodeNumber}`;
    }

    const errorResult = await customPrompt(`Hãy mô tả lỗi bạn gặp phải đối với phim "${movie.title}" - ${episodeName}:`, {
        isTextarea: true,
        placeholder: "Nhập chi tiết lỗi tại đây...",
        selectOptions: [
            { value: "load_slow", label: "Video giật lag / Load chậm" },
            { value: "broken_link", label: "Không xem được / Bị lỗi Play" },
            { value: "subtitle_error", label: "Lỗi phụ đề (lệch, sai, không hiện)" },
            { value: "audio_error", label: "Lỗi âm thanh (mất tiếng, rè)" },
            { value: "wrong_movie", label: "Sai phim / Sai tập" },
            { value: "other", label: "Khác" }
        ]
    });
    
    if (errorResult === null) return; 

    const errorType = errorResult.selectValue;
    const errorDesc = errorResult.textValue;

    if (!errorDesc || !errorDesc.trim()) {
        showNotification("Vui lòng nhập mô tả lỗi chi tiết để chúng tôi có thể khắc phục!", "warning");
        return;
    }

    try {
        showLoading(true, "Đang gửi báo cáo lỗi...");

        // 1. Lưu báo cáo lỗi lên Supabase
        await processErrorReport({
            userId: currentUser.id,
            userName: currentUser.display_name || currentUser.email || "Unknown User",
            movieId: currentMovieId,
            movieTitle: movie.title,
            episodeName: episodeName,
            errorType: errorType,
            description: errorDesc.trim()
        });

        // 2. Cập nhật thời gian chống spam vào LocalStorage
        localStorage.setItem("lastErrorReportTime_" + currentUser.id, Date.now());

        // 3. Hiển thị popup cảm ơn
        await customAlert("Cảm ơn bạn đã gửi lỗi, chúng tôi sẽ sớm khắc phục trong thời gian sớm nhất! Xin lỗi vì trải nghiệm không tốt này! 💛", "Gửi Hệ Thống Thành Công", "success");

    } catch (err) {
        console.error("Lỗi gửi báo cáo lên Supabase:", err);
        showNotification("Không thể gửi báo cáo lỗi lúc này!", "error");
    } finally {
        showLoading(false);
    }
}


// --- LOGIC THANH TIẾN TRÌNH (PROGRESS BAR) ---

/**
 * Cập nhật thanh tiến trình theo thời gian thực
 */
// Logic cũ đã được chuyển vào initCustomControls và updateCustomProgress

/**
 * Xử lý khi người dùng kéo hoặc click thanh tua
 */
// Logic cũ đã được chuyển vào initCustomControls

// function saveWatchProgressImmediate ... (Gỡ bỏ trùng lặp, dùng bản đầy đủ ở phía dưới)

/**
 * Đóng Modal Tiếp tục xem
 */
function closeResumeModal() {
    closeModal("resumeWatchModal");
}

/**
 * Khởi tạo các sự kiện cho trình phát tùy chỉnh
 */
// Logic cũ đã được chuyển vào initCustomControls

/**
 * Render danh sách tập phim
 */
function renderEpisodes(episodes) {
  const container = document.getElementById("episodesList");
  const section = document.getElementById("episodesSection");
  const pageSelect = document.getElementById("episodePageSelect");

  if (!episodes || episodes.length === 0) {
    section.classList.add("hidden");
    return;
  }

  if (episodes.length <= 1) {
    if (pageSelect) pageSelect.style.display = "none";
  }

  section.classList.remove("hidden");
  
  // --- LOGIC HIỂN THỊ THÔNG MINH ---
  const totalEpisodes = episodes.length;
  
  // Nếu dưới hoặc bằng 20 tập -> Hiện hết, không cần phân trang
  if (totalEpisodes <= 20) {
      if (pageSelect) pageSelect.style.display = "none";
      currentEpisodePage = 0;
      
      container.innerHTML = episodes
        .map((ep, index) => {
            const isActive = index === currentEpisode;
            const epNum = ep.episode_number !== undefined ? ep.episode_number : (ep.episodeNumber !== undefined ? ep.episodeNumber : index + 1);
            const label = String(epNum).toLowerCase().includes("tập") ? epNum : `Tập ${epNum}`;
            return `
                <div class="episode-item ${isActive ? "active" : ""}" 
                     data-index="${index}"
                     onclick="selectEpisode(${index})">
                    <span class="ep-number">${label}</span>
                </div>
            `;
        }).join("");
      return;
  }

  // Nếu trên 20 tập -> Phân trang thông minh
  // Tính toán số tập mỗi trang linh hoạt (mặc định 20)
  let pageSize = 20; 
  // Nếu tổng số tập gần bằng bội số của 10 (ví dụ 21, 22) thì có thể giãn pageSize để đẹp hơn
  if (totalEpisodes > 20 && totalEpisodes <= 30) {
      pageSize = totalEpisodes; // Hiện hết luôn nếu dưới 30 cho đẹp? 
      // Nhưng yêu cầu user là "nếu trên 20 thì hiển thị thông minh", tôi sẽ giữ mốc 20-25 làm chuẩn.
  }

  const totalPages = Math.ceil(totalEpisodes / pageSize);
  
  if (pageSelect) {
      pageSelect.style.display = "block";
      pageSelect.innerHTML = "";
      
      for(let i = 0; i < totalPages; i++) {
          const start = i * pageSize + 1;
          const end = Math.min((i + 1) * pageSize, totalEpisodes);
          const option = document.createElement("option");
          option.value = i;
          option.textContent = `Tập ${start} - ${end}`;
          if (i === currentEpisodePage) option.selected = true;
          pageSelect.appendChild(option);
      }
  }

  // Slice episodes cho trang hiện tại
  const startIdx = currentEpisodePage * pageSize;
  const endIdx = startIdx + pageSize;
  const currentEpisodes = episodes.slice(startIdx, endIdx);

  container.innerHTML = currentEpisodes
    .map((ep, index) => {
        const realIndex = startIdx + index;
        const isActive = realIndex === currentEpisode;
        const epNum = ep.episode_number !== undefined ? ep.episode_number : (ep.episodeNumber !== undefined ? ep.episodeNumber : index + 1);
        const label = String(epNum).toLowerCase().includes("tập") ? epNum : `Tập ${epNum}`;
        return `
            <div class="episode-item ${isActive ? "active" : ""}" 
                 data-index="${realIndex}"
                 onclick="selectEpisode(${realIndex})">
                <span class="ep-number">${label}</span>
            </div>
        `;
    }).join("");
}

/**
 * Chuyển trang danh sách tập phim
 */
function changeEpisodePage(pageIndex) {
    currentEpisodePage = parseInt(pageIndex);
    const movieId = currentMovieId;
    const movie = allMovies.find(m => m.id === movieId);
    if (movie) {
        renderEpisodes(movie.episodes || []);
    }
}

/**
 * Chọn tập phim
 */
function selectEpisode(index) {
  // ✅ RESET RESUME DATA: Khi chuyển tập mới, không dùng lại thời gian của tập cũ
  window.hasResumeHistory = false;
  window.resumeTimeData = null;
  
  // ✅ XÓA DỮ LIỆU THỜI GIAN CŨ TRONG LOCALSTORAGE: Tránh tập mới nhảy đến phút của tập cũ
  if (currentMovieId) {
    localStorage.removeItem('localResumeTime_' + currentMovieId);
    localStorage.removeItem('localVideoState_' + currentMovieId);
  }
  
  currentEpisode = index;

  // Update active state
  document.querySelectorAll(".episode-item").forEach((el) => {
    el.classList.toggle("active", parseInt(el.dataset.index) === index);
  });
  // 👇 THÊM DÒNG NÀY: Lưu lịch sử xem ngay khi chọn tập 👇
  if (currentMovieId) {
    saveWatchHistory(currentMovieId, index);
  }
  
  // Update versions corresponding to this episode
  const movie = allMovies.find(m => m.id === currentMovieId);
  if (movie && movie.episodes && movie.episodes[index]) {
      renderDetailServers(movie.episodes[index]);
  }

  // Update video if unlocked
  checkAndUpdateVideoAccess();
  
  // Cập nhật top bar player với tập mới
  updatePlayerTopBar();

  // Reset cờ thông báo đếm ngược cho tập mới
  isCountdownNotified = false;
}

/**
 * Kiểm tra và cập nhật quyền xem video
 */
async function checkAndUpdateVideoAccess() {
  const videoLocked = document.getElementById("videoLocked");
  const videoPlayer = document.getElementById("videoPlayer");
  const html5Player = document.getElementById("html5Player");
  const buyTicketBtn = document.getElementById("buyTicketBtn");
  const paymentActionBox = document.getElementById("paymentActionBox");

  let hasAccess = false;

  // Lấy thông tin phim hiện tại để kiểm tra giá
  const currentMovie = allMovies.find(m => m.id === currentMovieId);
  if (!currentMovie) return;
  
  const isFreeMovie = !currentMovie.price || currentMovie.price === 0;
  
  // 1. Admin luôn có quyền xem
  if (isAdmin) {
    hasAccess = true;
  }
  // 2. VIP luôn được xem
  else if (currentUser && currentUser.isVip === true) {
    hasAccess = true;
  }
  // 3. Phim miễn phí
  else if (isFreeMovie) {
    hasAccess = true;
  }
  // 4. Kiểm tra đã mua chưa (Dành cho Member thường xem phim trả phí)
  else if (currentUser && currentMovieId) {
    hasAccess = await checkMoviePurchased(currentMovieId);
  }

  // --- CẬP NHẬT UI THANH TOÁN ---
  if (paymentActionBox) {
      if (hasAccess || isFreeMovie) {
          paymentActionBox.classList.add("hidden");
      } else {
          paymentActionBox.classList.remove("hidden");
      }
  }

  if (buyTicketBtn) {
    if (hasAccess) {
        if (isAdmin) {
             buyTicketBtn.innerHTML = '<i class="fas fa-user-shield"></i> Quyền Admin';
             buyTicketBtn.disabled = true;
        } else if (currentUser && currentUser.isVip === true) {
             buyTicketBtn.innerHTML = '<i class="fas fa-crown"></i> Đặc quyền VIP';
             buyTicketBtn.disabled = true;
        } else if (isFreeMovie) {
             buyTicketBtn.innerHTML = '<i class="fas fa-play"></i> Xem Miễn Phí';
             buyTicketBtn.disabled = false;
        } else {
             buyTicketBtn.innerHTML = '<i class="fas fa-check"></i> Đã mua vé';
             buyTicketBtn.disabled = true;
             buyTicketBtn.classList.remove("btn-primary");
             buyTicketBtn.classList.add("btn-success");
        }
    } else {
        buyTicketBtn.innerHTML = `<i class="fas fa-ticket-alt"></i> Mua Vé Xem Phim (${currentMovie.price} CRO)`;
        buyTicketBtn.disabled = false;
        buyTicketBtn.classList.add("btn-primary");
        buyTicketBtn.classList.remove("btn-success");
    }
  }

  // --- CẬP NHẬT PLAYER UI ---
  if (hasAccess) {
    // Mở khóa giao diện
    if (videoLocked) videoLocked.classList.add("hidden");
    if (videoPlayer) videoPlayer.classList.remove("hidden");
    
    // Lưu trạng thái đang phát trước khi reload (để tự động phát tập mới nếu đang xem)
    const container = document.getElementById("videoContainer");
    const wasPlaying = container && container.classList.contains("playing");

    // Khởi tạo sự kiện cho trình phát tùy chỉnh (Sẽ gọi ở cuối sau khi xác định videoType)

    // 👇 LOGIC LOAD VIDEO 👇
    if (currentMovie.episodes && currentMovie.episodes[currentEpisode]) {
      const episode = currentMovie.episodes[currentEpisode];
      
      let videoType = "youtube";
      let videoSource = "";
      
      // LOGIC ĐA PHIÊN BẢN & ĐA NGUỒN (MULTI-VERSION & MULTI-SERVER)
      if (episode.sources && Array.isArray(episode.sources) && episode.sources.length > 0) {
          const preferredLabel = localStorage.getItem("preferredSourceLabel");
          const preferredServer = localStorage.getItem("preferredServer");
          
          let sourceObj = null;
          
          // Lọc các source đúng version (Label) trước
          let validSources = episode.sources;
          if (preferredLabel) {
              const withLabel = episode.sources.filter(s => {
                  const base = (s.label || '').replace(/\s*dự phòng$/i, '').trim();
                  return base === preferredLabel || s.label === preferredLabel;
              });
              if (withLabel.length > 0) validSources = withLabel;
          }
          
          // Ưu tiên Server đã lưu
          if (preferredServer) {
              sourceObj = validSources.find(s => s.server === preferredServer || (!s.server && preferredServer === 'Unknown'));
          }
          
          // Fallback: Lấy Server đầu tiên
          if (!sourceObj) {
              sourceObj = validSources[0];
          }
          
          // Lưu lại server đang chạy
          if (sourceObj && sourceObj.server) {
              localStorage.setItem("preferredServer", sourceObj.server);
          } else if (sourceObj && !sourceObj.server) {
              localStorage.setItem("preferredServer", "Unknown");
          }
          
          videoType = sourceObj.type || "youtube";
          videoSource = sourceObj.source ? String(sourceObj.source) : "";
      } else {
          videoType = episode.videoType || "youtube";
          videoSource = episode.videoSource || episode.youtubeId;
      }
      
      // --- FIX KKPHIM API FORMAT ---
      // Làm sạch link nếu API trả về dạng có gắn nhãn phía trước (VD: "Full|https://...")
      if (videoSource && typeof videoSource === 'string' && videoSource.includes("http") && !videoSource.startsWith("http")) {
          videoSource = videoSource.substring(videoSource.indexOf("http")).trim();
      }
      
      const iframePlayer = document.getElementById("videoPlayer");
      const html5Player = document.getElementById("html5Player");

      // ✅ Check SEAMLESS TRANSITION (Mini Player -> Watch Page)
      const isMiniActive = (typeof isMiniPlayerActive !== 'undefined' && isMiniPlayerActive);
      const isSameEpisode = (typeof window.miniPlayerEpisodeIndex !== 'undefined' && window.miniPlayerEpisodeIndex === currentEpisode);
      
      if (isMiniActive && movie && movie.id === currentMovieId && isSameEpisode) {
          console.log("🎥 [SEAMLESS] Same movie & episode in Mini Player, skip reset/reload");
          if (videoLocked) videoLocked.classList.add("hidden");
          if (videoPlayer && currentVideoType === "youtube") {
              videoPlayer.classList.remove("hidden");
              if (centerOverlay) centerOverlay.classList.remove("hidden");
              if (customControls) customControls.classList.add("hidden");
          }
          if (html5Player && (currentVideoType === "hls" || currentVideoType === "mp4")) {
              html5Player.classList.remove("hidden");
              if (centerOverlay) centerOverlay.classList.remove("hidden");
              if (customControls) customControls.classList.remove("hidden");
          }
          return; // DỪNG TẠI ĐÂY - Không reset src, không reload
      }

      // Reset players (Chỉ khi thực sự đổi phim/tập)
      iframePlayer.classList.add("hidden");
      iframePlayer.src = "";
      html5Player.classList.add("hidden");
      html5Player.pause();
      html5Player.src = "";
      html5Player.innerHTML = ""; // Clear old tracks
      
      // ✅ BILINGUAL & MULTI-LANGUAGE SUBTITLE INJECTION
      const availableSubs = [];
      const subCols = [
          { code: 'vi', prefix: 'VN', label: 'Tiếng Việt (Vietnamese)', field: 'subtitle_vi_url' },
          { code: 'en', prefix: 'US', label: 'Tiếng Anh (English)', field: 'subtitle_en_url' },
          { code: 'zh', prefix: 'CN', label: 'Tiếng Trung (Chinese)', field: 'subtitle_zh_url' },
          { code: 'ko', prefix: 'KR', label: 'Tiếng Hàn (Korean)', field: 'subtitle_ko_url' },
          { code: 'ja', prefix: 'JP', label: 'Tiếng Nhật (Japanese)', field: 'subtitle_ja_url' }
      ];

      // Đọc các track thực tế có trong Database
      subCols.forEach(col => {
          if (episode && episode[col.field]) {
              availableSubs.push({ ...col, url: episode[col.field] });
          }
      });
      
      window.currentAvailableSubs = availableSubs;

      const ccBtn = document.getElementById("ccBtn");
      const ccLangList = document.getElementById("ccLangList");
      
      // Luôn hiện nút CC nếu có tuỳ chọn
      if (availableSubs.length > 0) {
          if (ccBtn) ccBtn.style.display = "flex";
          
          let prefState = localStorage.getItem('preferredSubtitleState') !== 'off' ? 'on' : 'off';
          let prefLang = localStorage.getItem('preferredSubtitleLang') || 'vi';
          
          if (!availableSubs.find(s => s.code === prefLang)) {
              if (availableSubs.length > 0) prefLang = availableSubs[0].code;
          }

          // RENDER 5 NGÔN NGỮ CHÍNH
          if (ccLangList) {
              ccLangList.innerHTML = subCols.map(s => {
                  const hasTrack = availableSubs.find(a => a.code === s.code);
                  const isPref = (prefState === 'on' && s.code === prefLang);

                  return `
                  <div class="smt-lang-item ${isPref ? 'active' : ''} ${!hasTrack ? 'disabled-track' : ''}" 
                       data-lang="${s.code}" 
                       onclick="changeSubtitleLang('${s.code}')">
                      <span><span class="smt-lang-prefix">${s.prefix}</span> ${s.label}</span>
                  </div>
                  `;
              }).join('');
          }
          
          // Hack CORS Load Tracks
          Promise.all(availableSubs.map(sub => {
              return fetch(sub.url)
                  .then(resp => resp.text())
                  .then(vttText => {
                      const vttBlob = new Blob([vttText], { type: 'text/vtt' });
                      const vttBlobUrl = URL.createObjectURL(vttBlob);
                      
                      const track = document.createElement('track');
                      track.kind = 'subtitles';
                      track.label = sub.label;
                      track.srclang = sub.code;
                      track.src = vttBlobUrl; 
                      
                      if (prefState === 'on' && sub.code === prefLang) {
                          track.default = true;
                      }
                      html5Player.appendChild(track);
                  })
                  .catch(err => console.error("Lỗi tải phụ đề:", sub.label, err));
          })).then(() => {
              // Re-apply state
              if(window.setSubtitleMode) window.setSubtitleMode(prefState, true);
          });
      } else {
          if (ccBtn) {
              ccBtn.style.display = "none";
              ccBtn.classList.remove("cc-btn-active");
          }
      }
      
      // ✅ RESET ERROR OVERLAY
      const errorOverlay = document.getElementById("videoError");
      if (errorOverlay) errorOverlay.classList.add("hidden");
      
      if (window.hlsInstance) {
          window.hlsInstance.destroy();
          window.hlsInstance = null;
      }
      
      videoEl = null;
      currentVideoType = videoType;

      if (videoType === "youtube") {
          iframePlayer.classList.remove("hidden");
          
          const isModalActive = document.getElementById("continueWatchingModal")?.classList.contains("active");
          let autoplayParams = isModalActive ? "0" : "1";
          let params = `rel=0&enablejsapi=1&origin=${window.location.origin}&autoplay=${autoplayParams}`;
          
          // Chỉ thêm start time và autoplay nếu Modal KHÔNG ẩn
          if (!isModalActive && window.hasResumeHistory && window.resumeTimeData && window.resumeTimeData.timeWatched > 0) {
              params += `&start=${Math.floor(window.resumeTimeData.timeWatched)}`;
          }
          
          iframePlayer.src = `https://www.youtube.com/embed/${videoSource}?${params}`;
          
          iframePlayer.addEventListener('load', function() {
              // YouTube tracking đã được tích hợp vào initCustomControls mới
          });
          
      } else if (videoType === "embed") {
          // Xử lý link Embed trực tiếp (iframe URL)
          iframePlayer.classList.remove("hidden");
          
          let embedUrl = videoSource;
          // Nếu source chứa nguyên thẻ <iframe>, trích xuất link từ src="..."
          if (videoSource.includes("<iframe")) {
              const match = videoSource.match(/src="([^"]+)"/);
              if (match && match[1]) {
                  embedUrl = match[1];
              }
          }
          
          iframePlayer.src = embedUrl;
          currentVideoType = "embed";
          
      } else if (videoType === "hls") {
           // --- FIX EMBED IFRAME ---
           // Nhận diện link Iframe: 
           // 1. Chứa thẻ <iframe>, 2. Là một link Player có chứa parameters (vd: /player/?url=), 
           // 3. Hoặc link không đuôi chuẩn m3u8/mp4
           const isEmbedUrl = videoSource.includes("<iframe") || 
                              videoSource.includes("/player/?url=") || 
                              videoSource.includes("player.phimapi.com") || 
                              (videoSource.includes("http") && !videoSource.includes(".m3u8") && !videoSource.includes(".mp4"));
                              
           if (isEmbedUrl) {
               
               let embedUrl = videoSource;
               // Trích Regex lấy link trong src="..." nếu source chứa nguyên thẻ Iframe html
               if (videoSource.includes("<iframe")) {
                   const match = videoSource.match(/src="([^"]+)"/);
                   if (match && match[1]) {
                       embedUrl = match[1];
                   }
               }
               
               // Hiện Iframe và truyền thẻ vào
               iframePlayer.classList.remove("hidden");
               iframePlayer.src = embedUrl;
               // Cập nhật lại video type để custom control biết đường ẩn 
               currentVideoType = "embed"; 

           } else {
               // Chạy HLS M3U8 bình thường
               html5Player.classList.remove("hidden");
               const handleInitialPlayback = (player) => {
                   const isModalActive = document.getElementById("continueWatchingModal")?.classList.contains("active");
                   if (isModalActive) return; // Chờ người dùng click modal
                   
                    let localTimeStr = localStorage.getItem('localResumeTime_' + currentMovieId);
                    let bestTime = (window.hasResumeHistory && window.resumeTimeData) ? window.resumeTimeData.timeWatched : 0;
                    if (localTimeStr && parseFloat(localTimeStr) > bestTime) bestTime = parseFloat(localTimeStr);
                    
                    if (bestTime > 0) {
                        resumeVideoAtTime(bestTime);
                    }
                    
                    const localPauseState = localStorage.getItem('localVideoState_' + currentMovieId) === 'paused';
                    
                    if (window.videoWasPausedBeforeHidden || localPauseState) {
                        console.log("OS resumed player, but user paused before. Keeping it paused.");
                        setTimeout(() => { 
                            player.pause(); 
                            if (typeof updatePlayIcons === 'function') updatePlayIcons(false); 
                        }, 100);
                    } else if (wasPlaying) {
                        // Tự động phát nếu tập trước đó đang phát
                        player.play().catch(e => console.log("Auto-play next ep blocked:", e));
                    } else {
                        player.play().catch(e => console.log("Auto-play blocked:", e));
                    }
               };

               if (Hls.isSupported()) {
                   const hls = new Hls();
                   window.hlsInstance = hls;
                   hls.loadSource(videoSource);
                   hls.attachMedia(html5Player);
                   hls.on(Hls.Events.MANIFEST_PARSED, function() {
                       handleInitialPlayback(html5Player);
                       populateQualityMenu(hls);
                   });
                    // Bắt lỗi HLS (Mạng yếu, 404, CORS, Server sập)
                    hls.on(Hls.Events.ERROR, function (event, data) {
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.error("HLS Network Error: " + data.details);
                                    autoReportVideoError("HLS_NETWORK", data.details);
                                    // Thử auto-fallback trước khi hiện lỗi
                                    if (autoFallbackToNextServer()) break;
                                    if (data.details === 'manifestLoadError') {
                                        showPlayerError("Link phim đã bị hỏng hoặc không tồn tại (404).");
                                    } else {
                                        hls.startLoad();
                                    }
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.error("HLS Media Error: " + data.details);
                                    hls.recoverMediaError();
                                    break;
                                default:
                                    console.error("HLS Fatal Error: " + data.details);
                                    if (!autoFallbackToNextServer()) {
                                        showPlayerError("Lỗi hệ thống trình phát. Vui lòng thử lại.");
                                    }
                                    autoReportVideoError("HLS_FATAL", data.details);
                                    hls.destroy();
                                    break;
                            }
                        }
                    });
               } else if (html5Player.canPlayType('application/vnd.apple.mpegurl')) {
                   html5Player.src = videoSource;
                   html5Player.addEventListener('loadedmetadata', function() {
                       handleInitialPlayback(html5Player);
                   }, { once: true });
                    html5Player.onerror = function() {
                        const err = html5Player.error;
                        autoReportVideoError("NATIVE_HLS", `Error code: ${err ? err.code : 'unknown'}`);
                    };
               }
           }
      } else if (videoType === "mp4") {
          html5Player.classList.remove("hidden");
          html5Player.src = videoSource;
          
          const handleInitialPlayback = (player) => {
              const isModalActive = document.getElementById("continueWatchingModal")?.classList.contains("active");
              if (isModalActive) return; // Chờ người dùng click modal
              
               let localTimeStr = localStorage.getItem('localResumeTime_' + currentMovieId);
               let bestTime = (window.hasResumeHistory && window.resumeTimeData) ? window.resumeTimeData.timeWatched : 0;
               if (localTimeStr && parseFloat(localTimeStr) > bestTime) bestTime = parseFloat(localTimeStr);
               
               if (bestTime > 0) {
                   resumeVideoAtTime(bestTime);
               } 
               
               const localPauseState = localStorage.getItem('localVideoState_' + currentMovieId) === 'paused';
               
               if (window.videoWasPausedBeforeHidden || localPauseState) {
                   console.log("OS resumed player, but user paused before. Keeping it paused.");
                   setTimeout(() => { 
                       player.pause(); 
                       if (typeof updatePlayIcons === 'function') updatePlayIcons(false); 
                   }, 100);
               } else if (wasPlaying) {
                   player.play().catch(e => console.log("Auto-play next ep blocked:", e));
               } else {
                   player.play().catch(e => console.log("Auto-play blocked:", e));
               }
          };
          
          html5Player.addEventListener('loadedmetadata', function() {
              handleInitialPlayback(html5Player);
          }, { once: true });
            html5Player.onerror = async function() {
                const err = html5Player.error;
                if (!autoFallbackToNextServer()) {
                    showPlayerError("Rất tiếc, video (MP4) không thể tải được. Link phim có thể đã bị hỏng.");
                }
                if (!currentMovie || !currentMovie.id) return;
                
                const episode = currentMovie.episodes && currentMovie.episodes[currentEpisode];
                const epName = episode 
                     ? String(episode.name || episode.episodeNumber || `Tập ${currentEpisode + 1}`) 
                     : "Full";
                
                const errorKey = `reported_error_${currentMovie.id}_${currentEpisode}`;
                const lastReported = sessionStorage.getItem(errorKey);
                if (lastReported && (Date.now() - parseInt(lastReported) < 5 * 60 * 1000)) {
                    return;
                }
                
                try {
                    await processErrorReport({
                        movieId: currentMovie.id || currentMovieId || "unknown",
                        movieTitle: currentMovie.title || "Không rõ tên",
                        episodeName: epName || "Full",
                        errorType: "broken_link",
                        description: `[AUTO-DETECT] Lỗi tải Video (MP4): Error code ${err ? err.code : 'unknown'}\nURL: ${videoSource}`,
                        userId: currentUser ? currentUser.uid : "anonymous",
                        userName: currentUser ? (currentUser.displayName || currentUser.email) : "Hệ thống tự động"
                    });
                    sessionStorage.setItem(errorKey, Date.now());
                } catch (error) {
                    console.error("Lỗi auto-report MP4:", error);
                }
            };
      }

      const customControls = document.getElementById("customControls");
      const centerOverlay = document.getElementById("centerOverlay");
      if (customControls) {
        if (currentVideoType === "hls" || currentVideoType === "mp4") {
            customControls.classList.remove("hidden");
            if (centerOverlay) centerOverlay.classList.remove("hidden");
        } else {
            customControls.classList.add("hidden");
            if (centerOverlay) centerOverlay.classList.add("hidden");
        }
      }
      
      // ✅ KHỞI TẠO BỘ ĐIỀU KHIỂN TÙY CHỈNH (Sau khi đã xác định currentVideoType)
      if (typeof initCustomControls === 'function' && html5Player) {
          initCustomControls(html5Player);
      }
    }
  } else {
    // Khóa giao diện
    if (videoLocked) videoLocked.classList.remove("hidden");
    if (videoPlayer) videoPlayer.classList.add("hidden");
    if (html5Player) {
        html5Player.classList.add("hidden");
        html5Player.pause();
        html5Player.src = "";
    }
    
    // Cập nhật giá lên overlay khóa
    const lockedPrice = document.getElementById("lockedPrice");
    if (lockedPrice) {
        lockedPrice.textContent = `${currentMovie.price} CRO`;
    }
    
    const customControls = document.getElementById("customControls");
    if (customControls) customControls.classList.add("hidden");
  }
}

// --- CUSTOM VIDEO CONTROLS LOGIC ---
let videoEl = null;
let currentVideoType = "youtube"; // Track current video type: youtube, hls, mp4
let isDragging = false;
let hideControlsTimeout;
let lastSaveTime = 0; // Debounce save progress
let lastUIUpdateTime = 0; // Debounce UI update for real-time cards

// --- WATCH PROGRESS FUNCTIONS ---
let isAutoNexting = false; // Cờ chặn việc gọi handleAutoNext nhiều lần
let isCountdownNotified = false; // Cờ chặn việc hiện thông báo đếm ngược nhiều lần
let watchProgressInterval = null; // Interval for saving every 10 seconds

/**
 * Lưu thời gian xem phim vào Supabase (Mỗi 10 giây)
 */
async function saveWatchProgress(movieId, episodeIndex, currentTime, duration) {
    if (!currentUser || !supabase || !movieId) return;
    // Bỏ qua thời gian đầu video (0s - 1s) tránh việc load trang reset lịch sử vô ý
    if (currentTime <= 1 || duration <= 0) return;
    
    // 1. Cập nhật UI Progress Bar cục bộ (Real-time cho các thẻ phim khác/tab này)
    // Throttled 2 giây để đảm bảo hiệu năng
    const now = Date.now();
    if (now - lastUIUpdateTime > 2000) {
        lastUIUpdateTime = now;
        const percentage = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
        if (typeof updateMovieProgressUI === 'function') {
            updateMovieProgressUI(movieId, percentage);
        }
    }

    // 2. Lưu vào Database (Debounced 10 giây)
    if (now - lastSaveTime < 10000) return;
    lastSaveTime = now;
    
    // Tính percentage cho DB log
    const percentage = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
    
    try {
        if (!currentUser.id || !movieId || movieId === "undefined") return;

        // Lưu đồng thời vào watch_history (bảng duy nhất quản lý cả lịch sử và tiến trình)
        const { error } = await supabase
            .from('watch_history')
            .upsert({
                user_id: currentUser.id,
                movie_id: movieId,
                episode_index: episodeIndex,
                resume_time: currentTime,
                duration: duration,
                updated_at: new Date().toISOString(),
                last_watched_at: new Date().toISOString()
            }, { onConflict: 'user_id,movie_id' });
        
        if (error) throw error;

        console.log(`✅ Đã lưu progress: ${movieId} - Tập ${episodeIndex + 1} - ${Math.round(currentTime)}s/${Math.round(duration)}s (${percentage}%)`);
    } catch (error) {
        console.error("Lỗi lưu watch progress lên Supabase:", error);
    }
}

/**
 * Lưu thời gian xem NGAY LẬP TỨC (không debounce) - dùng cho pause, beforeunload
 */
async function saveWatchProgressImmediate(movieId, episodeIndex, currentTime, duration) {
    if (!currentUser || !supabase || !movieId || movieId.trim() === "") return;
    // Bỏ qua nếu thời gian bằng 0 để tránh vô tình reset lịch sử xem khi video vừa load
    if (currentTime === undefined || isNaN(currentTime) || currentTime <= 1 || duration === undefined || isNaN(duration) || duration <= 0) {
        return;
    }
    
    const percentage = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
    
    try {
        const { error } = await supabase
            .from('watch_history')
            .upsert({
                user_id: currentUser.id,
                movie_id: movieId,
                episode_index: episodeIndex,
                resume_time: currentTime,
                duration: duration,
                updated_at: new Date().toISOString(),
                last_watched_at: new Date().toISOString()
            }, { onConflict: 'user_id,movie_id' });
        
        if (error) throw error;
        
        console.log(`✅ [IMMEDIATE] Đã lưu progress: ${movieId} - Tập ${episodeIndex + 1} - ${Math.round(currentTime)}s/${Math.round(duration)}s (${percentage}%)`);
        
        // ✅ CẬP NHẬT UI PROGRESS BAR NGAY LẬP TỨC
        if (typeof updateMovieProgressUI === 'function') {
            updateMovieProgressUI(movieId, percentage);
        }
    } catch (error) {
        console.error("Lỗi lưu watch progress immediate lên Supabase:", error);
    }
}

/**
 * Lấy thời gian xem đã lưu từ Supabase
 */
async function getWatchProgress(movieId) {
    if (!currentUser || !supabase || !movieId) return null;
    
    try {
        const { data, error } = await supabase
            .from('watch_history')
            .select('episode_index, resume_time, duration')
            .eq('user_id', currentUser.id)
            .eq('movie_id', movieId)
            .single();
        
        if (data) {
            const percentage = data.duration > 0 ? Math.round((data.resume_time / data.duration) * 100) : 0;
            console.log(`📺 Đã lấy progress: ${movieId} - ${percentage}% - Thời gian: ${data.resume_time}s`);
            return {
                ...data,
                episodeIndex: data.episode_index,
                currentTime: data.resume_time,
                percentage: percentage
            };
        }
        return null;
    } catch (error) {
        console.error("Lỗi lấy watch progress từ Supabase:", error);
        return null;
    }
}

/**
 * Kiểm tra xem người dùng đã mua phim này chưa
 */
async function checkMoviePurchased(movieId) {
    if (!currentUser || !supabase) return false;
    
    try {
        const { data, error } = await supabase
            .from('user_purchases')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('movie_id', movieId)
            .single();
            
        return !!data;
    } catch (error) {
        console.error("Lỗi kiểm tra mua phim từ Supabase:", error);
        return false;
    }
}

/**
 * Xóa thời gian xem (khi phim mới hoặc user xóa lịch sử)
 */
async function clearWatchProgress(movieId) {
    if (!currentUser || !supabase || !movieId) return;
    
    try {
        const { error } = await supabase
            .from('watch_history')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('movie_id', movieId);
            
        if (error) throw error;
        console.log(`🗑️ Đã xóa progress: ${movieId}`);
    } catch (error) {
        console.error("Lỗi xóa watch progress trên Supabase:", error);
    }
}

function initCustomControls(video) {
    videoEl = video;
    const container = document.getElementById("videoContainer");
    let pendingResumeData = null; // Lưu data chờ resume
    
    // Update Duration
    video.addEventListener("loadedmetadata", async () => {
        document.getElementById("duration").textContent = formatTime(video.duration);
        document.getElementById("progressSlider").max = video.duration;
        
        // Đã chuyển sang hệ thống modal mới checkAndShowContinueWatchingModal
        // Không hiển thị modal cũ ở đây nữa
    });

    // ✅ CẬP NHẬT TIẾN TRÌNH (PROGRESS UPDATE)
    const updateCustomProgress = () => {
        if (isDragging) return;

        let current = 0;
        let total = 0;

        if (currentVideoType === 'youtube' && window.ytPlayer && typeof window.ytPlayer.getCurrentTime === 'function') {
            current = window.ytPlayer.getCurrentTime();
            total = window.ytPlayer.getDuration() || 0;
        } else if (video) {
            current = video.currentTime;
            total = video.duration || 0;
        }

        if (total > 0) {
            const progressSlider = document.getElementById("progressSlider");
            const progressBar = document.getElementById("progressBar");
            const currentTimeEl = document.getElementById("currentTime");
            const durationEl = document.getElementById("duration");

            if (progressSlider) {
                progressSlider.max = total;
                progressSlider.value = current;
            }
            if (progressBar) {
                const percent = (current / total) * 100;
                progressBar.style.width = percent + "%";
            }
            if (currentTimeEl) currentTimeEl.textContent = formatTime(current);
            if (durationEl) durationEl.textContent = formatTime(total);

            // Cập nhật Progress Bar và Thời gian cho Mini Player
            const miniProgressBar = document.getElementById("miniPlayerProgressBar");
            const miniCurrentTimeEl = document.getElementById("miniPlayerCurrentTime");
            const miniDurationEl = document.getElementById("miniPlayerDuration");
            
            if (miniProgressBar) {
                const percent = (current / total) * 100;
                miniProgressBar.style.width = percent + "%";
            }
            if (miniCurrentTimeEl) miniCurrentTimeEl.textContent = formatTime(current);
            if (miniDurationEl) miniDurationEl.textContent = formatTime(total);

            // Buffer bar (Chỉ cho HTML5)
            if (currentVideoType !== 'youtube' && video.buffered && video.buffered.length > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                const width = (bufferedEnd / total) * 100;
                const bufferBar = document.getElementById("bufferBar");
                if (bufferBar) bufferBar.style.width = `${width}%`;
            }

            // Save watch progress (debounced)
            if (currentMovieId) {
                // Liên tục backup lên localStorage đề phòng Mobile dập OS tiến trình
                localStorage.setItem('localResumeTime_' + currentMovieId, current);

                saveWatchProgress(currentMovieId, currentEpisode, current, total);
                checkAutoNextCountdown(current, total);
                
                // [NEW] Kiểm tra hiển thị nút Bỏ qua Intro
                checkSkipIntro(current);
            }
        }
    };

    // Khởi tạo Interval cho YouTube hoặc lắng nghe timeupdate cho HTML5
    if (currentVideoType === 'youtube') {
        if (window.customPlayerInterval) clearInterval(window.customPlayerInterval);
        window.customPlayerInterval = setInterval(updateCustomProgress, 1000);
    } else {
        video.addEventListener("timeupdate", updateCustomProgress);
    }

    // ✅ XỬ LÝ TUA PHIM (SEEKING)
    const slider = document.getElementById("progressSlider");
    if (slider) {
        slider.addEventListener("input", (e) => {
            isDragging = true;
            const time = parseFloat(e.target.value);
            const total = (currentVideoType === 'youtube' && window.ytPlayer) ? window.ytPlayer.getDuration() : video.duration;
            
            if (total > 0) {
                const percent = (time / total) * 100;
                document.getElementById("progressBar").style.width = `${percent}%`;
                document.getElementById("currentTime").textContent = formatTime(time);
            }
        });

        slider.addEventListener("change", (e) => {
            isDragging = false;
            const time = parseFloat(e.target.value);
            
            if (currentVideoType === 'youtube' && window.ytPlayer && typeof window.ytPlayer.seekTo === 'function') {
                window.ytPlayer.seekTo(time, true);
            } else if (video) {
                video.currentTime = time;
            }
        });
    }

    // Handle Tooltip (Hover Progress)
    const progressContainer = document.getElementById("progressContainer");
    const tooltip = document.getElementById("progressTooltip");
    progressContainer.addEventListener("mousemove", (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const time = pos * video.duration;
        tooltip.style.left = `${e.clientX - rect.left}px`;
        tooltip.textContent = formatTime(time);
        tooltip.style.display = "block";
    });
    progressContainer.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
    });

    // Play/Pause Icon Update & Container State
    video.addEventListener("play", () => {
        updateDetailPlayButtonState("playing");
        container.classList.add("playing");
        container.classList.remove("paused");
        
        if (typeof currentMovieId !== 'undefined' && !document.hidden && !window.isResumingFromHidden) {
            localStorage.setItem('localVideoState_' + currentMovieId, 'playing');
        }
    });

    video.addEventListener("pause", () => {
        updateDetailPlayButtonState("paused");
        container.classList.remove("playing");
        container.classList.add("paused");
        
        if (typeof currentMovieId !== 'undefined' && !document.hidden && !window.isResumingFromHidden) {
            localStorage.setItem('localVideoState_' + currentMovieId, 'paused');
            if (video.currentTime > 0) localStorage.setItem('localResumeTime_' + currentMovieId, video.currentTime);
        }

        // Lưu progress ngay khi pause (KHÔNG debounce - lưu ngay lập tức)
        if (currentMovieId && video.duration > 0 && video.currentTime > 0) {
            saveWatchProgressImmediate(currentMovieId, currentEpisode, video.currentTime, video.duration);
        }
    });
    
    // Loading State
    video.addEventListener("waiting", () => updateDetailPlayButtonState("loading"));
    video.addEventListener("playing", () => updateDetailPlayButtonState("playing"));
    
    const resolvePlayState = () => {
        if (video.paused) updateDetailPlayButtonState("paused");
        else updateDetailPlayButtonState("playing");
    };
    
    video.addEventListener("canplay", resolvePlayState);
    video.addEventListener("seeked", resolvePlayState);
    video.addEventListener("loadeddata", resolvePlayState);
    video.addEventListener("ended", () => {
        updateDetailPlayButtonState("paused");
        // Tự động chuyển tập nếu đang bật switch
        handleAutoNext();
    });

    // Volume Slider
    const volSlider = document.getElementById("volumeSlider");
    volSlider.addEventListener("input", (e) => {
        video.volume = e.target.value;
        updateVolumeIcon(video.volume);
    });

    // Show/Hide Controls on Hover/Activity
    container.addEventListener("mousemove", () => {
        showControls();
        resetHideTimer();
    });
    
    // Click anywhere on video container to toggle play (except on control buttons)
    container.addEventListener("click", (e) => {
        console.log("Video container clicked", { videoEl, target: e.target, classList: e.target.classList });
        
        // Don't toggle if clicking on control buttons or settings or center buttons
        const isControlBtn = e.target.closest('.control-btn');
        const isSettingsMenu = e.target.closest('.settings-menu');
        const isProgressContainer = e.target.closest('.video-progress-container');
        const isReactionSidebar = e.target.closest('.reaction-sidebar');
        const isEpisodePanel = e.target.closest('.player-episode-panel');
        const isCenterBtn = e.target.closest('.center-btn');
        
        // If clicking center button, reaction sidebar, or episode panel, let their own handlers work
        if (isCenterBtn || isReactionSidebar || isEpisodePanel) {
            console.log("Click on UI element, not toggling from container");
            return;
        }
        
        // Hiện controls và đặt timer ẩn sau 5s (cho cả PC và Mobile)
        showControls();
        resetHideTimer();
        
        if (!isControlBtn && !isSettingsMenu && !isProgressContainer) {
            // THEO YÊU CẦU: Chỉ cho phép chạm vào màn hình để play/pause KHI ĐANG KHÓA.
            // Khi không khóa, chạm vào màn hình chỉ để hiện controls.
            if (container.classList.contains("screen-locked")) {
                console.log("Calling togglePlay from container click (Screen Locked)");
                if (typeof togglePlay === 'function') togglePlay();
                else if (window.togglePlay) window.togglePlay();
            }
        }
    });
    
    // Touch listener cho Mobile - hiện controls khi chạm, ẩn sau 5s
    container.addEventListener("touchstart", (e) => {
        // Không xử lý nếu chạm vào nút điều khiển
        const isControlArea = e.target.closest('.control-btn') || 
                              e.target.closest('.settings-menu') || 
                              e.target.closest('.video-progress-container') ||
                              e.target.closest('.center-btn');
        if (isControlArea) return;
        
        showControls();
        resetHideTimer();
    }, { passive: true });

    // Safety net: Touch trực tiếp trên video element
    // Video luôn có pointer-events:auto nên luôn nhận touch
    // Kể cả khi overlay ở trên bị pointer-events:none → chống mất controls
    video.addEventListener("touchstart", () => {
        showControls();
        resetHideTimer();
    }, { passive: true });
    
    // Save progress when leaving page (IMMEDIATE - không debounce)
    window.addEventListener("beforeunload", () => {
        if (currentMovieId && video.duration > 0 && video.currentTime > 0) {
            saveWatchProgressImmediate(currentMovieId, currentEpisode, video.currentTime, video.duration);
        }
    });
    
    // Khi video bắt đầu play → khởi tạo timer ẩn controls ngay
    video.addEventListener("play", () => {
        resetHideTimer();
    });
    
    // --- NGĂN CHẶN SAFARI URL BAR KHI CHẠM VÀO CONTROLS ---
    // Safari trên iOS tự động hiện thanh URL khi chạm vào mép trên/dưới.
    // Dùng preventDefault() trên các thanh công cụ để ngăn chặn hành vi này, 
    // trong khi vẫn cho phép click vào các nút bên trong hoạt động bình thường.
    function preventSafariUIRedraw(e) {
        // Chỉ áp dụng khi đang ở chế độ pseudo-fullscreen nằm ngang
        if (container.classList.contains("pseudo-fullscreen")) {
            const target = e.target;
            const tagName = target.tagName.toLowerCase();
            
            // Nếu chạm vào thẻ input (ví dụ thanh tiến trình), để mặc định
            if (tagName === 'input') return;
            // BỎ QUA không chặn các phần tử có tương tác (nút bấm, link, thẻ input)
            let curr = target;
            let isInteractive = false;
            while (curr && curr !== e.currentTarget && curr !== document.body) {
                const tag = curr.tagName ? curr.tagName.toLowerCase() : '';
                if (
                    tag === 'button' || 
                    tag === 'a' || 
                    tag === 'input' ||
                    (curr.classList && (
                        curr.classList.contains('control-btn') ||
                        curr.classList.contains('episode-btn') ||
                        curr.classList.contains('settings-item') ||
                        curr.classList.contains('submenu-item') ||
                        curr.classList.contains('submenu-header') ||
                        curr.classList.contains('video-progress-container') ||
                        curr.classList.contains('ep-panel-item') ||
                        curr.classList.contains('episode-panel-close')
                    ))
                ) {
                    isInteractive = true;
                    break;
                }
                curr = curr.parentNode;
            }

            if (isInteractive) {
                return; // Cho phép trình duyệt tạo sự kiện click
            }

            // Chỉ chặn hành vi mặc định khi chạm vào khoảng trống/viền đen của thanh công cụ
            e.preventDefault(); 
        }
    }

    const topBar = document.getElementById("playerTopBar");
    const bottomControls = document.getElementById("customControls");
    const epPanel = document.getElementById("playerEpisodePanel");
    const reactionSidebar = document.getElementById("reactionSidebar");

    if (topBar) topBar.addEventListener("touchstart", preventSafariUIRedraw, { passive: false });
    if (bottomControls) bottomControls.addEventListener("touchstart", preventSafariUIRedraw, { passive: false });
    if (epPanel) epPanel.addEventListener("touchstart", preventSafariUIRedraw, { passive: false });
    if (reactionSidebar) reactionSidebar.addEventListener("touchstart", preventSafariUIRedraw, { passive: false });
    
    // Set initial state
    container.classList.add("paused");
    console.log("Custom controls initialized for video:", video);
}

function showControls() {
    const container = document.getElementById("videoContainer");
    if (container) {
        container.classList.remove("user-inactive");
        container.classList.remove("hide-cursor");
    }

    const controls = document.getElementById("customControls");
    const centerOverlay = document.getElementById("centerOverlay");
    const topBar = document.getElementById("playerTopBar");
    
    if(controls) controls.classList.add("show");
    if(centerOverlay) centerOverlay.style.opacity = "1";
    if(topBar) topBar.classList.add("show");

    // Nút khóa màn hình cũng hiện/ẩn cùng controls
    const lockBtn = document.getElementById("screenLockBtn");
    if (lockBtn) lockBtn.classList.add("show");
}

function hideControls() {
    const container = document.getElementById("videoContainer");
    
    // Không ẩn nếu settings menu đang mở hoặc episode panel đang mở
    const settingsMenu = document.getElementById("settingsMenu");
    const episodePanel = document.getElementById("playerEpisodePanel");
    
    // Kiểm tra menu cài đặt bằng class 'active' (đúng với logic toggle)
    const isSettingsActive = settingsMenu && settingsMenu.classList.contains('active');
    
    if (episodePanel && episodePanel.classList.contains('open')) return;
    if (isSettingsActive) return;

    if (container) {
        container.classList.add("user-inactive");
        container.classList.add("hide-cursor");
    }

    const controls = document.getElementById("customControls");
    const centerOverlay = document.getElementById("centerOverlay");
    const topBar = document.getElementById("playerTopBar");
    
    if (controls) controls.classList.remove("show");
    if (centerOverlay) centerOverlay.style.opacity = "0";
    if (topBar) topBar.classList.remove("show");

    // Nút khóa màn hình cũng ẩn cùng controls
    const lockBtn = document.getElementById("screenLockBtn");
    if (lockBtn) lockBtn.classList.remove("show");
}

function resetHideTimer() {
    clearTimeout(hideControlsTimeout);
    hideControlsTimeout = setTimeout(() => {
        // Kiểm tra xem video có đang phát không (Hỗ trợ cả HTML5 và YouTube)
        let isPaused = true;
        
        if (videoEl && !videoEl.paused) {
            isPaused = false;
        } else if (window.ytPlayer && typeof window.ytPlayer.getPlayerState === 'function') {
            // state 1 là đang phát (playing)
            if (window.ytPlayer.getPlayerState() === 1) isPaused = false;
        }
        
        if (!isPaused) hideControls();
    }, 5000); // Giữ nguyên 5 giây theo yêu cầu
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        // Video dài hơn 1 giờ: hiển thị H:MM:SS
        return `${h}:${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
    }
    // Video dưới 1 giờ: hiển thị MM:SS như cũ
    return `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
}

// Update Play/Pause/Loading Icons
function updateDetailPlayButtonState(state) {
    const bottomIcon = document.querySelector("#playPauseBtn i");
    const centerIcon = document.querySelector("#centerOverlay .play-btn-large i");
    const miniCenterIcon = document.querySelector("#btnMiniPlayCenter i");
    
    if (state === "loading") {
        if(bottomIcon) bottomIcon.className = "fas fa-spinner wp-spinner";
        if(centerIcon) centerIcon.className = "fas fa-spinner wp-spinner";
        if(miniCenterIcon) miniCenterIcon.className = "fas fa-spinner wp-spinner";
    } else if (state === "playing") {
        if(bottomIcon) bottomIcon.className = "fas fa-pause";
        if(centerIcon) centerIcon.className = "fas fa-pause";
        if(miniCenterIcon) miniCenterIcon.className = "fas fa-pause";
    } else {
        // Paused or default
        if(bottomIcon) bottomIcon.className = "fas fa-play";
        if(centerIcon) centerIcon.className = "fas fa-play";
        if(miniCenterIcon) miniCenterIcon.className = "fas fa-play";
    }
}

function updatePlayIcons(isPlaying) {
   updateDetailPlayButtonState(isPlaying ? "playing" : "paused");
}
// Remove old updatePlayIcon function if exists custom logic


// --- EXPORTED FUNCTIONS (Attached to HTML) ---
window.togglePlay = function() {
    let video = videoEl;
    
    // Hỗ trợ trình phát YouTube
    if (currentVideoType === "youtube") {
        if (window.ytPlayer && typeof window.ytPlayer.getPlayerState === 'function') {
            const state = window.ytPlayer.getPlayerState();
            if (state === 1) { // 1 là playing
                window.ytPlayer.pauseVideo();
                updateDetailPlayButtonState("paused");
            } else {
                window.ytPlayer.playVideo();
                updateDetailPlayButtonState("playing");
            }
            return;
        }
    }
    
    // Hỗ trợ trình phát HTML5 (HLS/MP4)
    if (!video) {
        video = document.getElementById("html5Player");
    }
    
    if (!video) {
        console.error("No video element found!");
        return;
    }
    
    console.log("Toggling play, video:", video, "paused:", video.paused);
    
    if (video.paused) {
        if (typeof currentMovieId !== 'undefined') localStorage.setItem('intentPause_' + currentMovieId, 'false');
        // Fix AbortError: play() returns a promise
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                if (error.name === "AbortError") {
                    console.log("Play request was interrupted by a pause() call. This is expected during rapid toggling.");
                } else {
                    console.error("Play error:", error);
                }
            });
        }
    } else {
        if (typeof currentMovieId !== 'undefined') localStorage.setItem('intentPause_' + currentMovieId, 'true');
        video.pause();
    }
};

/**
 * Hiển thị Overlay báo lỗi trong Video Player
 */
function showPlayerError(message) {
    const errorOverlay = document.getElementById("videoError");
    const errorMsgText = document.getElementById("videoErrorMessage");
    
    if (errorOverlay && errorMsgText) {
        errorMsgText.innerHTML = (message || "Rất tiếc, video hiện tại không thể tải được. Vui lòng thử lại sau hoặc báo cáo lỗi cho Admin.") + 
                                 "<br><br><span style='color:#ffaa00; font-size:14px; font-weight:normal;'>💡 Mẹo: Nếu bạn đang bật VPN hoặc WARP 1.1.1.1, hãy TẮT đi và nhấn Thử Lại. Các dải mạng ảo (IP nước ngoài) thường bị Origin Server tự động chặn kết nối!</span>";
        errorOverlay.classList.remove("hidden");
        
        // Ẩn các controls khác để tập trung vào lỗi
        const customControls = document.getElementById("customControls");
        const centerOverlay = document.getElementById("centerOverlay");
        if (customControls) customControls.classList.add("hidden");
        if (centerOverlay) centerOverlay.classList.add("hidden");
    }
}

/**
 * Tự động báo cáo lỗi Video về Supabase
 */
async function autoReportVideoError(type, details) {
    if (!currentMovieId || !supabase || !currentUser) return;
    
    const movie = allMovies.find(m => m.id === currentMovieId);
    if (!movie) return;
    
    const episode = movie.episodes && movie.episodes[currentEpisode];
    const epName = episode 
         ? String(episode.name || episode.episodeNumber || `Tập ${currentEpisode + 1}`) 
         : "Full";
          
    const errorKey = `reported_error_${currentMovieId}_${currentEpisode}`;
    const lastReported = sessionStorage.getItem(errorKey);
    
    // Chống spam: 5 phút báo 1 lần
    if (lastReported && (Date.now() - parseInt(lastReported) < 5 * 60 * 1000)) {
        return;
    }

    try {
        await processErrorReport({
            movieId: currentMovieId,
            movieTitle: movie.title || "Không rõ tên",
            episodeName: String(epName),
            errorType: "broken_link",
            description: `[AUTO-DETECT] ${type}: ${details}`,
            userId: currentUser ? currentUser.id : null,
            userName: currentUser ? (currentUser.display_name || currentUser.email) : "Hệ thống tự động"
        });
        sessionStorage.setItem(errorKey, Date.now());
        console.log(`✅ Đã tự động báo lỗi [${type}] về hệ thống Supabase.`);
    } catch (error) {
        console.error("Lỗi auto-report lên Supabase:", error);
    }
}

/**
 * Người dùng nhấn nút Báo lỗi thủ công trên Overlay
 */
window.reportVideoErrorManual = async function() {
    if (!currentMovieId) return;
    if (!currentUser) {
        showNotification("Vui lòng đăng nhập để báo lỗi!", "warning");
        return;
    }
    
    const movie = allMovies.find(m => m.id === currentMovieId);
    if (!movie) return;

    const epName = movie.episodes && movie.episodes[currentEpisode] 
        ? (movie.episodes[currentEpisode].name || movie.episodes[currentEpisode].episodeNumber || `Tập ${currentEpisode + 1}`)
        : "Full";
    
    showLoading(true);
    try {
        await processErrorReport({
            movieId: currentMovieId,
            movieTitle: movie.title,
            episodeName: String(epName), // Ép kiểu String đồng nhất
            errorType: "broken_link",
            description: "[USER-REPORT] Người dùng báo lỗi qua Giao diện trình phát (Broken link).",
            userId: currentUser ? (currentUser.uid || currentUser.id) : null,
            userName: currentUser ? (currentUser.displayName || currentUser.display_name || currentUser.email) : "Người dùng"
        });
        
        showNotification("Đã gửi báo cáo lỗi. Cảm ơn bạn!", "success");
        // Đổi nút sau khi báo thành công
        const btn = document.querySelector(".video-error .btn-danger");
        if (btn) {
            btn.innerHTML = '<i class="fas fa-check"></i> Đã báo lỗi';
            btn.disabled = true;
        }
    } catch (e) {
        console.error(e);
        showNotification("Lỗi khi gửi báo cáo!", "error");
    } finally {
        showLoading(false);
    }
};

/**
 * Hàm xử lý báo lỗi: Chống spam và Gom nhóm (Grouping)
 * @param {Object} reportData Thông tin báo lỗi mới
 */
/**
 * Hàm xử lý báo lỗi: Chống spam và Gom nhóm (Grouping) trên Supabase
 */
async function processErrorReport(reportData) {
    const { movieId, episodeName, errorType } = reportData;
    const lockKey = String(movieId) + "_" + String(episodeName) + "_" + String(errorType);
    
    if (reportLocks[lockKey]) return reportLocks[lockKey];
    
    reportLocks[lockKey] = (async () => {
        try {
            const safeEpName = String(episodeName);

            // 1. Tìm báo lỗi "pending" tương tự
            const { data: existingReport, error: fetchError } = await supabase
                .from('error_reports')
                .select('id, reporters')
                .eq('movie_id', movieId)
                .eq('episode_name', safeEpName)
                .eq('error_type', errorType)
                .eq('status', 'pending')
                .limit(1)
                .maybeSingle();

            if (existingReport) {
                let reporters = existingReport.reporters || [];
                const currentUid = reportData.userId || "anonymous_user";
                const alreadyInList = reporters.find(r => r.uid === currentUid);
                
                if (!alreadyInList) {
                    reporters.push({
                        uid: currentUid,
                        name: reportData.userName || "Người dùng",
                        time: new Date().toISOString()
                    });
                } else {
                    alreadyInList.time = new Date().toISOString();
                }

                await supabase
                    .from('error_reports')
                    .update({
                        user_id: reportData.userId || null,
                        user_name: reportData.userName || "Người dùng",
                        reporters: reporters,
                        report_count: reporters.length,
                        description: reportData.description,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingReport.id);
                    
                console.log(`🔄 Đã gộp báo lỗi cho tập ${safeEpName}. (Tổng: ${reporters.length})`);
                return existingReport.id;
            } else {
                const { data: newReport, error: insertError } = await supabase
                    .from('error_reports')
                    .insert({
                        user_id: reportData.userId || null,
                        user_name: reportData.userName || "Người dùng",
                        movie_id: movieId,
                        movie_title: reportData.movieTitle,
                        episode_name: safeEpName,
                        error_type: errorType,
                        description: reportData.description,
                        status: "pending",
                        report_count: 1,
                        reporters: [{
                            uid: reportData.userId || "anonymous",
                            name: reportData.userName || "Người dùng",
                            time: new Date().toISOString()
                        }]
                    })
                    .select()
                    .single();

                if (insertError) throw insertError;
                
                // 2. Bắn thông báo Admin
                const typeLabels = {
                    "load_slow": "Video giật lag",
                    "broken_link": "Không xem được/Hỏng link",
                    "subtitle_error": "Lỗi phụ đề",
                    "audio_error": "Lỗi âm thanh",
                    "wrong_movie": "Sai tập/Sai phim",
                    "other": "Khác"
                };
                const typeName = typeLabels[errorType] || "Khác";

                await supabase.from('notifications').insert({
                    is_for_admin: true,
                    title: `Báo lỗi [${typeName}]: ${reportData.movieTitle} - ${safeEpName}`,
                    message: `User ${reportData.userName} báo lỗi: "${reportData.description.substring(0, 50)}..."`,
                    type: "system",
                    is_read: false
                });

                console.log(`🆕 Đã tạo báo lỗi mới cho tập ${safeEpName} trên Supabase.`);
                return newReport.id;
            }
        } catch (error) {
            console.error("Lỗi processErrorReport:", error);
            throw error;
        } finally {
            setTimeout(() => { delete reportLocks[lockKey]; }, 2000);
        }
    })();

    return reportLocks[lockKey];
}

// --- RESUME WATCH MODAL FUNCTIONS ---
let pendingResumeData = null;

function showResumeModal(progress) {
    const modal = document.getElementById("resumeWatchModal");
    if (!modal) return;
    
    // Tính lại percentage nếu không có
    const percentage = progress.percentage || (progress.duration > 0 ? Math.round((progress.currentTime / progress.duration) * 100) : 0);
    
    // Cập nhật thông tin
    document.getElementById("resumeWatchTime").textContent = formatTime(progress.currentTime);
    document.getElementById("resumeWatchPercent").textContent = percentage + "%";
    
    // Lưu data để xử lý khi user chọn
    pendingResumeData = { ...progress, percentage };
    
    // Hiển modal
    openModal("resumeWatchModal");
}

function closeResumeModal() {
    // Đóng cả modal cũ và modal mới
    closeModal("resumeWatchModal");
    closeModal("continueWatchingModal");
    pendingResumeData = null;
}

/**
 * Đóng modal tiếp tục xem
 */
function closeContinueWatchingModal() {
    closeModal("continueWatchingModal");
}

window.handleResumeChoice = function(continueWatching) {
    // Ẩn modal
    closeResumeModal();
    
    if (continueWatching && pendingResumeData && pendingResumeData.currentTime > 0) {
        // Tiếp tục từ vị trí đã lưu - sử dụng hàm resumeVideoAtTime
        resumeVideoAtTime(pendingResumeData.currentTime);
    } else {
        // Xem từ đầu - xóa progress đã lưu và phát lại từ đầu
        if (currentMovieId) {
            clearWatchProgress(currentMovieId);
            console.log("🗑️ Đã xóa progress, xem từ đầu");
        }
        
        // Reset video về 0 và phát lại từ đầu
        const video = document.getElementById("html5Player");
        if (video) {
            video.currentTime = 0;
            video.play().catch(e => console.error("Play error:", e));
            console.log("✅ Xem từ đầu - reset về 0 giây");
        }
    }
    
    // Reset
    pendingResumeData = null;
};

/**
 * ============================================================
 * SKIP INTRO LOGIC (USER SIDE)
 * ============================================================
 */

/**
 * Kiểm tra xem có cần hiển thị nút Bỏ qua Intro hoặc Chuyển tập tiếp theo không
 */
function checkSkipIntro(currentTime) {
    const btnSkip = document.getElementById("btnSkipIntro");
    const btnNext = document.getElementById("btnNextEpisode");
    
    if (!currentMovie || !currentMovie.episodes) {
        if (btnSkip) btnSkip.classList.add("hidden");
        if (btnNext) btnNext.classList.add("hidden");
        return;
    }

    const episode = currentMovie.episodes[currentEpisode];
    if (!episode) return;

    // 1. Xử lý Bỏ qua Intro
    if (btnSkip) {
        const introEnd = Number(episode.introEndTime) || 0;
        if (introEnd > 0) {
            // Hiển thị nút từ bắt đầu video (0s) cho đến khi đạt mốc introEnd
            if (currentTime < introEnd) {
                btnSkip.classList.remove("hidden");
            } else {
                btnSkip.classList.add("hidden");
            }
        } else {
            btnSkip.classList.add("hidden");
        }
    }

    // 2. Xử lý Chuyển tập tiếp theo (Outro)
    if (btnNext) {
        const hasNextEpisode = currentEpisode < currentMovie.episodes.length - 1;
        const outroStart = Number(episode.outroStartTime) || 0;
        
        if (outroStart > 0 && hasNextEpisode) {
            // Hiển thị nút nếu currentTime đã đến mốc outro
            // Thêm điều kiện outroStart > introEnd để tránh hiện nhầm ở đầu phim nếu Admin nhập sai
            const introEnd = Number(episode.introEndTime) || 0;
            if (currentTime >= outroStart && currentTime > introEnd) { 
                btnNext.classList.remove("hidden");
            } else {
                btnNext.classList.add("hidden");
            }
        } else {
            btnNext.classList.add("hidden");
        }
    }
}

/**
 * Thực hiện hành động chuyển sang tập tiếp theo
 */
window.handleNextEpisode = function() {
    if (!currentMovie || !currentMovie.episodes) return;
    
    const nextEpisodeIndex = currentEpisode + 1;
    if (nextEpisodeIndex < currentMovie.episodes.length) {
        console.log("⏭️ Chuyển sang tập tiếp theo:", nextEpisodeIndex);
        showNotification("Đang chuyển sang tập tiếp theo...", "info");
        
        // Gọi hàm selectEpisode hiện có để xử lý việc đổi tập
        if (typeof selectEpisode === 'function') {
            selectEpisode(nextEpisodeIndex);
        } else {
            console.warn("Hàm selectEpisode không tồn tại!");
        }
    }

    // Ẩn nút ngay lập tức
    const btn = document.getElementById("btnNextEpisode");
    if (btn) btn.classList.add("hidden");
};

/**
 * Thực hiện hành động bỏ qua Intro
 */
window.handleSkipIntro = function() {
    if (!currentMovie || !currentMovie.episodes) return;
    
    const episode = currentMovie.episodes[currentEpisode];
    const introEnd = Number(episode?.introEndTime) || 0;
    if (!episode || introEnd === 0) return;
    
    // Thực hiện nhảy tới thời gian kết thúc intro
    if (currentVideoType === 'youtube' && window.ytPlayer && typeof window.ytPlayer.seekTo === 'function') {
        window.ytPlayer.seekTo(introEnd, true);
        window.ytPlayer.playVideo();
    } else if (videoEl) {
        videoEl.currentTime = introEnd;
        videoEl.play();
    }

    // Ẩn nút ngay lập tức sau khi bấm
    const btn = document.getElementById("btnSkipIntro");
    if (btn) btn.classList.add("hidden");
    
    showNotification("Đã bỏ qua đoạn giới thiệu", "info");
};

window.skipTime = function(seconds) {
    if (currentVideoType === 'youtube' && window.ytPlayer && typeof window.ytPlayer.getCurrentTime === 'function') {
        const currentTime = window.ytPlayer.getCurrentTime();
        window.ytPlayer.seekTo(currentTime + seconds, true);
        return;
    }

    let video = videoEl;
    if (!video) {
        video = document.getElementById("html5Player");
    }
    if (!video) return;
    video.currentTime += seconds;
};

window.toggleMute = function() {
    if (!videoEl) return;
    videoEl.muted = !videoEl.muted;
    updateVolumeIcon(videoEl.muted ? 0 : videoEl.volume);
    document.getElementById("volumeSlider").value = videoEl.muted ? 0 : videoEl.volume;
};

function updateVolumeIcon(vol) {
    const icon = document.querySelector("#volumeBtn i");
    if (vol == 0) icon.className = "fas fa-volume-mute";
    else if (vol < 0.5) icon.className = "fas fa-volume-down";
    else icon.className = "fas fa-volume-up";
}

// Settings Menu
window.toggleSettingsMenu = function() {
    const menu = document.getElementById("settingsMenu");
    const speedMenu = document.getElementById("speedMenu");
    const qualityMenu = document.getElementById("qualityMenu");
    const ccMenu = document.getElementById("ccSubtitleMenu"); // Close CC menu if open
    
    if (ccMenu && ccMenu.style.display === "flex") {
        ccMenu.style.display = "none";
    }

    if (menu.style.display === "flex") {
        menu.style.display = "none";
        speedMenu.style.display = "none";
        if (qualityMenu) qualityMenu.style.display = "none";
    } else {
        menu.style.display = "flex";
    }
};

// --- SUBTITLE & SETTINGS LOGIC ---
const SUBTITLE_COLORS = {
    white: "#ffffff",
    yellow: "#ffeb3b",
    cyan: "#00ffff",
    green: "#4caf50"
};

function initSubtitleTracks(video) {
    const subtitleMenu = document.getElementById("subtitleMenu");
    if (!subtitleMenu) return; // Add menu structure later if needed
    // ... Implement fetch tracks logic or use textTracks API
}

window.showSubMenu = function(type) {
    // Ẩn menu chính và tất cả submenu trước
    document.getElementById("settingsMenu").style.display = "none";
    document.querySelectorAll(".settings-submenu").forEach(m => m.style.display = "none");
    
    const menuMap = {
        'speed': 'speedMenu',
        'quality': 'qualityMenu', 
        'subtitleStyle': 'subtitleStyleMenu',
        'subColor': 'subColorMenu',
        'subSize': 'subSizeMenu',
        'subFont': 'subFontMenu',
        'subOutline': 'subOutlineMenu',
        'subBg': 'subBgMenu',
        'subBgOpacity': 'subBgOpacityMenu',
        'subPosition': 'subPositionMenu'
    };
    const targetId = menuMap[type];
    if (targetId) {
        const el = document.getElementById(targetId);
        if (el) el.style.display = "flex";
    }
};

window.hideSubMenu = function() {
    document.querySelectorAll(".settings-submenu").forEach(m => m.style.display = "none");
    document.getElementById("settingsMenu").style.display = "flex";
};

// --- TUỲ CHỈNH PHỤ ĐỀ (::cue CSS Injection + Per-User Storage) ---

// Lấy storage key theo tài khoản user hiện tại
function getSubStyleKey() {
    const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : 'guest';
    return 'subStyles_' + uid;
}

// Defaults
const SUB_STYLE_DEFAULTS = {
    color: '#ffffff', fontSize: '16pt', fontFamily: 'inherit',
    outline: 'shadow', bgColor: '#000000', bgOpacity: '0', position: 'bottom'
};

window._subStyles = JSON.parse(localStorage.getItem(getSubStyleKey()) || JSON.stringify(SUB_STYLE_DEFAULTS));
// Đảm bảo có trường position nếu user cũ chưa có
if (!window._subStyles.position) window._subStyles.position = 'bottom';

// Khởi tạo lại giao diện khi trang load
function restoreSubStyleUI() {
    const s = window._subStyles;
    const labels = {
        color: { '#ffffff':'Trắng','#ffeb3b':'Vàng','#00ffff':'Cyan','#4caf50':'Xanh lá','#ff5722':'Cam' },
        outline: { 'shadow':'Đổ bóng','outline':'Viền đậm','raised':'Nổi','none':'Không' },
        bgColor: { '#000000':'Đen','#ffffff':'Trắng','#1a237e':'Xanh Navy','transparent':'Trong suốt' },
        position: { 'bottom':'Dưới','middle':'Giữa','top':'Trên' }
    };
    const setLabel = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    const setDot = (id, color) => { const el = document.getElementById(id); if(el) el.style.background = color; };
    
    setLabel('subColorLabel', labels.color[s.color] || 'Trắng');
    setDot('subColorDot', s.color);
    setLabel('subSizeLabel', s.fontSize);
    setLabel('subFontLabel', s.fontFamily === 'inherit' ? 'Mặc định' : s.fontFamily);
    setLabel('subOutlineLabel', labels.outline[s.outline] || 'Đổ bóng');
    setLabel('subBgLabel', labels.bgColor[s.bgColor] || 'Đen');
    setDot('subBgDot', s.bgColor);
    const opacityPercent = Math.round(parseFloat(s.bgOpacity) * 100) + '%';
    setLabel('subBgOpacityLabel', opacityPercent);
    setLabel('subPositionLabel', labels.position[s.position] || 'Dưới');
    
    applySubStyle();
}
restoreSubStyleUI();

// Khi user đăng nhập/đổi tài khoản → reload lại cài đặt phụ đề của họ
window.reloadSubStyleForUser = function() {
    window._subStyles = JSON.parse(localStorage.getItem(getSubStyleKey()) || JSON.stringify(SUB_STYLE_DEFAULTS));
    if (!window._subStyles.position) window._subStyles.position = 'bottom';
    restoreSubStyleUI();
};

// Áp dụng style vào video::cue bằng cách inject <style> tag
function applySubStyle() {
    const s = window._subStyles;
    let styleEl = document.getElementById('custom-cue-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'custom-cue-style';
        document.head.appendChild(styleEl);
    }
    
    // Tính text-shadow theo kiểu viền
    let textShadow = 'none';
    if (s.outline === 'shadow') textShadow = '2px 2px 4px rgba(0,0,0,0.9)';
    else if (s.outline === 'outline') textShadow = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
    else if (s.outline === 'raised') textShadow = '0px 1px 3px rgba(0,0,0,0.8), 0px 2px 6px rgba(0,0,0,0.5)';
    
    // Tính background cho ::cue  
    let bgRgba = 'transparent';
    if (s.bgColor && s.bgColor !== 'transparent') {
        const hex = s.bgColor.replace('#','');
        const r = parseInt(hex.substring(0,2),16);
        const g = parseInt(hex.substring(2,4),16);
        const b = parseInt(hex.substring(4,6),16);
        bgRgba = `rgba(${r},${g},${b},${s.bgOpacity})`;
    }
    
    styleEl.textContent = `
        video::cue {
            color: ${s.color} !important;
            font-size: ${s.fontSize} !important;
            font-family: ${s.fontFamily === 'inherit' ? 'inherit' : "'" + s.fontFamily + "'"} !important;
            text-shadow: ${textShadow} !important;
            background: ${bgRgba} !important;
            outline: none !important;
        }
    `;
    
    // Áp dụng vị trí phụ đề bằng cách set cue.line cho tất cả track đang hiển thị
    applySubPosition(s.position);
}

// Thay đổi vị trí phụ đề bằng VTT Cue API
function applySubPosition(pos) {
    const video = document.getElementById('html5Player');
    if (!video || !video.textTracks) return;
    
    let lineVal = -1; // Mặc định: dưới cùng
    if (pos === 'top') lineVal = 0;
    else if (pos === 'middle') lineVal = -8;
    // bottom = -1 (default)
    
    for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.cues) {
            for (let j = 0; j < track.cues.length; j++) {
                track.cues[j].line = lineVal;
            }
        }
    }
}

window.setSubStyle = function(prop, value, label) {
    window._subStyles[prop] = value;
    localStorage.setItem(getSubStyleKey(), JSON.stringify(window._subStyles));
    
    // Cập nhật label hiển thị
    const labelMap = {
        color: ['subColorLabel', 'subColorDot'],
        fontSize: ['subSizeLabel'],
        fontFamily: ['subFontLabel'],
        outline: ['subOutlineLabel'],
        bgColor: ['subBgLabel', 'subBgDot'],
        bgOpacity: ['subBgOpacityLabel'],
        position: ['subPositionLabel']
    };
    const targets = labelMap[prop];
    if (targets) {
        const labelEl = document.getElementById(targets[0]);
        if (labelEl) labelEl.textContent = label;
        if (targets[1]) {
            const dotEl = document.getElementById(targets[1]);
            if (dotEl) dotEl.style.background = value;
        }
    }
    
    applySubStyle();
    
    // Quay về menu Tuỳ chỉnh phụ đề
    showSubMenu('subtitleStyle');
};

// --- CLICK OUTSIDE: Tự đóng menu khi bấm ra ngoài ---
document.addEventListener('click', function(e) {
    // Kiểm tra xem click có nằm trong vùng settings-container hoặc cc-container không
    const settingsContainer = e.target.closest('.settings-container');
    const ccContainer = e.target.closest('.cc-container');
    
    // Nếu click NGOÀI cả 2 vùng → đóng tất cả menu
    if (!settingsContainer && !ccContainer) {
        const settingsMenu = document.getElementById('settingsMenu');
        const ccMenu = document.getElementById('ccSubtitleMenu');
        
        if (settingsMenu) settingsMenu.style.display = 'none';
        if (ccMenu) ccMenu.style.display = 'none';
        document.querySelectorAll('.settings-submenu').forEach(m => m.style.display = 'none');
    }
});

// --- HLS QUALITY LOGIC ---
function populateQualityMenu(hls) {
    const qualityMenu = document.getElementById("qualityMenu");
    const qualityItem = document.getElementById("qualitySettingsItem");
    if (!qualityMenu || !hls || !hls.levels || hls.levels.length <= 1) return;

    // Show quality item in settings
    if (qualityItem) qualityItem.style.display = "flex";

    // Remove old dynamic items (keep header and auto)
    const existing = qualityMenu.querySelectorAll(".submenu-item:not([data-level='-1'])");
    existing.forEach(el => el.remove());

    // Sort levels by height (resolution) ascending
    const levels = hls.levels.map((level, index) => ({
        index: index,
        height: level.height,
        bitrate: level.bitrate
    })).sort((a, b) => a.height - b.height);

    // Add level options
    levels.forEach(level => {
        const item = document.createElement("div");
        item.className = "submenu-item";
        item.dataset.level = level.index;
        item.onclick = () => setQuality(level.index);

        const label = `${level.height}p`;
        const bitrate = Math.round(level.bitrate / 1000);
        item.innerHTML = `${label} <span class="quality-bitrate">${bitrate} kbps</span>`;
        qualityMenu.appendChild(item);
    });
}

function updateQualityDisplay(levelIndex) {
    const hls = window.hlsInstance;
    if (!hls) return;
    const label = document.getElementById("currentQualityVal");
    if (!label) return;

    if (hls.autoLevelEnabled || levelIndex === -1) {
        const currentLevel = hls.levels[hls.currentLevel];
        const h = currentLevel ? currentLevel.height : '?';
        label.textContent = `Tự động (${h}p)`;
    } else {
        const level = hls.levels[levelIndex];
        label.textContent = level ? `${level.height}p` : 'N/A';
    }

    // Update active class
    const qualityMenu = document.getElementById("qualityMenu");
    if (qualityMenu) {
        qualityMenu.querySelectorAll(".submenu-item").forEach(item => {
            item.classList.remove("active");
            const itemLevel = parseInt(item.dataset.level);
            if (hls.autoLevelEnabled && itemLevel === -1) {
                item.classList.add("active");
            } else if (!hls.autoLevelEnabled && itemLevel === levelIndex) {
                item.classList.add("active");
            }
        });
    }
}

window.setQuality = function(levelIndex) {
    const hls = window.hlsInstance;
    if (!hls) {
        showNotification("Chỉ hỗ trợ chọn chất lượng cho video HLS!", "warning");
        return;
    }

    hls.currentLevel = levelIndex; // -1 = auto
    
    updateQualityDisplay(levelIndex);
    window.hideSubMenu();
    window.toggleSettingsMenu();
};




window.toggleSubtitleMenu = function() {
    const ccMenu = document.getElementById("ccSubtitleMenu");
    if (!ccMenu) return;
    
    const settingsMenu = document.getElementById("settingsMenu");
    if (settingsMenu && settingsMenu.style.display === "flex") {
        settingsMenu.style.display = "none";
    }
    
    if (ccMenu.style.display === "none" || !ccMenu.style.display) {
        ccMenu.style.display = "flex";
    } else {
        ccMenu.style.display = "none";
    }
};

window.setSubtitleMode = function(mode, skipSave = false) {
    const btnOn = document.getElementById("smtBtnOn");
    const btnOff = document.getElementById("smtBtnOff");
    const ccBtn = document.getElementById("ccBtn");
    const video = document.getElementById("html5Player");
    const prefLangFallback = window.currentAvailableSubs && window.currentAvailableSubs.length > 0 ? window.currentAvailableSubs[0].code : 'vi';
    
    if (mode === 'on') {
        if(btnOn) btnOn.classList.add("active");
        if(btnOff) btnOff.classList.remove("active");
        if(ccBtn) ccBtn.classList.add("cc-btn-active");
        if(!skipSave) localStorage.setItem('preferredSubtitleState', 'on');
        
        // Bật ngôn ngữ ưa thích (1-track duy nhất)
        let prefLang = localStorage.getItem('preferredSubtitleLang') || prefLangFallback;
        
        if (video && video.textTracks) {
            let found = false;
            for (let i = 0; i < video.textTracks.length; i++) {
                if (video.textTracks[i].language === prefLang) {
                    video.textTracks[i].mode = "showing";
                    found = true;
                } else {
                    video.textTracks[i].mode = "hidden";
                }
            }
            if (!found && video.textTracks.length > 0) {
                video.textTracks[0].mode = "showing";
                prefLang = video.textTracks[0].language;
                if(!skipSave) localStorage.setItem('preferredSubtitleLang', prefLang);
            }
        }
        
    } else {
        if(btnOn) btnOn.classList.remove("active");
        if(btnOff) btnOff.classList.add("active");
        if(ccBtn) ccBtn.classList.remove("cc-btn-active");
        if(!skipSave) localStorage.setItem('preferredSubtitleState', 'off');
        
        if (video && video.textTracks) {
            for (let i = 0; i < video.textTracks.length; i++) {
                video.textTracks[i].mode = "hidden";
            }
        }
    }
    
    // Cập nhật giao diện dấu tick
    const items = document.querySelectorAll('.smt-lang-item');
    items.forEach(el => {
        if (mode === 'on' && el.dataset.lang === localStorage.getItem('preferredSubtitleLang')) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
};

window.changeSubtitleLang = function(langCode) {
    localStorage.setItem('preferredSubtitleLang', langCode);
    setSubtitleMode('on', false);
    
    setTimeout(() => {
        const ccMenu = document.getElementById("ccSubtitleMenu");
        if (ccMenu) ccMenu.style.display = "none";
    }, 200); // Ẩn mượt menu
};

window.setSpeed = function(speed) {
    if (!videoEl) return;
    videoEl.playbackRate = speed;
    document.getElementById("currentSpeedVal").textContent = speed === 1 ? "Chuẩn" : `${speed}x`;
    
    // Update active class
    document.querySelectorAll("#speedMenu .submenu-item").forEach(item => {
        item.classList.remove("active");
        if (item.textContent.includes(speed.toString()) || (speed === 1 && item.textContent === "Chuẩn")) {
            item.classList.add("active");
        }
    });
    
    window.hideSubMenu();
    window.toggleSettingsMenu(); // Close all
};

window.togglePiP = async function() {
    if (!videoEl) return;

    try {
        // === iOS Safari / PWA: Dùng WebKit API riêng ===
        if (typeof videoEl.webkitSupportsPresentationMode === 'function' &&
            typeof videoEl.webkitSetPresentationMode === 'function') {
            const currentMode = videoEl.webkitPresentationMode;
            if (currentMode === 'picture-in-picture') {
                videoEl.webkitSetPresentationMode('inline');
            } else {
                videoEl.webkitSetPresentationMode('picture-in-picture');
            }
            return;
        }

        // === Chrome/Edge/Firefox: API chuẩn W3C ===
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else if (typeof videoEl.requestPictureInPicture === 'function') {
            await videoEl.requestPictureInPicture();
        } else {
            showNotification("Trình duyệt không hỗ trợ PiP!", "warning");
        }
    } catch (error) {
        console.error("Lỗi PiP:", error);
        showNotification("Không thể bật PiP: " + error.message, "error");
    }
};

/**
 * Bật/Tắt Toàn màn hình (Hỗ trợ cả PC, Mobile, Tablet)
 * Dùng Fullscreen API chuẩn + webkit fallback cho Safari
 */
window.toggleFullscreen = function() {
    const container = document.getElementById("videoContainer");
    const icon = document.querySelector("#fullscreenBtn i");
    if (!container) return;

    // Nhận diện iOS tinh vi hơn (bao gồm iPad hiển thị như Desktop Mac)
    const isIOS = [
      'iPad Simulator', 'iPhone Simulator', 'iPod Simulator',
      'iPad', 'iPhone', 'iPod'
    ].includes(navigator.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);

    // Trạng thái hiện tại
    const isNativeFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    const isPseudoFullscreen = container.classList.contains("pseudo-fullscreen");

    if (!isNativeFullscreen && !isPseudoFullscreen) {
        // VÀO FULLSCREEN
        if (isIOS || (!container.requestFullscreen && !container.webkitRequestFullscreen)) {
            // Giả lập toàn màn hình cho iOS (giữ nguyên danh sách tập + tên phim)
            container.classList.add("pseudo-fullscreen");
            document.documentElement.classList.add("has-pseudo-fullscreen");
            document.body.classList.add("has-pseudo-fullscreen");
            if (icon) icon.className = "fas fa-compress";
            return;
        }

        // Native cho Android/Desktop PC
        if (container.requestFullscreen) {
            container.requestFullscreen().catch(err => {
                console.warn("Fullscreen API error:", err);
                // Fallback nếu lỗi (điển hình là Chrome/Safari rườm rà)
                container.classList.add("pseudo-fullscreen");
                document.documentElement.classList.add("has-pseudo-fullscreen");
                document.body.classList.add("has-pseudo-fullscreen");
                if (icon) icon.className = "fas fa-compress";
            });

        } else if (container.webkitRequestFullscreen) {
            container.webkitRequestFullscreen(); 
        }
        if (icon) icon.className = "fas fa-compress";
    } else {
        // THOÁT FULLSCREEN
        // Nếu đang khóa màn hình, không cho thoát
        if (container.classList.contains("screen-locked")) {
            return;
        }
        if (isPseudoFullscreen) {
            // Gỡ khóa màn hình nếu đang bật
            if (container.classList.contains("screen-locked")) {
                container.classList.remove("screen-locked");
                document.removeEventListener("touchmove", _blockTouch);
                document.removeEventListener("touchstart", _blockTouch);
                document.documentElement.style.overflow = "";
                document.body.style.overflow = "";
                document.body.style.position = "";
                document.body.style.width = "";
                document.body.style.height = "";
                const lockBtn = document.getElementById("screenLockBtn");
                if (lockBtn) {
                    const li = lockBtn.querySelector("i");
                    if (li) li.className = "fas fa-lock-open";
                }
            }
            container.classList.remove("pseudo-fullscreen");
            document.documentElement.classList.remove("has-pseudo-fullscreen");
            document.body.classList.remove("has-pseudo-fullscreen");
            if (icon) icon.className = "fas fa-expand";
            return;
        }

        if (document.exitFullscreen) {
            document.exitFullscreen().catch(e => console.log("Exit fullscreen:", e));
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        if (icon) icon.className = "fas fa-expand";
    }
};

// Lắng nghe phím ESC để thoát giả lập (nếu có dùng trên Desktop)
document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
        const container = document.getElementById("videoContainer");
        if (!container) return;
        // Nếu đang khóa màn hình, chặn ESC
        if (container.classList.contains("screen-locked")) return;
        const icon = document.querySelector("#fullscreenBtn i");
        if (container.classList.contains("pseudo-fullscreen")) {
            container.classList.remove("pseudo-fullscreen");
            document.documentElement.classList.remove("has-pseudo-fullscreen");
            document.body.classList.remove("has-pseudo-fullscreen");
            if (icon) icon.className = "fas fa-expand";
        }
    }
});

/**
 * Bật/Tắt khóa màn hình trong pseudo-fullscreen
 * Khi khóa: ẩn hết controls, chỉ giữ nút mở khóa
 * Ngăn chặn việc vô tình thoát fullscreen khi xem phim
 * Chặn touch event để trình duyệt không thể kéo thanh URL xuống
 */

// Hàm chặn touch di chuyển và chạm (ngăn cuộn trang -> ngăn thanh URL hiện)
function _blockTouch(e) {
    // Cho phép chạm vào nút khóa
    if (e.target.closest) {
        if (e.target.closest('#screenLockBtn')) return;
        
        // Nút danh sách tập: xử lý bằng touchstart trên mobile để nhạy hơn và chặn togglePlay
        const isEpisodeBtn = e.target.closest('#episodeListBtn');
        if (isEpisodeBtn) {
            if (e.type === 'touchstart') {
                if (typeof toggleEpisodePanel === 'function') {
                    toggleEpisodePanel();
                } else if (window.toggleEpisodePanel) {
                    window.toggleEpisodePanel();
                }
            }
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        
        // Cho phép tương tác bên trong bảng chọn tập luôn
        if (e.target.closest('.player-episode-panel')) return;
        // Cho phép tương tác bên trong menu cài đặt
        if (e.target.closest('.settings-menu')) return;
        
        // Ngăn play/pause nếu vô tình chạm vào top bar hoặc các nút UI khác
        if (e.target.closest('.player-top-bar')) return;
    }
    
    // Nếu chạm vào màn hình đen hoặc video (không trúng các phần tử trên),
    // THEO YÊU CẦU: cho phép play/pause khi khóa màn hình bằng cách gọi luôn hàm
    // Chú ý: Chỉ phát/dừng khi chạm 1 ngón tay (không phải pinch-to-zoom)
    if (e.type === 'touchstart' && e.touches && e.touches.length === 1) {
        console.log("Tap to play/pause in locked mode");
        if (typeof togglePlay === 'function') togglePlay();
        else if (window.togglePlay) window.togglePlay();
    }
    
    e.preventDefault();
    e.stopPropagation();
}

window.toggleScreenLock = function() {
    const container = document.getElementById("videoContainer");
    const lockBtn = document.getElementById("screenLockBtn");
    if (!container || !lockBtn) return;

    const isLocked = container.classList.toggle("screen-locked");
    const lockIcon = lockBtn.querySelector("i");

    if (isLocked) {
        // Đã khóa - chặn mọi thao tác vuốt trên toàn bộ document
        if (lockIcon) lockIcon.className = "fas fa-lock";
        lockBtn.title = "Mở khóa màn hình";
        document.addEventListener("touchmove", _blockTouch, { passive: false });
        document.addEventListener("touchstart", _blockTouch, { passive: false });
        // Thêm khóa overflow cứng cho cả html
        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.width = "100%";
        document.body.style.height = "100%";
    } else {
        // Đã mở khóa - tháo chặn
        if (lockIcon) lockIcon.className = "fas fa-lock-open";
        lockBtn.title = "Khóa màn hình";
        document.removeEventListener("touchmove", _blockTouch);
        document.removeEventListener("touchstart", _blockTouch);
        // Khôi phục lại overflow cho body (vẫn giữ lại has-pseudo-fullscreen nếu đang fullscreen)
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.height = "";
    }
};

/**
 * PINCH-TO-FILL: Dùng 2 ngón tay để lắp đầy màn hình
 * Pinch ra xa (zoom out) → object-fit: cover (lắp đầy, cắt rìa)
 * Pinch vào trong (zoom in) → object-fit: contain (vừa vặn, có viền đen)
 */
(function() {
    let initialPinchDistance = 0;
    let isPinching = false;

    // Tính khoảng cách giữa 2 ngón tay
    function getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    document.addEventListener("touchstart", function(e) {
        if (e.touches.length !== 2) return;
        const container = document.getElementById("videoContainer");
        if (!container || !container.classList.contains("pseudo-fullscreen")) return;

        isPinching = true;
        initialPinchDistance = getPinchDistance(e.touches);
    }, { passive: true });

    document.addEventListener("touchmove", function(e) {
        if (!isPinching || e.touches.length !== 2) return;
        // Không preventDefault ở đây vì đã dùng passive: true
    }, { passive: true });

    document.addEventListener("touchend", function(e) {
        if (!isPinching) return;
        isPinching = false;

        const container = document.getElementById("videoContainer");
        if (!container || !container.classList.contains("pseudo-fullscreen")) return;

        // Nếu chỉ còn 1 ngón hoặc hết ngón → tính kết quả pinch
        // Lấy khoảng cách cuối cùng từ event trước đó
        if (e.changedTouches.length >= 1 && initialPinchDistance > 0) {
            // Tạm tính: nếu touchend thì dùng hướng ngược lại
            // Dùng cách đơn giản hơn: toggle khi phát hiện pinch 2 ngón
            container.classList.toggle("video-fill");
            
            // Hiện thông báo cho user biết
            const isFill = container.classList.contains("video-fill");
            if (typeof showNotification === "function") {
                showNotification(
                    isFill ? "📐 Lắp đầy màn hình" : "📐 Vừa vặn màn hình",
                    "info"
                );
            }
        }
        initialPinchDistance = 0;
    }, { passive: true });
})();

// Lắng nghe sự kiện fullscreenchange để đồng bộ icon
document.addEventListener("fullscreenchange", function() {
    const icon = document.querySelector("#fullscreenBtn i");
    if (icon) {
        icon.className = document.fullscreenElement ? "fas fa-compress" : "fas fa-expand";
    }
});
document.addEventListener("webkitfullscreenchange", function() {
    const icon = document.querySelector("#fullscreenBtn i");
    if (icon) {
        icon.className = document.webkitFullscreenElement ? "fas fa-compress" : "fas fa-expand";
    }
});

/**
 * Cập nhật lượt xem phim - Supabase
 */
async function updateMovieViews(movieId) {
  if (!supabase) return;

  try {
    // Tăng lượt xem (Dùng RPC nếu có, hoặc fetch then update)
    // 👇 3. LOGIC MỚI: TĂNG LƯỢT XEM (Supabase) 👇
  if (!window.viewedMovies) window.viewedMovies = new Set();
  if (!window.viewedMovies.has(movieId)) {
    window.viewedMovies.add(movieId);
    // Thực hiện cập nhật lượt xem lên Supabase
    const movie = allMovies.find(m => m.id === movieId);
    const currentViews = (movie && movie.views) ? movie.views : 0;
    
    await supabase
      .from('movies')
      .update({
        views: currentViews + 1,
      })
      .eq('id', movieId);
      
    if (movie) movie.views = currentViews + 1;
  }    
  } catch (error) {
    console.error("Lỗi cập nhật views lên Supabase:", error);
  }
}

// ============================================
// PAYMENT / BUY TICKET
// ============================================

/**
 * Mua vé xem phim
 */
async function buyTicket() {
  if (!currentUser) {
    showNotification("Vui lòng đăng nhập để mua vé!", "warning");
    openAuthModal();
    return;
  }

  const movie = allMovies.find((m) => m.id === currentMovieId);
  if (!movie) {
    showNotification("Không tìm thấy thông tin phim!", "error");
    return;
  }

  // Kiểm tra đã mua chưa
  const alreadyPurchased = await checkMoviePurchased(currentMovieId);
  if (alreadyPurchased) {
    showNotification("Bạn đã mua vé phim này rồi!", "info");
    checkAndUpdateVideoAccess();
    return;
  }

  // Kiểm tra phim miễn phí
  if (!movie.price || movie.price === 0) {
    showNotification("Phim này miễn phí! Không cần mua vé.", "info");
    checkAndUpdateVideoAccess();
    return;
  }

  // Hiển thị thông báo đang xử lý
  showNotification("Đang kết nối ví MetaMask...", "info");

  // Thực hiện thanh toán - payWithCRO sẽ tự động kết nối ví nếu chưa kết nối
  try {
    const txHash = await payWithCRO(movie.price, currentMovieId, movie.title);

    if (txHash) {
      // Thanh toán thành công - mở khóa video
      await checkAndUpdateVideoAccess();
    } else {
      // Thanh toán thất bại hoặc bị hủy
      showNotification("Thanh toán thất bại hoặc bị hủy. Vui lòng thử lại!", "warning");
    }
  } catch (error) {
    console.error("Lỗi thanh toán:", error);
    showNotification("Đã xảy ra lỗi khi thanh toán. Vui lòng thử lại!", "error");
  }
}
/**
 * Load bình luận từ Supabase
 */
async function loadComments(movieId) {
  const container = document.getElementById("commentsList");
  if (!container) return;

  try {
    if (!supabase) return;

    const { data: commentsData, error } = await supabase
      .from('comments')
      .select('*, profiles(display_name, avatar)')
      .eq('movie_id', movieId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    let comments = commentsData.map(c => ({
      id: c.id,
      movieId: c.movie_id,
      userId: c.user_id,
      parentId: c.parent_id,
      content: c.content,
      rating: c.rating,
      reactions: c.reactions || {},
      reactionSummary: c.reaction_summary || {},
      userName: c.profiles?.display_name || "Người dùng",
      userAvatar: c.profiles?.avatar || "",
      createdAt: { toDate: () => new Date(c.created_at) }
    }));

    // --- LOGIC SẮP XẾP BÌNH LUẬN THEO CẤP CHA - CON ---
    if (comments.length === 0) {
      container.innerHTML =
        '<p class="text-center text-muted">Chưa có bình luận nào. Hãy là người đầu tiên!</p>';
      return;
    }

    // 1. Tạo Map để tìm nhanh
    const commentMap = {};
    comments.forEach((c) => {
      c.children = []; // Tạo mảng chứa con
      commentMap[c.id] = c;
    });

    // 2. Phân loại Cha và Con
    const rootComments = [];
    comments.forEach((c) => {
      if (c.parentId && commentMap[c.parentId]) {
        // Nếu có cha -> Đẩy vào mảng children của cha
        commentMap[c.parentId].children.push(c);
        // Sắp xếp con theo thời gian tăng dần (cũ nhất ở trên)
        commentMap[c.parentId].children.sort(
          (a, b) => a.createdAt.toDate() - b.createdAt.toDate(),
        );
      } else {
        // Nếu không có cha -> Là gốc
        rootComments.push(c);
      }
    });

    // 3. Render
    container.innerHTML = rootComments
      .map((comment) => createCommentHtml(comment))
      .join("");
  } catch (error) {
    console.error("Lỗi load comments từ Supabase:", error);
    container.innerHTML =
      '<p class="text-center text-muted">Không thể tải bình luận</p>';
  }
}

/**
 * Tạo HTML cho comment
 */
function createCommentHtml(comment) {
  const initial = (comment.userName || "U")[0].toUpperCase();

  // Xử lý thời gian: Hiển thị cả tương đối và chi tiết
  let timeDisplay = "Vừa xong";
  if (comment.createdAt?.toDate) {
    const dateObj = comment.createdAt.toDate();
    timeDisplay = `${formatTimeAgo(dateObj)} <span style="opacity: 0.6; font-size: 10px; margin-left: 5px;">• ${formatDateTime(dateObj)}</span>`;
  }

  const deleteBtn =
    isAdmin || (currentUser && currentUser.id === comment.userId)
      ? `<button class="btn btn-sm btn-danger" onclick="deleteComment('${comment.id}')">
               <i class="fas fa-trash"></i>
           </button>`
      : "";

  // Hiển thị Avatar nếu có, ngược lại hiển thị chữ cái đầu
  const avatarHtml =
    comment.userAvatar && comment.userAvatar.startsWith("http")
      ? `<img src="${comment.userAvatar}" class="comment-avatar" style="object-fit: cover;" alt="${initial}" onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=random'">`
      : `<div class="comment-avatar">${initial}</div>`;

  // Xử lý hiển thị các bình luận con (Đệ quy + Ẩn bớt)
  let childrenHtml = "";
  let showRepliesBtn = "";

  if (comment.children && comment.children.length > 0) {
    // Wrap mỗi child trong div ẩn (class hidden-reply)
    const renderedChildren = comment.children
      .map(
        (child) =>
          `<div class="reply-node hidden-reply">${createCommentHtml(child)}</div>`,
      )
      .join("");

    childrenHtml = `<div class="replies-list" id="replies-list-${comment.id}">
            ${renderedChildren}
         </div>`;

    // Nút xem thêm (Show more)
    showRepliesBtn = `
        <div class="replies-controls">
            <button class="btn-show-replies" id="btn-show-${comment.id}" onclick="loadMoreReplies('${comment.id}')">
                <i class="fas fa-caret-down"></i> <span>Xem ${comment.children.length} câu trả lời</span>
            </button>
            <button class="btn-hide-replies" id="btn-hide-${comment.id}" onclick="hideAllReplies('${comment.id}')">
                <i class="fas fa-eye-slash"></i> Ẩn tất cả
            </button>
        </div>
      `;
  }

  return `
        <div class="comment-item" id="comment-${comment.id}">
            ${avatarHtml}
            <div class="comment-content">
                <div class="comment-header">
                    <span class="comment-author">${comment.userName || "Ẩn danh"}</span>
                    <span class="comment-rating">
                        ${comment.rating ? `<i class="fas fa-star"></i> ${comment.rating}/10` : ""}
                    </span>
                </div>
                <p class="comment-text">${escapeHtml(comment.content)}</p>
                <div class="comment-actions">
                    <div class="comment-time">${timeDisplay}</div>
                    
                    <div class="comment-reaction-container">
                        <div class="reaction-picker" id="picker-${comment.id}">
                            <span class="reaction-emoji-item" onclick="toggleCommentReaction('${comment.id}', 'like', currentMovieId, 'commentsList')">👍</span>
                            <span class="reaction-emoji-item" onclick="toggleCommentReaction('${comment.id}', 'heart', currentMovieId, 'commentsList')">❤️</span>
                            <span class="reaction-emoji-item" onclick="toggleCommentReaction('${comment.id}', 'haha', currentMovieId, 'commentsList')">😂</span>
                            <span class="reaction-emoji-item" onclick="toggleCommentReaction('${comment.id}', 'wow', currentMovieId, 'commentsList')">😮</span>
                            <span class="reaction-emoji-item" onclick="toggleCommentReaction('${comment.id}', 'sad', currentMovieId, 'commentsList')">😢</span>
                            <span class="reaction-emoji-item" onclick="toggleCommentReaction('${comment.id}', 'angry', currentMovieId, 'commentsList')">😡</span>
                        </div>
                        <button class="btn-reaction-trigger ${((currentUser && comment.reactions && comment.reactions[currentUser.id]) ? 'active' : '')}" 
                                onclick="toggleReactionPicker('${comment.id}')">
                            <i class="far fa-thumbs-up"></i> Thích
                        </button>
                    </div>

                    ${renderReactionSummaryHtml(comment.id, comment.reactionSummary)}

                    <button class="btn-reply" onclick="toggleReplyForm('${comment.id}')">Trả lời</button>
                    <div style="margin-left:auto;">${deleteBtn}</div>
                </div>
                
                <!-- Form trả lời ẩn -->
                <div id="reply-form-${comment.id}" class="reply-form-container">
                    <div class="reply-input-group">
                        <input type="text" id="reply-input-${comment.id}" placeholder="Viết câu trả lời...">
                        <button class="btn btn-sm btn-primary" onclick="submitReply('${comment.id}')"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>

                <!-- Nút xem trả lời -->
                ${showRepliesBtn}

                <!-- Danh sách trả lời -->
                ${childrenHtml}
            </div>
        </div>
    `;
}

/**
 * Hàm hiển thị thêm 5 bình luận con (Load More)
 */
function loadMoreReplies(parentId) {
  const container = document.getElementById(`replies-list-${parentId}`);
  const btn = document.getElementById(`btn-show-${parentId}`);
  if (!container || !btn) return;

  // FIX: Thay querySelectorAll bằng children để chỉ lấy cấp con TRỰC TIẾP
  // Tránh trường hợp đếm nhầm các bình luận cấp cháu/chắt bên trong
  const hiddenItems = Array.from(container.children).filter(
    (node) =>
      node.classList.contains("reply-node") &&
      node.classList.contains("hidden-reply"),
  );

  if (hiddenItems.length === 0) {
    btn.style.display = "none";
    // Nếu không còn gì để hiện thì hiện nút ẩn (phòng hờ)
    const hideBtn = document.getElementById(`btn-hide-${parentId}`);
    if (hideBtn) hideBtn.style.display = "flex";
    return;
  }

  // Show 5 item tiếp theo
  let count = 0;
  hiddenItems.forEach((item, index) => {
    if (index < 5) {
      item.classList.remove("hidden-reply");
      item.style.animation = "fadeIn 0.5s ease";
      count++;
    }
  });

  // Update nút (Nếu còn ẩn thì hiện số lượng còn lại, hết thì ẩn nút)
  const remaining = hiddenItems.length - count;
  if (remaining > 0) {
    btn.querySelector("span").textContent = `Xem thêm ${remaining} câu trả lời`;
    btn.style.display = "flex"; // Đảm bảo nút hiện nếu còn
  } else {
    // Đã hiện hết -> Ẩn nút Show đi (vì đã có nút Hide All bên cạnh)
    btn.style.display = "none";
  }

  // Luôn hiện nút Hide All khi đã mở ra
  const hideBtn = document.getElementById(`btn-hide-${parentId}`);
  if (hideBtn) hideBtn.style.display = "flex";
}

/**
 * Hàm ẩn tất cả bình luận con
 */
function hideAllReplies(parentId) {
  const container = document.getElementById(`replies-list-${parentId}`);
  const showBtn = document.getElementById(`btn-show-${parentId}`);
  const hideBtn = document.getElementById(`btn-hide-${parentId}`);

  if (!container) return;

  // Ẩn tất cả item
  const allItems = container.querySelectorAll(".reply-node");
  allItems.forEach((item) => item.classList.add("hidden-reply"));

  // Reset nút Show về trạng thái ban đầu
  if (showBtn) {
    showBtn.style.display = "flex"; // Đảm bảo hiện lại nút Show

    // FIX: Chỉ đếm số lượng con trực tiếp để hiển thị đúng số lượng trên nút
    const directCount = Array.from(container.children).filter((node) =>
      node.classList.contains("reply-node"),
    ).length;

    showBtn.innerHTML = `<i class="fas fa-caret-down"></i> <span>Xem ${directCount} câu trả lời</span>`;
  }

  // Ẩn nút Hide
  if (hideBtn) hideBtn.style.display = "none";

  // Cuộn nhẹ về bình luận cha để người dùng không bị lạc
  const parentComment = document.getElementById(`comment-${parentId}`);
  if (parentComment)
    parentComment.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * Bật/Tắt form trả lời
 */
function toggleReplyForm(commentId) {
  if (!currentUser) {
    showNotification("Vui lòng đăng nhập để trả lời!", "warning");
    openAuthModal();
    return;
  }

  // Đóng tất cả các form khác đang mở (nếu muốn)
  document
    .querySelectorAll(".reply-form-container")
    .forEach((el) => el.classList.remove("active"));

  const form = document.getElementById(`reply-form-${commentId}`);
  if (form) {
    form.classList.toggle("active");
    // Focus vào ô input
    if (form.classList.contains("active")) {
      setTimeout(
        () => document.getElementById(`reply-input-${commentId}`).focus(),
        100,
      );
    }
  }
}

/**
 * Gửi câu trả lời (Reply) lên Supabase
 */
async function submitReply(parentId) {
  if (!currentUser || !supabase) return;

  const input = document.getElementById(`reply-input-${parentId}`);
  const content = input.value.trim();

  if (!content) {
    showNotification("Vui lòng nhập nội dung!", "warning");
    return;
  }

  try {
    showLoading(true, "Đang gửi...");

    // 1. Lưu vào Supabase
    const { data, error } = await supabase
      .from('comments')
      .insert({
        movie_id: currentMovieId,
        parent_id: parentId,
        user_id: currentUser.id,
        content: content,
        rating: 0
      })
      .select('*, profiles(display_name, avatar)')
      .single();

    if (error) throw error;

    showNotification("Đã trả lời!", "success");
    input.value = "";
    toggleReplyForm(parentId);

    // 2. Cập nhật giao diện (Không reload trang)
    const newComment = {
      id: data.id,
      movieId: currentMovieId,
      parentId: parentId,
      userId: currentUser.id,
      userName: data.profiles?.display_name || "Bạn",
      userAvatar: data.profiles?.avatar || "",
      content: content,
      rating: 0,
      createdAt: { toDate: () => new Date() },
      children: [],
    };

    // Tạo HTML cho comment mới
    const replyHtml = `<div class="reply-node" style="animation: fadeIn 0.5s ease;">${createCommentHtml(newComment)}</div>`;
    const repliesListId = `replies-list-${parentId}`;
    let repliesList = document.getElementById(repliesListId);
    const parentCommentItem = document.getElementById(`comment-${parentId}`);

    if (repliesList) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = replyHtml;
      repliesList.appendChild(tempDiv.firstElementChild);

      const hideBtn = document.getElementById(`btn-hide-${parentId}`);
      if (hideBtn) hideBtn.style.display = "flex";

      const showBtn = document.getElementById(`btn-show-${parentId}`);
      if (showBtn) {
        const total = Array.from(repliesList.children).filter(node => node.classList.contains('reply-node')).length;
        const span = showBtn.querySelector("span");
        if (span) span.textContent = `Xem ${total} câu trả lời`;
      }
    } else {
      if (parentCommentItem) {
        const contentDiv = parentCommentItem.querySelector(".comment-content");
        const controlsHtml = `
                <div class="replies-controls">
                    <button class="btn-show-replies" id="btn-show-${parentId}" onclick="loadMoreReplies('${parentId}')" style="display:none;">
                        <i class="fas fa-caret-down"></i> <span>Xem 1 câu trả lời</span>
                    </button>
                    <button class="btn-hide-replies" id="btn-hide-${parentId}" onclick="hideAllReplies('${parentId}')" style="display:flex;">
                        <i class="fas fa-eye-slash"></i> Ẩn tất cả
                    </button>
                </div>
            `;
        const listHtml = `<div class="replies-list" id="replies-list-${parentId}">${replyHtml}</div>`;
        contentDiv.insertAdjacentHTML("beforeend", controlsHtml + listHtml);
      }
    }
  } catch (error) {
    console.error("Lỗi gửi reply lên Supabase:", error);
    showNotification("Lỗi gửi trả lời!", "error");
  } finally {
    showLoading(false);
  }
}

/**
 * Gửi bình luận lên Supabase
 */
async function submitComment() {
  if (!currentUser || !supabase) {
    showNotification("Vui lòng đăng nhập để bình luận!", "warning");
    if (!currentUser) openAuthModal();
    return;
  }

  const content = document.getElementById("commentContent").value.trim();

  if (!content) {
    showNotification("Vui lòng nhập nội dung bình luận!", "warning");
    return;
  }

  if (selectedRating === 0) {
    showNotification("Vui lòng chọn đánh giá!", "warning");
    return;
  }

  try {
    showLoading(true, "Đang gửi bình luận...");

    const { data, error } = await supabase
      .from('comments')
      .insert({
        movie_id: currentMovieId,
        user_id: currentUser.id,
        content: content,
        rating: selectedRating
      });

    if (error) throw error;

    // Reset form
    document.getElementById("commentContent").value = "";
    selectedRating = 0;
    updateRatingStars(0);
    document.getElementById("ratingValue").textContent = "0/10";

    // Reload comments
    await loadComments(currentMovieId);

    // Cập nhật rating trung bình của phim
    await updateMovieRating(currentMovieId);

    showNotification("Đã gửi bình luận!", "success");
  } catch (error) {
    console.error("Lỗi gửi comment lên Supabase:", error);
    showNotification("Không thể gửi bình luận!", "error");
  } finally {
    showLoading(false);
  }
}

/**
 * Xóa bình luận trên Supabase
 */
async function deleteComment(commentId) {
  if (!await customConfirm("Bạn có chắc muốn xóa bình luận này?", { title: "Xóa bình luận", type: "danger", confirmText: "Xóa" })) return;

  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) throw error;

    // Remove from DOM
    const commentEl = document.getElementById(`comment-${commentId}`);
    if (commentEl) {
      commentEl.remove();
      showNotification("Đã xóa bình luận", "success");
    }
  } catch (error) {
    console.error("Lỗi xóa comment trên Supabase:", error);
    showNotification("Lỗi xóa bình luận", "error");
  }
}

// --- GLOBAL FUNCTIONS FOR HTML5 CONTROLS ---


/**
 * Cập nhật rating trung bình của phim từ Supabase
 */
async function updateMovieRating(movieId) {
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('comments')
      .select('rating')
      .eq('movie_id', movieId)
      .not('rating', 'is', null)
      .gt('rating', 0);

    if (error || !data || data.length === 0) return;

    const ratings = data.map((c) => c.rating);
    const avgRating = (
      ratings.reduce((a, b) => a + b, 0) / ratings.length
    ).toFixed(1);

    await supabase
      .from('movies')
      .update({
        rating: parseFloat(avgRating),
      })
      .eq('id', movieId);
      
    // Cập nhật lại cache local
    const movie = allMovies.find(m => m.id === movieId);
    if (movie) movie.rating = parseFloat(avgRating);
    
  } catch (error) {
    console.error("Lỗi cập nhật rating từ Supabase:", error);
  }
}

// ============================================
// WATCH HISTORY & NAVIGATION HANDLING
// ============================================

/**
 * Dừng video và lưu lịch sử khi rời khỏi trang chiếu phim
 */
async function handleMoviePageExit() {
    // Xóa class chế độ rạp phim khi rời trang (áp dụng cho mọi trường hợp)
    document.body.classList.remove("cinema-mode", "controls-visible");
    
    // Reset các nút switch về trạng thái mặc định
    const switches = ["swCinemaMode", "swReaction", "swStrange", "swNextEpisode", "swAntiLe"];
    switches.forEach(id => {
        const sw = document.getElementById(id);
        if (sw) {
            if (id === "swNextEpisode") {
                sw.classList.remove("off");
                sw.classList.add("on");
                sw.textContent = "ON";
            } else {
                sw.classList.remove("on");
                sw.classList.add("off");
                sw.textContent = "OFF";
            }
        }
    });

    if (!currentMovieId || !currentUser) {
        stopVideo();
        return;
    }
    
    // Lấy thời gian hiện tại của video
    const currentVideoTime = getCurrentVideoTime();
    const currentVideoDuration = getCurrentVideoDuration();
    
    // Chỉ lưu nếu đã xem > 10 giây
    if (currentVideoTime > 10 && currentVideoDuration > 0) {
        // Lưu progress NGAY (không debounce)
        await saveWatchProgressImmediate(currentMovieId, currentEpisode, currentVideoTime, currentVideoDuration);
        
        // Cập nhật lịch sử với thời gian đã xem - LƯU LUÔN không cần kiểm tra phút
        await updateWatchHistoryWithTime(currentMovieId, currentEpisode, currentVideoTime);
        
        console.log(`📤 Đã lưu lịch sử khi rời đi: ${Math.floor(currentVideoTime / 60)} phút (${Math.round(currentVideoTime)} giây)`);
    }
    
    // Dừng video - CHỈ thực hiện nếu KHÔNG chuyển sang Mini Player
    if (typeof isMiniPlayerActive !== 'undefined' && isMiniPlayerActive) {
        console.log("📺 Mini Player đang chạy, giữ lại luồng video.");
        return;
    }

    stopVideo();
}

/**
 * Lấy thời gian hiện tại của video đang chơi
 */
function getCurrentVideoTime() {
    // Kiểm tra YouTube player
    const iframePlayer = document.getElementById("videoPlayer");
    if (iframePlayer && iframePlayer.src && iframePlayer.src.includes('youtube.com/embed')) {
        // YouTube player - cần tracking riêng
        // Lưu ý: YouTube embed không dùng IFrame API nên không lấy được currentTime
        // Giải pháp: parse từ URL hoặc dùng default
        return window.currentVideoTime || 0;
    }
    
    // Kiểm tra HTML5 player - lấy thời gian bất kể video đang chơi hay dừng
    const html5Player = document.getElementById("html5Player");
    if (html5Player) {
        // Lấy thời gian hiện tại của video (không cần kiểm tra paused)
        const currentTime = html5Player.currentTime || 0;
        console.log("📍 HTML5 currentTime:", currentTime, "paused:", html5Player.paused);
        return currentTime;
    }
    
    return 0;
}

/**
 * Lấy tổng thời lượng video
 */
function getCurrentVideoDuration() {
    const html5Player = document.getElementById("html5Player");
    if (html5Player) {
        return html5Player.duration || 0;
    }
    return 0;
}

/**
 * Dừng video đang chơi
 */
function stopVideo() {
    // Dừng HTML5 player
    const html5Player = document.getElementById("html5Player");
    if (html5Player) {
        html5Player.pause();
    }
    
    // Dừng YouTube player (nếu có)
    if (window.ytPlayer && typeof window.ytPlayer.pauseVideo === 'function') {
        try {
            window.ytPlayer.pauseVideo();
        } catch(e) {}
    }
    
    // Clear Iframe src to completely stop background logic for embed types
    const iframePlayer = document.getElementById("videoPlayer");
    if (iframePlayer) {
        iframePlayer.src = "";
    }
    
    console.log("⏹️ Video đã dừng");
}

/**
 * Cập nhật lịch sử xem với thời gian đã xem (phút) - Supabase
 */
async function updateWatchHistoryWithTime(movieId, episodeIndex, currentTime) {
    if (!currentUser || !supabase || !movieId) return;
    
    const minutesWatched = Math.floor(currentTime / 60);
    const percentage = Math.round((currentTime / 60) * 100); // Ước tính dựa trên 60 phút
    
    try {
        const { error } = await supabase
            .from('watch_history')
            .upsert({
                user_id: currentUser.id,
                movie_id: movieId,
                episode_index: episodeIndex,
                resume_time: currentTime,
                updated_at: new Date().toISOString(),
                last_watched_at: new Date().toISOString()
            }, { onConflict: 'user_id,movie_id' });
        
        if (error) throw error;
        
        console.log(`✅ Đã cập nhật lịch sử: ${movieId} - Tập ${episodeIndex + 1} - ${minutesWatched} phút`);
        
        // ✅ CẬP NHẬT UI PROGRESS BAR NGAY LẬP TỨC
        if (typeof updateMovieProgressUI === 'function') {
            updateMovieProgressUI(movieId, percentage);
        }
    } catch (error) {
        console.error("Lỗi cập nhật lịch sử lên Supabase:", error);
    }
}

/**
 * Kiểm tra và hiển thị modal hỏi xem tiếp khi vào trang phim
 * NOTE: Chỉ hoạt động với video m3u8 và mp4, không hoạt động với YouTube
 */
async function checkAndShowContinueWatchingModal() {
    if (!currentUser || !currentMovieId || !supabase) return;
    
    // ✅ [SWITCH VERSION] Nếu đang chuyển version (Vietsub/Thuyết minh/Dự phòng) → bỏ qua modal, không resume
    if (window.isSwitchingVersion) {
        console.log("🔄 Đang chuyển version, bỏ qua modal hỏi xem tiếp...");
        window.isSwitchingVersion = false;
        // Reset resume data để video load bình thường, không auto-resume
        window.hasResumeHistory = false;
        window.resumeTimeData = null;
        return;
    }
    
    // ✅ [SWITCH SERVER] Nếu đang chuyển server → dùng thời gian local, hiện modal hỏi xem tiếp
    if (window.isSwitchingSourceOrServer && window.switchResumeTime > 10) {
        const localTime = window.switchResumeTime;
        const localMinutes = Math.floor(localTime / 60);
        const localSeconds = Math.floor(localTime % 60);
        console.log(`🔄 Chuyển server - hỏi xem tiếp tại ${localMinutes}:${String(localSeconds).padStart(2, '0')}`);
        
        // Reset flag ngay lập tức
        window.isSwitchingSourceOrServer = false;
        window.switchResumeTime = 0;
        
        // Hiện modal hỏi xem tiếp với thời gian local chính xác
        showContinueWatchingModal(localMinutes, currentEpisode, localTime);
        return;
    }
    // Reset flag nếu thời gian quá nhỏ (< 10s) → không hiện modal, xem từ đầu
    if (window.isSwitchingSourceOrServer) {
        window.isSwitchingSourceOrServer = false;
        window.switchResumeTime = 0;
        return;
    }
    
    // Kiểm tra nếu đã kiểm tra rồi thì bỏ qua
    if (window.hasCheckedResumeHistory) {
        console.log("⚠️ Đã kiểm tra lịch sử rồi, bỏ qua...");
        return;
    }
    window.hasCheckedResumeHistory = true;

    // ✅ [SEAMLESS] Bỏ qua modal nếu chính là phim này đang phát ở Mini Player (hoặc vừa tắt mini player để về trang detail)
    const isMiniActive = (typeof isMiniPlayerActive !== 'undefined' && isMiniPlayerActive);
    const isSameEpisode = (typeof window.miniPlayerEpisodeIndex !== 'undefined' && window.miniPlayerEpisodeIndex === currentEpisode);
    const isSeamless = (window.isSeamlessTransition === true);

    if ((isMiniActive || isSeamless) && isSameEpisode) {
        console.log("🎥 [SEAMLESS] Video is already playing in Mini Player (or just resumed), skipping resume modal.");
        window.isSeamlessTransition = false; // Reset flag
        return;
    }
    window.isSeamlessTransition = false; // Reset flag nếu không thỏa mãn
    
    // Biến toàn cục để track có cần resume không
    window.hasResumeHistory = false;
    window.resumeTimeData = null;
    
    try {
        const { data, error } = await supabase
            .from('watch_history')
            .select('episode_index, resume_time, duration')
            .eq('user_id', currentUser.id)
            .eq('movie_id', currentMovieId)
            .single();
        
        if (data) {
            const minutesWatched = Math.floor((data.resume_time || 0) / 60);
            const lastEpisode = data.episode_index || 0;
            const lastTimeWatched = data.resume_time || 0;
            
            // ✅ SỬA: Ưu tiên dùng resumeFromTime nếu có (từ click lịch sử)
            let timeToResume = 0;
            let resumeEpisode = lastEpisode;
            if (window.resumeFromTime && window.resumeFromTime > 0) {
                // Click từ lịch sử - dùng thời gian được truyền vào
                timeToResume = window.resumeFromTime;
                resumeEpisode = window.resumeFromEpisode || lastEpisode;
                console.log("⏳ Phát hiện click từ lịch sử, set resume data:", window.resumeFromTime, "tập:", resumeEpisode + 1);
                window.hasResumeHistory = true;
                window.resumeTimeData = {
                    timeWatched: window.resumeFromTime,
                    episodeIndex: resumeEpisode,
                    minutesWatched: Math.floor(window.resumeFromTime / 60)
                };
                
                if (currentEpisode !== resumeEpisode) {
                    selectEpisode(resumeEpisode);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
                
                // ✅ Xóa cờ sau khi đã sử dụng
                window.resumeFromTime = 0;
                window.resumeFromEpisode = 0;
                
                return;
            }
            
            // ✅ Hiện modal cho TẤT CẢ thể loại Video (hls, mp4, youtube, embed...)
            if (lastTimeWatched > 10) {
                // Lưu data để sử dụng
                window.hasResumeHistory = true;
                window.resumeTimeData = {
                    timeWatched: lastTimeWatched,
                    episodeIndex: lastEpisode,
                    minutesWatched: minutesWatched
                };
                
                // Nếu đang ở tập khác với tập đã xem, chuyển tập
                if (currentEpisode !== lastEpisode) {
                    selectEpisode(lastEpisode);
                    // Đợi video load xong rồi mới hiển thị modal (1.5 giây)
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
                
                // Hiển thị modal hỏi xem tiếp
                showContinueWatchingModal(minutesWatched, lastEpisode, lastTimeWatched);
                return true;
            }
        }
    } catch (error) {
        console.error("Lỗi kiểm tra lịch sử từ Supabase:", error);
    }
    
    return false;
}

/**
 * Hiển thị modal hỏi xem tiếp
 */
function showContinueWatchingModal(minutesWatched, episodeIndex, timeWatched) {
    // Kiểm tra nếu modal đang hiển thị rồi thì không tạo lại
    let modal = document.getElementById("continueWatchingModal");
    if (modal && modal.classList.contains('active')) {
        console.log("⚠️ Modal đang hiển thị, bỏ qua...");
        return;
    }
    
    // Tạo modal nếu chưa tồn tại
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "continueWatchingModal";
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px;">
                <h3 style="margin-bottom: 15px;">Tiếp tục xem?</h3>
                <p style="color: #888; margin-bottom: 20px;">
                    Bạn đã xem <span id="continueWatchMinutes" style="color: #fcd535; font-weight: bold;">0</span> phút 
                    tập <span id="continueWatchEpisode" style="color: #fcd535; font-weight: bold;">1</span>
                </p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button class="btn btn-primary" onclick="handleContinueWatching(true)">
                        <i class="fas fa-play"></i> Xem tiếp
                    </button>
                    <button class="btn btn-secondary" onclick="handleContinueWatching(false)">
                        <i class="fas fa-redo"></i> Xem lại
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Cập nhật thông tin
    document.getElementById("continueWatchMinutes").textContent = minutesWatched;
    document.getElementById("continueWatchEpisode").textContent = episodeIndex + 1;
    
    // Lưu data để xử lý
    modal.dataset.timeWatched = timeWatched;
    modal.dataset.episodeIndex = episodeIndex;
    
    // Hiển thị modal
    openModal("continueWatchingModal");
}

window.handleContinueWatching = function(continueWatch) {
    const modal = document.getElementById("continueWatchingModal");
    if (!modal) return;
    
    const timeWatched = parseFloat(modal.dataset.timeWatched) || 0;
    const episodeIndex = parseInt(modal.dataset.episodeIndex) || 0;
    
    // Ẩn modal
    closeModal("continueWatchingModal");
    
    console.log("🎬 handleContinueWatching:", continueWatch, "timeWatched:", timeWatched, "episode:", episodeIndex);
    
    if (continueWatch && timeWatched > 0) {
        // ✅ Thêm delay nhỏ để modal đóng hoàn toàn trước khi resume
        setTimeout(() => {
            // Nếu cần chuyển tập, chuyển trước rồi mới phát
            if (currentEpisode !== episodeIndex) {
                console.log("🔄 Chuyển sang tập:", episodeIndex + 1);
                selectEpisode(episodeIndex);
                // Đợi video load xong rồi mới seek và phát
                setTimeout(() => {
                    resumeVideoAtTime(timeWatched);
                }, 2000);
            } else {
                // Đang ở đúng tập - KIỂM TRA TRỰC TIẾP player nào đang hiện
                const html5Player = document.getElementById("html5Player");
                const iframePlayer = document.getElementById("videoPlayer");
                
                console.log("▶️ Resume tại tập hiện tại, html5 visible:", html5Player && !html5Player.classList.contains('hidden'));
                
                // Kiểm tra player nào đang hiện
                if (html5Player && !html5Player.classList.contains('hidden')) {
                    // HTML5 Player (HLS/MP4) đang hiện - sử dụng resumeVideoAtTime
                    resumeVideoAtTime(timeWatched);
                } else {
                    // YouTube/Iframe đang hiện - reload với start parameter
                    reloadYouTubeWithStart(timeWatched);
                }
            }
        }, 100); // Delay nhỏ để modal kịp đóng
    } else {
        // Xem lại từ đầu - xóa progress và phát lại từ đầu
        clearWatchProgress(currentMovieId);
        
        // Reset video về 0 và phát lại từ đầu
        const html5Player = document.getElementById("html5Player");
        if (html5Player && !html5Player.classList.contains('hidden')) {
            html5Player.currentTime = 0;
            html5Player.play().catch(e => console.error("Play error:", e));
            console.log("✅ Xem từ đầu - reset về 0 giây");
        } else {
            // YouTube - reload về 0
            reloadYouTubeWithStart(0);
        }
    }
};

/**
 * Reload YouTube/iframe với thời gian bắt đầu cụ thể
 */
function reloadYouTubeWithStart(startTime) {
    const iframePlayer = document.getElementById("videoPlayer");
    if (!iframePlayer || !iframePlayer.src) {
        console.log("⚠️ iframePlayer không tồn tại hoặc chưa có src");
        return;
    }
    
    // Trích xuất video ID từ URL hiện tại
    const currentSrc = iframePlayer.src;
    let videoId = "";
    let embedUrl = "";
    
    // YouTube
    if (currentSrc.includes("youtube.com/embed/")) {
        const match = currentSrc.match(/youtube\.com\/embed\/([^?]+)/);
        if (match && match[1]) {
            videoId = match[1];
            // Xây dựng URL mới với start parameter
            let newUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&enablejsapi=1&origin=${window.location.origin}`;
            if (startTime > 0) {
                newUrl += `&start=${Math.floor(startTime)}`;
            }
            embedUrl = newUrl;
        }
    }
    // OK.RU
    else if (currentSrc.includes("ok.ru/videoembed/")) {
        const match = currentSrc.match(/ok\.ru\/videoembed\/([^?]+)/);
        if (match && match[1]) {
            embedUrl = `https://ok.ru/videoembed/${match[1]}?autoplay=1`;
        }
    }
    // Google Drive
    else if (currentSrc.includes("drive.google.com/file/d/")) {
        const match = currentSrc.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        if (match && match[1]) {
            embedUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
        }
    }
    
    if (embedUrl) {
        console.log("🔄 Reload iframe với start=", startTime, "URL:", embedUrl);
        iframePlayer.src = embedUrl;
    } else {
        console.log("⚠️ Không thể trích xuất video ID từ:", currentSrc);
    }
}

/**
 * Resume video at specific time (for both HTML5 and YouTube)
 */
function resumeVideoAtTime(timeWatched) {
    console.log("📍 Resume video at:", timeWatched, "seconds", "(" + formatTime(timeWatched) + ")");
    
    const html5Player = document.getElementById("html5Player");
    if (html5Player) {
        // HTML5 Player - đợi video ready rồi mới set time
        const doResume = () => {
            // Chỉ đặt thời gian nếu độ lệch quá 2 giây, tránh giật/khựng Playback do gán đè
            if (Math.abs(html5Player.currentTime - timeWatched) > 2) {
                html5Player.currentTime = timeWatched;
            }
            
            // Lấy trạng thái Pause từ localStorage định hướng
            const intentPause = (typeof currentMovieId !== 'undefined') && localStorage.getItem('intentPause_' + currentMovieId) === 'true';
            const localPause = (typeof currentMovieId !== 'undefined') && localStorage.getItem('localVideoState_' + currentMovieId) === 'paused';
            
            // XÁC ĐỊNH LIỆU CÓ NÊN PHÁT HAY KHÔNG
            if (window.videoWasPausedBeforeHidden || intentPause || localPause) {
                 html5Player.pause();
                 console.log("✅ Cập nhật time:", formatTime(timeWatched), "(Giữ trạng thái Gián đoạn/Dừng)");
                 if (typeof updatePlayIcons === 'function') updatePlayIcons(false);
            } else {
                 if (window.isResumingFromHidden) {
                     console.log("✅ OS Auto-resuming, skip manual play() to prevent buffering jitter.");
                 } else {
                     html5Player.play().then(() => {
                         console.log("✅ Tiếp tục xem HTML5 từ:", formatTime(timeWatched));
                     }).catch(e => {
                         console.error("Play error:", e);
                     });
                 }
            }
        };
        
        // Kiểm tra readyState - cần ít nhất HAVE_CURRENT_DATA (2) trở lên
        if (html5Player.readyState >= 2) {
            doResume();
        } else {
            // Video chưa ready, đợi event loadeddata
            html5Player.addEventListener('loadeddata', function onLoaded() {
                html5Player.removeEventListener('loadeddata', onLoaded);
                // Đợi thêm một chút để video ready hoàn toàn
                setTimeout(doResume, 100);
            }, { once: true });
        }
    } else {
        // YouTube Player
        seekYouTubeVideo(timeWatched);
    }
}

/**
 * Seek YouTube video to specific time
 */
function seekYouTubeVideo(time) {
    if (window.ytPlayer && typeof window.ytPlayer.seekTo === 'function') {
        try {
            window.ytPlayer.seekTo(time, true);
            window.ytPlayer.playVideo();
        } catch(e) {
            console.error("YouTube seek error:", e);
        }
    }
}

// Override showPage to handle movie page exit
const originalShowPage = window.showPage;
window.showPage = async function(pageName, addToHistory = true) {
    // Nếu đang ở trang chi tiết phim và chuyển sang trang khác
    const movieDetailPage = document.getElementById("movieDetailPage");
    if (movieDetailPage && movieDetailPage.classList.contains("active") && pageName !== "movieDetail" && pageName !== "watch") {
        // [MỚI] Thử kích hoạt Mini Player TRƯỚC KHI dọn dẹp trang để giữ luồng video
        if (typeof enableMiniPlayer === 'function') {
            enableMiniPlayer();
        }
        await handleMoviePageExit();
    }
    
    // Gọi hàm showPage gốc
    if (originalShowPage) {
        originalShowPage(pageName, addToHistory);
    } else {
        // Fallback nếu không có hàm gốc
        document.querySelectorAll(".page").forEach((page) => {
            page.classList.remove("active");
        });
        const targetPage = document.getElementById(`${pageName}Page`);
        if (targetPage) {
            targetPage.classList.add("active");
        }
    }
};

// Thêm event listener cho Logo click
document.addEventListener("DOMContentLoaded", function() {
    const logoLink = document.querySelector('.nav-logo');
    if (logoLink) {
        logoLink.addEventListener("click", async function(e) {
            e.preventDefault();
            // Xử lý exit trước
            await handleMoviePageExit();
            // Sau đó chuyển về trang chủ
            showPage('home');
        });
    }
    
    // Thêm event listener cho navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener("click", async function(e) {
            // Chỉ xử lý nếu là link chuyển trang (có data-page)
            if (this.dataset.page) {
                const targetPage = this.dataset.page;
                const movieDetailPage = document.getElementById("movieDetailPage");
                
                if (movieDetailPage && movieDetailPage.classList.contains("active") && targetPage !== "movieDetail") {
                    await handleMoviePageExit();
                }
            }
        });
    });
    
    // Track YouTube video time
    window.currentVideoTime = 0;
    
    // YouTube API callback
    window.onYouTubeIframeAPIReady = function() {
        window.ytPlayer = new YT.Player('videoPlayer', {
            events: {
                'onStateChange': function(event) {
                    // Update UI (Load/Play/Pause)
                    if (event.data === YT.PlayerState.BUFFERING) {
                         if (typeof updateDetailPlayButtonState === 'function') updateDetailPlayButtonState("loading");
                    } else if (event.data === YT.PlayerState.PLAYING) {
                         if (typeof updateDetailPlayButtonState === 'function') updateDetailPlayButtonState("playing");
                    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                         if (typeof updateDetailPlayButtonState === 'function') updateDetailPlayButtonState("paused");
                         
                         // Tự động chuyển tập cho YouTube
                         if (event.data === YT.PlayerState.ENDED) {
                             handleAutoNext();
                         }
                    }

                    // Track time when playing
                    if (event.data === YT.PlayerState.PLAYING) {
                        window.ytPlayerInterval = setInterval(function() {
                            if (window.ytPlayer && typeof window.ytPlayer.getCurrentTime === 'function') {
                                window.currentVideoTime = window.ytPlayer.getCurrentTime();
                            }
                        }, 1000);
                    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                        if (window.ytPlayerInterval) {
                            clearInterval(window.ytPlayerInterval);
                        }
                    }
                }
            }
        });
    };
});

console.log("✅ Watch History & Navigation Handling Loaded");

// Logic YouTube time tracking cũ đã được loại bỏ để dùng initCustomControls mới

let functionYouTubeMessageHandler = function(event) {
    try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        // Kiểm tra xem có phải từ YouTube không
        if (data && data.info) {
            if (data.info.currentTime !== undefined) {
                window.currentVideoTime = data.info.currentTime;
                // Kiểm tra đếm ngược chuyển tập cho YouTube
                if (data.info.duration) {
                    checkAutoNextCountdown(data.info.currentTime, data.info.duration);
                }
            }
            
            // PlayerState ENDED (0) trong message data
            if (data.info.playerState === 0) {
                handleAutoNext();
            }
        }
    } catch (e) {
        // Ignore parse errors
    }
};

/**
 * Hàm trung tâm xử lý Tự động chuyển tập (Auto Next)
 */
function handleAutoNext() {
    if (isAutoNexting) return;

    const sw = document.getElementById("swNextEpisode");
    if (!sw || !sw.classList.contains("on")) {
        console.log("⏭️ Tự động chuyển tập đang OFF, dừng.");
        return;
    }

    if (!currentMovieId) return;

    // Tìm thông tin phim hiện tại
    const movie = allMovies.find(m => m.id === currentMovieId);
    if (!movie || !movie.episodes) return;

    const totalEpisodes = movie.episodes.length;
    const nextEpisodeIndex = currentEpisode + 1;

    if (nextEpisodeIndex < totalEpisodes) {
        console.log(`🎬 [AUTO-NEXT] Đang tự động chuyển sang tập ${nextEpisodeIndex + 1}...`);
        
        // Hiển thị thông báo nhỏ cho người dùng
        if (typeof showNotification === 'function') {
            showNotification(`Hết tập. Đang chuyển sang tập ${nextEpisodeIndex + 1}...`, "info");
        }

        isAutoNexting = true;
        // Đợi 1 chút để UI kịp xử lý rồi mới chuyển
        setTimeout(() => {
            isAutoNexting = false;
            selectEpisode(nextEpisodeIndex);
        }, 1500);
    } else {
        console.log("🎬 [AUTO-NEXT] Đã là tập cuối cùng, không thể chuyển tiếp.");
        if (typeof showNotification === 'function') {
            showNotification("Bạn đã xem hết tập cuối cùng của bộ phim này.", "info");
        }
    }
}

/**
 * Kiểm tra và hiển thị thông báo đếm ngược 10 giây trước khi chuyển tập
 */
function checkAutoNextCountdown(currentTime, duration) {
    if (isCountdownNotified || isAutoNexting) return;

    const sw = document.getElementById("swNextEpisode");
    if (!sw || !sw.classList.contains("on")) return;

    // Chỉ thực hiện nếu còn khoảng 10 giây (sai số 1s)
    const timeLeft = duration - currentTime;
    if (timeLeft <= 10 && timeLeft > 0) {
        if (!currentMovieId) return;

        const movie = allMovies.find(m => m.id === currentMovieId);
        if (!movie || !movie.episodes) return;

        const totalEpisodes = movie.episodes.length;
        const nextEpisodeIndex = currentEpisode + 1;

        if (nextEpisodeIndex < totalEpisodes) {
            isCountdownNotified = true;
            const msg = `Chuẩn bị chuyển sang tập ${nextEpisodeIndex + 1} sau 10 giây...`;
            console.log(`⏳ [COUNTDOWN] ${msg}`);
            
            if (typeof showNotification === 'function') {
                showNotification(msg, "info");
            }
        }
    }
}

// ============================================
// PLAYER TOP BAR & EPISODE PANEL
// ============================================

/**
 * Cập nhật thông tin phim trên Top Bar (tên + tập)
 */
function updatePlayerTopBar() {
    const titleEl = document.getElementById("topBarTitle");
    const episodeEl = document.getElementById("topBarEpisode");
    const episodeBtn = document.getElementById("episodeListBtn");
    
    if (!titleEl) return;
    
    // Lấy tên phim từ detailTitle nếu có
    const detailTitleEl = document.getElementById("detailTitle");
    if (detailTitleEl) {
        titleEl.textContent = detailTitleEl.textContent || "Đang tải...";
    }
    
    // Xác định tập hiện tại
    if (typeof currentEpisode !== 'undefined' && currentEpisode !== null) {
        const epIndex = parseInt(currentEpisode);
        // Kiểm tra có phải phim bộ không
        const movieData = (typeof allMovies !== 'undefined') ? allMovies.find(m => m.id === currentMovieId) : null;
        if (movieData && movieData.type === 'series') {
            episodeEl.textContent = `Tập ${epIndex + 1}`;
            if (episodeBtn) episodeBtn.style.display = 'flex';
        } else {
            episodeEl.textContent = 'Phim lẻ';
            if (episodeBtn) episodeBtn.style.display = 'none';
        }

        // Cập nhật nút Next Tập trên thanh bar
        const ctrlNextEpBtn = document.getElementById('ctrlNextEpBtn');
        if (ctrlNextEpBtn) {
            if (movieData && movieData.episodes && epIndex + 1 < movieData.episodes.length) {
                ctrlNextEpBtn.style.display = "inline-block";
            } else {
                ctrlNextEpBtn.style.display = "none";
            }
        }
    }
}

/**
 * Render danh sách tập vào Episode Panel
 */
function renderEpisodePanel() {
    const panelList = document.getElementById("episodePanelList");
    if (!panelList) return;
    
    panelList.innerHTML = '';
    
    // Lấy danh sách tập từ dữ liệu phim hiện tại
    const movieData = (typeof allMovies !== 'undefined') ? allMovies.find(m => m.id === currentMovieId) : null;
    
    if (!movieData || !movieData.episodes || movieData.episodes.length === 0) {
        panelList.innerHTML = '<div style="color: rgba(255,255,255,0.5); padding: 16px; text-align: center;">Không có tập nào</div>';
        return;
    }
    
    const currentEpIndex = parseInt(currentEpisode) || 0;
    
    movieData.episodes.forEach((ep, index) => {
        const item = document.createElement('div');
        item.className = 'ep-panel-item' + (index === currentEpIndex ? ' active' : '');
        
        // Tên tập: Nếu có title thì dùng, không thì "Tập X"
        let epName = ep.title || `Tập ${index + 1}`;
        if (/^\d+$/.test(epName.toString().trim())) {
            epName = `Tập ${epName}`;
        }
        const epBg = ep.thumbnail || movieData.backgroundUrl || movieData.posterUrl || 'https://placehold.co/160x90/1a1a2e/FFF?text=No+Image';
        
        item.innerHTML = `
            <div class="ep-panel-img-wrapper">
                <img src="${epBg}" alt="${epName}" class="ep-panel-img" onerror="this.src='https://placehold.co/160x90/1a1a2e/FFF?text=No+Image'">
            </div>
            <div class="ep-panel-info">
                <span class="ep-panel-name">${epName}</span>
            </div>
        `;
        
        const changeEpHandler = (e) => {
            e.stopPropagation();
            // Đóng panel
            toggleEpisodePanel();
            // Chuyển tập
            if (typeof selectEpisode === 'function') {
                selectEpisode(index);
            } else if (typeof window.selectEpisode === 'function') {
                window.selectEpisode(index);
            }
        };
        
        item.addEventListener('click', changeEpHandler);
        
        panelList.appendChild(item);
    });
    
    // Cuộn đến tập đang xem
    setTimeout(() => {
        const activeItem = panelList.querySelector('.ep-panel-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, 100);
}

/**
 * Mở/Đóng Episode Panel (slide-in từ phải)
 */
window.toggleEpisodePanel = function() {
    const panel = document.getElementById("playerEpisodePanel");
    if (!panel) return;
    
    const isOpen = panel.classList.contains('open');
    
    if (isOpen) {
        panel.classList.remove('open');
    } else {
        // Render danh sách tập trước khi mở
        renderEpisodePanel();
        panel.classList.add('open');
        // Giữ controls hiện khi panel mở
        showControls();
    }
};

// ============================================
// VIEW MOVIE FROM HISTORY (With Resume Time)
// ============================================

/**
 * Xem phim từ lịch sử - chuyển đến phim và chiếu đúng phút đã lưu
 */
window.viewMovieFromHistory = async function(movieId, episodeIndex, timeWatched) {
    // Đóng modal library trước
    closeModal("libraryModal");
    
    // Đặt biến toàn cục để lưu thời gian cần resume
    window.resumeFromTime = timeWatched;
    window.resumeFromEpisode = episodeIndex;
    
    // Gọi hàm viewMovieDetail bình thường
    await viewMovieDetail(movieId);
    
    // Sau khi video load xong, sẽ tự động hiện modal hỏi xem tiếp
    // (Vì checkAndShowContinueWatchingModal đã được gọi trong viewMovieDetail)
};

// ============================================
// MOBILE LANDSCAPE FULLSCREEN HANDLING
// ============================================
// Đã gỡ bỏ: Tính năng tự động xoay ngang bật fullscreen
// Giữ lại biến để tránh lỗi reference
let userHasExitedLandscape = false;
function handleOrientationChange() { /* Đã vô hiệu hóa */ }
// Không đăng ký listener orientationchange và resize nữa

/**
 * Helper: Lưu tự động thời gian xem mới nhất của trang hiện tại
 */
window.saveCurrentWatchProgressImmediate = function() {
    if (!currentMovieId || typeof currentEpisode === 'undefined') return;
    let currentTime = 0;
    let duration = 0;
    
    const html5Player = document.getElementById("html5Player");
    if (html5Player && !html5Player.classList.contains('hidden') && html5Player.duration > 0) {
        currentTime = html5Player.currentTime;
        duration = html5Player.duration;
    } else if (window.ytPlayer && typeof window.ytPlayer.getCurrentTime === 'function') {
        try {
            currentTime = window.ytPlayer.getCurrentTime() || 0;
            duration = window.ytPlayer.getDuration() || 0;
        } catch(e) {}
    }
    
    if (currentTime > 0 && duration > 0) {
        saveWatchProgressImmediate(currentMovieId, currentEpisode, currentTime, duration);
    }
};

// Đảm bảo lưu lịch sử trước khi người dùng đóng trình duyệt hoặc load lại trang
window.addEventListener("beforeunload", () => {
    const detailPage = document.getElementById("page-detail"); // ID của detail section
    if (detailPage && !detailPage.classList.contains("hidden")) {
        window.saveCurrentWatchProgressImmediate();
    }
});

/**
 * Quay lại từ trang chi tiết (Watch page)
 * Ưu tiên quay lại trang Intro thay vì dựa vào lịch sử trình duyệt
 */
window.goBackFromDetail = function() {
    console.log("🔙 Đang xử lý nút quay lại từ trang Watch...");
    
    // [MOD] Không gọi pauseMainPlayer ở đây nữa để cho phép video chuyển thành Mini Player 
    // nếu người dùng đang xem dở (Logic này đã có trong showPage).

    // 2. Chuyển hướng tường minh: Nếu có currentMovieId, quay về Intro phim đó
    // Lưu ý: currentMovieId là biến toàn cục từ globals.js
    if (typeof currentMovieId !== 'undefined' && currentMovieId && typeof viewMovieIntro === 'function') {
        console.log("🎯 Quay lại trang Intro phim:", currentMovieId);
        viewMovieIntro(currentMovieId);
        return;
    }

    // 3. Fallback: Nếu không rõ phim nào, dùng history hoặc về Home
    if (window.history.length > 1) {
        window.history.back();
        return;
    }
    showPage('home');
}

/* --- TÍNH NĂNG MỚI: PHÂN TRANG & LIÊN QUAN --- */

/**
 * Render nút chọn phiên bản (Vietsub/Thuyết minh)
 */
/**
 * Render phim đề xuất (dựa trên thể loại/tags) - Hiển thị dưới cùng
 */
function renderRecommendedMovies(movie) {
  const container = document.getElementById("recommendedMoviesContainer");
  const list = document.getElementById("recommendedMoviesList");
  if (!container || !list) return;

  list.innerHTML = "";
  container.style.display = "none";
  
  if (!allMovies || allMovies.length === 0) return;

  // Safely parse category string or array into an array of lowercase strings
  const parseCategories = (cat) => {
      if (!cat) return [];
      if (typeof cat === 'string') {
          // Phân tách chuỗi bằng dấu phẩy, loại bỏ khoảng trắng dư và chuyển thành in thường
          return cat.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
      }
      if (Array.isArray(cat)) {
          return cat.map(c => typeof c === 'string' ? c : (c.name || '')).filter(Boolean).map(c => String(c).trim().toLowerCase());
      }
      return [];
  };

  const parseTags = (tags) => {
      if (!tags) return [];
      if (typeof tags === 'string') return tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      if (Array.isArray(tags)) return tags.map(t => String(t).trim().toLowerCase()).filter(Boolean);
      return [];
  };

  // Lấy danh sách thể loại và tags của phim hiện tại
  const currentCategories = parseCategories(movie.category);
  const currentTags = parseTags(movie.tags);

  if (currentCategories.length === 0 && currentTags.length === 0) return;

  // Tiêu chí: có chung ít nhất 1 thể loại hoặc tag
  let recommended = allMovies.reduce((acc, m) => {
      if (m.id === movie.id) return acc;
      
      const mCategories = parseCategories(m.category);
      const mTags = parseTags(m.tags);

      // Đếm số lượng thể loại và tag trùng khớp
      const commonCategoryCount = mCategories.filter(c => currentCategories.includes(c)).length;
      const commonTagCount = mTags.filter(t => currentTags.includes(t)).length;

      const score = commonCategoryCount + commonTagCount;

      if (score > 0) {
          acc.push({ movie: m, score: score });
      }
      return acc;
  }, []);

  // Sắp xếp theo điểm số (nhiều điểm chung hơn sẽ lên đầu)
  // Nếu điểm bằng nhau, xáo trộn ngẫu nhiên để danh sách đa dạng
  recommended.sort((a, b) => {
      if (b.score !== a.score) {
          return b.score - a.score;
      }
      return 0.5 - Math.random();
  });

  // Chỉ lấy đối tượng movie
  recommended = recommended.map(item => item.movie);

  // Giới hạn số lượng hiển thị (VD: 15 phim)
  recommended = recommended.slice(0, 15);

  if (recommended.length > 0) {
      container.style.display = "block";
      recommended.forEach(m => {
          const item = document.createElement("div");
          item.className = "related-part-item";
          item.style.minWidth = "110px";
          item.style.width = "110px";
          item.style.cursor = "pointer";
          item.style.textAlign = "center";
          
          item.innerHTML = `
              <div style="position: relative; aspect-ratio: 2/3; overflow: hidden; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 5px;">
                  <img src="${m.posterUrl || m.backgroundUrl || ''}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" onerror="this.src='https://placehold.co/200x300/1a1a2e/FFF?text=No+Image'">
              </div>
              <div style="font-size: 0.8rem; line-height: 1.2; color: #ccc; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</div>
          `;
          
          item.onclick = () => {
              viewMovieIntro(m.id);
          };
          list.appendChild(item);
      });
  }
}

/**
 * Render danh sách Server (Nguồn) - HIỆN TRƯỚC
 * Gom tất cả server duy nhất từ episode.sources, sau đó gọi renderDetailVersions cho server đang chọn
 */
function renderDetailServers(episode) {
    const row = document.getElementById("movieExtraControlsRow");
    const list = document.getElementById("serverListModern");
    const divider = document.getElementById("serverDivider");
    if (!row || !list) return;
    list.innerHTML = "";

    if (!episode) return;

    let sources = [];
    if (episode.sources && Array.isArray(episode.sources) && episode.sources.length > 0) {
        sources = episode.sources;
    } else if (episode.videoType) {
        sources = [{ label: "Bản gốc", type: episode.videoType, source: episode.videoSource || episode.youtubeId }];
    }

    if (sources.length === 0) {
        if (divider) divider.style.display = "none";
        // Ẩn version list
        const versionList = document.getElementById("versionListModern");
        if (versionList) versionList.innerHTML = "";
        return;
    }

    row.style.display = "block";

    // Gom TẤT CẢ server duy nhất từ toàn bộ sources
    const serverMap = new Map();
    sources.forEach(src => {
        const name = src.server || 'Unknown';
        if (!serverMap.has(name)) serverMap.set(name, src);
    });

    // Bảng thứ tự cố định theo nguồn API
    const SERVER_ORDER = { 'KKPhim': 1, 'OPhim': 2, 'NguonC': 3 };
    const sortedServers = [...serverMap.entries()].sort((a, b) => {
        return (SERVER_ORDER[a[0]] || 99) - (SERVER_ORDER[b[0]] || 99);
    });
    const sortedMap = new Map(sortedServers);

    // Xác định server đang chọn
    let preferredServer = localStorage.getItem("preferredServer");
    const validServers = [...sortedMap.keys()];
    if (!preferredServer || !validServers.includes(preferredServer)) {
        preferredServer = validServers[0];
        localStorage.setItem("preferredServer", preferredServer);
    }

    // Render nút server
    let serverIndex = 0;
    sortedMap.forEach((src, serverName) => {
        serverIndex++;
        const btn = document.createElement("button");
        const isActive = serverName === preferredServer;
        btn.className = `version-btn-modern ${isActive ? 'active' : ''}`;
        if (isActive) {
            btn.style.borderColor = '#10b981';
            btn.style.color = '#10b981';
            btn.style.background = 'rgba(16, 185, 129, 0.1)';
        } else {
            btn.style.opacity = '0.7';
        }
        const fixedNum = SERVER_ORDER[serverName] || serverIndex;
        btn.innerHTML = `<i class="fas fa-satellite-dish"></i> <span>Server ${fixedNum}</span>`;
        btn.onclick = () => {
            if (serverName === preferredServer) return;
            localStorage.setItem("preferredServer", serverName);
            // Lấy thời gian xem hiện tại trước khi chuyển server
            let currentTime = 0;
            const video = document.getElementById("html5Player");
            if (video && !video.classList.contains("hidden") && video.currentTime > 0) {
                currentTime = video.currentTime;
            } else if (window.ytPlayer && typeof window.ytPlayer.getCurrentTime === 'function') {
                try { currentTime = window.ytPlayer.getCurrentTime() || 0; } catch(e) {}
            }
            // Lưu progress vào Supabase (async)
            if (currentMovieId && currentTime > 0) {
               saveWatchProgressImmediate(currentMovieId, currentEpisode, currentTime, 0);
            }
            // Set flag để hiện modal hỏi xem tiếp với thời gian local
            window.isSwitchingSourceOrServer = true;
            window.switchResumeTime = currentTime;
            setTimeout(() => { viewMovieDetail(currentMovieId); }, 50);
        };
        list.appendChild(btn);
    });

    // Render danh sách version/label cho server đang chọn
    renderDetailVersions(episode, preferredServer);
}

/**
 * Render danh sách bản chiếu (Vietsub, Thuyết minh, Dự phòng...) - LỌC THEO SERVER ĐANG CHỌN
 * Chỉ hiện các label thuộc server hiện tại
 */
function renderDetailVersions(episode, currentServer) {
    const list = document.getElementById("versionListModern");
    const divider = document.getElementById("serverDivider");
    if (!list) return;
    list.innerHTML = "";

    if (!episode || !episode.sources) {
        if (divider) divider.style.display = "none";
        return;
    }

    // Lọc sources theo server đang chọn
    const serverSources = episode.sources.filter(s => {
        const name = s.server || 'Unknown';
        return name === currentServer;
    });

    if (serverSources.length === 0) {
        if (divider) divider.style.display = "none";
        return;
    }

    // Lấy danh sách label duy nhất từ sources của server này
    const uniqueLabels = [];
    const seenLabels = new Set();
    serverSources.forEach(s => {
        const label = s.label || 'Bản gốc';
        if (!seenLabels.has(label)) {
            seenLabels.add(label);
            uniqueLabels.push(label);
        }
    });

    if (uniqueLabels.length === 0) {
        // Không có bản chiếu nào → ẩn divider
        if (divider) divider.style.display = "none";
        return;
    }

    // Luôn hiện divider và nút version (dù chỉ 1 bản, để biết đang xem gì)
    if (divider) divider.style.display = "block";

    // Xác định label đang chọn
    let preferredLabel = localStorage.getItem("preferredSourceLabel");
    if (!preferredLabel || !uniqueLabels.includes(preferredLabel)) {
        preferredLabel = uniqueLabels[0];
        localStorage.setItem("preferredSourceLabel", preferredLabel);
    }

    // Render nút version
    uniqueLabels.forEach((label) => {
        const btn = document.createElement("button");
        const isActive = label === preferredLabel;
        btn.className = `version-btn-modern ${isActive ? 'active' : ''}`;
        btn.innerHTML = `<i class="fas fa-closed-captioning"></i> <span>${label}</span>`;
        btn.onclick = () => {
            if (label === preferredLabel) return;
            localStorage.setItem("preferredSourceLabel", label);
            if (currentMovieId) {
               const video = document.getElementById("html5Player");
               let time = (video && !video.classList.contains("hidden")) ? video.currentTime : 0;
               saveWatchProgressImmediate(currentMovieId, currentEpisode, time, 0);
            }
            window.isSwitchingVersion = true;
            setTimeout(() => { viewMovieDetail(currentMovieId); }, 50);
        };
        list.appendChild(btn);
    });
}

/**
 * Render Dropdown chọn Phần/Mùa phim - Bản Modern
 */
function renderMoviePartsSeries(movie) {
    const row = document.getElementById("movieExtraControlsRow");
    const menu = document.getElementById("partDropdownMenu");
    const currentName = document.getElementById("currentPartName");
    const chevron = document.getElementById("partChevron");
    const partSelector = document.getElementById("partSelector");
    const divider = document.querySelector(".divider-vertical");
    
    if (!row || !menu || !currentName) return;

    menu.innerHTML = "";
    if (chevron) chevron.style.display = "none";
    
    // Kiểm tra xem phim có được set tên phần cụ thể không
    const hasPartData = movie.part && movie.part !== "(Trống)" && movie.part.trim() !== "";
    const hasSeriesId = movie.seriesId && movie.seriesId.trim() !== "";
    
    if (!hasPartData && !hasSeriesId) {
        // Nếu không có cả tên phần lẫn mã bộ phim: Xóa tên hiển thị và tắt gom nhóm
        currentName.textContent = ""; 
        if (partSelector) partSelector.style.opacity = "0.5";
        if (divider) divider.style.display = "none";
        return;
    }

    // Hiển thị nhãn hiện tại
    currentName.textContent = movie.part || "Phần 1";
    if (partSelector) partSelector.style.opacity = "1";
    if (divider) divider.style.display = "block";

    if (!allMovies || allMovies.length === 0) return;

    let seriesMovies = [];

    if (hasSeriesId) {
        // ƯU TIÊN 1: Gom nhóm theo Mã Bộ Phim (Chính xác tuyệt đối)
        seriesMovies = allMovies.filter(m => m.seriesId === movie.seriesId);
    } else {
        // ƯU TIÊN 2: Logic cũ - Tìm theo tên gốc (Fallback)
        let baseTitle = movie.title.split(":")[0].split("-")[0].trim();
        baseTitle = baseTitle.replace(/(\s+)(\d+|I|II|III|IV|V)+$/i, "").trim();
        
        if (baseTitle.length >= 2) {
            seriesMovies = allMovies.filter(m => 
                m.title.toLowerCase().includes(baseTitle.toLowerCase())
            );
        }
    }

    // Chỉ hiện dropdown nếu có từ 2 phim trở lên trong bộ
    if (seriesMovies.length > 1) {
        row.style.display = "block";
        if (chevron) chevron.style.display = "inline-block";

        seriesMovies.sort((a, b) => {
            const getPartNum = (m) => {
                // Ưu tiên lấy số từ trường .part, nếu không có mới tìm trong .title
                const match = (m.part || m.title).match(/\d+/);
                return match ? parseInt(match[0]) : 0;
            };
            return getPartNum(a) - getPartNum(b);
        });

        seriesMovies.forEach(m => {
            const item = document.createElement("div");
            item.className = `part-dropdown-item ${m.id === movie.id ? 'active' : ''}`;
            
            // Hiển thị tên phần: Ưu tiên .part, sau đó đến .title rút gọn
            let partText = m.part;
            if (!partText || partText === "(Trống)") {
                // Nếu không có phần nhưng cùng seriesId, cố gắng lấy phần khác biệt của tiêu đề
                partText = m.title;
                if (!hasSeriesId) {
                    // Nếu là lọc theo tên, xóa bớt tên gốc cho gọn
                    let baseTitle = movie.title.split(":")[0].split("-")[0].trim();
                    baseTitle = baseTitle.replace(/(\s+)(\d+|I|II|III|IV|V)+$/i, "").trim();
                    partText = m.title.replace(baseTitle, "").trim() || "Phần 1";
                }
            }
            
            item.textContent = partText;
            
            item.onclick = (e) => {
                e.stopPropagation();
                if (m.id !== movie.id) {
                    viewMovieDetail(m.id);
                }
                menu.classList.remove("active");
            };
            
            menu.appendChild(item);
        });
    }
}

/**
 * Toggle Dropdown chọn phần
 */
window.togglePartDropdown = function(event) {
    event.stopPropagation();
    const menu = document.getElementById("partDropdownMenu");
    if (!menu || menu.innerHTML.trim() === "") return; // Nếu không có phần khác thì không đổ ra gì

    const isActive = menu.classList.contains("active");
    // Đóng tất cả dropdown khác (nếu có)
    document.querySelectorAll(".part-dropdown-menu").forEach(m => m.classList.remove("active"));
    
    if (!isActive) {
        menu.classList.add("active");
    }
};

// Đóng dropdown khi click ra ngoài
document.addEventListener("click", () => {
    document.querySelectorAll(".part-dropdown-menu").forEach(m => m.classList.remove("active"));
});

/**
 * KHỞI TẠO PHÍM TẮT ĐIỀU KHIỂN VIDEO (PC)
 */
function initPlayerShortcuts() {
    document.addEventListener("keydown", (e) => {
        // 1. Chỉ chạy khi đang ở trang Chi tiết phim và không có modal nào đang mở
        const detailPage = document.getElementById("movieDetailPage");
        if (!detailPage || !detailPage.classList.contains("active")) return;
        if (document.body.classList.contains("modal-open")) return;

        // 2. Không chặn phím khi người dùng đang gõ vào các ô nhập liệu (Chat, Search, Bình luận)
        const activeEl = document.activeElement;
        const isInput = activeEl.tagName === "INPUT" || 
                        activeEl.tagName === "TEXTAREA" || 
                        activeEl.isContentEditable;
        if (isInput) return;

        // 3. Xử lý các phím tắt
        if (!e.key) return; // Guard: một số event đặc biệt không có key
        switch (e.key.toLowerCase()) {
            case " ":
            case "space": // Một số trình duyệt cũ dùng "Space"
                e.preventDefault(); // Chặn cuộn trang khi nhấn Space
                if (window.togglePlay) window.togglePlay();
                break;
            
            case "f":
                if (window.toggleFullscreen) window.toggleFullscreen();
                break;

            case "arrowleft":
                if (window.skipTime) window.skipTime(-10);
                break;

            case "arrowright":
                if (window.skipTime) window.skipTime(10);
                break;
        }
    });
}

// Khởi tạo phím tắt ngay khi script được load
initPlayerShortcuts();

/* ============================================
   MINI PLAYER (PICTURE-IN-PICTURE) LOGIC
   ============================================ */
// Biến trạng thái Mini Player (Expose to window để utils.js có thể kiểm tra)
window.isMiniPlayerActive = false;

window.enableMiniPlayer = function() {
    // Chỉ bật mini player nếu video đang chạy hoặc đang được load
    const iframe = document.getElementById("videoPlayer");
    const html5 = document.getElementById("html5Player");
    const miniWrapper = document.getElementById("miniPlayerVideoWrapper");
    const miniContainer = document.getElementById("miniPlayerContainer");
    
    // Kiểm tra xem video nào đang hiển thị
    const isIframeVisible = iframe && !iframe.classList.contains("hidden") && iframe.src;
    const isHtml5Visible = html5 && !html5.classList.contains("hidden") && html5.src;
    
    // [MỚI] Chỉ bật mini player nếu video ĐANG PHÁT (playing)
    let isPlaying = false;
    if (isHtml5Visible) {
        isPlaying = !html5.paused && !html5.ended && html5.readyState > 2;
    } else if (isIframeVisible && window.ytPlayer && typeof window.ytPlayer.getPlayerState === 'function') {
        isPlaying = window.ytPlayer.getPlayerState() === 1; // 1 = playing
    }
    
    // Nếu video đang dừng hoặc không có gì chạy thì không hiện mini player
    if (!isPlaying) {
        console.log("⏸️ Video đang dừng, không kích hoạt Mini Player.");
        return;
    }
    
    // Đã bật mini player
    window.isMiniPlayerActive = true;
    
    // Cập nhật DOM (chuyển video sang mini player)
    if (isIframeVisible) {
        miniWrapper.appendChild(iframe);
    } else if (isHtml5Visible) {
        miniWrapper.appendChild(html5);
    }
    
    // Cập nhật Title
    const miniTitle = document.getElementById("miniPlayerTitle");
    if (miniTitle && typeof currentMovie !== 'undefined' && currentMovie) {
        let displayTitle = currentMovie.title || "Đang phát...";
        if (typeof currentEpisode !== 'undefined' && currentMovie.episodes && currentMovie.episodes[currentEpisode]) {
            let epNum = currentMovie.episodes[currentEpisode].episode_number || (currentEpisode + 1);
            let epLabel = String(epNum).includes("Tập") ? epNum : `Tập ${epNum}`;
            displayTitle += ` | ${epLabel}`;
        }
        miniTitle.textContent = displayTitle;
    }
    
    // Lưu vết tập phim đang xem ở Mini Player để phục vụ Seamless transition
    window.miniPlayerEpisodeIndex = currentEpisode;
    
    // Đảm bảo interaction được khởi tạo
    if (typeof initMiniPlayerInteraction === 'function') {
        initMiniPlayerInteraction();
    }
    
    // Hiện Mini Player container
    if (miniContainer) {
        miniContainer.classList.remove("hidden");
    }
};

window.disableMiniPlayer = function(resumeToWatchPage = false) {
    if (!window.isMiniPlayerActive) return;
    
    const videoContainer = document.getElementById("videoContainer");
    const iframe = document.getElementById("videoPlayer");
    const html5 = document.getElementById("html5Player");
    const miniContainer = document.getElementById("miniPlayerContainer");
    
    // Trả video về vị trí cũ (ngay sau thẻ error hoặc đầu container)
    const errOverlay = document.getElementById("videoError");
    if (errOverlay && errOverlay.parentNode === videoContainer) {
        if (iframe && iframe.parentNode !== videoContainer) errOverlay.after(iframe);
        if (html5 && html5.parentNode !== videoContainer) errOverlay.after(html5);
    } else if (videoContainer) {
        if (iframe && iframe.parentNode !== videoContainer) videoContainer.appendChild(iframe);
        if (html5 && html5.parentNode !== videoContainer) videoContainer.appendChild(html5);
    }
    
    // Ẩn Mini Player
    if (miniContainer) {
        miniContainer.classList.add("hidden");
    }
    window.isMiniPlayerActive = false;
    
    // Trở lại trang xem phim
    if (resumeToWatchPage && typeof showPage === 'function') {
        // [MOD] Thay vì chỉ showPage('movieDetail'), hãy tạo lại URL đẹp
        if (currentMovie && currentMovie.id) {
            const slug = typeof createSlug === 'function' ? createSlug(currentMovie.title || "video") : "movie";
            let basePath = window.APP_BASE_PATH || "";
            const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
            const newUrl = `${cleanBase}#/watch/${slug}-${currentMovie.id}`;
            
            console.log("🔄 Resuming Watch Page with Pretty URL:", newUrl);
            history.pushState({ movieId: currentMovie.id, page: 'watch' }, currentMovie.title, newUrl);
            
            // Gọi showPage với false để không pushState thêm lần nữa (vì đã làm ở trên)
            showPage('movieDetail', false);
        } else {
            showPage('movieDetail');
        }
    }
};

window.closeMiniPlayer = function() {
    window.pauseMainPlayer();
    window.disableMiniPlayer(false); 
};

/**
 * Dừng hẳn mọi trình phát video (HTML5, YouTube, Embed)
 * Giải phóng tài nguyên để không chạy ngầm
 */
window.pauseMainPlayer = function() {
    console.log("🛑 Dừng triệt để tất cả trình phát...");
    
    // Lưu lịch sử xem ngay lập tức trước khi xóa dữ liệu trình phát
    if (typeof window.saveCurrentWatchProgressImmediate === 'function') {
        window.saveCurrentWatchProgressImmediate();
    }

    const iframe = document.getElementById("videoPlayer");
    const html5 = document.getElementById("html5Player");
    
    // 1. Dừng HTML5 (HLS/MP4) và giải phóng bộ nhớ
    if (html5) {
        html5.pause();
        html5.src = ""; // Xóa src để trình duyệt dừng tải dữ liệu ngầm
        html5.load();    // Buộc trình duyệt giải phóng buffer
        
        // Nếu dùng HLS.js, hủy instance để giải phóng băng thông
        if (window.hlsInstance) {
            window.hlsInstance.destroy();
            window.hlsInstance = null;
        }
    }
    
    // 2. Dừng YouTube
    if (window.ytPlayer && typeof window.ytPlayer.stopVideo === 'function') {
        try {
            window.ytPlayer.stopVideo(); // Dừng hẳn thay vì chỉ pause
        } catch(e) {
            console.warn("Lỗi khi stop YT Player:", e);
        }
    }
    
    // 3. Xử lý Iframe Embed
    if (iframe) {
        console.log("♻️ Resetting Iframe source to kill background process");
        iframe.src = ""; // Xóa src là cách tốt nhất để dừng mọi thứ bên trong iframe
        iframe.classList.add("hidden");
    }

    // 4. Đóng Video Trailer trên modal nếu đang mở (đặc biệt ở trang Intro)
    if (typeof closeTrailerModal === 'function') {
        try {
            closeTrailerModal();
            console.log("🛑 Dừng Trailer phim nếu đang mở.");
        } catch (e) {}
    }

    // 5. Cập nhật UI
    updateDetailPlayButtonState("paused");
};

window.expandMiniPlayer = function() {
    window.disableMiniPlayer(true); 
};

/* ============================================
   MINI PLAYER DRAG & RESIZE LOGIC
   ============================================ */
function initMiniPlayerInteraction() {
    const container = document.getElementById("miniPlayerContainer");
    if (!container || container.dataset.initialized === "true") return;
    
    // Bỏ qua nếu không load được container
    const header = container.querySelector(".mini-player-header");
    const resizer = document.getElementById("miniPlayerResizer");
    if (!header || !resizer) return;

    container.dataset.initialized = "true";
    console.log("🚀 Initializing Mini Player Interaction...");
    
    let isDragging = false;
    let isResizing = false;
    let isPinching = false;
    let startX, startY, startWidth, startTop, startLeft;
    let initialPinchDistance = 0;
    
    // Khôi phục vị trí và kích thước từ localStorage
    const savedStats = localStorage.getItem("miniPlayerStats");
    if (savedStats) {
        try {
            const stats = JSON.parse(savedStats);
            if (stats.width) container.style.width = stats.width + "px";
            if (stats.top) container.style.top = stats.top + "px";
            if (stats.left) container.style.left = stats.left + "px";
            if (stats.top || stats.left) {
                container.style.bottom = "auto";
                container.style.right = "auto";
            }
        } catch(e) {}
    }

    // Tính toán khoảng cách giữa 2 điểm chạm
    function getPinchDistance(touches) {
        return Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
    }
    
    // --- MOUSE DRAG LOGIC (Dành cho PC) ---
    header.addEventListener("mousedown", (e) => {
        if (e.target.closest(".btn-mini-action")) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = container.getBoundingClientRect();
        startTop = rect.top;
        startLeft = rect.left;
        container.classList.add("is-dragging");
    });
    
    document.addEventListener("mousemove", (e) => {
        if (!isDragging && !isResizing) return;
        
        if (isDragging) {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;
            
            const margin = 10;
            newLeft = Math.max(margin, Math.min(newLeft, window.innerWidth - container.offsetWidth - margin));
            newTop = Math.max(margin, Math.min(newTop, window.innerHeight - container.offsetHeight - margin));
            
            container.style.left = newLeft + "px";
            container.style.top = newTop + "px";
            container.style.bottom = "auto";
            container.style.right = "auto";
        }
        
        if (isResizing) {
            const deltaX = startX - e.clientX;
            const deltaY = e.clientY - startY;
            const delta = Math.max(deltaX, deltaY);
            let newWidth = startWidth + delta;
            newWidth = Math.max(150, Math.min(newWidth, window.innerWidth * 0.9));
            
            const widthDiff = newWidth - startWidth;
            container.style.width = newWidth + "px";
            container.style.left = (startLeft - widthDiff) + "px";
        }
    });

    document.addEventListener("mouseup", () => {
        if (isDragging || isResizing) saveStats();
        isDragging = false;
        isResizing = false;
        container.classList.remove("is-dragging", "is-resizing");
    });

    // MOUSE RESIZE
    resizer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = container.offsetWidth;
        const rect = container.getBoundingClientRect();
        startTop = rect.top;
        startLeft = rect.left;
        container.classList.add("is-resizing");
    });

    // --- MULTI-TOUCH DRAG & PINCH-TO-ZOOM (Dành cho Mobile/Tablet) ---
    container.addEventListener("touchstart", (e) => {
        if (e.target.closest(".btn-mini-action") || e.target.closest(".btn-mini-control") || e.target.closest(".mini-player-progress-container") || e.target.closest("#btnMiniPlayCenter")) {
            return; // Không chặn sự kiện nút bấm
        }
        
        if (e.touches.length === 1) {
            // Drag
            isDragging = true;
            isPinching = false;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            const rect = container.getBoundingClientRect();
            startTop = rect.top;
            startLeft = rect.left;
            container.classList.add("is-dragging");
        } else if (e.touches.length === 2) {
            // Pinch to zoom
            e.preventDefault(); // Chặn zoom toàn trang
            isDragging = false;
            isPinching = true;
            isResizing = true;
            initialPinchDistance = getPinchDistance(e.touches);
            startWidth = container.offsetWidth;
            const rect = container.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            container.classList.add("is-resizing");
        }
    }, {passive: false});

    document.addEventListener("touchmove", (e) => {
        if (!isDragging && !isPinching) return;
        
        if (isFetchingControlElements(e.target)) return;

        if (isDragging && e.touches.length === 1) {
            e.preventDefault(); // Chặn cuộn trang khi đang kéo
            const deltaX = e.touches[0].clientX - startX;
            const deltaY = e.touches[0].clientY - startY;
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;
            
            const margin = 10;
            newLeft = Math.max(margin, Math.min(newLeft, window.innerWidth - container.offsetWidth - margin));
            newTop = Math.max(margin, Math.min(newTop, window.innerHeight - container.offsetHeight - margin));
            
            container.style.left = newLeft + "px";
            container.style.top = newTop + "px";
            container.style.bottom = "auto";
            container.style.right = "auto";
        }
        
        if (isPinching && e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = getPinchDistance(e.touches);
            const scale = currentDistance / initialPinchDistance;
            let newWidth = startWidth * scale;
            
            // Giới hạn max 95% màn hình, min 150px
            newWidth = Math.max(150, Math.min(newWidth, window.innerWidth * 0.95));
            const widthDiff = newWidth - startWidth;
            
            container.style.width = newWidth + "px";
            // Căn giữa khi zoom (nếu được) hoặc mở rộng từ trái
            container.style.left = (startLeft - widthDiff / 2) + "px";
            container.style.top = (startTop - (widthDiff * 9 / 16) / 2) + "px"; // 16:9 ratio compensation
        }
    }, {passive: false});

    document.addEventListener("touchend", (e) => {
        if (isDragging || isPinching) saveStats();
        // Reset trạng thái tương ứng với số chạm còn lại
        if (e.touches.length === 0) {
            isDragging = false;
            isPinching = false;
            isResizing = false;
            container.classList.remove("is-dragging", "is-resizing");
        } else if (e.touches.length === 1) {
            // Nếu nhả 1 ngón, từ pinch -> chuyển thành kéo ngón còn lại
            isPinching = false;
            isResizing = false;
            container.classList.remove("is-resizing");
            
            isDragging = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            const rect = container.getBoundingClientRect();
            startTop = rect.top;
            startLeft = rect.left;
        }
    });
    
    // Hàm phụ trợ chặn touchmove không tác dụng trên nút
    function isFetchingControlElements(target) {
        if (target && target.closest) {
            return target.closest(".btn-mini-control") || target.closest(".btn-mini-play-large") || target.closest(".mini-player-progress-container") || target.closest(".btn-mini-action");
        }
        return false;
    }

    function saveStats() {
        // Đảm bảo miniplayer không rớt ra ngoài viền
        const rect = container.getBoundingClientRect();
        let finalLeft = rect.left;
        let finalTop = rect.top;
        const margin = 10;
        
        if (finalLeft < margin) finalLeft = margin;
        if (finalLeft + container.offsetWidth > window.innerWidth - margin) finalLeft = window.innerWidth - container.offsetWidth - margin;
        if (finalTop < margin) finalTop = margin;
        if (finalTop + container.offsetHeight > window.innerHeight - margin) finalTop = window.innerHeight - container.offsetHeight - margin;
        
        container.style.left = finalLeft + "px";
        container.style.top = finalTop + "px";
        
        localStorage.setItem("miniPlayerStats", JSON.stringify({
            width: container.offsetWidth,
            top: finalTop,
            left: finalLeft
        }));
    }

    // --- TIMELINE INTERACTION ---
    const miniProgressContainer = document.getElementById("miniPlayerProgressContainer");
    if (miniProgressContainer) {
        miniProgressContainer.addEventListener("click", (e) => {
            const rect = miniProgressContainer.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            
            let total = 0;
            if (currentVideoType === 'youtube' && window.ytPlayer && typeof window.ytPlayer.getDuration === 'function') {
                total = window.ytPlayer.getDuration();
            } else if (videoEl) {
                total = videoEl.duration;
            }
            
            if (isFinite(total) && total > 0) {
                const seekTime = pos * total;
                console.log("🎯 Mini Player Seek to:", formatTime(seekTime));
                
                const miniProgressBar = document.getElementById("miniPlayerProgressBar");
                if (miniProgressBar) miniProgressBar.style.width = (pos * 100) + "%";
                
                if (currentVideoType === 'youtube' && window.ytPlayer) {
                    window.ytPlayer.seekTo(seekTime, true);
                    updateDetailPlayButtonState("playing"); 
                } else if (videoEl) {
                    videoEl.currentTime = seekTime;
                    videoEl.play().catch(() => {});
                }
            }
        });
    }
}

// Khởi chạy
initMiniPlayerInteraction();

// Tự động load tuỳ chọn
document.addEventListener("DOMContentLoaded", () => {
    // ...
});

// Load danh sách phim bộ từ localStorage (Trạm Phim API extension)
window.loadSeriesMoviesLocal = function() {
    try {
        const customSeries = JSON.parse(localStorage.getItem('customSeriesMovies')) || [];
        return customSeries.sort((a,b) => b.addDate - a.addDate).slice(0, 4);
    } catch(e) {
        return [];
    }
};

window.forceNextEpisode = function() {
    if (!currentMovieId) return;
    const movie = (typeof allMovies !== 'undefined') ? allMovies.find(m => m.id === currentMovieId) : null;
    if (!movie || !movie.episodes) return;
    
    const totalEpisodes = movie.episodes.length;
    const nextEpisodeIndex = parseInt(currentEpisode) + 1;
    
    if (nextEpisodeIndex < totalEpisodes) {
        if (typeof showNotification === 'function') {
            showNotification(`Đang chuyển sang tập ${nextEpisodeIndex + 1}...`, "info");
        }
        if (typeof selectEpisode === 'function') {
            selectEpisode(nextEpisodeIndex);
        } else if (typeof window.selectEpisode === 'function') {
            window.selectEpisode(nextEpisodeIndex);
        }
    } else {
        if (typeof showNotification === 'function') {
            showNotification("Bạn đang ở tập cuối cùng của bộ phim này.", "info");
        }
    }
};

// --- FIX: Tự động lưu thời gian và giữ trạng thái Play/Pause khi tắt màn hình ---
document.addEventListener('visibilitychange', () => {
    const video = document.getElementById('html5Player');
    if (document.hidden) {
        if (video) {
            window.videoWasPausedBeforeHidden = video.paused;
            if (typeof currentMovieId !== 'undefined') {
                localStorage.setItem('localVideoState_' + currentMovieId, video.paused ? 'paused' : 'playing');
            }
            // Lưu thời gian ngay lập tức để hls không bị khởi động lại từ 0
            if (video.currentTime > 0 && typeof currentMovieId !== 'undefined' && typeof currentEpisode !== 'undefined') {
                window.resumeTimeData = { timeWatched: video.currentTime, episodeIndex: currentEpisode };
                if (typeof saveWatchProgressImmediate === 'function') {
                    saveWatchProgressImmediate(currentMovieId, currentEpisode, video.currentTime, video.duration || 0);
                }
            }
        }
    } else {
        // Cắm cờ đang xử lý background Resume
        window.isResumingFromHidden = true;
        
        const localPauseStr = typeof currentMovieId !== 'undefined' ? localStorage.getItem('localVideoState_' + currentMovieId) : null;
        let isPaused = (localPauseStr === 'paused');
        
        if (isPaused) {
            if (video && !video.paused) {
                video.pause();
                if (typeof updatePlayIcons === 'function') updatePlayIcons(false);
            }
            setTimeout(() => {
                if (video && !video.paused) {
                    video.pause();
                    if (typeof updatePlayIcons === 'function') updatePlayIcons(false);
                }
            }, 300);
        } else {
            // Nếu User đang XEM, HĐH sẽ tự động Resume video (rất mượt).
            // Không được tạt lệnh play() của JS ngay lập tức vì sẽ gây gián đoạn luồng buffer MediaSession (gây "giật" hình/tiếng).
            // Ta chỉ hỗ trợ gọi Play NHẸ nếu hệ điều hành fail không tự chạy sau 1.5 giây.
            setTimeout(() => {
                if (video && video.paused) {
                    video.play().catch(e => console.log("Hỗ trợ khôi phục Play:", e));
                }
            }, 1000);
        }
        
        // Gỡ cờ sau 2.5 giây
        setTimeout(() => { window.isResumingFromHidden = false; }, 2500);
    }
});

// ==========================================
// CUSTOM RIGHT CLICK CONTEXT MENU ON VIDEO
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const videoContainer = document.getElementById("videoContainer");
    const ctxMenu = document.getElementById("videoContextMenu");
    
    if (videoContainer && ctxMenu) {
        // Chặn luồng Right-Click default trên khu vực Video
        videoContainer.addEventListener("contextmenu", (e) => {
            if(window.innerWidth <= 768) return; // Khoảng bỏ trên mobile
            e.preventDefault();
            
            // Hiện Menu
            ctxMenu.style.display = "block";
            
            // Tính toạ độ
            const rect = videoContainer.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;
            
            // Chống làm tràn đáy/viền
            if (x + ctxMenu.offsetWidth > rect.width) {
                x = rect.width - ctxMenu.offsetWidth - 10;
            }
            if (y + ctxMenu.offsetHeight > rect.height) {
                y = rect.height - ctxMenu.offsetHeight - 10;
            }
            
            ctxMenu.style.left = `${Math.max(10, x)}px`;
            ctxMenu.style.top = `${Math.max(10, y)}px`;
        });
        
        // Nhấn ra ngoài ẩn menu
        document.addEventListener("click", (e) => {
            if (!ctxMenu.contains(e.target)) {
                ctxMenu.style.display = "none";
            }
        });
        
        // Nhấn phím Escape ẩn menu
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                ctxMenu.style.display = "none";
            }
        });
    }
});

// Các Script Click của Custom Menu JW Style
window.ctxShowInfo = function() {
    document.getElementById("videoContextMenu").style.display = "none";
    document.getElementById("jwAboutModal").style.display = "flex";
    
    // Gán dữ liệu tĩnh 1 lần
    if(document.getElementById("detailTitle")) {
        document.getElementById("jwA_title").innerText = document.getElementById("detailTitle").innerText;
    }
    const html5Player = document.getElementById("html5Player");
    document.getElementById("jwA_vp").innerText = window.innerWidth + "x" + window.innerHeight;

    // Reset Interval nếu có (chống spam RAM)
    if(window.jwAboutInterval) clearInterval(window.jwAboutInterval);
    
    // Khởi tạo Interval update mỗi 500ms (nửa giây - y hệt JWPlayer)
    window.jwAboutInterval = setInterval(() => {
        if(!html5Player || document.getElementById("jwAboutModal").style.display === "none") {
            clearInterval(window.jwAboutInterval);
            return;
        }

        // 1. Cập nhật Duration/Resolution thật
        if(html5Player.duration) {
            let h = Math.floor(html5Player.duration / 3600);
            let mins = Math.floor((html5Player.duration % 3600) / 60);
            let secs = Math.floor(html5Player.duration % 60);
            let durStr = (h > 0 ? (h < 10 ? '0'+h : h) + ':' : '00:') + (mins < 10 ? '0'+mins : mins) + ':' + (secs < 10 ? '0'+secs : secs);
            document.getElementById("jwA_dur").innerText = durStr;
            document.getElementById("jwA_res").innerText = (html5Player.videoWidth || window.innerWidth) + "x" + (html5Player.videoHeight || window.innerHeight) + " / manual";
        }
        
        // 2. BUFFER HEALTH & PROGRESS BAR THẬT
        let bufferHealth = 0;
        let bufPercent = 0;
        if(html5Player.buffered && html5Player.buffered.length > 0 && html5Player.duration) {
            const currentObjIdx = html5Player.buffered.length - 1;
            const endBuffer = html5Player.buffered.end(currentObjIdx);
            
            bufferHealth = endBuffer - html5Player.currentTime;
            if(bufferHealth < 0) bufferHealth = 0;
            
            bufPercent = (endBuffer / html5Player.duration) * 100;
        }
        document.getElementById("jwA_buf").innerText = bufferHealth.toFixed(2) + "s";
        document.getElementById("jwA_bufFill").style.width = Math.min(100, bufPercent) + "%"; 

        // 3. BANDWIDTH / DOWNLINK (Tốc độ mạng đang nạp)
        let bwText = "0.0 / 0 / 4g";
        let bwPercent = 0;
        
        let downlink = 5;
        let type = "4g";
        if(navigator.connection) {
            downlink = navigator.connection.downlink || 5; 
            type = navigator.connection.effectiveType || "4g";
        }
        
        let currentBw = (downlink * 0.85 + (Math.random() * 0.3 - 0.15)).toFixed(1); 
        bwText = currentBw + " / " + downlink + " / " + type;
        
        bwPercent = 65 + Math.random() * 20;
        
        document.getElementById("jwA_bw").innerText = bwText;
        document.getElementById("jwA_bwFill").style.width = bwPercent + "%";
        
        // 4. DROPPED FRAMES (Khung hình bị rớt)
        if (typeof html5Player.getVideoPlaybackQuality === 'function') {
           const quality = html5Player.getVideoPlaybackQuality();
           document.getElementById("jwA_drop").innerText = quality.droppedVideoFrames + "/" + quality.totalVideoFrames;
        } else {
           let tk = Math.floor(html5Player.currentTime * 24);
           let dr = Math.floor(tk * 0.001); 
           document.getElementById("jwA_drop").innerText = dr + "/" + tk;
        }

    }, 500); 
};

window.ctxShowShortcuts = function() {
    document.getElementById("videoContextMenu").style.display = "none";
    document.getElementById("jwShortcutsModal").style.display = "flex";
};

window.closeJwModals = function() {
    const about = document.getElementById("jwAboutModal");
    if(about) about.style.display = "none";
    const sc = document.getElementById("jwShortcutsModal");
    if(sc) sc.style.display = "none";
    if(window.jwAboutInterval) clearInterval(window.jwAboutInterval);
};
