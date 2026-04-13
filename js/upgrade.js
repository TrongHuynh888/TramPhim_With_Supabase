// LOGIC XỬ LÝ TRANG NÂNG CẤP
console.log("💎 Upgrade Module Loaded");

function openPaymentQRModal(type = "vip") {
  if (!currentUser) {
    showNotification("Vui lòng đăng nhập để nâng cấp!", "warning");
    openAuthModal();
    return;
  }

  const qrImage = document.getElementById("vietqrImage");
  const amountEl = document.getElementById("paymentAmount");
  const memoEl = document.getElementById("paymentMemo");

  const BANK_ID = "VBA"; // Agribank MÃ NGÂN HÀNG VIẾT TẮT QR
  const ACCOUNT_NO = "88880384495717"; // Thay số TK của bạn vào đây
  const TEMPLATE = "compact";

  let amount = 49000;
  let content = `VIP ${currentUser.email.split("@")[0]}`;

  if (type === "lifetime") {
    amount = 499000;
    content = `LIFETIME ${currentUser.email.split("@")[0]}`;
  }

  amountEl.textContent = formatNumber(amount) + "đ";
  memoEl.textContent = content;

  const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-${TEMPLATE}.png?amount=${amount}&addInfo=${encodeURIComponent(content)}`;
  qrImage.src = qrUrl;

  openModal("paymentQRModal");
}

function openUploadBillModal() {
  closeModal("paymentQRModal");
  
  // Reset UI
  document.getElementById("billImageInput").value = "";
  document.getElementById("billPreview").src = "";
  document.getElementById("billPreview").style.display = "none";
  document.getElementById("uploadPlaceholder").style.display = "block";
  document.getElementById("submitBillBtn").disabled = true;
  
  openModal("uploadBillModal");
}

let compressedBillBase64 = "";

function previewBillImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate image
  if (!file.type.startsWith('image/')) {
      showNotification("Vui lòng chọn một tệp hình ảnh hợp lệ", "error");
      return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = function (e) {
    const rawBase64 = e.target.result;
    
    // Resize Image via Canvas to reduce Firestore size
    const img = new Image();
    img.src = rawBase64;
    img.onload = function() {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
        } else {
            if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
            }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Compress
        compressedBillBase64 = canvas.toDataURL("image/jpeg", 0.7);
        
        // Show Preview
        const preview = document.getElementById("billPreview");
        preview.src = compressedBillBase64;
        preview.style.display = "block";
        document.getElementById("uploadPlaceholder").style.display = "none";
        document.getElementById("submitBillBtn").disabled = false;
    }
  };
}

async function submitVipRequest() {
    if (!currentUser || !supabase) return;
    if (!compressedBillBase64) {
        showNotification("Vui lòng tải ảnh bill lên", "error");
        return;
    }

    try {
        showLoading(true, "Đang xử lý. Vui lòng đợi...");
        
        // 1. Kiểm tra giới hạn 5 phút (Xác thực chống spam)
        const fiveMinsAgo = new Date(Date.now() - 300000).toISOString();
        const { data: existingRequests, error: checkError } = await supabase
            .from('upgrade_requests')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('status', 'pending')
            .gt('created_at', fiveMinsAgo);

        if (checkError) throw checkError;

        if (existingRequests && existingRequests.length > 0) {
            showLoading(false);
            await customAlert("⏳ Bạn vừa gửi yêu cầu trước đó. Vui lòng đợi 5 phút trước khi gửi lại hoá đơn mới tránh bị spam nhé!", { title: "Vui lòng chờ", type: "warning" });
            return;
        }

        // 2. Thêm yêu cầu mới
        const amountEl = document.getElementById("paymentAmount");
        const currentAmountText = amountEl.textContent.replace(/[,đ]/g, '');
        const amount = parseInt(currentAmountText);
        
        const packageType = amount >= 499000 ? "lifetime" : "vip";

        const { error: insError } = await supabase.from('upgrade_requests').insert({
            user_id: currentUser.id,
            user_email: currentUser.email,
            package: packageType,
            amount: amount,
            bill_image_base64: compressedBillBase64,
            status: "pending"
        });

        if (insError) throw insError;

        // Bắn thông báo cho Admin & User
        if (typeof sendNotification === "function") {
            await sendNotification("admin", "Yêu cầu VIP mới", `Có yêu cầu nâng cấp gói ${packageType.toUpperCase()} từ ${currentUser.email}.`, "vip_request");
            await sendNotification(currentUser.id, "Gửi yêu cầu thành công", `Yêu cầu nâng gói ${packageType.toUpperCase()} của bạn đã được gửi tới Admin. Vui lòng chờ kiểm duyệt.`, "system");
        }

        showLoading(false);
        closeModal("uploadBillModal");
        
        await customAlert("🎉 Yêu cầu của bạn đã được gửi thành công! Admin sẽ duyệt và phản hồi trong thời gian sớm nhất.", { title: "Gửi thành công", type: "success" });
        showNotification("Đã gửi yêu cầu nâng cấp", "success");
    } catch (error) {
        console.error("Lỗi khi gửi yêu cầu nâng VIP Supabase:", error);
        showLoading(false);
        showNotification("Có lỗi xảy ra, vui lòng thử lại sau", "error");
    }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showNotification("Đã sao chép số tài khoản", "info");
}
