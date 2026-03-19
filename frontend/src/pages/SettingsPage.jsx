import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { API } from '../lib/api';
import { fetchJson } from '../lib/fetcher';
import { NAV_ITEMS } from '../data/navItems';

export function SettingsPage({
    profiles,
    setProfiles,
    activeProfileId,
    setActiveProfileId,
    spreadsheetId,
    isAdmin
}) {
    const [name, setName] = useState("");
    const [sheetId, setSheetId] = useState("");

    function addProfile() {
        const n = name.trim();
        const s = sheetId.trim();
        if (!n || !s) return;
        const id = `p_${Date.now()}`;
        const next = [...profiles, { id, name: n, spreadsheetId: s }];
        setProfiles(next);
        setActiveProfileId(id);
        setName("");
        setSheetId("");
    }

    function removeProfile(id) {
        if (profiles.length <= 1) return;
        const next = profiles.filter(p => p.id !== id);
        setProfiles(next);
        if (activeProfileId === id) {
            setActiveProfileId(next[0].id);
        }
    }

    return (
        <div className="panel">
            <div className="panel-header">
                <h2 className="title">Settings</h2>
                <div className="subtitle">Kelola daftar Spreadsheet ID untuk dropdown</div>
            </div>
            <div className="settings-form">
                <input placeholder="Nama profile" value={name} onChange={e => setName(e.target.value)} />
                <input placeholder="Spreadsheet ID" value={sheetId} onChange={e => setSheetId(e.target.value)} />
                <button className="btn" onClick={addProfile}>Tambah</button>
            </div>
            <div className="list">
                {profiles.map(p => (
                    <div key={p.id} className="list-item">
                        <span>
                            <strong>{p.name}</strong>
                            <span className="muted"> - {p.spreadsheetId}</span>
                            {p.id === activeProfileId && <span className="muted"> (aktif)</span>}
                        </span>
                        <span>
                            <button className="btn" onClick={() => setActiveProfileId(p.id)}>Pilih</button>
                            {" "}
                            <button className="btn" onClick={() => removeProfile(p.id)}>Hapus</button>
                        </span>
                    </div>
                ))}
            </div>

            {isAdmin && (
                <div className="mt-8">
                    <UserAccessSettings spreadsheetId={spreadsheetId} />
                </div>
            )}
        </div>
    );
}

