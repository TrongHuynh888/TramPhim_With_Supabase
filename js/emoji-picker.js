/**
 * Emoji & Sticker Picker Logic — CineChat + Watch Party
 * Phiên bản 11.0: Tách biệt 2 picker: commEmojiPicker (CineChat) & wpEmojiPicker (Watch Party)
 */

const EMOJI_DATA = [
    {
        category: "Mặt cười & Cảm xúc",
        icon: "fa-smile",
        emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😮‍💨", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤔", "🤭", "🤫", "🤥", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "😵‍💫", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", "🤖"]
    },
    {
        category: "Cử chỉ & Con người",
        icon: "fa-user",
        emojis: ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦿", "🦶", "👣", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄", "💋", "👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "🧔", "👩", "🧓", "👴", "👵", "👨‍⚕️", "👩‍⚕️", "👨‍🎓", "👩‍🎓", "👨‍🍳", "👩‍🍳", "👨‍🌾", "👩‍🌾", "👨‍🔧", "👩‍🔧", "👨‍🏭", "👩‍🏭", "👨‍💼", "👩‍💼", "👨‍🔬", "👩‍🔬", "👨‍💻", "👩‍💻", "👨‍🎤", "👩‍🎤", "👨‍🎨", "👩‍🎨", "👨‍✈️", "👩‍✈️"]
    },
    {
        category: "Động vật & Thiên nhiên",
        icon: "fa-paw",
        emojis: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦢", "🦉", "🦩", "🦚", "🦜", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈", "🐈‍⬛", "🐇", "🐿️", "🦫", "🦨", "🦡", "🦦", "🦥", "🐁", "🐀", "🐾", "🐉", "🐲", "🌵", "🎄", "🌲", "🌳", "🌴", "🌱", "🌿", "☘️", "🍀", "🎍", "🪴", "🎋", "🍃", "🍂", "🍁", "🍄", "🌾", "💐", "🌷", "🌹", "🥀", "🌺", "🌸", "🌼", "🌻", "🌞", "🌝", "🌛", "🌜", "🌚", "🌕", "🌖", "🌗", "🌘", "🌑", "🌒", "🌓", "🌔", "🌙", "🌎", "🌍", "🌏", "🪐", "💫", "⭐", "🌟", "✨", "⚡", "☄️", "💥", "🔥", "🌪️", "🌈", "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "❄️", "☃️", "⛄", "🌬️", "💨", "💧", "💦", "☔", "☂️", "🌊", "🌫️"]
    },
    {
        category: "Đồ ăn & Thức uống",
        icon: "fa-utensils",
        emojis: ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🍄", "🥜", "🫘", "🌰", "🍞", "🥐", "🥖", "🫓", "🥨", "🥯", "🥞", "🧇", "🧀", "🍖", "🍗", "🥩", "🥓", "🍔", "🍟", "🍕", "🌭", "🥪", "🌮", "🌯", "🫔", "🥗", "🥘", "🫕", "🥣", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🍯", "🥛", "☕", "🫖", "🍵", "🍶", "🍾", "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🥤", "🧋", "🧃", "🧉"]
    },
    {
        category: "Hoạt động & Thể thao",
        icon: "fa-volleyball-ball",
        emojis: ["⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂", "🏋️", "🤼", "🤸", "⛹️", "🤺", "🤾", "🏌️", "🏇", "🧘", "🏄", "🏊", "🤽", "🚣", "🧗", "🚵", "🚴", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🏵️", "🎫", "🎟️", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🎸", "🎻", "🎲", "♟️", "🎯", "🎳", "🎮", "🎰", "🧩"]
    },
    {
        category: "Du lịch & Địa danh",
        icon: "fa-plane",
        emojis: ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚", "🚛", "🚜", "🏍️", "🛵", "🦽", "🦼", "🛺", "🚲", "🛴", "🚏", "🛣️", "🛤️", "🛢️", "⛽", "🚨", "🚥", "🚦", "🛑", "🚧", "⚓", "⛵", "🛶", "🚤", "🛳️", "⛴️", "🛥️", "🚢", "✈️", "🛫", "🛬", "🪂", "🚁", "🚟", "🚠", "🚡", "🛰️", "🚀", "🛸", "🪐", "🌠", "🌌", "⛱️", "🎆", "🎇", "🎑", "⛰️", "🏔️", "🗻", "🏕️", "🏖️", "🏜️", "🏝️", "🏞️", "🏟️", "🏛️", "🏗️", "🧱", "🏘️", "🏠", "🏡", "🏢", "🏣", "🏤", "🏥", "🏦", "🏨", "🏩", "🏪", "🏫", "🏬", "🏭", "🏰", "🏰", "💒", "🗼", "🗽", "🕍", "🕋", "⛩️", "⛲", "⛺", "🌁", "🌃", "🏙️", "🌆", "🌅", "🌇"]
    },
    {
        category: "Vật dụng & Biểu tượng",
        icon: "fa-lightbulb",
        emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "💌", "💢", "💥", "💫", "💦", "💨", "🕳️", "💬", "👁️‍🗨️", "🗨️", "🗯️", "💭", "💤", "⌚", "📱", "📲", "💻", "⌨️", "🖱️", "🖲️", "🕹️", "🗜️", "💽", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥", "📽️", "🎞️", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️", "🎛️", "🧭", "⏱️", "⏲️", "⏰", "🕰️", "⌛", "⏳", "📡", "🔋", "🔌", "💡", "🔦", "🕯️", "🪔", "🧯", "🛢️", "💸", "💵", "💴", "💶", "💷", "🪙", "💰", "💳", "💎", "⚖️", "🪜", "🧰", "🪛", "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🪚", "🔫", "💣", "🪓", "🔪", "🗡️", "⚔️", "🛡️", "🚬", "⚰️", "🪦", "⚱️", "🏺", "🔮", "🪄", "📿", "🧿", "💈", "⚗️", "🔭", "🔬", "🕳️", "🩹", "🩺", "💊", "💉", "🩸", "🧬", "🦠", "🧫", "🧪", "🌡️", "🧹", "🧺", "🧻", "🧼", "🧽", "🪠", "🛀", "🚿", "🪑", "🚽", "🚪", "🪞", "🪟", "🛎️", "🔑", "🗝️", "🛋️", "🛏️", "🛌", "🧸", "🖼️", "🛍️", "🛒", "🎁", "🎈", "🎏", "🎀", "🪄", "🎊", "🎉"]
    }
];

