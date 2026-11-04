import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { PhoneInput } from '@/components/ui/phone-input';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination } from '@/components/ui/pagination';
import { toast } from 'sonner';
import {
    Plus, Search, Pencil, KeyRound, ShieldCheck, ShieldOff, Users as UsersIcon,
    ShieldQuestion, Trash2, History, DatabaseBackup, Building2, Download, Save,
} from 'lucide-react';

interface RoleLite { id: string; name: string; }
interface LinkedDoctor { id: string; full_name: string; }
interface SystemUser {
    id: string; full_name: string; username: string; email: string;
    phone: string | null; is_active: boolean; must_change_password: boolean; last_login_at: string | null;
    role: RoleLite; linked_doctor: LinkedDoctor | null;
}
interface LinkableDoctor {
    id: string; doctor_code: string; full_name: string;
    email: string | null; phone: string | null;
}
interface PermissionItem { id: string; code: string; module: string; }
interface Role {
    id: string; name: string; description: string | null;
    is_system: boolean; is_active: boolean; user_count: number;
    permissions: PermissionItem[];
}
interface AuditLog {
    id: string; action: string; entity_type: string | null; entity_id: string | null;
    ip_address: string | null; created_at: string;
    users: { id: string; full_name: string; username: string } | null;
}

const emptyUserForm = {
    full_name: '', username: '', email: '', phone: '', password: '', role_id: '', doctor_id: '',
};

