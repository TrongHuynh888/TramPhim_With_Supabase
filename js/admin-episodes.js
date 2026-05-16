/**
 * ============================================================
 * ADMIN EPISODES MANAGEMENT (Quản lý Tập Phim)
 * ============================================================
 * Tách từ admin.js để dễ bảo trì.
 * Chứa toàn bộ logic: lọc phim, load tập, thêm/sửa/xóa tập,
 * import batch, lồng tiếng, preview player, skip intro, v.v.
 * ============================================================
 */

// Biến global cho quản lý tập
let selectedMovieForEpisodes = null;

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
 * Render Grid danh sách phim để chn
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
                // ang cập nhật - xanh dương
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
    badge.textContent = `ã có ${currentCount} tập (chưa set tổng)`;
    badge.style.color = "#aaa";
    badge.style.background = "rgba(255,255,255,0.05)";
  } else if (currentCount >= totalEpisodes) {
    badge.textContent = `✅ Hoàn Tất (${currentCount}/${totalEpisodes})`;
    badge.style.color = "#51cf66";
    badge.style.background = "rgba(81, 207, 102, 0.12)";
  } else {
    badge.textContent = ` ${currentCount}/${totalEpisodes} tập`;
    badge.style.color = "#ffc107";
    badge.style.background = "rgba(255, 193, 7, 0.12)";
  }
}
/**
 * Xử lý hiển thị gợi ý khi chn loại video
 */
/**
 * [NEW] Mở modal Import Nhiu Tập (API)
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

        statusText.innerHTML = `<i class="fas fa-check-circle"></i> ã tải thành công <b>${serverData.length}</b> tập.`;
        statusText.style.color = "var(--success-color)";
        clrBtn.style.display = "inline-block";

    } catch (err) {
        console.error("Batch Import Fetch Error:", err);
        statusText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi: ${err.message}`;
        statusText.style.color = "var(--danger-color)";
    }
}

/**
 * [NEW] ổi nhãn hàng loạt cho cả cột
 */
function changeAllLabels(type, value) {
    if (!value) return; // Nếu chn dòng "-- ổi Nhãn --" thì không làm gì
    
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
    showNotification(`ã đổi đồng loạt ${selectElements.length} tập thành nhãn: ${value}`, "success");
}

/**
 * [NEW] Xóa sạch bảng Preview
 */
