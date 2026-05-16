import os
import sys
import site

# Tự động nạp thư viện CUDNN/CUBLAS vào PATH cho Windows (Fix lỗi không nhận GPU)
try:
    for pkg_dir in site.getsitepackages() + [site.getusersitepackages()]:
        for nvidia_pkg in ['cublas', 'cudnn']:
            bin_path = os.path.join(pkg_dir, 'nvidia', nvidia_pkg, 'bin')
            if os.path.exists(bin_path):
                os.environ['PATH'] = bin_path + os.pathsep + os.environ.get('PATH', '')
                if hasattr(os, 'add_dll_directory'):
                    os.add_dll_directory(bin_path)
except Exception: pass

import shutil
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import threading
import uuid
import datetime
import subprocess
import json
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from faster_whisper import WhisperModel
from supabase import create_client, ClientOptions
from deep_translator import GoogleTranslator
import imageio_ffmpeg
import tempfile
try:
    import google.generativeai as genai
except ImportError:
    genai = None
try:
    from groq import Groq as GroqClient
except ImportError:
    GroqClient = None
import time
import re
import hashlib

app = Flask(__name__)
CORS(app) # Cho phép Web Admin (Domain khác/localhost) gọi API

# Cấu hình AI Model
# Có thể chọn "base", "small", "medium", "large-v2", "large-v3"
MODEL_SIZE = "large-v3" 
# Vì bạn dùng RTX 3050 (4GB VRAM), chuyển sang 'int8' để đảm bảo không bị tràn bộ nhớ VRAM khi xài bản Large-v3.
# Đường dẫn an toàn để lưu cấu hình não bộ AI (Tuyệt đối không để trong dự án)
AI_MODELS_DIR = "D:/TramPhim_AI_Models"
os.makedirs(AI_MODELS_DIR, exist_ok=True)

try:
    print(f"[*] Đang tải Whisper model: {MODEL_SIZE} ...")
    model = WhisperModel(MODEL_SIZE, device="cuda", compute_type="int8", download_root=AI_MODELS_DIR)
    print("[+] Tải Model thành công! Sẵn sàng nhận lệnh.")
except Exception as e:
    print(f"[-] Không thể tải mô hình bằng CUDA (Lỗi: {e}). Chuyển sang CPU...")
    model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8", download_root=AI_MODELS_DIR)

def format_timestamp(seconds: float):
    # Hàm convert giây sang chuẩn vtt: 00:00:00.000
    td = datetime.timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    milliseconds = int((seconds - total_seconds) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}"

