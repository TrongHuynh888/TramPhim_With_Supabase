/**
 * SINGLE MOVIES PAGE LOGIC
 * Overrides standard functions to filter for single movies only.
 * Có phân trang: 60 phim/trang
 */

// Số phim mỗi trang và trang hiện tại
const SINGLE_PER_PAGE = 60;
let singleCurrentPage = 1;

// Lưu dữ liệu đã lọc để dùng khi chuyển trang (không cần filter lại)
let singleFilteredData = [];

window.renderSingleMoviesPage = function() {
    console.log("🎬 Rendering Single Movies Page...");
    const container = document.getElementById("singleMoviesGrid");
    if (!container) return;

    // Use global allMovies
    let source = (typeof allMovies !== 'undefined') ? allMovies : [];
    if (!Array.isArray(source)) source = [];
    
    // 1. Populate filters if empty
    populateSingleFilters(source);

    // 2. Apply filters (Initial render) - reset về trang 1
    singleCurrentPage = 1;
    filterSingleMovies();
};

// --- POPULATE FILTERS ---
function populateSingleFilters(source) {
    // Genres
    const catList = document.getElementById("listSingleCategory");
    const catInput = document.getElementById("inputSingleCategory");
    if (catList && catInput) {
        let genres = [];
        if (typeof allCategories !== 'undefined' && allCategories.length > 0) {
            genres = allCategories.map(c => c.name);
        } else {
            const set = new Set();
            source.forEach(m => { if(m.type === 'single' && m.category) set.add(m.category) });
            genres = [...set].sort();
        }
        const categories = ['Tất cả thể loại', ...genres];
        initFilterBox("boxSingleCategory", catInput, catList, categories, 'filterSingleMovies');
    }

    // Countries
    const countryList = document.getElementById("listSingleCountry");
    const countryInput = document.getElementById("inputSingleCountry");
    if (countryList && countryInput) {
         let countriesList = [];
         if (typeof allCountries !== 'undefined' && allCountries.length > 0) {
             countriesList = allCountries.map(c => c.name);
         } else {
             const set = new Set();
             source.forEach(m => { if(m.type === 'single' && m.country) set.add(m.country) });
             countriesList = [...set].sort();
         }
         const countries = ['Tất cả quốc gia', ...countriesList];
         initFilterBox("boxSingleCountry", countryInput, countryList, countries, 'filterSingleMovies');
    }

    // Years (Extract from single movies)
    const yearList = document.getElementById("listSingleYear");
    const yearInput = document.getElementById("inputSingleYear");
    if (yearList && yearInput) {
        const yearsSet = new Set();
        source.forEach(m => {
            if (m.type === 'single' && m.year) yearsSet.add(m.year);
        });
        const yearArray = [...yearsSet].sort((a,b) => b-a);
        const years = ['Tất cả năm', ...yearArray];
        initFilterBox("boxSingleYear", yearInput, yearList, years, 'filterSingleMovies');
    }
}

// --- FILTER FUNCTION ---
window.filterSingleMovies = function() {
    const container = document.getElementById("singleMoviesGrid");
    if (!container) return;

    // Get Filter Values from custom inputs
    const genreStr = document.getElementById("inputSingleCategory")?.value.trim() || "";
    const countryStr = document.getElementById("inputSingleCountry")?.value.trim() || "";
    const yearStr = document.getElementById("inputSingleYear")?.value.trim() || "";
    const searchVal = document.getElementById("searchSingleMovies")?.value.toLowerCase().trim() || "";

    // Chuẩn hóa bộ lọc: Loại bỏ "Tất cả..."
    const genres = genreStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));
    const countries = countryStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));
    const years = yearStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));

    console.log("🔍 [Phim Lẻ] Đang lọc với:", { genres, countries, years, searchVal });

    let source = (typeof allMovies !== 'undefined') ? allMovies : [];
    if (!Array.isArray(source)) source = [];
    
    // Filter toàn bộ
    singleFilteredData = source.map(m => {
        // 1. Phải là Phim Lẻ
        if (m.type !== 'single') return null;

        // 2. Ô tìm kiếm (Luôn là AND)
        if (searchVal) {
            const titleMatch = (m.title || "").toLowerCase().includes(searchVal);
            const castMatch = m.cast && m.cast.toLowerCase().includes(searchVal);
            if (!(titleMatch || castMatch)) return null;
        }

        let matchedTags = [];
        
        // 3. Kiểm tra Thể loại (AND với các nhóm khác)
        if (genres.length > 0) {
            const movieCatNames = (m.categories || []).map(catId => {
                const searchId = String(catId).trim().toLowerCase();
                const found = (typeof allCategories !== 'undefined' && allCategories) 
                    ? allCategories.find(c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId) 
                    : null;
                return found ? found.name.toLowerCase() : catId.toLowerCase();
            });
            if (m.category) {
                const searchId = String(m.category).trim().toLowerCase();
                const found = (typeof allCategories !== 'undefined' && allCategories) 
                    ? allCategories.find(c => c.id.toLowerCase() === searchId || c.name.toLowerCase() === searchId) 
                    : null;
                movieCatNames.push(found ? found.name.toLowerCase() : m.category.toLowerCase());
            }

            const matchedGenres = genres.filter(g => movieCatNames.includes(g.toLowerCase()));
            if (matchedGenres.length === 0) return null; // Không khớp thể loại
            matchedGenres.forEach(cat => matchedTags.push({ type: 'category', icon: 'tag', label: cat }));
        }
        
        // 4. Kiểm tra Quốc gia (AND)
        if (countries.length > 0) {
            let movieCountryName = m.country || "";
            const foundCountry = (typeof allCountries !== 'undefined') ? allCountries.find(c => c.id === m.country_id || c.name === m.country) : null;
            if (foundCountry) movieCountryName = foundCountry.name;

            const matchedCountries = countries.filter(c => movieCountryName && c.toLowerCase() === movieCountryName.toLowerCase());
            if (matchedCountries.length === 0) return null; // Không khớp quốc gia
            matchedCountries.forEach(cty => matchedTags.push({ type: 'country', icon: 'globe', label: cty }));
        }
        
        // 5. Kiểm tra Năm (AND)
        if (years.length > 0) {
            const matchedYears = years.filter(y => m.year && y.toString() === m.year.toString());
            if (matchedYears.length === 0) return null; // Không khớp năm
            matchedYears.forEach(y => matchedTags.push({ type: 'year', icon: 'calendar-alt', label: y }));
        }

        return { movie: m, matchedTags };
    }).filter(Boolean);

    console.log(`✅ [Phim Lẻ] Tìm thấy ${singleFilteredData.length} phim thỏa mãn.`);

    // Khi filter mới -> reset về trang 1
    singleCurrentPage = 1;

    // Render trang hiện tại
    _renderSinglePage();

    // Hiển thị tóm tắt kết quả
    if (typeof updateFilterSummary === 'function') {
        updateFilterSummary(genres, countries, years, source.filter(m => m.type === 'single'), "singleFilterResultSummary");
    }
};

