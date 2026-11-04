import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ShieldAlert } from 'lucide-react';

interface RequirePermissionProps {
    permission: string | string[];
    children: ReactNode;
}

// Route-level gate: hiding a nav link isn't real security — a user can still
// type the URL directly. This makes sure the page itself refuses to render
// without the permission the corresponding nav item requires.
export default function RequirePermission({ permission, children }: RequirePermissionProps) {
    const { hasPermission } = useAuth();
    const required = Array.isArray(permission) ? permission : [permission];
    const allowed = required.some((p) => hasPermission(p));

    if (!allowed) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <ShieldAlert size={40} className="mb-3 text-slate-300" />
                <h2 className="text-lg font-semibold text-slate-700">Access Denied</h2>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                    You don't have permission to view this page. Contact your administrator if you believe this is a mistake.
                </p>
            </div>
        );
    }

    return <>{children}</>;
}
