/**
 * Đăng nhập bằng tài khoản Google (OAuth)
 */
async function signInWithGoogle() {
    if (!supabase) {
        showNotification("Supabase chưa được cấu hình!", "error");
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + (window.APP_BASE_PATH || '')
            }
        });

        if (error) throw error;

        // Supabase sẽ tự redirect sang Google, không cần xử lý thêm
    } catch (err) {
        console.error("Lỗi đăng nhập Google:", err);
        showNotification("Đăng nhập Google thất bại: " + err.message, "error");
    }
}

/**
 * Toggle hiện/ẩn mật khẩu
 */
function togglePassword(inputId, iconElement) {
    const passwordInput = document.getElementById(inputId);
    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        iconElement.classList.remove("fa-eye");
        iconElement.classList.add("fa-eye-slash");
    } else {
        passwordInput.type = "password";
        iconElement.classList.remove("fa-eye-slash");
        iconElement.classList.add("fa-eye");
    }
}

/**
 * Xử lý đăng nhập
 */
/**
 * Xử lý đăng nhập
 */
async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  if (!supabase) {
    showNotification("Supabase chưa được cấu hình!", "error");
    return;
  }

  try {
    showLoading(true, "Đang đăng nhập...");

    // 1. Đăng nhập vào Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) throw error;

    const user = data.user;

    // 2. Kiểm tra tài khoản bị khóa/xóa (isActive)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .single();

    if (profile && profile.is_active === false) {
      await supabase.auth.signOut();
      throw new Error("account-blocked");
    }

    showNotification("Đăng nhập thành công!", "success");
    closeModal("authModal");

    // Reset form
    document.getElementById("loginForm").reset();
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
    let errorMessage = "Đăng nhập thất bại!";

    if (error.message === "account-blocked") {
      errorMessage = "❌ Tài khoản của bạn đã bị khóa hoặc xóa bởi Admin!";
    } else if (error.status === 400) {
      errorMessage = "Email hoặc mật khẩu không chính xác";
    }

    showNotification(errorMessage, "error");
  } finally {
    showLoading(false);
  }
}

/**
 * Xử lý đăng ký
 */
async function handleRegister(event) {
  event.preventDefault();

  const name = document.getElementById("registerName").value;
  const email = document.getElementById("registerEmail").value;
  const password = document.getElementById("registerPassword").value;
  const confirmPassword = document.getElementById("registerConfirmPassword").value;
  const avatarUrl = document.getElementById("registerAvatar").value ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

  if (password !== confirmPassword) {
    showNotification("Mật khẩu xác nhận không khớp!", "error");
    return;
  }

  if (password.length < 6) {
    showNotification("Mật khẩu phải có ít nhất 6 ký tự!", "error");
    return;
  }

  try {
    showLoading(true, "Đang tạo tài khoản...");

    // Đăng ký Supabase Auth kèm metadata
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          display_name: name,
          avatar_url: avatarUrl
        }
      }
    });

    if (error) throw error;

    showNotification("Đăng ký thành công! Vui lòng kiểm tra email để xác nhận (nếu có).", "success");
    closeModal("authModal");
    document.getElementById("registerForm").reset();

  } catch (error) {
    console.error("Lỗi đăng ký:", error);
    showNotification("Đăng ký thất bại: " + error.message, "error");
  } finally {
    showLoading(false);
  }
}

/**
 * Xử lý đăng xuất
 */
async function handleLogout() {
  try {
    await supabase.auth.signOut();

    if (typeof stopNotifications === "function") {
        stopNotifications();
    }

    const dropdown = document.getElementById("userDropdown");
    if (dropdown) dropdown.classList.remove("active"); 
    
    const notifDropdown = document.getElementById("notificationDropdown");
    if (notifDropdown) notifDropdown.classList.add("hidden");

    const loginBtn = document.getElementById("loginBtn");
    const userMenuTrigger = document.getElementById("userMenuTrigger");
    if (loginBtn) loginBtn.classList.remove("hidden");
    if (userMenuTrigger) userMenuTrigger.classList.add("hidden");

    showNotification("Đã đăng xuất!", "info");
    showPage("home");
  } catch (error) {
    console.error("Lỗi đăng xuất:", error);
    showNotification("Lỗi khi đăng xuất!", "error");
  }
}

