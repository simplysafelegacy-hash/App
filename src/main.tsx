import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.tsx";
import "./index.css";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!googleClientId && import.meta.env.VITE_DEMO_MODE !== "true") {
  // Surface the misconfiguration loudly during development; the GIS popup
  // will silently fail otherwise.
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_GOOGLE_CLIENT_ID is not set — Google sign-in will not work.",
  );
}

createRoot(document.getElementById("root")!).render(
  <GoogleOAuthProvider clientId={googleClientId ?? ""}>
    <App />
  </GoogleOAuthProvider>,
);
