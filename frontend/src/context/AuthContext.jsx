import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API } from '../lib/api';

const STORAGE_KEY = "project25-go-auth";
const AuthContext = createContext(null);

function loadStoredUser(spreadsheetId) {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed.spreadsheetId && parsed.spreadsheetId === spreadsheetId) {
            return parsed;
        }
    } catch {
        return null;
    }
    return null;
}

function persistUser(user) {
    if (typeof window === "undefined") return;
    if (!user) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function AuthProvider({ spreadsheetId, children }) {
    const [user, setUser] = useState(() => loadStoredUser(spreadsheetId));

    useEffect(() => {
        if (user && user.spreadsheetId !== spreadsheetId) {
            setUser(null);
        }
    }, [spreadsheetId, user]);

    useEffect(() => {
        if (!user) {
            const stored = loadStoredUser(spreadsheetId);
            if (stored) {
                setUser(stored);
            }
        }
    }, [spreadsheetId, user]);

    useEffect(() => {
        persistUser(user);
    }, [user]);

    const login = useCallback(async ({ username, password }) => {
        const res = await fetch(API.authLogin, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                spreadsheetId,
                username,
                password
            })
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || "Gagal masuk");
        }
        const payload = await res.json();
        const nextUser = {
            ...payload,
            spreadsheetId,
        };
        setUser(nextUser);
        return nextUser;
    }, [spreadsheetId]);

    const logout = useCallback(() => {
        persistUser(null);
        setUser(null);
    }, []);

    const normalizedMenus = useMemo(() => {
        if (!user || !Array.isArray(user.allowedMenus) || user.allowedMenus.length === 0) {
            return null;
        }
        const normalized = user.allowedMenus
            .map(m => String(m || "").trim().toLowerCase())
            .filter(Boolean);
        return normalized.length > 0 ? normalized : null;
    }, [user]);

    const normalizedBanks = useMemo(() => {
        if (!user || !Array.isArray(user.allowedBanks) || user.allowedBanks.length === 0) {
            return null;
        }
        const normalized = user.allowedBanks
            .map(b => String(b || "").trim().toLowerCase())
            .filter(Boolean);
        return normalized.length > 0 ? normalized : null;
    }, [user]);

    const isAdmin = user?.role === "administrator";

    const hasMenuAccess = useCallback((menuId) => {
        if (!user) return false;
        if (isAdmin) return true;
        if (!normalizedMenus) return true;
        return normalizedMenus.includes(String(menuId || "").trim().toLowerCase());
    }, [isAdmin, normalizedMenus, user]);

    const canAccessBankSheet = useCallback((sheetName) => {
        if (!user) return false;
        if (isAdmin) return true;
        if (!normalizedBanks) return true;
        return normalizedBanks.includes(String(sheetName || "").trim().toLowerCase());
    }, [isAdmin, normalizedBanks, user]);

    const value = useMemo(() => ({
        user,
        login,
        logout,
        isAdmin,
        allowedMenuIds: normalizedMenus,
        allowedBankSheets: normalizedBanks,
        hasMenuAccess,
        canAccessBankSheet
    }), [user, login, logout, isAdmin, normalizedMenus, normalizedBanks, hasMenuAccess, canAccessBankSheet]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return ctx;
}
