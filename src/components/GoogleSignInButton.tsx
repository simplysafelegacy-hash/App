import { useGoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { useApp } from "@/context/AppContext";

const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? "true") === "true";

/**
 * GoogleSignInButton — a Sealed-styled "Continue with Google" button that
 * uses the OAuth 2.0 authorization-code flow in a popup. The Google
 * authorization code is sent to our backend (POST /api/auth/google), which
 * exchanges it for tokens, verifies the ID token, and returns our JWT.
 */
export function GoogleSignInButton({
  onSuccess,
  onError,
  label = "Continue with Google",
  fullWidth = true,
}: {
  onSuccess: (result: { newUser: boolean }) => void;
  onError?: (message: string) => void;
  label?: string;
  fullWidth?: boolean;
}) {
  const { signInWithGoogle } = useApp();
  const [pending, setPending] = useState(false);

  const login = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async ({ code }) => {
      setPending(true);
      try {
        const result = await signInWithGoogle(code);
        onSuccess(result);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Sign-in failed");
      } finally {
        setPending(false);
      }
    },
    onError: () => onError?.("Google sign-in was cancelled."),
  });

  // In demo mode the button is a shortcut into the mock vault.
  const onClick = () => {
    if (DEMO_MODE) {
      setPending(true);
      signInWithGoogle("demo")
        .then((r) => onSuccess(r))
        .finally(() => setPending(false));
      return;
    }
    login();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`btn-ink !bg-paper-alt !text-ink !border-hairline hover:!bg-ink hover:!text-paper hover:!border-ink transition-all ${
        fullWidth ? "w-full" : ""
      }`}
    >
      <GoogleGlyph />
      <span>{pending ? "Just a moment…" : label}</span>
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
