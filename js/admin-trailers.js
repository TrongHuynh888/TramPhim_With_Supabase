/**
 * ADMIN TRAILERS - js/admin-trailers.js
 * Chuyên quản lý Trailer Video (hiển thị, chỉnh sửa, tự động bắt link youtube)
 */

let allTrailersData = [];
let currentTrailersPage = 1;
const TRAILERS_PER_PAGE = 20;
let trailersDebounceTimer;

/**
 * Tải toàn bộ phim từ DB (chỉ lấy field cần thiết) để quản lý Trailer
 */
async function loadAdminTrailers(page = 1) {
    if (!window.supabase) return;
    
    currentTrailersPage = page;
    const tableBody = document.getElementById('adminTrailersTable');
    if (!tableBody) return;

    if (page === 1) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x"></i><p class="mt-2">Đang tải dữ liệu phim...</p></td></tr>';
    }

    try {
        const { data, error } = await window.supabase
            .from('movies')
            .select('id, title, origin_title, year, poster_url, tmdb_trailer_key, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        allTrailersData = data || [];
        updateTrailersStats(allTrailersData);
        filterAdminTrailers(); 

    } catch (e) {
        console.error('Lỗi tải danh sách phim (Trailers):', e);
        if (typeof showNotification === 'function') showNotification('Lỗi tải danh sách phim', 'error');
    }
}

/**
 * Cập nhật số liệu thống kê
 */
function updateTrailersStats(data) {
    const total = data.length;
    const hasTrailer = data.filter(m => !!m.tmdb_trailer_key).length;
    const emptyTrailer = total - hasTrailer;

    const statTotal = document.getElementById('statTrailersTotal');
    const statHas = document.getElementById('statTrailersHas');
    const statEmpty = document.getElementById('statTrailersEmpty');

    if (statTotal) statTotal.textContent = `Tổng phim: ${total}`;
    if (statHas) statHas.textContent = `Đã có Trailer: ${hasTrailer}`;
    if (statEmpty) statEmpty.textContent = `Trống Trailer: ${emptyTrailer}`;
}

function filterAdminTrailersDebounced() {
    clearTimeout(trailersDebounceTimer);
    trailersDebounceTimer = setTimeout(() => {
        currentTrailersPage = 1;
        filterAdminTrailers();
    }, 500);
}

/**
 * Lọc và phân trang hiển thị Trailer
 */
