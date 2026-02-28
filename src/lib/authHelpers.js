import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

/**
 * Sign in with Apple (iOS). Uses native Apple ID and Supabase signInWithIdToken.
 * On Android, returns { provider: 'apple', available: false }.
 */
export async function signInWithApple(signInWithIdToken) {
  if (Platform.OS !== 'ios') {
    return { provider: 'apple', available: false };
  }
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential?.identityToken) {
      return { provider: 'apple', cancelled: true };
    }
    const { data, error } = await signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    if (e?.code === 'ERR_REQUEST_CANCELED') {
      return { provider: 'apple', cancelled: true };
    }
    const msg = e?.message ?? e;
    const isExpoGoAudience = typeof msg === 'string' && msg.includes('Unacceptable audience') && msg.includes('host.exp.Exponent');
    const userMessage = isExpoGoAudience
      ? 'Apple Sign In works only in a development build, not in Expo Go. Run: npx expo run:ios'
      : msg;
    return { error: userMessage, data: null };
  }
}

/**
 * Sign in with Google via Supabase OAuth (opens browser).
 * setSession: supabase.auth.setSession (so we can set session after redirect).
 */
export async function signInWithGoogle(signInWithOAuth, setSession) {
  try {
    const AuthSession = await import('expo-auth-session');
    const redirectUrl = AuthSession.makeRedirectUri({ useProxy: true });
    const { data, error } = await signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl },
    });
    if (error) throw error;
    if (data?.url) {
      const WebBrowser = await import('expo-web-browser');
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      );
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const params = url.hash ? new URLSearchParams(url.hash.slice(1)) : url.searchParams;
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken && setSession) {
          const { error: sessionError } = await setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          return { data: { session: true }, error: null };
        }
      }
    }
    return { error: 'Sign in was cancelled or failed', data: null };
  } catch (e) {
    return { error: e?.message ?? e, data: null };
  }
}
