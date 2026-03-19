import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { GLPage } from './pages/GLPage';
import { ComparePage } from './pages/ComparePage';
import { SheetsPage } from './pages/SheetsPage';
import { BankTablesPage } from './pages/BankTablesPage';
import { MasterCoaPage } from './pages/MasterCoaPage';
import { ReportsPage } from './pages/ReportsPage';
import { CompanyPage } from './pages/CompanyPage';
import { SettingsPage } from './pages/SettingsPage';
import { BukuBesarPrintPage } from './pages/print/BukuBesarPrintPage';
import { LabaRugiPrintPage } from './pages/print/LabaRugiPrintPage';
import { NeracaPrintPage } from './pages/print/NeracaPrintPage';
import { PembelianPage } from './pages/PembelianPage';
import { PenjualanPage } from './pages/PenjualanPage';
import { AJEPage } from './pages/AJEPage';
import { LoginPage } from './pages/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NAV_ITEMS } from './data/navItems';
import { DEFAULT_SPREADSHEET_ID } from './lib/api';

const STORAGE_PROFILES = "spreadsheetProfiles";
const STORAGE_ACTIVE_PROFILE = "activeSpreadsheetProfileId";

function defaultProfiles() {
  return [{ id: "default", name: "Default Sheet", spreadsheetId: DEFAULT_SPREADSHEET_ID }];
}

function loadProfiles() {
  const raw = window.localStorage.getItem(STORAGE_PROFILES);
  if (!raw) return defaultProfiles();
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return defaultProfiles();
    return arr.filter(p => p && p.id && p.name && p.spreadsheetId);
  } catch {
    return defaultProfiles();
  }
}

function App() {
  const [page, setPage] = useState("dashboard");
  // Simple "router" for print views
  const query = new URLSearchParams(window.location.search);
  if (query.get("page") === "print_bukubesar") return <BukuBesarPrintPage />;
  if (query.get("page") === "print_labarugi") return <LabaRugiPrintPage />;
  if (query.get("page") === "print_neraca") return <NeracaPrintPage />;

  const [profiles, setProfiles] = useState(() => loadProfiles());
  const [activeProfileId, setActiveProfileId] = useState(() => localStorage.getItem(STORAGE_ACTIVE_PROFILE) || "default");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_PROFILES, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem(STORAGE_ACTIVE_PROFILE, activeProfileId);
  }, [activeProfileId]);

  const activeProfile = useMemo(
    () => profiles.find(p => p.id === activeProfileId) || profiles[0],
    [profiles, activeProfileId]
  );
  const spreadsheetId = activeProfile ? activeProfile.spreadsheetId : DEFAULT_SPREADSHEET_ID;

  return (
    <AuthProvider spreadsheetId={spreadsheetId}>
      <AppShell
        page={page}
        setPage={setPage}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        profiles={profiles}
        setProfiles={setProfiles}
        activeProfileId={activeProfileId}
        setActiveProfileId={setActiveProfileId}
        spreadsheetId={spreadsheetId}
        activeProfileName={activeProfile?.name}
      />
    </AuthProvider>
  );
}

function AppShell({
  page,
  setPage,
  collapsed,
  setCollapsed,
  profiles,
  setProfiles,
  activeProfileId,
  setActiveProfileId,
  spreadsheetId,
  activeProfileName
}) {
  const { user, login, logout, allowedMenuIds, allowedBankSheets, isAdmin } = useAuth();
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (!user) return;
    const pageKey = String(page || "").toLowerCase();
    const hasAccess = isAdmin || !allowedMenuIds || allowedMenuIds.length === 0 || allowedMenuIds.includes(pageKey);
    if (!hasAccess) {
      const fallback = NAV_ITEMS.find(item => isAdmin || !allowedMenuIds || allowedMenuIds.length === 0 || allowedMenuIds.includes(item.id.toLowerCase()));
      setPage(fallback?.id || "dashboard");
    }
  }, [user, allowedMenuIds, isAdmin, page, setPage]);

  const handleLogin = async ({ username, password }) => {
    setLoginError("");
    setLoginLoading(true);
    try {
      await login({ username, password });
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const renderPageContent = () => {
    if (!user) {
      return (
        <LoginPage
          onSubmit={handleLogin}
          loading={loginLoading}
          error={loginError}
          spreadsheetLabel={activeProfileName}
        />
      );
    }

    switch (page) {
      case "dashboard":
        return <DashboardPage />;
      case "gl":
        return <GLPage spreadsheetId={spreadsheetId} />;
      case "compare":
        return <ComparePage spreadsheetId={spreadsheetId} />;
      case "sheets":
        return <SheetsPage spreadsheetId={spreadsheetId} />;
      case "bankTables":
        return <BankTablesPage spreadsheetId={spreadsheetId} allowedBanks={allowedBankSheets} />;
      case "masterCoa":
        return <MasterCoaPage spreadsheetId={spreadsheetId} />;
      case "company":
        return <CompanyPage spreadsheetId={spreadsheetId} />;
      case "pembelian":
        return <PembelianPage spreadsheetId={spreadsheetId} />;
      case "penjualan":
        return <PenjualanPage spreadsheetId={spreadsheetId} />;
      case "aje":
        return <AJEPage spreadsheetId={spreadsheetId} />;
      case "reports":
        return <ReportsPage spreadsheetId={spreadsheetId} />;
      case "settings":
        return (
          <SettingsPage
            profiles={profiles}
            setProfiles={setProfiles}
            activeProfileId={activeProfileId}
            setActiveProfileId={setActiveProfileId}
            spreadsheetId={spreadsheetId}
            isAdmin={isAdmin}
          />
        );
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {user && (
        <Sidebar
          page={page}
          setPage={setPage}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          allowedMenuIds={allowedMenuIds}
          isAdmin={isAdmin}
          user={user}
          onLogout={logout}
        />
      )}
      <main className="flex-1 p-6 overflow-auto">
        <div className="w-full mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <div className="topbar flex items-center gap-2 mb-4">
              <strong>Spreadsheet</strong>
              <select value={activeProfileId} onChange={e => setActiveProfileId(e.target.value)}>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {isAdmin && (
                <button className="btn" onClick={() => setPage("settings")}>Settings</button>
              )}
              {user && (
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-sm text-slate-500">
                    {user.fullName || user.username} ({user.role})
                  </span>
                  <button className="btn" onClick={logout}>Logout</button>
                </div>
              )}
            </div>
            {renderPageContent()}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
