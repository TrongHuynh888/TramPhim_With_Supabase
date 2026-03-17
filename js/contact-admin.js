// ============================================
// QUẢN LÝ YÊU CẦU LIÊN HỆ (ADMIN + USER)
// ============================================

/**
 * Xử lý gửi form liên hệ từ trang Contact (user gửi)
 */
async function submitContactForm(event) {
  event.preventDefault();

  const btn = document.getElementById('contactSubmitBtn');
  const name = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const subject = document.getElementById('contactSubject').value;
  const message = document.getElementById('contactMessage').value.trim();

  if (!name || !email || !subject || !message) {
    showNotification('Vui lòng điền đầy đủ thông tin!', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';

  try {
    if (!supabase) throw new Error('Chưa kết nối database');

    const { error } = await supabase.from('contact_requests').insert({
      name: name,
      email: email,
      subject: subject,
      message: message,
      user_id: currentUser ? currentUser.id : null,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    if (error) throw error;

    showNotification('✅ Đã gửi yêu cầu thành công! Admin sẽ phản hồi sớm nhất.', 'success');
    document.getElementById('contactForm').reset();

    // Ẩn form sau khi gửi thành công (chống spam)
    checkPendingContact();

  } catch (err) {
    console.error('Lỗi gửi liên hệ:', err);
    showNotification('Gửi thất bại. Vui lòng thử lại hoặc liên hệ email: support@tramphim.com', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi Yêu Cầu';
  }
}

/**
 * Kiểm tra user đã có yêu cầu pending chưa → ẩn form nếu có
 */
async function checkPendingContact() {
  const form = document.getElementById('contactForm');
  const notice = document.getElementById('contactPendingNotice');
  const info = document.getElementById('contactPendingInfo');
  if (!form || !notice) return;

  // Nếu chưa đăng nhập → hiện form bình thường
  if (!currentUser || !supabase) {
    form.style.display = '';
    notice.style.display = 'none';
    return;
  }

  try {
    const { data, error } = await supabase
      .from('contact_requests')
      .select('id, subject, created_at')
      .eq('user_id', currentUser.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      // Còn yêu cầu pending → ẩn form, hiện thông báo
      const pending = data[0];
      const date = new Date(pending.created_at).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const subjectMap = { bug:'🐛 Báo lỗi', account:'👤 Tài khoản', vip:'👑 VIP', copyright:'©️ Bản quyền', suggest:'💡 Góp ý', other:'📋 Khác' };

      form.style.display = 'none';
      notice.style.display = 'block';
      if (info) info.innerHTML = `📌 Chủ đề: <strong>${subjectMap[pending.subject] || pending.subject}</strong> · Gửi lúc: <strong>${date}</strong>`;
    } else {
      // Không có pending → hiện form
      form.style.display = '';
      notice.style.display = 'none';
    }
  } catch (err) {
    console.error('Lỗi kiểm tra pending:', err);
    // Nếu lỗi thì vẫn hiện form
    form.style.display = '';
    notice.style.display = 'none';
  }
}

// Biến lưu danh sách liên hệ
let allContactRequests = [];

// Map chủ đề → label hiển thị
const SUBJECT_LABELS = {
  bug: '🐛 Báo lỗi',
  account: '👤 Tài khoản',
  vip: '👑 VIP',
  copyright: '©️ Bản quyền',
  suggest: '💡 Góp ý',
  other: '📋 Khác'
};

/**
 * Tải danh sách yêu cầu liên hệ từ Supabase
 */
async function loadContactRequests() {
  try {
    if (!supabase) return;

    const { data, error } = await supabase
      .from('contact_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    allContactRequests = data || [];
    filterContactRequests();

    // Cập nhật badge số lượng chưa xử lý
    updateContactBadge();

  } catch (err) {
    console.error('Lỗi tải liên hệ:', err);
    const tbody = document.getElementById('adminContactTable');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#ff6b6b;">
        <i class="fas fa-exclamation-triangle"></i> Lỗi tải dữ liệu: ${err.message}
      </td></tr>`;
    }
  }
}

/**
 * Cập nhật badge đếm số yêu cầu chưa xử lý trên sidebar
 */
function updateContactBadge() {
  const badge = document.getElementById('contactBadge');
  if (!badge) return;
  const pending = allContactRequests.filter(c => c.status === 'pending').length;
  if (pending > 0) {
    badge.textContent = pending;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Lọc yêu cầu theo trạng thái và chủ đề
 */
function filterContactRequests() {
  const statusFilter = document.getElementById('filterContactStatus')?.value || 'all';
  const subjectFilter = document.getElementById('filterContactSubject')?.value || 'all';

  let filtered = [...allContactRequests];

  if (statusFilter !== 'all') {
    filtered = filtered.filter(c => c.status === statusFilter);
  }
  if (subjectFilter !== 'all') {
    filtered = filtered.filter(c => c.subject === subjectFilter);
  }

  renderContactTable(filtered);
}

/**
 * Render bảng yêu cầu liên hệ
 */
function renderContactTable(contacts) {
  const tbody = document.getElementById('adminContactTable');
  if (!tbody) return;

  if (!contacts || contacts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-muted);">
      <i class="fas fa-inbox" style="font-size:2rem; margin-bottom:10px; display:block; opacity:0.3;"></i>
      Chưa có yêu cầu liên hệ nào
    </td></tr>`;
    return;
  }

  tbody.innerHTML = contacts.map((c, i) => {
    const subjectLabel = SUBJECT_LABELS[c.subject] || c.subject;
    const statusBadge = c.status === 'pending'
      ? '<span style="background:#f59e0b; color:#000; padding:3px 10px; border-radius:12px; font-size:0.78rem; font-weight:600;">Chờ xử lý</span>'
      : '<span style="background:#10b981; color:#fff; padding:3px 10px; border-radius:12px; font-size:0.78rem; font-weight:600;">Đã xử lý</span>';

    const date = c.created_at ? new Date(c.created_at).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '--';

    // Rút gọn nội dung
    const shortMsg = c.message && c.message.length > 50
      ? c.message.substring(0, 50) + '...'
      : (c.message || '--');

    return `<tr>
      <td style="text-align:center;">${i + 1}</td>
      <td><strong>${escapeHtml(c.name || '--')}</strong></td>
      <td><a href="mailto:${escapeHtml(c.email || '')}" style="color:var(--accent-primary);">${escapeHtml(c.email || '--')}</a></td>
      <td>${subjectLabel}</td>
      <td title="${escapeHtml(c.message || '')}" style="cursor:pointer;" onclick="viewContactDetail('${c.id}')">${escapeHtml(shortMsg)}</td>
      <td style="font-size:0.85rem; color:var(--text-muted);">${date}</td>
      <td>${statusBadge}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-sm" style="background:var(--accent-primary); color:#fff; padding:4px 10px; font-size:0.8rem;" 
            onclick="viewContactDetail('${c.id}')" title="Xem chi tiết">
            <i class="fas fa-eye"></i>
          </button>
          ${c.status === 'pending' ? `
          <button class="btn btn-sm" style="background:#10b981; color:#fff; padding:4px 10px; font-size:0.8rem;" 
            onclick="resolveContact('${c.id}')" title="Đánh dấu đã xử lý">
            <i class="fas fa-check"></i>
          </button>` : ''}
          <button class="btn btn-sm" style="background:#ef4444; color:#fff; padding:4px 10px; font-size:0.8rem;" 
            onclick="deleteContact('${c.id}')" title="Xóa">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/**
 * Helper escape HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * Xem chi tiết yêu cầu liên hệ
 */
function viewContactDetail(id) {
  const contact = allContactRequests.find(c => c.id === id);
  if (!contact) return;

  const subjectLabel = SUBJECT_LABELS[contact.subject] || contact.subject;
  const date = contact.created_at ? new Date(contact.created_at).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '--';

  Swal.fire({
    title: `<i class="fas fa-envelope-open" style="color:var(--accent-primary);"></i> Chi tiết liên hệ`,
    html: `
      <div style="text-align:left; line-height:1.8; font-size:0.95rem;">
        <p><strong>Người gửi:</strong> ${escapeHtml(contact.name)}</p>
        <p><strong>Email:</strong> <a href="mailto:${escapeHtml(contact.email)}" style="color:var(--accent-primary);">${escapeHtml(contact.email)}</a></p>
        <p><strong>Chủ đề:</strong> ${subjectLabel}</p>
        <p><strong>Ngày gửi:</strong> ${date}</p>
        <p><strong>Trạng thái:</strong> ${contact.status === 'pending' ? '🟡 Chờ xử lý' : '🟢 Đã xử lý'}</p>
        <hr style="border-color:rgba(255,255,255,0.1); margin:12px 0;">
        <p><strong>Nội dung:</strong></p>
        <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; white-space:pre-wrap; word-break:break-word; max-height:250px; overflow-y:auto; font-size:0.9rem; color:var(--text-secondary);">
          ${escapeHtml(contact.message)}
        </div>
      </div>
    `,
    width: 550,
    showConfirmButton: true,
    confirmButtonText: contact.status === 'pending' ? '<i class="fas fa-check"></i> Đánh dấu đã xử lý' : 'Đóng',
    showCancelButton: contact.status === 'pending',
    cancelButtonText: 'Đóng',
    confirmButtonColor: contact.status === 'pending' ? '#10b981' : 'var(--accent-primary)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  }).then(result => {
    if (result.isConfirmed && contact.status === 'pending') {
      resolveContact(id);
    }
  });
}

/**
 * Đánh dấu liên hệ đã xử lý
 */
async function resolveContact(id) {
  try {
    const { error } = await supabase
      .from('contact_requests')
      .update({ status: 'resolved' })
      .eq('id', id);

    if (error) throw error;

    // Cập nhật local
    const contact = allContactRequests.find(c => c.id === id);
    if (contact) contact.status = 'resolved';

    filterContactRequests();
    updateContactBadge();
    showNotification('✅ Đã đánh dấu xử lý!', 'success');
  } catch (err) {
    console.error('Lỗi cập nhật:', err);
    showNotification('Lỗi: ' + err.message, 'error');
  }
}

/**
 * Xóa yêu cầu liên hệ
 */
async function deleteContact(id) {
  const result = await Swal.fire({
    title: 'Xóa yêu cầu liên hệ?',
    text: 'Thao tác này không thể hoàn tác.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Xóa',
    cancelButtonText: 'Hủy',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  });

  if (!result.isConfirmed) return;

  try {
    const { error } = await supabase
      .from('contact_requests')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Xóa khỏi local
    allContactRequests = allContactRequests.filter(c => c.id !== id);
    filterContactRequests();
    updateContactBadge();
    showNotification('🗑️ Đã xóa yêu cầu liên hệ!', 'success');
  } catch (err) {
    console.error('Lỗi xóa:', err);
    showNotification('Lỗi: ' + err.message, 'error');
  }
}
