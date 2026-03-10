// 1. Mở Modal và điền dữ liệu cũ vào ô nhập
function openProfileModal() {
  if (!currentUser) return;

  // Hiển thị ảnh và tên hiện tại (Text tĩnh)
  document.getElementById("profileCurrentAvatar").src =
    currentUser.photoURL || "https://placehold.co/100";
  document.getElementById("profileDisplayName").textContent =
    currentUser.displayName;
  document.getElementById("profileEmail").textContent = currentUser.email;

  // 👇 ĐIỀN DỮ LIỆU CŨ VÀO Ô NHẬP (INPUT) ĐỂ SỬA 👇
  document.getElementById("profileNameInput").value =
    currentUser.displayName || ""; // Điền tên cũ
  document.getElementById("profileNewAvatar").value =
    currentUser.photoURL || ""; // Điền link ảnh cũ

  openModal("profileModal");
}

// 2. Lưu thay đổi (Cập nhật cả Tên và Avatar)
async function updateUserProfile() {
  const newName = document.getElementById("profileNameInput").value.trim();
  const newAvatar = document.getElementById("profileNewAvatar").value.trim();

  if (!newName) {
    showNotification("Tên không được để trống!", "warning");
    return;
  }

  try {
    showLoading(true, "Đang cập nhật hồ sơ...");

    // 1. Cập nhật Supabase Profiles
    const { error } = await supabase.from('profiles').update({
      display_name: newName,
      avatar: newAvatar,
    }).eq('id', currentUser.id);

    if (error) throw error;

    // 2. Cập nhật metadata trong Auth session (tùy chọn)
    await supabase.auth.updateUser({
        data: { display_name: newName, avatar_url: newAvatar }
    });

    showNotification("Cập nhật hồ sơ thành công!", "success");
    closeModal("profileModal");

    // 3. Cập nhật giao diện (currentUser được Auth Listener cập nhật)
    updateAuthUI(true);
  } catch (error) {
    console.error("Lỗi cập nhật profile:", error);
    showNotification("Lỗi: " + error.message, "error");
  } finally {
    showLoading(false);
  }
}

async function toggleFavorite(movieId) {
  if (!movieId) {
      if (typeof currentMovie !== 'undefined' && currentMovie && currentMovie.id) {
          movieId = currentMovie.id;
      }
  }

  if (!movieId) return;

  if (!currentUser) {
    showNotification("Vui lòng đăng nhập để thích phim!", "warning");
    openAuthModal();
    return;
  }

  const index = currentUser.favorites.indexOf(movieId);
  let isAdding = (index === -1);

  try {
    if (isAdding) {
      // THÊM VÀO
      const { error } = await supabase.from('user_favorites').insert({
          user_id: currentUser.id,
          movie_id: movieId
      });
      if (error) throw error;
      currentUser.favorites.push(movieId);
      showNotification("Đã thêm vào danh sách yêu thích", "success");
    } else {
      // XÓA ĐI
      const { error } = await supabase.from('user_favorites')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('movie_id', movieId);
      if (error) throw error;
      currentUser.favorites.splice(index, 1);
      showNotification("Đã xóa khỏi danh sách yêu thích", "info");
    }

    // CẬP NHẬT GIAO DIỆN
    updateLikeButtonsUI(movieId, isAdding);

  } catch (error) {
    console.error("Lỗi cập nhật Favorite:", error);
    showNotification("Lỗi kết nối! Vui lòng thử lại.", "error");
  }
}

/**
 * Hàm cập nhật UI cho nút Like (Tách ra để dùng chung)
 */