/**
 * Xử lý quên mật khẩu
 */
async function handleForgotPassword(event) {
  event.preventDefault();
  const email = document.getElementById("forgotEmail").value.trim();

  if (!email) {
    showNotification("Vui lòng nhập email!", "warning");
    return;
  }

  try {
    showLoading(true, "Đang gửi email...");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.APP_BASE_PATH,
    });

    if (error) throw error;

    await customAlert("✅ Đã gửi email khôi phục! Vui lòng kiểm tra hộp thư của bạn.", { title: "Gửi thành công", type: "success" });
    switchAuthTab("login");
  } catch (error) {
    console.error("Lỗi quên mật khẩu:", error);
    showNotification("Gửi thất bại: " + error.message, "error");
  } finally {
    showLoading(false);
  }
}

/**
 * Theo dõi trạng thái đăng nhập
 */
function initAuthStateListener() {
    supabase.auth.onAuthStateChange((event, session) => {
        console.log("🔑 Auth event:", event);
        
        // Bỏ qua auth state change khi AI đang xử lý phụ đề
        // (tránh việc Supabase re-init gây reload/flicker trang)
        if (window.__aiProcessing) {
            console.warn("[AI Shield] Bỏ qua Auth event '" + event + "' vì AI đang xử lý phụ đề!");
            return;
        }
        
        const user = session ? session.user : null;

        // Xử lý sự kiện đặt lại mật khẩu (khi user click link từ email)
        if (event === 'PASSWORD_RECOVERY') {
            console.log("🔐 PASSWORD_RECOVERY detected — Mở form đổi mật khẩu");
            // Dọn URL sạch
            history.replaceState(null, '', window.location.pathname);
            // Mở modal đổi mật khẩu (ẩn trường mật khẩu cũ)
            setTimeout(() => {
                // Ẩn trường mật khẩu cũ vì user quên mật khẩu
                const oldPwGroup = document.getElementById('oldPasswordGroup');
                if (oldPwGroup) oldPwGroup.style.display = 'none';

                // Đổi tiêu đề modal
                const modalTitle = document.querySelector('#changePasswordModal .modal-title');
                if (modalTitle) modalTitle.textContent = 'Đặt lại mật khẩu';

                if (typeof openModal === 'function') {
                    openModal('changePasswordModal');
                    showNotification("Vui lòng nhập mật khẩu mới.", "info");
                }
            }, 500);
            return;
        }

        handleAuthStateChange(user, event);
    });
}

// Gọi hàm khởi tạo listener ngay khi file load
initAuthStateListener();

/**
 * Xử lý khi trạng thái chuyển đổi
 */
