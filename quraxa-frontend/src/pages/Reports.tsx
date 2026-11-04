import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { toast } from 'sonner';
import {
    FileSpreadsheet, FileText, FileDown, Play, ClipboardList, Search, BarChart3,
} from 'lucide-react';

type FilterType = 'date' | 'select' | 'text';
interface FilterOption { value: string; label: string; }
interface FilterDef {
    key: string; label: string; type: FilterType;
    options?: FilterOption[]; optionsSource?: 'doctors' | 'medicines' | 'auditUsers'; default?: string;
}
interface ReportDef {
    id: string; category: string; title: string; description: string;
    permission: string; filters: FilterDef[];
}
interface ReportResult {
    columns: { key: string; label: string }[];
    rows: Record<string, any>[];
}

const CATEGORY_ORDER = [
    'Appointments & Sessions', 'Pharmacy & Inventory', 'Financial', 'Performance', 'Security & Compliance',
];

export default function Reports() {
    const [catalog, setCatalog] = useState<ReportDef[] | null>(null);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [filterValues, setFilterValues] = useState<Record<string, string>>({});
    const [result, setResult] = useState<ReportResult | null>(null);
    const [running, setRunning] = useState(false);
    const [exporting, setExporting] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [doctorOptions, setDoctorOptions] = useState<FilterOption[]>([]);
    const [medicineOptions, setMedicineOptions] = useState<FilterOption[]>([]);
    const [auditUserOptions, setAuditUserOptions] = useState<FilterOption[]>([]);

    const loadCatalog = useCallback(async () => {
        setCatalogLoading(true);
        try {
            const res = await api.get('/reports/catalog');
            setCatalog(res.data);
        } catch {
            toast.error('Failed to load reports');
            setCatalog([]);
        } finally {
            setCatalogLoading(false);
        }
    }, []);

    useEffect(() => { loadCatalog(); }, [loadCatalog]);

    // Lazily populated the first time a report needing them is selected.
    useEffect(() => {
        api.get('/doctors').then((r) => setDoctorOptions(r.data.map((d: any) => ({ value: String(d.id), label: d.full_name })))).catch(() => { });
        api.get('/pharmacy/medicines-list').then((r) => setMedicineOptions(r.data.map((m: any) => ({ value: String(m.id), label: m.generic_name })))).catch(() => { });
        api.get('/admin/audit-logs/users').then((r) => setAuditUserOptions(r.data.map((u: any) => ({ value: String(u.id), label: `${u.full_name} (${u.username})` })))).catch(() => { });
    }, []);

    const grouped = useMemo(() => {
        if (!catalog) return [];
        const q = search.trim().toLowerCase();
        const filtered = q
            ? catalog.filter((r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
            : catalog;
        const byCategory = new Map<string, ReportDef[]>();
        for (const r of filtered) {
            (byCategory.get(r.category) ?? byCategory.set(r.category, []).get(r.category)!).push(r);
        }
        return CATEGORY_ORDER
            .filter((c) => byCategory.has(c))
            .map((category) => ({ category, reports: byCategory.get(category)! }));
    }, [catalog, search]);

    const selected = catalog?.find((r) => r.id === selectedId) ?? null;

    const optionsFor = (f: FilterDef): FilterOption[] => {
        if (f.options) return f.options;
        if (f.optionsSource === 'doctors') return doctorOptions;
        if (f.optionsSource === 'medicines') return medicineOptions;
        if (f.optionsSource === 'auditUsers') return auditUserOptions;
        return [];
    };

    const selectReport = (r: ReportDef) => {
        setSelectedId(r.id);
        const defaults: Record<string, string> = {};
        r.filters.forEach((f) => { if (f.default) defaults[f.key] = f.default; });
        setFilterValues(defaults);
        setResult(null);
        setPage(1);
        runReport(r.id, defaults);
    };

    const runReport = async (id: string, filters: Record<string, string>) => {
        setRunning(true);
        setPage(1);
        try {
            const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
            const res = await api.get(`/reports/${id}`, { params });
            setResult(res.data);
        } catch (err: any) {
            const msg = err.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to run report');
            setResult(null);
        } finally {
            setRunning(false);
        }
    };

    const handleExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
        if (!selected) return;
        setExporting(format);
        try {
            const params = Object.fromEntries(Object.entries(filterValues).filter(([, v]) => v));
            const res = await api.get(`/reports/${selected.id}/export`, {
                params: { ...params, format },
                responseType: 'blob',
            });
            const blob = new Blob([res.data]);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selected.id}.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            toast.error('Export failed');
        } finally {
            setExporting(null);
        }
    };

    const pagedRows = result ? result.rows.slice((page - 1) * pageSize, page * pageSize) : [];

    if (!catalogLoading && (!catalog || catalog.length === 0)) {
        return (
            <div>
                <h1 className="text-3xl font-bold text-slate-800 mb-1">Reports</h1>
                <p className="text-slate-500 mb-6">Operational, financial, and compliance reporting</p>
                <Card><CardContent className="py-16 text-center text-slate-400">
                    <BarChart3 size={40} className="mx-auto mb-3 opacity-40" />
                    You don't have access to any reports yet. Ask an administrator to grant report access
                    from Administration → Roles &amp; Permissions.
                </CardContent></Card>
            </div>
        );
    }

    return (
        <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-1">Reports</h1>
            <p className="text-slate-500 mb-6">Operational, financial, and compliance reporting</p>

            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
                {/* Report picker */}
                <div className="bg-white rounded-md border">
                    <div className="p-3 border-b">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input className="pl-7 h-8 text-sm" placeholder="Search reports..."
                                value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto p-2">
                        {catalogLoading ? (
                            <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
                        ) : grouped.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-8">No reports match</p>
                        ) : grouped.map(({ category, reports }) => (
                            <div key={category} className="mb-3">
                                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    {category}
                                </p>
                                {reports.map((r) => (
                                    <button
                                        key={r.id}
                                        onClick={() => selectReport(r)}
                                        className={`w-full text-left px-2 py-2 rounded-md text-sm transition-colors ${selectedId === r.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                                            }`}
                                    >
                                        {r.title}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Report detail */}
                <div>
                    {!selected ? (
                        <Card><CardContent className="py-24 text-center text-slate-400">
                            <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
                            Select a report from the list to run it
                        </CardContent></Card>
                    ) : (
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-800">{selected.title}</h2>
                                    <p className="text-sm text-slate-500">{selected.description}</p>
                                </div>

                                {selected.filters.length > 0 && (
                                    <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
                                        {selected.filters.map((f) => (
                                            <div key={f.key} className="space-y-1.5">
                                                <Label className="text-xs">{f.label}</Label>
                                                {f.type === 'select' ? (
                                                    <select
                                                        className="border rounded-md h-9 px-3 text-sm min-w-[160px]"
                                                        value={filterValues[f.key] ?? ''}
                                                        onChange={(e) => setFilterValues({ ...filterValues, [f.key]: e.target.value })}
                                                    >
                                                        <option value="">All</option>
                                                        {optionsFor(f).map((o) => (
                                                            <option key={o.value} value={o.value}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <Input
                                                        type={f.type === 'date' ? 'date' : 'text'}
                                                        className="h-9 min-w-[140px]"
                                                        value={filterValues[f.key] ?? ''}
                                                        onChange={(e) => setFilterValues({ ...filterValues, [f.key]: e.target.value })}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                        <Button size="sm" onClick={() => runReport(selected.id, filterValues)} disabled={running}>
                                            <Play size={14} className="mr-1" />{running ? 'Running...' : 'Run Report'}
                                        </Button>
                                    </div>
                                )}

                                <div className="flex items-center justify-between pt-2 border-t">
                                    <p className="text-xs text-slate-500">
                                        {result ? `${result.rows.length} row${result.rows.length === 1 ? '' : 's'}` : ''}
                                    </p>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" disabled={!result || result.rows.length === 0 || !!exporting}
                                            onClick={() => handleExport('csv')}>
                                            <FileDown size={14} className="mr-1" />{exporting === 'csv' ? 'Exporting...' : 'CSV'}
                                        </Button>
                                        <Button variant="outline" size="sm" disabled={!result || result.rows.length === 0 || !!exporting}
                                            onClick={() => handleExport('xlsx')}>
                                            <FileSpreadsheet size={14} className="mr-1" />{exporting === 'xlsx' ? 'Exporting...' : 'Excel'}
                                        </Button>
                                        <Button variant="outline" size="sm" disabled={!result || result.rows.length === 0 || !!exporting}
                                            onClick={() => handleExport('pdf')}>
                                            <FileText size={14} className="mr-1" />{exporting === 'pdf' ? 'Exporting...' : 'PDF'}
                                        </Button>
                                    </div>
                                </div>

                                <div className="border rounded-md">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    {(result?.columns ?? []).map((c) => (
                                                        <TableHead key={c.key}>{c.label}</TableHead>
                                                    ))}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {running ? (
                                                    <TableRow><TableCell colSpan={result?.columns.length || 1} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                                                ) : !result || result.rows.length === 0 ? (
                                                    <TableRow><TableCell colSpan={result?.columns.length || 1} className="text-center py-8 text-slate-400">No data for the selected filters</TableCell></TableRow>
                                                ) : pagedRows.map((row, i) => (
                                                    <TableRow key={i}>
                                                        {result.columns.map((c) => (
                                                            <TableCell key={c.key} className="text-sm whitespace-nowrap">{row[c.key] ?? '-'}</TableCell>
                                                        ))}
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    {result && result.rows.length > 0 && (
                                        <Pagination
                                            page={page} pageSize={pageSize} total={result.rows.length}
                                            onPageChange={setPage}
                                            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                                        />
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
