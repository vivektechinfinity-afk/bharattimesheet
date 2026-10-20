import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const api = {
  login: (email, password) => client.post('/auth/login', { email, password }),
  validate: () => client.get('/auth/validate'),

  listTimesheets: (params) => client.get('/timesheets', { params }),
  getTimesheet: (id) => client.get(`/timesheets/${id}`),
  createTimesheet: (data) => client.post('/timesheets/create', data),
  updateTimesheet: (id, data) => client.put(`/timesheets/${id}`, data),
  deleteTimesheet: (id) => client.delete(`/timesheets/${id}`),
  bulkCreate: (rows) => client.post('/timesheets/bulk', { rows }),

  uploadDocument: (formData, onProgress) =>
    client.post('/timesheets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
    }),

  summaryReport: (params) => client.get('/reports/summary', { params }),
  dashboardStats: () => client.get('/reports/dashboard'),
  exportReport: (params) => client.get('/reports/export', { params, responseType: 'blob' }),

  listUsers: () => client.get('/users'),
  createUser: (data) => client.post('/users', data),
  updateUser: (id, data) => client.put(`/users/${id}`, data),
  deleteUser: (id) => client.delete(`/users/${id}`),

  pendingApprovals: () => client.get('/timesheets?status=Submitted'),
  approve: (id, comment) => client.put(`/timesheets/${id}`, { status: 'Approved', approverComment: comment }),
  reject: (id, comment) => client.put(`/timesheets/${id}`, { status: 'Rejected', approverComment: comment }),
};

export default client;
