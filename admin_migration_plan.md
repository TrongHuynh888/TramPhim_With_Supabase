# 🛡️ Kế Hoạch Triển Khai Admin Panel cho Trạm Phim App (React Native)

## Tổng Quan

Dựa trên phân tích bản web cũ, Admin Panel có **19 chức năng** (19 panel/tab) được tổ chức trong sidebar. Tất cả đều giao tiếp với **Supabase** (cùng DB đã kết nối trong app RN).

> [!IMPORTANT]
> Do khối lượng rất lớn (~500KB admin.js + ~100KB admin-episodes.js + ~236KB admin-api-import.js + ~58KB admin-api-keys.js + ~191KB admin.html), việc triển khai được chia thành **5 giai đoạn** theo mức ưu tiên.

---

## 📋 Tổng Hợp 19 Chức Năng Admin (Web Cũ)

| # | Panel ID | Tên | Mô tả | Độ phức tạp |
|---|----------|-----|-------|-------------|
| 1 | `dashboard` | **Dashboard** | 6 stat cards + 4 biểu đồ Chart.js + bảng phim gần đây + hoạt động gần đây | ⭐⭐⭐ |
| 2 | `movies` | **Quản lý Phim** | CRUD phim, lọc/tìm/phân trang, đồng bộ diễn viên, lọc trùng | ⭐⭐⭐⭐⭐ |
| 3 | `episodes` | **Quản lý Tập** | Grid chọn phim → CRUD tập, import batch từ API, lồng tiếng/thuyết minh | ⭐⭐⭐⭐⭐ |
| 4 | `trailers` | **Quản lý Trailer** | CRUD trailer video cho phim | ⭐⭐ |
| 5 | `categories` | **Thể loại** | CRUD thể loại phim | ⭐⭐ |
| 6 | `countries` | **Quốc gia** | CRUD quốc gia, thêm hàng loạt | ⭐⭐ |
| 7 | `actors` | **Diễn viên** | CRUD diễn viên, tìm kiếm, phân trang | ⭐⭐⭐ |
| 8 | `users` | **Người dùng** | Danh sách users, chỉnh role/VIP, ban/unban | ⭐⭐⭐⭐ |
| 9 | `comments` | **Bình luận** | Duyệt/xóa bình luận, lọc theo phim | ⭐⭐⭐ |
| 10 | `transactions` | **Giao dịch** | Xem lịch sử giao dịch CRO | ⭐⭐ |
| 11 | `notifications` | **Thông báo** | Gửi thông báo, lên lịch thông báo, realtime | ⭐⭐⭐ |
| 12 | `vipRequests` | **Yêu cầu VIP** | Duyệt/từ chối yêu cầu nâng cấp VIP | ⭐⭐⭐ |
| 13 | `errorReports` | **Báo lỗi** | Xem/xử lý báo lỗi từ người dùng | ⭐⭐⭐ |
| 14 | `avatarLibrary` | **Kho Avatar** | Upload/quản lý avatar, phân loại danh mục | ⭐⭐ |
| 15 | `watchRooms` | **Quản lý Phòng** | Xem/xóa phòng xem chung (Watch Party) | ⭐⭐ |
| 16 | `visualEffects` | **Giao diện & Hiệu ứng** | Cài đặt hiệu ứng, marquee, popup, theme | ⭐⭐ |
| 17 | `contactRequests` | **Liên hệ** | Đọc/trả lời yêu cầu liên hệ từ user | ⭐⭐ |
| 18 | `apiExplorer` | **Quản lý API** | Tìm/import phim từ API bên ngoài (KKPhim, OPhim, NguonC) | ⭐⭐⭐⭐⭐ |
| 19 | `apiKeys` | **Cấu hình API Key** | Quản lý API keys (Supabase, Firebase, ImgBB, OMDb, TMDb...), Sudo Mode | ⭐⭐⭐⭐ |

---

## 🏗️ Kiến Trúc Đề Xuất (React Native)