async function handleAuthStateChange(user, authEvent) {
  currentUser = user;

  if (user) {
    try {
      // 1. Lấy thông tin từ bảng profiles
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile) {
        // Kiểm tra hạ cấp VIP
        await checkAndDowngradeVip(user, profile);

        // Map dữ liệu từ SQL sang biến JS (tương thích cũ)
        currentUser.display_name = profile.display_name;
        currentUser.avatar = profile.avatar;
        currentUser.role = profile.role;
        currentUser.is_active = profile.is_active;
        currentUser.is_vip = profile.is_vip;
        currentUser.vip_expires_at = profile.vip_expires_at;
        
        currentUser.displayName = profile.display_name;
        currentUser.photoURL = profile.avatar;
        currentUser.isVip = profile.is_vip;
        currentUser.vipExpiresAt = profile.vip_expires_at;

        isAdmin = profile.role === "admin";

        // 2. Lấy thêm danh sách Phim Yêu thích & Đã mua (Hỗ trợ UI nhanh)
        const [favs, purs] = await Promise.all([
          supabase.from('user_favorites').select('movie_id').eq('user_id', user.id),
          supabase.from('user_purchases').select('movie_id').eq('user_id', user.id)
        ]);
        
        currentUser.favorites = favs.data ? favs.data.map(f => f.movie_id) : [];
        currentUser.purchasedMovies = purs.data ? purs.data.map(p => p.movie_id) : [];

      } else {
          // Nếu chưa có profile (vừa đăng ký xong), tạo mới
          await syncProfile(user);
          currentUser.favorites = [];
          currentUser.purchasedMovies = [];
      }

      console.log("✅ Đã đăng nhập:", user.email);
      updateAuthUI(true);

      // Listener thông báo
      setTimeout(() => {
        if (typeof initNotifications === "function") {
            initNotifications(user, isAdmin);
        }
        // [MỚI] Đăng ký thông báo tin nhắn CineChat toàn cục
        if (typeof subscribeToMessageNotifications === "function") {
            console.log("🔔 [Auth] Đăng ký thông báo tin nhắn CineChat toàn cục");
            subscribeToMessageNotifications();
        }
      }, 500);

      if (isAdmin && typeof loadAdminData === 'function') loadAdminData();

      // Render lại giao diện
      if (typeof renderAllInitialMovies === 'function') renderAllInitialMovies();
      
      // Khởi tạo trạng thái online lập tức
      if (typeof initGlobalCommunityPresence === 'function') {
          initGlobalCommunityPresence();
      }

      // [MỚI] Tự động load Community nếu đang ở hash community
      if (window.location.hash.includes('community') && typeof initCommunity === 'function') {
          initCommunity();
      }

      if (typeof updateAllWatchProgress === 'function') {
          setTimeout(updateAllWatchProgress, 100);
      }

      // CHỈ tải lại quyền xem video (có thể gây tải lại video từ đầu)
      // NẾU người dùng thực sự Đăng nhập mới hoặc Đăng xuất. 
      // TUYỆT ĐỐI KHÔNG làm khi Token Refresh ngầm, vì sẽ làm đứt video đang xem.
      if (currentMovieId) {
          if (authEvent === 'SIGNED_IN' || authEvent === 'SIGNED_OUT') {
              console.log("🔄 Trạng thái Auth thay đổi lớn (Đăng nhập/Đăng xuất), tải lại trình phát...");
              checkAndUpdateVideoAccess();
          } else {
              console.log("🔄 Bỏ qua tải lại video do chỉ là Token Refresh hoặc Event nhỏ: " + authEvent);
          }
      }

    } catch (error) {
      console.error("Lỗi handleAuthStateChange:", error);
    }
  } else {
    console.log("❌ Chưa đăng nhập");
    currentUser = null;
    isAdmin = false;
    updateAuthUI(false);
    renderAllInitialMovies();
    
    // Nếu bị mất quyền thật (log out), lúc đó mới chặn video
    if (currentMovieId && authEvent === 'SIGNED_OUT') {
         checkAndUpdateVideoAccess();
    }
  }
}

/**
 * Đồng bộ Profile sang bảng profiles (Insert if not exists)
 */
async function syncProfile(user) {
    try {
        const metadata = user.user_metadata || {};
        const { error } = await supabase.from('profiles').upsert({
            id: user.id,
            email: user.email,
            display_name: metadata.display_name || user.email.split('@')[0],
            avatar: metadata.avatar_url || "",
            role: user.email === ADMIN_EMAIL ? "admin" : "user",
            last_login: new Date().toISOString()
        });
        if (error) throw error;
    } catch (e) {
        console.error("Lỗi sync profile:", e);
    }
}

/**
 * Kiểm tra VIP hết hạn
 */
async function checkAndDowngradeVip(user, profile) {
  if (!profile.is_vip || !profile.vip_expires_at) return;

  const expiryDate = new Date(profile.vip_expires_at);
  const now = new Date();

  if (expiryDate < now) {
    console.log("⚠️ VIP hết hạn! Hạ cấp...");
    try {
      await supabase.from('profiles').update({
        is_vip: false,
        vip_expires_at: null
      }).eq('id', user.id);

      currentUser.is_vip = false;
      showNotification("Gói VIP của bạn đã hết hạn.", "warning");
    } catch (e) {
      console.error("Lỗi downgrade VIP:", e);
    }
  }
}

