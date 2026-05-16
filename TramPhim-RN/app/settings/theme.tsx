import React, { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { useThemeStore, PRESET_COLORS } from "../../stores/useThemeStore";
import { FONT_PRESETS, getFontName } from "../../theme/fonts";

// Danh sách hiệu ứng có thể bật/tắt
const EFFECT_ITEMS = [
  { id: 'snow' as const, title: 'Tuyết rơi ❄️', icon: 'snow-outline' as const, emoji: '❄️', desc: 'Tuyết rơi nhẹ nhàng, phù hợp mùa đông.' },
  { id: 'stars' as const, title: 'Sao rơi ⭐', icon: 'star-outline' as const, emoji: '⭐', desc: 'Sao lấp lánh bay qua, sang trọng và huyền bí.' },
  { id: 'firework' as const, title: 'Pháo hoa 🎆', icon: 'flame-outline' as const, emoji: '🎆', desc: 'Rực rỡ cho dịp lễ hoặc ra mắt phim hot.' },
  { id: 'bubbles' as const, title: 'Bong bóng 🫧', icon: 'water-outline' as const, emoji: '🫧', desc: 'Bong bóng bay lên nhẹ nhàng, thư giãn.' },
  { id: 'hearts' as const, title: 'Trái tim ❤️', icon: 'heart-outline' as const, emoji: '❤️', desc: 'Trái tim bay lên lãng mạn, Valentine.' },
  { id: 'leaves' as const, title: 'Lá rơi 🍂', icon: 'leaf-outline' as const, emoji: '🍂', desc: 'Lá vàng rơi nhẹ theo gió mùa thu.' },
  { id: 'rain' as const, title: 'Mưa rơi 🌧️', icon: 'rainy-outline' as const, emoji: '🌧️', desc: 'Giọt mưa xiên, bầu không khí u ám.' },
  { id: 'confetti' as const, title: 'Confetti 🎉', icon: 'gift-outline' as const, emoji: '🎉', desc: 'Confetti nhiều màu bay tung lễ hội.' },
];

export default function ThemeSettingsScreen() {
  const router = useRouter();
  const {
    themeMode,
    themeColors,
    primaryColor,
    fontSizeMultiplier,
    fontFamily,
    enableEffects,
    userEffects,
    setThemeMode,
    setPrimaryColor,
    setFontSizeMultiplier,
    setFontFamily,
    setEnableEffects,
    setUserEffects,
    resetTheme,
  } = useThemeStore();

  const getFontSize = (baseSize: number) => baseSize * fontSizeMultiplier;
  const [isFontModalVisible, setFontModalVisible] = useState(false);

  // Tìm label hiển thị của font đang chọn
  const currentFontLabel = FONT_PRESETS.find(f => f.id === fontFamily)?.label || fontFamily;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      <View style={[styles.header, { backgroundColor: themeColors.bgSecondary, borderBottomColor: themeColors.bgTertiary }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={24} color={themeColors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: getFontSize(18), color: themeColors.textPrimary }]}>
          Cài đặt giao diện
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: getFontSize(15), color: primaryColor }]}>
            Chế độ nền
          </Text>
          <Text style={[styles.sectionDesc, { fontSize: getFontSize(13), color: themeColors.textSecondary }]}>
            Chọn nền sáng hoặc nền tối cho ứng dụng.
          </Text>
          
          <View style={styles.fontSizesRow}>
            <TouchableOpacity
              style={[
                styles.fontSizeBtn,
                { borderColor: themeColors.bgTertiary },
                themeMode === 'light' && { borderColor: primaryColor, backgroundColor: `${primaryColor}1A` }
              ]}
              onPress={() => setThemeMode('light')}
              activeOpacity={0.8}
            >
              <Ionicons name="sunny" size={20} color={themeMode === 'light' ? primaryColor : themeColors.textMuted} style={{ marginBottom: 4 }} />
              <Text style={[styles.fontSizeBtnText, { fontSize: 14, color: themeColors.textSecondary }, themeMode === 'light' && { color: primaryColor }]}>
                Nền Sáng
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.fontSizeBtn,
                { borderColor: themeColors.bgTertiary },
                themeMode === 'dark' && { borderColor: primaryColor, backgroundColor: `${primaryColor}1A` }
              ]}
              onPress={() => setThemeMode('dark')}
              activeOpacity={0.8}
            >
              <Ionicons name="moon" size={20} color={themeMode === 'dark' ? primaryColor : themeColors.textMuted} style={{ marginBottom: 4 }} />
              <Text style={[styles.fontSizeBtnText, { fontSize: 14, color: themeColors.textSecondary }, themeMode === 'dark' && { color: primaryColor }]}>
                Nền Tối
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: themeColors.bgTertiary }]} />

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: getFontSize(15), color: primaryColor }]}>
            Màu chủ đạo
          </Text>
          <Text style={[styles.sectionDesc, { fontSize: getFontSize(13), color: themeColors.textSecondary }]}>
            Chọn màu sắc hiển thị chính cho ứng dụng.
          </Text>
          
          <View style={styles.colorsRow}>
            {PRESET_COLORS.map((preset) => {
              const isSelected = preset.color.toLowerCase() === primaryColor.toLowerCase();
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: preset.color },
                    isSelected && styles.colorCircleSelected,
                    isSelected && { borderColor: "#fff" }
                  ]}
                  onPress={() => setPrimaryColor(preset.color)}
                  activeOpacity={0.8}
                >
                  {isSelected && <Ionicons name="checkmark" size={20} color={themeMode === 'light' ? "#fff" : "#fff"} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: themeColors.bgTertiary }]} />

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: getFontSize(15), color: primaryColor }]}>
            Kích thước chữ
          </Text>
          <Text style={[styles.sectionDesc, { fontSize: getFontSize(13), color: themeColors.textSecondary }]}>
            Điều chỉnh độ lớn của văn bản toàn hệ thống.
          </Text>
          
          <View style={styles.fontSizesRow}>
            <TouchableOpacity
              style={[
                styles.fontSizeBtn,
                { borderColor: themeColors.bgTertiary },
                fontSizeMultiplier === 0.85 && { borderColor: primaryColor, backgroundColor: `${primaryColor}1A` }
              ]}
              onPress={() => setFontSizeMultiplier(0.85)}
              activeOpacity={0.8}
            >
              <Text style={[styles.fontSizeBtnText, { fontSize: 13, color: themeColors.textSecondary }, fontSizeMultiplier === 0.85 && { color: primaryColor }]}>
                Nhỏ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.fontSizeBtn,
                { borderColor: themeColors.bgTertiary },
                fontSizeMultiplier === 1 && { borderColor: primaryColor, backgroundColor: `${primaryColor}1A` }
              ]}
              onPress={() => setFontSizeMultiplier(1)}
              activeOpacity={0.8}
            >
              <Text style={[styles.fontSizeBtnText, { fontSize: 15, color: themeColors.textSecondary }, fontSizeMultiplier === 1 && { color: primaryColor }]}>
                Vừa
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.fontSizeBtn,
                { borderColor: themeColors.bgTertiary },
                fontSizeMultiplier === 1.15 && { borderColor: primaryColor, backgroundColor: `${primaryColor}1A` }
              ]}
              onPress={() => setFontSizeMultiplier(1.15)}
              activeOpacity={0.8}
            >
              <Text style={[styles.fontSizeBtnText, { fontSize: 17, color: themeColors.textSecondary }, fontSizeMultiplier === 1.15 && { color: primaryColor }]}>
                Lớn
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: themeColors.bgTertiary }]} />

        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Ionicons name="text-outline" size={18} color={primaryColor} style={{ marginRight: 6 }} />
            <Text style={[styles.sectionTitle, { fontSize: getFontSize(15), color: primaryColor, marginBottom: 0 }]}>
              Font chữ
            </Text>
          </View>
          <Text style={[styles.sectionDesc, { fontSize: getFontSize(13), color: themeColors.textSecondary }]}>
            Chọn font chữ áp dụng cho toàn bộ ứng dụng. Font sẽ được tải từ Google Fonts.
          </Text>
          
          {/* Dropdown chọn font (giống web) */}
          <Pressable
            style={[
              styles.fontDropdown,
              { 
                borderColor: primaryColor,
                backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
              }
            ]}
            onPress={() => setFontModalVisible(true)}
          >
            <Text style={[
              styles.fontDropdownText,
              { color: themeColors.textPrimary, fontFamily: getFontName(fontFamily, 'Medium') }
            ]}>
              {currentFontLabel}
            </Text>
            <Ionicons name="chevron-down" size={18} color={themeColors.textMuted} />
          </Pressable>

          {/* Preview font đang chọn */}
          <View style={[
            styles.fontPreview,
            { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }
          ]}>
            <Text style={[
              styles.fontPreviewLabel,
              { color: themeColors.textMuted, fontSize: getFontSize(11) }
            ]}>
              Xem trước
            </Text>
            <Text style={[
              styles.fontPreviewText,
              { 
                color: themeColors.textPrimary,
                fontFamily: getFontName(fontFamily, 'Regular'),
                fontSize: getFontSize(15),
              }
            ]}>
              Trạm Phim – Xem phim trực tuyến miễn phí
            </Text>
            <Text style={[
              styles.fontPreviewText,
              { 
                color: themeColors.textPrimary,
                fontFamily: getFontName(fontFamily, 'Bold'),
                fontSize: getFontSize(15),
              }
            ]}>
              ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789
            </Text>
          </View>

          {/* Modal danh sách font */}
          <Modal visible={isFontModalVisible} transparent animationType="fade">
            <Pressable style={styles.fontModalOverlay} onPress={() => setFontModalVisible(false)}>
              <Pressable 
                style={[styles.fontModalContent, { backgroundColor: themeColors.bgSecondary }]} 
                onPress={e => e.stopPropagation()}
              >
                <Text style={[styles.fontModalTitle, { color: themeColors.textPrimary }]}>
                  Chọn Font chữ
                </Text>
                <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                  {FONT_PRESETS.map((preset) => {
                    const isSelected = fontFamily === preset.id;
                    return (
                      <Pressable
                        key={preset.id}
                        style={[
                          styles.fontModalItem,
                          { borderBottomColor: themeMode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)' },
                          isSelected && { backgroundColor: `${primaryColor}15` },
                        ]}
                        onPress={() => {
                          setFontFamily(preset.id);
                          setFontModalVisible(false);
                        }}
                      >
                        <Text style={[
                          styles.fontModalItemText,
                          { 
                            color: isSelected ? primaryColor : themeColors.textPrimary,
                            fontFamily: getFontName(preset.id, 'Medium'),
                          },
                          isSelected && { fontFamily: getFontName(preset.id, 'Bold') },
                        ]}>
                          {preset.label}
                        </Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={20} color={primaryColor} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </View>

        <View style={[styles.divider, { backgroundColor: themeColors.bgTertiary }]} />

        {/* === HIỆU ỨNG & HOẠT ẢNH === */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: getFontSize(15), color: primaryColor, marginBottom: 16 }]}>
            Hiệu ứng & Hoạt ảnh
          </Text>

          <View style={styles.effectsGrid}>
            {EFFECT_ITEMS.map(item => {
              const isActive = !!userEffects[item.id];
              return (
                <View
                  key={item.id}
                  style={[
                    styles.effectChip,
                    { 
                      borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
                      backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                    },
                    isActive && { 
                      borderColor: `${primaryColor}60`,
                      backgroundColor: `${primaryColor}15`,
                    },
                  ]}
                >
                  <View style={[
                    styles.effectChipIcon,
                    { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' },
                    isActive && { backgroundColor: `${primaryColor}20` },
                  ]}>
                    <Ionicons 
                      name={item.icon} 
                      size={18} 
                      color={isActive ? primaryColor : themeColors.textMuted} 
                    />
                  </View>
                  <View style={styles.effectChipText}>
                    <Text style={[
                      styles.effectChipTitle,
                      { color: themeColors.textPrimary, fontSize: getFontSize(13) },
                      isActive && { color: primaryColor },
                    ]}>
                      {item.title}
                    </Text>
                    <Text style={[styles.effectChipDesc, { color: themeColors.textMuted, fontSize: getFontSize(11) }]} numberOfLines={1}>
                      {item.desc}
                    </Text>
                  </View>
                  <Switch
                    value={isActive}
                    onValueChange={() => setUserEffects({ [item.id]: !isActive })}
                    trackColor={{ false: themeMode === 'light' ? '#ccc' : '#3a3a44', true: primaryColor }}
                    thumbColor={"#fff"}
                  />
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ marginTop: 40, alignItems: "center" }}>
          <TouchableOpacity 
            style={[styles.resetBtn, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }]}
            onPress={resetTheme}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={18} color={themeColors.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.resetText, { fontSize: getFontSize(14), color: themeColors.textMuted }]}>Khôi phục cài đặt gốc</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05020a", // Tối giản như phần cứng login
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#0a0a0f",
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f2e",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  headerTitle: {
    color: "#fff",
    fontWeight: "700",
    marginLeft: 12,
  },
  content: {
    padding: 24,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: "700",
    marginBottom: 6,
  },
  sectionDesc: {
    color: "#a7a8b2",
    lineHeight: 20,
    marginBottom: 16,
  },
  colorsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 8,
  },
  colorCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorCircleSelected: {
    transform: [{ scale: 1.1 }],
    shadowColor: "#fff",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  fontSizesRow: {
    flexDirection: "row",
    gap: 12,
  },
  fontSizeBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2b2d37",
    alignItems: "center",
    justifyContent: "center",
  },
  fontSizeBtnText: {
    color: "#d8d8df",
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#1f1f2e",
    marginVertical: 24,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resetText: {
    color: "#a7a8b2",
    fontWeight: "600",
  },

  // === Hiệu ứng Grid ===
  effectsContainer: {
    marginTop: 16,
  },
  effectsSubtitle: {
    marginBottom: 12,
    fontWeight: "500",
  },
  effectsGrid: {
    gap: 10,
  },
  effectChip: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  effectChipIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  effectChipText: {
    flex: 1,
  },
  effectChipTitle: {
    fontWeight: "600",
    marginBottom: 2,
  },
  effectChipDesc: {
    lineHeight: 16,
  },

  // === Font chữ Dropdown & Modal ===
  fontDropdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  fontDropdownText: {
    fontSize: 15,
    fontWeight: "500",
  },
  fontPreview: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
  },
  fontPreviewLabel: {
    marginBottom: 6,
    fontWeight: "500",
  },
  fontPreviewText: {
    marginBottom: 4,
    lineHeight: 24,
  },
  fontModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  fontModalContent: {
    borderRadius: 16,
    paddingVertical: 10,
    maxHeight: "80%",
  },
  fontModalTitle: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    marginBottom: 4,
  },
  fontModalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  fontModalItemText: {
    fontSize: 16,
  },
});
