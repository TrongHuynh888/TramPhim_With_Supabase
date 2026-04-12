// ============================================
// SERVICE WORKER - TRẠM PHIM PWA
// Quản lý cache & offline cho ứng dụng
// ============================================

const CACHE_VERSION = 'tramphim-v3';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// Danh sách file App Shell cần cache ngay lập tức khi cài app (Pre-cache)
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  // CSS chính
  '/css/variables.css',
  '/css/base.css',
  '/css/components.css',
  '/css/layout.css',
  '/css/responsive.css',
  '/css/detail-redesign.css',
  '/css/watch-party.css',
  '/css/community.css',
  '/css/intro.css',
  '/css/upgrade.css',
  '/css/admin.css',
  '/css/admin-api-explorer.css',
  '/css/admin-api-keys.css',
  '/css/policy.css',
  // JS chính
  '/js/main.js',
  '/js/home.js',
  '/js/detail.js',
  '/js/auth.js',
  '/js/data.js',
  '/js/utils.js',
  '/js/user.js',
  '/js/banner-slider.js',
  '/js/watch-party.js',
  '/js/community.js',
  '/js/notifications.js',
  '/js/site-frontend.js',
  '/js/emoji-picker.js',
  '/js/home-comments.js',
  '/js/actors.js',
  '/js/series-movies.js',
  '/js/single-movies.js',
  '/js/intro.js',
  '/js/loader.js',
  '/js/globals.js',
  '/js/upgrade.js',
  '/js/tmdb.js',
  '/js/firebase-config.js',
  '/js/supabase-config.js',
  '/js/web3-config.js',
  '/js/contact-admin.js',
  // Icons
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  // Images
  '/images/logoTramPhim.png',
  // Manifest
  '/manifest.json'
];

// Danh sách domain bên thứ 3 cần cache (CDN fonts, icons)
const EXTERNAL_CACHE_URLS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com'
];

// Domain Cloudflare R2 — ảnh poster phim lưu trữ tại đây
const R2_DOMAINS = [
  'r2-uploader.thinhnd-2003.workers.dev',
  '.r2.dev'
];

// ============================================
// SỰ KIỆN INSTALL: Pre-cache App Shell
// Chạy 1 lần khi Service Worker được cài đặt
// ============================================
self.addEventListener('install', (event) => {
  console.log('[SW] Đang cài đặt Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching App Shell...');
        // Sử dụng addAll nhưng không block nếu một vài file lỗi
        return cache.addAll(APP_SHELL_FILES).catch((err) => {
          console.warn('[SW] Một số file App Shell không cache được:', err);
          // Cache từng file riêng lẻ, bỏ qua lỗi
          return Promise.allSettled(
            APP_SHELL_FILES.map((url) =>
              cache.add(url).catch(() => console.warn(`[SW] Bỏ qua: ${url}`))
            )
          );
        });
      })
      .then(() => {
        // Kích hoạt ngay, không đợi tab cũ đóng
        return self.skipWaiting();
      })
  );
});

// ============================================
// SỰ KIỆN ACTIVATE: Dọn dẹp cache cũ
// Chạy khi phiên bản SW mới thay thế phiên bản cũ
// ============================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker đã kích hoạt!');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // Xóa cache không thuộc phiên bản hiện tại
            return name !== STATIC_CACHE &&
                   name !== DYNAMIC_CACHE &&
                   name !== IMAGE_CACHE;
          })
          .map((name) => {
            console.log(`[SW] Xóa cache cũ: ${name}`);
            return caches.delete(name);
          })
      );
    })
    .then(() => {
      // Chiếm quyền kiểm soát tất cả các tab đang mở
      return self.clients.claim();
    })
  );
});

