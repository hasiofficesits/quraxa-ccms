import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { refreshAccessToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ShieldAlert } from 'lucide-react';

// Idle-based session timeout — appropriate for medical data: the clock
// tracks time since the LAST activity, not time since login, so an
// actively-working doctor is never interrupted, but an unattended,
// logged-in workstation locks itself.
const WARNING_AT_MS = 14 * 60 * 1000; // show the countdown after 14 min idle
const COUNTDOWN_SECONDS = 60; // ...giving 60s to react before the 15-min mark
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

export default function IdleSessionManager() {
    const { user, logout } = useAuth();
    const [warningOpen, setWarningOpen] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

    const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const warningOpenRef = useRef(false);

    const clearTimers = () => {
        if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
    };

    const doLogout = useCallback(() => {
        clearTimers();
        logout('idle');
    }, [logout]);

    const startCountdown = useCallback(() => {
        setWarningOpen(true);
        warningOpenRef.current = true;
        setSecondsLeft(COUNTDOWN_SECONDS);
        countdownRef.current = setInterval(() => {
            setSecondsLeft((s) => {
                if (s <= 1) {
                    doLogout();
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
    }, [doLogout]);

    const resetIdleTimer = useCallback(() => {
        // Once the warning is showing, only an explicit "Stay logged in"
        // click should reset things — background mouse jiggle shouldn't
        // silently dismiss a security prompt.
        if (warningOpenRef.current) return;
        if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
        warnTimerRef.current = setTimeout(startCountdown, WARNING_AT_MS);
    }, [startCountdown]);

    const handleStayLoggedIn = async () => {
        clearTimers();
        setWarningOpen(false);
        warningOpenRef.current = false;
        const token = await refreshAccessToken();
        if (!token) {
            doLogout();
            return;
        }
        resetIdleTimer();
    };

    useEffect(() => {
        if (!user) {
            clearTimers();
            return;
        }

        resetIdleTimer();
        const onActivity = () => resetIdleTimer();
        ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }));

        return () => {
            clearTimers();
            ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    if (!user) return null;

    return (
        <Dialog open={warningOpen} onOpenChange={(open) => { if (!open) handleStayLoggedIn(); }}>
            <DialogContent className="sm:max-w-md" showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldAlert size={18} className="text-amber-600" />You've been idle
                    </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-slate-600">
                    For security, you'll be signed out in <span className="font-semibold tabular-nums">{secondsLeft}s</span> due
                    to inactivity. Stay logged in?
                </p>
                <DialogFooter>
                    <Button variant="outline" onClick={doLogout}>Log Out Now</Button>
                    <Button onClick={handleStayLoggedIn}>Stay Logged In</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