/** Render phim theo trang hiện tại và vẽ lại pagination */
function _renderSinglePage() {
    const container = document.getElementById("singleMoviesGrid");
    if (!container) return;

    const total = singleFilteredData.length;
    const totalPages = Math.ceil(total / SINGLE_PER_PAGE);

    // Đảm bảo trang hợp lệ
    if (singleCurrentPage < 1) singleCurrentPage = 1;
    if (singleCurrentPage > totalPages) singleCurrentPage = totalPages || 1;

    const start = (singleCurrentPage - 1) * SINGLE_PER_PAGE;
    const end = start + SINGLE_PER_PAGE;
    const pageData = singleFilteredData.slice(start, end);

    // Render grid
    if (total === 0) {
        container.innerHTML = '<p class="text-center text-muted">Không tìm thấy phim phù hợp.</p>';
    } else {
        container.innerHTML = pageData.map(item => createMovieCard(item.movie, item.matchedTags)).join("");
    }

    // Render pagination UI
    _renderSinglePagination(total, totalPages);

    // Cuộn lên đầu grid khi chuyển trang
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Vẽ UI phân trang cho Phim Lẻ */
function _renderSinglePagination(total, totalPages) {
    let paginationEl = document.getElementById("singleMoviesPagination");
    if (!paginationEl) return;

    if (total === 0 || totalPages <= 1) {
        paginationEl.innerHTML = '';
        paginationEl.style.display = 'none';
        return;
    }

    paginationEl.style.display = 'flex';

    const page = singleCurrentPage;
    const start = (page - 1) * SINGLE_PER_PAGE + 1;
    const end = Math.min(page * SINGLE_PER_PAGE, total);

    // Tạo danh sách số trang hiển thị (tối đa 5 trang xung quanh trang hiện tại)
    let pages = [];
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
        pages.push(i);
    }

    paginationEl.innerHTML = `
        <span class="pagination-info">Hiển thị ${start}–${end} / ${total} phim lẻ</span>
        <div class="pagination-controls">
            <button class="btn-page" onclick="changeSinglePage(1)" ${page === 1 ? 'disabled' : ''} title="Trang đầu">
                <i class="fas fa-angle-double-left"></i>
            </button>
            <button class="btn-page" onclick="changeSinglePage(${page - 1})" ${page === 1 ? 'disabled' : ''} title="Trang trước">
                <i class="fas fa-angle-left"></i>
            </button>
            ${pages.map(p => `
                <button class="btn-page ${p === page ? 'active' : ''}" onclick="changeSinglePage(${p})">${p}</button>
            `).join('')}
            <button class="btn-page" onclick="changeSinglePage(${page + 1})" ${page === totalPages ? 'disabled' : ''} title="Trang sau">
                <i class="fas fa-angle-right"></i>
            </button>
            <button class="btn-page" onclick="changeSinglePage(${totalPages})" ${page === totalPages ? 'disabled' : ''} title="Trang cuối">
                <i class="fas fa-angle-double-right"></i>
            </button>
        </div>
        <div class="pagination-jump">
            <span>Đến trang</span>
            <input type="number" min="1" max="${totalPages}" value="${page}" id="singlePaginationJump" class="jump-input"
                onkeydown="if(event.key==='Enter') changeSinglePage(parseInt(this.value))">
            <button class="btn-jump" onclick="changeSinglePage(parseInt(document.getElementById('singlePaginationJump').value))">→</button>
        </div>
    `;
}

/** Chuyển trang Phim Lẻ */
window.changeSinglePage = function(page) {
    const totalPages = Math.ceil(singleFilteredData.length / SINGLE_PER_PAGE);
    if (isNaN(page) || page < 1 || page > totalPages) return;
    singleCurrentPage = page;
    _renderSinglePage();
};

// Deprecated wrapper
window.searchSingleMoviesPage = window.filterSingleMovies;