function filterAdminTrailers() {
    const searchVal = (document.getElementById('adminSearchTrailer') ? document.getElementById('adminSearchTrailer').value.toLowerCase().trim() : '');
    const statusVal = (document.getElementById('adminFilterTrailerStatus') ? document.getElementById('adminFilterTrailerStatus').value : '');
    const sortVal = (document.getElementById('adminSortTrailers') ? document.getElementById('adminSortTrailers').value : 'newest');

    let filtered = allTrailersData.filter(movie => {
        const nameMatch = (movie.title && movie.title.toLowerCase().includes(searchVal)) || 
                          (movie.origin_title && movie.origin_title.toLowerCase().includes(searchVal));
        if (!nameMatch) return false;

        if (statusVal === 'has_trailer' && !movie.tmdb_trailer_key) return false;
        if (statusVal === 'no_trailer' && movie.tmdb_trailer_key) return false;

        return true;
    });

    if (sortVal === 'newest') {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
        filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    renderTrailersTable(filtered);
}

/**
 * Vẽ bảng trailer
 */
function renderTrailersTable(dataToRender) {
    const tableBody = document.getElementById('adminTrailersTable');
    if (!tableBody) return;

    if (dataToRender.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4">Không tìm thấy phim phù hợp</td></tr>';
        document.getElementById('adminTrailerPagination').innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(dataToRender.length / TRAILERS_PER_PAGE);
    if (currentTrailersPage > totalPages) currentTrailersPage = totalPages;
    if (currentTrailersPage < 1) currentTrailersPage = 1;

    const start = (currentTrailersPage - 1) * TRAILERS_PER_PAGE;
    const end = start + TRAILERS_PER_PAGE;
    const currentData = dataToRender.slice(start, end);

    let html = '';
    currentData.forEach(movie => {
        const hasKey = !!movie.tmdb_trailer_key;
        const statusHtml = hasKey ? `<span class="badge badge-success">Có Trailer</span>` : `<span class="badge badge-error">Trống</span>`;
        const trailerIdStr = hasKey ? movie.tmdb_trailer_key : `<span class="text-muted">N/A</span>`;

        html += `
            <tr>
                <td><img src="${movie.poster_url || ''}" alt="poster" style="width: 40px; height: 55px; border-radius: 4px; object-fit: cover; border: 1px solid var(--border-color);"></td>
                <td>
                    <div style="font-weight: 600;">${movie.title || 'N/A'}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${movie.origin_title || ''}</div>
                </td>
                <td>${movie.year || '--'}</td>
                <td>${statusHtml}</td>
                <td><code>${trailerIdStr}</code></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="openTrailerEditModal('${movie.id}', \`${escapeHtml(movie.tmdb_trailer_key || '')}\`, \`${escapeHtml(movie.title)}\`, \`${escapeHtml(movie.origin_title || '')}\`, '${movie.year}')" title="Chỉnh sửa Trailer">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${hasKey && typeof parseTrailerSource === 'function' ? `<a href="${parseTrailerSource(movie.tmdb_trailer_key)?.externalUrl || '#'}" target="_blank" class="btn btn-sm" style="background: rgba(255,255,255,0.1);" title="Mở xem ngoài"><i class="fas fa-external-link-alt"></i></a>` : ''}
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;

    // Render phân trang
    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml += `<button class="btn btn-sm" onclick="changeTrailersPage(${currentTrailersPage - 1})" ${currentTrailersPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
        paginationHtml += `<span style="margin: 0 10px; font-size: 0.9rem;">Trang ${currentTrailersPage} / ${totalPages}</span>`;
        paginationHtml += `<button class="btn btn-sm" onclick="changeTrailersPage(${currentTrailersPage + 1})" ${currentTrailersPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
    }
    document.getElementById('adminTrailerPagination').innerHTML = paginationHtml;
}

function changeTrailersPage(page) {
    currentTrailersPage = page;
    filterAdminTrailers();
}

/**
 * Mở modal chỉnh sửa Trailer (Sửa từng phim)
 */
function openTrailerEditModal(id, key, name, origin_name, year) {
    document.getElementById('trailerEditMovieId').value = id;
    document.getElementById('trailerEditInput').value = key || '';
    document.getElementById('trailerEditMovieName').textContent = name || origin_name || 'Phim';
    
    // Lưu lại metadata để có thể Auto Fetch
    document.getElementById('trailerEditMovieTitle').value = origin_name || name || '';
    document.getElementById('trailerEditMovieTitle').dataset.viTitle = name || '';
    document.getElementById('trailerEditMovieYear').value = year || '';

    const btnDelete = document.getElementById('btnDeleteTrailer');
    if (key) {
        btnDelete.style.display = 'inline-block';
    } else {
        btnDelete.style.display = 'none';
    }

    previewAdminTrailer();
    openModal('trailerEditModal');
}

/**
 * Tiện ích: Render Iframe xem trước — hỗ trợ YouTube, Vimeo, và URL trực tiếp
 */
function previewAdminTrailer() {
    let key = document.getElementById('trailerEditInput').value.trim();
    const previewDiv = document.getElementById('trailerEditPreview');
    const iframe = document.getElementById('trailerEditIframe');
    
    if (!key) {
        previewDiv.style.display = 'none';
        iframe.src = '';
        return;
    }

    // Dùng parseTrailerSource (từ tmdb.js) để nhận diện nguồn và tạo embed URL
    if (typeof parseTrailerSource === 'function') {
        const source = parseTrailerSource(key);
        if (source && source.embedUrl) {
            iframe.src = source.embedUrl;
            previewDiv.style.display = 'block';
            return;
        }
    }

    // Fallback: nếu parseTrailerSource chưa load, xử lý cơ bản
    if (key.includes('youtube.com/watch?v=')) {
        key = key.split('v=')[1].split('&')[0];
        document.getElementById('trailerEditInput').value = key;
    } else if (key.includes('youtu.be/')) {
        key = key.split('youtu.be/')[1].split('?')[0];
        document.getElementById('trailerEditInput').value = key;
    }

    if (key.length >= 5) {
        iframe.src = `https://www.youtube.com/embed/${key}`;
        previewDiv.style.display = 'block';
    } else {
        previewDiv.style.display = 'none';
        iframe.src = '';
    }
}

/**
 * Tự động tìm kiếm trailer cho 1 phim khi rỗng
 */
async function autoFetchAdminTrailer() {
    const id = document.getElementById('trailerEditMovieId').value;
    const originTitle = document.getElementById('trailerEditMovieTitle').value;
    const viTitle = document.getElementById('trailerEditMovieTitle').dataset.viTitle || '';
    const year = document.getElementById('trailerEditMovieYear').value;

    const btn = event.currentTarget;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tìm...';
    btn.disabled = true;

    try {
        if (typeof searchTmdbByTitle === 'function' && typeof getTmdbTrailer === 'function') {
            const tmdbResult = await searchTmdbByTitle(originTitle, year, viTitle);
            const tmdbId = tmdbResult ? tmdbResult.id : null;
            const mediaType = tmdbResult ? (tmdbResult.media_type || 'movie') : 'movie';
            
            // getTmdbTrailer hỗ trợ YouTube + Vimeo từ TMDb
            const trailerKey = await getTmdbTrailer(tmdbId, mediaType, originTitle || viTitle, year);
            if (trailerKey) {
                document.getElementById('trailerEditInput').value = trailerKey;
                previewAdminTrailer();
                if (typeof showNotification === 'function') showNotification('Đã tìm thấy Trailer tự động!', 'success');
            } else {
                if (typeof showNotification === 'function') showNotification('Không tìm thấy Trailer trên hệ thống.', 'error');
            }
        } else {
            if (typeof showNotification === 'function') showNotification('Hàm lấy Trailer chưa được tải.', 'error');
        }
    } catch (e) {
        console.error(e);
        if (typeof showNotification === 'function') showNotification('Lỗi khi tự động tìm Trailer.', 'error');
    } finally {
        btn.innerHTML = '<i class="fas fa-search"></i> Tìm Tự Động';
        btn.disabled = false;
    }
}

/**
 * Cập nhật Key lên Database
 */
async function saveAdminTrailer() {
    const id = document.getElementById('trailerEditMovieId').value;
    const key = document.getElementById('trailerEditInput').value.trim();

    if (!id || !window.supabase) return;

    try {
        const btn = event.currentTarget || document.querySelector('#trailerEditModal .btn-primary');
        const defaultText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> LƯU...';
        btn.disabled = true;

        const { error } = await window.supabase
            .from('movies')
            .update({ tmdb_trailer_key: key })
            .eq('id', id);

        if (error) throw error;

        // Cập nhật lại trong mảng local
        const movie = allTrailersData.find(m => m.id === id);
        if (movie) movie.tmdb_trailer_key = key;

        if (typeof showNotification === 'function') showNotification('Cập nhật Trailer thành công!', 'success');
        closeModal('trailerEditModal');
        
        updateTrailersStats(allTrailersData);
        filterAdminTrailers(); // Render lại phần đang xem

    } catch (e) {
        console.error(e);
        if (typeof showNotification === 'function') showNotification('Lỗi khi lưu Trailer: ' + e.message, 'error');
    } finally {
        const btn = document.querySelector('#trailerEditModal .btn-primary');
        if (btn) {
            btn.innerHTML = 'Lưu Trailer';
            btn.disabled = false;
        }
    }
}

/**
 * Xóa Trailer khỏi database
 */
async function deleteAdminTrailer() {
    if (!confirm('Bạn có chắc muốn xóa Trailer của phim này?')) return;
    document.getElementById('trailerEditInput').value = '';
    await saveAdminTrailer();
}