```
TramPhim-RN/
├── app/
│   └── admin/
│       ├── _layout.tsx          # Stack layout cho admin (kiểm tra quyền)
│       ├── index.tsx            # Dashboard chính
│       ├── movies/
│       │   ├── index.tsx        # Danh sách phim
│       │   └── [id].tsx         # Sửa phim
│       ├── episodes/
│       │   ├── index.tsx        # Chọn phim → xem tập
│       │   └── [movieId].tsx    # Quản lý tập cho 1 phim
│       ├── categories.tsx       # Quản lý thể loại
│       ├── countries.tsx        # Quản lý quốc gia
│       ├── actors.tsx           # Quản lý diễn viên
│       ├── users.tsx            # Quản lý người dùng
│       ├── comments.tsx         # Quản lý bình luận
│       ├── notifications.tsx    # Quản lý thông báo
│       ├── vip-requests.tsx     # Yêu cầu VIP
│       ├── error-reports.tsx    # Báo lỗi
│       └── settings.tsx         # Cài đặt chung (gộp API Keys + Visual Effects)
├── services/
│   └── admin/
│       ├── statsService.ts      # Dashboard stats
│       ├── movieService.ts      # CRUD phim
│       ├── episodeService.ts    # CRUD tập
│       ├── categoryService.ts   # CRUD thể loại
│       ├── countryService.ts    # CRUD quốc gia
│       ├── actorService.ts      # CRUD diễn viên
│       ├── userService.ts       # Quản lý user
│       ├── commentService.ts    # Quản lý bình luận
│       ├── notificationService.ts # Gửi/quản lý thông báo
│       ├── vipService.ts        # Xử lý VIP
│       └── errorReportService.ts # Xử lý báo lỗi
└── components/
    └── admin/
        ├── AdminHeader.tsx      # Header chung cho admin screens
        ├── StatCard.tsx         # Card thống kê
        ├── AdminSearchBar.tsx   # Thanh tìm kiếm
        ├── AdminTable.tsx       # Bảng dữ liệu tái sử dụng
        ├── Pagination.tsx       # Component phân trang
        └── ConfirmDialog.tsx    # Dialog xác nhận hành động
```

---

## 📅 Giai Đoạn Triển Khai

### 🔴 Giai Đoạn 1: Nền tảng & Dashboard (Ưu tiên CAO)
> Mục tiêu: Xây dựng cấu trúc admin, bảo vệ quyền truy cập, và trang Dashboard tổng quan.

**Screens cần tạo:**
- `app/admin/_layout.tsx` — Stack Navigator + kiểm tra quyền admin
- `app/admin/index.tsx` — Dashboard với 6 stat cards

**Services:**
- `services/admin/statsService.ts` — Query thống kê từ Supabase

**Components:**
- `components/admin/AdminHeader.tsx` — Header với nút back + tiêu đề
- `components/admin/StatCard.tsx` — Card hiển thị số liệu
- `components/admin/AdminMenuItem.tsx` — Menu item cho danh sách chức năng

**Dữ liệu Dashboard (từ admin.js `loadAdminStats()`):**
1. Tổng số phim → `supabase.from('movies').select('*', { count: 'exact', head: true })`
2. Tổng lượt xem → `supabase.from('movies').select('views')` → sum
3. Doanh thu → `supabase.from('transactions').select('amount').eq('status', 'completed')` → sum
4. Tổng users → `supabase.from('profiles').select('*', { count: 'exact', head: true })`
5. VIP users → `supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_vip', true)`
6. Báo lỗi chờ → `supabase.from('error_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending')`

---

### 🟠 Giai Đoạn 2: Quản lý Phim & Tập Phim (Ưu tiên CAO)
> Mục tiêu: CRUD phim và tập phim — cốt lõi của quản trị nội dung.

**Screens:**
- `app/admin/movies/index.tsx` — Danh sách phim + lọc/tìm/phân trang
- `app/admin/movies/[id].tsx` — Thêm/Sửa phim (form phức tạp)
- `app/admin/episodes/index.tsx` — Grid chọn phim
- `app/admin/episodes/[movieId].tsx` — CRUD tập cho phim đã chọn

**Services:**
- `services/admin/movieService.ts` — loadAdminMovies, saveMovie, deleteMovie, filterAdminMovies
- `services/admin/episodeService.ts` — loadEpisodes, saveEpisode, deleteEpisode, importBatchEpisodes

**Chức năng chính:**
- Danh sách phim: lọc theo tên, loại (phim lẻ/bộ), thể loại, quốc gia, trạng thái
- Thêm/sửa phim: tiêu đề, mô tả, poster, thể loại, quốc gia, diễn viên, trạng thái
- Quản lý tập: thêm tập mới, sửa/xóa tập, kéo thả sắp xếp
- Import batch từ API (đơn giản hóa cho mobile — chỉ nhập URL API)

---

### 🟡 Giai Đoạn 3: Quản lý Người Dùng & Yêu Cầu (Ưu tiên TRUNG BÌNH)
> Mục tiêu: Quản lý users, xử lý yêu cầu VIP, và báo lỗi.

