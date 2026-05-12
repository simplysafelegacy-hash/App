import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { SealMark } from "@/components/SealMark";
import { VaultSwitcher } from "@/components/VaultSwitcher";
import { Bell, ChevronDown, LogOut, Menu, User as UserIcon, X } from "lucide-react";

export function Header() {
  const {
    isAuthenticated,
    currentUser,
    notifications,
    logout,
    markNotificationRead,
    permissions,
  } = useApp();
  const authedLinks = [
    { to: "/dashboard", label: "Vault", show: true },
    { to: "/members", label: "People", show: permissions.canModify },
    { to: "/plans", label: "Plan", show: permissions.canModify },
  ].filter((l) => l.show);
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
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md border-b border-hairline-soft">
      <div className="container flex items-center justify-between h-[72px]">
        <Link to={isAuthenticated ? "/dashboard" : "/"} className="shrink-0">
          <SealMark size={34} />
        </Link>

        {isAuthenticated ? (
          <>
            <nav className="hidden md:flex items-center gap-8 lg:gap-10">
              {authedLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `text-[15px] tracking-wide transition-colors relative py-2 ${
                      isActive ? "text-ink" : "text-ink-muted hover:text-ink"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {l.label}
                      {isActive && (
                        <span className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-seal" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <VaultSwitcher />
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  className="relative p-2.5 text-ink-muted hover:text-ink transition-colors"
                  aria-label="Notifications"
                >
                  <Bell size={20} strokeWidth={1.5} />
                  {unread > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-seal" />
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[380px] paper-card rounded-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-hairline-soft flex items-baseline justify-between">
                      <h3 className="font-serif text-lg">Activity</h3>
                      <span className="text-xs text-ink-subtle">{unread} unread</span>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-5 py-10 text-center text-ink-subtle italic-serif">
                          Nothing new to mention.
                        </div>
                      ) : (
                        notifications.slice(0, 8).map((n) => (
                          <button
                            key={n.id}
                            onClick={() => markNotificationRead(n.id)}
                            className={`w-full text-left px-5 py-4 border-b border-hairline-soft last:border-b-0 hover:bg-paper-sunk/40 transition-colors ${
                              !n.read ? "bg-seal-soft/30" : ""
                            }`}
                          >
                            <p className="text-[15px] text-ink leading-snug">{n.message}</p>
                            <p className="text-xs text-ink-subtle mt-1.5">
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
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 text-ink hover:bg-paper-sunk/40 transition-colors rounded-sm"
                >
                  {currentUser?.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt=""
                      className="w-8 h-8 rounded-full border border-hairline-soft object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span
                      className="seal-mark"
                      style={{ width: 32, height: 32, fontSize: 15 }}
                    >
                      {(currentUser?.name || "?").charAt(0)}
                    </span>
                  )}
                  <span className="text-[15px]">
                    {currentUser?.name?.split(" ")[0]}
                  </span>
                  <ChevronDown size={14} strokeWidth={1.5} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[260px] paper-card rounded-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-hairline-soft">
                      <p className="text-[15px] font-medium text-ink truncate">
                        {currentUser?.name}
                      </p>
                      <p className="text-xs text-ink-subtle truncate mt-0.5">
                        {currentUser?.email}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate("/dashboard")}
                      className="w-full flex items-center gap-3 px-5 py-3 text-[15px] text-ink hover:bg-paper-sunk/40 transition-colors text-left"
                    >
                      <UserIcon size={16} strokeWidth={1.5} />
                      Vault
                    </button>
                    <button
                      onClick={() => {
                        logout();
                        navigate("/");
                      }}
                      className="w-full flex items-center gap-3 px-5 py-3 text-[15px] text-ink hover:bg-paper-sunk/40 transition-colors text-left border-t border-hairline-soft"
                    >
                      <LogOut size={16} strokeWidth={1.5} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => setMobileOpen((o) => !o)}
                className="md:hidden p-2.5 text-ink"
                aria-label="Menu"
              >
                {mobileOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="hidden sm:flex items-center gap-8">
              <Link to="/login" className="text-[15px] text-ink-muted hover:text-ink transition-colors">
                Sign in
              </Link>
              <Link to="/signup" className="btn-ink !min-h-[44px] !py-2.5 !px-5 text-[14px]">
                Open a vault
              </Link>
            </div>
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="sm:hidden p-2 text-ink"
              aria-label="Menu"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </>
        )}
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-hairline-soft bg-paper">
          <nav className="container py-6 flex flex-col gap-5">
            {isAuthenticated ? (
              <>
                <MobileVaultPicker />
                {authedLinks.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="text-lg text-ink"
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="rule" />
                <p className="text-sm text-ink-subtle">{currentUser?.email}</p>
                <button
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                  className="flex items-center gap-2 text-lg text-ink text-left"
                >
                  <LogOut size={18} strokeWidth={1.5} />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-lg text-ink">
                  Sign in
                </Link>
                <Link to="/signup" className="btn-ink">
                  Open a vault
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
        <p className="eyebrow mb-2">Current vault</p>
        <p className="font-serif text-xl">{currentVaultSummary.name}</p>
      </div>
    );
  }
  return (
    <div className="pb-2">
      <label htmlFor="vault-mobile" className="eyebrow mb-2 block">
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
            {v.name} · {v.role}
          </option>
        ))}
      </select>
    </div>
  );
}