// Kho Sticker v12.0 - 5 bộ sticker với ảnh AI
const STICKER_DATA = [
    {
        id: "cat", name: "Mèo dễ thương", icon: "fa-cat",
        stickers: ["images/stickers/cat/1.png", "images/stickers/cat/2.png", "images/stickers/cat/3.png", "images/stickers/cat/4.png"]
    },
    {
        id: "funny", name: "Vui nhộn", icon: "fa-laugh-squint",
        stickers: ["images/stickers/funny/1.png", "images/stickers/funny/2.png", "images/stickers/funny/3.png", "images/stickers/funny/4.png"]
    },
    {
        id: "love", name: "Tình yêu", icon: "fa-heart",
        stickers: ["images/stickers/love/1.png", "images/stickers/love/2.png", "images/stickers/love/3.png", "images/stickers/love/4.png"]
    },
    {
        id: "movies", name: "Phim ảnh", icon: "fa-film",
        stickers: ["images/stickers/movies/1.png", "images/stickers/movies/2.png", "images/stickers/movies/3.png", "images/stickers/movies/4.png"]
    },
    {
        id: "pepe", name: "Pepe", icon: "fa-frog",
        stickers: ["images/stickers/pepe/1.png", "images/stickers/pepe/2.png", "images/stickers/pepe/3.png", "images/stickers/pepe/4.png"]
    }
];

let isEmojiPickerOpen = false;

// Trạng thái mở/đóng picker riêng cho Watch Party
let isWpEmojiPickerOpen = false;