function updateLikeButtonsUI(movieId, isLiked) {
    const buttons = document.querySelectorAll(`.btn-like-${movieId}`);
    buttons.forEach((btn) => {
        const icon = btn.querySelector("i");
        if (isLiked) {
            btn.classList.add("liked");
            btn.style.color = "#e50914";
            btn.style.borderColor = "#e50914";
            if (icon) icon.className = "fas fa-heart";
            if (btn.id === "introLikeBtn") {
                btn.innerHTML = '<i class="fas fa-heart"></i> Đã thích';
                btn.classList.add("btn-success");
                btn.style.color = "#fff";
            }
        } else {
            btn.classList.remove("liked");
            btn.style.color = "";
            btn.style.borderColor = "";
            if (icon) icon.className = "far fa-heart";
            if (btn.id === "introLikeBtn") {
                btn.innerHTML = '<i class="far fa-heart"></i> Yêu thích';
                btn.classList.remove("btn-success");
                btn.style.color = "";
            }
        }
    });

    const detailBtn = document.getElementById("btnLikeDetail");
    if (detailBtn) {
        if (isLiked) {
            detailBtn.classList.add("active");
            detailBtn.style.color = "#e50914";
            detailBtn.innerHTML = '<i class="fas fa-heart" style="color: #e50914"></i> Đã thích';
        } else {
            detailBtn.classList.remove("active");
            detailBtn.style.color = "";
            detailBtn.innerHTML = '<i class="far fa-heart"></i> Yêu thích';
        }
    }
}

async function saveWatchHistory(movieId, episodeIndex, resumeTime = 0) {
  if (!currentUser || !supabase) return;
  try {
    const { error } = await supabase.from('watch_history').upsert({
        user_id: currentUser.id,
        movie_id: movieId,
        episode_index: episodeIndex,
        resume_time: resumeTime,
        last_watched_at: new Date().toISOString()
    });
    if (error) throw error;
  } catch (error) {
    console.error("Lỗi lưu lịch sử:", error);
  }
}

async function openLibraryModal(type) {
  if (!currentUser) return;

  const modalTitle = document.getElementById("libraryModalTitle");
  const container = document.getElementById("libraryList");

  container.innerHTML = '<div class="loading-spinner" style="margin: 20px auto;"></div>';
  openModal("libraryModal");

  let moviesToList = [];

  try {
    if (type === "favorites") {
      modalTitle.textContent = "Phim Yêu Thích ❤️";
      const { data, error } = await supabase
        .from('user_favorites')
        .select('movie_id')
        .eq('user_id', currentUser.id);
      
      if (error) throw error;
      const favIds = data.map(i => i.movie_id);
      moviesToList = allMovies.filter((m) => favIds.includes(m.id));
    } else if (type === "history") {
      modalTitle.textContent = "Lịch Sử Đã Xem 🕒";
      const { data, error } = await supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('last_watched_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      moviesToList = data.map((h) => {
          const movie = allMovies.find((m) => m.id === h.movie_id);
          return movie ? { 
            ...movie, 
            _lastEpisode: h.episode_index,
            _resumeTime: h.resume_time,
            _duration: h.duration
          } : null;
      }).filter(m => m !== null);
    }

    renderLibraryGrid(container, moviesToList, type);

  } catch (error) {
    console.error("Lỗi tải thư viện:", error);
    container.innerHTML = '<p class="text-error text-center">Có lỗi xảy ra.</p>';
  }
}

