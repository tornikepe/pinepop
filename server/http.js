// Small shared helpers for the API.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

// Georgian mobile numbers: 9 digits starting with 5, optional +995 prefix.
export function normalizePhone(value) {
  const digits = String(value || '').replace(/[\s\-().]/g, '').replace(/^\+?995/, '');
  return /^5\d{8}$/.test(digits) ? `+995${digits}` : null;
}

// In-memory limiter: returns a function that says whether `key` is still under the limit.
export function rateLimiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length <= limit;
  };
}
