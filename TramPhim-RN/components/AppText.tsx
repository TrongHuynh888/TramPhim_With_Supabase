import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useAppFont } from '../hooks/useAppFont';

interface AppTextProps extends TextProps {
  weight?: 'Regular' | 'Medium' | 'SemiBold' | 'Bold';
}

/**
 * AppText là component thay thế cho Text mặc định của React Native.
 * Tự động chọn đúng file font (fontFamily) dựa trên prop `weight`
 * và font hiện tại người dùng chọn trong Cài đặt.
 */
export function AppText(props: AppTextProps) {
  const { style, weight = 'Regular', ...rest } = props;
  const { getFont } = useAppFont();

  // Kiểm tra xem trong style có truyền fontWeight không để fallback weight
  let resolvedWeight = weight;
  
  if (style) {
    const flatStyle = StyleSheet.flatten(style);
    if (flatStyle.fontWeight) {
      if (flatStyle.fontWeight === 'bold' || flatStyle.fontWeight === '700' || flatStyle.fontWeight === '800' || flatStyle.fontWeight === '900') resolvedWeight = 'Bold';
      else if (flatStyle.fontWeight === '600') resolvedWeight = 'SemiBold';
      else if (flatStyle.fontWeight === '500') resolvedWeight = 'Medium';
    }
    // Nếu có hardcode fontFamily cũ của Montserrat, dịch nó sang weight
    if (flatStyle.fontFamily) {
      if (flatStyle.fontFamily.includes('Bold')) resolvedWeight = 'Bold';
      else if (flatStyle.fontFamily.includes('SemiBold')) resolvedWeight = 'SemiBold';
      else if (flatStyle.fontFamily.includes('Medium')) resolvedWeight = 'Medium';
    }
  }

  const dynamicFontFamily = getFont(resolvedWeight);

  return (
    <Text 
      {...rest} 
      style={[
        style, 
        { fontFamily: dynamicFontFamily },
        // Loại bỏ fontWeight gốc để tránh xung đột với custom font trên Android
        { fontWeight: undefined } 
      ]} 
      allowFontScaling={false}
    />
  );
}
