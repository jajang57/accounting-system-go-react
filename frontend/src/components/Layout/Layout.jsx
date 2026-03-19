import React from 'react';
import { Sidebar } from './Sidebar';

export function Layout({ page, setPage, children }) {
    return (
        <div className="layout">
            <Sidebar page={page} setPage={setPage} />
            <main className="main">
                {children}
            </main>
        </div>
    );
}
