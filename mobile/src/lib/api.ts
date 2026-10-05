import type { GearItem, Rental, Stats } from '../types';

const API_CANDIDATES = [
  process.env.EXPO_PUBLIC_API_BASE_URL,
  'https://rentals.jd2012.work',
  'https://kids-rentals-api.codingjoe14.workers.dev',
].filter(Boolean) as string[];

let apiBase = API_CANDIDATES[0];
let authToken = '';

export function setAuthToken(token: string) {
  authToken = token.trim();
}

async function probe(base: string) {
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/health`);
    return res.status === 200 || res.status === 401;
  } catch {
    return false;
  }
}

export async function detectApiBase() {
  for (const candidate of API_CANDIDATES) {
    const normalized = candidate.replace(/\/$/, '');
    if (await probe(normalized)) {
      apiBase = normalized;
      return normalized;
    }
  }
  throw new Error('Rental backend is unreachable.');
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  if (!apiBase) await detectApiBase();

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${apiBase}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function verifyPin(pin: string) {
  await detectApiBase();
  setAuthToken(pin);
  await request<{ ok: true }>('/api/health');
  return true;
}

export async function getStats(): Promise<Stats> {
  return request('/api/stats');
}

export async function ensureRental(passId: string): Promise<Rental> {
  const result = await request<{ rental: Rental }>('/api/rentals/ensureOpen', { passId });
  return result.rental;
}

export async function addGear(rentalId: string, passId: string, gearId: string) {
  return request<{ ok: true; note?: string; inventory?: Record<string, unknown> | null }>('/api/items/add', {
    rentalId,
    passId,
    gearId,
  });
}

export async function returnScan(code: string) {
  return request<
    | { kind: 'gear'; message: string }
    | { kind: 'pass'; passId: string; items: Array<Record<string, unknown>> }
    | { kind: 'none'; message: string }
  >('/api/return/scan', { code });
}

export async function returnAllForPass(passId: string) {
  return request<{ ok: true; returned: number }>('/api/return/pass', { passId });
}

export async function lookupGear(barcode: string): Promise<GearItem> {
  const result = await request<{
    item: null | { gearId: string; gearType?: string; passId?: string; rentalId?: string; outTime?: string };
    inventory: null | { gearId: string; gearType?: string; size?: string; status?: string; endOfLifeDate?: string };
  }>('/api/lookup/gear', { gearId: barcode });

  if (result.item) {
    return {
      barcode: result.item.gearId,
      type: result.item.gearType,
      status: 'OUT',
      passId: result.item.passId,
      rentalId: result.item.rentalId,
      outTime: result.item.outTime,
    };
  }

  return {
    barcode,
    type: result.inventory?.gearType,
    size: result.inventory?.size,
    status: result.inventory?.status || 'AVAILABLE',
    endOfLifeDate: result.inventory?.endOfLifeDate,
  };
}
