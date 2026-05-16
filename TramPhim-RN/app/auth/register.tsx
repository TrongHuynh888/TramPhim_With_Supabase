import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
  Image,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { signInWithGoogleOAuth } from "../../lib/googleOAuth";
import { isExpoGoRuntime } from "../../lib/runtime";
import { useAuthStore } from "../../stores/useAuthStore";
import { useThemeStore } from "../../stores/useThemeStore";

type FieldProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address";
  secureTextEntry?: boolean;
  onToggleSecure?: () => void;
  showToggle?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
};

function AuthField({
  icon,
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = "default",
  secureTextEntry,
  onToggleSecure,
  showToggle,
  autoCapitalize = "none",
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={19} color="#8f9098" />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#747680"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
        />
        {showToggle ? (
          <TouchableOpacity onPress={onToggleSecure} style={styles.iconButton}>
            <Ionicons
              name={secureTextEntry ? "eye-outline" : "eye-off-outline"}
              size={20}
              color="#d8d8df"
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function AuthButton({
  label,
  loading,
  disabled,
  onPress,
  style,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.86}
      style={{ marginTop: 12 }}
    >
      <LinearGradient
        colors={disabled ? ['#2a3a4a', '#1a2a3a'] : ['#007AFF', '#4DB8FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.submitButton,
          disabled ? styles.submitDisabled : null,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>{label}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const setSession = useAuthStore((state) => state.setSession);
  const checkAdminStatus = useAuthStore((state) => state.checkAdminStatus);
  const { primaryColor } = useThemeStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isExpoGo = isExpoGoRuntime();
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    confirm.length > 0 &&
    !loading;

  const handleRegister = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu cần có ít nhất 6 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim();
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        const userId = data.user?.id;
        if (userId) {
          const { error: profileError } = await supabase
            .from("profiles")
            .insert({
              id: userId,
              display_name: name.trim() || null,
              email: normalizedEmail,
            });
          if (profileError) {
            console.warn("Create profile failed:", profileError);
          }
        }
        router.replace("/profile");
      }
    } catch (e: any) {
      setError(e?.message ?? "Lỗi đăng ký");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isExpoGo) {
        setError(
          "Google login đang tắt trong Expo Go. Build APK/IPA hoặc development build để test đăng nhập thật.",
        );
        return;
      }

      const { data, error } = await signInWithGoogleOAuth();
      if (error) throw error;

      if (Platform.OS === "web") {
        return;
      }

      if (data.session && data.user) {
        setSession(data.session);
        setUser(data.user);
        await checkAdminStatus(data.user.id);
        router.replace("/profile");
      }
    } catch (e: any) {
      setError(e?.message || "Lỗi đăng nhập Google");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient 
        colors={['#051525', '#020a14', '#010205']} 
        style={StyleSheet.absoluteFill} 
      />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.78}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={[styles.brandIconWrapper, { width: 54, height: 54 }]}>
              <LinearGradient 
                colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.15)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: 'absolute', width: 39, height: 33, top: 10, borderBottomLeftRadius: 9, borderBottomRightRadius: 9 }} 
              />
              <FontAwesome name="subway" size={54} color={primaryColor} style={{ lineHeight: 54, textAlign: 'center' }} />
              <View style={styles.brandPlayOverlay}>
                <FontAwesome name="play" size={16} color="rgba(255,255,255,0.85)" />
              </View>
            </View>
            <Text style={styles.eyebrow}>TRẠM PHIM</Text>
            <Text style={styles.title}>Tạo tài khoản</Text>
            <Text style={styles.subtitle}>
              Lưu lịch sử xem, danh sách yêu thích và nâng cấp trải nghiệm xem phim.
            </Text>
          </View>

          <View style={styles.panel}>
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={18} color="#ff7b7b" />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <AuthField
              icon="person-outline"
              label="Họ và tên"
              placeholder="Tên hiển thị"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <AuthField
              icon="mail-outline"
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <AuthField
              icon="lock-closed-outline"
              label="Mật khẩu"
              placeholder="Tối thiểu 6 ký tự"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              showToggle
              onToggleSecure={() => setShowPassword((value) => !value)}
            />
            <AuthField
              icon="shield-checkmark-outline"
              label="Nhập lại mật khẩu"
              placeholder="Xác nhận mật khẩu"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showConfirm}
              showToggle
              onToggleSecure={() => setShowConfirm((value) => !value)}
            />

            <AuthButton
              label="Đăng ký"
              loading={loading}
              disabled={!canSubmit}
              onPress={handleRegister}
            />

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>Hoặc</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity 
              style={styles.googleButton} 
              onPress={handleGoogleLogin} 
              disabled={loading}
              activeOpacity={0.8}
            >
              <Image 
                source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/120px-Google_%22G%22_logo.svg.png' }} 
                style={{ width: 22, height: 22 }} 
                resizeMode="contain"
              />
              <Text style={styles.googleButtonText}>
                {isExpoGo ? 'Google chỉ bật trên APK/IPA' : 'Đăng ký với Google'}
              </Text>
            </TouchableOpacity>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Đã có tài khoản?</Text>
              <TouchableOpacity onPress={() => router.push("/auth/login")}>
                <Text style={styles.switchLink}>Đăng nhập</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05020a" },
  keyboard: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 20,
    justifyContent: "center",
  },
  backButton: {
    position: "absolute",
    left: 20,
    top: 20,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  header: { alignItems: "center", marginBottom: 32, paddingTop: 48 },
  brandIconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  brandPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3, 
  },
  eyebrow: {
    color: "#4DB8FF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    marginBottom: 12,
  },
  subtitle: {
    color: "#b8b8c2",
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    maxWidth: 330,
  },
  panel: {
    backgroundColor: "rgba(10, 25, 45, 0.4)",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(77, 184, 255, 0.15)",
  },
  field: { marginBottom: 16 },
  label: {
    color: "#f5f5f7",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginLeft: 4,
  },
  inputShell: {
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(5, 15, 25, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(77, 184, 255, 0.25)",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    color: "#fff",
    fontSize: 15,
    marginLeft: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
  },
  submitButton: {
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(77, 184, 255, 0.15)",
  },
  dividerText: {
    color: "#4DB8FF",
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: "600",
  },
  googleButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  googleButtonText: {
    color: "#111",
    fontWeight: "800",
    fontSize: 16,
    marginLeft: 12,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 80, 80, 0.1)",
    borderColor: "rgba(255, 110, 110, 0.25)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  error: {
    color: "#ffb3b3",
    marginLeft: 10,
    flex: 1,
    lineHeight: 20,
    fontSize: 14,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  switchText: { color: "#a7a8b2", fontSize: 14 },
  switchLink: {
    color: "#4DB8FF",
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 8,
  },
});
