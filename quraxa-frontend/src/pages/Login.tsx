import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import loginImage from '@/assets/login-image.png';
import logoWhite from '@/assets/logo-white.png';
import logoLight from '@/assets/logo-light.png';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

declare global {
    interface Window {
        google?: any;
    }
}

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { user, login, loginWithGoogle } = useAuth();
    const navigate = useNavigate();
    const googleBtnRef = useRef<HTMLDivElement>(null);

    // Idle-timeout redirects to /login?reason=idle — surface why they landed here.
    useEffect(() => {
        const reason = new URLSearchParams(window.location.search).get('reason');
        if (reason === 'idle') {
            toast.info("You've been signed out due to inactivity");
        }
    }, []);

    // A still-valid session (token survived in localStorage — e.g. the
    // browser reopened on a bookmarked/restored /login tab) shouldn't be
    // forced through the login form again.
    if (user) {
        return <Navigate to="/" replace />;
    }

    const handleSubmit = async () => {
        if (!username || !password) {
            toast.error('Please enter username and password');
            return;
        }
        setLoading(true);
        try {
            await login(username, password);
            toast.success('Welcome back!');
            navigate('/');
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    // Load the Google Identity Services button. Only renders when a client
    // ID is configured (VITE_GOOGLE_CLIENT_ID) — otherwise the whole
    // "or continue with" block stays hidden.
    useEffect(() => {
        if (!GOOGLE_CLIENT_ID) return;

        const handleCredential = async (response: { credential: string }) => {
            setLoading(true);
            try {
                await loginWithGoogle(response.credential);
                toast.success('Welcome back!');
                navigate('/');
            } catch (err: any) {
                toast.error(err.response?.data?.message ?? 'Google sign-in failed');
            } finally {
                setLoading(false);
            }
        };

        const initialize = () => {
            if (!window.google || !googleBtnRef.current) return;
            const width = Math.min(360, googleBtnRef.current.offsetWidth || 320);
            window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleCredential,
            });
            window.google.accounts.id.renderButton(googleBtnRef.current, {
                type: 'standard', theme: 'outline', size: 'large', shape: 'pill', width,
            });
        };

        if (window.google) {
            initialize();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = initialize;
        document.body.appendChild(script);
        return () => { script.onload = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted p-4 sm:p-6">
            <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 rounded-3xl overflow-hidden shadow-2xl bg-card">
                {/* Left: brand panel — hidden on small screens */}
                <div className="relative hidden md:flex md:min-h-[640px] flex-col justify-between overflow-hidden bg-gradient-to-br from-[var(--brand-primary)] via-[var(--brand-primary)] to-[var(--brand-secondary)] p-12">
                    <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10" />
                    <div className="pointer-events-none absolute bottom-24 -left-12 h-40 w-40 rounded-full bg-[var(--brand-accent)]/20" />

                    <img src={logoWhite} alt="QuraXa" className="relative z-10 h-7 w-auto object-contain object-left" />

                    <div className="relative z-10 flex flex-1 items-end justify-center">
                        <img
                            src={loginImage}
                            alt="Healthcare professional"
                            className="max-h-100 w-auto object-contain"
                        />
                    </div>

                    <div className="relative z-10">
                        <h2 className="text-lg font-semibold leading-snug !text-white">
                            Channeling Center Management,<br />simplified.
                        </h2>
                        <p className="mt-4 text-xs text-white/70">
                            © {new Date().getFullYear()} Synthara Solutions. All rights reserved.
                        </p>
                    </div>
                </div>

                {/* Right: sign-in form */}
                <div className="flex flex-col justify-center px-6 py-10 sm:px-10 md:px-14 md:min-h-[640px]">
                    <div className="mb-6 flex justify-center md:hidden">
                        <img src={logoLight} alt="QuraXa" className="h-7 w-auto object-contain" />
                    </div>

                    <h1 className="text-2xl font-bold text-foreground">Sign In</h1>
                    <p className="mt-1 mb-8 text-sm text-muted-foreground">
                        Enter your credentials to access your account
                    </p>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <div className="relative">
                                <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="username"
                                    className="h-11 pl-9"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                    placeholder="admin"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative">
                                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    className="h-11 pl-9 pr-10"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <Button className="h-11 w-full !text-white" onClick={handleSubmit} disabled={loading}>
                            {loading ? 'Signing in...' : 'Sign In'}
                        </Button>

                        {GOOGLE_CLIENT_ID && (
                            <>
                                <div className="flex items-center gap-3 py-1">
                                    <div className="h-px flex-1 bg-border" />
                                    <span className="text-xs text-muted-foreground">or continue with</span>
                                    <div className="h-px flex-1 bg-border" />
                                </div>
                                <div ref={googleBtnRef} className="flex justify-center" />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
