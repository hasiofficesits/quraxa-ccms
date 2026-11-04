import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
    baseURL: BASE_URL,
    // Sends the httpOnly refresh-token cookie on requests to /auth/* —
    // required for silent refresh and logout to work.
    withCredentials: true,
});

// Request interceptor: attach the JWT from localStorage to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

function redirectToLogin(reason?: string) {
    if (window.location.pathname === '/login') return;
    window.location.href = reason ? `/login?reason=${reason}` : '/login';
}

// Trades the httpOnly refresh cookie for a new access token. Shared by the
// 401 retry below and by the idle-timeout warning modal's "Stay logged in"
// button — both funnel through the same in-flight promise so concurrent
// callers never fire two refreshes at once.
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
    if (!refreshPromise) {
        refreshPromise = axios
            .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
            .then((res) => {
                const { access_token, user } = res.data;
                localStorage.setItem('token', access_token);
                localStorage.setItem('user', JSON.stringify(user));
                // Lets AuthContext's React state pick up the refreshed
                // permissions/must_change_password without a full reload.
                window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: user }));
                return access_token as string;
            })
            .catch(() => null)
            .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
}

// Response interceptor: on a 401 from an expired access token, try one
// silent refresh and retry the request. Only logs the user out (and only
// then, loudly) if the refresh itself fails — e.g. the refresh token was
// revoked or its 7-day life ran out.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config;
        const isAuthRoute = typeof original?.url === 'string' && original.url.includes('/auth/');

        if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
            original._retry = true;
            const newToken = await refreshAccessToken();
            if (newToken) {
                original.headers = original.headers ?? {};
                original.headers.Authorization = `Bearer ${newToken}`;
                return api(original);
            }
            clearSession();
            redirectToLogin();
        }

        if (error.response?.status === 401 && isAuthRoute) {
            clearSession();
        }

        return Promise.reject(error);
    },
);