function renderLibraryGrid(container, moviesToList, type) {
    if (moviesToList.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #888; padding: 40px;">Danh sách trống</div>';
        return;
    }

    container.innerHTML = moviesToList.map(movie => {
        if (type === "history") {
            const watchedSec = movie._resumeTime || 0;
            const totalSec = movie._duration || 0;
            const percent = totalSec > 0 ? Math.min(Math.round((watchedSec / totalSec) * 100), 100) : 0;
            
            const watchedMin = Math.floor(watchedSec / 60);
            const totalMin = Math.floor(totalSec / 60);
            const timeStr = totalMin > 0 ? `${watchedMin}/${totalMin}m` : `${watchedMin}m`;

            return `
                <div class="history-card">
                    <div class="history-poster-wrapper" onclick="viewMovieFromHistory('${movie.id}', ${movie._lastEpisode || 0}, ${movie._resumeTime || 0})">
                        <img src="${movie.poster_url || movie.posterUrl}" onerror="this.src='https://placehold.co/300x450?text=No+Poster'">
                        <div class="history-overlay">
                            <button class="btn-history-play"><i class="fas fa-play"></i></button>
                        </div>
                        <div class="history-progress-container" id="progress-history-${movie.id}">
                            <div class="history-progress-fill" style="width: ${percent}%"></div>
                        </div>
                    </div>
                    <button class="btn-history-remove" onclick="event.stopPropagation(); removeHistoryItemFromModal('${movie.id}', this)" title="Xóa khỏi lịch sử">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="history-info">
                        <h4 class="history-title" title="${movie.title}">${movie.title}</h4>
                        <div class="history-meta">
                            <span class="history-ep">Tập ${movie._lastEpisode + 1}</span>
                            <span class="history-time">${timeStr} đã xem</span>
                        </div>
                    </div>
                </div>`;
        }

        const removeBtn = type === "favorites" ? `
            <button class="btn-remove-fav" onclick="event.stopPropagation(); removeFavoriteFromModal('${movie.id}', this)" title="Bỏ yêu thích">
                <i class="fas fa-times"></i>
            </button>` : "";

        // Default layout for favorites or other types
        return `
            <div class="card" onclick="viewMovieDetail('${movie.id}')">
                <div class="card-image">
                    ${removeBtn}
                    <img src="${movie.poster_url || movie.posterUrl}" onerror="this.src='https://placehold.co/300x450?text=No+Poster'">
                </div>
                <div class="card-body">
                    <h4 class="card-title">${movie.title}</h4>
                    <div class="card-meta">
                        <span>${movie.year}</span> 
                        <span style="color: var(--accent-secondary)">${movie.quality}</span>
                    </div>
                </div>
            </div>`;
    }).join("");
}

async function removeFavoriteFromModal(movieId, btnElement) {
  await toggleFavorite(movieId);
  const card = btnElement.closest(".card");
  if (card) {
    card.style.opacity = "0";
    setTimeout(() => card.remove(), 300);
  }
}

async function removeHistoryItemFromModal(movieId, btnElement) {
  if (!await customConfirm("Xóa phim này khỏi lịch sử đã xem?", { title: "Xóa Lịch Sử", type: "warning", confirmText: "Xóa" })) return;
  
  try {
    const { error } = await supabase
      .from('watch_history')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('movie_id', movieId);
      
    if (error) throw error;
    
    const card = btnElement.closest(".history-card");
    if (card) {
      card.style.opacity = "0";
      card.style.transform = "scale(0.8)";
      setTimeout(() => {
        card.remove();
        // Kiểm tra nếu danh sách trống thì hiện thông báo
        const container = document.getElementById("libraryList");
        if (container && container.children.length === 0) {
          container.innerHTML = '<div style="text-align: center; color: #888; padding: 40px;">Danh sách trống</div>';
        }
      }, 300);
    }
    showNotification("Đã xóa khỏi lịch sử", "success");
  } catch (error) {
    console.error("Lỗi xóa lịch sử:", error);
    showNotification("Lỗi khi xóa lịch sử", "error");
  }
}

async function openMyAlbumsModal() {
    if (!currentUser) {
        showNotification("Đăng nhập để xem album!", "warning");
        openAuthModal();
        return;
    }
    openModal("myAlbumsModal");
    loadMyAlbums();
}

// [NEW] Biến trạng thái chức năng Chọn nhiều Gắn thẳng vào window để chặn đứt thẻ Inline Event Scope
window.isSelectingMovies = window.isSelectingMovies || false;
window.selectedMoviesToBulkDelete = window.selectedMoviesToBulkDelete || [];
window.currentViewingAlbumId = window.currentViewingAlbumId || null;

