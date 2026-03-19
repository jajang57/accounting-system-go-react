import React, { useMemo } from 'react';
import { Settings, ChevronLeft, ChevronRight, Search, User, LogOut, PieChart } from 'lucide-react';
import { NAV_ITEMS } from '../../data/navItems';

export function Sidebar({ page, setPage, collapsed, setCollapsed, allowedMenuIds, isAdmin, user, onLogout }) {
    const allowedNavIds = useMemo(() => {
        if (!allowedMenuIds || allowedMenuIds.length === 0) return null;
        const set = new Set();
        allowedMenuIds.forEach(id => {
            if (!id) return;
            set.add(String(id).toLowerCase());
        });
        return set;
    }, [allowedMenuIds]);

    const filteredNav = NAV_ITEMS.filter(item => {
        if (isAdmin) return true;
        if (!allowedNavIds) return true;
        return allowedNavIds.has(item.id.toLowerCase());
    });
    const displayName = user?.fullName || user?.username || "Guest";
    const displayMeta = user?.role ? user.role : "";

    return (
        <aside
            className={`bg-white h-screen transition-all duration-300 flex flex-col shadow-xl z-20 border-r border-slate-100 ${collapsed ? "w-20" : "w-[280px]"}`}
        >
            {/* 1. Header Section */}
            <div className={`h-20 flex items-center px-6 ${collapsed ? "justify-center px-0" : "justify-between"}`}>
                {!collapsed ? (
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-blue-200 shadow-lg">
                            <PieChart size={20} className="fill-white/20" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg text-slate-800 leading-tight">Roby<span className="text-blue-600">Tax</span></h1>
                            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Enterprise Edition</p>
                        </div>
                    </div>
                ) : (
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-blue-200 shadow-lg">
                        <span className="font-bold text-lg">F</span>
                    </div>
                )}
            </div>

            {/* 2. Search Bar */}
            <div className={`px-5 mb-6 ${collapsed ? "hidden" : "block"}`}>
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full bg-slate-50 border border-slate-100 text-slate-600 text-sm rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-200 transition-all placeholder:text-slate-400"
                    />
                </div>
            </div>

            {/* 3. Navigation Menu */}
            <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
                {!collapsed && (
                    <div className="px-2 mb-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Menu</span>
                    </div>
                )}

                <div className="space-y-1">
                    {filteredNav.map(item => {
                        const Icon = item.icon;
                        const isActive = page === item.id;

                        return (
                            <button
                                key={item.id}
                                onClick={() => setPage(item.id)}
                                className={`
                                    w-full flex items-center rounded-xl transition-all duration-200 group relative
                                    ${collapsed ? "justify-center aspect-square mb-2" : "px-3 py-3"}
                                    ${isActive
                                        ? "bg-blue-50/80 text-blue-600"
                                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                    }
                                `}
                                title={collapsed ? item.label : ""}
                            >
                                <Icon
                                    size={20}
                                    className={`
                                        transition-transform duration-200 group-hover:scale-105
                                        ${isActive ? "text-blue-600 fill-blue-600/10" : "text-slate-400 group-hover:text-slate-600"}
                                        ${!collapsed && "mr-3"}
                                    `}
                                />

                                {!collapsed && (
                                    <span className="font-medium text-[14px] tracking-wide">
                                        {item.label}
                                    </span>
                                )}

                                {!collapsed && item.id === 'reports' && (
                                    <span className="ml-auto bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-0.5 rounded-full">New</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Settings Separate Section (Visual separator) */}
                {!collapsed && <div className="my-4 border-t border-slate-100 mx-2" />}

                {isAdmin && (
                    <button
                        onClick={() => setPage("settings")}
                        className={`
                            w-full flex items-center rounded-xl transition-all duration-200 group
                            ${collapsed ? "justify-center aspect-square" : "px-3 py-3"}
                            ${page === "settings"
                                ? "bg-slate-100 text-slate-800"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                            }
                        `}
                        title="Settings"
                    >
                        <Settings
                            size={20}
                            className={`
                                ${page === "settings" ? "text-slate-800" : "text-slate-400 group-hover:text-slate-600"}
                                ${!collapsed && "mr-3"}
                            `}
                        />
                        {!collapsed && (
                            <span className="font-medium text-[14px]">
                                Settings
                            </span>
                        )}
                    </button>
                )}
            </div>

            {/* 4. Footer / User Profile */}
            <div className="p-4 border-t border-slate-100">
                <div className={`
                    flex items-center rounded-2xl border border-slate-100 bg-slate-50/50 p-2
                    ${collapsed ? "justify-center aspect-square border-0 bg-transparent p-0" : "gap-3"}
                `}>
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden shrink-0 border-2 border-white shadow-sm">
                        <User size={20} className="text-slate-500" />
                    </div>

                    {!collapsed && (
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-slate-700 truncate">{displayName}</h4>
                            <p className="text-xs text-slate-400 truncate">{displayMeta}</p>
                        </div>
                    )}

                    {!collapsed && user && (
                        <button
                            onClick={onLogout}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Logout"
                        >
                            <LogOut size={16} />
                        </button>
                    )}
                </div>

                <div className="mt-2 flex justify-center">
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="w-full flex items-center justify-center p-2 rounded-lg text-slate-300 hover:text-slate-500 transition-colors"
                        title={collapsed ? "Expand" : "Collapse"}
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>
            </div>
        </aside>
    );
}
