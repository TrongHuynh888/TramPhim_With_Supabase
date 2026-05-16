/**
 * ============================================
 *  SITE FRONTEND — CÀI ĐẶT GIAO DIỆN CHO MỌI USER
 *  (Tách từ admin.js để load sớm trên trang chủ)
 * ============================================
 * File này chứa các hàm áp dụng giao diện (màu accent, font, hiệu ứng,
 * marquee, popup) — được gọi bởi utils.js khi DOMContentLoaded.
 * admin.js sẽ ghi đè các hàm này khi load sau (không gây xung đột).
 */

// ============================================
// 1. MÀU ACCENT & FONT
// ============================================

/**
 * Áp dụng màu accent lên CSS variables
 */
function applyAccentColor(color) {
    const root = document.documentElement;
    root.style.setProperty('--accent-primary', color);

    // Tính accent-secondary (đậm hơn 30)
    const secondary = adjustBrightness(color, -30);
    root.style.setProperty('--accent-secondary', secondary);

    // Tính accent-tertiary (sáng hơn 30)
    const tertiary = adjustBrightness(color, 30);
    root.style.setProperty('--accent-tertiary', tertiary);

    // Cập nhật gradient
    root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${secondary} 0%, ${color} 100%)`);
    root.style.setProperty('--accent-neon', `linear-gradient(135deg, ${color}, ${secondary})`);
    root.style.setProperty('--shadow-neon', `0 0 20px ${color}80`);
}

/**
 * Điều chỉnh độ sáng hex color
 */
function adjustBrightness(hex, amount) {
    hex = hex.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/**
 * Load Google Font động
 */
function loadGoogleFont(fontName) {
    const linkId = 'dynamic-google-font';
    let link = document.getElementById(linkId);
    if (!link) {
        link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }
    const encodedFont = fontName.replace(/ /g, '+');
    link.href = `https://fonts.googleapis.com/css2?family=${encodedFont}:wght@300;400;500;600;700&display=swap`;
}

/**
 * Áp dụng font cho toàn trang
 */
function applySiteFont(fontName) {
    loadGoogleFont(fontName);
    document.documentElement.style.setProperty('font-family', `'${fontName}', sans-serif`);
    document.body.style.fontFamily = `'${fontName}', sans-serif`;
}

/**
 * Áp dụng cài đặt giao diện khi load trang (màu, font, theme mặc định)
 */
async function applyAppearanceOnLoad() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'appearance')
            .single();

        if (error || !data) return;

        const s = data.value || {};

        // Áp dụng màu accent
        if (s.accentColor && s.accentColor !== '#4db8ff') {
            applyAccentColor(s.accentColor);
        }

        // Áp dụng font
        if (s.fontFamily && s.fontFamily !== 'Inter') {
            applySiteFont(s.fontFamily);
        }

        // Áp dụng theme mặc định cho user mới (chưa chọn theme)
        if (s.defaultTheme && !localStorage.getItem('theme')) {
            document.documentElement.setAttribute('data-theme', s.defaultTheme);
            const icon = document.getElementById('themeIcon');
            if (icon) icon.className = s.defaultTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
    } catch (err) {
        console.error('Lỗi apply appearance on load:', err);
    }
}

// ============================================
// 2. HIỆU ỨNG VISUAL (Tuyết, Sao, Pháo hoa...)
// ============================================

/**
 * Load & render tất cả hiệu ứng đang bật từ Supabase
 */
async function loadAndApplyHomeEffects() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'visual_effects')
            .single();

        if (error || !data) return;

        const effects = data.value || {};
        // Render tất cả hiệu ứng đang bật
        Object.keys(effects).forEach(key => {
            if (effects[key]) renderHomeEffect(key);
        });
    } catch (err) {
        console.error('Lỗi load home effects:', err);
    }
}

/**
 * Render 1 hiệu ứng lên banner trang chủ
 */
