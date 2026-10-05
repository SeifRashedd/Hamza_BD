export class ApiError extends Error {
  constructor(message, { status, errors = {} } = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch {
    throw new ApiError('Can’t reach the server. Check your connection and try again.', { status: 0 });
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.message || 'Something went wrong. Please try again.', {
      status: response.status,
      errors: data.errors,
    });
  }

  return data;
}

export const api = {
  listEnvelopes: () => request('/api/envelopes').then((data) => data.envelopes),

  getHint: (id) => request(`/api/envelopes/${id}`).then((data) => data.envelope.hint),

  unlock: (id, password) =>
    request(`/api/messages/${id}/unlock`, { method: 'POST', body: JSON.stringify({ password }) }).then(
      (data) => data.message,
    ),

  submit: (payload) => request('/api/messages', { method: 'POST', body: JSON.stringify(payload) }),
};