@app.route('/process-ai', methods=['POST'])
def process_ai():
    data = request.json
    movie_id = data.get('movieId')
    episode_name = data.get('episodeName')
    video_url = data.get('videoUrl')
    supabase_url = data.get('supabaseUrl')
    supabase_key = data.get('supabaseKey')
    target_lang = data.get('targetLang', 'en')
    bilingual = data.get('bilingual', False)
    gemini_key = data.get('geminiKey', '').strip()
    groq_key = data.get('groqKey', '').strip()
    groq_model = data.get('groqModel', 'llama-3.3-70b-versatile').strip()
    # Danh sách API key dự phòng (gửi từ Admin UI)
    groq_backup_keys = data.get('groqBackupKeys', [])
    if isinstance(groq_backup_keys, str):
        groq_backup_keys = [k.strip() for k in groq_backup_keys.split(',') if k.strip()]
    translate_engine = data.get('translateEngine', 'gemini').strip()  # gemini / groq / google
    transcribe_engine = data.get('transcribeEngine', 'groq_cloud').strip()  # groq_cloud / local
    access_token = data.get('accessToken', '').strip()
    movie_title = data.get('movieTitle', '').strip()  # Tên phim để AI hiểu ngữ cảnh

    if not all([movie_id, episode_name, video_url, supabase_url, supabase_key]):
        missing = []
        if not movie_id: missing.append("movieId")
        if not episode_name: missing.append("episodeName")
        if not video_url: missing.append("videoUrl")
        if not supabase_url: missing.append("supabaseUrl")
        if not supabase_key: missing.append("supabaseKey")
        print(f"[!] LỖI 400 - Thiếu dữ liệu: {missing}")
        return jsonify({"success": False, "message": f"Thiếu dữ liệu: {', '.join(missing)}"}), 400

    def generate():
        ffmpeg_process = None
        global model
        yield f"data: {json.dumps({'status': 'info', 'message': '[*] Bắt đầu kết nối AI...'})}\n\n"
        
        # Lưu file tạm tại thư mục NGOÀI dự án để tránh Live Server tự reload
        sys_temp_dir = 'D:/TramPhim_AI_Temp'
        sys_backup_dir = 'D:/TramPhim_AI_Backup_Subtitles'
        os.makedirs(sys_temp_dir, exist_ok=True)
        os.makedirs(sys_backup_dir, exist_ok=True)
        
        # Băm URL video để tạo Cache ID duy nhất
        url_hash = hashlib.md5(video_url.encode('utf-8')).hexdigest()[:8]
        safe_ep_name = "".join(x for x in str(episode_name) if x.isalnum() or x in " _-")
        
        # Chọn định dạng audio tùy theo engine bóc băng
        is_cloud = (transcribe_engine == 'groq_cloud' and groq_key)
        audio_ext = '.mp3' if is_cloud else '.wav'
        temp_audio = os.path.join(sys_temp_dir, f"audio_cache_{movie_id}_{safe_ep_name}_{url_hash}{audio_ext}")
        audio_done_flag = f"{temp_audio}.done"
        output_vtt = os.path.join(sys_temp_dir, f"subs_{movie_id}_{target_lang[:2]}.vtt")
        
        try:
            # ----> BƯỚC 1: KIỂM TRA CACHE ÂM THANH <----
            if os.path.exists(audio_done_flag) and os.path.exists(temp_audio):
                yield f"data: {json.dumps({'status': 'info', 'message': f'[*] ⚡ PHỤC HỒI TIẾN TRÌNH: Nhận diện đã có sẵn Audio tải từ trước! Bỏ qua bước download HLS...'})}\n\n"
            else:
                # Xóa file audio cũ nếu chuyển engine (VD: từ WAV sang MP3)
                for old_ext in ['.wav', '.mp3']:
                    old_file = os.path.join(sys_temp_dir, f"audio_cache_{movie_id}_{safe_ep_name}_{url_hash}{old_ext}")
                    old_flag = f"{old_file}.done"
                    if os.path.exists(old_file): os.remove(old_file)
                    if os.path.exists(old_flag): os.remove(old_flag)
                
                if is_cloud:
                    yield f"data: {json.dumps({'status': 'info', 'message': f'[*] ☁️ Chế độ GROQ CLOUD — Đang nén âm thanh MP3 (32kbps) để upload...'})}\n\n"
                else:
                    yield f"data: {json.dumps({'status': 'info', 'message': f'[*] 🖥️ Chế độ LOCAL GPU — Đang tải âm thanh WAV để Whisper xử lý...'})}\n\n"
                
                ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
                
                if is_cloud:
                    # Nén MP3 32kbps mono 16kHz — tối ưu cho speech, file siêu nhỏ
                    cmd = [
                        ffmpeg_path, "-i", video_url, 
                        "-vn", "-acodec", "libmp3lame", "-b:a", "32k", "-ar", "16000", "-ac", "1", 
                        temp_audio, "-y"
                    ]
                else:
                    # WAV PCM chuẩn cho Whisper Local
                    cmd = [
                        ffmpeg_path, "-i", video_url, 
                        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", 
                        temp_audio, "-y"
                    ]
                
                # Mở tiến trình FFmpeg để đọc trạng thái Live
                ffmpeg_process = subprocess.Popen(
                    cmd, 
                    stderr=subprocess.PIPE, 
                    stdout=subprocess.DEVNULL,
                    universal_newlines=True, 
                    encoding='utf-8',
                    errors='replace'
                )
                
                time_pattern = re.compile(r"time=(\d{2}:\d{2}:\d{2}\.\d{2})")
                last_yield_time = time.time()
                
                # Đọc theo thời gian thực dòng lệnh ffmpeg
                for line in ffmpeg_process.stderr:
                    match = time_pattern.search(line)
                    if match:
                        current_time = match.group(1)
                        now = time.time()
                        if now - last_yield_time > 2.0:
                            yield f"data: {json.dumps({'status': 'info', 'message': f'[FFMPEG] Đang tải phim, tới khung hình: {current_time}'})}\n\n"
                            last_yield_time = now

                ffmpeg_process.wait()
                if ffmpeg_process.returncode != 0:
                    raise Exception("Lỗi khi tải stream HLS qua FFmpeg! (Hoặc có thể do chưa tải hết, vui lòng thử lại)")
                
                # Đánh dấu đã tải xong an toàn
                with open(audio_done_flag, "w") as f:
                    f.write("DONE")
            
            # Hiển thị dung lượng file audio
            audio_size_mb = os.path.getsize(temp_audio) / (1024 * 1024)
            yield f"data: {json.dumps({'status': 'info', 'message': f'[+] Âm thanh sẵn sàng ({audio_size_mb:.1f} MB). Đang khởi chạy engine bóc băng...'})}\n\n"
            # ═══ KHỞI TẠO ENGINE DỊCH THEO LỰA CHỌN ═══
            translator = GoogleTranslator(source='auto', target=target_lang)
            
            # Map ngôn ngữ đích sang tên đầy đủ cho prompt
            LANG_NAMES = {
                'vi': 'Vietnamese', 'en': 'English', 'zh': 'Chinese (Simplified)',
                'ko': 'Korean', 'ja': 'Japanese', 'th': 'Thai', 'id': 'Indonesian'
            }
            target_lang_name = LANG_NAMES.get(target_lang[:2], target_lang)
            
            # Biến trạng thái engine
            active_engine = "google"  # Mặc định fallback
            gemini_model = None
            groq_client = None
            
            # --- HÀM KHỞI TẠO TỪNG ENGINE CHUYÊN BIỆT ---
            def try_init_groq():
                nonlocal active_engine, groq_client
                if groq_key and GroqClient:
                    try:
                        groq_client = GroqClient(api_key=groq_key)
                        active_engine = "groq"
                        model_short = groq_model.split('/')[-1] if '/' in groq_model else groq_model
                        return f'[*] ⚡ Đang dùng mô hình: Groq → {model_short}'
                    except Exception as e:
                        return f'[!] Lỗi Groq API: {str(e)[:50]}...'
                return '[!] Thiếu Groq API Key hoặc SDK.'

            def try_init_gemini():
                nonlocal active_engine, gemini_model
                if gemini_key and genai:
                    try:
                        genai.configure(api_key=gemini_key)
                        gemini_model = genai.GenerativeModel('gemini-2.0-flash')
                        active_engine = "gemini"
                        return f'[*] ✨ Đang dùng mô hình: Gemini 2.0 Flash'
                    except Exception as e:
                        return f'[!] Lỗi Gemini API: {str(e)[:50]}...'
                return '[!] Thiếu Gemini API Key hoặc SDK.'

            # --- LOGIC ƯU TIÊN VÀ FALLBACK THÔNG MINH ---
            init_msg = ""
            fallback_logs = []
            
            if translate_engine == "groq":
                init_msg = try_init_groq()
                if active_engine != "groq":
                    fallback_logs.append(init_msg + " -> Tự động thử Gemini...")
                    init_msg = try_init_gemini()
            elif translate_engine == "gemini":
                init_msg = try_init_gemini()
                if active_engine != "gemini":
                    fallback_logs.append(init_msg + " -> Tự động thử Groq...")
                    init_msg = try_init_groq()
            
            # In ra các cản trở trước đó nếu có
            for log in fallback_logs:
                yield f"data: {json.dumps({'status': 'info', 'message': log})}\n\n"

            # Xác nhận kết quả cuối cùng
            if active_engine in ["groq", "gemini"]:
                ctx_msg = init_msg + (f' | Ngữ cảnh: "{movie_title}"' if movie_title else '')
                yield f"data: {json.dumps({'status': 'info', 'message': ctx_msg})}\n\n"
            else:
                active_engine = "google"
                yield f"data: {json.dumps({'status': 'info', 'message': '[!] Không tìm thấy API AI nào hợp lệ. Tự động chuyển qua Google Translate (Miễn phí).'})}\n\n"
                ctx_msg = f'[*] 🔤 Đang dùng mô hình: Google Translate | Ngữ cảnh: "{movie_title}"' if movie_title else '[*] 🔤 Đang dùng mô hình: Google Translate'
                yield f"data: {json.dumps({'status': 'info', 'message': ctx_msg})}\n\n"

            # (Whisper transcribe được dời xuống trong khối try)
            
            # ═══════════════════════════════════════════════════════════
            #  NETFLIX SUBTITLE PIPELINE — CÁC HẰNG SỐ CHUẨN CÔNG NGHIỆP
            # ═══════════════════════════════════════════════════════════
            NETFLIX_MIN_DURATION = 0.833    # Tối thiểu 5/6 giây hiển thị (chuẩn Netflix)
            NETFLIX_MAX_DURATION = 7.0      # Tối đa 7 giây (tránh phụ đề dính quá lâu)
            NETFLIX_MIN_GAP = 0.083         # Khoảng trống tối thiểu 2 frames (~83ms) giữa 2 subtitle
            NETFLIX_MAX_CPS = 17            # Tối đa 17 ký tự/giây (tốc độ đọc chuẩn)
            NETFLIX_MIN_CPS_DURATION = 1.0  # Thời gian đọc tối thiểu cho text ngắn
            
            vtt_lines = []
            vtt_lines.append("WEBVTT\n\n")
            
            # Lưu trữ subtitle thô trước post-processing (list of dict)
            raw_subtitles = []
            
            buffer = []
            last_heartbeat = time.time()
            segment_count = 0
            last_vtt_end_time = 0.0  # Theo dõi thời điểm kết thúc subtitle cuối cùng (cross-buffer)
            
            # ═══ HÀM TẠO PROMPT DỊCH CHUẨN NETFLIX ═══
            def _build_translate_prompt(texts):
                movie_context = f'from the movie/series "{movie_title}"' if movie_title else ''
                
                # Tạo array object có gắn ID để bắt ép model không được mix dòng
                input_json = [{"id": i, "text": txt} for i, txt in enumerate(texts)]
                
                return (
                    f"You are a Netflix-certified subtitle translator for {target_lang_name}. "
                    f"Translate these dialogue lines {movie_context} with broadcast-quality standards.\n\n"
                    f"CRITICAL — SCENE CONTEXT ANALYSIS:\n"
                    f"Before translating, READ ALL {len(texts)} lines below as a SINGLE SCENE. Understand:\n"
                    f"- WHO is speaking to WHOM in each line (infer from dialogue flow)\n"
                    f"- WHAT is happening in the scene (argument? romance? action? comedy?)\n"
                    f"- The TONE shift across lines (calm→angry, happy→sad, etc.)\n"
                    f"Then translate each line with FULL awareness of this context. Every line must feel like part of the SAME coherent conversation, not isolated sentences.\n\n"
                    f"NETFLIX SUBTITLE STANDARDS:\n"
                    f"1. COMPLETENESS & FORMATTING: Translate the FULL meaning without cutting any details. If the translated text is very long, use '\\n' to break it into MAXIMUM 2 readable lines so it displays fully on screen without overflowing.\n"
                    f"2. NATURAL SPOKEN LANGUAGE: Translate as how real people SPEAK in {target_lang_name}, not how they write. Use natural rhythm and colloquialisms.\n"
                    f"3. CONTEXT-AWARE PRONOUNS: Select pronouns based on speaker relationship detected from the dialogue flow. For Vietnamese: anh/em (lovers), mày/tao (enemies), con/ba-mẹ (family), tôi/anh-chị (formal). MAINTAIN CONSISTENCY across all lines.\n"
                    f"4. CULTURAL LOCALIZATION: Adapt idioms and references to feel native. Don't transliterate — localize. Keep character names as original.\n"
                    f"5. EMOTIONAL FIDELITY: Match emotion intensity. If line 3 is a shout and line 5 is a whisper, reflect that in word choice and punctuation.\n"
                    f"6. SENTENCE CONTINUATION: If a single spoken sentence is split across multiple adjacent lines (e.g. line 1 and 2), translate them so they form a cohesive, proper, grammatically correct full sentence when read together. Use commas or ellipses to link them smoothly if needed.\n"
                    f"7. EXACT LINE COUNT: Output exactly {len(texts)} translations. One input = one output. NEVER merge, split, or skip.\n"
                    f"8. OUTPUT: Raw JSON array only. No markdown, no explanation.\n"
                    f"Format: [{{\"id\": 0, \"translated\": \"...\"}}, {{\"id\": 1, \"translated\": \"...\"}}]\n\n"
                    f"SCENE DIALOGUE ({len(texts)} lines):\n{json.dumps(input_json, ensure_ascii=False)}"
                )
            
            # Hàm parse JSON response từ AI (dùng chung Gemini/Groq)
            def _parse_ai_json(res_text, expected_count):
                text = res_text.strip()
                # Xử lý nhiều kiểu markdown wrapper mà AI có thể trả về
                if text.startswith("```"): text = text.split("\n", 1)[-1].rsplit("\n", 1)[0].strip()
                if text.startswith("json"): text = text[4:].strip()
                # Tìm JSON array trong text (phòng AI viết lời giải thích trước/sau)
                bracket_start = text.find('[')
                bracket_end = text.rfind(']')
                if bracket_start != -1 and bracket_end != -1 and bracket_end > bracket_start:
                    text = text[bracket_start:bracket_end+1]
                
                try:
                    result = json.loads(text)
                    if isinstance(result, list):
                        # Phương án A: Ánh xạ theo ID chính xác
                        mapped = {}
                        for item in result:
                            if isinstance(item, dict) and "id" in item and "translated" in item:
                                mapped[int(item["id"])] = str(item["translated"])
                        
                        if len(mapped) == expected_count:
                            return [mapped[i] for i in range(expected_count)]
                        
                        # Phương án B: AI trả đúng số lượng nhưng ID bị lệch/nhảy cóc
                        # → Lấy theo thứ tự xuất hiện (fallback an toàn)
                        if len(result) == expected_count:
                            fallback = []
                            for item in result:
                                if isinstance(item, dict) and "translated" in item:
                                    fallback.append(str(item["translated"]))
                                elif isinstance(item, str):
                                    fallback.append(item)
                            if len(fallback) == expected_count:
                                print(f"  [PARSE] Dùng fallback theo thứ tự (ID bị lệch)")
                                return fallback
                except Exception as parse_err:
                    print(f"  [PARSE] Lỗi parse JSON: {str(parse_err)[:80]}")
                return None
            
            def process_buffer(buf):
                nonlocal last_heartbeat, last_vtt_end_time
                original_texts = [seg.text.strip() for seg in buf]
                translated_texts = []
                
                # Gửi heartbeat trước khi gọi API (tránh timeout)
                yield f"data: {json.dumps({'status': 'heartbeat'})}\n\n"
                last_heartbeat = time.time()
                
                ai_success = False
                
                # ── GEMINI ENGINE ──
                if active_engine == "gemini" and gemini_model:
                    prompt = _build_translate_prompt(original_texts)
                    for attempt in range(2):
                        try:
                            resp = gemini_model.generate_content(prompt)
                            parsed = _parse_ai_json(resp.text, len(original_texts))
                            if parsed:
                                translated_texts = parsed
                                ai_success = True
                                break
                            else:
                                print(f"Gemini trả sai số lượng (lần {attempt+1})")
                        except Exception as e:
                            print(f"Gemini lỗi (lần {attempt+1}): {e}")
                            if attempt == 0: time.sleep(0.5)  # Giảm delay retry từ 1s xuống 0.5s
                
                # ── GROQ ENGINE (Multi-Model + Multi-Key Fallback) ──
                elif active_engine == "groq" and groq_client:
                    prompt = _build_translate_prompt(original_texts)
                    
                    # Danh sách model xoay vòng khi hết token
                    groq_models_queue = [groq_model]
                    if 'llama-3.3-70b-versatile' in groq_model:
                        groq_models_queue.append('llama-3.1-8b-instant')
                    elif 'llama-3.1-8b-instant' in groq_model:
                        groq_models_queue.insert(0, 'llama-3.3-70b-versatile')
                    else:
                        groq_models_queue.append('llama-3.1-8b-instant')
                        groq_models_queue.append('llama-3.3-70b-versatile')
                    
                    # Danh sách API keys (key chính + dự phòng)
                    all_groq_keys = [groq_key] + [k.strip() for k in groq_backup_keys if k.strip()]
                    
                    groq_tried = False
                    for key_idx, current_key in enumerate(all_groq_keys):
                        if ai_success:
                            break
                        for model_idx, current_model in enumerate(groq_models_queue):
                            if ai_success:
                                break
                            for attempt in range(2):
                                try:
                                    # Tạo client với key hiện tại
                                    temp_client = GroqClient(api_key=current_key) if key_idx > 0 else groq_client
                                    resp = temp_client.chat.completions.create(
                                        model=current_model,
                                        messages=[{"role": "user", "content": prompt}],
                                        temperature=0.3,
                                        max_tokens=8192
                                    )
                                    parsed = _parse_ai_json(resp.choices[0].message.content, len(original_texts))
                                    if parsed:
                                        translated_texts = parsed
                                        ai_success = True
                                        break
                                    else:
                                        print(f"Groq [{current_model}] trả sai số lượng (lần {attempt+1})")
                                except Exception as e:
                                    err_str = str(e).lower()
                                    is_rate_limit = '429' in err_str or 'rate_limit' in err_str or 'rate limit' in err_str
                                    
                                    if is_rate_limit:
                                        model_short = current_model.split('/')[-1] if '/' in current_model else current_model
                                        key_label = f"Key #{key_idx+1}" if key_idx > 0 else "Key chính"
                                        print(f"  [RATE LIMIT] {key_label} - Model {model_short} hết token → Thử tiếp...")
                                        break  # Thoát khỏi vòng attempt, chuyển model/key tiếp
                                    else:
                                        print(f"Groq lỗi (lần {attempt+1}): {e}")
                                        if attempt == 0: time.sleep(0.5)
                    
                    # Nếu tất cả Groq key + model đều lỗi → thử Gemini
                    if not ai_success and gemini_model:
                        print(f"  [FALLBACK] Tất cả Groq keys/models hết token → Chuyển sang Gemini")
                        for attempt in range(2):
                            try:
                                resp = gemini_model.generate_content(prompt)
                                parsed = _parse_ai_json(resp.text, len(original_texts))
                                if parsed:
                                    translated_texts = parsed
                                    ai_success = True
                                    break
                            except Exception as e:
                                print(f"Gemini lỗi (lần {attempt+1}): {e}")
                                if attempt == 0: time.sleep(0.5)
                    elif not ai_success and gemini_key and genai and not gemini_model:
                        # Thử khởi tạo Gemini nếu chưa init
                        try:
                            genai.configure(api_key=gemini_key)
                            temp_gemini = genai.GenerativeModel('gemini-2.0-flash')
                            resp = temp_gemini.generate_content(prompt)
                            parsed = _parse_ai_json(resp.text, len(original_texts))
                            if parsed:
                                translated_texts = parsed
                                ai_success = True
                                print(f"  [FALLBACK] Gemini cứu thành công!")
                        except Exception as e:
                            print(f"  [FALLBACK] Gemini cũng lỗi: {e}")
                
                # ── FALLBACK: Google Translate (BATCH MODE — nhanh gấp 10x) ──
                if not ai_success:
                    if active_engine != "google":
                        print(f"  [FALLBACK] AI dịch thất bại → Chuyển sang Google Translate cho batch này")
                    translated_texts = []
                    try:
                        # Gộp tất cả text bằng separator đặc biệt, dịch 1 lần duy nhất
                        separator = " ||| "
                        merged = separator.join(original_texts)
                        result = translator.translate(merged)
                        translated_texts = result.split(separator)
                        # Nếu số lượng không khớp (separator bị dịch sai), fallback từng câu
                        if len(translated_texts) != len(original_texts):
                            translated_texts = []
                            raise ValueError("Batch split mismatch")
                    except:
                        # Fallback: dịch từng câu nếu batch thất bại
                        translated_texts = []
                        for idx, t in enumerate(original_texts):
                            try:
                                translated_texts.append(translator.translate(t))
                            except Exception as gt_err:
                                print(f"  [GT] Lỗi dịch câu {idx}: {str(gt_err)[:50]}")
                                translated_texts.append(t)
                
                # ═══ ÁP DỤNG NETFLIX TIMING RULES CHO TỪNG SUBTITLE ═══
                for i, seg in enumerate(buf):
                    ot = original_texts[i]
                    tt = translated_texts[i] if i < len(translated_texts) else ot
                    if not ot: continue
                    
                    # --- BƯỚC 1: Xác định start time ---
                    # Start = MAX(lúc người nói bắt đầu, kết thúc subtitle trước + min gap)
                    # → Đảm bảo KHÔNG BAO GIỜ overlap với subtitle trước (kể cả buffer trước)
                    ideal_start = seg.start
                    if last_vtt_end_time > 0 and ideal_start < last_vtt_end_time + NETFLIX_MIN_GAP:
                        ideal_start = last_vtt_end_time + NETFLIX_MIN_GAP
                    
                    # --- BƯỚC 2: Xác định end time ---
                    # End gốc từ Whisper
                    ideal_end = seg.end
                    
                    # Đảm bảo thời lượng tối thiểu (Netflix: 833ms)
                    if ideal_end - ideal_start < NETFLIX_MIN_DURATION:
                        ideal_end = ideal_start + NETFLIX_MIN_DURATION
                    
                    # Giới hạn thời lượng tối đa (Netflix: 7 giây)
                    if ideal_end - ideal_start > NETFLIX_MAX_DURATION:
                        ideal_end = ideal_start + NETFLIX_MAX_DURATION
                    
                    # Điều chỉnh CPS (tốc độ đọc) — đảm bảo kịp đọc
                    display_text = tt if tt else ot
                    text_len = len(display_text)
                    min_duration_for_cps = text_len / NETFLIX_MAX_CPS
                    if min_duration_for_cps > NETFLIX_MIN_CPS_DURATION:
                        ideal_end = max(ideal_end, ideal_start + min_duration_for_cps)
                    
                    # --- BƯỚC 3: Chống tràn sang câu kế tiếp ---
                    next_start = buf[i+1].start if (i+1 < len(buf)) else None
                    if next_start and ideal_end > next_start - NETFLIX_MIN_GAP:
                        ideal_end = next_start - NETFLIX_MIN_GAP
                    
                    # Nếu sau tất cả, duration < 0 thì bỏ qua (2 câu quá sát nhau)
                    if ideal_end <= ideal_start:
                        continue
                    
                    # Cập nhật mốc thời gian cuối cùng (cross-buffer tracking)
                    last_vtt_end_time = ideal_end
                    
                    # --- BƯỚC 4: Lưu subtitle thô (sẽ post-process sau) ---
                    raw_subtitles.append({
                        'start': ideal_start,
                        'end': ideal_end,
                        'original': ot,
                        'translated': tt,
                        'bilingual': bilingual and tt.lower() != ot.lower()
                    })
                    
                    # Stream progress cho UI
                    start_fmt = format_timestamp(ideal_start)
                    yield f"data: {json.dumps({'status': 'line', 'time': f'[{start_fmt[:-4]}]', 'original': ot, 'translated': tt})}\n\n"

            # --- BỘ LỌC PHÂN TẦNG CHỐNG ẢO GIÁC (5 CẤP ĐỘ ĐỘC LẬP) ---
            # Danh sách cụm ký tự rác Whisper hay hallucinate khi gặp nhạc/im lặng
            HALLUCINATION_PATTERNS = [
                '♪', '🎵', '🎶', '...', '…', '~', '♫',
                'thank you for watching', 'thanks for watching',
                'please subscribe', 'like and subscribe',
                '請訂閱', '谢谢观看', 'ご視聴ありがとう',
                'đăng ký kênh', 'cảm ơn đã xem'
            ]
            
            def _is_hallucination(segment):
                """Lọc phụ đề rác bằng 5 tầng kiểm tra độc lập"""
                if is_cloud:
                    return False  # Bỏ qua hoàn toàn bộ lọc rác nếu chạy trên Cloud (Giao trọn quyền cho AI)
                    
                text = segment.text.strip()
                
                # Bỏ segment rỗng
                if not text:
                    return True
                
                no_speech = getattr(segment, 'no_speech_prob', 0)
                logprob = getattr(segment, 'avg_logprob', 0)
                duration = segment.end - segment.start
                text_lower = text.lower().strip()
                
                # ═══ TẦNG 1 & 2: Xét xác suất âm thanh (Chỉ áp dụng Local Whisper) ═══
                # Groq Cloud (Online) đôi khi trả no_speech rất cao (0.8 - 0.9) dù có tiếng nói thật
                # Nên chúng ta bỏ qua kiểm tra xác suất này đối với Cloud, nhường cho AI dịch tự lo.
                if not is_cloud:
                    if no_speech > 0.7:
                        print(f"  [T1] Không giọng nói (no_speech={no_speech:.2f}): \"{text[:60]}\"")
                        return True
                    
                    if no_speech > 0.5 and logprob < -0.7 and duration < 1.5:
                        print(f"  [T2] Nhiễu nghi vấn (ns={no_speech:.2f}, lp={logprob:.2f}, {duration:.1f}s): \"{text[:60]}\"")
                        return True
                
                # ═══ TẦNG 3: Hallucination lặp vô tận ═══
                words = text_lower.split()
                if len(words) >= 4:
                    unique_ratio = len(set(words)) / len(words)
                    if unique_ratio < 0.4:
                        print(f"  [T3] Lặp từ (unique={unique_ratio:.0%}): \"{text[:60]}\"")
                        return True
                
                # ═══ TẦNG 4: Ký hiệu nhạc / cụm rác phổ biến ═══
                # (Whisper hay sinh ra ♪♪♪ hoặc "Thank you for watching" khi gặp nhạc)
                for pattern in HALLUCINATION_PATTERNS:
                    if pattern in text_lower:
                        print(f"  [T4] Cụm rác quen ({pattern}): \"{text[:60]}\"")
                        return True
                
                # ═══ TẦNG 5: Text chỉ toàn ký tự đặc biệt / dấu câu (không có chữ thật) ═══
                # VD: "...", "---", "~~~", "!!!"
                alpha_count = sum(1 for c in text if c.isalpha())
                if alpha_count < 2 and len(text) < 10:
                    print(f"  [T5] Không có chữ thật ({alpha_count} alpha): \"{text[:60]}\"")
                    return True
                
                return False
            
            # --- VÒNG LẶP XỬ LÝ CHÍNH CÓ TÍCH HỢP AUTO-FALLBACK CPU ---
            def run_transcribe_loop(segs):
                nonlocal buffer, vtt_lines, last_heartbeat, segment_count
                filtered_count = 0
                for segment in segs:
                    # Áp dụng bộ lọc chống ảo giác trước khi thêm vào buffer
                    if _is_hallucination(segment):
                        filtered_count += 1
                        continue
                    
                    buffer.append(segment)
                    segment_count += 1
                    
                    # Gửi heartbeat mỗi 15 giây để giữ kết nối sống
                    now = time.time()
                    if now - last_heartbeat > 15:
                        yield f"data: {json.dumps({'status': 'heartbeat'})}\n\n"
                        last_heartbeat = now
                    
                    # Tăng Buffer lên 25 câu để giảm số lần gọi API (-40% API calls so với 15)
                    if len(buffer) >= 25:
                        yield from process_buffer(buffer)
                        buffer.clear()
                
                if filtered_count > 0:
                    print(f"  [INFO] Đã lọc bỏ {filtered_count} segment ảo giác/nhiễu")
            
            # ═══════════════════════════════════════════════════════════
            #  NETFLIX POST-PROCESSING — XỬ LÝ SAU CÙNG TOÀN BỘ FILE VTT
            #  (Đảm bảo 0% overlap, 0% lỗi timing sau khi mọi thứ đã hoàn tất)
            # ═══════════════════════════════════════════════════════════
            def _netflix_post_process(subtitles):
                """Quét toàn bộ danh sách subtitle, sửa mọi lỗi timing theo chuẩn Netflix"""
                if not subtitles:
                    return subtitles
                
                # Đã bật lại Post-processing cho Cloud để chặn trùng lặp, chặn đè chữ (Overlap)
                # và giới hạn thời gian (Max Duration) chống việc phụ đề hiển thị quá dài không chịu biến mất.
                
                # Sắp xếp theo start time (phòng trường hợp bị xáo trộn)
                subtitles.sort(key=lambda s: s['start'])
                
                cleaned = []
                for i, sub in enumerate(subtitles):
                    start = sub['start']
                    end = sub['end']
                    
                    # RULE 1: Bỏ subtitle có duration < 200ms (không đọc được)
                    if end - start < 0.2:
                        print(f"  [POST] Bỏ subtitle quá ngắn ({(end-start)*1000:.0f}ms): \"{sub['translated'][:40]}\"")
                        continue
                    
                    # RULE 2: Bỏ subtitle trùng lặp nội dung với subtitle trước
                    # (Whisper đôi khi repeat cùng 1 câu cho 2 timestamp khác nhau)
                    if cleaned:
                        prev = cleaned[-1]
                        if sub['translated'].strip() == prev['translated'].strip():
                            # Câu y hệt → giữ câu dài hơn, bỏ câu ngắn hơn
                            if (end - start) > (prev['end'] - prev['start']):
                                cleaned.pop()  # Xóa cái cũ ngắn hơn, thêm cái mới
                            else:
                                print(f"  [POST] Bỏ subtitle trùng lặp: \"{sub['translated'][:40]}\"")
                                continue
                    
                    # RULE 3: Đảm bảo không overlap với subtitle trước
                    if cleaned:
                        prev = cleaned[-1]
                        if start < prev['end'] + NETFLIX_MIN_GAP:
                            # Cắt end của subtitle trước để nhường chỗ
                            prev['end'] = start - NETFLIX_MIN_GAP
                            if prev['end'] - prev['start'] < 0.2:
                                # Subtitle trước bị nén quá ngắn → xóa luôn
                                print(f"  [POST] Xóa subtitle bị nén quá ngắn sau chống overlap")
                                cleaned.pop()
                    
                    # RULE 4: Đảm bảo duration tối thiểu Netflix (833ms)
                    if end - start < NETFLIX_MIN_DURATION:
                        end = start + NETFLIX_MIN_DURATION
                        # Kiểm tra không tràn sang subtitle kế tiếp
                        next_sub = subtitles[i+1] if (i+1 < len(subtitles)) else None
                        if next_sub and end > next_sub['start'] - NETFLIX_MIN_GAP:
                            end = next_sub['start'] - NETFLIX_MIN_GAP
                    
                    # RULE 5: Giới hạn duration tối đa (7 giây)
                    if end - start > NETFLIX_MAX_DURATION:
                        end = start + NETFLIX_MAX_DURATION
                    
                    # RULE 6: Bỏ subtitle với translated text quá ngắn (< 2 ký tự chữ)
                    alpha_chars = sum(1 for c in sub['translated'] if c.isalpha())
                    if alpha_chars < 2:
                        print(f"  [POST] Bỏ subtitle không có nội dung: \"{sub['translated'][:40]}\"")
                        continue
                    
                    # Nếu sau tất cả, thời lượng vẫn < 0 thì bỏ
                    if end <= start:
                        continue
                    
                    sub['start'] = start
                    sub['end'] = end
                    cleaned.append(sub)
                
                # PASS 2: Quét lại toàn bộ lần cuối để đảm bảo 0% overlap
                for i in range(1, len(cleaned)):
                    if cleaned[i]['start'] < cleaned[i-1]['end'] + NETFLIX_MIN_GAP:
                        cleaned[i-1]['end'] = cleaned[i]['start'] - NETFLIX_MIN_GAP
                
                return cleaned
            
            try:
                if is_cloud:
                    # ═══════════════════════════════════════════════════════
                    #  GROQ CLOUD AUDIO TRANSCRIPTION (Siêu tốc Online)
                    #  Gửi file MP3 lên Groq API, nhận về segments có timestamp
                    # ═══════════════════════════════════════════════════════
                    yield f"data: {json.dumps({'status': 'info', 'message': '☁️ [GROQ CLOUD] Đang gửi âm thanh lên siêu máy chủ Groq...'})}\n\n"
                    
                    GROQ_MAX_FILE_SIZE = 24 * 1024 * 1024  # 24MB (dưới limit 25MB để an toàn)
                    file_size = os.path.getsize(temp_audio)
                    
                    # Hàm gọi API Groq Audio cho 1 file
                    def _groq_transcribe_file(audio_path, time_offset=0.0):
                        """Gọi Groq Audio Transcriptions API, trả về danh sách segment giả."""
                        import requests as http_req
                        url = "https://api.groq.com/openai/v1/audio/transcriptions"
                        headers = {"Authorization": f"Bearer {groq_key}"}
                        
                        with open(audio_path, "rb") as f:
                            files = {"file": (os.path.basename(audio_path), f, "audio/mpeg")}
                            form_data = {
                                "model": "whisper-large-v3",
                                "response_format": "verbose_json",
                                "timestamp_granularities[]": "segment"
                            }
                            resp = http_req.post(url, headers=headers, files=files, data=form_data, timeout=300)
                        
                        if resp.status_code != 200:
                            raise Exception(f"Groq Audio API lỗi {resp.status_code}: {resp.text[:200]}")
                        
                        result = resp.json()
                        segments = []
                        
                        # Map kết quả Groq thành đối tượng giống faster-whisper segment
                        for seg in result.get("segments", []):
                            class GroqSegment:
                                pass
                            s = GroqSegment()
                            s.start = seg.get("start", 0) + time_offset
                            s.end = seg.get("end", 0) + time_offset
                            s.text = seg.get("text", "").strip()
                            s.no_speech_prob = seg.get("no_speech_prob", 0)
                            s.avg_logprob = seg.get("avg_logprob", 0)
                            if s.text:
                                segments.append(s)
                        
                        return segments
                    
                    # Nếu file nhỏ hơn 24MB → gửi trực tiếp 1 lần
                    if file_size <= GROQ_MAX_FILE_SIZE:
                        yield f"data: {json.dumps({'status': 'info', 'message': f'☁️ [GROQ] File {file_size/(1024*1024):.1f}MB — Gửi trực tiếp 1 lần...'})}\n\n"
                        cloud_segments = _groq_transcribe_file(temp_audio)
                        yield f"data: {json.dumps({'status': 'info', 'message': f'☁️ [GROQ] Nhận được {len(cloud_segments)} đoạn thoại từ Cloud!'})}\n\n"
                        yield from run_transcribe_loop(cloud_segments)
                    else:
                        # File > 24MB → Chia nhỏ thành nhiều phần bằng FFmpeg
                        yield f"data: {json.dumps({'status': 'info', 'message': f'☁️ [GROQ] File {file_size/(1024*1024):.1f}MB > 24MB — Tự động chia nhỏ để gửi lần lượt...'})}\n\n"
                        
                        # Tính số phần cần chia (mỗi phần ~20MB để an toàn)
                        num_parts = (file_size // (20 * 1024 * 1024)) + 1
                        
                        # Lấy tổng thời lượng audio bằng FFmpeg
                        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
                        probe_cmd = [ffmpeg_path, "-i", temp_audio, "-hide_banner"]
                        probe_proc = subprocess.run(probe_cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
                        duration_match = re.search(r"Duration: (\d{2}):(\d{2}):(\d{2})\.\d+", probe_proc.stderr)
                        total_duration = 0
                        if duration_match:
                            h, m, s = int(duration_match.group(1)), int(duration_match.group(2)), int(duration_match.group(3))
                            total_duration = h * 3600 + m * 60 + s
                        
                        if total_duration == 0:
                            raise Exception("Không xác định được thời lượng audio để chia file.")
                        
                        part_duration = total_duration // num_parts + 10  # + 10s dư để chồng lấn nhẹ
                        
                        all_cloud_segments = []
                        for part_idx in range(num_parts):
                            start_sec = part_idx * (total_duration // num_parts)
                            part_file = os.path.join(sys_temp_dir, f"chunk_{part_idx}.mp3")
                            
                            # Cắt phần bằng FFmpeg
                            split_cmd = [
                                ffmpeg_path, "-i", temp_audio,
                                "-ss", str(start_sec), "-t", str(part_duration),
                                "-acodec", "copy", part_file, "-y"
                            ]
                            subprocess.run(split_cmd, capture_output=True)
                            
                            yield f"data: {json.dumps({'status': 'info', 'message': f'☁️ [GROQ] Đang xử lý phần {part_idx+1}/{num_parts} (từ {start_sec}s)...'})}\n\n"
                            
                            try:
                                part_segments = _groq_transcribe_file(part_file, time_offset=start_sec)
                                all_cloud_segments.extend(part_segments)
                                yield f"data: {json.dumps({'status': 'info', 'message': f'☁️ [GROQ] Phần {part_idx+1}: Nhận {len(part_segments)} đoạn thoại'})}\n\n"
                            finally:
                                if os.path.exists(part_file): os.remove(part_file)
                        
                        # Sắp xếp theo thời gian và loại bỏ segment trùng lặp từ vùng chồng lấn
                        all_cloud_segments.sort(key=lambda s: s.start)
                        deduped = []
                        for seg in all_cloud_segments:
                            if deduped and abs(seg.start - deduped[-1].start) < 0.5 and seg.text.strip() == deduped[-1].text.strip():
                                continue  # Bỏ segment trùng do vùng chồng lấn
                            deduped.append(seg)
                        
                        yield f"data: {json.dumps({'status': 'info', 'message': f'☁️ [GROQ] Tổng cộng: {len(deduped)} đoạn thoại từ {num_parts} phần!'})}\n\n"
                        yield from run_transcribe_loop(deduped)
                
                else:
                    # ═══════════════════════════════════════════════════════
                    #  LOCAL WHISPER ENGINE (Chạy GPU/CPU trên máy cá nhân)
                    # ═══════════════════════════════════════════════════════
                    yield f"data: {json.dumps({'status': 'info', 'message': '🖥️ [LOCAL] Đang chạy Whisper trên máy cá nhân...'})}\n\n"
                    
                    # ═══ WHISPER CẤU HÌNH MAX SETTINGS CHUẨN ĐIỆN ẢNH ═══
                    segments, info = model.transcribe(
                        temp_audio, 
                        task="transcribe", 
                        beam_size=7,
                        best_of=7,
                        word_timestamps=True,
                        no_speech_threshold=0.6,
                        log_prob_threshold=-1.2,
                        initial_prompt="This is a professional movie dialogue. Every whisper, sigh, and shout matters. Transcribe everything faithfully.",
                        vad_filter=True,
                        vad_parameters=dict(
                            min_silence_duration_ms=300,
                            speech_pad_ms=400,
                            threshold=0.25,
                            min_speech_duration_ms=50
                        ),
                        condition_on_previous_text=False
                    )
                    yield from run_transcribe_loop(segments)
                
            except Exception as ai_err:
                err_str = str(ai_err).lower()
                if is_cloud and ("401" in err_str or "api" in err_str or "groq" in err_str):
                    # Groq Cloud lỗi → Tự động fallback sang Local Whisper
                    yield f"data: {json.dumps({'status': 'info', 'message': f'[!] Groq Cloud lỗi: {str(ai_err)[:100]}. Tự động chuyển sang Local Whisper...'})}\n\n"
                    try:
                        # Cần file WAV cho Whisper local → convert lại nếu đang là MP3
                        local_audio = temp_audio
                        if temp_audio.endswith('.mp3'):
                            local_audio = temp_audio.replace('.mp3', '_local.wav')
                            ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
                            subprocess.run([ffmpeg_path, "-i", temp_audio, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", local_audio, "-y"], capture_output=True)
                        
                        segments, info = model.transcribe(local_audio, task="transcribe", beam_size=5, word_timestamps=True,
                            vad_filter=True, vad_parameters=dict(threshold=0.35, speech_pad_ms=350, min_speech_duration_ms=100),
                            condition_on_previous_text=False)
                        yield from run_transcribe_loop(segments)
                        
                        # Cleanup file WAV tạm
                        if local_audio != temp_audio and os.path.exists(local_audio):
                            os.remove(local_audio)
                    except Exception as local_err:
                        raise local_err
                elif "cublas" in err_str or "cuda" in err_str or "cudnn" in err_str:
                    yield f"data: {json.dumps({'status': 'info', 'message': '[!] Đang thiếu MÔI TRƯỜNG CUDA/CuDNN. Tự động chuyển qua Mô hình Base siêu nhẹ trên CPU để chống treo máy...'})}\n\n"
                    model = WhisperModel("base", device="cpu", compute_type="int8", download_root=AI_MODELS_DIR)
                    segments, info = model.transcribe(temp_audio, task="transcribe", beam_size=1)
                    buffer.clear()
                    raw_subtitles.clear()
                    yield from run_transcribe_loop(segments)
                else:
                    raise ai_err
            
            if buffer:
                yield from process_buffer(buffer)
                buffer.clear()

            # ═══ BƯỚC CUỐI: NETFLIX POST-PROCESSING ═══
            yield f"data: {json.dumps({'status': 'info', 'message': f'[*] Đã nhận {len(raw_subtitles)} subtitle thô. Đang chạy Netflix Post-Processing...'})}\n\n"
            
            # Quét và sửa toàn bộ file VTT
            cleaned_subtitles = _netflix_post_process(raw_subtitles)
            
            # Tạo VTT sạch từ dữ liệu đã post-process
            vtt_lines = ["WEBVTT\n\n"]
            for sub in cleaned_subtitles:
                start_fmt = format_timestamp(sub['start'])
                end_fmt = format_timestamp(sub['end'])
                if sub['bilingual']:
                    final_text = f"{sub['original']}\n{sub['translated']}"
                else:
                    final_text = sub['translated']
                vtt_lines.append(f"{start_fmt} --> {end_fmt}\n{final_text}\n\n")
            
            removed_count = len(raw_subtitles) - len(cleaned_subtitles)
            yield f"data: {json.dumps({'status': 'info', 'message': f'[✓] Post-Processing xong! {len(cleaned_subtitles)} subtitle sạch (đã loại {removed_count} lỗi). Đang upload...'})}\n\n"

            # Ghi file & Trả lại nội dung VTT cho Client để Client tự Upload (tránh lỗi hết hạn Session sau 1h chờ)
            vtt_content = "".join(vtt_lines)
            with open(output_vtt, "w", encoding="utf-8") as vtt:
                vtt.write(vtt_content)
                
            upload_filename = f"{uuid.uuid4()}_{os.path.basename(output_vtt)}"
            
            # Lưu cột tiếng tương ứng đảm bảo chuẩn (VD: zh-CN -> subtitle_zh_url)
            lang_code = target_lang[:2].lower() # en, zh, ko, ja, vi
            db_column = f"subtitle_{lang_code}_url"
            
            # Chỉ cho phép lưu vào 5 cột ngôn ngữ chuẩn
            valid_columns = ["subtitle_en_url", "subtitle_zh_url", "subtitle_ja_url", "subtitle_ko_url", "subtitle_vi_url"]
            if db_column not in valid_columns:
                db_column = "subtitle_vi_url"  # Mặc định ép về tiếng Việt nếu có biến thể lạ

            # Yêu cầu Client tự dùng Session của chính nó để Upload (an toàn, không tự hủy token)
            yield f"data: {json.dumps({'status': 'upload_ready', 'vtt_content': vtt_content, 'filename': upload_filename, 'db_column': db_column})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
        finally:
            if ffmpeg_process:
                try:
                    ffmpeg_process.terminate()
                except: pass
                
            try:
                # Xóa cả audio cache VÀ flag done (tránh dùng cache cũ cho lần sau)
                if os.path.exists(temp_audio): os.remove(temp_audio)
                if os.path.exists(audio_done_flag): os.remove(audio_done_flag)
            except Exception: pass
            
            try:
                if os.path.exists(output_vtt): 
                    # Sao lưu trước khi xóa
                    safe_ep_name = "".join(x for x in str(episode_name) if x.isalnum() or x in " _-")
                    backup_file = os.path.join(sys_backup_dir, f"{movie_id}_{safe_ep_name}_{target_lang[:2]}.vtt")
                    shutil.copy2(output_vtt, backup_file)
                    os.remove(output_vtt)
            except Exception: pass

    headers = {
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive'
    }
    return Response(generate(), mimetype='text/event-stream', headers=headers)

if __name__ == '__main__':
    print("🚀 AI Subtitle Server đang chạy ở http://localhost:5000")
    app.run(port=5000, debug=False, threaded=True)