// ============================================
// SỰ KIỆN FETCH: Điều phối request theo chiến lược cache
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bỏ qua các request không phải GET (POST, PUT, DELETE...)
  if (request.method !== 'GET') return;

  // Bỏ qua các request tới Firebase/Supabase API (luôn lấy data mới từ server)
  if (url.hostname.includes('supabase') ||
      url.hostname.includes('firebaseio') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com/identitytoolkit')) {
    return;
  }

  // Bỏ qua chrome-extension và các protocol khác http/https
  if (!url.protocol.startsWith('http')) return;

  // --- CHIẾN LƯỢC 1: CACHE FIRST cho các file tĩnh App Shell ---
  if (isAppShellRequest(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // --- CHIẾN LƯỢC 2: CACHE FIRST cho ảnh từ Cloudflare R2 ---
  // R2 đã set Cache-Control: immutable → ảnh không bao giờ thay đổi → cache vĩnh viễn
  if (isR2Request(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // --- CHIẾN LƯỢC 3: STALE WHILE REVALIDATE cho ảnh khác ---
  if (isImageRequest(url, request)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  // --- CHIẾN LƯỢC 3: CACHE FIRST cho font/icon từ CDN bên ngoài ---
  if (isExternalCacheableRequest(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // --- MẶC ĐỊNH: NETWORK FIRST cho mọi request khác ---
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ============================================
// CÁC HÀM CHIẾN LƯỢC CACHE
// ============================================

/**
 * Cache First: Lấy từ cache trước, nếu không có thì fetch từ mạng rồi cache lại
 * Dùng cho: File CSS, JS, Font, Icon (ít thay đổi)
 */
async function cacheFirst(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Nếu cả cache và network đều lỗi, trả về trang offline
    const cachedFallback = await caches.match('/index.html');
    if (cachedFallback) return cachedFallback;
    return new Response('Không có kết nối mạng', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * Network First: Ưu tiên lấy từ mạng, nếu lỗi mạng thì fallback về cache
 * Dùng cho: Dữ liệu động, trang HTML (cần data mới nhất)
 */
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Fallback cuối cùng: trả về trang chính từ cache
    const fallback = await caches.match('/index.html');
    if (fallback) return fallback;
    return new Response('Không có kết nối mạng', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * Stale While Revalidate: Trả cache ngay lập tức, đồng thời fetch bản mới về cập nhật cache
 * Dùng cho: Ảnh poster phim (hiển thị nhanh, cập nhật ngầm)
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  // Fetch bản mới về cập nhật cache (chạy ngầm)
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => {
      // Lỗi mạng, bỏ qua
    });

  // Trả cache ngay nếu có, không thì đợi fetch
  return cachedResponse || fetchPromise;
}

// ============================================
// CÁC HÀM PHÂN LOẠI REQUEST
// ============================================

/** Kiểm tra request có phải file App Shell không (CSS, JS local) */
function isAppShellRequest(url) {
  const path = url.pathname;
  return (
    path.endsWith('.css') ||
    path.endsWith('.js') ||
    path.endsWith('.html') ||
    path === '/' ||
    path.endsWith('.json') && path.includes('manifest')
  );
}

/** Kiểm tra request có phải ảnh không */
function isImageRequest(url, request) {
  const path = url.pathname;
  const accept = request.headers.get('Accept') || '';
  return (
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.webp') ||
    path.endsWith('.gif') ||
    path.endsWith('.svg') ||
    path.endsWith('.ico') ||
    accept.includes('image/')
  );
}

/** Kiểm tra request tới CDN bên ngoài có nên cache không (fonts, icons) */
function isExternalCacheableRequest(url) {
  return EXTERNAL_CACHE_URLS.some((cacheUrl) => url.href.startsWith(cacheUrl));
}

/** Kiểm tra request có phải ảnh từ Cloudflare R2 không */
function isR2Request(url) {
  return R2_DOMAINS.some((domain) => url.hostname.includes(domain) || url.href.includes(domain));
}

// ============================================
// GIỚI HẠN KÍCH THƯỚC CACHE ẢNH
// Tránh tốn quá nhiều bộ nhớ điện thoại
// ============================================
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // Xóa các item cũ nhất (FIFO)
    await cache.delete(keys[0]);
    return limitCacheSize(cacheName, maxItems);
  }
}

// Giới hạn cache ảnh tối đa 200 ảnh poster
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'cleanImageCache') {
    limitCacheSize(IMAGE_CACHE, 200);
  }
});
