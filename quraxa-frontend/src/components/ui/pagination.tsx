import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    pageSizeOptions?: number[];
}

export function Pagination({
    page, pageSize, total, onPageChange, onPageSizeChange,
    pageSizeOptions = [5, 10, 25, 50],
}: PaginationProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);

    return (
        <div className="flex items-center justify-between gap-4 px-2 py-3 text-sm text-slate-500">
            <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <select
                    className="border rounded-md h-8 px-2 text-sm"
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                >
                    {pageSizeOptions.map((n) => (
                        <option key={n} value={n}>{n}</option>
                    ))}
                </select>
            </div>

            <div className="flex items-center gap-3">
                <span>{from}-{to} of {total}</span>
                <div className="flex items-center gap-1">
                    <Button
                        variant="outline" size="icon-sm"
                        disabled={page <= 1}
                        onClick={() => onPageChange(page - 1)}
                    >
                        <ChevronLeft size={14} />
                    </Button>
                    <span className="px-2">Page {page} of {totalPages}</span>
                    <Button
                        variant="outline" size="icon-sm"
                        disabled={page >= totalPages}
                        onClick={() => onPageChange(page + 1)}
                    >
                        <ChevronRight size={14} />
                    </Button>
                </div>
            </div>
        </div>
    );
}
