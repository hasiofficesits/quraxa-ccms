import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MiniCalendarProps {
    /** 'YYYY-MM-DD' dates that get a small activity dot (e.g. days with a scheduled session). */
    markedDates?: Set<string>;
    /** 'YYYY-MM-DD' -> holiday name. Renders a tinted day with the name as a tooltip. */
    holidays?: Map<string, string>;
    /** Called when a day cell is clicked. */
    onSelectDate?: (date: string) => void;
    selectedDate?: string;
    /** Tighter cell size/spacing — for placing next to a shorter sibling (e.g. the Dashboard hero). */
    compact?: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toKey(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Self-contained month calendar — no date library needed. Highlights today,
// optionally marks days that have activity (a dot) or are public holidays,
// and reports clicks so the parent can filter other widgets by the selected day.
export default function MiniCalendar({ markedDates, holidays, onSelectDate, selectedDate, compact }: MiniCalendarProps) {
    const today = new Date();
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());

    const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: (number | null)[] = [
        ...Array(startWeekday).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };
    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); } else setViewMonth((m) => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); } else setViewMonth((m) => m + 1);
    };

    const cellSize = compact ? 'h-7 w-7' : 'h-8 w-8';

    return (
        <div>
            <div className={`flex items-center justify-between ${compact ? 'mb-2' : 'mb-3'}`}>
                <button
                    type="button"
                    onClick={goToday}
                    className="text-sm font-semibold text-slate-800 hover:text-slate-900"
                    title="Jump to today"
                >
                    {firstOfMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                </button>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={prevMonth}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Previous month">
                        <ChevronLeft size={16} />
                    </button>
                    <button type="button" onClick={nextMonth}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Next month">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <div className={`grid grid-cols-7 text-center ${compact ? 'gap-y-0.5' : 'gap-y-1'}`}>
                {WEEKDAYS.map((w) => (
                    <div key={w} className={`text-[11px] font-medium text-slate-400 ${compact ? 'py-0.5' : 'py-1'}`}>{w}</div>
                ))}
                {cells.map((day, i) => {
                    if (day === null) return <div key={`blank-${i}`} />;
                    const key = toKey(viewYear, viewMonth, day);
                    const isToday = key === todayKey;
                    const isSelected = key === selectedDate;
                    const isMarked = markedDates?.has(key);
                    const holidayName = holidays?.get(key);
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onSelectDate?.(key)}
                            title={holidayName}
                            className={`relative mx-auto flex ${cellSize} items-center justify-center rounded-full text-sm transition-colors ${isSelected ? 'bg-slate-900 text-white font-semibold' :
                                isToday ? 'bg-[var(--brand-accent)]/15 text-[var(--brand-primary)] font-semibold' :
                                    holidayName ? 'bg-rose-50 text-rose-600 font-medium hover:bg-rose-100' :
                                        'text-slate-700 hover:bg-slate-100'
                                }`}
                        >
                            {day}
                            {isMarked && !isSelected && (
                                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[var(--brand-accent)]" />
                            )}
                        </button>
                    );
                })}
            </div>

            {holidays && holidays.size > 0 && (
                <div className={`flex items-center gap-3 text-[11px] text-slate-400 ${compact ? 'mt-2' : 'mt-3'}`}>
                    <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-rose-100 border border-rose-300" />Holiday
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-accent)]" />Sessions
                    </span>
                </div>
            )}
        </div>
    );
}
