/**
 * ============================================
 * SUPABASE CONFIGURATION
 * ============================================
 */

// 👇 THAY BẰNG THÔNG TIN CỦA BẠN TRÊN SUPABASE DASHBOARD 👇
const SUPABASE_URL = "https://woctovnxocyfivzzrrem.supabase.co"; // Link từ screenshot của bạn
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvY3Rvdm54b2N5Zml2enpycmVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODMwNjUsImV4cCI6MjA4ODU1OTA2NX0.kLqVgqytNyaXyXXgHixEmC0_8X5f8BxBqpICKeX_sxA"; // Lấy ở Settings -> API

// Khởi tạo Supabase Client
// Sử dụng window.supabase để gán lại từ thư viện sang instance client
const { createClient } = supabase;
window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("✅ Supabase Config Loaded & Initialized");