function initEmojiPicker() {
    const container = document.getElementById('commEmojiPicker');
    if (!container) return;

    // Render Tabs
    const emojiTabsHtml = EMOJI_DATA.map((cat, index) => `
        <button class="emoji-tab ${index === 0 ? 'active' : ''}" onclick="switchEmojiCategory(${index})" title="${cat.category}">
            <i class="fas ${cat.icon}"></i>
        </button>
    `).join('');

    // Render Content (Làm sạch 100% dữ liệu)
    const emojiContentHtml = EMOJI_DATA.map((cat, index) => `
        <div class="emoji-category-content ${index === 0 ? 'active' : ''}" id="emoji-cat-${index}">
            <div class="emoji-grid">
                ${cat.emojis.filter(e => {
                    const clean = e.trim();
                    return clean.length > 0 && !/^[a-zA-Z\s\u00C0-\u024F\u1E00-\u1EFF]+$/.test(clean);
                }).map(emoji => `
                    <span class="emoji-item" onclick="insertEmoji('${emoji}')">${emoji}</span>
                `).join('')}
            </div>
        </div>
    `).join('');

    // Render Sticker Tabs Sidebar + Grid
    const stickerTabsHtml = STICKER_DATA.map((pack, index) => `
        <button class="sticker-nav-tab ${index === 0 ? 'active' : ''}" 
                onclick="switchStickerCategory(${index})" title="${pack.name}">
            <i class="fas ${pack.icon}"></i>
        </button>
    `).join('');

    const stickerContentHtml = STICKER_DATA.map((pack, index) => `
        <div class="sticker-category-content ${index === 0 ? 'active' : ''}" id="sticker-cat-${index}">
            <div class="sticker-pack-info">${pack.name}</div>
            <div class="sticker-items-grid">
                ${pack.stickers.map(url => `
                    <div class="sticker-item-wrapper" onclick="sendStickerFromPicker('${url}')">
                        <img src="${url}" class="sticker-item loaded" alt="sticker" loading="lazy">
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <div id="emojiPickerView" class="picker-mode-view">
            <div class="emoji-picker-header">
                <div class="emoji-tabs">${emojiTabsHtml}</div>
                <div class="emoji-search-box">
                    <i class="fas fa-search"></i>
                    <input type="text" placeholder="Tìm emoji..." id="emojiSearchInput" oninput="searchEmoji(this.value)">
                </div>
            </div>
            <div class="emoji-picker-body">${emojiContentHtml}</div>
        </div>
        <div id="stickerPickerView" class="picker-mode-view" style="display: none;">
            <div class="sticker-picker-container">
                <div class="sticker-tabs-sidebar">${stickerTabsHtml}</div>
                <div class="sticker-picker-body">${stickerContentHtml}</div>
            </div>
        </div>
    `;

    // Click Outside Logic (Cải tiến với Closest)
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('commEmojiPicker');
        const isTrigger = e.target.closest('.btn-emoji-trigger') || e.target.closest('button[title="Sticker"]');
        
        if (isEmojiPickerOpen && picker && !picker.contains(e.target) && !isTrigger) {
            toggleEmojiPicker(false);
        }
    });
}

function toggleEmojiPicker(forceState, mode = 'emoji') {
    const picker = document.getElementById('commEmojiPicker');
    const emojiView = document.getElementById('emojiPickerView');
    const stickerView = document.getElementById('stickerPickerView');
    if (!picker || !emojiView || !stickerView) return;

    // Logic toggle nâng cao: Nếu nhấn lại vào chính mode đang mở -> Đóng
    const currentMode = emojiView.style.display === 'flex' ? 'emoji' : 'sticker';
    if (isEmojiPickerOpen && forceState === true && mode === currentMode) {
        forceState = false;
    }

    isEmojiPickerOpen = typeof forceState === 'boolean' ? forceState : !isEmojiPickerOpen;
    
    if (isEmojiPickerOpen) {
        picker.classList.add('active');
        emojiView.style.display = mode === 'emoji' ? 'flex' : 'none';
        stickerView.style.display = mode === 'sticker' ? 'flex' : 'none';
        picker.style.display = 'flex';
    } else {
        picker.classList.remove('active');
        picker.style.display = 'none';
    }
}

function switchEmojiCategory(index) {
    document.querySelectorAll('.emoji-tab').forEach((tab, i) => tab.classList.toggle('active', i === index));
    document.querySelectorAll('.emoji-category-content').forEach((content, i) => {
        content.classList.toggle('active', i === index);
        // Reset scroll khi chuyển category
        if (i === index) {
            const body = document.querySelector('.emoji-picker-body');
            if (body) body.scrollTop = 0;
        }
    });
}

function insertEmoji(emoji) {
    const input = document.getElementById('commChatInputMessage');
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.focus();
    const newPos = start + emoji.length;
    input.setSelectionRange(newPos, newPos);
}

function searchEmoji(query) {
    query = query.toLowerCase().trim();
    const categories = document.querySelectorAll('.emoji-category-content');
    const tabs = document.querySelector('.emoji-tabs');
    
    if (!query) {
        categories.forEach((cat, i) => {
            cat.style.display = i === 0 ? 'block' : 'none';
            cat.classList.toggle('active', i === 0);
            cat.querySelectorAll('.emoji-item').forEach(e => e.style.display = 'flex');
        });
        document.querySelectorAll('.emoji-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        if (tabs) tabs.style.display = 'flex';
        return;
    }

    if (tabs) tabs.style.display = 'none';
    categories.forEach(cat => {
        cat.style.display = 'block';
        cat.classList.add('active');
        let hasMatch = false;
        cat.querySelectorAll('.emoji-item').forEach(item => {
            const isMatch = item.textContent.includes(query);
            item.style.display = isMatch ? 'flex' : 'none';
            if (isMatch) hasMatch = true;
        });
        cat.style.display = hasMatch ? 'block' : 'none';
    });
}

/**
 * Chuyển tab bộ sticker
 */
function switchStickerCategory(index) {
    document.querySelectorAll('.sticker-nav-tab').forEach((tab, i) => tab.classList.toggle('active', i === index));
    document.querySelectorAll('.sticker-category-content').forEach((content, i) => {
        content.classList.toggle('active', i === index);
        if (i === index) {
            const body = document.querySelector('.sticker-picker-body');
            if (body) body.scrollTop = 0;
        }
    });
}

/**
 * Gửi sticker từ picker (đặt nội dung [STICKER]url rồi gọi sendMessage)
 */
function sendStickerFromPicker(stickerUrl) {
    if (!stickerUrl) return;
    
    const input = document.getElementById('commChatInputMessage');
    if (input) {
        input.value = `[STICKER]${stickerUrl}`;
        // Đóng picker trước khi gửi
        toggleEmojiPicker(false);
        // Gọi hàm gửi tin nhắn
        if (typeof sendMessage === 'function') {
            sendMessage();
        }
    }
}

// ============================================================
// WATCH PARTY EMOJI PICKER — Tách biệt, không xung đột CineChat
// ============================================================

/**
 * Khởi tạo emoji picker cho Watch Party (container #wpEmojiPicker)
 * Chỉ render phần emoji, bỏ sticker để giao diện gọn hơn trong chat phòng.
 */
function initWpEmojiPicker() {
    const container = document.getElementById('wpEmojiPicker');
    if (!container) return;

    // Render tabs danh mục
    const emojiTabsHtml = EMOJI_DATA.map((cat, index) => `
        <button class="wp-emoji-tab ${index === 0 ? 'active' : ''}" onclick="switchWpEmojiCategory(${index})" title="${cat.category}">
            <i class="fas ${cat.icon}"></i>
        </button>
    `).join('');

    // Render nội dung emoji theo từng danh mục
    const emojiContentHtml = EMOJI_DATA.map((cat, index) => `
        <div class="wp-emoji-category-content ${index === 0 ? 'active' : ''}" id="wp-emoji-cat-${index}">
            <div class="emoji-grid">
                ${cat.emojis.filter(e => {
                    const clean = e.trim();
                    return clean.length > 0 && !/^[a-zA-Z\s\u00C0-\u024F\u1E00-\u1EFF]+$/.test(clean);
                }).map(emoji => `
                    <span class="emoji-item" onclick="insertWpEmoji('${emoji}')">${emoji}</span>
                `).join('')}
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="wp-emoji-picker-inner">
            <div class="wp-emoji-picker-header">
                <div class="wp-emoji-tabs">${emojiTabsHtml}</div>
                <div class="wp-emoji-search-box">
                    <i class="fas fa-search"></i>
                    <input type="text" placeholder="Tìm emoji..." id="wpEmojiSearchInput" oninput="searchWpEmoji(this.value)">
                </div>
            </div>
            <div class="wp-emoji-picker-body">${emojiContentHtml}</div>
        </div>
    `;

    // Đóng picker khi click ra ngoài
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('wpEmojiPicker');
        const isTrigger = e.target.closest('.btn-wp-emoji-trigger');
        if (isWpEmojiPickerOpen && picker && !picker.contains(e.target) && !isTrigger) {
            toggleWpEmojiPicker(false);
        }
    });
}

/**
 * Bật/tắt emoji picker Watch Party
 * @param {boolean|null} forceState - true=mở, false=đóng, null=toggle
 */
function toggleWpEmojiPicker(forceState) {
    const picker = document.getElementById('wpEmojiPicker');
    if (!picker) return;

    // Nếu nhấn lại khi đang mở -> đóng
    if (isWpEmojiPickerOpen && forceState === true) {
        forceState = false;
    }

    isWpEmojiPickerOpen = typeof forceState === 'boolean' ? forceState : !isWpEmojiPickerOpen;

    if (isWpEmojiPickerOpen) {
        picker.classList.add('active');
        picker.style.display = 'block';
    } else {
        picker.classList.remove('active');
        picker.style.display = 'none';
    }
}

/**
 * Chèn emoji vào ô input chat của Watch Party (#chatInput)
 * @param {string} emoji - Ký tự emoji được chọn
 */
function insertWpEmoji(emoji) {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.focus();
    const newPos = start + emoji.length;
    input.setSelectionRange(newPos, newPos);
}

/**
 * Chuyển tab danh mục emoji trong picker Watch Party
 * @param {number} index - Index danh mục
 */
function switchWpEmojiCategory(index) {
    document.querySelectorAll('.wp-emoji-tab').forEach((tab, i) => tab.classList.toggle('active', i === index));
    document.querySelectorAll('.wp-emoji-category-content').forEach((content, i) => {
        content.classList.toggle('active', i === index);
        if (i === index) {
            const body = document.querySelector('.wp-emoji-picker-body');
            if (body) body.scrollTop = 0;
        }
    });
}

/**
 * Tìm kiếm emoji trong picker Watch Party
 * @param {string} query - Từ khóa tìm kiếm
 */
function searchWpEmoji(query) {
    query = query.toLowerCase().trim();
    const categories = document.querySelectorAll('.wp-emoji-category-content');
    const tabs = document.querySelector('.wp-emoji-tabs');

    if (!query) {
        categories.forEach((cat, i) => {
            cat.style.display = i === 0 ? 'block' : 'none';
            cat.classList.toggle('active', i === 0);
            cat.querySelectorAll('.emoji-item').forEach(e => e.style.display = 'flex');
        });
        document.querySelectorAll('.wp-emoji-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        if (tabs) tabs.style.display = 'flex';
        return;
    }

    if (tabs) tabs.style.display = 'none';
    categories.forEach(cat => {
        cat.style.display = 'block';
        cat.classList.add('active');
        let hasMatch = false;
        cat.querySelectorAll('.emoji-item').forEach(item => {
            const isMatch = item.textContent.includes(query);
            item.style.display = isMatch ? 'flex' : 'none';
            if (isMatch) hasMatch = true;
        });
        cat.style.display = hasMatch ? 'block' : 'none';
    });
}
