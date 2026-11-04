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

interface Patient {
    id: string;
    patient_code: string;
    full_name: string;
    nic: string | null;
    date_of_birth?: string | null;
    gender: string | null;
    phone: string | null;
    email?: string | null;
    address?: string | null;
    blood_group: string | null;
    guardian_name?: string | null;
    guardian_phone?: string | null;
    guardian_relationship?: string | null;
}

const emptyEditForm = {
    full_name: '', nic: '', gender: '', phone: '', email: '', blood_group: '', address: '',
    guardian_name: '', guardian_phone: '', guardian_relationship: '',
};

export default function Patients() {
    const { hasPermission } = useAuth();
    const confirm = useConfirm();
    const [patients, setPatients] = useState<Patient[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);
    const [total, setTotal] = useState(0);

    // New patient form state
    const [form, setForm] = useState({
        full_name: '', nic: '', date_of_birth: '', gender: '', phone: '', email: '',
        blood_group: '', address: '', guardian_name: '', guardian_phone: '', guardian_relationship: '',
        data_consent_given: false,
    });

    // View dialog
    const [viewOpen, setViewOpen] = useState(false);
    const [viewPatient, setViewPatient] = useState<Patient | null>(null);
    const [viewLoading, setViewLoading] = useState(false);

    // Edit dialog
    const [editOpen, setEditOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState(emptyEditForm);
    const [editLoading, setEditLoading] = useState(false);

    const loadPatients = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/patients', { params: { search, page, limit: pageSize } });
            setPatients(res.data.data);
            setTotal(res.data.total);
        } catch {
            toast.error('Failed to load patients');
        } finally {
            setLoading(false);
        }
    }, [search, page, pageSize]);

    // Debounced search
    useEffect(() => {
        const t = setTimeout(loadPatients, 300);
        return () => clearTimeout(t);
    }, [loadPatients]);

    useEffect(() => { setPage(1); }, [search]);

    const handleCreate = async () => {
        if (!form.full_name) {
            toast.error('Full name is required');
            return;
        }
        if (!form.data_consent_given) {
            toast.error('Patient consent to process their data is required (PDPA)');
            return;
        }
        try {
            const payload: any = { full_name: form.full_name, data_consent_given: true };
            if (form.nic) payload.nic = form.nic;
            if (form.date_of_birth) payload.date_of_birth = form.date_of_birth;
            if (form.gender) payload.gender = form.gender;
            if (form.phone) payload.phone = form.phone;
            if (form.email) payload.email = form.email;
            if (form.blood_group) payload.blood_group = form.blood_group;
            if (form.address) payload.address = form.address;
            if (form.guardian_name) payload.guardian_name = form.guardian_name;
            if (form.guardian_phone) payload.guardian_phone = form.guardian_phone;
            if (form.guardian_relationship) payload.guardian_relationship = form.guardian_relationship;

            await api.post('/patients', payload);
            toast.success('Patient registered');
            setDialogOpen(false);
            setForm({
                full_name: '', nic: '', date_of_birth: '', gender: '', phone: '', email: '',
                blood_group: '', address: '', guardian_name: '', guardian_phone: '', guardian_relationship: '',
                data_consent_given: false,
            });
            loadPatients();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to register');
        }
    };

    const openView = async (id: string) => {
        setViewOpen(true);
        setViewLoading(true);
        setViewPatient(null);
        try {
            const res = await api.get(`/patients/${id}`);
            setViewPatient(res.data);
        } catch {
            toast.error('Failed to load patient');
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
            const res = await api.get(`/patients/${id}`);
            const p = res.data;
            setEditForm({
                full_name: p.full_name ?? '',
                nic: p.nic ?? '',
                gender: p.gender ?? '',
                phone: p.phone ?? '',
                email: p.email ?? '',
                blood_group: p.blood_group ?? '',
                address: p.address ?? '',
                guardian_name: p.guardian_name ?? '',
                guardian_phone: p.guardian_phone ?? '',
                guardian_relationship: p.guardian_relationship ?? '',
            });
        } catch {
            toast.error('Failed to load patient');
            setEditOpen(false);
        } finally {
            setEditLoading(false);
        }
    };

    const handleDelete = async (p: Patient) => {
        if (!(await confirm(`Delete ${p.full_name} (${p.patient_code})? This cannot be undone.`, { variant: 'destructive', confirmText: 'Delete' }))) return;
        try {
            await api.delete(`/patients/${p.id}`);
            toast.success('Patient deleted');
            loadPatients();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to delete patient');
        }
    };

    const handleUpdate = async () => {
        if (!editId) return;
        if (!editForm.full_name) {
            toast.error('Full name is required');
            return;
        }
        try {
            const payload: any = {
                full_name: editForm.full_name,
                nic: editForm.nic || null,
                gender: editForm.gender || null,
                phone: editForm.phone || null,
                email: editForm.email || null,
                blood_group: editForm.blood_group || null,
                address: editForm.address || null,
                guardian_name: editForm.guardian_name || null,
                guardian_phone: editForm.guardian_phone || null,
                guardian_relationship: editForm.guardian_relationship || null,
            };

            await api.patch(`/patients/${editId}`, payload);
            toast.success('Patient updated');
            setEditOpen(false);
            setEditId(null);
            loadPatients();
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to update patient');
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Patients</h1>
                    <p className="text-slate-500">Manage patient records</p>
                </div>

                {hasPermission('patient.create') && (
                    <>
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus size={16} className="mr-2" />New Patient
                        </Button>
                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogContent className="max-h-[85vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>Register New Patient</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-2">
                                    <div className="space-y-2">
                                        <Label>Full Name *</Label>
                                        <Input value={form.full_name}
                                            onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>NIC</Label>
                                            <Input value={form.nic}
                                                onChange={(e) => setForm({ ...form, nic: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Date of Birth</Label>
                                            <Input type="date" value={form.date_of_birth}
                                                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
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
                                            <Label>Blood Group</Label>
                                            <Input value={form.blood_group}
                                                onChange={(e) => setForm({ ...form, blood_group: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Address</Label>
                                        <Input value={form.address}
                                            onChange={(e) => setForm({ ...form, address: e.target.value })} />
                                    </div>
                                    <div className="pt-2 border-t">
                                        <Label className="text-slate-500 mb-2 block">Guardian Details (optional)</Label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Guardian Name</Label>
                                                <Input value={form.guardian_name}
                                                    onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Guardian Phone</Label>
                                                <PhoneInput value={form.guardian_phone}
                                                    onChange={(v) => setForm({ ...form, guardian_phone: v })} />
                                            </div>
                                        </div>
                                        <div className="space-y-2 mt-4">
                                            <Label>Guardian Relationship</Label>
                                            <Input value={form.guardian_relationship}
                                                onChange={(e) => setForm({ ...form, guardian_relationship: e.target.value })} />
                                        </div>
                                    </div>

                                    <label className="flex items-start gap-2 pt-2 border-t text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="mt-0.5"
                                            checked={form.data_consent_given}
                                            onChange={(e) => setForm({ ...form, data_consent_given: e.target.checked })}
                                        />
                                        <span className="text-slate-600">
                                            The patient (or their guardian) consents to this center collecting and
                                            processing their personal and health data for treatment purposes, per the
                                            Personal Data Protection Act No. 9 of 2022. *
                                        </span>
                                    </label>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                    <Button onClick={handleCreate}>Register</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </div>

            {/* Search */}
            <div className="relative mb-4 max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                    className="pl-9"
                    placeholder="Search by name, NIC, phone, code..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Table */}
            <div className="bg-white rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>NIC</TableHead>
                            <TableHead>Gender</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Blood</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                        ) : patients.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">No patients found</TableCell></TableRow>
                        ) : (
                            patients.map((p) => (
                                <TableRow key={p.id}>
                                    <TableCell className="font-mono text-sm">{p.patient_code}</TableCell>
                                    <TableCell className="font-medium">{p.full_name}</TableCell>
                                    <TableCell>{p.nic ?? '-'}</TableCell>
                                    <TableCell>{p.gender ?? '-'}</TableCell>
                                    <TableCell>{p.phone ?? '-'}</TableCell>
                                    <TableCell>{p.blood_group ?? '-'}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon-sm" title="View"
                                                onClick={() => openView(p.id)}>
                                                <Eye size={14} />
                                            </Button>
                                            {hasPermission('patient.edit') && (
                                                <Button variant="ghost" size="icon-sm" title="Edit"
                                                    onClick={() => openEdit(p.id)}>
                                                    <Pencil size={14} />
                                                </Button>
                                            )}
                                            {hasPermission('patient.edit') && (
                                                <Button variant="ghost" size="icon-sm" title="Delete"
                                                    onClick={() => handleDelete(p)}>
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
                    page={page} pageSize={pageSize} total={total}
                    onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                />
            </div>

            {/* View dialog */}
            <Dialog open={viewOpen} onOpenChange={setViewOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Patient Details</DialogTitle>
                    </DialogHeader>
                    {viewLoading || !viewPatient ? (
                        <div className="py-8 text-center text-slate-400">Loading...</div>
                    ) : (
                        <div className="space-y-3 py-2 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500">Code</Label><p className="font-mono">{viewPatient.patient_code}</p></div>
                                <div><Label className="text-slate-500">Full Name</Label><p className="font-medium">{viewPatient.full_name}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500">NIC</Label><p>{viewPatient.nic ?? '-'}</p></div>
                                <div><Label className="text-slate-500">Gender</Label><p>{viewPatient.gender ?? '-'}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500">Phone</Label><p>{viewPatient.phone ?? '-'}</p></div>
                                <div><Label className="text-slate-500">Email</Label><p>{viewPatient.email ?? '-'}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500">Blood Group</Label><p>{viewPatient.blood_group ?? '-'}</p></div>
                                <div><Label className="text-slate-500">Address</Label><p>{viewPatient.address ?? '-'}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500">Guardian Name</Label><p>{viewPatient.guardian_name ?? '-'}</p></div>
                                <div><Label className="text-slate-500">Guardian Phone</Label><p>{viewPatient.guardian_phone ?? '-'}</p></div>
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
                        <DialogTitle>Edit Patient</DialogTitle>
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
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>NIC</Label>
                                    <Input value={editForm.nic}
                                        onChange={(e) => setEditForm({ ...editForm, nic: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <PhoneInput value={editForm.phone}
                                        onChange={(v) => setEditForm({ ...editForm, phone: v })} />
                                </div>
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
                                    <Label>Blood Group</Label>
                                    <Input value={editForm.blood_group}
                                        onChange={(e) => setEditForm({ ...editForm, blood_group: e.target.value })} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input value={editForm.email}
                                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Address</Label>
                                <Input value={editForm.address}
                                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Guardian Name</Label>
                                    <Input value={editForm.guardian_name}
                                        onChange={(e) => setEditForm({ ...editForm, guardian_name: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Guardian Phone</Label>
                                    <PhoneInput value={editForm.guardian_phone}
                                        onChange={(v) => setEditForm({ ...editForm, guardian_phone: v })} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Guardian Relationship</Label>
                                <Input value={editForm.guardian_relationship}
                                    onChange={(e) => setEditForm({ ...editForm, guardian_relationship: e.target.value })} />
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
