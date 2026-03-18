/**
 * Emoji & Sticker Picker Logic for CineChat
 * Phiên bản 10.0: Fix triệt để 100% Lỗi Cuộn, Toggle & Dữ liệu rác
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