function renderHomeEffect(effectName) {
    const banner = document.querySelector('.banner-slider') || document.querySelector('.hero-section') || document.querySelector('#homePage');
    if (!banner) return;

    // Xóa hiệu ứng cũ nếu có
    removeHomeEffect(effectName);

    // Tạo canvas cho hiệu ứng
    const canvas = document.createElement('canvas');
    canvas.id = `effect-${effectName}`;
    canvas.className = 'home-effect-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    
    // Đảm bảo banner có position relative
    if (getComputedStyle(banner).position === 'static') {
        banner.style.position = 'relative';
    }
    banner.appendChild(canvas);

    // Khởi tạo animation
    const ctx = canvas.getContext('2d');
    canvas.width = banner.offsetWidth;
    canvas.height = banner.offsetHeight;

    const particles = [];
    const config = getEffectConfig(effectName, canvas);

    // Tạo particles
    for (let i = 0; i < config.count; i++) {
        particles.push(createParticle(config, canvas));
    }

    // Vòng lặp animation
    function animate() {
        if (!document.getElementById(`effect-${effectName}`)) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach((p, i) => {
            config.update(p, canvas);
            config.draw(ctx, p);

            // Reset khi ra ngoài
            if (p.y > canvas.height + 10 || p.x > canvas.width + 10 || p.x < -10) {
                particles[i] = createParticle(config, canvas);
                particles[i].y = -10;
            }
        });

        requestAnimationFrame(animate);
    }
    animate();

    // Resize handler
    const resizeHandler = () => {
        const currentCanvas = document.getElementById(`effect-${effectName}`);
        if (currentCanvas && banner) {
            currentCanvas.width = banner.offsetWidth;
            currentCanvas.height = banner.offsetHeight;
        }
    };
    window.addEventListener('resize', resizeHandler);
    canvas._resizeHandler = resizeHandler;
}

/**
 * Cấu hình cho mỗi loại hiệu ứng
 */
function getEffectConfig(type, canvas) {
    switch (type) {
        case 'snow':
            return {
                count: 60,
                update: (p) => { p.y += p.speed; p.x += Math.sin(p.angle) * 0.5; p.angle += 0.01; },
                draw: (ctx, p) => { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`; ctx.fill(); }
            };
        case 'stars':
            return {
                count: 30,
                update: (p) => { p.y += p.speed; p.x += p.speedX; p.opacity = 0.3 + Math.abs(Math.sin(p.angle)) * 0.7; p.angle += 0.03; },
                draw: (ctx, p) => { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation); ctx.fillStyle = `rgba(255, 215, 0, ${p.opacity})`; drawStar(ctx, 0, 0, 5, p.size, p.size / 2); ctx.restore(); p.rotation += 0.02; }
            };
        case 'firework':
            return {
                count: 40,
                update: (p) => {
                    p.y += p.speed; p.x += p.speedX; p.opacity -= 0.005; p.size *= 0.99;
                    if (p.opacity <= 0) { p.opacity = 0.8; p.x = Math.random() * canvas.width; p.y = Math.random() * canvas.height * 0.5; p.speed = (Math.random() - 0.5) * 2; p.speedX = (Math.random() - 0.5) * 3; p.size = Math.random() * 3 + 1; }
                },
                draw: (ctx, p) => { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.opacity})`; ctx.fill(); }
            };
        case 'bubbles':
            return {
                count: 25,
                update: (p) => { p.y -= p.speed; p.x += Math.sin(p.angle) * 0.8; p.angle += 0.02; p.opacity = 0.15 + Math.abs(Math.sin(p.angle * 2)) * 0.25; },
                draw: (ctx, p) => {
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); ctx.strokeStyle = `rgba(150, 220, 255, ${p.opacity})`; ctx.lineWidth = 1; ctx.stroke();
                    ctx.beginPath(); ctx.arc(p.x - p.size, p.y - p.size, p.size * 0.5, 0, Math.PI * 2); ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity * 0.6})`; ctx.fill();
                }
            };
        case 'hearts':
            return {
                count: 20,
                update: (p) => { p.y -= p.speed * 0.8; p.x += Math.sin(p.angle) * 0.6; p.angle += 0.02; p.scale = 0.8 + Math.sin(p.angle * 3) * 0.2; },
                draw: (ctx, p) => {
                    ctx.save(); ctx.translate(p.x, p.y); const s = p.size * (p.scale || 1);
                    ctx.fillStyle = `rgba(255, ${80 + Math.floor(p.r * 0.3)}, ${120 + Math.floor(p.g * 0.2)}, ${p.opacity})`;
                    ctx.beginPath(); ctx.moveTo(0, s * 0.3); ctx.bezierCurveTo(-s, -s * 0.5, -s * 0.5, -s * 1.2, 0, -s * 0.5); ctx.bezierCurveTo(s * 0.5, -s * 1.2, s, -s * 0.5, 0, s * 0.3); ctx.fill(); ctx.restore();
                }
            };
        case 'leaves':
            return {
                count: 20,
                update: (p) => { p.y += p.speed * 0.6; p.x += Math.sin(p.angle) * 1.2; p.angle += 0.015; p.rotation += 0.03; },
                draw: (ctx, p) => {
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
                    const leafColors = ['rgba(200, 150, 50,', 'rgba(180, 100, 30,', 'rgba(220, 180, 60,', 'rgba(160, 80, 20,'];
                    const colorBase = leafColors[Math.floor(p.r / 70) % leafColors.length];
                    ctx.fillStyle = `${colorBase} ${p.opacity})`; ctx.beginPath(); ctx.ellipse(0, 0, p.size * 2.5, p.size, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = `${colorBase} ${p.opacity * 0.5})`; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-p.size * 2, 0); ctx.lineTo(p.size * 2, 0); ctx.stroke(); ctx.restore();
                }
            };
        case 'rain':
            return {
                count: 80,
                update: (p) => { p.y += p.speed * 3; p.x += 1.5; },
                draw: (ctx, p) => { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 1.5, p.y + p.size * 5); ctx.strokeStyle = `rgba(174, 194, 224, ${p.opacity * 0.5})`; ctx.lineWidth = 0.8; ctx.stroke(); }
            };
        case 'confetti':
            return {
                count: 45,
                update: (p) => { p.y += p.speed; p.x += Math.sin(p.angle) * 1.5; p.angle += 0.04; p.rotation += 0.08; },
                draw: (ctx, p) => { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation); ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.opacity})`; ctx.fillRect(-p.size * 1.5, -p.size * 0.5, p.size * 3, p.size); ctx.restore(); }
            };
        default:
            return { count: 0, update: () => {}, draw: () => {} };
    }
}

