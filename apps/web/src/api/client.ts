import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../context/AuthStore';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as typeof err.config & { _retry?: boolean };
    if (err.response?.status === 401 && !original?._retry) {
      original._retry = true;
      const { refreshToken, setAuth, clearAuth, user } = useAuthStore.getState();
      if (refreshToken && user) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
          setAuth(user, data.data.accessToken, data.data.refreshToken);
          original.headers!['Authorization'] = `Bearer ${data.data.accessToken}`;
          return api(original);
        } catch {
          clearAuth();
          window.location.href = '/login';
        }
      } else {
        clearAuth();
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
