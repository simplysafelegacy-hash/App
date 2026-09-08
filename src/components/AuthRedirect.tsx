import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { takePostLoginTarget } from "@/lib/redirect";

/**
 * Completes the Auth0 round trip.
 *
 * Auth0's onRedirectCallback runs above the router and can only park the
 * destination (see src/lib/redirect.ts). This component lives inside the
 * router, so it can navigate for real — which is what actually swaps the
 * landing page for the dashboard once the code exchange finishes.
 *
 * Renders nothing.
 */
export function AuthRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const target = takePostLoginTarget();
    if (target) navigate(target, { replace: true });
  }, [navigate]);

  return null;
}
