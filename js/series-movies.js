/**
 * SERIES MOVIES PAGE LOGIC
 * Overrides standard functions to filter for series movies only.
 */

window.renderSeriesMoviesPage = function() {
    console.log("🎬 Rendering Series Movies Page...");
    const container = document.getElementById("seriesMoviesGrid");
    if (!container) return;

    // Use global allMovies
    let source = (typeof allMovies !== 'undefined') ? allMovies : [];
    if (!Array.isArray(source)) source = [];
    
    // 1. Populate filters if empty
    populateSeriesFilters(source);

    // 2. Apply filters (Initial render)
    filterSeriesMovies();
};

// --- POPULATE FILTERS ---
function populateSeriesFilters(source) {
    // Genres
    const catList = document.getElementById("listSeriesCategory");
    const catInput = document.getElementById("inputSeriesCategory");
    if (catList && catInput) {
        let genres = [];
        if (typeof allCategories !== 'undefined' && allCategories.length > 0) {
            genres = allCategories.map(c => c.name);
        } else {
            const set = new Set();
            source.forEach(m => { if(m.type === 'series' && m.category) set.add(m.category) });
            genres = [...set].sort();
        }
        const categories = ['Tất cả thể loại', ...genres];
        initFilterBox("boxSeriesCategory", catInput, catList, categories, 'filterSeriesMovies');
    }

    // Countries
    const countryList = document.getElementById("listSeriesCountry");
    const countryInput = document.getElementById("inputSeriesCountry");
    if (countryList && countryInput) {
         let countriesList = [];
         if (typeof allCountries !== 'undefined' && allCountries.length > 0) {
             countriesList = allCountries.map(c => c.name);
         } else {
             const set = new Set();
             source.forEach(m => { if(m.type === 'series' && m.country) set.add(m.country) });
             countriesList = [...set].sort();
         }
         const countries = ['Tất cả quốc gia', ...countriesList];
         initFilterBox("boxSeriesCountry", countryInput, countryList, countries, 'filterSeriesMovies');
    }

    // Years (Extract from series movies)
    const yearList = document.getElementById("listSeriesYear");
    const yearInput = document.getElementById("inputSeriesYear");
    if (yearList && yearInput) {
        const yearsSet = new Set();
        source.forEach(m => {
            if (m.type === 'series' && m.year) yearsSet.add(m.year);
        });
        const yearArray = [...yearsSet].sort((a,b) => b-a);
        const years = ['Tất cả năm', ...yearArray];
        initFilterBox("boxSeriesYear", yearInput, yearList, years, 'filterSeriesMovies');
    }
}

// --- FILTER FUNCTION ---
window.filterSeriesMovies = function() {
    const container = document.getElementById("seriesMoviesGrid");
    if (!container) return;

    // Get Filter Values from custom inputs
    const genreStr = document.getElementById("inputSeriesCategory")?.value.trim() || "";
    const countryStr = document.getElementById("inputSeriesCountry")?.value.trim() || "";
    const yearStr = document.getElementById("inputSeriesYear")?.value.trim() || "";
    const searchVal = document.getElementById("searchSeries")?.value.toLowerCase().trim() || "";

    // Chuẩn hóa bộ lọc: Loại bỏ "Tất cả..."
    const genres = genreStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));
    const countries = countryStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));
    const years = yearStr.split(',').map(s => s.trim()).filter(s => s && !s.includes("Tất cả"));

    console.log("🔍 [Phim Bộ] Đang lọc với:", { genres, countries, years, searchVal });

    let source = (typeof allMovies !== 'undefined') ? allMovies : [];
    if (!Array.isArray(source)) source = [];
    
    // Filter
    const filteredData = source.map(m => {
        // 1. Phải là Phim Bộ
        if (m.type !== 'series') return null;

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
            if (matchedGenres.length === 0) return null; // Không khớp thể loại nào trong danh sách chọn -> Loại
            matchedGenres.forEach(cat => matchedTags.push({ type: 'category', icon: 'tag', label: cat }));
        }
        
        // 4. Kiểm tra Quốc gia (AND)
        if (countries.length > 0) {
            // Lấy tên quốc gia thực tế từ ID nếu cần
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

    console.log(`✅ [Phim Bộ] Tìm thấy ${filteredData.length} phim thỏa mãn.`);

    // Render
    if (filteredData.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">Không tìm thấy phim phù hợp.</p>';
    } else {
        container.innerHTML = filteredData.map(item => createMovieCard(item.movie, item.matchedTags)).join("");
    }
    
    // Hiển thị tóm tắt kết quả (Categories, Countries, Years)
    if (typeof updateFilterSummary === 'function') {
        updateFilterSummary(genres, countries, years, source.filter(m => m.type === 'series'), "seriesFilterResultSummary");
    }
};

// Deprecated old search function (redirect to new filter)
window.searchSeriesMovies = window.filterSeriesMovies;