async function loadMyAlbums() {
    const container = document.getElementById("myAlbumsListContainer");
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const { data, error } = await supabase
            .from('user_albums')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state-container" style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-folder-open" style="font-size: 48px; color: #555; margin-bottom: 15px;"></i>
                    <h4 style="color: #ccc; margin-bottom: 8px;">Bạn chưa có album nào</h4>
                    <p style="color: #888; font-size: 14px; margin-bottom: 20px;">Hãy tạo album mới trong trang chi tiết phim</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '<div class="album-grid">' + 
            data.map(album => {
                const coverImg = (album.movies && album.movies.length > 0) ? album.movies[0].poster_url || album.movies[0].posterUrl : 'https://placehold.co/300x450/1a1a2e/4db8ff?text=Empty';
                const movieCount = album.movies ? album.movies.length : 0;
                return `
                <div class="my-album-card" onclick="viewAlbumMovies('${album.id}', '${album.name.replace(/'/g, "\\'")}')">
                    <div class="album-cover-wrapper">
                        <img src="${coverImg}" class="album-cover-img" alt="${album.name}">
                        <div class="album-overlay">
                            <i class="fas fa-play-circle play-icon"></i>
                        </div>
                        <button class="btn-rename-album" onclick="event.stopPropagation(); renameAlbum('${album.id}', '${album.name.replace(/'/g, "\\'")}')" title="Đổi tên Album">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-remove-album" onclick="event.stopPropagation(); deleteAlbum('${album.id}', '${album.name.replace(/'/g, "\\'")}')" title="Xóa Album">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                        <div class="album-count-badge">
                            <i class="fas fa-film"></i> ${movieCount}
                        </div>
                    </div>
                    <div class="album-info-wrapper">
                        <h4 class="album-title">${album.name}</h4>
                        <span class="album-meta">Đã tạo gần đây</span>
                    </div>
                </div>`;
            }).join("") + '</div>';

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="text-error" style="text-align:center; padding: 20px;">Lỗi tải danh sách album</div>';
    }
}

async function viewAlbumMovies(albumId, albumName) {
    const moviesContainer = document.getElementById("albumMoviesContainer");
    const headerContainer = document.getElementById("albumViewHeader");
    const listContainer = document.getElementById("myAlbumsListContainer");
    
    if (listContainer) listContainer.style.display = "none";
    if (headerContainer) headerContainer.style.display = "flex";
    
    const nameEl = document.getElementById("currentAlbumName");
    if (nameEl) nameEl.innerHTML = `<i class="fas fa-folder-open" style="color: var(--accent-primary);"></i> <span>${albumName}</span>`;
    
    // Nút đổi tên Album đang xem hiện tại
    const btnRename = document.getElementById("btnRenameAlbumCurrent");
    if (btnRename) {
        btnRename.style.display = "inline-flex";
        btnRename.onclick = () => window.renameAlbum(albumId, albumName);
    }
    
    moviesContainer.innerHTML = '<div class="loading-spinner"></div>';
    moviesContainer.style.display = "block";
    
    try {
        const { data, error } = await supabase.from('user_albums').select('movies').eq('id', albumId).single();
        if (error) throw error;
        
        const movies = data.movies || [];
        
        window.currentViewingAlbumId = albumId; // Lưu lại album ID đang xem
        
        if (movies.length === 0) {
            moviesContainer.innerHTML = `
                <div class="empty-state-container" style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-film" style="font-size: 48px; color: #555; margin-bottom: 15px;"></i>
                    <h4 style="color: #ccc; margin-bottom: 8px;">Album trống</h4>
                    <p style="color: #888; font-size: 14px;">Bạn chưa thêm phim nào vào album này</p>
                </div>
            `;
            // Ẩn chức năng chọn nhiều nếu không có phim
            document.getElementById("albumActionsGroup").style.display = "none";
            return;
        }
        
        // Hiện block nút Xóa nhiều nếu có phim
        document.getElementById("albumActionsGroup").style.display = "block";
        cancelSelectMultiple(); // Reset trạng thái trước khi render mới

        moviesContainer.innerHTML = '<div class="album-movies-grid">' + 
            movies.map(movie => `
                <div class="album-movie-card" id="album-movie-card-${movie.id}" onclick="handleAlbumMovieClick(event, '${movie.id}', this)">
                    <div class="album-movie-img-wrapper">
                        <img src="${movie.poster_url || movie.posterUrl}" class="album-movie-img" onerror="this.src='https://placehold.co/300x450/1a1a2e/4db8ff?text=No+Poster'">
                        <div class="movie-card-overlay">
                            <i class="fas fa-play play-icon-small"></i>
                        </div>
                        <div class="movie-select-checkbox" style="display:none;" id="checkbox-${movie.id}">
                            <i class="fas fa-check"></i>
                        </div>
                        <button onclick="event.stopPropagation(); removeMovieFromAlbumSingle(event, '${albumId}', '${movie.id}')" class="btn-remove-movie-album single-remove-btn" title="Xóa khỏi Album">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="album-movie-info">
                        <h5 class="album-movie-title" title="${movie.title.replace(/"/g, '&quot;')}">${movie.title}</h5>
                    </div>
                </div>
            `).join("") + '</div>';
    } catch (e) {
        console.error(e);
        moviesContainer.innerHTML = '<div class="text-error" style="text-align:center; padding: 20px;">Lỗi tải danh sách phim</div>';
    }
}