/**
 * Tạo 1 particle mới
 */
function createParticle(config, canvas) {
    const colors = [
        [255, 100, 100], [100, 200, 255], [255, 215, 0],
        [150, 255, 150], [255, 150, 255], [255, 180, 100]
    ];
    const c = colors[Math.floor(Math.random() * colors.length)];
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 3 + 1,
        speed: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 1,
        opacity: Math.random() * 0.6 + 0.2,
        angle: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        r: c[0], g: c[1], b: c[2]
    };
}

/**
 * Vẽ ngôi sao 5 cánh
 */
function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fill();
}

/**
 * Xóa hiệu ứng khỏi DOM
 */
function removeHomeEffect(effectName) {
    const canvas = document.getElementById(`effect-${effectName}`);
    if (canvas) {
        if (canvas._resizeHandler) {
            window.removeEventListener('resize', canvas._resizeHandler);
        }
        canvas.remove();
    }
}

// ============================================
// 3. MARQUEE — THÔNG BÁO CHẠY CHỮ
// ============================================

/**
 * Load & hiển thị marquee chạy chữ từ Supabase
 */
async function loadAndShowMarquee() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings').select('value').eq('key', 'marquee').single();
        if (error || !data) return;

        const s = data.value || {};
        if (!s.enabled || !s.text) return;

        const bar = document.getElementById('siteMarqueeBar');
        const inner = document.getElementById('siteMarqueeInner');
        if (!bar || !inner) return;

        inner.textContent = s.text;
        const bgCol = s.bgColor || '#1a1a2e';
        bar.style.background = `linear-gradient(90deg, ${bgCol} 0%, ${adjustBrightness(bgCol, 15)} 50%, ${bgCol} 100%)`;
        bar.style.setProperty('--marquee-bg', bgCol);
        inner.style.color = s.textColor || '#fbbf24';
        bar.setAttribute('data-speed', s.speed || 'normal');

        // Xử lý vị trí chữ (scroll / center / left / right + position %)
        const alignMode = s.textAlign || 'scroll';
        const textPos = s.textPosition !== undefined ? s.textPosition : 50;
        if (alignMode === 'scroll') {
            inner.style.animation = '';
            inner.style.display = 'inline-block';
            inner.style.textAlign = '';
            inner.style.width = '';
            inner.style.whiteSpace = 'nowrap';
            inner.style.transform = '';
            inner.style.position = '';
            inner.style.left = '';
        } else {
            inner.style.animation = 'none';
            inner.style.display = 'block';
            inner.style.whiteSpace = 'nowrap';
            inner.style.width = 'auto';
            inner.style.position = 'relative';

            if (alignMode === 'left') {
                inner.style.textAlign = 'left';
                inner.style.transform = `translateX(${textPos}%)`;
            } else if (alignMode === 'center') {
                inner.style.textAlign = 'center';
                const offset = textPos - 50;
                inner.style.transform = `translateX(${offset}%)`;
            } else if (alignMode === 'right') {
                inner.style.textAlign = 'right';
                inner.style.transform = `translateX(-${100 - textPos}%)`;
            }
        }

        bar.style.display = 'block';
        document.body.classList.add('marquee-active');

        // Áp dụng chiều dọc (vOffset)
        if (s.vOffset && s.vOffset !== 0) {
            inner.style.position = 'relative';
            inner.style.top = s.vOffset + 'px';
        }
    } catch (err) {
        console.error('Lỗi show marquee:', err);
    }
}

