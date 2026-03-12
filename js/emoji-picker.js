/**
 * Emoji & Sticker Picker Logic for CineChat
 * Phiên bản 8.0: 100% Stable Source & Professional UI
 * Fix lỗi "Hidden broken sticker" bằng cách sử dụng Giphy Direct CDN (i.giphy.com)
 */

const EMOJI_DATA = [
    {
        category: "Mặt cười & Cảm xúc",
        icon: "fa-smile",
        emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😮‍💨", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤔", "🤭", "🤫", "🤥", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "😵‍💫", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠"]
    },
    {
        category: "Cử chỉ & Con người",
        icon: "fa-hands",
        emojis: ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦿", "🦶", "👣", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄", "💋"]
    },
    {
        category: "Trái tim & Ký hiệu",
        icon: "fa-heart",
        emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "💌", "💢", "💥", "💫", "💦", "💨", "🕳️", "💬", "👁️‍🗨️", "🗨️", "🗯️", "💭", "💤"]
    }
];

// Kho Sticker v11.0: Hệ thống phân loại nội bộ (Bạn tự thêm ảnh vào folder)
const STICKER_DATA = [
    {
        id: "local_pepe",
        name: "Ếch Pepe",
        icon: "fa-frog",
        stickers: [
           // "images/stickers/pepe/example_pepe.png"
        ]
    },
    {
        id: "local_cat",
        name: "Mèo Cute",
        icon: "fa-cat",
        stickers: [
            // Thêm file vào images/stickers/cat/ rồi khai báo tên ở đây
            // Ví dụ: "images/stickers/cat/ami-01.gif"
        ]
    },
    {
        id: "local_funny",
        name: "Hài hước",
        icon: "fa-grin-squint",
        stickers: [
            // Thêm file vào images/stickers/funny/ rồi khai báo tên ở đây
        ]
    },
    {
        id: "local_love",
        name: "Tình yêu",
        icon: "fa-heart",
        stickers: [
            // Thêm file vào images/stickers/love/ rồi khai báo tên ở đây
        ]
    },
    {
        id: "local_movies",
        name: "Phim ảnh",
        icon: "fa-film",
        stickers: [
            "images/stickers/movies/example_sticker.png"
            // Thêm file vào images/stickers/movies/ rồi khai báo tên ở đây
        ]
    }
];

let isEmojiPickerOpen = false;

function initEmojiPicker() {
    console.log("🚀 Khởi tạo Kho Sticker v8.0 - 100% Stable Source...");
    const container = document.getElementById('commEmojiPicker');
    if (!container) return;

    // --- RENDER EMOJI VIEW ---
    const emojiTabsHtml = EMOJI_DATA.map((cat, index) => `
        <button class="emoji-tab ${index === 0 ? 'active' : ''}" 
                onclick="switchEmojiCategory(${index})" 
                title="${cat.category}">
            <i class="fas ${cat.icon}"></i>
        </button>
    `).join('');

    const emojiContentHtml = EMOJI_DATA.map((cat, index) => `
        <div class="emoji-category-content ${index === 0 ? 'active' : ''}" id="emoji-cat-${index}">
            <div class="emoji-grid">
                ${cat.emojis.map(emoji => `
                    <span class="emoji-item" onclick="insertEmoji('${emoji}')">${emoji}</span>
                `).join('')}
            </div>
        </div>
    `).join('');

    // --- RENDER STICKER VIEW ---
    const stickerTabsHtml = STICKER_DATA.map((pkg, index) => `
        <button class="sticker-nav-tab ${index === 0 ? 'active' : ''}" 
                onclick="switchStickerCategory(${index})" 
                title="${pkg.name}" id="sticker-nav-${index}">
            <i class="fas ${pkg.icon}"></i>
        </button>
    `).join('');

    const stickerContentHtml = STICKER_DATA.map((pkg, index) => `
        <div class="sticker-category-content ${index === 0 ? 'active' : ''}" id="sticker-cat-${index}">
            <div class="sticker-pack-info">${pkg.name}</div>
            <div class="sticker-items-grid">
                ${pkg.stickers.map(url => `
                    <div class="sticker-item-wrapper sticker-skeleton">
                        <img src="${url}" class="sticker-item" 
                             onclick="sendSticker('${url}')" 
                             onload="onStickerLoad(this)"
                             onerror="handleStickerError(this)"
                             loading="lazy">
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

    // Click outside logic
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('commEmojiPicker');
        const triggerEmoji = document.querySelector('.btn-emoji-trigger');
        const triggerSticker = document.querySelector('button[title="Sticker"]');
        
        if (isEmojiPickerOpen && picker && !picker.contains(e.target)) {
            if (triggerEmoji && triggerEmoji.contains(e.target)) return;
            if (triggerSticker && triggerSticker.contains(e.target)) return;
            toggleEmojiPicker(false);
        }
    });

    // Smart preload: Remove skeleton for already cached images
    setTimeout(() => {
        document.querySelectorAll('.sticker-item').forEach(img => {
            if (img.complete) onStickerLoad(img);
        });
    }, 500);
}

