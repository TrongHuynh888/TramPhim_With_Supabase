import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { Platform } from "react-native";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { isExpoGoRuntime } from "./runtime";

const GOOGLE_OAUTH_REDIRECT_PATH = "google-auth";
const GOOGLE_OAUTH_NATIVE_REDIRECT_URL = "tramphimrn://google-auth";

WebBrowser.maybeCompleteAuthSession();

type GoogleOAuthResult = {
  data: {
    session: Session | null;
    user: User | null;
  };
  error: AuthError | null;
};

export function getGoogleOAuthRedirectUrl() {
  return makeRedirectUri({
    native: GOOGLE_OAUTH_NATIVE_REDIRECT_URL,
    scheme: "tramphimrn",
    path: GOOGLE_OAUTH_REDIRECT_PATH,
  });
}

export async function completeOAuthSessionFromUrl(
  url: string,
): Promise<GoogleOAuthResult> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  if (params.error) {
    throw new Error(params.error_description || params.error);
  }

  if (params.access_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token || "",
    });
    return { data: { session: data.session, user: data.user }, error };
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    return { data: { session: data.session, user: data.user }, error };
  }

  throw new Error("Khong nhan duoc token dang nhap Google.");
}

export async function signInWithGoogleOAuth(): Promise<GoogleOAuthResult> {
  if (Platform.OS !== "web" && isExpoGoRuntime()) {
    throw new Error(
      "Google login bi tat trong Expo Go. Hay build APK/IPA hoac development build de test dang nhap that.",
    );
  }

  const redirectTo =
    Platform.OS === "web" && typeof window !== "undefined"
      ? `${window.location.origin}/profile`
      : getGoogleOAuthRedirectUrl();

  console.log("[Google OAuth] redirectTo:", redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== "web",
    },
  });

  if (error) throw error;

  if (Platform.OS === "web") {
    return { data: { session: null, user: null }, error: null };
  }

  if (!data?.url) {
    throw new Error("Khong nhan duoc URL dang nhap Google.");
  }

  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    redirectTo,
  );

  if (result.type === "success" && result.url) {
    return completeOAuthSessionFromUrl(result.url);
  }

  return { data: { session: null, user: null }, error: null };
}