**Screens:**
- `app/admin/users.tsx` — Danh sách users, lọc/tìm, chỉnh role/VIP
- `app/admin/vip-requests.tsx` — Duyệt/từ chối yêu cầu VIP
- `app/admin/error-reports.tsx` — Danh sách báo lỗi + xử lý

**Services:**
- `services/admin/userService.ts` — loadUsers, updateRole, toggleVIP, banUser
- `services/admin/vipService.ts` — loadVipRequests, approveVip, rejectVip, deleteRequest
- `services/admin/errorReportService.ts` — loadReports, updateStatus, deleteReport

**Chức năng chính (từ admin.js):**
- Users: Tìm kiếm email/tên, đổi role (user/admin), cấp/thu hồi VIP, ban
- VIP: Xem bill chuyển khoản, duyệt (nhập số ngày), từ chối, xóa
- Báo lỗi: Xem chi tiết lỗi (phim, tập, mô tả), đánh dấu đã xử lý

---

### 🟢 Giai Đoạn 4: Quản lý Metadata & Thông Báo (Ưu tiên TRUNG BÌNH)
> Mục tiêu: CRUD thể loại, quốc gia, diễn viên, bình luận, thông báo.

**Screens:**
- `app/admin/categories.tsx` — CRUD thể loại
- `app/admin/countries.tsx` — CRUD quốc gia (bao gồm thêm hàng loạt)
- `app/admin/actors.tsx` — CRUD diễn viên + tìm kiếm
- `app/admin/comments.tsx` — Duyệt/xóa bình luận
- `app/admin/notifications.tsx` — Gửi thông báo + lên lịch

**Services:**
- `services/admin/categoryService.ts`
- `services/admin/countryService.ts`
- `services/admin/actorService.ts`
- `services/admin/commentService.ts`
- `services/admin/notificationService.ts`

---

### 🔵 Giai Đoạn 5: Tính Năng Nâng Cao (Ưu tiên THẤP)
> Mục tiêu: Các tính năng phụ trợ, cấu hình hệ thống.

**Screens:**
- `app/admin/settings.tsx` — Gộp: API Keys, Visual Effects, Telegram Config

**Chức năng (đơn giản hóa cho mobile):**
- Xem/sửa API Keys (OMDb, TMDb, Gemini, Groq...)
- Cấu hình Telegram Bot báo cáo
- Cài đặt giao diện web (marquee, popup) — *có thể bỏ qua trên mobile*

**Bỏ qua trên mobile (không phù hợp):**
- ❌ `apiExplorer` — Quá phức tạp cho mobile, giữ trên web
- ❌ `avatarLibrary` — Upload/quản lý avatar phức tạp, giữ trên web
- ❌ `watchRooms` — Quản lý phòng xem chung, giữ trên web
- ❌ `visualEffects` — Cài đặt giao diện web, không liên quan app
- ❌ `trailers` — Có thể gộp vào quản lý phim
- ❌ `contactRequests` — Có thể gộp vào settings

---

## 🔑 Cơ Sở Hạ Tầng Hiện Có (App RN)

| Component | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| Supabase Client | ✅ Có | `lib/supabase.ts` — cùng DB với web |
| Auth Store | ✅ Có | `stores/useAuthStore.ts` — đã có `isAdmin` check |
| Profile Screen | ✅ Có | Đã có nút "🛡️ Quản trị Admin" (chỉ hiện cho admin) |
| Route `/admin` | ❌ Chưa có | `handleAdminPanel()` đã gọi `router.push("/admin")` nhưng chưa tạo screen |

---

## ❓ Quyết Định Cần Xác Nhận

1. **Bắt đầu từ giai đoạn nào?** → Đề xuất **Giai đoạn 1** (Dashboard + cấu trúc admin)
2. **Có cần biểu đồ (Chart) trên mobile không?** → Có thể dùng `react-native-chart-kit` hoặc bỏ chart, chỉ giữ stat cards
3. **Giao diện mobile admin**: Dùng danh sách dọc (ScrollView) thay vì sidebar như web
4. **Có chức năng nào bạn muốn ưu tiên/bỏ qua?**
5. **Import phim từ API** có cần trên mobile không? (Rất phức tạp)

---

> [!TIP]
> Khuyến nghị: Bắt đầu với **Giai đoạn 1** — chỉ khoảng **5-6 file** cần tạo, có thể hoàn thành trong 1 phiên làm việc. Sau đó dần mở rộng theo từng giai đoạn.
