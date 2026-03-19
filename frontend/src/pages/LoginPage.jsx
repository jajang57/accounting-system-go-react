import React, { useState } from 'react';

export function LoginPage({ onSubmit, loading, error, spreadsheetLabel }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    async function handleSubmit(e) {
        e.preventDefault();
        if (!username || !password) return;
        await onSubmit({ username, password });
    }

    return (
        <div className="max-w-md mx-auto mt-8">
            <div className="panel">
                <h2 className="title">Login</h2>
                <p className="subtitle">Masuk untuk mengakses dashboard</p>
                {spreadsheetLabel && (
                    <div className="status">
                        Menggunakan profile: <strong>{spreadsheetLabel}</strong>
                    </div>
                )}
                <form className="settings-form" onSubmit={handleSubmit}>
                    <input
                        placeholder="Username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        disabled={loading}
                    />
                    <input
                        placeholder="Password"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        disabled={loading}
                    />
                    <button type="submit" className="btn" disabled={loading}>
                        {loading ? "Sedang masuk..." : "Masuk"}
                    </button>
                </form>
                {error && <div className="status">Error: {error}</div>}
                <div className="muted" style={{ marginTop: 8 }}>
                    Default admin: <strong>admin</strong> / <strong>admin123</strong> (ganti setelah login pertama).
                </div>
            </div>
        </div>
    );
}
