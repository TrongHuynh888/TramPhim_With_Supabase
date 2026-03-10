/**
 * SINGLE MOVIES PAGE LOGIC
 * Overrides standard functions to filter for single movies only.
 */

window.renderSingleMoviesPage = function() {
    console.log("🎬 Rendering Single Movies Page...");
    const container = document.getElementById("singleMoviesGrid");
    if (!container) return;

    // Use global allMovies
    let source = (typeof allMovies !== 'undefined') ? allMovies : [];
    if (!Array.isArray(source)) source = [];
    
    // 1. Populate filters if empty
    populateSingleFilters(source);

    // 2. Apply filters (Initial render)
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
    
    // Filter
    const filteredData = source.map(m => {
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

    console.log(`✅ [Phim Lẻ] Tìm thấy ${filteredData.length} phim thỏa mãn.`);

    // Render
    if (filteredData.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">Không tìm thấy phim phù hợp.</p>';
    } else {
        container.innerHTML = filteredData.map(item => createMovieCard(item.movie, item.matchedTags)).join("");
    }
    
    // Hiển thị tóm tắt kết quả (Categories, Countries, Years)
    if (typeof updateFilterSummary === 'function') {
        updateFilterSummary(genres, countries, years, source.filter(m => m.type === 'single'), "singleFilterResultSummary");
    }
};

// Deprecated wrapper
window.searchSingleMoviesPage = window.filterSingleMovies;
