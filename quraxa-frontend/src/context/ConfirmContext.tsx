import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    /** 'destructive' styles the confirm button red — use for delete/deactivate/cancel actions. */
    variant?: 'default' | 'destructive';
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

interface PendingConfirm {
    message: string;
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

// App-wide replacement for window.confirm(): renders the same themed Dialog
// used everywhere else instead of the browser's native popup. Usage:
//   const confirm = useConfirm();
//   if (!(await confirm('Delete this record?', { variant: 'destructive' }))) return;
export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [pending, setPending] = useState<PendingConfirm | null>(null);

    const confirm = useCallback<ConfirmFn>((message, options = {}) => {
        return new Promise<boolean>((resolve) => {
            setPending({ message, options, resolve });
        });
    }, []);

    const settle = (value: boolean) => {
        pending?.resolve(value);
        setPending(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <Dialog open={!!pending} onOpenChange={(open) => { if (!open) settle(false); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {pending?.options.variant === 'destructive' && (
                                <AlertTriangle size={18} className="text-red-600" />
                            )}
                            {pending?.options.title ?? 'Are you sure?'}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="py-1 text-sm text-slate-600">{pending?.message}</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => settle(false)}>
                            {pending?.options.cancelText ?? 'Cancel'}
                        </Button>
                        <Button
                            variant={pending?.options.variant === 'destructive' ? 'destructive' : 'default'}
                            onClick={() => settle(true)}
                        >
                            {pending?.options.confirmText ?? 'Confirm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ConfirmContext.Provider>
    );
}

export function useConfirm(): ConfirmFn {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
    return ctx;
}
