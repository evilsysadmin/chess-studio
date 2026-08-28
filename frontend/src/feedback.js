import { authHeader } from './auth.js';
import { request, requestJson } from './http.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function submitFeedback({ category = 'general', message, context = 'Home', attachments = [], signal } = {}) {
  return requestJson(`${BASE_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ category, message, context, attachments }),
    signal,
  });
}

export function fetchMyFeedback({ signal } = {}) {
  return requestJson(`${BASE_URL}/feedback/mine`, { headers: { ...authHeader() }, signal });
}

export function fetchAdminFeedback() {
  return requestJson(`${BASE_URL}/admin/feedback`, { headers: { ...authHeader() } });
}

export function fetchAdminFeedbackSummary({ signal } = {}) {
  return requestJson(`${BASE_URL}/admin/feedback/summary`, { headers: { ...authHeader() }, signal });
}

export function updateAdminFeedbackStatus(feedbackId, status) {
  return requestJson(`${BASE_URL}/admin/feedback/${encodeURIComponent(feedbackId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ status }),
  });
}

export async function deleteAdminFeedback(feedbackId) {
  const response = await request(`${BASE_URL}/admin/feedback/${encodeURIComponent(feedbackId)}`, {
    method: 'DELETE',
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try { detail = (await response.json())?.detail || detail; } catch { /* 204/binary-safe */ }
    throw new Error(detail);
  }
  return true;
}

export function replyAdminFeedback(feedbackId, message, resolve = true) {
  return requestJson(`${BASE_URL}/admin/feedback/${encodeURIComponent(feedbackId)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ message, resolve }),
  });
}

export async function fetchAdminFeedbackAttachment(feedbackId, attachmentIndex, { signal } = {}) {
  const response = await request(`${BASE_URL}/admin/feedback/${encodeURIComponent(feedbackId)}/attachments/${Number(attachmentIndex)}`, {
    headers: { ...authHeader() },
    signal,
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try { detail = (await response.json())?.detail || detail; } catch { /* binary/non-json error */ }
    throw new Error(detail);
  }
  return response.blob();
}
