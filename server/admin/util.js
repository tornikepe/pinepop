import { HttpError } from '../http.js';

export const tetri = (gel) => Math.round(Number(gel) * 100);
export const gel = (t) => (t == null ? null : t / 100);

export function int(value, { min = -Infinity, max = Infinity, label = 'რიცხვი' } = {}) {
  const v = Number(value);
  if (!Number.isInteger(v) || v < min || v > max) throw new HttpError(400, `${label}: მთელი რიცხვი${Number.isFinite(min) ? ` ${min}-დან` : ''}`);
  return v;
}

export function money(value, { min = 0, max = 100000, label = 'თანხა' } = {}) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < min || v > max) throw new HttpError(400, `${label}: ${min}–${max} ₾`);
  return tetri(v);
}

// ?page=2&limit=50 → { limit, offset, page }
export function paging(query, { limit = 50, max = 200 } = {}) {
  const l = Math.min(max, Math.max(1, Number(query.limit) || limit));
  const page = Math.max(1, Number(query.page) || 1);
  return { limit: l, offset: (page - 1) * l, page };
}

// Excel opens UTF-8 CSV correctly only with a BOM.
export function sendCsv(res, filename, header, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`﻿${csv}`);
}

export const dayRange = (days) => Math.min(365, Math.max(1, Number(days) || 30));
