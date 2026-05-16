/**
 * ============================================
 * TRANG DIỄN VIÊN (Actors Page)
 * Trích xuất danh sách diễn viên từ trường cast của allMovies
 * Có phân trang (50 diễn viên/trang) để tối ưu hiệu suất
 * ============================================
 */

/**
 * Biến toàn cục lưu danh sách diễn viên đã trích xuất + trạng thái phân trang
 */
let _actorsDataCache = [];
let _actorsFilteredCache = []; // Kết quả sau khi lọc (dùng cho phân trang)
let _actorsCurrentPage = 1;
const _ACTORS_PER_PAGE = 50;

/**
 * Trích xuất danh sách diễn viên unique từ allMovies
 * Trả về mảng [{name, movieCount}] đã sắp xếp theo movieCount giảm dần
 */
function _extractActorsFromMovies() {
  const actorMap = {};
  allMovies.forEach(movie => {
    let names = [];
    if (movie.castData && Array.isArray(movie.castData) && movie.castData.length > 0) {
      names = movie.castData.map(a => a.name);
    } else if (movie.cast) {
      names = movie.cast.split(",").map(n => n.trim()).filter(n => n);
    }

    names.forEach(name => {
      if (!actorMap[name]) {
        actorMap[name] = { name: name, movieCount: 0 };
      }
      actorMap[name].movieCount++;
    });
  });

  return Object.values(actorMap).sort((a, b) => b.movieCount - a.movieCount);
}

/**
 * Render trang danh sách diễn viên
 * Quét allMovies, tách cast, loại trùng, render grid + khởi tạo bộ lọc
 */
function renderActorsPage() {
  const container = document.getElementById("actorsGrid");
  if (!container) return;

  // Trích xuất và cache danh sách diễn viên
  _actorsDataCache = _extractActorsFromMovies();
  _actorsFilteredCache = _actorsDataCache; // Ban đầu chưa lọc
  _actorsCurrentPage = 1;

  if (_actorsDataCache.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px; display: block; opacity: 0.3;"></i>
        <p>Chưa có dữ liệu diễn viên nào.</p>
      </div>`;
    _renderActorsPagination(0);
    return;
  }

  // Render trang đầu tiên
  _renderActorsCurrentPage();

  // Khởi tạo bộ lọc
  populateActorFilters();
}

/**
 * Render diễn viên của trang hiện tại (phân trang)
 */
function _renderActorsCurrentPage() {
  const container = document.getElementById("actorsGrid");
  if (!container) return;

  const totalActors = _actorsFilteredCache.length;
  const start = (_actorsCurrentPage - 1) * _ACTORS_PER_PAGE;
  const end = Math.min(start + _ACTORS_PER_PAGE, totalActors);
  const pageActors = _actorsFilteredCache.slice(start, end);

  if (pageActors.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px; display: block; opacity: 0.3;"></i>
        <p>Không tìm thấy diễn viên phù hợp.</p>
      </div>`;
  } else {
    _renderActorsGrid(pageActors, container);
  }

  // Render thanh phân trang
  _renderActorsPagination(totalActors);
}

/**
 * Render grid thẻ diễn viên vào container
 */