// [NEW] Hàm điều hướng quay lại danh sách album
window.backToAlbumList = function() {
    document.getElementById("myAlbumsListContainer").style.display = "block";
    document.getElementById("albumMoviesContainer").style.display = "none";
    document.getElementById("albumViewHeader").style.display = "none";
    document.getElementById("albumActionsGroup").style.display = "none"; // Ẩn nút chức năng chia thẻ
    cancelSelectMultiple(); // Thoát chế độ chọn nếu đang bật
    window.currentViewingAlbumId = null;
    loadMyAlbums(); // Refresh lại lỡ có bị xoá album bên trong
};

async function deleteAlbum(albumId, albumName) {
    if (!await customConfirm(`Bạn có chắc chắn muốn xóa album "${albumName}"? Hành động này không thể hoàn tác.`, { title: "Xóa Album", type: "danger", confirmText: "Xóa Album" })) return;
    try {
        const { error } = await supabase.from('user_albums').delete().eq('id', albumId);
        if (error) throw error;
        showNotification("Đã xóa album", "success");
        loadMyAlbums();
    } catch (e) { console.error(e); }
}

window.renameAlbum = async function(albumId, currentName) {
    const newName = await customPrompt("Nhập tên mới cho album:", { 
        title: "Đổi tên Album", 
        defaultValue: currentName,
        confirmText: "Lưu tên"
    });
    
    if (!newName || newName.trim() === "" || newName.trim() === currentName) return;
    
    try {
        const { error } = await supabase
            .from('user_albums')
            .update({ name: newName.trim() })
            .eq('id', albumId);
            
        if (error) throw error;
        
        showNotification("Đã đổi tên album thành công", "success");
        
        // Cập nhật lại giao diện
        if (window.currentViewingAlbumId === albumId) {
            document.getElementById("currentAlbumName").innerHTML = `<i class="fas fa-folder-open" style="color: var(--accent-primary);"></i> <span>${newName.trim()}</span>`;
            // Cập nhật lại hàm gọi để nếu đổi lại thì không bị lỗi tên cũ
            const btnRename = document.getElementById("btnRenameAlbumCurrent");
            if (btnRename) {
                btnRename.onclick = () => window.renameAlbum(albumId, newName.trim());
            }
        }
        
        loadMyAlbums(); // Tải lại danh sách
    } catch (e) {
        console.error("Lỗi đổi tên album:", e);
        showNotification("Lỗi khi đổi tên album", "error");
    }
}

