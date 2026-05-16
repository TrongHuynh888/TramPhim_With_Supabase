/**
 * =============================================
 *  FONTPROVIDER — Áp dụng font chữ toàn bộ app
 *  Override Text.defaultProps để mọi <Text> trong app
 *  tự động sử dụng fontFamily mà user đã chọn
 * =============================================
 */
import React, { useEffect } from 'react';
import { Text, TextInput } from 'react-native';
import { useThemeStore } from '../stores/useThemeStore';
import { getFontName } from '../theme/fonts';

/**
 * Component wrapper bọc quanh app, override Text.defaultProps
 * để áp dụng fontFamily cho toàn bộ chữ trong ứng dụng
 */
export function FontProvider({ children }: { children: React.ReactNode }) {
  const fontFamily = useThemeStore(s => s.fontFamily);

  useEffect(() => {
    // Override fontFamily mặc định cho mọi <Text> và <TextInput>
    const regularFont = getFontName(fontFamily, 'Regular');

    // Lưu defaultProps gốc nếu chưa có
    if (!(Text as any)._originalDefaultProps) {
      (Text as any)._originalDefaultProps = { ...(Text as any).defaultProps };
    }
    if (!(TextInput as any)._originalDefaultProps) {
      (TextInput as any)._originalDefaultProps = { ...(TextInput as any).defaultProps };
    }

    // Ghi đè fontFamily cho Text
    (Text as any).defaultProps = {
      ...(Text as any)._originalDefaultProps,
      style: { fontFamily: regularFont },
      allowFontScaling: false,
    };

    // Ghi đè fontFamily cho TextInput
    (TextInput as any).defaultProps = {
      ...(TextInput as any)._originalDefaultProps,
      style: { fontFamily: regularFont },
      allowFontScaling: false,
    };
  }, [fontFamily]);

  return <>{children}</>;
}