function _renderActorsGrid(actors, container) {
  container.innerHTML = actors.map(actor => {
    const dbActor = findActorInDB(actor.name);
    const avatarUrl = (dbActor && dbActor.avatar)
        ? dbActor.avatar
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(actor.name)}&background=random&color=fff&size=200&bold=true&font-size=0.35`;
    return `
      <div class="actor-card" onclick="viewActorDetail('${actor.name.replace(/'/g, "\\'")}')">
        <div class="actor-card-avatar">
          <img src="${avatarUrl}" alt="${actor.name}" loading="lazy">
        </div>
        <div class="actor-card-name">${actor.name}</div>
      </div>`;
  }).join("");
}

/**
 * Render thanh phân trang cho diễn viên
 * Tái sử dụng CSS pagination từ admin.css
 */
function _renderActorsPagination(totalActors) {
  const paginationEl = document.getElementById("actorsPagination");
  if (!paginationEl) return;

  const totalPages = Math.ceil(totalActors / _ACTORS_PER_PAGE);

  // Ẩn nếu chỉ có 1 trang hoặc không có dữ liệu
  if (totalPages <= 1) {
    paginationEl.style.display = 'none';
    return;
  }

  paginationEl.style.display = 'flex';

  const start = (_actorsCurrentPage - 1) * _ACTORS_PER_PAGE + 1;
  const end = Math.min(_actorsCurrentPage * _ACTORS_PER_PAGE, totalActors);

  // Tạo các nút trang (hiển thị tối đa 5 nút xung quanh trang hiện tại)
  let pageButtons = '';
  let startPage = Math.max(1, _actorsCurrentPage - 2);
  let endPage = Math.min(totalPages, _actorsCurrentPage + 2);

  // Đảm bảo luôn hiển thị ít nhất 5 nút nếu có đủ trang
  if (endPage - startPage < 4) {
    if (startPage === 1) {
      endPage = Math.min(totalPages, startPage + 4);
    } else {
      startPage = Math.max(1, endPage - 4);
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    pageButtons += `<button class="btn-page ${i === _actorsCurrentPage ? 'active' : ''}" onclick="goToActorsPage(${i})">${i}</button>`;
  }

  paginationEl.innerHTML = `
    <span class="pagination-info">Hiển thị ${start}-${end} / ${totalActors} diễn viên</span>
    <div class="pagination-controls">
      <button class="btn-page btn-page-nav" onclick="goToActorsPage(${_actorsCurrentPage - 1})" ${_actorsCurrentPage <= 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left"></i> <span>Trước</span>
      </button>
      ${pageButtons}
      <button class="btn-page btn-page-nav" onclick="goToActorsPage(${_actorsCurrentPage + 1})" ${_actorsCurrentPage >= totalPages ? 'disabled' : ''}>
        <span>Sau</span> <i class="fas fa-chevron-right"></i>
      </button>
    </div>
    <div class="pagination-jump">
      Đến trang
      <input type="number" class="jump-input" id="actorJumpInput" min="1" max="${totalPages}" value="${_actorsCurrentPage}"
        onkeydown="if(event.key==='Enter') goToActorsPage(parseInt(this.value))">
      <button class="btn-jump" onclick="goToActorsPage(parseInt(document.getElementById('actorJumpInput').value))">Vào</button>
    </div>
  `;
}

/**
 * Chuyển đến trang diễn viên cụ thể
 */
function goToActorsPage(page) {
  const totalPages = Math.ceil(_actorsFilteredCache.length / _ACTORS_PER_PAGE);
  if (page < 1 || page > totalPages) return;

  _actorsCurrentPage = page;
  _renderActorsCurrentPage();

  // Cuộn lên đầu danh sách diễn viên
  const actorsPage = document.getElementById("actorsPage");
  if (actorsPage) {
    actorsPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Khởi tạo các dropdown filter cho trang diễn viên
 * Tái sử dụng initFilterBox từ home.js
 */
function populateActorFilters() {
  // 1. Quốc gia — lấy danh sách country unique từ allActors
  const countryList = document.getElementById("listFilterActorCountry");
  const countryInput = document.getElementById("inputFilterActorCountry");
  if (countryList && countryInput) {
    let actorCountries = ['Tất cả quốc gia'];
    if (typeof allActors !== 'undefined' && allActors) {
      const uniqueCountries = [...new Set(allActors.map(a => a.country).filter(Boolean))].sort();
      actorCountries = actorCountries.concat(uniqueCountries);
    }
    initFilterBox("boxFilterActorCountry", countryInput, countryList, actorCountries, 'filterActors');
  }

  // 2. Giới tính
  const genderList = document.getElementById("listFilterActorGender");
  const genderInput = document.getElementById("inputFilterActorGender");
  if (genderList && genderInput) {
    const genders = ['Tất cả giới tính', 'Nam', 'Nữ'];
    initFilterBox("boxFilterActorGender", genderInput, genderList, genders, 'filterActors');
  }

  // 3. Sắp xếp
  const sortList = document.getElementById("listFilterActorSort");
  const sortInput = document.getElementById("inputFilterActorSort");
  if (sortList && sortInput) {
    const sortOptions = ['Số phim (nhiều → ít)', 'Số phim (ít → nhiều)', 'Tên (A → Z)', 'Tên (Z → A)'];
    initFilterBox("boxFilterActorSort", sortInput, sortList, sortOptions, 'filterActors');
  }
}

/**
 * Hàm lọc diễn viên chính
 * Lọc theo: tên, quốc gia, giới tính + sắp xếp kết quả
 * Sau khi lọc, reset về trang 1 và render
 */
function filterActors() {
  // Lấy giá trị các bộ lọc
  const query = removeDiacritics(document.getElementById("searchActors")?.value || "");
  const countryStr = (document.getElementById("inputFilterActorCountry")?.value || "").trim();
  const genderStr = (document.getElementById("inputFilterActorGender")?.value || "").trim();
  const sortStr = (document.getElementById("inputFilterActorSort")?.value || "").trim();

  // Chuẩn hóa (loại bỏ "Tất cả...")
  const countries = countryStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));
  const genders = genderStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));

  // Lọc từ cache gốc
  let filtered = _actorsDataCache.filter(actor => {
    // 1. Lọc theo tên
    if (query) {
      const nameMatch = removeDiacritics(actor.name).includes(query);
      const dbActor = findActorInDB(actor.name);
      const altMatch = dbActor && dbActor.altNames && dbActor.altNames.some(alt => removeDiacritics(alt).includes(query));
      if (!nameMatch && !altMatch) return false;
    }

    // 2. Lọc theo quốc gia
    if (countries.length > 0) {
      const dbActor = findActorInDB(actor.name);
      const actorCountry = dbActor?.country || "";
      if (!actorCountry || !countries.some(c => c.toLowerCase() === actorCountry.toLowerCase())) {
        return false;
      }
    }

    // 3. Lọc theo giới tính
    if (genders.length > 0) {
      const dbActor = findActorInDB(actor.name);
      const actorGender = dbActor?.gender || "";
      if (!actorGender || !genders.some(g => g.toLowerCase() === actorGender.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  // Sắp xếp
  const sortValue = sortStr.replace(/,\s*$/, '').trim();
  if (sortValue === 'Số phim (ít → nhiều)') {
    filtered.sort((a, b) => a.movieCount - b.movieCount);
  } else if (sortValue === 'Tên (A → Z)') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortValue === 'Tên (Z → A)') {
    filtered.sort((a, b) => b.name.localeCompare(a.name));
  } else {
    filtered.sort((a, b) => b.movieCount - a.movieCount);
  }

  // Cập nhật cache đã lọc và reset trang
  _actorsFilteredCache = filtered;
  _actorsCurrentPage = 1;

  // Render trang đầu tiên
  _renderActorsCurrentPage();

  // Hiển thị summary kết quả lọc
  const summaryEl = document.getElementById("actorFilterResultSummary");
  if (summaryEl) {
    const hasFilter = query || countries.length > 0 || genders.length > 0;
    if (hasFilter) {
      let parts = [];
      if (query) parts.push(`Tên: <b>"${query}"</b>`);
      if (countries.length > 0) parts.push(`Quốc gia: <b>${countries.join(', ')}</b>`);
      if (genders.length > 0) parts.push(`Giới tính: <b>${genders.join(', ')}</b>`);
      summaryEl.innerHTML = `<i class="fas fa-filter" style="margin-right: 8px; opacity: 0.6;"></i> ${parts.join(' • ')} — Tìm thấy <span class="filter-count-badge">${filtered.length}</span> diễn viên`;
      summaryEl.classList.add('active');
    } else {
      summaryEl.classList.remove('active');
      summaryEl.innerHTML = '';
    }
  }
}

/**
 * Tìm diễn viên trong allActors theo tên chính hoặc altNames
 */
function findActorInDB(name) {
    if (typeof allActors === 'undefined' || !allActors) return null;
    const q = name.toLowerCase().trim();
    return allActors.find(a => {
        if (a.name.toLowerCase() === q) return true;
        if (a.altNames && a.altNames.some(alt => alt.toLowerCase() === q)) return true;
        return false;
    }) || null;
}

/**
 * Xem chi tiết diễn viên
 * Hiển thị thông tin + danh sách phim đã tham gia
 */
function viewActorDetail(actorName) {
  const container = document.getElementById("actorDetailContent");
  if (!container) return;

  // Chuyển sang trang chi tiết
  showPage("actorDetail", true);

  // Tra cứu thông tin diễn viên từ database
  const dbActor = findActorInDB(actorName);

  // Lọc phim mà diễn viên tham gia (bao gồm cả tên gọi khác)
  const searchNames = [actorName.toLowerCase()];
  if (dbActor && dbActor.altNames) {
      dbActor.altNames.forEach(alt => searchNames.push(alt.toLowerCase()));
  }
  
  const actorMovies = allMovies.filter(movie => {
    if (!movie.cast) return false;
    const names = movie.cast.split(",").map(n => n.trim().toLowerCase());
    return names.some(n => searchNames.includes(n));
  });

  // Sắp xếp phim theo năm giảm dần
  actorMovies.sort((a, b) => (b.year || 0) - (a.year || 0));

  // Sử dụng ảnh từ DB nếu có, nếu không thì dùng placeholder
  const avatarUrl = (dbActor && dbActor.avatar)
      ? dbActor.avatar
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(actorName)}&background=random&color=fff&size=300&bold=true&font-size=0.35`;

  // Thông tin từ DB
  const displayName = (dbActor && dbActor.name) ? dbActor.name : actorName;
  const bio = (dbActor && dbActor.bio) ? dbActor.bio : null;
  const gender = (dbActor && dbActor.gender) ? dbActor.gender : null;
  const dob = (dbActor && dbActor.dob) ? new Date(dbActor.dob).toLocaleDateString('vi-VN') : null;
  const altNames = (dbActor && dbActor.altNames && dbActor.altNames.length > 0) ? dbActor.altNames.join(", ") : null;

  container.innerHTML = `
    <!-- Nút quay lại -->
    <div class="actor-detail-topbar">
      <button class="btn-back-square" onclick="showPage('actors')">
        <i class="fas fa-chevron-left"></i>
      </button>
      <span class="actor-detail-page-title">${displayName}</span>
    </div>

    <div class="actor-detail-body">
      <!-- Cột trái: Thông tin diễn viên -->
      <div class="actor-info-sidebar">
        <div class="actor-info-avatar">
          <img src="${avatarUrl}" alt="${displayName}">
        </div>
        <h2 class="actor-info-name">${displayName}</h2>
        ${altNames ? `<p style="color: var(--text-muted); font-size: 0.85rem; margin-top: -5px; margin-bottom: 10px;"><strong>Tên gọi khác:</strong> ${altNames}</p>` : ''}

        <div class="actor-info-actions">
          <button class="btn-actor-action" onclick="showNotification('Đã thêm vào yêu thích!', 'success')">
            <i class="fas fa-heart"></i> Yêu thích
          </button>
          <button class="btn-actor-action" onclick="shareActor('${actorName.replace(/'/g, "\\'")}')">
            <i class="fas fa-share-alt"></i> Chia sẻ
          </button>
        </div>

        <div class="actor-info-meta">
          ${bio ? `<div class="actor-meta-item">
            <span class="meta-label">Giới thiệu:</span>
            <span class="meta-value" style="font-style: italic; opacity: 0.85;">${bio}</span>
          </div>` : ''}
          <div class="actor-meta-item">
            <span class="meta-label"><strong>Giới tính:</strong></span>
            <span class="meta-value">${gender || 'Đang cập nhật'}</span>
          </div>
          <div class="actor-meta-item">
            <span class="meta-label"><strong>Ngày sinh:</strong></span>
            <span class="meta-value">${dob || 'Đang cập nhật'}</span>
          </div>
          <div class="actor-meta-item">
            <span class="meta-label"><strong>Nơi sống:</strong></span>
            <span class="meta-value">${dbActor?.country || 'Đang cập nhật'}</span>
          </div>
          <div class="actor-meta-item">
            <span class="meta-label"><strong>Số phim:</strong></span>
            <span class="meta-value">${actorMovies.length} phim</span>
          </div>
        </div>
      </div>

      <!-- Cột phải: Danh sách phim -->
      <div class="actor-movies-section">
        <div class="actor-movies-header">
          <h3>Các phim đã tham gia</h3>
          <div class="actor-view-toggle">
            <button class="actor-toggle-btn active" id="actorViewAll" onclick="toggleActorView('all')">Tất cả</button>
            <button class="actor-toggle-btn" id="actorViewTimeline" onclick="toggleActorView('timeline')">Thời gian</button>
          </div>
        </div>

        <!-- Chế độ xem Tất cả (Grid) -->
        <div class="actor-movies-grid movie-grid" id="actorMoviesAll">
          ${renderActorMoviesGrid(actorMovies)}
        </div>

        <!-- Chế độ xem Thời gian (Timeline) -->
        <div class="actor-movies-timeline hidden" id="actorMoviesTimeline">
          ${renderActorMoviesTimeline(actorMovies)}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render danh sách phim dạng Grid (dùng createMovieCard từ home.js để có popup)
 */
function renderActorMoviesGrid(movies) {
  if (movies.length === 0) {
    return `<div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1/-1;">
      <p>Chưa có phim nào.</p>
    </div>`;
  }

  // Tận dụng hàm createMovieCard toàn cục để có popup như trang chủ
  if (typeof createMovieCard === "function") {
    return movies.map(movie => createMovieCard(movie)).join("");
  }

  // Fallback nếu createMovieCard chưa tải
  return movies.map(movie => `
    <div class="movie-card-wrapper" onclick="viewMovieDetail('${movie.id}')">
      <div class="card movie-card movie-card-static">
        <div class="card-image">
          <img src="${movie.posterUrl}" alt="${movie.title}" loading="lazy">
        </div>
        <div class="card-body">
          <h4 class="card-title">${movie.title}</h4>
        </div>
      </div>
    </div>
  `).join("");
}

/**
 * Render danh sách phim dạng Timeline (gom theo năm, dùng createMovieCard)
 */
function renderActorMoviesTimeline(movies) {
  if (movies.length === 0) {
    return `<div style="text-align: center; padding: 40px; color: var(--text-muted);">
      <p>Chưa có phim nào.</p>
    </div>`;
  }

  // Gom phim theo năm
  const yearGroups = {};
  movies.forEach(movie => {
    const year = movie.year || "Không rõ";
    if (!yearGroups[year]) yearGroups[year] = [];
    yearGroups[year].push(movie);
  });

  // Sắp xếp năm giảm dần
  const sortedYears = Object.keys(yearGroups).sort((a, b) => {
    if (a === "Không rõ") return 1;
    if (b === "Không rõ") return -1;
    return parseInt(b) - parseInt(a);
  });

  const useCard = typeof createMovieCard === "function";

  return sortedYears.map(year => `
    <div class="timeline-year-group">
      <div class="timeline-year-marker">
        <span class="timeline-dot"></span>
        <span class="timeline-year">${year}</span>
      </div>
      <div class="timeline-movies-row movie-grid">
        ${yearGroups[year].map(movie => {
          if (useCard) return createMovieCard(movie);
          return `
            <div class="movie-card-wrapper" onclick="viewMovieDetail('${movie.id}')">
              <div class="card movie-card movie-card-static">
                <div class="card-image"><img src="${movie.posterUrl}" alt="${movie.title}" loading="lazy"></div>
                <div class="card-body"><h4 class="card-title">${movie.title}</h4></div>
              </div>
            </div>`;
        }).join("")}
      </div>
    </div>
  `).join("");
}

/**
 * Chuyển đổi chế độ xem: "all" (grid) hoặc "timeline"
 */
function toggleActorView(mode) {
  const gridView = document.getElementById("actorMoviesAll");
  const timelineView = document.getElementById("actorMoviesTimeline");
  const btnAll = document.getElementById("actorViewAll");
  const btnTimeline = document.getElementById("actorViewTimeline");

  if (!gridView || !timelineView) return;

  if (mode === "all") {
    gridView.classList.remove("hidden");
    timelineView.classList.add("hidden");
    btnAll.classList.add("active");
    btnTimeline.classList.remove("active");
  } else {
    gridView.classList.add("hidden");
    timelineView.classList.remove("hidden");
    btnAll.classList.remove("active");
    btnTimeline.classList.add("active");
  }
}

/**
 * Chia sẻ link diễn viên
 */
function shareActor(actorName) {
  const url = window.location.href;
  if (navigator.share) {
    navigator.share({ title: actorName + " - Trạm Phim", url: url });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
    showNotification("Đã sao chép link!", "success");
  }
}