/**
 * Cập nhật giao diện theo User
 */
function updateAuthUI(isLoggedIn) {
  const loginBtn = document.getElementById("loginBtn");
  const userMenuTrigger = document.getElementById("userMenuTrigger");
  const userAvatarSmall = document.getElementById("userAvatarSmall");
  const dropdownAvatar = document.getElementById("dropdownAvatar");
  const dropdownName = document.getElementById("dropdownName");
  const roleBadge = document.querySelector(".dropdown-role");
  const adminNavLink = document.getElementById("adminNavLink");
  const commentForm = document.getElementById("commentForm");

  if (isLoggedIn && currentUser) {
    if (loginBtn) loginBtn.classList.add("hidden");
    if (userMenuTrigger) userMenuTrigger.classList.remove("hidden");

    const avatarUrl = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || "User")}&background=random`;

    if (userAvatarSmall) userAvatarSmall.src = avatarUrl;
    if (dropdownAvatar) dropdownAvatar.src = avatarUrl;
    if (dropdownName) dropdownName.textContent = currentUser.displayName || "User";

    const isVip = currentUser.isVip === true;

    if (isVip) {
      if (userAvatarSmall) userAvatarSmall.classList.add("vip-border");
      if (dropdownAvatar) dropdownAvatar.classList.add("vip-border");
      if (roleBadge) {
          roleBadge.innerHTML = `<i class="fas fa-crown"></i> VIP`;
          roleBadge.classList.add("vip-badge");
      }
    } else {
      if (userAvatarSmall) userAvatarSmall.classList.remove("vip-border");
      if (dropdownAvatar) dropdownAvatar.classList.remove("vip-border");
      if (roleBadge) {
          roleBadge.textContent = isAdmin ? "Admin" : "Free";
          roleBadge.classList.remove("vip-badge");
      }
    }

    if (isAdmin && adminNavLink) adminNavLink.classList.remove("hidden");
    if (commentForm) commentForm.style.display = "block";
  } else {
    if (loginBtn) loginBtn.classList.remove("hidden");
    if (userMenuTrigger) userMenuTrigger.classList.add("hidden");
    if (adminNavLink) adminNavLink.classList.add("hidden");
    if (commentForm) commentForm.style.display = "none";
  }
}

/**
 * Đổi mật khẩu
 */
async function handleChangePassword(event) {
  event.preventDefault();
  const newPassword = document.getElementById("newPassword").value;
  const confirmNewPassword = document.getElementById("confirmNewPassword").value;

  if (newPassword !== confirmNewPassword) {
    showNotification("Mật khẩu không khớp!", "warning");
    return;
  }

  try {
    showLoading(true, "Đang đổi mật khẩu...");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;

    showNotification("Đổi mật khẩu thành công!", "success");
    closeModal("changePasswordModal");
    resetChangePasswordModal();
  } catch (error) {
    console.error("Lỗi đổi mật khẩu:", error);
    showNotification("Thất bại: " + error.message, "error");
  } finally {
    showLoading(false);
  }
}

/**
 * Khôi phục modal đổi mật khẩu về trạng thái ban đầu (hiện lại trường mật khẩu cũ)
 */
function resetChangePasswordModal() {
    const oldPwGroup = document.getElementById('oldPasswordGroup');
    if (oldPwGroup) oldPwGroup.style.display = '';

    const modalTitle = document.querySelector('#changePasswordModal .modal-title');
    if (modalTitle) modalTitle.textContent = 'Đổi mật khẩu';

    const form = document.getElementById('changePasswordForm');
    if (form) form.reset();
}

/**
 * Dropdown logic
 */
function toggleUserDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById("userDropdown");
  if (dropdown) {
    const isActive = dropdown.classList.toggle("active");
    if (isActive) {
        setTimeout(() => document.addEventListener("click", () => dropdown.classList.remove("active"), {once:true}), 0);
    }
  }
}

function openAuthModal() {
  openModal("authModal");
}
