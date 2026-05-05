export const BASE_URL = import.meta.env.VITE_API_URL || 'https://scheduler-backend-iu05.onrender.com';

export const getAuthToken = () => localStorage.getItem('token');
export const setAuthToken = (token) => localStorage.setItem('token', token);
export const removeAuthToken = () => localStorage.removeItem('token');

export const getUserContext = () => {
    const name = localStorage.getItem('user_name');
    const email = localStorage.getItem('user_email');
    if (!name || !email) return null;
    return { name, email };
};

export const fetchWithAuth = async (endpoint, options = {}) => {
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            ...options,
            headers,
        });

        if (response.status === 401) {
            removeAuthToken();
            window.location.href = '/login';
        }

        return response;
    } catch (error) {
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            throw new Error('Server is waking up (may take up to 60s). Please wait and try again.');
        }
        throw error;
    }
};

export const wakeupServer = () => {
    fetch(`${BASE_URL}/ping`).catch(() => {});
};