function onStickerLoad(img) {
    img.classList.add('loaded');
    const wrapper = img.closest('.sticker-item-wrapper');
    if (wrapper) {
        wrapper.classList.remove('sticker-skeleton');
    }
}

function handleStickerError(img) {
    const wrapper = img.closest('.sticker-item-wrapper');
    if (wrapper) {
        wrapper.style.display = 'none';
        console.warn("Hidden broken sticker (v8.0):", img.src);
    }
}

function toggleEmojiPicker(forceState, mode = 'emoji') {
    const picker = document.getElementById('commEmojiPicker');
    const emojiView = document.getElementById('emojiPickerView');
    const stickerView = document.getElementById('stickerPickerView');
    if (!picker || !emojiView || !stickerView) return;

    isEmojiPickerOpen = typeof forceState === 'boolean' ? forceState : !isEmojiPickerOpen;
    
    if (isEmojiPickerOpen) {
        picker.classList.add('active');
        emojiView.style.display = mode === 'emoji' ? 'block' : 'none';
        stickerView.style.display = mode === 'sticker' ? 'block' : 'none';
    } else {
        picker.classList.remove('active');
    }
}

function switchEmojiCategory(index) {
    document.querySelectorAll('.emoji-tab').forEach((tab, i) => tab.classList.toggle('active', i === index));
    document.querySelectorAll('.emoji-category-content').forEach((content, i) => content.classList.toggle('active', i === index));
}

function switchStickerCategory(index) {
    document.querySelectorAll('.sticker-nav-tab').forEach((tab, i) => tab.classList.toggle('active', i === index));
    document.querySelectorAll('.sticker-category-content').forEach((content, i) => content.classList.toggle('active', i === index));
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

async function sendSticker(url) {
    if (!currentUser || !currentChatUserId) return;
    const content = `[STICKER]${url}`;
    toggleEmojiPicker(false);
    const input = document.getElementById("commChatInputMessage");
    if(input) {
        input.value = content;
        if (typeof sendMessage === 'function') {
            sendMessage();
        }
    }
}

function searchEmoji(query) {
    query = query.toLowerCase().trim();
    const categories = document.querySelectorAll('#emojiPickerView .emoji-category-content');
    const tabs = document.querySelector('#emojiPickerView .emoji-tabs');
    if (!query) {
        categories.forEach((cat, i) => {
            cat.classList.toggle('active', i === 0);
            cat.querySelectorAll('.emoji-item').forEach(e => e.style.display = 'flex');
        });
        document.querySelectorAll('#emojiPickerView .emoji-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        if (tabs) tabs.style.display = 'flex';
        return;
    }
    if (tabs) tabs.style.display = 'none';
    categories.forEach(cat => {
        cat.classList.add('active');
        cat.querySelectorAll('.emoji-item').forEach(item => {
            item.style.display = item.textContent.includes(query) ? 'flex' : 'none';
        });
    });
}
