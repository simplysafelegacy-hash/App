import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { SealMark } from "@/components/SealMark";
import { VaultSwitcher, vaultAccessLabel, vaultDisplayName } from "@/components/VaultSwitcher";
import type { Permissions } from "@/lib/permissions";
import type { User } from "@/lib/types";
import { Bell, ChevronDown, CreditCard, LayoutGrid, LogOut, Menu, Settings, ShieldCheck, Users, X, type LucideProps } from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<LucideProps>;
  show: boolean;
}

/**
 * The single source of truth for the authenticated navigation. Every surface —
 * the desktop bar, the mobile menu, and the avatar dropdown — is derived from
 * this list, so a link can never appear in one place but be missing from
 * another (the steward "only Settings" bug came from three lists disagreeing).
 *
 * Visibility rules live here, once:
 *  - Vault:    anyone who can reach the dashboard for a vault — owners, readers
 *              (steward / released successor / agent), and sealed members who
 *              land on the release view.
 *  - People/Plan: owner-only.
 *  - Settings: always.
 *  - Admin:    admins only.
 */
function buildNavItems(permissions: Permissions, user: User | null): NavItem[] {
  const canSeeVault = permissions.canRead || permissions.isSealed;
  return [
    { to: "/dashboard", label: "Vault", icon: LayoutGrid, show: canSeeVault },
    { to: "/members", label: "People", icon: Users, show: permissions.canModify },
    { to: "/plans", label: "Plan", icon: CreditCard, show: permissions.canModify },
    { to: "/settings", label: "Settings", icon: Settings, show: true },
    { to: "/admin/release-requests", label: "Admin review", icon: ShieldCheck, show: Boolean(user?.isAdmin) },
  ].filter((item) => item.show);
}

export function Header() {
  const {
    isAuthenticated,
    currentUser,
    notifications,
    logout,
    markNotificationRead,
    permissions,
  } = useApp();
  const navItems = buildNavItems(permissions, currentUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    setMenuOpen(false);
    setNotifOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="container flex items-center justify-between h-14">
        <Link to={isAuthenticated ? "/dashboard" : "/"} className="shrink-0">
          <SealMark size={32} />
        </Link>

        {isAuthenticated ? (
          <>
            <nav className="hidden md:flex items-center gap-6">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `text-sm transition-colors py-2 ${
                      isActive
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <VaultSwitcher />
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md"
                  aria-label="Notifications"
                >
                  <Bell size={18} strokeWidth={1.5} />
                  {unread > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" />
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[360px] card-surface overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-baseline justify-between">
                      <h3 className="text-base font-semibold">Activity</h3>
                      <span className="text-sm text-muted-foreground">{unread} unread</span>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-5 py-10 text-center text-muted-foreground">
                          Nothing new.
                        </div>
                      ) : (
                        notifications.slice(0, 8).map((n) => (
                          <button
                            key={n.id}
                            onClick={() => markNotificationRead(n.id)}
                            className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted transition-colors ${
                              !n.read ? "bg-secondary/50" : ""
                            }`}
                          >
                            <p className="text-sm text-foreground leading-snug">{n.message}</p>
                            <p className="text-xs text-muted-foreground mt-1.5">
                              {new Date(n.timestamp).toLocaleDateString("en-US", {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative hidden md:block" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 text-foreground hover:bg-muted transition-colors rounded-md"
                >
                  {currentUser?.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt=""
                      className="w-8 h-8 rounded-full border border-border object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center text-xs font-semibold">
                      {(currentUser?.name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-sm">
                    {currentUser?.name?.split(" ")[0]}
                  </span>
                  <ChevronDown size={14} strokeWidth={1.5} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[240px] card-surface overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-medium text-foreground truncate">
                        {currentUser?.name}
                      </p>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {currentUser?.email}
                      </p>
                    </div>
                    {navItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors text-left"
                      >
                        <item.icon size={16} strokeWidth={1.5} />
                        {item.label}
                      </Link>
                    ))}
                    <button
                      onClick={() => {
                        logout();
                        navigate("/");
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors text-left border-t border-border"
                    >
                      <LogOut size={16} strokeWidth={1.5} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => setMobileOpen((o) => !o)}
                className="md:hidden p-2.5 text-foreground"
                aria-label="Menu"
              >
                {mobileOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="hidden sm:flex items-center gap-3">
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
              >
                Sign in
              </Link>
              <Link to="/signup" className="btn-primary !min-h-[40px] !text-sm">
                Create account
              </Link>
            </div>
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="sm:hidden p-2 text-foreground"
              aria-label="Menu"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </>
        )}
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <nav className="container py-6 flex flex-col gap-4">
            {isAuthenticated ? (
              <>
                <MobileVaultPicker />
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center gap-3 text-lg text-foreground py-1"
                  >
                    <item.icon size={20} strokeWidth={1.5} />
                    {item.label}
                  </Link>
                ))}
                <div className="border-t border-border my-2" />
                <p className="text-sm text-muted-foreground">{currentUser?.email}</p>
                <button
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                  className="flex items-center gap-2 text-lg text-foreground text-left"
                >
                  <LogOut size={18} strokeWidth={1.5} />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-lg text-foreground py-1">
                  Sign in
                </Link>
                <Link to="/signup" className="btn-primary">
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function MobileVaultPicker() {
  const { vaults, currentVaultId, selectVault, currentVaultSummary } = useApp();
  if (vaults.length === 0) return null;
  if (vaults.length === 1 && currentVaultSummary) {
    return (
      <div className="pb-2">
        <p className="text-sm font-medium text-muted-foreground mb-1">Current vault</p>
        <p className="text-xl">{vaultDisplayName(currentVaultSummary)}</p>
      </div>
    );
  }
  return (
    <div className="pb-2">
      <label htmlFor="vault-mobile" className="field-label">
        Current vault
      </label>
      <select
        id="vault-mobile"
        value={currentVaultId ?? ""}
        onChange={(e) => selectVault(e.target.value)}
        className="field"
      >
        {vaults.map((v) => (
          <option key={v.id} value={v.id}>
            {vaultDisplayName(v)} · {vaultAccessLabel(v)}
          </option>
        ))}
      </select>
    </div>
  );
}