function UserAccessSettings({ spreadsheetId }) {
    const usersKey = `${API.authUsers}?spreadsheetId=${encodeURIComponent(spreadsheetId)}`;
    const { data: usersPayload, error: usersError, mutate: mutateUsers } = useSWR(usersKey, fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: true
    });
    const sheetsKey = API.sheets(spreadsheetId);
    const { data: sheetsData } = useSWR(sheetsKey, fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: true
    });

    const users = useMemo(() => usersPayload?.users ?? [], [usersPayload]);
    const bankSheets = useMemo(() => {
        const list = Array.isArray(sheetsData) ? sheetsData : [];
        return list
            .filter(s => /^bank\d{3}$/i.test(String(s.title || "").trim()))
            .map(s => String(s.title || ""));
    }, [sheetsData]);

    const [draftUsers, setDraftUsers] = useState([]);

    useEffect(() => {
        setDraftUsers(users.map(user => ({
            ...user,
            password: "",
            status: "",
            allowedMenus: Array.isArray(user.allowedMenus) ? user.allowedMenus : [],
            allowedBanks: Array.isArray(user.allowedBanks) ? user.allowedBanks : []
        })));
    }, [users]);

    const updateDraft = (idx, updater) => {
        setDraftUsers(prev => prev.map((user, index) => index === idx ? updater(user) : user));
    };

    const addUserCard = () => {
        setDraftUsers(prev => [
            ...prev,
            {
                username: "",
                fullName: "",
                role: "user",
                allowedMenus: [],
                allowedBanks: [],
                password: "",
                rowNumber: 0,
                status: ""
            }
        ]);
    };

    const saveUser = async (idx) => {
        const user = draftUsers[idx];
        if (!user.username.trim()) {
            updateDraft(idx, d => ({ ...d, status: "Username wajib diisi" }));
            return;
        }
        if (user.rowNumber <= 0 && !user.password.trim()) {
            updateDraft(idx, d => ({ ...d, status: "Password diperlukan untuk user baru" }));
            return;
        }
        const payload = {
            spreadsheetId,
            rowNumber: user.rowNumber,
            username: user.username.trim(),
            fullName: user.fullName.trim(),
            password: user.password,
            role: user.role,
            allowedMenus: user.allowedMenus,
            allowedBanks: user.allowedBanks
        };

        updateDraft(idx, d => ({ ...d, status: "Menyimpan..." }));
        try {
            const res = await fetch(API.authUsers, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Gagal menyimpan");
            }
            updateDraft(idx, d => ({ ...d, status: "Berhasil disimpan", password: "" }));
            mutateUsers();
        } catch (err) {
            updateDraft(idx, d => ({ ...d, status: `Gagal: ${err.message}` }));
        }
    };

    const toggleMenu = (idx, menuId) => {
        updateDraft(idx, d => {
            const has = d.allowedMenus.includes(menuId);
            const next = has ? d.allowedMenus.filter(m => m !== menuId) : [...d.allowedMenus, menuId];
            return { ...d, allowedMenus: next };
        });
    };

    const toggleBank = (idx, bankName) => {
        updateDraft(idx, d => {
            const has = d.allowedBanks.some(b => b.toLowerCase() === bankName.toLowerCase());
            const next = has
                ? d.allowedBanks.filter(b => b.toLowerCase() !== bankName.toLowerCase())
                : [...d.allowedBanks.filter(b => b.toLowerCase() !== bankName.toLowerCase()), bankName];
            return { ...d, allowedBanks: next };
        });
    };

    if (usersError) {
        return <div className="status">Error memuat user: {usersError.message}</div>;
    }

    return (
        <div className="panel">
            <div className="panel-header">
                <h3 className="title">Pengaturan User</h3>
                <div className="subtitle">Administrator dapat menentukan menu dan bank yang bisa diakses setiap user.</div>
            </div>
            <div className="flex justify-end mb-4">
                <button className="btn" onClick={addUserCard}>Tambah User</button>
            </div>
            <div className="space-y-4">
                {draftUsers.map((user, idx) => (
                    <div key={`${user.username}-${user.rowNumber}-${idx}`} className="border rounded-xl p-4 bg-slate-50">
                        <div className="flex flex-wrap gap-4">
                            <div className="flex-1 min-w-[180px]">
                                <label>Username</label>
                                <input value={user.username} onChange={e => updateDraft(idx, d => ({ ...d, username: e.target.value }))} />
                            </div>
                            <div className="flex-1 min-w-[180px]">
                                <label>Nama lengkap</label>
                                <input value={user.fullName} onChange={e => updateDraft(idx, d => ({ ...d, fullName: e.target.value }))} />
                            </div>
                            <div className="flex-1 min-w-[160px]">
                                <label>Role</label>
                                <select value={user.role} onChange={e => updateDraft(idx, d => ({ ...d, role: e.target.value }))}>
                                    <option value="administrator">Administrator</option>
                                    <option value="user">User</option>
                                </select>
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-4">
                            <div>
                                <label>Password</label>
                                <input
                                    type="password"
                                    placeholder={user.rowNumber > 0 ? "Kosongkan untuk tetap" : ""}
                                    value={user.password}
                                    onChange={e => updateDraft(idx, d => ({ ...d, password: e.target.value }))}
                                />
                                <p className="muted text-xs mt-1">Kosongkan untuk tidak mengubah password (kecuali user baru).</p>
                            </div>
                            <div>
                                <label>Menu yang diizinkan</label>
                                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                                    {NAV_ITEMS.map(nav => (
                                        <label key={nav.id} className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={user.allowedMenus.includes(nav.id)}
                                                onChange={() => toggleMenu(idx, nav.id)}
                                            />
                                            {nav.label}
                                        </label>
                                    ))}
                                </div>
                                <p className="muted text-xs mt-1">Kosongkan agar user dapat membuka semua menu.</p>
                            </div>
                        </div>

                        <div className="mt-3">
                            <label>Bank tables yang diizinkan</label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {bankSheets.length === 0 && <span className="muted text-xs">Belum ada sheet bank</span>}
                                {bankSheets.map(bank => (
                                    <label
                                        key={bank}
                                        className="px-3 py-1 border rounded-full text-xs cursor-pointer bg-white hover:border-slate-500"
                                    >
                                        <input
                                            type="checkbox"
                                            className="mr-1"
                                            checked={user.allowedBanks.some(b => b.toLowerCase() === bank.toLowerCase())}
                                            onChange={() => toggleBank(idx, bank)}
                                        />
                                        {bank}
                                    </label>
                                ))}
                            </div>
                            <p className="muted text-xs mt-1">Kosongkan list untuk memberi akses ke semua bank.</p>
                        </div>

                        <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
                            <span className="text-sm text-slate-500">{user.status}</span>
                            <button className="btn" onClick={() => saveUser(idx)}>Simpan</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
