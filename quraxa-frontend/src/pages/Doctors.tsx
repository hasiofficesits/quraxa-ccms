import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { toast } from 'sonner';
import { Plus, Search, Eye, Pencil, Trash2 } from 'lucide-react';

interface Specialty { id: string; name: string; }
interface Doctor {
    id: string;
    doctor_code: string;
    full_name: string;
    nic: string | null;
    email: string | null;
    phone: string | null;
    gender: string | null;
    default_commission_rate: string;
    specialty_id?: string;
    specialties: { id?: string; name: string } | null;
}

const emptyEditForm = {
    full_name: '', specialty_id: '', gender: '', phone: '', email: '', nic: '',
    default_commission_rate: '70',
};

export default function Doctors() {
    const { hasPermission } = useAuth();
    const confirm = useConfirm();
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [specialties, setSpecialties] = useState<Specialty[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);
    const [form, setForm] = useState({
        full_name: '', specialty_id: '', gender: '', phone: '', email: '',
        default_commission_rate: '70',
    });

    // View dialog
    const [viewOpen, setViewOpen] = useState(false);
    const [viewDoctor, setViewDoctor] = useState<Doctor | null>(null);
    const [viewLoading, setViewLoading] = useState(false);

    // Edit dialog
    const [editOpen, setEditOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState(emptyEditForm);
    const [editLoading, setEditLoading] = useState(false);

    const loadDoctors = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/doctors', { params: { search } });
            setDoctors(res.data);
        } catch {
            toast.error('Failed to load doctors');
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        const t = setTimeout(loadDoctors, 300);
        return () => clearTimeout(t);
    }, [loadDoctors]);

    useEffect(() => { setPage(1); }, [search]);

    const pagedDoctors = doctors.slice((page - 1) * pageSize, page * pageSize);

    // Load specialties once for the dropdown
    useEffect(() => {
        api.get('/specialties').then((res) => setSpecialties(res.data)).catch(() => { });
    }, []);

    const handleCreate = async () => {
        if (!form.full_name || !form.specialty_id) {
            toast.error('Name and specialty are required');
            return;
        }
        try {
            const payload: any = {
                full_name: form.full_name,
                specialty_id: Number(form.specialty_id),
                default_commission_rate: Number(form.default_commission_rate),
            };
            if (form.gender) payload.gender = form.gender;
            if (form.phone) payload.phone = form.phone;
            if (form.email) payload.email = form.email;

            await api.post('/doctors', payload);
            toast.success('Doctor added');
            setDialogOpen(false);
            setForm({ full_name: '', specialty_id: '', gender: '', phone: '', email: '', default_commission_rate: '70' });
            loadDoctors();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to add doctor');
        }
    };

    const openView = async (id: string) => {
        setViewOpen(true);
        setViewLoading(true);
        setViewDoctor(null);
        try {
            const res = await api.get(`/doctors/${id}`);
            setViewDoctor(res.data);
        } catch {
            toast.error('Failed to load doctor');
            setViewOpen(false);
        } finally {
            setViewLoading(false);
        }
    };

    const openEdit = async (id: string) => {
        setEditId(id);
        setEditOpen(true);
        setEditLoading(true);
        try {
            const res = await api.get(`/doctors/${id}`);
            const d = res.data;
            setEditForm({
                full_name: d.full_name ?? '',
                specialty_id: d.specialty_id != null ? String(d.specialty_id) : (d.specialties?.id ?? ''),
                gender: d.gender ?? '',
                phone: d.phone ?? '',
                email: d.email ?? '',
                nic: d.nic ?? '',
                default_commission_rate: d.default_commission_rate != null ? String(d.default_commission_rate) : '70',
            });
        } catch {
            toast.error('Failed to load doctor');
            setEditOpen(false);
        } finally {
            setEditLoading(false);
        }
    };

    const handleDelete = async (d: Doctor) => {
        if (!(await confirm(`Delete Dr. ${d.full_name} (${d.doctor_code})? This cannot be undone.`, { variant: 'destructive', confirmText: 'Delete' }))) return;
        try {
            await api.delete(`/doctors/${d.id}`);
            toast.success('Doctor deleted');
            loadDoctors();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to delete doctor');
        }
    };

    const handleUpdate = async () => {
        if (!editId) return;
        if (!editForm.full_name) {
            toast.error('Name is required');
            return;
        }
        try {
            const payload: any = {
                full_name: editForm.full_name,
                nic: editForm.nic || null,
                phone: editForm.phone || null,
                email: editForm.email || null,
                gender: editForm.gender || null,
            };
            if (editForm.specialty_id) payload.specialty_id = Number(editForm.specialty_id);
            if (editForm.default_commission_rate !== '') {
                payload.default_commission_rate = Number(editForm.default_commission_rate);
            }

            await api.patch(`/doctors/${editId}`, payload);
            toast.success('Doctor updated');
            setEditOpen(false);
            setEditId(null);
            loadDoctors();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update doctor');
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Doctors</h1>
                    <p className="text-slate-500">Manage doctor profiles</p>
                </div>

                {hasPermission('doctor.manage') && (
                    <>
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus size={16} className="mr-2" />New Doctor
                        </Button>
                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add New Doctor</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-2">
                                    <div className="space-y-2">
                                        <Label>Full Name *</Label>
                                        <Input value={form.full_name}
                                            onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Specialty *</Label>
                                        <select
                                            className="w-full border rounded-md h-9 px-3 text-sm"
                                            value={form.specialty_id}
                                            onChange={(e) => setForm({ ...form, specialty_id: e.target.value })}
                                        >
                                            <option value="">Select specialty</option>
                                            {specialties.map((s) => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Gender</Label>
                                            <select
                                                className="w-full border rounded-md h-9 px-3 text-sm"
                                                value={form.gender}
                                                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                                            >
                                                <option value="">Select</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Commission %</Label>
                                            <Input type="number" value={form.default_commission_rate}
                                                onChange={(e) => setForm({ ...form, default_commission_rate: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Phone</Label>
                                            <PhoneInput value={form.phone}
                                                onChange={(v) => setForm({ ...form, phone: v })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Email</Label>
                                            <Input value={form.email}
                                                onChange={(e) => setForm({ ...form, email: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                    <Button onClick={handleCreate}>Add Doctor</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </div>

            <div className="relative mb-4 max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" placeholder="Search by name or code..."
                    value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="bg-white rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Specialty</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Commission</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                        ) : doctors.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">No doctors found</TableCell></TableRow>
                        ) : (
                            pagedDoctors.map((d) => (
                                <TableRow key={d.id}>
                                    <TableCell className="font-mono text-sm">{d.doctor_code}</TableCell>
                                    <TableCell className="font-medium">{d.full_name}</TableCell>
                                    <TableCell>{d.specialties?.name ?? '-'}</TableCell>
                                    <TableCell>{d.phone ?? '-'}</TableCell>
                                    <TableCell>{d.default_commission_rate}%</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon-sm" title="View"
                                                onClick={() => openView(d.id)}>
                                                <Eye size={14} />
                                            </Button>
                                            {hasPermission('doctor.manage') && (
                                                <Button variant="ghost" size="icon-sm" title="Edit"
                                                    onClick={() => openEdit(d.id)}>
                                                    <Pencil size={14} />
                                                </Button>
                                            )}
                                            {hasPermission('doctor.manage') && (
                                                <Button variant="ghost" size="icon-sm" title="Delete"
                                                    onClick={() => handleDelete(d)}>
                                                    <Trash2 size={14} />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                <Pagination
                    page={page} pageSize={pageSize} total={doctors.length}
                    onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                />
            </div>

            {/* View dialog */}
            <Dialog open={viewOpen} onOpenChange={setViewOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Doctor Details</DialogTitle>
                    </DialogHeader>
                    {viewLoading || !viewDoctor ? (
                        <div className="py-8 text-center text-slate-400">Loading...</div>
                    ) : (
                        <div className="space-y-3 py-2 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500">Code</Label><p className="font-mono">{viewDoctor.doctor_code}</p></div>
                                <div><Label className="text-slate-500">Full Name</Label><p className="font-medium">{viewDoctor.full_name}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500">Specialty</Label><p>{viewDoctor.specialties?.name ?? '-'}</p></div>
                                <div><Label className="text-slate-500">Gender</Label><p>{viewDoctor.gender ?? '-'}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500">Phone</Label><p>{viewDoctor.phone ?? '-'}</p></div>
                                <div><Label className="text-slate-500">Email</Label><p>{viewDoctor.email ?? '-'}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500">NIC</Label><p>{viewDoctor.nic ?? '-'}</p></div>
                                <div><Label className="text-slate-500">Commission</Label><p>{viewDoctor.default_commission_rate}%</p></div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Doctor</DialogTitle>
                    </DialogHeader>
                    {editLoading ? (
                        <div className="py-8 text-center text-slate-400">Loading...</div>
                    ) : (
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Full Name *</Label>
                                <Input value={editForm.full_name}
                                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Specialty</Label>
                                <select
                                    className="w-full border rounded-md h-9 px-3 text-sm"
                                    value={editForm.specialty_id}
                                    onChange={(e) => setEditForm({ ...editForm, specialty_id: e.target.value })}
                                >
                                    <option value="">Select specialty</option>
                                    {specialties.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Gender</Label>
                                    <select
                                        className="w-full border rounded-md h-9 px-3 text-sm"
                                        value={editForm.gender}
                                        onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                                    >
                                        <option value="">Select</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Commission %</Label>
                                    <Input type="number" value={editForm.default_commission_rate}
                                        onChange={(e) => setEditForm({ ...editForm, default_commission_rate: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <PhoneInput value={editForm.phone}
                                        onChange={(v) => setEditForm({ ...editForm, phone: v })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input value={editForm.email}
                                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>NIC</Label>
                                <Input value={editForm.nic}
                                    onChange={(e) => setEditForm({ ...editForm, nic: e.target.value })} />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdate} disabled={editLoading}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
