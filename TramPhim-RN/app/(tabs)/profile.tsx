import React, { useEffect } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useAuthStore } from "../../stores/useAuthStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useThemeStore } from "../../stores/useThemeStore";
import ProfileHeader from "../../components/ProfileHeader";
import UpgradeCard from "../../components/UpgradeCard";
import WalletCard from "../../components/WalletCard";
import PrimaryButton from "../../components/PrimaryButton";
import AccountListItem from "../../components/AccountListItem";
import { Href, useRouter } from "expo-router";
import { Profile } from "../../types/profile";
import { isExpoGoRuntime } from "../../lib/runtime";

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const profile = useProfileStore((state) => state.profile);
  const isLoading = useProfileStore((state) => state.isLoading);
  const fetchProfile = useProfileStore((state) => state.fetchProfile);
  const { themeColors } = useThemeStore();
  const isExpoGo = isExpoGoRuntime();

  useEffect(() => {
    if (user) fetchProfile(user.id);
  }, [user]);

  // Expo Go preview: keep UI testable without a real OAuth session.
  const isDevMock =
    !user &&
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    (isExpoGo || !isInitialized);
  const devProfile: Profile = {
    id: "dev-user",
    full_name: "Huỳnh Trọng",
    email: "huynhphutrong8223@gmail.com",
    avatar_url: undefined,
    membership_level: "free",
    ro_coin_balance: 0,
  };
  const sessionProfile: Profile | null = user
    ? {
        id: user.id,
        full_name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        email: user.email ?? null,
        avatar_url:
          (user.user_metadata?.avatar_url as string | undefined) ?? null,
        membership_level: "free",
        ro_coin_balance: 0,
      }
    : null;
  const visibleProfile = isDevMock ? devProfile : profile ?? sessionProfile;

  // Helper to require auth before navigation. Guests can still view UI but
  // protected routes will redirect to the login screen when tapped.
  const requireAuthNavigate = (route: string) => {
    if (user || isDevMock) router.push(route as Href);
    else router.push("/auth/login");
  };

  const handleUpgradeReq = () => requireAuthNavigate("/upgrade");
  const handleTopUpReq = () => requireAuthNavigate("/wallet/topup");
  // Bấm vào phần avatar/tên → vào trang chỉnh sửa profile
  const handleEditProfile = () => requireAuthNavigate("/profile/edit");
  // Bấm vào nút Admin → vào trang admin (chỉ admin mới thấy nút này)
  const handleAdminPanel = () => requireAuthNavigate("/admin");

  const handleLogout = async () => {
    try {
      const ok = await signOut();
      if (!ok) {
        Alert.alert("Lỗi", "Đăng xuất không thành công");
        return;
      }
      // Navigate to explicit login screen so user can sign back in
      router.replace("/auth/login");
    } catch (e) {
      console.error("Logout error", e);
      Alert.alert("Lỗi", "Đã xảy ra lỗi khi đăng xuất");
    }
  };

  if (isLoading && !visibleProfile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
        <ActivityIndicator size="large" color="#FFD166" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ProfileHeader
          profile={visibleProfile}
          onEdit={handleEditProfile}
        />
        <View style={styles.cardsRow}>
          <UpgradeCard
            membershipLevel={visibleProfile?.membership_level ?? "free"}
            onUpgrade={handleUpgradeReq}
          />
          <WalletCard
            balance={visibleProfile?.ro_coin_balance ?? 0}
            onTopUp={handleTopUpReq}
          />
        </View>

        {/* Nút Admin - chỉ hiện cho tài khoản admin */}
        {user && isAdmin ? (
          <PrimaryButton
            label="🛡️  Quản trị Admin"
            onPress={handleAdminPanel}
          />
        ) : null}

        {!user && !isDevMock ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              marginTop: 8,
            }}
          >
            <PrimaryButton
              label="Đăng nhập"
              onPress={() => router.push("/auth/login")}
              style={{ width: 140, marginRight: 8 }}
            />
            <PrimaryButton
              label="Đăng ký"
              onPress={() => router.push("/auth/register")}
              variant="secondary"
              style={{ width: 140 }}
            />
          </View>
        ) : null}
        <View style={styles.list}>
          <AccountListItem
            iconName="settings-outline"
            title="Cài đặt"
            onPress={() => router.push("/settings" as Href)}
          />
          <AccountListItem
            iconName="time-outline"
            title="Đang xem"
            onPress={() => requireAuthNavigate("/watching")}
          />
          <AccountListItem
            iconName="albums-outline"
            title="Album của tôi"
            onPress={() => requireAuthNavigate("/albums")}
          />
          <AccountListItem
            iconName="heart-outline"
            title="Yêu thích"
            onPress={() => requireAuthNavigate("/favorites")}
          />
          <AccountListItem
            iconName="tv-outline"
            title="Đăng nhập SmartTV"
            onPress={() => requireAuthNavigate("/smarttv")}
          />
          <AccountListItem
            iconName="shield-checkmark-outline"
            title="Hợp Đồng và Chính Sách"
            onPress={() => router.push("/policies" as Href)}
          />
          <AccountListItem
            iconName="document-text-outline"
            title="Chính sách bảo mật"
            onPress={() => router.push("/privacy" as Href)}
          />
          <AccountListItem
            iconName="chatbubble-ellipses-outline"
            title="Góp ý"
            onPress={() => requireAuthNavigate("/feedback")}
          />
          {user ? (
            <AccountListItem
              iconName="log-out-outline"
              title="Đăng xuất"
              onPress={handleLogout}
              danger
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 90 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: "700" },
  sub: { color: "#aaa", marginTop: 6 },
  cardsRow: { flexDirection: "row", marginTop: 12 },
  list: { marginTop: 18 },
  link: { color: "#FFD166" },
});
