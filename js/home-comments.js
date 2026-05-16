/**
 * HOME TOP COMMENTS — Hiển thị Top Bình Luận trên trang chủ
 * Carousel ngang hiển thị các bình luận có rating cao + nhiều reaction nhất
 */

/**
 * Load và hiển thị Top Bình Luận trên trang chủ
 */
async function loadTopComments() {
    const container = document.getElementById('topCommentsTrack');
    if (!container || !supabase) {
        console.warn('Top Comments: container hoặc supabase chưa sẵn sàng');
        return;
    }

    try {
        console.log('🔄 Đang load Top Bình Luận...');

        // Query top comments: có rating cao, join profiles để lấy tên + avatar
        // KHÔNG join movies vì movie_id là text, không phải foreign key
        const { data, error } = await supabase
            .from('comments')
            .select('id, content, rating, reactions, reaction_summary, created_at, movie_id, user_id, profiles(display_name, avatar)')
            .not('rating', 'is', null)
            .gt('rating', 0)
            .order('rating', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(15);

        if (error) {
            console.error('Lỗi query top comments:', error);
            return;
        }

        if (!data || data.length === 0) {
            console.log('Top Comments: Không có dữ liệu');
            const section = document.getElementById('topCommentsSection');
            if (section) section.style.display = 'none';
            return;
        }

        console.log(`✅ Đã load ${data.length} top comments`);

        // Sắp xếp thêm theo tổng reactions
        const sorted = data.sort((a, b) => {
            const reactA = countTotalReactions(a.reaction_summary);
            const reactB = countTotalReactions(b.reaction_summary);
            if (b.rating !== a.rating) return b.rating - a.rating;
            return reactB - reactA;
        }).slice(0, 10);

        // Render cards
        container.innerHTML = sorted.map(comment => createTopCommentCard(comment)).join('');

        // Hiện section
        const section = document.getElementById('topCommentsSection');
        if (section) section.style.display = 'block';

    } catch (err) {
        console.error('Lỗi load top comments:', err);
    }
}

/**
 * Đếm tổng reactions của 1 comment
 */
function countTotalReactions(reactionSummary) {
    if (!reactionSummary || typeof reactionSummary !== 'object') return 0;
    return Object.values(reactionSummary).reduce((sum, count) => sum + (count || 0), 0);
}

/**
 * Lấy thông tin phim từ allMovies array (đã load sẵn trên trang chủ)
 */
function getMovieInfoById(movieId) {
    if (typeof allMovies !== 'undefined' && allMovies && allMovies.length > 0) {
        const movie = allMovies.find(m => m.id === movieId);
        if (movie) {
            return {
                title: movie.title || movie.name || 'Phim',
                poster: movie.posterUrl || movie.poster || ''
            };
        }
    }
    return { title: 'Phim', poster: '' };
}

/**
 * Tạo HTML card cho mỗi comment
 */
function createTopCommentCard(comment) {
    const userName = comment.profiles?.display_name || 'Người dùng';
    const userAvatar = comment.profiles?.avatar || '';
    const initial = userName[0].toUpperCase();

    // Lấy thông tin phim từ allMovies
    const movieInfo = getMovieInfoById(comment.movie_id);
    const movieTitle = movieInfo.title;
    const moviePoster = movieInfo.poster;

    const content = comment.content || '';
    const rating = comment.rating || 0;
    const totalReactions = countTotalReactions(comment.reaction_summary);

    // Truncate nội dung (max 100 ký tự)
    const truncated = content.length > 100 ? content.substring(0, 100) + '...' : content;

    // Avatar HTML
    const avatarHtml = userAvatar && userAvatar.startsWith('http')
        ? `<img src="${userAvatar}" alt="${initial}" onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=random'">`
        : `<div class="tc-avatar-letter">${initial}</div>`;

    // Thời gian
    let timeAgo = '';
    if (comment.created_at) {
        timeAgo = formatTopCommentTime(new Date(comment.created_at));
    }

    // Render rating stars (thang 5 sao)
    let starsHtml = '';
    if (rating > 0) {
        for (let i = 0; i < 5; i++) {
            starsHtml += i < rating
                ? '<i class="fas fa-star"></i>'
                : '<i class="far fa-star"></i>';
        }
    }

    // Render reaction summary icons (top 3)
    let reactionIcons = '';
    if (comment.reaction_summary && typeof comment.reaction_summary === 'object') {
        const emojiMap = { like: '👍', heart: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡' };
        const entries = Object.entries(comment.reaction_summary)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        reactionIcons = entries.map(([type]) => emojiMap[type] || '').join(' ');
    }

    // Escape text an toàn (dùng hàm escapeHtml nếu có, không thì fallback)
    const safeName = typeof escapeHtml === 'function' ? escapeHtml(userName) : userName;
    const safeContent = typeof escapeHtml === 'function' ? escapeHtml(truncated) : truncated;
    const safeMovie = typeof escapeHtml === 'function' ? escapeHtml(movieTitle) : movieTitle;

    return `
        <div class="tc-card" onclick="navigateToMovie('${comment.movie_id}', '${comment.id}')">
            ${moviePoster ? `<div class="tc-card-bg" style="background-image:url('${moviePoster}')"></div>` : ''}
            <div class="tc-card-content">
                <div class="tc-top-row">
                    <div class="tc-user-info">
                        <div class="tc-avatar">${avatarHtml}</div>
                        <div class="tc-user-detail">
                            <span class="tc-user-name">${safeName}</span>
                            <span class="tc-time">${timeAgo}</span>
                        </div>
                    </div>
                    ${moviePoster ? `<div class="tc-poster"><img src="${moviePoster}" alt="${safeMovie}" onerror="this.style.display='none'"></div>` : ''}
                </div>
                <p class="tc-comment-text">${safeContent}</p>
                <div class="tc-movie-tag">
                    <i class="fas fa-film"></i> ${safeMovie}
                </div>
                <div class="tc-footer">
                    ${starsHtml ? `<div class="tc-stars">${starsHtml} <span>${rating}/5</span></div>` : ''}
                    ${totalReactions > 0 ? `<div class="tc-reactions">${reactionIcons} <span>${totalReactions}</span></div>` : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Format thời gian tương đối cho top comment
 */
function formatTopCommentTime(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
    if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
    if (diff < 604800) return Math.floor(diff / 86400) + ' ngày trước';
    if (diff < 2592000) return Math.floor(diff / 604800) + ' tuần trước';
    return Math.floor(diff / 2592000) + ' tháng trước';
}

/**
 * Điều hướng đến trang giới thiệu phim và cuộn đến bình luận cụ thể
 */
function navigateToMovie(movieId, commentId) {
    if (!movieId) return;

    // Lưu commentId để cuộn đến sau khi load xong
    if (commentId) {
        window._pendingScrollCommentId = commentId;
    }

    // Luôn mở trang giới thiệu (intro), không mở trang chi tiết
    if (typeof viewMovieIntro === 'function') {
        viewMovieIntro(movieId);
    }

    // Chờ comments load xong rồi cuộn đến comment
    if (commentId) {
        const tryScroll = (retries) => {
            if (retries <= 0) return;
            const target = document.getElementById('intro-comment-' + commentId)
                       || document.getElementById('comment-' + commentId);
            if (target) {
                // Cuộn đến comment
                setTimeout(() => {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight nổi bật
                    target.classList.add('tc-highlight');
                    setTimeout(() => target.classList.remove('tc-highlight'), 3000);
                }, 300);
                window._pendingScrollCommentId = null;
            } else {
                // Thử lại sau 500ms (chờ comments render)
                setTimeout(() => tryScroll(retries - 1), 500);
            }
        };
        setTimeout(() => tryScroll(10), 1000);
    }
}

/**
 * Scroll carousel Top Comments
 */
function scrollTopComments(direction) {
    const track = document.getElementById('topCommentsTrack');
    if (!track) return;
    const scrollAmount = 320;
    track.scrollBy({
        left: direction === 'next' ? scrollAmount : -scrollAmount,
        behavior: 'smooth'
    });
}

// Auto load khi trang chủ hiện — chờ allMovies và supabase sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof supabase !== 'undefined' && supabase) {
            loadTopComments();
            loadHomeStats();
        }
    }, 3000);
});

// ============================================
// THỐNG KÊ GRID 5 CỘT — TRANG CHỦ
// ============================================

/**
 * Load tất cả 5 cột thống kê — tải xếp hạng cũ trước rồi render
 */
async function loadHomeStats() {
    await loadPreviousRankings();
    loadHottestMovies();
    loadWeeklyFavorites();
    loadHotCategories();
    loadRecentComments();
    subscribeRecentComments();
    loadReviewsList();
}

// Lưu xếp hạng hôm qua để so sánh trend
let _previousRankings = { hottest: {}, weekly: {}, categories: {} };

/**
 * Lấy ngày hôm nay dạng YYYY-MM-DD
 */
function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Load xếp hạng hôm qua từ Supabase
 */
async function loadPreviousRankings() {
    if (!supabase) return;
    try {
        const today = getTodayStr();
        const { data, error } = await supabase
            .from('rankings')
            .select('type, item_key, rank, snapshot_date')
            .lt('snapshot_date', today)
            .order('snapshot_date', { ascending: false })
            .limit(30);

        if (error || !data || !data.length) return;

        // Chỉ lấy snapshot gần nhất
        const latestDate = data[0].snapshot_date;
        data.filter(r => r.snapshot_date === latestDate).forEach(r => {
            if (!_previousRankings[r.type]) _previousRankings[r.type] = {};
            _previousRankings[r.type][r.item_key] = r.rank;
        });
        console.log('📊 Rankings: loaded previous from', latestDate);
    } catch (e) {
        console.warn('Rankings: lỗi load:', e);
    }
}

/**
 * Lưu snapshot xếp hạng
 * - hottest: 1 giờ/lần
 * - categories: 1 ngày/lần
 * - weekly: 7 ngày/lần
 */
async function saveRankingSnapshot(type, items) {
    if (!supabase) return;
    try {
        const today = getTodayStr();

        // Lấy snapshot gần nhất (dùng created_at cho kiểm tra giờ)
        const { data: latest } = await supabase
            .from('rankings')
            .select('snapshot_date, created_at')
            .eq('type', type)
            .order('created_at', { ascending: false })
            .limit(1);

        if (latest && latest.length > 0) {
            if (type === 'hottest') {
                // Kiểm tra theo giờ — 1h mới lưu lại
                const lastTime = new Date(latest[0].created_at);
                const hoursDiff = (Date.now() - lastTime.getTime()) / (1000 * 60 * 60);
                if (hoursDiff < 1) return;
            } else {
                // Kiểm tra theo ngày
                const lastDate = new Date(latest[0].snapshot_date);
                const now = new Date(today);
                const daysDiff = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
                const interval = type === 'weekly' ? 7 : 1;
                if (daysDiff < interval) return;
            }
        }

        const rows = items.map((item, i) => ({
            type, item_key: item.key, item_name: item.name,
            rank: i + 1, score: item.score || 0, snapshot_date: today
        }));

        const { error } = await supabase.from('rankings').insert(rows);
        if (error) console.warn('Rankings save error:', error);
        else console.log('📊 Rankings: saved', type, 'for', today);
    } catch (e) {
        console.warn('Rankings save exception:', e);
    }
}

/**
 * Icon trend dựa trên hạng cũ vs hạng mới
 * - Lửa vàng: mới hoặc nhảy vọt >3 bậc
 * - Xanh lá: tăng hạng
 * - Đỏ: giảm hạng
 * - Xám: giữ nguyên
 */
function getTrendIcon(type, itemKey, currentRank) {
    const prev = _previousRankings[type]?.[itemKey];
    if (prev === undefined || prev === null) {
        return '<i class="fas fa-chart-line" style="color:#facc15" title="Mới"></i>';
    }
    const diff = prev - currentRank;
    if (diff > 3) {
        return '<i class="fas fa-chart-line" style="color:#facc15" title="Tăng vọt +' + diff + '"></i>';
    } else if (diff > 0) {
        return '<i class="fas fa-chart-line" style="color:#22c55e" title="Tăng +' + diff + '"></i>';
    } else if (diff < 0) {
        return '<i class="fas fa-chart-line" style="color:#ec4899;transform:scaleY(-1)" title="Giảm ' + diff + '"></i>';
    }
    return '<i class="fas fa-minus" style="color:#6b7280" title="Giữ nguyên"></i>';
}

/**
 * 1. SÔI NỔI NHẤT — Top phim views cao nhất
 */
function loadHottestMovies() {
    const list = document.getElementById('hsHottestList');
    if (!list || typeof allMovies === 'undefined' || !allMovies.length) return;

    const top = [...allMovies].filter(m => m.views > 0)
        .sort((a, b) => (b.views || 0) - (a.views || 0));
    const top5 = top.slice(0, 5);
    const top10 = top.slice(0, 10);

    if (!top5.length) { list.innerHTML = '<li class="hs-empty">Chưa có dữ liệu</li>'; return; }

    saveRankingSnapshot('hottest', top10.map(m => ({ key: m.id, name: m.title || 'Phim', score: m.views || 0 })));

    list.innerHTML = top5.map((m, i) => {
        const safeTitle = typeof escapeHtml === 'function' ? escapeHtml(m.title || 'Phim') : (m.title || 'Phim');
        const poster = m.posterUrl || m.poster || '';
        const trend = getTrendIcon('hottest', m.id, i + 1);
        return `<li onclick="viewMovieIntro('${m.id}')" title="${safeTitle}">
            <span class="hs-rank">${i + 1}.</span>
            <span class="hs-trend">${trend}</span>
            ${poster ? `<img class="hs-thumb" src="${poster}" alt="" onerror="this.style.display='none'">` : '<span class="hs-no-thumb">🎬</span>'}
            <span class="hs-movie-name">${safeTitle}</span>
        </li>`;
    }).join('');
}

/**
 * 2. YÊU THÍCH TUẦN — Top phim rating cao nhất
 */
function loadWeeklyFavorites() {
    const list = document.getElementById('hsWeeklyList');
    if (!list || typeof allMovies === 'undefined' || !allMovies.length) return;

    const top = [...allMovies].filter(m => m.rating && parseFloat(m.rating) > 0)
        .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));
    const top5 = top.slice(0, 5);
    const top10 = top.slice(0, 10);

    if (!top5.length) { list.innerHTML = '<li class="hs-empty">Chưa có dữ liệu</li>'; return; }

    saveRankingSnapshot('weekly', top10.map(m => ({ key: m.id, name: m.title || 'Phim', score: parseFloat(m.rating || 0) })));

    list.innerHTML = top5.map((m, i) => {
        const safeTitle = typeof escapeHtml === 'function' ? escapeHtml(m.title || 'Phim') : (m.title || 'Phim');
        const poster = m.posterUrl || m.poster || '';
        const trend = getTrendIcon('weekly', m.id, i + 1);
        return `<li onclick="viewMovieIntro('${m.id}')" title="${safeTitle}">
            <span class="hs-rank">${i + 1}.</span>
            <span class="hs-trend">${trend}</span>
            ${poster ? `<img class="hs-thumb" src="${poster}" alt="" onerror="this.style.display='none'">` : '<span class="hs-no-thumb">🎬</span>'}
            <span class="hs-movie-name">${safeTitle}</span>
        </li>`;
    }).join('');
}

/**
 * 3. THỂ LOẠI HOT — Top thể loại nhiều phim nhất
 */
function loadHotCategories() {
    const list = document.getElementById('hsHotCategoryList');
    if (!list || typeof allCategories === 'undefined' || typeof allMovies === 'undefined') return;

    const catCount = {};
    allMovies.forEach(m => {
        const cats = m.categories || (m.category ? [m.category] : []);
        cats.forEach(catId => {
            const id = String(catId).trim().toLowerCase();
            catCount[id] = (catCount[id] || 0) + 1;
        });
    });

    const sorted = Object.entries(catCount)
        .map(([id, count]) => {
            const found = (typeof allCategories !== 'undefined' && allCategories)
                ? allCategories.find(c => c.id.toLowerCase() === id || c.name.toLowerCase() === id)
                : null;
            return { id, name: found ? found.name : id, count };
        })
        .sort((a, b) => b.count - a.count);
    const top5 = sorted.slice(0, 5);
    const top10 = sorted.slice(0, 10);

    if (!top5.length) { list.innerHTML = '<li class="hs-empty">Chưa có dữ liệu</li>'; return; }

    saveRankingSnapshot('categories', top10.map(c => ({ key: c.id, name: c.name, score: c.count })));

    list.innerHTML = top5.map((cat, i) => {
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(cat.name) : cat.name;
        const trend = getTrendIcon('categories', cat.id, i + 1);
        return `<li>
            <span class="hs-rank">${i + 1}.</span>
            <span class="hs-trend">${trend}</span>
            <span class="hs-cat-name">${safeName}</span>
        </li>`;
    }).join('');
}

/**
 * 4. BÌNH LUẬN MỚI — 4 comments gần đây nhất
 */
async function loadRecentComments() {
    const container = document.getElementById('hsRecentComments');
    if (!container || !supabase) return;

    try {
        const { data, error } = await supabase
            .from('comments')
            .select('id, content, movie_id, user_id, created_at, profiles(display_name, avatar)')
            .is('parent_id', null)
            .order('created_at', { ascending: false })
            .limit(4);

        if (error) throw error;
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="hs-empty">Chưa có bình luận</div>';
            return;
        }

        container.innerHTML = data.map(c => {
            const name = c.profiles?.display_name || 'Người dùng';
            const avatar = c.profiles?.avatar || '';
            const initial = name[0].toUpperCase();
            const movieInfo = getMovieInfoById(c.movie_id);
            const content = c.content || '';
            const truncated = content.length > 50 ? content.substring(0, 50) + '...' : content;
            const safeName = typeof escapeHtml === 'function' ? escapeHtml(name) : name;
            const safeContent = typeof escapeHtml === 'function' ? escapeHtml(truncated) : truncated;
            const safeMovie = typeof escapeHtml === 'function' ? escapeHtml(movieInfo.title) : movieInfo.title;

            const avatarHtml = avatar && avatar.startsWith('http')
                ? `<img src="${avatar}" alt="${initial}" onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=random'">`
                : `<span class="hs-avatar-letter">${initial}</span>`;

            return `<div class="hs-comment-item" onclick="navigateToMovie('${c.movie_id}', '${c.id}')">
                <div class="hs-comment-avatar">${avatarHtml}</div>
                <div class="hs-comment-body">
                    <span class="hs-comment-user">${safeName}</span> <span class="hs-comment-text">${safeContent}</span>
                    <div class="hs-comment-movie">▸ ${safeMovie}</div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        console.error('Lỗi load recent comments:', e);
    }
}

/**
 * Realtime: tự động cập nhật khi có bình luận mới
 */
function subscribeRecentComments() {
    if (!supabase) return;
    try {
        supabase.channel('home-comments-realtime')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'comments'
            }, () => {
                console.log('🔔 Có bình luận mới — đang cập nhật...');
                loadRecentComments();
            })
            .subscribe();
        console.log('📡 Realtime bình luận mới: đã kết nối');
    } catch (e) {
        console.warn('Realtime subscribe error:', e);
    }
}

/**
 * 5. REVIEW PHIM — 5 reviews dài + rating cao (bình luận chất lượng)
 */
async function loadReviewsList() {
    const container = document.getElementById('hsReviewsList');
    if (!container || !supabase) return;

    try {
        const { data, error } = await supabase
            .from('comments')
            .select('id, content, rating, movie_id, profiles(display_name)')
            .is('parent_id', null)
            .not('rating', 'is', null)
            .gt('rating', 3)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="hs-empty">Chưa có review</div>';
            return;
        }

        // Lọc reviews dài (>30 ký tự) và lấy top 5
        const quality = data
            .filter(c => c.content && c.content.length > 30)
            .slice(0, 5);

        if (quality.length === 0) {
            container.innerHTML = '<div class="hs-empty">Chưa có review</div>';
            return;
        }

        container.innerHTML = quality.map(c => {
            const content = c.content || '';
            const truncated = content.length > 80 ? content.substring(0, 80) + '...' : content;
            const safeContent = typeof escapeHtml === 'function' ? escapeHtml(truncated) : truncated;

            return `<div class="hs-review-item" onclick="navigateToMovie('${c.movie_id}', '${c.id}')">
                <span class="hs-review-icon">▸</span>
                <span class="hs-review-text">${safeContent}</span>
            </div>`;
        }).join('');
    } catch (e) {
        console.error('Lỗi load reviews:', e);
    }
}

// ============================================
// POPUP TOP 10
// ============================================

// Danh sách màu nền cho thể loại
const categoryColors = [
    '#7c3aed', '#dc2626', '#2563eb', '#059669',
    '#d97706', '#db2777', '#4f46e5', '#ea580c',
    '#0d9488', '#be185d'
];

/**
 * Hiển thị popup Top 10
 */
function showHsPopup(type) {
    const overlay = document.getElementById('hsPopupOverlay');
    const titleEl = document.getElementById('hsPopupTitle');
    const listEl = document.getElementById('hsPopupList');
    if (!overlay || !titleEl || !listEl) return;

    let title = '';
    let html = '';

    if (type === 'hottest') {
        title = '🎬 SÔI NỔI NHẤT';
        const top10 = [...(allMovies || [])]
            .filter(m => (m.views || 0) > 0)
            .sort((a, b) => (b.views || 0) - (a.views || 0))
            .slice(0, 10);

        html = top10.map((m, i) => {
            const poster = m.posterUrl || m.poster || '';
            const name = typeof escapeHtml === 'function' ? escapeHtml(m.title || 'Phim') : (m.title || 'Phim');
            const trend = getTrendIcon('hottest', m.id, i + 1);
            return `<div class="hs-popup-item" onclick="closeHsPopup(); viewMovieIntro('${m.id}')">
                <span class="hs-popup-rank">${i + 1}.</span>
                <span class="hs-popup-trend">${trend}</span>
                ${poster ? `<img class="hs-popup-poster" src="${poster}" alt="" onerror="this.style.display='none'">` : ''}
                <span class="hs-popup-name">${name}</span>
            </div>`;
        }).join('');

    } else if (type === 'weekly') {
        title = '💖 YÊU THÍCH TUẦN';
        const top10 = [...(allMovies || [])]
            .filter(m => m.rating && parseFloat(m.rating) > 0)
            .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
            .slice(0, 10);

        html = top10.map((m, i) => {
            const poster = m.posterUrl || m.poster || '';
            const name = typeof escapeHtml === 'function' ? escapeHtml(m.title || 'Phim') : (m.title || 'Phim');
            const trend = getTrendIcon('weekly', m.id, i + 1);
            return `<div class="hs-popup-item" onclick="closeHsPopup(); viewMovieIntro('${m.id}')">
                <span class="hs-popup-rank">${i + 1}.</span>
                <span class="hs-popup-trend">${trend}</span>
                ${poster ? `<img class="hs-popup-poster" src="${poster}" alt="" onerror="this.style.display='none'">` : ''}
                <span class="hs-popup-name">${name}</span>
            </div>`;
        }).join('');

    } else if (type === 'categories') {
        title = '🏷️ THỂ LOẠI HOT';
        // Đếm phim mỗi thể loại
        const catCount = {};
        (allMovies || []).forEach(m => {
            const cats = m.categories || (m.category ? [m.category] : []);
            cats.forEach(catId => {
                const id = String(catId).trim().toLowerCase();
                catCount[id] = (catCount[id] || 0) + 1;
            });
        });

        const sorted = Object.entries(catCount)
            .map(([id, count]) => {
                const found = (typeof allCategories !== 'undefined' && allCategories)
                    ? allCategories.find(c => c.id.toLowerCase() === id || c.name.toLowerCase() === id)
                    : null;
                return { id, name: found ? found.name : id, count };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        html = sorted.map((cat, i) => {
            const color = categoryColors[i % categoryColors.length];
            const safeName = typeof escapeHtml === 'function' ? escapeHtml(cat.name) : cat.name;
            const trend = getTrendIcon('categories', cat.id, i + 1);
            return `<div class="hs-popup-item">
                <span class="hs-popup-rank">${i + 1}.</span>
                <span class="hs-popup-trend">${trend}</span>
                <span class="hs-popup-tag" style="background:${color}">${safeName}</span>
            </div>`;
        }).join('');
    }

    if (!html) {
        html = '<div class="hs-empty" style="text-align:center;padding:30px;">Chưa có dữ liệu</div>';
    }

    titleEl.innerHTML = title;
    listEl.innerHTML = html;
    overlay.classList.add('active');
}

/**
 * Đóng popup
 */
function closeHsPopup() {
    const overlay = document.getElementById('hsPopupOverlay');
    if (overlay) overlay.classList.remove('active');
}
