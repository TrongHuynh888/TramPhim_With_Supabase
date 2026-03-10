# 🎬 Trạm Phim - Trải Nghiệm Điện Ảnh Đẳng Cấp

Nền tảng xem phim trực tuyến thế hệ mới với công nghệ Blockchain. Thanh toán nhanh chóng, an toàn bằng CRO Token trên mạng Cronos.

## 📋 Mục Lục

- [Tính Năng](#-tính-năng)
- [Công Nghệ](#-công-nghệ)
- [Cấu Trúc Dự Án](#-cấu-trúc-dự-án)
- [Hướng Dẫn Cài Đặt](#-hướng-dẫn-cài-đặt)
- [Cấu Hình Firebase](#-cấu-hình-firebase)
- [Cấu Hình Web3](#-cấu-hình-web3)
- [Triển Khai](#-triển-khai)

## ✨ Tính Năng

### Người Dùng (User)

- 🎥 Xem danh sách phim với giao diện đẹp mắt
- 🔍 Tìm kiếm và lọc phim theo thể loại, quốc gia, năm
- 💳 Thanh toán bằng CRO Token qua Metamask
- 📺 Xem phim sau khi mua vé
- ⭐ Đánh giá và bình luận phim
- 🌙 Chế độ Dark/Light theme

### Quản Trị Viên (Admin)

- 📊 Dashboard thống kê tổng quan
- 🎬 Quản lý phim (CRUD)
- 📝 Quản lý tập phim
- 🏷️ Quản lý thể loại, quốc gia
- 👥 Quản lý người dùng và phân quyền
- 💬 Quản lý bình luận
- 💰 Xem lịch sử giao dịch

## 🛠 Công Nghệ

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Backend/Database:** Google Firebase (Firestore, Authentication)
- **Web3:** Ethers.js, Metamask
- **Blockchain:** Cronos Network (CRO Token)
- **Hosting:** GitHub Pages compatible

## 📁 Cấu Trúc Dự Án

```
Trạm Phim/
├── index.html          # Trang HTML chính
├── style.css           # CSS styles (Dark/Light theme)
├── app.js              # Logic ứng dụng chính
├── firebase-config.js  # Cấu hình Firebase
├── web3-config.js      # Cấu hình Web3/Cronos
├── README.md           # Tài liệu hướng dẫn
└── todo.md             # Kế hoạch phát triển
```

## 🚀 Hướng Dẫn Cài Đặt

### Bước 1: Clone Repository

```bash
git clone https://github.com/your-username/Trạm Phim.git
cd Trạm Phim
```

### Bước 2: Cấu Hình Firebase

1. Truy cập [Firebase Console](https://console.firebase.google.com/)
2. Tạo project mới
3. Lấy config và cập nhật vào `firebase-config.js`
4. Enable Authentication (Email/Password)
5. Tạo Firestore Database

### Bước 3: Cấu Hình Web3

1. Cập nhật địa chỉ ví nhận thanh toán trong `web3-config.js`
2. Chọn network (Testnet hoặc Mainnet)

### Bước 4: Chạy Local

Sử dụng bất kỳ HTTP server nào:

```bash
# Sử dụng Python
python -m http.server 8000

# Hoặc sử dụng Node.js
npx serve

# Hoặc sử dụng Live Server extension trong VS Code
```

## 🔥 Cấu Hình Firebase

### 1. Tạo Project Firebase

1. Truy cập https://console.firebase.google.com/
2. Click "Add project" / "Thêm dự án"
3. Đặt tên project (ví dụ: Trạm Phim)
4. Tắt Google Analytics (không bắt buộc)
5. Click "Create project"

### 2. Lấy Firebase Config

1. Trong Firebase Console, click biểu tượng ⚙️ (Settings)
2. Chọn "Project settings"
3. Scroll xuống phần "Your apps"
4. Click biểu tượng `</>` (Web)
5. Đặt tên app và click "Register app"
6. Copy đoạn config và dán vào `firebase-config.js`:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

### 3. Enable Authentication

1. Trong Firebase Console, vào "Authentication"
2. Click "Get started"
3. Chọn tab "Sign-in method"
4. Enable "Email/Password"
5. Click "Save"

### 4. Tạo Firestore Database

1. Trong Firebase Console, vào "Firestore Database"
2. Click "Create database"
3. Chọn "Start in test mode" (cho development)
4. Chọn location gần nhất
5. Click "Enable"

### 5. Cấu Hình Admin

Trong `firebase-config.js`, thay đổi email Admin:

```javascript
const ADMIN_EMAIL = "your-admin-email@example.com";
```

### 6. Security Rules (Production)

Khi deploy production, cập nhật Firestore Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }

    // Movies - public read, admin write
    match /movies/{movieId} {
      allow read: if true;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Comments
    match /comments/{commentId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth.uid == resource.data.userId ||
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Categories & Countries - public read, admin write
    match /categories/{docId} {
      allow read: if true;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /countries/{docId} {
      allow read: if true;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Transactions
    match /transactions/{txId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
  }
}
```

## ⛓ Cấu Hình Web3

### 1. Thiết Lập Metamask cho Cronos

**Cronos Mainnet:**

- Network Name: Cronos Mainnet
- RPC URL: https://evm.cronos.org
- Chain ID: 25
- Symbol: CRO
- Block Explorer: https://cronoscan.com

**Cronos Testnet:**

- Network Name: Cronos Testnet
- RPC URL: https://evm-t3.cronos.org
- Chain ID: 338
- Symbol: tCRO
- Block Explorer: https://testnet.cronoscan.com

### 2. Cấu Hình Địa Chỉ Ví

Trong `web3-config.js`, thay đổi địa chỉ ví nhận thanh toán:

```javascript
const RECEIVER_WALLET = "0xYOUR_WALLET_ADDRESS_HERE";
```

### 3. Chọn Network

Mặc định sử dụng Testnet cho development:

```javascript
const CURRENT_NETWORK = CRONOS_TESTNET;
```

Đổi sang Mainnet khi production:

```javascript
const CURRENT_NETWORK = CRONOS_MAINNET;
```

### 4. Lấy Test CRO

Để test trên Testnet, lấy tCRO miễn phí tại:
https://cronos.org/faucet

## 🌐 Triển Khai

### GitHub Pages

1. Push code lên GitHub repository
2. Vào Settings > Pages
3. Chọn branch `main` và folder `/ (root)`
4. Click Save
5. Website sẽ có tại: `https://username.github.io/repo-name`

### Netlify

1. Kết nối với GitHub repository
2. Deploy settings:
   - Build command: (để trống)
   - Publish directory: `.`
3. Click Deploy

### Vercel

1. Import GitHub repository
2. Framework Preset: Other
3. Click Deploy

## 📱 Responsive Design

Website hỗ trợ đầy đủ các thiết bị:

- 💻 Desktop (> 1024px)
- 📱 Tablet (768px - 1024px)
- 📱 Mobile (< 768px)

## 🎨 Tùy Chỉnh Giao Diện

### Thay Đổi Màu Sắc

Mở `style.css` và chỉnh sửa CSS Variables trong `:root`:

```css
:root {
  --accent-primary: #e50914; /* Màu chính (đỏ Netflix) */
  --accent-secondary: #00d4ff; /* Màu phụ (xanh neon) */
  --bg-primary: #0a0a0f; /* Màu nền chính */
  /* ... */
}
```

### Thay Đổi Font

Thêm Google Fonts mới trong `index.html` và cập nhật trong `style.css`.

## 🐛 Xử Lý Lỗi Thường Gặp

### Firebase chưa được cấu hình

- Kiểm tra `firebase-config.js` đã có config chính xác chưa
- Đảm bảo Firebase SDK đã được load

### Metamask không kết nối

- Cài đặt extension Metamask
- Thêm Cronos network vào Metamask
- Cho phép website kết nối

### Video không hiển thị

- Kiểm tra YouTube Video ID có đúng không
- Video phải ở chế độ Unlisted hoặc Public

## 📄 License

MIT License - Tự do sử dụng và chỉnh sửa.

## 👨‍💻 Tác Giả

Developed with ❤️ by MovieChain Team

---

**Lưu ý:** Đây là dự án demo/học tập. Khi triển khai production, hãy đảm bảo:

- Cấu hình Firebase Security Rules phù hợp
- Sử dụng Cronos Mainnet
- Kiểm tra kỹ smart contract và logic thanh toán
- Tuân thủ các quy định về bản quyền nội dung
