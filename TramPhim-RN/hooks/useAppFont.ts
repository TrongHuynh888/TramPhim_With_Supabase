/**
 * =============================================
 *  HOOK LẤY FONT FAMILY HIỆN TẠI
 *  Dùng để áp dụng font chữ cho toàn bộ Text trong app
 * =============================================
 */
import { useMemo } from 'react';
import { useThemeStore } from '../stores/useThemeStore';
import { getFontName, FontWeight } from '../theme/fonts';

/**
 * Hook trả về object chứa fontFamily theo weight hiện tại
 * Sử dụng: const { fontRegular, fontMedium, fontSemiBold, fontBold } = useAppFont();
 * Rồi truyền vào style: { fontFamily: fontBold }
 */
export function useAppFont() {
  const fontFamily = useThemeStore(s => s.fontFamily);

  return useMemo(() => ({
    // Tên font thật (registered name) cho từng weight
    fontRegular: getFontName(fontFamily, 'Regular'),
    fontMedium: getFontName(fontFamily, 'Medium'),
    fontSemiBold: getFontName(fontFamily, 'SemiBold'),
    fontBold: getFontName(fontFamily, 'Bold'),
    // Hàm tiện ích lấy font theo weight bất kỳ
    getFont: (weight: FontWeight = 'Regular') => getFontName(fontFamily, weight),
  }), [fontFamily]);
}
