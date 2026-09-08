import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App.tsx";
import { setPostLoginTarget } from "./lib/redirect";
import "./index.css";

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
const demoMode = import.meta.env.VITE_DEMO_MODE === "true";

if ((!domain || !clientId || !audience) && !demoMode) {
  // Surface the misconfiguration loudly during development; the login
  // redirect fails opaquely otherwise.
  console.warn(
    "VITE_AUTH0_DOMAIN / VITE_AUTH0_CLIENT_ID / VITE_AUTH0_AUDIENCE are not all set — sign-in will not work.",
  );
}

/**
 * Runs after Auth0 redirects back with an authorization code.
 *
 * The SDK has already exchanged the code by this point. This provider sits
 * above BrowserRouter, so navigating here is not possible — a raw
 * history.replaceState would change the address bar without telling React
 * Router, which then keeps rendering the route it was already on (the
 * landing page) with a spent ?code= still in the URL. So the destination is
 * parked and <AuthRedirect> inside the router performs the real navigation.
 */
function onRedirectCallback(appState?: { returnTo?: string }) {
  const target = appState?.returnTo;
  const isAuthRoute =
    !target || ["/login", "/signup", "/forgot-password"].includes(target);
  setPostLoginTarget(isAuthRoute ? "/dashboard" : target);
}

createRoot(document.getElementById("root")!).render(
  <Auth0Provider
    domain={domain ?? ""}
    clientId={clientId ?? ""}
    onRedirectCallback={onRedirectCallback}
    authorizationParams={{
      redirect_uri: window.location.origin,
      audience,
      scope: "openid profile email",
    }}
    // Tokens are held in memory by default, which is the safest option: a
    // token in localStorage is readable by any script that gets injected
    // into the page. Refresh tokens with rotation let a returning user stay
    // signed in without that exposure.
    useRefreshTokens
    cacheLocation="memory"
  >
    <App />
  </Auth0Provider>,
);
