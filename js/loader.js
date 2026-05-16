/**
 * HÀM LOAD COMPONENT
 * Nhiệm vụ: Tải file HTML con và gắn vào thẻ div giữ chỗ
 */
async function loadComponent(elementId, filePath) {
  try {
    // Thêm timestamp để tránh cache
    const url = filePath + "?v=" + new Date().getTime();
    console.log("📥 Đang tải:", url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Không thể tải ${filePath}`);

    const html = await response.text();
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = html;
      console.log(`✅ Đã tải xong: ${filePath} (${html.length} bytes)`);
    } else {
      console.error(`❌ Không tìm thấy chỗ gắn cho ${elementId}`);
    }
  } catch (error) {
    console.error(`❌ Lỗi tải file ${filePath}:`, error);
  }
}

/**
 * KHỞI CHẠY ỨNG DỤNG
 * 1. Tải hết HTML về.
 * 2. Sau đó mới báo cho app.js chạy.
 */
async function initApp() {
  console.log("⏳ Đang tải các thành phần giao diện...");

  // 1. Tải HTML (Giữ nguyên code cũ của bạn)
  await Promise.all([
    loadComponent("modals-container", "./components/modals.html"),
    loadComponent("admin-container", "./components/admin.html"),
    loadComponent("movieIntroPage", "./components/intro.html"),
    loadComponent("seriesMoviesPage", "./components/series-movies.html"),
    loadComponent("singleMoviesPage", "./components/single-movies.html"),
  ]);

  console.log("🎉 Giao diện đã tải xong! Khởi động logic...");

  // 👇 2. QUAN TRỌNG: PHẢI CÓ DÒNG NÀY ĐỂ CHẠY WEB 👇
  if (typeof window.startTramPhimApp === "function") {
    window.startTramPhimApp();
  } else {
    console.error(
      "❌ Lỗi: Không tìm thấy hàm startTramPhimApp trong main.js",
    );
  }
}

// Gọi hàm initApp khi file load

// Chạy hàm này khi trang web vừa mở
document.addEventListener("DOMContentLoaded", initApp);
