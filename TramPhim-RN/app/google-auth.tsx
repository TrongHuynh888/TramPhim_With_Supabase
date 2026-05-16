import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { completeOAuthSessionFromUrl } from "../lib/googleOAuth";
import { useAuthStore } from "../stores/useAuthStore";

export default function GoogleAuthCallbackScreen() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const setUser = useAuthStore((state) => state.setUser);
  const checkAdminStatus = useAuthStore((state) => state.checkAdminStatus);
  const [message, setMessage] = useState("Dang hoan tat dang nhap Google...");

  useEffect(() => {
    let isMounted = true;

    async function finishAuth() {
      try {
        const url = await Linking.getInitialURL();

        if (!url) {
          setMessage("Khong nhan duoc callback Google.");
          return;
        }

        const { data, error } = await completeOAuthSessionFromUrl(url);
        if (error) throw error;

        if (data.session && data.user) {
          setSession(data.session);
          setUser(data.user);
          await checkAdminStatus(data.user.id);
        }

        if (isMounted) {
          router.replace("/profile");
        }
      } catch (error: any) {
        if (isMounted) {
          setMessage(error?.message || "Khong the hoan tat dang nhap Google.");
        }
      }
    }

    finishAuth();

    return () => {
      isMounted = false;
    };
  }, [checkAdminStatus, router, setSession, setUser]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#4DB8FF" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#05020a",
    padding: 24,
  },
  message: {
    color: "#d8d8df",
    fontSize: 15,
    marginTop: 14,
    textAlign: "center",
  },
});
