/**
 * Hand-off between Auth0's redirect callback and React Router.
 *
 * The Auth0Provider sits above BrowserRouter, so onRedirectCallback cannot
 * use useNavigate — and calling history.replaceState there would move the
 * address bar without telling React Router, leaving the app rendering the
 * route it was already on (the landing page). Instead the callback parks
 * the destination here and a component inside the router picks it up and
 * navigates properly.
 *
 * Module scope, not sessionStorage: this only has to survive the few
 * milliseconds between the SDK finishing the code exchange and the next
 * render, and it must not outlive the page.
 */

let pendingTarget: string | null = null;

export function setPostLoginTarget(target: string): void {
  pendingTarget = target;
}

/** Returns the parked destination once, then forgets it. */
export function takePostLoginTarget(): string | null {
  const target = pendingTarget;
  pendingTarget = null;
  return target;
}
