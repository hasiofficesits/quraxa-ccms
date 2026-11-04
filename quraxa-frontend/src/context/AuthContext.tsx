import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';

interface User {
    id: string;
    full_name: string;
    username: string;
    role: string;
    permissions: string[];
    must_change_password?: boolean;
}

interface AuthContextType {
    user: User | null;
    login: (username: string, password: string) => Promise<void>;
    loginWithGoogle: (credential: string) => Promise<void>;
    logout: (reason?: string) => Promise<void>;
    logoutAllDevices: () => Promise<void>;
    hasPermission: (permission: string) => boolean;
    clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(() => {
        const stored = localStorage.getItem('user');
        return stored ? JSON.parse(stored) : null;
    });

    // A silent /auth/refresh (401 retry, or the idle-timeout "Stay logged
    // in" button) updates localStorage directly from lib/api.ts — this
    // keeps this component's state in sync without a full page reload.
    useEffect(() => {
        const onRefreshed = (e: Event) => {
            const detail = (e as CustomEvent<User>).detail;
            if (detail) setUser(detail);
        };
        window.addEventListener('auth:refreshed', onRefreshed);
        return () => window.removeEventListener('auth:refreshed', onRefreshed);
    }, []);

    const login = async (username: string, password: string) => {
        const res = await api.post('/auth/login', { username, password });
        const { access_token, user: userData } = res.data;
        localStorage.setItem('token', access_token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
    };

    const loginWithGoogle = async (credential: string) => {
        const res = await api.post('/auth/google', { credential });
        const { access_token, user: userData } = res.data;
        localStorage.setItem('token', access_token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
    };

    // Best-effort: revoke this device's refresh token server-side before
    // clearing local state. If the network call fails (offline, server
    // down), the user still gets logged out locally — that must never block.
    const logout = async (reason?: string) => {
        try {
            await api.post('/auth/logout');
        } catch {
            // ignore — local logout proceeds regardless
        }
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        window.location.href = reason ? `/login?reason=${reason}` : '/login';
    };

    // "Logout everywhere" — revokes every refresh token this account holds,
    // on every device/browser it's signed into.
    const logoutAllDevices = async () => {
        try {
            await api.post('/auth/logout-all');
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            window.location.href = '/login';
        }
    };

    const hasPermission = (permission: string) => {
        return user?.permissions?.includes(permission) ?? false;
    };

    // Called after a successful forced password change so the blocking
    // dialog doesn't reappear for the rest of this session.
    const clearMustChangePassword = () => {
        setUser((prev) => {
            if (!prev) return prev;
            const next = { ...prev, must_change_password: false };
            localStorage.setItem('user', JSON.stringify(next));
            return next;
        });
    };

    return (
        <AuthContext.Provider value={{
            user, login, loginWithGoogle, logout, logoutAllDevices, hasPermission, clearMustChangePassword,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