export default function Administration() {
    const { user: currentUser, hasPermission } = useAuth();

    return (
        <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-1">Administration</h1>
            <p className="text-slate-500 mb-6">System access control — users, roles and permissions</p>

            <Tabs defaultValue="users">
                <TabsList>
                    {hasPermission('user.view') && <TabsTrigger value="users">Users</TabsTrigger>}
                    {hasPermission('role.manage') && <TabsTrigger value="roles">Roles &amp; Permissions</TabsTrigger>}
                    {hasPermission('audit.view') && <TabsTrigger value="audit">Audit Log</TabsTrigger>}
                    {(hasPermission('system.backup') || hasPermission('holiday.manage')) && (
                        <TabsTrigger value="system">System</TabsTrigger>
                    )}
                </TabsList>

                {hasPermission('user.view') && (
                    <TabsContent value="users">
                        <UsersTab currentUserId={currentUser?.id ?? null} hasPermission={hasPermission} />
                    </TabsContent>
                )}

                {hasPermission('role.manage') && (
                    <TabsContent value="roles">
                        <RolesTab />
                    </TabsContent>
                )}

                {hasPermission('audit.view') && (
                    <TabsContent value="audit">
                        <AuditTab />
                    </TabsContent>
                )}

                {(hasPermission('system.backup') || hasPermission('holiday.manage')) && (
                    <TabsContent value="system">
                        <SystemTab hasPermission={hasPermission} />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}

// ============================================================
// Users tab
// ============================================================

function UsersTab({ currentUserId, hasPermission }: { currentUserId: string | null; hasPermission: (p: string) => boolean }) {
    const confirm = useConfirm();
    const [users, setUsers] = useState<SystemUser[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    const [roles, setRoles] = useState<RoleLite[]>([]);
    const [linkableDoctors, setLinkableDoctors] = useState<LinkableDoctor[]>([]);

    const [formOpen, setFormOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyUserForm);
    const [saving, setSaving] = useState(false);

    const [pwOpen, setPwOpen] = useState(false);
    const [pwUserId, setPwUserId] = useState<string | null>(null);
    const [pwUserName, setPwUserName] = useState('');
    const [pwValue, setPwValue] = useState('');
    const [pwConfirm, setPwConfirm] = useState('');
    const [pwSaving, setPwSaving] = useState(false);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/users', { params: { search, page, limit: pageSize } });
            setUsers(res.data.data);
            setTotal(res.data.total);
        } catch {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [search, page, pageSize]);

    useEffect(() => {
        const t = setTimeout(loadUsers, 300);
        return () => clearTimeout(t);
    }, [loadUsers]);
    useEffect(() => { setPage(1); }, [search]);

    useEffect(() => {
        api.get('/admin/users/roles-list').then((r) => setRoles(r.data)).catch(() => { });
    }, []);

    const selectedRoleName = roles.find((r) => r.id === form.role_id)?.name;
    const isDoctorRole = (selectedRoleName ?? '').toLowerCase() === 'doctor';

    useEffect(() => {
        if (!formOpen || !isDoctorRole) return;
        api.get('/admin/users/linkable-doctors', { params: editId ? { for_user_id: editId } : {} })
            .then((r) => setLinkableDoctors(r.data))
            .catch(() => { });
    }, [formOpen, isDoctorRole, editId]);

    const openAdd = () => {
        setEditId(null);
        setForm(emptyUserForm);
        setFormOpen(true);
    };

    const openEdit = (u: SystemUser) => {
        setEditId(u.id);
        setForm({
            full_name: u.full_name, username: u.username, email: u.email,
            phone: u.phone ?? '', password: '', role_id: u.role.id,
            doctor_id: u.linked_doctor?.id ?? '',
        });
        setFormOpen(true);
    };

    const handleSave = async () => {
        if (!form.full_name || !form.email || !form.role_id) {
            toast.error('Full name, email and role are required');
            return;
        }
        if (!editId && (!form.username || !form.password)) {
            toast.error('Username and password are required for a new user');
            return;
        }
        setSaving(true);
        try {
            if (editId) {
                await api.patch(`/admin/users/${editId}`, {
                    full_name: form.full_name,
                    email: form.email,
                    phone: form.phone || undefined,
                    role_id: Number(form.role_id),
                    // Always sent on edit: 0 unlinks (e.g. role changed away from Doctor).
                    doctor_id: isDoctorRole && form.doctor_id ? Number(form.doctor_id) : 0,
                });
                toast.success('User updated');
            } else {
                await api.post('/admin/users', {
                    full_name: form.full_name,
                    username: form.username,
                    email: form.email,
                    password: form.password,
                    phone: form.phone || undefined,
                    role_id: Number(form.role_id),
                    doctor_id: isDoctorRole && form.doctor_id ? Number(form.doctor_id) : undefined,
                });
                toast.success('User created');
            }
            setFormOpen(false);
            loadUsers();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to save user');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (u: SystemUser) => {
        const activating = !u.is_active;
        if (!activating && !(await confirm(`Deactivate ${u.full_name}? They will immediately lose access on their next request.`, { variant: 'destructive', confirmText: 'Deactivate' }))) return;
        try {
            await api.patch(`/admin/users/${u.id}/status`, { is_active: activating });
            toast.success(activating ? 'User activated' : 'User deactivated');
            loadUsers();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update status');
        }
    };

    const openResetPassword = (u: SystemUser) => {
        setPwUserId(u.id);
        setPwUserName(u.full_name);
        setPwValue('');
        setPwConfirm('');
        setPwOpen(true);
    };

    const handleResetPassword = async () => {
        if (!pwUserId) return;
        if (pwValue.length < 8) { toast.error('Password must be at least 8 characters'); return; }
        if (pwValue !== pwConfirm) { toast.error('Passwords do not match'); return; }
        setPwSaving(true);
        try {
            await api.patch(`/admin/users/${pwUserId}/reset-password`, { new_password: pwValue });
            toast.success('Password reset');
            setPwOpen(false);
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to reset password');
        } finally {
            setPwSaving(false);
        }
    };

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <div className="relative w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input className="pl-9" placeholder="Search by name, username or email..."
                        value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                {hasPermission('user.create') && (
                    <Button size="sm" onClick={openAdd}>
                        <Plus size={14} className="mr-1" />Add User
                    </Button>
                )}
            </div>

            <div className="bg-white rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Linked Doctor</TableHead>
                            <TableHead>Last Login</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                        ) : users.length === 0 ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">No users found</TableCell></TableRow>
                        ) : users.map((u) => (
                            <TableRow key={u.id}>
                                <TableCell className="font-medium">
                                    {u.full_name}
                                    {u.id === currentUserId && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                                </TableCell>
                                <TableCell className="font-mono text-sm">{u.username}</TableCell>
                                <TableCell className="text-sm">{u.email}</TableCell>
                                <TableCell>
                                    <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">{u.role.name}</span>
                                </TableCell>
                                <TableCell className="text-sm">{u.linked_doctor?.full_name ?? '-'}</TableCell>
                                <TableCell className="text-xs text-slate-500">
                                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-0.5">
                                        {u.is_active ? (
                                            <span className="text-xs text-green-600">Active</span>
                                        ) : (
                                            <span className="text-xs text-red-600">Deactivated</span>
                                        )}
                                        {u.must_change_password && (
                                            <span className="text-[10px] text-amber-600">Password change pending</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        {hasPermission('user.edit') && (
                                            <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => openEdit(u)}>
                                                <Pencil size={14} />
                                            </Button>
                                        )}
                                        {hasPermission('user.edit') && (
                                            <Button variant="ghost" size="icon-sm" title="Reset password" onClick={() => openResetPassword(u)}>
                                                <KeyRound size={14} />
                                            </Button>
                                        )}
                                        {hasPermission('user.deactivate') && (
                                            <Button
                                                variant="ghost" size="icon-sm"
                                                title={u.is_active ? 'Deactivate' : 'Activate'}
                                                disabled={u.id === currentUserId && u.is_active}
                                                onClick={() => handleToggleActive(u)}
                                            >
                                                {u.is_active ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Pagination
                    page={page} pageSize={pageSize} total={total}
                    onPageChange={setPage}
                    onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                />
            </div>

            {/* Add / Edit user */}
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{editId ? 'Edit User' : 'Add User'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Full Name *</Label>
                            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Username *</Label>
                            <Input value={form.username} disabled={!!editId}
                                onChange={(e) => setForm({ ...form, username: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Email *</Label>
                            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Phone</Label>
                            <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                        </div>
                        {!editId && (
                            <div className="col-span-2 space-y-2">
                                <Label>Password *</Label>
                                <Input type="password" value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    placeholder="Minimum 8 characters" />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Role *</Label>
                            <select className="w-full border rounded-md h-9 px-3 text-sm"
                                value={form.role_id}
                                onChange={(e) => setForm({ ...form, role_id: e.target.value, doctor_id: '' })}>
                                <option value="">Select role</option>
                                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                        </div>
                        {isDoctorRole && (
                            <div className="col-span-2 space-y-2">
                                <Label>Linked Doctor Profile</Label>
                                <select className="w-full border rounded-md h-9 px-3 text-sm"
                                    value={form.doctor_id}
                                    onChange={(e) => {
                                        const doctorId = e.target.value;
                                        const doctor = linkableDoctors.find((d) => d.id === doctorId);
                                        setForm({
                                            ...form,
                                            doctor_id: doctorId,
                                            ...(doctor && {
                                                full_name: doctor.full_name,
                                                email: doctor.email ?? form.email,
                                                phone: doctor.phone ?? form.phone,
                                            }),
                                        });
                                    }}>
                                    <option value="">Not linked</option>
                                    {linkableDoctors.map((d) => (
                                        <option key={d.id} value={d.id}>{d.doctor_code} — {d.full_name}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-500">
                                    Links this login to a doctor profile so they only see their own sessions and patients.
                                    Selecting one fills in their name, email, and phone below — just add a username and password.
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {editId ? 'Save Changes' : 'Create User'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reset password */}
            <Dialog open={pwOpen} onOpenChange={setPwOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reset Password — {pwUserName}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-2">
                            <Label>New Password *</Label>
                            <Input type="password" value={pwValue} onChange={(e) => setPwValue(e.target.value)}
                                placeholder="Minimum 8 characters" />
                        </div>
                        <div className="space-y-2">
                            <Label>Confirm Password *</Label>
                            <Input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPwOpen(false)}>Cancel</Button>
                        <Button onClick={handleResetPassword} disabled={pwSaving}>Reset Password</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ============================================================
// Roles & Permissions tab
// ============================================================

function RolesTab() {
    const confirm = useConfirm();
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [permissionGroups, setPermissionGroups] = useState<Record<string, PermissionItem[]>>({});

    const [roleFormOpen, setRoleFormOpen] = useState(false);
    const [roleEditId, setRoleEditId] = useState<string | null>(null);
    const [roleName, setRoleName] = useState('');
    const [roleDescription, setRoleDescription] = useState('');
    const [roleSaving, setRoleSaving] = useState(false);

    const [permOpen, setPermOpen] = useState(false);
    const [permRole, setPermRole] = useState<Role | null>(null);
    const [permSelected, setPermSelected] = useState<Set<string>>(new Set());
    const [permSaving, setPermSaving] = useState(false);

    const loadRoles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/roles');
            setRoles(res.data);
        } catch {
            toast.error('Failed to load roles');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadRoles(); }, [loadRoles]);
    useEffect(() => {
        api.get('/admin/roles/permissions').then((r) => setPermissionGroups(r.data)).catch(() => { });
    }, []);

    const openAddRole = () => {
        setRoleEditId(null);
        setRoleName('');
        setRoleDescription('');
        setRoleFormOpen(true);
    };

    const openEditRole = (r: Role) => {
        setRoleEditId(r.id);
        setRoleName(r.name);
        setRoleDescription(r.description ?? '');
        setRoleFormOpen(true);
    };

    const handleSaveRole = async () => {
        if (!roleName.trim()) { toast.error('Role name is required'); return; }
        setRoleSaving(true);
        try {
            if (roleEditId) {
                await api.patch(`/admin/roles/${roleEditId}`, { name: roleName, description: roleDescription || undefined });
                toast.success('Role updated');
            } else {
                await api.post('/admin/roles', { name: roleName, description: roleDescription || undefined });
                toast.success('Role created');
            }
            setRoleFormOpen(false);
            loadRoles();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to save role');
        } finally {
            setRoleSaving(false);
        }
    };

    const handleToggleRoleActive = async (r: Role) => {
        const activating = !r.is_active;
        if (!activating && !(await confirm(`Deactivate role "${r.name}"? Users with this role will lose access next time they log in.`, { variant: 'destructive', confirmText: 'Deactivate' }))) return;
        try {
            await api.patch(`/admin/roles/${r.id}`, { is_active: activating });
            toast.success(activating ? 'Role activated' : 'Role deactivated');
            loadRoles();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update role');
        }
    };

    const handleDeleteRole = async (r: Role) => {
        if (!(await confirm(`Delete role "${r.name}"? This cannot be undone.`, { variant: 'destructive', confirmText: 'Delete' }))) return;
        try {
            await api.delete(`/admin/roles/${r.id}`);
            toast.success('Role deleted');
            loadRoles();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to delete role');
        }
    };

    const openPermissions = (r: Role) => {
        setPermRole(r);
        setPermSelected(new Set(r.permissions.map((p) => p.id)));
        setPermOpen(true);
    };

    const togglePermission = (id: string) => {
        setPermSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleSavePermissions = async () => {
        if (!permRole) return;
        setPermSaving(true);
        try {
            await api.patch(`/admin/roles/${permRole.id}/permissions`, {
                permission_ids: [...permSelected].map(Number),
            });
            toast.success('Permissions updated');
            setPermOpen(false);
            loadRoles();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update permissions');
        } finally {
            setPermSaving(false);
        }
    };

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500 max-w-xl">
                    Permission changes apply the next time an affected user logs in — current sessions keep
                    the access they were granted at login.
                </p>
                <Button size="sm" onClick={openAddRole}>
                    <Plus size={14} className="mr-1" />Add Role
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {loading ? (
                    <p className="text-slate-400 text-sm col-span-2 text-center py-8">Loading...</p>
                ) : roles.map((r) => (
                    <div key={r.id} className="bg-white rounded-md border p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-slate-800">{r.name}</h3>
                                    {r.is_system && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Built-in</span>
                                    )}
                                    {!r.is_active && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">Inactive</span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">{r.description || 'No description'}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><UsersIcon size={12} />{r.user_count} user{r.user_count === 1 ? '' : 's'}</span>
                            <span className="flex items-center gap-1"><ShieldQuestion size={12} />{r.permissions.length} permission{r.permissions.length === 1 ? '' : 's'}</span>
                        </div>

                        <div className="flex items-center gap-2 mt-4">
                            <Button variant="outline" size="sm" onClick={() => openPermissions(r)}>
                                Manage Permissions
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditRole(r)}>
                                <Pencil size={14} className="mr-1" />Edit
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleToggleRoleActive(r)}>
                                {r.is_active ? <ShieldOff size={14} className="mr-1" /> : <ShieldCheck size={14} className="mr-1" />}
                                {r.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                            {!r.is_system && r.user_count === 0 && (
                                <Button variant="ghost" size="sm" onClick={() => handleDeleteRole(r)}>
                                    <Trash2 size={14} className="mr-1" />Delete
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Add / Edit role */}
            <Dialog open={roleFormOpen} onOpenChange={setRoleFormOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{roleEditId ? 'Edit Role' : 'Add Role'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-2">
                            <Label>Role Name *</Label>
                            <Input value={roleName} onChange={(e) => setRoleName(e.target.value)}
                                disabled={!!roles.find((r) => r.id === roleEditId)?.is_system} />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Input value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRoleFormOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveRole} disabled={roleSaving}>
                            {roleEditId ? 'Save Changes' : 'Create Role'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Permission matrix */}
            <Dialog open={permOpen} onOpenChange={setPermOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Permissions — {permRole?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
                        {Object.entries(permissionGroups).map(([module, perms]) => (
                            <div key={module}>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{module}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {perms.map((p) => (
                                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={permSelected.has(p.id)}
                                                onChange={() => togglePermission(p.id)}
                                            />
                                            <span className="font-mono text-xs">{p.code}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPermOpen(false)}>Cancel</Button>
                        <Button onClick={handleSavePermissions} disabled={permSaving}>Save Permissions</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ============================================================
// Audit log tab
// ============================================================

function AuditTab() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);
    const [loading, setLoading] = useState(false);

    const [auditUsers, setAuditUsers] = useState<{ id: string; full_name: string; username: string }[]>([]);
    const [userFilter, setUserFilter] = useState('');

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/audit-logs', {
                params: { page, limit: pageSize, user_id: userFilter || undefined },
            });
            setLogs(res.data.data);
            setTotal(res.data.total);
        } catch {
            toast.error('Failed to load audit log');
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, userFilter]);

    useEffect(() => { loadLogs(); }, [loadLogs]);
    useEffect(() => { setPage(1); }, [userFilter]);

    useEffect(() => {
        api.get('/admin/audit-logs/users').then((r) => setAuditUsers(r.data)).catch(() => { });
    }, []);

    return (
        <div className="bg-white rounded-md border">
            <div className="flex items-center justify-between gap-2 p-3 border-b">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <History size={14} />Security-relevant actions across the system
                </div>
                <select
                    className="border rounded-md h-8 px-2 text-sm"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                >
                    <option value="">All users</option>
                    {auditUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>
                    ))}
                </select>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>IP Address</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                    ) : logs.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">No activity yet</TableCell></TableRow>
                    ) : logs.map((log) => (
                        <TableRow key={log.id}>
                            <TableCell className="text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</TableCell>
                            <TableCell className="text-sm">{log.users ? `${log.users.full_name} (${log.users.username})` : 'System'}</TableCell>
                            <TableCell>
                                <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 font-mono">{log.action}</span>
                            </TableCell>
                            <TableCell className="text-xs text-slate-500">
                                {log.entity_type ? `${log.entity_type}${log.entity_id ? ` #${log.entity_id}` : ''}` : '-'}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500">{log.ip_address ?? '-'}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <Pagination
                page={page} pageSize={pageSize} total={total}
                onPageChange={setPage}
                onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            />
        </div>
    );
}

// ============================================================
// System tab — business identity (shown on printed receipts, per
// Business Names Act / IRD tax-invoice expectations) + on-demand DB backup.
// ============================================================

interface BusinessSettings {
    business_name: string; address: string | null; phone: string | null;
    business_reg_no: string | null; tin_number: string | null;
}
const emptyBusinessForm = { business_name: '', address: '', phone: '', business_reg_no: '', tin_number: '' };

function SystemTab({ hasPermission }: { hasPermission: (p: string) => boolean }) {
    const [form, setForm] = useState(emptyBusinessForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [backingUp, setBackingUp] = useState(false);

    useEffect(() => {
        api.get('/settings/business').then((r: { data: BusinessSettings }) => {
            setForm({
                business_name: r.data.business_name ?? '',
                address: r.data.address ?? '',
                phone: r.data.phone ?? '',
                business_reg_no: r.data.business_reg_no ?? '',
                tin_number: r.data.tin_number ?? '',
            });
        }).catch(() => { }).finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.patch('/settings/business', form);
            toast.success('Business settings saved');
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleBackup = async () => {
        setBackingUp(true);
        try {
            const res = await api.get('/backup/export', { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'application/sql' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.href = url;
            a.download = `quraxa-backup-${stamp}.sql`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Backup downloaded');
        } catch {
            toast.error('Backup failed — check that mysqldump is available on the server');
        } finally {
            setBackingUp(false);
        }
    };

    return (
        <div className="space-y-6">
            {hasPermission('system.backup') && (
            <Card>
                <CardContent className="pt-6">
                    <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
                        <Building2 size={16} />Business Details
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                        Shown on printed invoices/receipts business name, registration and TIN are commonly expected
                        on Sri Lankan tax documents.
                    </p>
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => <div key={i} className="h-9 rounded bg-slate-100 animate-pulse" />)}
                        </div>
                    ) : (
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                                <Label className="mb-1.5 block">Business Name</Label>
                                <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
                            </div>
                            <div>
                                <Label className="mb-1.5 block">Phone</Label>
                                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                            </div>
                            <div>
                                <Label className="mb-1.5 block">Business Registration No.</Label>
                                <Input value={form.business_reg_no} onChange={(e) => setForm({ ...form, business_reg_no: e.target.value })} />
                            </div>
                            <div>
                                <Label className="mb-1.5 block">TIN Number</Label>
                                <Input value={form.tin_number} onChange={(e) => setForm({ ...form, tin_number: e.target.value })} />
                            </div>
                            <div className="sm:col-span-2">
                                <Label className="mb-1.5 block">Address</Label>
                                <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end mt-4">
                        <Button disabled={loading || saving} onClick={handleSave}>
                            <Save size={15} className="mr-1.5" />{saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
            )}

            {hasPermission('system.backup') && (
            <Card>
                <CardContent className="pt-6">
                    <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
                        <DatabaseBackup size={16} />Backup &amp; Export
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                        Download a full database backup (patients, appointments, prescriptions, invoices, everything) as a
                        single .sql file. The file contains sensitive medical and financial data store it securely and
                        delete it once it's no longer needed.
                    </p>
                    <Button variant="outline" disabled={backingUp} onClick={handleBackup}>
                        <Download size={15} className="mr-1.5" />{backingUp ? 'Preparing backup...' : 'Download Full Backup'}
                    </Button>
                </CardContent>
            </Card>
            )}

            {hasPermission('holiday.manage') && <HolidaysManager />}
        </div>
    );
}

// ============================================================
// Holidays management — feeds the Dashboard calendar's holiday markers.
// ============================================================

interface HolidayRow { id: string; date: string; name: string; type: string; is_active: boolean; }
const HOLIDAY_TYPES = ['PUBLIC', 'BANK', 'MERCANTILE', 'POYA', 'OTHER'] as const;
const emptyHolidayForm = { id: null as string | null, date: '', name: '', type: 'PUBLIC' as string };

function HolidaysManager() {
    const confirm = useConfirm();
    const [items, setItems] = useState<HolidayRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(emptyHolidayForm);
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/holidays/full').then((r) => setItems(r.data)).catch(() => setItems([])).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => { setForm(emptyHolidayForm); setFormOpen(true); };
    const openEdit = (h: HolidayRow) => {
        setForm({ id: h.id, date: h.date.slice(0, 10), name: h.name, type: h.type });
        setFormOpen(true);
    };

    const handleSave = async () => {
        if (!form.date || !form.name.trim()) { toast.error('Date and name are required'); return; }
        setSaving(true);
        try {
            const payload = { date: form.date, name: form.name.trim(), type: form.type };
            if (form.id) {
                await api.patch(`/holidays/${form.id}`, payload);
                toast.success('Holiday updated');
            } else {
                await api.post('/holidays', payload);
                toast.success('Holiday added');
            }
            setFormOpen(false);
            load();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to save holiday');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (h: HolidayRow) => {
        try {
            await api.patch(`/holidays/${h.id}`, { is_active: !h.is_active });
            load();
        } catch {
            toast.error('Failed to update holiday');
        }
    };

    const handleDelete = async (h: HolidayRow) => {
        if (!(await confirm(`Delete "${h.name}"?`, { variant: 'destructive', confirmText: 'Delete' }))) return;
        try {
            await api.delete(`/holidays/${h.id}`);
            toast.success('Holiday removed');
            load();
        } catch {
            toast.error('Failed to remove holiday');
        }
    };

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-1">
                    <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                        <History size={16} />Holidays
                    </h3>
                    <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1" />Add Holiday</Button>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                    Shown on the Dashboard calendar. Fixed-date holidays are pre-loaded — add lunar/Poya and other
                    variable-date holidays here as they're confirmed each year.
                </p>

                {loading ? (
                    <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />)}</div>
                ) : items.length === 0 ? (
                    <p className="text-sm text-slate-400 py-8 text-center">No holidays added yet.</p>
                ) : (
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((h) => (
                                    <TableRow key={h.id}>
                                        <TableCell className="text-sm">
                                            {new Date(h.date.slice(0, 10) + 'T00:00:00').toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </TableCell>
                                        <TableCell className="font-medium">{h.name}</TableCell>
                                        <TableCell className="text-xs text-slate-500">{h.type}</TableCell>
                                        <TableCell>
                                            <span className={`text-xs px-2 py-1 rounded font-medium ${h.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                                {h.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button size="icon-sm" variant="ghost" onClick={() => openEdit(h)} title="Edit"><Pencil size={14} /></Button>
                                                <Button size="icon-sm" variant="ghost" onClick={() => toggleActive(h)} title={h.is_active ? 'Deactivate' : 'Activate'}>
                                                    {h.is_active ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                                                </Button>
                                                <Button size="icon-sm" variant="ghost" onClick={() => handleDelete(h)} title="Delete"><Trash2 size={14} /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>{form.id ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label className="mb-1.5 block">Date *</Label>
                            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                        </div>
                        <div>
                            <Label className="mb-1.5 block">Name *</Label>
                            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Vesak Full Moon Poya Day" />
                        </div>
                        <div>
                            <Label className="mb-1.5 block">Type</Label>
                            <select
                                className="w-full border rounded-md h-9 px-2 text-sm"
                                value={form.type}
                                onChange={(e) => setForm({ ...form, type: e.target.value })}
                            >
                                {HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                        <Button disabled={saving} onClick={handleSave}>{saving ? 'Saving...' : 'Save'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
