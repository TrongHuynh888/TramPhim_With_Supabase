import { AppText } from '../../components/AppText';
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/useAuthStore";
import { useProfileStore } from "../../stores/useProfileStore";

// ============================================================
// TYPES
// ============================================================

/** Một item avatar trong kho */
type AvatarItem = {
  id: string;
  url: string;
  category_id?: string | null;
};

/** Danh mục phân loại avatar */
type AvatarCategory = {
  id: string;
  name: string;
};

/** Trạng thái load dữ liệu */
type FetchStatus = "idle" | "loading" | "success" | "error";

// ============================================================
// HELPER: Fetch avatar trực tiếp qua REST API (bypass Supabase client)
// ============================================================

const SUPABASE_URL = "https://woctovnxocyfivzzrrem.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvY3Rvdm54b2N5Zml2enpycmVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODMwNjUsImV4cCI6MjA4ODU1OTA2NX0.kLqVgqytNyaXyXXgHixEmC0_8X5f8BxBqpICKeX_sxA";

/**
 * Fetch danh sách avatar từ Supabase REST API
 * Dùng fetch() thuần thay vì Supabase client để tránh lỗi connection treo
 */
async function fetchAvatarsFromREST(
  signal?: AbortSignal,
): Promise<AvatarItem[]> {
  const url = `${SUPABASE_URL}/rest/v1/avatar_library?select=id,url,category_id&order=created_at.desc`;

  const res = await fetch(url, {
    signal,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const data: AvatarItem[] = await res.json();
  return data.filter((item) => Boolean(item.url));
}

/**
 * Fetch danh mục avatar từ Supabase REST API
 */
async function fetchCategoriesFromREST(
  signal?: AbortSignal,
): Promise<AvatarCategory[]> {
  const url = `${SUPABASE_URL}/rest/v1/avatar_categories?select=id,name&order=name.asc`;

  const res = await fetch(url, {
    signal,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) return [];
  return res.json();
}

// ============================================================
// COMPONENT CHÍNH
// ============================================================

export default function EditProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useProfileStore((s) => s.profile);
  const fetchProfile = useProfileStore((s) => s.fetchProfile);
  const setProfile = useProfileStore((s) => s.setProfile);

  // --- State form ---
  const [displayName, setDisplayName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);

  // --- State kho avatar ---
  const [avatars, setAvatars] = useState<AvatarItem[]>([]);
  const [categories, setCategories] = useState<AvatarCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [avatarStatus, setAvatarStatus] = useState<FetchStatus>("idle");
  const [avatarErrorMsg, setAvatarErrorMsg] = useState("");

  // --- State lưu ---
  const [saving, setSaving] = useState(false);

  // Ref để abort request khi unmount
  const abortRef = useRef<AbortController | null>(null);

  // ==============================
  // INIT: Redirect nếu chưa login, load profile
  // ==============================
  useEffect(() => {
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    fetchProfile(user.id);
  }, [user]);

  // ==============================
  // Đồng bộ form với profile data
  // ==============================
  useEffect(() => {
    if (!profile && !user) return;

    setDisplayName(
      profile?.full_name ??
        profile?.display_name ??
        (user?.user_metadata?.full_name as string) ??
        (user?.user_metadata?.name as string) ??
        "",
    );
    setSelectedAvatar(
      profile?.avatar_url ??
        profile?.avatar ??
        (user?.user_metadata?.avatar_url as string) ??
        null,
    );
  }, [profile, user]);

  // ==============================
  // Load avatar khi component mount
  // ==============================
  useEffect(() => {
    loadAvatarLibrary();

    // Cleanup: abort request khi unmount
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ==============================
  // Lọc avatar theo danh mục đang chọn
  // ==============================
  const getVisibleAvatars = useCallback((): AvatarItem[] => {
    if (activeCategory === "all") return avatars;
    if (activeCategory === "uncategorized") {
      return avatars.filter((a) => !a.category_id);
    }
    return avatars.filter((a) => a.category_id === activeCategory);
  }, [activeCategory, avatars]);

  // ==============================
  // LOAD KHO AVATAR (dùng REST API thuần)
  // ==============================
  const loadAvatarLibrary = async () => {
    // Hủy request cũ nếu đang chạy
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAvatarStatus("loading");
    setAvatarErrorMsg("");

    try {
      console.log("[EditProfile] Đang tải kho avatar...");

      // Fetch song song avatars + categories
      const [avatarList, categoryList] = await Promise.all([
        fetchAvatarsFromREST(controller.signal),
        fetchCategoriesFromREST(controller.signal),
      ]);

      // Kiểm tra abort
      if (controller.signal.aborted) return;

      console.log(`[EditProfile] Tải thành công: ${avatarList.length} avatars, ${categoryList.length} categories`);

      setAvatars(avatarList);
      setCategories(categoryList);
      setAvatarStatus("success");
    } catch (error: any) {
      // Bỏ qua lỗi do abort (unmount)
      if (error?.name === "AbortError") return;

      console.warn("[EditProfile] Lỗi tải kho avatar:", error);
      setAvatarStatus("error");
      setAvatarErrorMsg(
        error?.message || "Không tải được kho avatar. Vui lòng thử lại.",
      );
    }
  };

  // ==============================
  // LƯU THÔNG TIN
  // ==============================
  const handleSave = async () => {
    if (!user) return;

    const finalName = displayName.trim();
    if (!finalName) {
      if (Platform.OS === "web") {
        window.alert("Vui lòng nhập tên hiển thị.");
      } else {
        Alert.alert("Thiếu tên hiển thị", "Vui lòng nhập tên hiển thị.");
      }
      return;
    }

    setSaving(true);
    try {
      // 1. Cập nhật bảng profiles
      const payload = {
        id: user.id,
        email: user.email ?? profile?.email ?? null,
        display_name: finalName,
        avatar: selectedAvatar,
      };

      const { error: profileErr } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (profileErr) throw profileErr;

      // 2. Cập nhật store ngay lập tức (không cần fetch lại)
      setProfile({
        ...(profile ?? {}),
        ...payload,
        full_name: finalName,
        avatar_url: selectedAvatar,
      });

      // 3. Cập nhật auth metadata (chạy ngầm, không cần đợi - data chính đã lưu vào profiles)
      supabase.auth
        .updateUser({
          data: {
            full_name: finalName,
            name: finalName,
            avatar_url: selectedAvatar,
          },
        })
        .catch((e) => console.warn("[EditProfile] updateUser ngầm lỗi:", e));

      setSaving(false);

      // 4. Thông báo thành công (cross-platform)
      if (Platform.OS === "web") {
        window.alert("Thông tin tài khoản đã được cập nhật.");
        router.back();
      } else {
        Alert.alert("Đã lưu", "Thông tin tài khoản đã được cập nhật.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (error: any) {
      console.error("[EditProfile] Lỗi lưu:", error);
      const msg = error?.message ?? "Có lỗi xảy ra khi cập nhật tài khoản.";
      if (Platform.OS === "web") {
        window.alert("Không thể lưu: " + msg);
      } else {
        Alert.alert("Không thể lưu", msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // ==============================
  // RENDER AVATAR ITEM (tối ưu với useCallback)
  // ==============================
  const renderAvatarItem = useCallback(
    ({ item }: { item: AvatarItem }) => {
      const isSelected = selectedAvatar === item.url;
      return (
        <TouchableOpacity
          onPress={() => setSelectedAvatar(item.url)}
          style={[styles.avatarCell, isSelected && styles.avatarCellActive]}
          activeOpacity={0.82}
        >
          <Image source={{ uri: item.url }} style={styles.avatarImage} />
          {isSelected && (
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={16} color="#111" />
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [selectedAvatar],
  );

  const keyExtractor = useCallback((item: AvatarItem) => item.id, []);

  // ==============================
  // Danh sách avatar đã lọc
  // ==============================
  const visibleAvatars = getVisibleAvatars();

  // ==============================
  // RENDER
  // ==============================
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconButton}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>Quản lý tài khoản</AppText>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveButton, saving && styles.disabled]}
          >
            {saving ? (
              <ActivityIndicator color="#111" size="small" />
            ) : (
              <AppText style={styles.saveText}>Lưu</AppText>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Preview avatar + tên */}
          <View style={styles.preview}>
            {selectedAvatar ? (
              <Image
                source={{ uri: selectedAvatar }}
                style={styles.previewAvatar}
              />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Ionicons name="person" size={42} color="#fff" />
              </View>
            )}
            <AppText style={styles.previewName}>
              {displayName.trim() ||
                profile?.email ||
                user?.email ||
                "Tài khoản"}
            </AppText>
            <AppText style={styles.previewEmail}>
              {profile?.email ?? user?.email}
            </AppText>
          </View>

          {/* Tên hiển thị */}
          <View style={styles.section}>
            <AppText style={styles.sectionTitle}>Tên hiển thị</AppText>
            <View style={styles.inputShell}>
              <Ionicons name="person-outline" size={19} color="#8f9098" />
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Nhập tên hiển thị"
                placeholderTextColor="#747680"
                style={styles.input}
              />
            </View>
          </View>

          {/* Kho avatar */}
          <View style={styles.section}>
            {/* Header kho avatar */}
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <AppText style={styles.sectionTitle}>Kho avatar</AppText>
                <AppText style={styles.sectionSub}>
                  Chọn một ảnh đại diện có sẵn cho tài khoản.
                </AppText>
              </View>
              {avatarStatus === "loading" && (
                <ActivityIndicator color="#fff" />
              )}
            </View>

            {/* Filter tabs danh mục */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
            >
              <FilterChip
                label="Tất cả"
                active={activeCategory === "all"}
                onPress={() => setActiveCategory("all")}
              />
              <FilterChip
                label="Chưa phân loại"
                active={activeCategory === "uncategorized"}
                onPress={() => setActiveCategory("uncategorized")}
              />
              {categories.map((cat) => (
                <FilterChip
                  key={cat.id}
                  label={cat.name}
                  active={activeCategory === cat.id}
                  onPress={() => setActiveCategory(cat.id)}
                />
              ))}
            </ScrollView>

            {/* Nội dung kho avatar */}
            {avatarStatus === "loading" && avatars.length === 0 && (
              <View style={styles.centerBox}>
                <ActivityIndicator color="#fff" size="large" />
                <AppText style={styles.loadingText}>Đang tải kho avatar...</AppText>
              </View>
            )}

            {avatarStatus === "error" && avatars.length === 0 && (
              <View style={styles.centerBox}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={40}
                  color="#ff6b6b"
                />
                <AppText style={styles.avatarErrorText}>{avatarErrorMsg}</AppText>
                <TouchableOpacity
                  onPress={loadAvatarLibrary}
                  style={styles.retryButton}
                  activeOpacity={0.82}
                >
                  <Ionicons name="refresh" size={16} color="#111" />
                  <AppText style={styles.retryText}>Thử lại</AppText>
                </TouchableOpacity>
              </View>
            )}

            {visibleAvatars.length > 0 && (
              <FlatList
                data={visibleAvatars}
                renderItem={renderAvatarItem}
                keyExtractor={keyExtractor}
                numColumns={4}
                scrollEnabled={false}
                contentContainerStyle={styles.avatarGrid}
                columnWrapperStyle={styles.avatarRow}
              />
            )}

            {avatarStatus === "success" && visibleAvatars.length === 0 && (
              <AppText style={styles.emptyText}>
                Danh mục này chưa có avatar.
              </AppText>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================
// COMPONENT PHỤ: Filter chip (tab lọc danh mục)
// ============================================================

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.filterButton, active && styles.filterButtonActive]}
    >
      <AppText style={[styles.filterText, active && styles.filterTextActive]}>
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#08080d" },
  keyboard: { flex: 1 },

  // --- Header ---
  header: {
    height: 62,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1b1c24",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#171820",
    borderWidth: 1,
    borderColor: "#242630",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },
  saveButton: {
    minWidth: 62,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  saveText: { color: "#111", fontWeight: "800" },
  disabled: { opacity: 0.55 },

  // --- Content ---
  content: { padding: 18, paddingBottom: 34 },

  // --- Preview ---
  preview: {
    alignItems: "center",
    paddingVertical: 22,
    marginBottom: 8,
  },
  previewAvatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#222",
  },
  previewPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
  },
  previewName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 14,
  },
  previewEmail: { color: "#a7a8b2", fontSize: 14, marginTop: 4 },

  // --- Section ---
  section: {
    backgroundColor: "#111118",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#22232c",
    padding: 16,
    marginTop: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  sectionSub: {
    color: "#a7a8b2",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  // --- Input ---
  inputShell: {
    height: 52,
    borderRadius: 8,
    backgroundColor: "#181922",
    borderWidth: 1,
    borderColor: "#2b2d37",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    color: "#fff",
    fontSize: 15,
    marginLeft: 10,
  },

  // --- Filter tabs ---
  filters: { paddingTop: 14, paddingBottom: 12 },
  filterButton: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#181922",
    borderWidth: 1,
    borderColor: "#2b2d37",
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: "#fff",
    borderColor: "#fff",
  },
  filterText: { color: "#d8d8df", fontSize: 13, fontWeight: "700" },
  filterTextActive: { color: "#111" },

  // --- Avatar grid ---
  avatarGrid: { paddingTop: 4 },
  avatarRow: { marginBottom: 2 },
  avatarCell: {
    flex: 1,
    aspectRatio: 1,
    padding: 4,
    maxWidth: "25%",
  },
  avatarCellActive: {},
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#20212a",
  },
  checkBadge: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  // --- Loading / Error / Empty ---
  centerBox: {
    alignItems: "center",
    paddingVertical: 30,
  },
  loadingText: {
    color: "#a7a8b2",
    fontSize: 14,
    marginTop: 12,
  },
  emptyText: {
    color: "#a7a8b2",
    textAlign: "center",
    paddingVertical: 26,
  },
  avatarErrorText: {
    color: "#ffb3b3",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 14,
  },
  retryButton: {
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  retryText: {
    color: "#111",
    fontWeight: "800",
  },
});
