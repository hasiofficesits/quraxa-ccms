import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ShieldAlert } from 'lucide-react';

// Blocks the app behind a mandatory password change whenever the logged-in
// user's account carries must_change_password (set on admin-created
// accounts and admin password resets, cleared once they set their own).
export default function ForcedPasswordChange() {
    const { user, clearMustChangePassword, logout } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [saving, setSaving] = useState(false);

    if (!user?.must_change_password) return null;

    const handleSubmit = async () => {
        if (!currentPassword) { toast.error('Enter your current (temporary) password'); return; }
        if (newPassword.length < 8) { toast.error('New password must be at least 8 characters'); return; }
        if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
        setSaving(true);
        try {
            await api.post('/auth/change-password', {
                current_password: currentPassword,
                new_password: newPassword,
            });
            toast.success('Password changed — welcome to QuraXa');
            clearMustChangePassword();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to change password');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={() => { /* not dismissible */ }}>
            <DialogContent className="sm:max-w-lg" showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldAlert size={18} className="text-amber-600" />Set a New Password
                    </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-slate-500">
                    For your security, you must set your own password before continuing.
                </p>
                <div className="space-y-3 py-2">
                    <div className="space-y-2">
                        <Label>Current (temporary) password *</Label>
                        <Input type="password" value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
                    </div>
                    <div className="space-y-2">
                        <Label>New password *</Label>
                        <Input type="password" value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                            placeholder="Minimum 8 characters" />
                    </div>
                    <div className="space-y-2">
                        <Label>Confirm new password *</Label>
                        <Input type="password" value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => logout()}>Log Out Instead</Button>
                    <Button onClick={handleSubmit} disabled={saving}>Set Password</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