async function removeMovieFromAlbumSingle(event, albumId, movieId) {
    if (event) event.stopPropagation();
    if (!await customConfirm("Bạn có chắc muốn xóa phim này khỏi album?", { title: "Xóa khỏi Album", type: "warning", confirmText: "Xóa phim" })) return;
    try {
        const { data } = await supabase.from('user_albums').select('movies').eq('id', albumId).single();
        const updatedMovies = (data.movies || []).filter(m => m.id !== movieId);
        await supabase.from('user_albums').update({ movies: updatedMovies }).eq('id', albumId);
        
        // Cần truyền event.target để tìm phần tử bị xoá nếu click trực tiếp trên view cũ
        const btnElement = event ? event.target.closest('.single-remove-btn') : null;
        if (btnElement) {
            const card = btnElement.closest('.album-movie-card');
            if (card) {
                card.remove();
            }
        } else {
            // Fallback reload lại danh sách nếu cấu trúc DOM bị lệch
            viewAlbumMovies(albumId, document.getElementById('currentAlbumName').textContent);
        }
        showNotification("Đã xóa khỏi album", "success");
    } catch (e) { console.error(e); }
}

// [NEW BULK DELETE LOGIC] Mọi hàm logic chọn nhiều giờ đều dùng window scope để ngừa click DOM fail
window.toggleSelectMultipleMovies = function() {
    window.isSelectingMovies = true;
    window.selectedMoviesToBulkDelete = [];
    
    document.getElementById("btnToggleSelectMultiple").style.display = "none";
    document.getElementById("bulkDeleteActionGroup").style.display = "flex";
    document.getElementById("selectedMoviesCount").textContent = "0 đã chọn";
    
    // Giao diện: hiện Checkbox, ẩn Nút Xóa Đơn Lẻ, vô hiệu hóa Hover Scale Overlay
    document.querySelectorAll(".movie-select-checkbox").forEach(el => el.style.display = "flex");
    document.querySelectorAll(".single-remove-btn").forEach(el => el.style.display = "none");
    document.querySelectorAll(".album-movie-card").forEach(el => el.classList.add("selectable-mode"));
};

window.cancelSelectMultiple = function() {
    window.isSelectingMovies = false;
    window.selectedMoviesToBulkDelete = [];
    
    let btnGroup = document.getElementById("albumActionsGroup");
    let toggleBtn = document.getElementById("btnToggleSelectMultiple");
    let actionGroup = document.getElementById("bulkDeleteActionGroup");
    
    if (btnGroup && toggleBtn && actionGroup) {
        toggleBtn.style.display = "inline-flex";
        actionGroup.style.display = "none";
    }
    
    // Giao diện: Ẩn Checkbox, Hiện Xóa Đơn Lẻ
    document.querySelectorAll(".movie-select-checkbox").forEach(el => {
        el.style.display = "none";
        el.classList.remove("checked");
    });
    document.querySelectorAll(".single-remove-btn").forEach(el => el.style.display = "flex");
    document.querySelectorAll(".album-movie-card").forEach(el => {
        el.classList.remove("selectable-mode", "selected");
    });
};

window.handleAlbumMovieClick = function(event, movieId, element) {
    if (window.isSelectingMovies) {
        // Đang ở chế độ chọn nhiều -> Toggle chọn
        event.preventDefault();
        event.stopPropagation();
        
        // Cố gắng tìm Element Trực tiếp Truyền vô
        const card = element || document.getElementById(`album-movie-card-${movieId}`);
        if (!card) return;
        
        const checkbox = card.querySelector('.movie-select-checkbox') || document.getElementById(`checkbox-${movieId}`);
        let moviesArray = window.selectedMoviesToBulkDelete || [];
        
        let index = moviesArray.indexOf(movieId);
        if (index === -1) {
            moviesArray.push(movieId);
            card.classList.add("selected");
            if (checkbox) checkbox.classList.add("checked");
        } else {
            moviesArray.splice(index, 1);
            card.classList.remove("selected");
            if (checkbox) checkbox.classList.remove("checked");
        }
        
        window.selectedMoviesToBulkDelete = moviesArray;
        let countBadge = document.getElementById("selectedMoviesCount");
        if (countBadge) countBadge.textContent = `${moviesArray.length} đã chọn`;
    } else {
        // Chế độ xem thường: đóng Modal và chuyển đến phim
        closeModal('myAlbumsModal'); 
        if (typeof viewMovieDetail === 'function') {
            viewMovieDetail(movieId);
        }
    }
};

