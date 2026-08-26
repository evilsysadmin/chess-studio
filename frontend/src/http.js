import { withRequestId, requestErrorMessage } from './requestId.js';
import { userFacingError } from './userFacingError.js';

export async function request(url, options = {}) {
  const { headers = {}, ...rest } = options;
  try {
    return await fetch(url, { ...rest, headers: withRequestId(headers) });
  } catch (cause) {
    const error = new Error(userFacingError(cause));
    error.cause = cause;
    throw error;
  }
}

async function parseJsonResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const { message, requestId } = requestErrorMessage(response, body);
    const error = new Error(message);
    error.status = response.status;
    error.requestId = requestId;
    error.body = body;
    error.technicalMessage = message;
    error.message = userFacingError(error, message);
    throw error;
  }
  return body;
}

export async function requestJson(url, options = {}) {
  return parseJsonResponse(await request(url, options));
}
