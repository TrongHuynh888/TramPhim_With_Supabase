import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// Cho phép CORS cho tất cả domain
app.use('/*', cors({
    origin: '*',
    allowMethods: ['POST', 'GET', 'DELETE', 'OPTIONS'],
}));

// Route nhận file upload
app.post('/upload', async (c) => {
    try {
        const formData = await c.req.parseBody();
        const file = formData['file'];
        const folder = formData['folder'] || 'images';

        if (!file || !(file instanceof File)) {
            return c.json({ error: 'Không tìm thấy file hợp lệ' }, 400);
        }

        const bucket = c.env.MY_BUCKET;
        if (!bucket) {
            return c.json({ error: 'Chưa cấu hình R2 Bucket' }, 500);
        }

        // Nếu client gửi customFilename (VD: ten_phim_poster.jpg) thì dùng luôn, không sinh random
        const customFilename = formData['customFilename'];
        let key;
        if (customFilename && typeof customFilename === 'string' && customFilename.trim()) {
            key = `${folder}/${customFilename.trim()}`;
        } else {
            // Giữ logic random cũ cho các trường hợp khác (chat, bài post, v.v.)
            const generateId = () => Math.random().toString(36).substring(2, 9);
            const ext = file.name.split('.').pop() || 'png';
            const timestamp = Date.now();
            key = `${folder}/${timestamp}_${generateId()}.${ext}`;
        }

        await bucket.put(key, file.stream(), {
            httpMetadata: {
                contentType: file.type,
            },
        });

        const url = new URL(c.req.url);
        const publicUrl = `${url.origin}/${key}`;

        return c.json({
            success: true,
            url: publicUrl,
            key: key,
            size: file.size,
            type: file.type,
        });
    } catch (err) {
        console.error('Lỗi upload R2:', err);
        return c.json({ error: 'Lỗi máy chủ khi tải ảnh lên R2: ' + err.message }, 500);
    }
});

// Route upload ảnh từ URL (Worker tự fetch, bypass CORS)
app.post('/upload-from-url', async (c) => {
    try {
        const { url, folder = 'images', customFilename } = await c.req.json();

        if (!url) {
            return c.json({ error: 'Thiếu URL ảnh cần tải' }, 400);
        }

        const bucket = c.env.MY_BUCKET;
        if (!bucket) {
            return c.json({ error: 'Chưa cấu hình R2 Bucket' }, 500);
        }

        // Fetch ảnh từ URL gốc (server-side, không bị CORS)
        const imgResponse = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': new URL(url).origin,
            }
        });

        if (!imgResponse.ok) {
            return c.json({ error: `Không thể tải ảnh từ URL: HTTP ${imgResponse.status}` }, 400);
        }

        const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';

        // Tạo key lưu trữ
        let key;
        if (customFilename && typeof customFilename === 'string' && customFilename.trim()) {
            key = `${folder}/${customFilename.trim()}`;
        } else {
            // Lấy tên file từ URL hoặc sinh random
            const urlParts = url.split('/');
            let fileName = urlParts[urlParts.length - 1].split('?')[0] || 'image.jpg';
            if (!fileName.match(/\.(jpg|jpeg|png|gif|webp|avif)$/i)) {
                const ext = contentType.split('/')[1] || 'jpg';
                fileName += `.${ext}`;
            }
            key = `${folder}/${Date.now()}_${fileName}`;
        }

        // Lưu vào R2
        const imgBody = imgResponse.body;
        await bucket.put(key, imgBody, {
            httpMetadata: { contentType },
        });

        const reqUrl = new URL(c.req.url);
        const publicUrl = `${reqUrl.origin}/${key}`;

        return c.json({
            success: true,
            url: publicUrl,
            key: key,
            type: contentType,
        });
    } catch (err) {
        console.error('Lỗi upload từ URL:', err);
        return c.json({ error: 'Lỗi máy chủ: ' + err.message }, 500);
    }
});

// Route xóa file khỏi R2
app.delete('/delete', async (c) => {
    try {
        const { key } = await c.req.json();
        
        if (!key) {
            return c.json({ error: 'Thiếu key của file cần xóa' }, 400);
        }

        const bucket = c.env.MY_BUCKET;
        if (!bucket) {
            return c.json({ error: 'Chưa cấu hình R2 Bucket' }, 500);
        }

        // Xóa file khỏi R2
        await bucket.delete(key);

        return c.json({
            success: true,
            message: `Đã xóa file ${key} thành công`
        });
    } catch (err) {
        console.error('Lỗi xóa file R2:', err);
        return c.json({ error: 'Lỗi máy chủ khi xóa file trên R2: ' + err.message }, 500);
    }
});

// Route lấy ảnh trực tiếp từ R2
app.get('/:folder/:filename', async (c) => {
    try {
        const folder = c.req.param('folder');
        const filename = c.req.param('filename');
        const key = `${folder}/${filename}`;

        const bucket = c.env.MY_BUCKET;
        if (!bucket) {
            return c.json({ error: 'Chưa cấu hình R2 Bucket' }, 500);
        }

        const object = await bucket.get(key);

        if (object === null) {
            return c.text('Không tìm thấy ảnh', 404);
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');

        return new Response(object.body, { headers });
    } catch (err) {
        console.error('Lỗi lấy ảnh từ R2:', err);
        return c.text('Lỗi máy chủ', 500);
    }
});

// Route lấy ảnh từ nested folder (VD: community-posts/{userId}/{filename})
app.get('/:folder/:subfolder/:filename', async (c) => {
    try {
        const folder = c.req.param('folder');
        const subfolder = c.req.param('subfolder');
        const filename = c.req.param('filename');
        const key = `${folder}/${subfolder}/${filename}`;

        const bucket = c.env.MY_BUCKET;
        if (!bucket) {
            return c.json({ error: 'Chưa cấu hình R2 Bucket' }, 500);
        }

        const object = await bucket.get(key);

        if (object === null) {
            return c.text('Không tìm thấy ảnh', 404);
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');

        return new Response(object.body, { headers });
    } catch (err) {
        console.error('Lỗi lấy ảnh từ R2 (nested):', err);
        return c.text('Lỗi máy chủ', 500);
    }
});

// Route kiểm tra Worker có hoạt động không
app.get('/', (c) => {
    return c.json({
        status: 'ok',
        message: 'R2 Uploader Worker đang hoạt động!',
        version: '1.1.0',
    });
});

export default app;