/**
 * Đóng Marquee (user click X)
 */
function closeSiteMarquee() {
    const bar = document.getElementById('siteMarqueeBar');
    if (bar) {
        bar.style.display = 'none';
        document.body.classList.remove('marquee-active');
    }
}

// ============================================
// 4. POPUP — THÔNG BÁO TOÀN SITE
// ============================================

/**
 * Lấy số tuần hiện tại (năm-tuần)
 */
function getWeekNumber() {
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = d - start;
    const oneWeek = 604800000;
    const week = Math.ceil(diff / oneWeek);
    return `${d.getFullYear()}-W${week}`;
}

/**
 * Kiểm tra có nên hiện popup hay không (dựa vào frequency)
 */
function shouldShowPopup(freq) {
    const now = Date.now();
    if (Array.isArray(freq)) freq = freq[0] || 'once_day';

    switch (freq) {
        case 'every_visit':
            return !window._sitePopupShownThisLoad;
        case '30min': {
            const last30 = parseInt(localStorage.getItem('sitePopupLast30m') || '0');
            return (now - last30) >= 30 * 60 * 1000;
        }
        case '1hour': {
            const last1h = parseInt(localStorage.getItem('sitePopupLast1h') || '0');
            return (now - last1h) >= 60 * 60 * 1000;
        }
        case 'once_day': {
            const today = new Date().toISOString().split('T')[0];
            return localStorage.getItem('sitePopupLastDate') !== today;
        }
        case 'once_week':
            return localStorage.getItem('sitePopupLastWeek') !== getWeekNumber();
        case 'once_only':
            return !localStorage.getItem('sitePopupShownOnce');
        case 'new_user':
            return !localStorage.getItem('sitePopupNewUserSeen');
        default:
            return false;
    }
}

/**
 * Đánh dấu đã hiện popup (cập nhật localStorage)
 */
function markPopupShown(freq) {
    const now = Date.now();
    if (Array.isArray(freq)) freq = freq[0] || 'once_day';

    switch (freq) {
        case 'every_visit': window._sitePopupShownThisLoad = true; break;
        case '30min': localStorage.setItem('sitePopupLast30m', now.toString()); break;
        case '1hour': localStorage.setItem('sitePopupLast1h', now.toString()); break;
        case 'once_day': localStorage.setItem('sitePopupLastDate', new Date().toISOString().split('T')[0]); break;
        case 'once_week': localStorage.setItem('sitePopupLastWeek', getWeekNumber()); break;
        case 'once_only': localStorage.setItem('sitePopupShownOnce', '1'); break;
        case 'new_user': localStorage.setItem('sitePopupNewUserSeen', '1'); break;
    }
}