window.deleteSelectedMovies = async function() {
    if (!window.selectedMoviesToBulkDelete || window.selectedMoviesToBulkDelete.length === 0) {
        showNotification("Vui lòng chọn ít nhất 1 phim để xóa", "warning");
        return;
    }
    
    if (!await customConfirm(`Bạn có chắc muốn xóa ${window.selectedMoviesToBulkDelete.length} phim đã chọn khỏi Album này không?`, { title: "Xóa hàng loạt", type: "danger", confirmText: "Xóa tất cả" })) return;
    
    try {
        const { data } = await supabase.from('user_albums').select('movies').eq('id', window.currentViewingAlbumId).single();
        const currentMovies = data.movies || [];
        const newMovies = currentMovies.filter(m => !window.selectedMoviesToBulkDelete.includes(m.id));
        
        await supabase.from('user_albums').update({ movies: newMovies }).eq('id', window.currentViewingAlbumId);
        showNotification(`Đã xóa ${window.selectedMoviesToBulkDelete.length} phim`, "success");
        
        // Tắt chế độ chọn và reload lại màn hình
        cancelSelectMultiple();
        viewAlbumMovies(window.currentViewingAlbumId, document.getElementById('currentAlbumName').textContent);
        
    } catch (e) {
        console.error("Lỗi xóa nhiều phim: ", e);
        showNotification("Có lỗi xảy ra khi xóa phim", "error");
    }
};

async function loadAvatarLibrary(category = 'Tất cả') {
    const grid = document.getElementById("avatarLibraryGrid");
    if (!grid) return;
    try {
        const { data, error } = await supabase.from('app_configs').select('value').eq('key', 'avatar_library').single();
        const allAvatars = data ? data.value : [];
        const filtered = category === 'Tất cả' ? allAvatars : allAvatars.filter(a => a.category === category);
        
        grid.innerHTML = filtered.map(a => `
            <div class="avatar-item" onclick="selectAvatarItem('${a.url}', this)">
                <img src="${a.url}">
            </div>
        `).join("");
    } catch (e) { console.error(e); }
}

async function loadAvatarFilterTabs() {
    const tabContainer = document.querySelector(".avatar-filter-tabs");
    if (!tabContainer) return;
    try {
        const { data } = await supabase.from('app_configs').select('value').eq('key', 'avatar_categories').single();
        const categories = data ? data.value : ["Hoạt hình", "Meme", "Anime"];
        tabContainer.innerHTML = `<button class="filter-tab active" onclick="filterAvatarLibrary('Tất cả', this)">Tất cả</button>` + 
            categories.map(cat => `<button class="filter-tab" onclick="filterAvatarLibrary('${cat}', this)">${cat}</button>`).join("");
    } catch (e) { console.error(e); }
}

function selectAvatarItem(url, element) {
    selectedAvatarUrl = url;
    document.querySelectorAll(".avatar-item").forEach(i => i.classList.remove("active"));
    element.classList.add("active");
}

function confirmAvatarSelection() {
    if (selectedAvatarUrl) {
        document.getElementById("profileNewAvatar").value = selectedAvatarUrl;
        document.getElementById("profileCurrentAvatar").src = selectedAvatarUrl;
        closeModal("avatarLibraryModal");
    }
}
