import { authHeader } from './auth.js';
import { requestJson } from './http.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function submitFeedback({ category = 'other', message, context = 'Home' }) {
  return requestJson(`${BASE_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ category, message, context }),
  });
}

export function fetchAdminFeedback() {
  return requestJson(`${BASE_URL}/admin/feedback`, { headers: { ...authHeader() } });
}

export function updateAdminFeedbackStatus(feedbackId, status) {
  return requestJson(`${BASE_URL}/admin/feedback/${encodeURIComponent(feedbackId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ status }),
  });
}
