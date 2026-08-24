import { withRequestId, requestErrorMessage } from './requestId.js';

export async function request(url, options = {}) {
  const { headers = {}, ...rest } = options;
  return fetch(url, { ...rest, headers: withRequestId(headers) });
}

async function parseJsonResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const { message, requestId } = requestErrorMessage(response, body);
    const error = new Error(message);
    error.status = response.status;
    error.requestId = requestId;
    throw error;
  }
  return body;
}

export async function requestJson(url, options = {}) {
  return parseJsonResponse(await request(url, options));
}
