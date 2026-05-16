# 🎬 Trạm Phim — Trải Nghiệm Điện Ảnh Đẳng Cấp

Nền tảng xem phim trực tuyến thế hệ mới — Xem phim chất lượng cao, tạo phòng **Watch Party** xem cùng bạn bè, nhắn tin, gọi điện và tham gia **cộng đồng yêu phim** sôi động.

> 🌐 **Live Demo:** [https://tronghuynh888.github.io/TramPhim/](https://tronghuynh888.github.io/TramPhim/)

---

## 📋 Mục Lục

- [Tổng Quan](#-tổng-quan)
- [Tính Năng](#-tính-năng)
- [Công Nghệ Sử Dụng](#-công-nghệ-sử-dụng)
- [Cấu Trúc Dự Án](#-cấu-trúc-dự-án)
- [Hướng Dẫn Cài Đặt](#-hướng-dẫn-cài-đặt)
- [Triển Khai](#-triển-khai)
- [Responsive Design](#-responsive-design)
- [Xử Lý Lỗi Thường Gặp](#-xử-lý-lỗi-thường-gặp)

---

## 🔍 Tổng Quan

**Trạm Phim** là một SPA (Single Page Application) xem phim trực tuyến được xây dựng hoàn toàn bằng **HTML, CSS và JavaScript thuần (Vanilla JS)**. Dữ liệu được lưu trữ trên **Supabase** (PostgreSQL + Realtime + Auth). Dự án hướng đến trải nghiệm xem phim mượt mà trên mọi thiết bị, kết hợp các tính năng xã hội như **cộng đồng**, **nhắn tin**, **gọi điện P2P** và **xem chung (Watch Party)**.

### Điểm nổi bật:
- 🎥 Kho phim phong phú với player tùy chỉnh (HLS streaming + Native HTML5)
- 👥 Phòng xem chung (Watch Party) — đồng bộ video realtime giữa nhiều người
- 💬 Cộng đồng sôi động — đăng bài, bình luận, kết bạn, nhắn tin, gọi video P2P
- 🔔 Hệ thống thông báo realtime
- ⚙️ Trang Admin đầy đủ — quản lý phim, người dùng, hiệu ứng visual, thống kê
- 🌙 Hỗ trợ Dark/Light theme
- 📱 Responsive cho Mobile, Tablet và PC

---

## ✨ Tính Năng

### 🎬 Xem Phim
| Tính năng | Mô tả |
|-----------|-------|
| **Kho phim** | Danh sách phim với poster, thể loại, quốc gia, năm sản xuất |
| **Phim lẻ / Phim bộ** | Trang riêng cho từng loại phim, dễ tìm kiếm |
| **Player tùy chỉnh** | Điều khiển Play/Pause, tua, âm lượng, tốc độ phát, chất lượng video, PiP, fullscreen |
| **HLS Streaming** | Hỗ trợ phát video HLS (.m3u8) với chọn chất lượng tay/auto |
| **Skip Intro** | Nút bỏ qua intro phim, tự động chuyển tập |
| **Rạp phim (Cinema Mode)** | Tối màn hình xung quanh player để tập trung xem phim |
| **Lịch sử xem** | Tự động lưu tiến trình xem, xem tiếp từ lần trước |
| **Yêu thích & Album** | Lưu phim vào danh sách yêu thích, tạo album cá nhân |
| **Chia sẻ phim** | Chia sẻ link phim qua mạng xã hội |
| **Báo lỗi video** | Người dùng báo cáo video lỗi trực tiếp cho Admin |
| **Reaction** | Gửi emoji reaction khi xem phim |

### 📺 Watch Party (Xem Chung)
| Tính năng | Mô tả |
|-----------|-------|
| **Tạo phòng** | Tạo phòng xem chung (công khai / riêng tư có mật khẩu) |
| **Đồng bộ video** | Host điều khiển video, tất cả thành viên đồng bộ realtime |
| **Chat trong phòng** | Chat trực tiếp khi xem phim cùng nhau |
| **Lịch chiếu** | Đặt lịch chiếu phim cho phòng (hẹn giờ) |
| **Chế độ hiển thị** | Dọc (video trên, chat dưới) hoặc Ngang (video trái 65%, chat phải 35%) |

### 💬 Cộng Đồng
| Tính năng | Mô tả |
|-----------|-------|
| **Bảng tin (Feed)** | Đăng bài viết, hình ảnh, gắn tag phim vào bài đăng |
| **Bình luận & Like** | Bình luận, thả tim bài viết |
| **Kết bạn** | Gửi / nhận lời mời kết bạn, danh sách bạn bè |
| **Nhắn tin (CineChat)** | Chat 1-1 realtime, gửi text, emoji, sticker, hình ảnh, thu hồi tin nhắn |
| **Gọi điện P2P** | Gọi thoại / video call giữa 2 người qua PeerJS (WebRTC) |
| **Mã QR cá nhân** | Mỗi user có mã QR riêng, quét để kết bạn nhanh |
| **Tìm bạn bè** | Tìm kiếm theo tên, @ID hoặc quét mã QR |
| **Ghim / Ẩn / Xóa hội thoại** | Quản lý danh sách chat linh hoạt |
| **Trạng thái online** | Hiển thị bạn bè đang online/offline |

### 🔔 Thông Báo
| Tính năng | Mô tả |
|-----------|-------|
| **Realtime** | Thông báo push realtime qua Supabase Realtime |
| **Phân loại** | Tab Phim và tab Cộng đồng riêng biệt |
| **Âm thanh** | Tiếng thông báo khi có tin nhắn / cuộc gọi mới |
| **Đánh dấu đã đọc** | Đánh dấu từng cái hoặc tất cả |

### 🛡️ Admin Panel
| Tính năng | Mô tả |
|-----------|-------|
| **Dashboard** | Thống kê tổng quan: số phim, lượt xem, user, biểu đồ phân tích |
| **Quản lý phim** | Thêm / sửa / xóa phim, quản lý tập phim, kéo thả sắp xếp tập |
| **Quản lý diễn viên** | CRUD diễn viên / đạo diễn, import từ API bên ngoài |
| **Quản lý thể loại & quốc gia** | CRUD danh mục |
| **Quản lý người dùng** | Xem danh sách, phân quyền Admin |
| **Quản lý bình luận** | Duyệt, xóa bình luận của user |
| **Quản lý Watch Party** | Giám sát & xóa phòng xem chung |
| **Báo lỗi video** | Xem và xử lý báo cáo lỗi từ người dùng |
| **Gửi thông báo** | Gửi notification tới tất cả hoặc từng user |
| **Banner Slider** | Quản lý banner trang chủ (kéo thả sắp xếp) |
| **Hiệu ứng visual** | Bật/tắt tuyết rơi, sao rơi, pháo hoa, confetti, mưa, lá rơi... |
| **Marquee & Popup** | Tạo thông báo chạy chữ, popup toàn site với tần suất tùy chỉnh |
| **Tùy chỉnh giao diện** | Đổi màu accent, font chữ, theme mặc định |
| **Quản lý kho avatar** | Upload và quản lý ảnh avatar cho user chọn |

### 👤 Tài Khoản Người Dùng
| Tính năng | Mô tả |
|-----------|-------|
| **Đăng ký / Đăng nhập** | Email + Password qua Supabase Auth |
| **Hồ sơ cá nhân** | Cập nhật tên, avatar (chọn ảnh từ kho hoặc nhập URL) |
| **Mã QR cá nhân** | Tạo mã QR mang thương hiệu Trạm Phim, tải xuống ảnh PNG |
| **Đổi mật khẩu** | Thay đổi mật khẩu trực tiếp |
| **Ví điện tử** | Kết nối Metamask (tính năng thanh toán mở rộng) |

---

## 🛠 Công Nghệ Sử Dụng

| Lĩnh vực | Công nghệ |
|-----------|-----------|
| **Frontend** | HTML5, CSS3 (Vanilla), JavaScript ES6+ |
| **Database & Auth** | [Supabase](https://supabase.com) (PostgreSQL + Realtime + Auth + Storage) |
| **Video Streaming** | [HLS.js](https://github.com/video-dev/hls.js) — phát video HLS (.m3u8) |
| **Video Call P2P** | [PeerJS](https://peerjs.com) — WebRTC wrapper cho gọi thoại/video |
| **QR Code** | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) + [jsQR](https://github.com/nickyit/jsqr) |
| **Biểu đồ** | [Chart.js](https://www.chartjs.org) — Biểu đồ thống kê trong Admin |
| **Kéo thả** | [SortableJS](https://sortablejs.github.io/Sortable/) — Sắp xếp tập phim, banner |
| **Upload ảnh** | [Cloudflare R2](https://developers.cloudflare.com/r2/) — Worker API tải ảnh lên cloud |
| **Emoji** | Emoji picker tùy chỉnh (tự xây dựng) |
| **Build Tool** | [Vite](https://vitejs.dev) — Dev server & build |
| **Hosting** | GitHub Pages / Netlify / Vercel |

---

## 📁 Cấu Trúc Dự Án

```
TramPhim/
│
├── index.html                  # Trang HTML chính (SPA - Single Page)
│
├── components/                 # Các phần HTML được load động
│   ├── admin.html              # Giao diện trang quản trị Admin
│   ├── community.html          # Giao diện cộng đồng (Feed, Chat, Bạn bè)
│   ├── watch-party.html        # Giao diện phòng xem chung
│   ├── modals.html             # Tất cả modal/popup dùng chung
│   ├── intro.html              # Trang giới thiệu phim (Movie Intro)
│   ├── upgrade.html            # Trang nâng cấp tài khoản VIP
│   ├── series-movies.html      # Trang danh sách phim bộ
│   └── single-movies.html      # Trang danh sách phim lẻ
│
├── js/                         # Logic JavaScript (chia nhỏ theo chức năng)
│   ├── main.js                 # Khởi tạo app, điều hướng trang (SPA router)
│   ├── globals.js              # Biến toàn cục dùng chung
│   ├── supabase-config.js      # Cấu hình Supabase client
│   ├── auth.js                 # Xác thực (Đăng ký, Đăng nhập, Đăng xuất)
│   ├── home.js                 # Trang chủ (Featured, New, Country sections)
│   ├── data.js                 # Tải và quản lý dữ liệu phim từ Supabase
│   ├── detail.js               # Trang chi tiết phim + Video Player tùy chỉnh
│   ├── intro.js                # Trang giới thiệu phim (Intro/Landing page)
│   ├── user.js                 # Hồ sơ, yêu thích, album, lịch sử, QR code
│   ├── actors.js               # Trang diễn viên (danh sách + chi tiết)
│   ├── series-movies.js        # Logic trang phim bộ
│   ├── single-movies.js        # Logic trang phim lẻ
│   ├── community.js            # Toàn bộ logic cộng đồng (Feed, Chat, Call, QR)
│   ├── watch-party.js          # Logic Watch Party (tạo phòng, đồng bộ video)
│   ├── admin.js                # Logic Admin Panel (CRUD phim, user, thống kê)
│   ├── notifications.js        # Hệ thống thông báo realtime
│   ├── banner-slider.js        # Banner slider trang chủ
│   ├── emoji-picker.js         # Component chọn emoji tùy chỉnh
│   ├── upgrade.js              # Logic trang nâng cấp VIP
│   ├── utils.js                # Hàm tiện ích dùng chung
│   ├── loader.js               # Loading spinner & hiệu ứng tải trang
│   ├── web3-config.js          # Cấu hình kết nối ví Metamask
│   └── firebase-config.js      # Cấu hình Firebase (legacy backup)
│
├── css/                        # Stylesheets (chia nhỏ theo vùng)
│   ├── variables.css           # Biến CSS toàn cục (màu sắc, font, spacing)
│   ├── base.css                # Reset CSS & style nền tảng
│   ├── layout.css              # Cấu trúc layout chính (Header, Footer, Grid)
│   ├── components.css          # Style cho các component (Card, Modal, Button...)
│   ├── detail-redesign.css     # Giao diện trang chi tiết phim
│   ├── intro.css               # Giao diện trang giới thiệu phim
│   ├── community.css           # Giao diện cộng đồng (Feed, Chat, Profile)
│   ├── watch-party.css         # Giao diện Watch Party
│   ├── admin.css               # Giao diện Admin Panel
│   ├── responsive.css          # Media queries cho Mobile & Tablet
│   ├── upgrade.css             # Style trang nâng cấp
│   └── style.css.old           # File backup cũ (KHÔNG SỬA)
│
├── images/                     # Hình ảnh tĩnh
│   ├── logoTramPhim.png        # Logo chính
│   ├── cinechat_welcome.png    # Ảnh chào mừng CineChat
│   ├── backgroundChat/         # Hình nền cho giao diện chat
│   └── stickers/               # Sticker cho chat
│
├── assets/                     # Tài nguyên media
│   ├── incoming_call.wav       # Chuông cuộc gọi đến
│   ├── calling_tone.wav        # Tiếng tút tút khi gọi đi
│   └── notification.wav        # Âm thanh thông báo
│
├── cloudflare-r2-uploader/     # Worker API upload ảnh lên Cloudflare R2
│   └── src/index.js            # Cloudflare Worker xử lý upload
│
├── package.json                # Dependencies (Vite dev server)
└── todo.md                     # Kế hoạch phát triển
```

---

## 🚀 Hướng Dẫn Cài Đặt

### 1. Clone Repository

```bash
git clone https://github.com/tronghuynh888/TramPhim.git
cd TramPhim
```

### 2. Cài đặt dependencies

```bash
pnpm install
# hoặc
npm install
```

### 3. Cấu hình Supabase

1. Truy cập [Supabase Dashboard](https://supabase.com/dashboard)
2. Tạo project mới
3. Lấy **URL** và **anon key** từ Project Settings → API
4. Mở file `js/supabase-config.js` và cập nhật:

```javascript
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_KEY = "your-anon-key-here";
```

5. Thiết lập các bảng cần thiết trong Supabase (movies, profiles, user_favorites, watch_history, community_posts, community_friends, community_messages, watch_party_rooms, notifications, v.v.)

### 4. Cấu hình Cloudflare R2 (Upload ảnh)

1. Mở thư mục `cloudflare-r2-uploader/`
2. Deploy Worker lên Cloudflare Workers
3. Cập nhật URL Worker vào các file JS liên quan

### 5. Chạy local

```bash
pnpm dev
# hoặc
npm run dev
```

Mở trình duyệt tại `http://localhost:5173`

---

## 🌐 Triển Khai

### GitHub Pages
1. Push code lên GitHub
2. Vào **Settings → Pages**
3. Chọn branch `main`, folder `/ (root)`
4. Website sẽ ở: `https://username.github.io/repo-name`

### Netlify
1. Kết nối GitHub repository
2. Build command: _(để trống)_
3. Publish directory: `.`
4. Deploy

### Vercel
1. Import GitHub repository
2. Framework Preset: **Other**
3. Deploy

---

## 📱 Responsive Design

Website hỗ trợ đầy đủ 3 loại thiết bị:

| Thiết bị | Breakpoint | Đặc điểm |
|----------|------------|-----------|
| 💻 **Desktop** | > 1024px | Layout đầy đủ, sidebar, nhiều cột |
| 📱 **Tablet** | 768px – 1024px | Giao diện thu gọn, 2 cột |
| 📱 **Mobile** | < 768px | Giao diện 1 cột, cuộn dọc tự nhiên |

**Watch Party** có 2 chế độ hiển thị:
- **Dọc (Portrait):** Video trên, Chat bên dưới, cuộn trang tự nhiên
- **Ngang (Landscape):** Chia đôi màn hình — Video 65% trái, Chat 35% phải

---

## 🎨 Tùy Chỉnh Giao Diện

### Thay đổi màu sắc
Mở `css/variables.css` và chỉnh sửa CSS Variables:

```css
:root {
  --accent-primary: #4db8ff;   /* Màu chính (xanh lơ) */
  --accent-secondary: #00d4ff; /* Màu phụ (xanh neon) */
  --bg-primary: #0a0a0f;      /* Màu nền chính */
}
```

Hoặc dùng tính năng **Tùy chỉnh giao diện** trong Admin Panel để đổi màu, font, theme trực tiếp mà không cần sửa code.

---

## 🐛 Xử Lý Lỗi Thường Gặp

| Lỗi | Giải pháp |
|-----|-----------|
| **Supabase không kết nối** | Kiểm tra URL và API key trong `supabase-config.js` |
| **Video không phát** | Kiểm tra link video HLS (.m3u8) có hợp lệ không |
| **Gọi điện P2P thất bại** | Cần HTTPS hoặc localhost, kiểm tra quyền Mic/Cam |
| **Upload ảnh lỗi** | Kiểm tra Cloudflare R2 Worker đã deploy đúng chưa |
| **Giao diện bị cache** | Xóa cache trình duyệt (Ctrl + Shift + R) |
| **Watch Party không đồng bộ** | Đảm bảo host và thành viên đều kết nối cùng phòng |

---

## 📄 License

MIT License — Tự do sử dụng và chỉnh sửa.

## 👨‍💻 Tác Giả

Developed with ❤️ by Trạm Phim Team

---

> **Lưu ý:** Đây là dự án demo/học tập. Khi triển khai production, hãy đảm bảo:
> - Cấu hình Supabase RLS (Row Level Security) phù hợp
> - Bật HTTPS cho tính năng gọi điện P2P
> - Kiểm tra kỹ logic nghiệp vụ và bảo mật
> - Tuân thủ các quy định về bản quyền nội dung
