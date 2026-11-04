import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Link, useLocation, Outlet, Navigate } from 'react-router-dom';
import {
    LayoutDashboard, Users, Stethoscope, CalendarDays,
    Pill, Receipt, Wallet, LogOut, Menu, PanelLeftClose, Bell, PackageX, ShieldCheck, BarChart3,
    Maximize, Minimize, FlaskConical, ShieldPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import logoLight from '@/assets/logo-light.png';
import ForcedPasswordChange from '@/components/ForcedPasswordChange';
import IdleSessionManager from '@/components/IdleSessionManager';

interface NavItem {
    label: string;
    path: string;
    icon: React.ElementType;
    permission?: string | string[];
}

const navItems: NavItem[] = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Patients', path: '/patients', icon: Users, permission: 'patient.view' },
    { label: 'Doctors', path: '/doctors', icon: Stethoscope, permission: 'doctor.view' },
    { label: 'Sessions', path: '/sessions', icon: CalendarDays, permission: 'session.view' },
    { label: 'Consultation', path: '/consultation', icon: Stethoscope, permission: 'consultation.view' },
    { label: 'Lab Reports', path: '/lab-reports', icon: FlaskConical, permission: 'lab.view' },
    // { label: 'Appointments', path: '/appointments', icon: ClipboardList, permission: 'appointment.view' },
    { label: 'Pharmacy', path: '/pharmacy', icon: Pill, permission: 'stock.view' },
    { label: 'Billing', path: '/billing', icon: Receipt, permission: 'invoice.view' },
    { label: 'Insurance Claims', path: '/insurance-claims', icon: ShieldPlus, permission: 'claim.view' },
    { label: 'Salary Settlements', path: '/salary-settlements', icon: Wallet, permission: 'payment.doctor' },
    {
        label: 'Reports', path: '/reports', icon: BarChart3,
        permission: ['report.operational', 'report.financial', 'audit.view'],
    },
    {
        label: 'Administration', path: '/administration', icon: ShieldCheck,
        permission: ['user.view', 'role.manage', 'audit.view'],
    },
];

const MOBILE_BREAKPOINT = 768;
const APP_VERSION = 'v1.0.0';

interface NotificationItem {
    key: string;
    text: string;
    to: string;
}