function clearImportBatchTable() {
    document.getElementById("previewImportTable").innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 30px;">Dán Link API và bấm "Lấy Danh Sách" để xem trước các tập.</td></tr>`;
    
    // ặt lại luôn 2 cái Header Select All v trạng thái mặc định
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
             title: labelName, // ổi từ episode_name -> title theo schema thực tế
             episode_index: existingCount + idx, // Cột integer
             episode_number: (() => {
                 let n = labelName.replace(/^(tập|tap|episode|ep)\.?\s*/i, '').trim();
                 if (/^\d+$/.test(n)) n = String(parseInt(n, 10));
                 return (n || (existingCount + idx).toString()).toLowerCase();
             })(),
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
        showLoading(true, `ang xử lý thêm ${episodesToInsert.length} tập phim...`);
        
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
                    + ` <b>Loại:</b> ${typeStr}\n`
                    + `📺 <b>Tập:</b> Cập nhật +${episodesToInsert.length} tập (Hiện tại: ${currentEpCount} / ${mData?.total_episodes || '?'})\n`
                    + `💽 <b>Bản chiếu:</b> ${versionsStr}\n`
                    + ` <b>Nguồn:</b> ${sourcesStr}`;
                
                sendTelegramNotify(msg);

                // ★ THÔNG BO CHUÔNG CHO TẬP MỚI
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

            // ịnh dạng: "Tập 01|URL" hoặc "1|URL"
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
                    // Phim nhiu tập: gán theo thứ tự dòng input có cùng tên
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
            showNotification(`ã cập nhật nguồn ${modeLabel} cho ${updatedCount} tập!`, "success");
            loadEpisodesForMovie(movieId);
            
            if (notFoundCount === 0) {
                closeModal("bulkAddDubbedModal");
            } else {
                statusEl.innerHTML = `<span style="color: #e67e22;">⚠ Cập nhật ${updatedCount} tập. Không tìm thấy ${notFoundCount} tập: ${notFoundEps.join(", ")}</span>`;
            }
            notifyDataChange("movies");
        } else {
            showNotification("Không tìm thấy tập nào khớp để cập nhật!", "warning");
            statusEl.innerHTML = '<span style="color: #e74c3c;"> Không tìm thấy tập nào khớp!</span>';
        }
    } catch (error) {
        console.error("Lỗi cập nhật lồng tiếng Supabase:", error);
        showNotification("Có lỗi xảy ra khi cập nhật!", "error");
        statusEl.innerHTML = ' Lỗi hệ thống.';
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
  
  // Tự động cập nhật preview buttons khi có thay đổi v số lượng source
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
  
  // Tránh mất Data cũ nếu Phim đang có Nhãn nào khác chuỗi Standard Mặc ịnh
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
  adminPreviewSelectedIndex = 0; // Reset index preview v nguồn đầu tiên

  // Sử dụng biến toàn cục selectedMovieForEpisodes thay vì đc từ DOM (vì DOM select có thể bị ẩn/sai lệch)
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
      // ổ dữ liệu vào modal
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
      
      // Xử lý Thi lượng (Smart Input)
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

      // Load Subtitle URL theo targetLang (Sử dụng UI Dynamic Mới)
      clearDynamicSubtitles();
      for (const [code, info] of Object.entries(SUBTITLE_LANGUAGES_MAP)) {
          const val = episode[info.col];
          if (val) {
              setDynamicSubtitleBox(code, val);
          }
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
    
    // Reset Thi lượng
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
    
    // Xóa sạch Subtitle Fields
    clearDynamicSubtitles();
    
    // Reset checkbox áp dụng cho tất cả
    const applyCheck = document.getElementById("applyIntroToAll");
    if (applyCheck) applyCheck.checked = false;
    
    // Thêm 1 dòng source mặc định
    addSourceInput("hls", "", "Bản gốc");
  }

  // Khởi tạo preview player và load dữ liệu intro sau khi modal mở
  setTimeout(() => {
      updateAdminIntroPreview();
      
      // Khởi tạo ngay danh sách nguồn cho AI thả xuống
      if (typeof updateAISourceSelect === 'function') {
          updateAISourceSelect();
      }
      
      const currentMovieId = selectedMovieForEpisodes || document.getElementById("selectMovieForEpisodes").value;
      const currentMovie = allMovies.find((m) => m.id === currentMovieId);
      
      // Gợi ý AI Model theo quốc gia
      if (typeof recommendAiModelForMovie === 'function') {
          recommendAiModelForMovie(currentMovie);
      }
      
      if (index !== null) {
          const movieId = selectedMovieForEpisodes || document.getElementById("selectMovieForEpisodes").value;
          const movie = allMovies.find((m) => m.id === movieId);
          const episode = movie?.episodes?.[index];
          if (episode) {
              // c intro_begin (thi điểm intro bắt đầu)
              const introBeginTime = Number(episode.intro_begin) || 0;
              document.getElementById("introBeginMinute").value = introBeginTime > 0 ? Math.floor(introBeginTime / 60) : "";
              document.getElementById("introBeginSecond").value = introBeginTime > 0 ? (introBeginTime % 60) : "";

              // c intro_end (thi điểm intro kết thúc)
              const introTime = Number(episode.intro_end || (episode.extra_info && episode.extra_info.intro_end) || episode.introEndTime) || 0;
              document.getElementById("introEndMinute").value = introTime > 0 ? Math.floor(introTime / 60) : "";
              document.getElementById("introEndSecond").value = introTime > 0 ? (introTime % 60) : "";

              // c outro (intro_start trong schema cũ)
              const outroTime = Number(episode.intro_start || (episode.extra_info && episode.extra_info.outro_start) || episode.outroStartTime) || 0;
              document.getElementById("outroStartMinute").value = outroTime > 0 ? Math.floor(outroTime / 60) : "";
              document.getElementById("outroStartSecond").value = outroTime > 0 ? (outroTime % 60) : "";
          }
      }
  }, 300);

  // Hiển thị Inline Editor thay vì popup modal
  const inlineEditor = document.getElementById("inlineEpisodeEditorContainer");
  
  // Ẩn phần quản lý danh sách tập (dùng classList cho đồng bộ với goBackToMovieSelection)
  const mgmt = document.getElementById("episodesManagement");
  const selection = document.getElementById("movieSelectionSection");
  if (mgmt) mgmt.classList.add("hidden");
  if (selection) selection.classList.add("hidden");
  
  if (inlineEditor) {
    inlineEditor.classList.remove("hidden");
    inlineEditor.style.display = "";
    // Cuộn lên đầu editor
    inlineEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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
    title: document.getElementById("episodeNumber").value, // ổ từ episode_name -> title
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

  // Lưu link phụ đề động vào đúng ngôn ngữ (gọi API gom tất cả Box hiển thị)
  getDynamicSubtitlesToSave(episodeData);

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
      episodeData.episode_number = (() => {
          let n = episodeData.title.replace(/^(tập|tap|episode|ep)\.?\s*/i, '').trim();
          if (/^\d+$/.test(n)) n = String(parseInt(n, 10));
          return (n || (episodes.length + 1).toString()).toLowerCase();
      })();
      
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
                    + ` <b>Loại:</b> ${typeStr}\n`
                    + `📺 <b>Tập:</b> ${episodeData.episode_number} (Hiện tại: ${currentEpCount} / ${mData?.total_episodes || '?'})\n`
                    + `💽 <b>Bản chiếu:</b> ${versionsStr}\n`
                    + ` <b>Nguồn:</b> ${sourcesStr}`;
              sendTelegramNotify(msg);

              // ★ THÔNG BO CHUÔNG CHO TẬP MỚI
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

    // Ẩn Inline Editor, hiện lại bảng danh sách tập (dùng classList cho đồng bộ)
    const inlineEditor = document.getElementById("inlineEpisodeEditorContainer");
    if (inlineEditor) {
      inlineEditor.classList.add("hidden");
      inlineEditor.style.display = "none";
    }
    
    const mgmt = document.getElementById("episodesManagement");
    if (mgmt) mgmt.classList.remove("hidden");
    
    // Xóa style.display inline trên movieSelectionSection (nếu bị set bởi lần mở trước)
    const selection = document.getElementById("movieSelectionSection");
    if (selection) selection.style.display = "";
    
    // Dọn dẹp hàng đợi upload tạm
    if (window.pendingUploads) window.pendingUploads = {};
    if (window.pendingR2Uploads) window.pendingR2Uploads = {};
    
    // Cuộn lên đầu danh sách tập
    const episodesPanel = document.getElementById("episodesPanel");
    if (episodesPanel) episodesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    showNotification("Vui lòng chn một phim trước!", "warning");
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

    // Lấy thông tin của source đang chn để init player
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

    // Format thi gian mm:ss
    function fmt(s) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`;
    }

    // Cập nhật seekbar khi video đang phát (throttle: chỉ khi giây thay đổi)
    let _lastSec = -1;
    
    // Hiển thị tổng thi gian ngay khi video load xong metadata
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
            if (curSec === _lastSec) return; // B qua nếu chưa đổi giây
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

    // Auto-hide overlay + controls sau 10s khi chuột ri vùng video
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
        // Hiện lại con tr chuột
        if (wrapper) wrapper.style.cursor = "";
    };
    const hideControls = () => {
        // Chỉ ẩn khi video đang phát (không ẩn khi đang pause)
        if (video && !video.paused) {
            if (overlayEl) { overlayEl.style.opacity = "0"; overlayEl.style.pointerEvents = "none"; }
            if (controlsEl) { controlsEl.style.opacity = "0"; controlsEl.style.pointerEvents = "none"; }
            // Ẩn con tr chuột khi fullscreen
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
        // Chuột ri vùng video → bắt đầu đếm ẩn
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
 * Lấy thi gian hiện tại từ trình phát để đin vào ô Intro
 */
function getCurrentTimeFromPreview() {
    let seconds = 0;
    
    if (!adminPreviewPlayer) {
        showNotification("Không tìm thấy trình phát video để lấy thi gian!", "warning");
        return;
    }

    if (adminPreviewPlayer instanceof HTMLVideoElement) {
        seconds = Math.floor(adminPreviewPlayer.currentTime);
    } else if (adminPreviewPlayer.getCurrentTime) {
        // YouTube API
        seconds = Math.floor(adminPreviewPlayer.getCurrentTime());
    } else {
        showNotification("Trình phát này không hỗ trợ lấy thi gian tự động. Vui lòng nhập tay.", "info");
        return;
    }

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    // [NEW] Xác định mục tiêu đang chn (Intro hay Outro)
    const target = document.querySelector('input[name="timeCaptureTarget"]:checked')?.value || 'intro';
    
    if (target === 'introStart') {
        document.getElementById("introBeginMinute").value = mins;
        document.getElementById("introBeginSecond").value = secs;
        showNotification(`ã lấy thi gian Intro bắt đầu: ${mins}p ${secs}s`, "success");
    } else if (target === 'intro') {
        document.getElementById("introEndMinute").value = mins;
        document.getElementById("introEndSecond").value = secs;
        showNotification(`ã lấy thi gian Intro kết thúc: ${mins}p ${secs}s`, "success");
    } else {
        document.getElementById("outroStartMinute").value = mins;
        document.getElementById("outroStartSecond").value = secs;
        showNotification(`ã lấy thi gian Outro: ${mins}p ${secs}s`, "success");
    }
}

/**
 * Thử nhảy tới đoạn intro đã đánh dấu để kiểm tra
 */
function previewSkipIntro() {
    // [NEW] Xác định mục tiêu đang chn để thử nhảy
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
        showNotification(`Vui lòng nhập thi gian ${labels[target] || 'mốc thi gian'} trước!`, "warning");
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
                title: newNumber, // ổi từ episode_name -> title
            })
            .eq('id', targetEpisode.id);

        if (error) throw error;

        // Cập nhật local
        targetEpisode.title = newNumber;
        targetEpisode.episode_name = newNumber;
        targetEpisode.episodeNumber = newNumber;

        showNotification(`ã sửa tập ${oldNumber} thành ${newNumber}`, "success");
    } catch (error) {
        console.error("Lỗi sửa nhanh số tập Supabase:", error);
        showNotification("Lỗi khi sửa số tập.", "error");
        loadEpisodesForMovie(movieId); // Revert UI if needed
    }
}


/**
 * QUẢN L TẬP PHIM: BULK ACTIONS & DRAG & DROP
 */

// Chn tất cả / B chn tất cả tập phim
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

// B chn tất cả
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

    const confirmed = await customConfirm(`Bạn có chắc muốn xóa ${indicesToDelete.length} tập phim đã chn?`, {
        title: "Xóa tập hàng loạt",
        type: "danger",
        confirmText: "Xóa tất cả"
    });

    if (!confirmed) return;

    try {
        showLoading(true, "Đang xóa các tập đã chn...");
        const movieId = selectedMovieForEpisodes;
        const movie = allMovies.find(m => m.id === movieId);
        if (!movie || !movie.episodes) return;

        const episodesToDelete = indicesToDelete.map(idx => movie.episodes[idx]).filter(Boolean);
        const idsToDelete = episodesToDelete.map(ep => ep.id);

        if (idsToDelete.length > 0) {
            const { error } = await supabase.from('episodes').delete().in('id', idsToDelete);
            if (error) throw error;
        }

        showNotification(`ã xóa thành công ${idsToDelete.length} tập phim.`, "success");
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
    document.getElementById("bulkEditInfo").textContent = `ang chỉnh sửa cho ${selectedCount} tập phim đã chn`;
    
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
            showNotification("Không có tập nào được chn!", "warning");
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

        showNotification(`ã cập nhật thành công ${updates.length} tập phim.`, "success");
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
                showLoading(true, "ang cập nhật vị trí tập phim...");
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

