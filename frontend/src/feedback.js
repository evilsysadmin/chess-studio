import { authHeader } from './auth.js';
import { request, requestJson } from './http.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function assertOk(response) {
  if (response.ok) return response;
  let detail = `HTTP ${response.status}`;
  try { detail = (await response.json())?.detail || detail; } catch { /* binary/non-json error */ }
  throw new Error(detail);
}

function feedbackPost(path, payload, { signal } = {}) {
  return requestJson(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
    signal,
  });
}

export function submitFeedback({ category = 'general', message, context = 'Home', attachments = [], signal } = {}) {
  return feedbackPost('/feedback', { category, message, context, attachments }, { signal });
}

export function fetchMyFeedback({ signal } = {}) {
  return requestJson(`${BASE_URL}/feedback/mine`, { headers: { ...authHeader() }, signal });
}

export async function deleteMyFeedback(feedbackId) {
  const response = await request(`${BASE_URL}/feedback/${encodeURIComponent(feedbackId)}`, {
    method: 'DELETE',
    headers: { ...authHeader() },
  });
  await assertOk(response);
  return true;
}

export function fetchAdminFeedback() {
  return requestJson(`${BASE_URL}/admin/feedback`, { headers: { ...authHeader() } });
}

export function fetchAdminFeedbackSummary({ signal } = {}) {
  return requestJson(`${BASE_URL}/admin/feedback/summary`, { headers: { ...authHeader() }, signal });
}

export function updateAdminFeedbackStatus(feedbackId, status) {
  return feedbackPost(`/admin/feedback/${encodeURIComponent(feedbackId)}/status`, { status });
}

export async function deleteAdminFeedback(feedbackId) {
  const response = await request(`${BASE_URL}/admin/feedback/${encodeURIComponent(feedbackId)}`, {
    method: 'DELETE',
    headers: { ...authHeader() },
  });
  await assertOk(response);
  return true;
}

export function replyAdminFeedback(feedbackId, message, resolve = true) {
  return feedbackPost(`/admin/feedback/${encodeURIComponent(feedbackId)}/reply`, { message, resolve });
}

export async function fetchAdminFeedbackAttachment(feedbackId, attachmentIndex, { signal } = {}) {
  const response = await request(`${BASE_URL}/admin/feedback/${encodeURIComponent(feedbackId)}/attachments/${Number(attachmentIndex)}`, {
    headers: { ...authHeader() },
    signal,
  });
  await assertOk(response);
  return response.blob();
}