export default function Layout() {
    const { user, logout, hasPermission } = useAuth();
    const location = useLocation();

    // Desktop: sidebar collapses to an icon rail (persisted).
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === '1',
    );
    // Mobile: sidebar is an off-canvas drawer, closed by default.
    const [mobileOpen, setMobileOpen] = useState(false);

    // Live clock in the topbar
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Notifications: low stock + invoices awaiting payment, fetched once.
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef<HTMLDivElement>(null);

    // Fullscreen toggle — tracks the real browser state too, so it stays in
    // sync if the user exits via Esc or F11 instead of the button.
    const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
    useEffect(() => {
        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);
    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen().catch(() => { });
        }
    };

    useEffect(() => {
        const items: NotificationItem[] = [];
        const loaders: Promise<void>[] = [];

        if (hasPermission('stock.view')) {
            loaders.push(
                api.get('/pharmacy/stock').then((res) => {
                    const lowStock = res.data.filter((m: any) => m.low_stock);
                    if (lowStock.length > 0) {
                        items.push({
                            key: 'low-stock',
                            text: `${lowStock.length} medicine(s) low on stock`,
                            to: '/pharmacy',
                        });
                    }
                }).catch(() => { }),
            );
        }

        if (hasPermission('invoice.view')) {
            loaders.push(
                api.get('/billing/inpatient-invoices', { params: { limit: 1 } }).then((res) => {
                    if (res.data.total > 0) {
                        items.push({
                            key: 'pending-invoices',
                            text: `${res.data.total} invoice(s) awaiting payment`,
                            to: '/billing',
                        });
                    }
                }).catch(() => { }),
            );
        }

        Promise.all(loaders).then(() => setNotifications(items));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!notifOpen) return;
        const onClickOutside = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [notifOpen]);

    // Logout confirmation
    const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
    }, [collapsed]);

    // Close the mobile drawer automatically if the viewport grows into desktop size.
    useEffect(() => {
        const onResize = () => {
            if (window.innerWidth >= MOBILE_BREAKPOINT) setMobileOpen(false);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    if (!user) return <Navigate to="/login" replace />;

    const visibleItems = navItems.filter((item) => {
        if (!item.permission) return true;
        const required = Array.isArray(item.permission) ? item.permission : [item.permission];
        return required.some((p) => hasPermission(p));
    });

    const handleHamburgerClick = () => {
        if (window.innerWidth < MOBILE_BREAKPOINT) {
            setMobileOpen((v) => !v);
        } else {
            setCollapsed((v) => !v);
        }
    };

    return (
        <div className="flex h-screen bg-slate-50">
            <ForcedPasswordChange />
            <IdleSessionManager />

            {/* Mobile backdrop */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 md:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-white transition-transform duration-200 md:static md:translate-x-0 md:transition-[width] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'
                    } ${collapsed ? 'md:w-[76px] sidebar-collapsed' : 'md:w-64'}`}
            >
                <div className={`flex items-center justify-between border-b p-4 ${collapsed ? 'md:justify-center' : ''}`}>
                    {collapsed && (
                        <div
                            className="hidden md:block h-8 w-6 shrink-0"
                            style={{
                                backgroundImage: `url(${logoLight})`,
                                backgroundSize: 'auto 100%',
                                backgroundPosition: 'left center',
                                backgroundRepeat: 'no-repeat',
                            }}
                            title="QuraXa"
                        />
                    )}
                    <div className={`min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
                        <img src={logoLight} alt="QuraXa" className="h-8 w-auto" />
                        <p className="truncate text-xs text-slate-500 mt-1">Channeling Center</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleHamburgerClick}
                        className="shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <Menu size={18} /> : <PanelLeftClose size={18} />}
                    </button>
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                    {visibleItems.map((item) => {
                        const Icon = item.icon;
                        const active = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                data-label={item.label}
                                onClick={() => setMobileOpen(false)}
                                className={`nav-item flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${collapsed ? 'md:justify-center' : ''
                                    } ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                            >
                                <Icon size={18} className="shrink-0" />
                                <span className={`nav-label truncate ${collapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* App branding footer — logout now lives in the topbar */}
                <div className="border-t p-3 text-center">
                    <p className="truncate text-xs font-medium text-slate-500">QuraXa {APP_VERSION}</p>
                    <p className="truncate text-[11px] text-slate-400">© Synthara Solutions. All rights reserved.</p>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex min-w-0 flex-1 flex-col">
                {/* Topbar */}
                <div className="flex items-center gap-3 border-b bg-white px-4 py-2.5">
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:hidden"
                        aria-label="Open menu"
                    >
                        <Menu size={20} />
                    </button>
                    <h1 className="text-lg font-bold text-slate-800 md:hidden">QuraXa</h1>

                    <div className="ml-auto flex items-center gap-4">
                        {/* Live date & time */}
                        <div className="hidden sm:block text-right leading-tight">
                            <p className="text-sm font-semibold text-slate-800 tabular-nums">
                                {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </p>
                            <p className="text-xs text-slate-500">
                                {now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                        </div>

                        {/* Fullscreen toggle */}
                        <button
                            type="button"
                            onClick={toggleFullscreen}
                            className="hidden rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 sm:block"
                            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                            title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                        >
                            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                        </button>

                        {/* Notifications */}
                        <div ref={notifRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setNotifOpen((v) => !v)}
                                className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                aria-label="Notifications"
                            >
                                <Bell size={18} />
                                {notifications.length > 0 && (
                                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-semibold text-white">
                                        {notifications.length}
                                    </span>
                                )}
                            </button>

                            {notifOpen && (
                                <div className="absolute right-0 z-50 mt-2 w-72 rounded-md border bg-white shadow-md">
                                    <div className="border-b px-3 py-2 text-sm font-semibold text-slate-700">Notifications</div>
                                    {notifications.length === 0 ? (
                                        <p className="px-3 py-6 text-center text-sm text-slate-400">You're all caught up</p>
                                    ) : (
                                        <ul className="max-h-72 overflow-y-auto p-1">
                                            {notifications.map((n) => (
                                                <li key={n.key}>
                                                    <Link
                                                        to={n.to}
                                                        onClick={() => setNotifOpen(false)}
                                                        className="flex items-start gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                                    >
                                                        <PackageX size={15} className="mt-0.5 shrink-0 text-red-600" />
                                                        {n.text}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Logged-in user */}
                        <div className="hidden sm:block text-right leading-tight">
                            <p className="truncate text-sm font-medium text-slate-800">{user.full_name}</p>
                            <p className="truncate text-xs text-slate-500">{user.role}</p>
                        </div>

                        {/* Logout */}
                        <button
                            type="button"
                            onClick={() => setLogoutConfirmOpen(true)}
                            className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            aria-label="Logout"
                            title="Logout"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>

                <main className="flex-1 overflow-auto">
                    <div className="p-4 sm:p-6 lg:p-8">
                        <Outlet />
                    </div>
                </main>
            </div>

            {/* Logout confirmation */}
            <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Log out?</DialogTitle></DialogHeader>
                    <p className="py-2 text-sm text-slate-600">
                        You'll need to sign in again to access QuraXa.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLogoutConfirmOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={() => logout()}>Log Out</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
