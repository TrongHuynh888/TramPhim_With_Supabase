/**
 * =============================================
 *  CẤU HÌNH FONT CHỮ TOÀN ỨNG DỤNG
 *  Tương tự cách web JS sử dụng Google Fonts
 *  (Inter, Roboto, Outfit, Montserrat, Nunito,
 *   Poppins, Be Vietnam Pro, Quicksand)
 * =============================================
 */

// === Import font assets từ @expo-google-fonts ===
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_600SemiBold,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';

import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';

import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from '@expo-google-fonts/montserrat';

import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from '@expo-google-fonts/nunito';

import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
} from '@expo-google-fonts/be-vietnam-pro';

import {
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';

// === Bản đồ tên font (map fontFamily key -> tên font thật trong hệ thống) ===
// Mỗi font family có 4 weight: Regular, Medium, SemiBold, Bold
export type FontWeight = 'Regular' | 'Medium' | 'SemiBold' | 'Bold';

export type FontFamilyKey =
  | 'Inter'
  | 'Roboto'
  | 'Outfit'
  | 'Montserrat'
  | 'Nunito'
  | 'Poppins'
  | 'BeVietnamPro'
  | 'Quicksand';

// Danh sách font hiển thị cho user chọn (giống dropdown trên web)
export const FONT_PRESETS: { id: FontFamilyKey; label: string }[] = [
  { id: 'Inter', label: 'Inter (Mặc định)' },
  { id: 'Roboto', label: 'Roboto' },
  { id: 'Outfit', label: 'Outfit' },
  { id: 'Montserrat', label: 'Montserrat' },
  { id: 'Nunito', label: 'Nunito' },
  { id: 'Poppins', label: 'Poppins' },
  { id: 'BeVietnamPro', label: 'Be Vietnam Pro' },
  { id: 'Quicksand', label: 'Quicksand' },
];

// Map font key -> tên font đã đăng ký trong hệ thống (useFonts)
// Dùng để resolve fontFamily style cho Text component
const FONT_MAP: Record<FontFamilyKey, Record<FontWeight, string>> = {
  Inter: {
    Regular: 'Inter_400Regular',
    Medium: 'Inter_500Medium',
    SemiBold: 'Inter_600SemiBold',
    Bold: 'Inter_700Bold',
  },
  Roboto: {
    Regular: 'Roboto_400Regular',
    Medium: 'Roboto_500Medium',
    SemiBold: 'Roboto_600SemiBold',
    Bold: 'Roboto_700Bold',
  },
  Outfit: {
    Regular: 'Outfit_400Regular',
    Medium: 'Outfit_500Medium',
    SemiBold: 'Outfit_600SemiBold',
    Bold: 'Outfit_700Bold',
  },
  Montserrat: {
    Regular: 'Montserrat_400Regular',
    Medium: 'Montserrat_500Medium',
    SemiBold: 'Montserrat_600SemiBold',
    Bold: 'Montserrat_700Bold',
  },
  Nunito: {
    Regular: 'Nunito_400Regular',
    Medium: 'Nunito_500Medium',
    SemiBold: 'Nunito_600SemiBold',
    Bold: 'Nunito_700Bold',
  },
  Poppins: {
    Regular: 'Poppins_400Regular',
    Medium: 'Poppins_500Medium',
    SemiBold: 'Poppins_600SemiBold',
    Bold: 'Poppins_700Bold',
  },
  BeVietnamPro: {
    Regular: 'BeVietnamPro_400Regular',
    Medium: 'BeVietnamPro_500Medium',
    SemiBold: 'BeVietnamPro_600SemiBold',
    Bold: 'BeVietnamPro_700Bold',
  },
  Quicksand: {
    Regular: 'Quicksand_400Regular',
    Medium: 'Quicksand_500Medium',
    SemiBold: 'Quicksand_600SemiBold',
    Bold: 'Quicksand_700Bold',
  },
};

/**
 * Lấy tên font thật dựa trên fontFamily key và weight
 * Ví dụ: getFontName('Inter', 'Bold') => 'Inter_700Bold'
 */
export function getFontName(family: string, weight: FontWeight = 'Regular'): string {
  const fontKey = family as FontFamilyKey;
  if (FONT_MAP[fontKey]) {
    return FONT_MAP[fontKey][weight] || FONT_MAP[fontKey].Regular;
  }
  // Fallback về Inter nếu font không hợp lệ
  return FONT_MAP.Inter[weight] || FONT_MAP.Inter.Regular;
}

/**
 * Object chứa tất cả font assets cần load trong useFonts()
 * Gọi hàm này trong _layout.tsx
 */
export const ALL_GOOGLE_FONTS = {
  // Inter
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  // Roboto
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_600SemiBold,
  Roboto_700Bold,
  // Outfit
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  // Montserrat
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  // Nunito
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  // Poppins
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  // Be Vietnam Pro
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  // Quicksand
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
};