/**
 * Render nội dung popup lên DOM
 */
function renderSitePopup(settings) {
    const titleEl = document.getElementById('sitePopupTitle');
    const contentEl = document.getElementById('sitePopupContent');
    const imageEl = document.getElementById('sitePopupImage');
    const btnEl = document.getElementById('sitePopupBtn');
    const card = document.querySelector('.site-popup-card');

    if (titleEl) titleEl.textContent = settings.title || '';
    if (contentEl) contentEl.textContent = settings.content || '';

    // Áp dụng màu chữ tùy chỉnh
    if (titleEl) titleEl.style.color = settings.titleColor || '#ffffff';
    if (contentEl) contentEl.style.color = settings.contentColor || '#d9d9d9';

    // Dùng ảnh làm background cho popup card
    if (imageEl) imageEl.style.display = 'none';
    if (card) {
        if (settings.image) {
            card.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 35%, rgba(0,0,0,0.1) 55%, rgba(0,0,0,0.65) 100%), url('${settings.image}')`;
            card.style.backgroundSize = 'cover';
            card.style.backgroundPosition = 'center';
            card.style.minHeight = window.innerWidth <= 768 ? '240px' : '380px';
        } else {
            card.style.backgroundImage = 'none';
            card.style.minHeight = 'auto';
        }
    }

    if (btnEl) {
        btnEl.textContent = settings.btnText || 'Khám phá ngay';
        btnEl.style.color = settings.btnColor || '#ffffff';
        if (settings.btnLink) {
            btnEl.href = settings.btnLink;
        } else {
            btnEl.href = '#';
            btnEl.onclick = (e) => { e.preventDefault(); closeSitePopup(); };
        }
    }

    // Áp dụng vị trí tùy chỉnh nếu admin đã kéo thả
    if (card && (settings.titlePos || settings.contentPos || settings.btnPos)) {
        card.style.position = 'relative';
        const elPad = window.innerWidth <= 768 ? '24px' : '48px';
        const posMap = [
            { sel: '.site-popup-top', pos: settings.titlePos },
            { sel: '.site-popup-middle', pos: settings.contentPos },
            { sel: '.site-popup-bottom', pos: settings.btnPos }
        ];
        setTimeout(() => {
            posMap.forEach(({ sel, pos }) => {
                const el = card.querySelector(sel);
                if (el && pos) {
                    el.style.position = 'absolute';
                    el.style.left = pos.leftPct + '%';
                    el.style.top = pos.topPct + '%';
                    el.style.width = `calc(100% - ${elPad})`;
                    el.style.textAlign = 'center';
                }
            });
        }, 100);
    }
}

/**
 * Load & hiển thị popup thông báo từ Supabase
 */
async function loadAndShowPopup() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('site_settings').select('value').eq('key', 'popup').single();
        
        if (error || !data) return;

        const s = data.value || {};

        if (!s.enabled) return;
        if (!s.title && !s.content) return;

        let frequency = s.frequency || 'once_day';
        if (Array.isArray(frequency)) frequency = frequency[0] || 'once_day';

        // Kiểm tra tần suất
        if (!shouldShowPopup(frequency)) return;

        // Render popup
        renderSitePopup(s);

        // Hiện popup sau 2 giây
        setTimeout(() => {
            const overlay = document.getElementById('sitePopupOverlay');
            if (overlay) overlay.style.display = 'flex';
        }, 2000);

        // Đánh dấu đã hiện
        markPopupShown(frequency);
    } catch (err) {
        console.error('Lỗi show popup:', err);
    }
}

/**
 * Đóng Popup (phiên bản đơn giản cho frontend, ko cần cleanup drag)
 */
function closeSitePopup() {
    // Nếu admin.js đã load và có cleanupDragMode, gọi nó
    if (typeof cleanupDragMode === 'function') {
        cleanupDragMode();
    }
    const overlay = document.getElementById('sitePopupOverlay');
    if (overlay) overlay.style.display = 'none';
}

console.log('✅ site-frontend.js loaded');
