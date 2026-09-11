/* Everything the browser knows about the server lives here. */

/*
 * Where the API lives.
 *
 * Empty in development: Vite proxies /api and /files to localhost:8787, so the
 * browser stays same-origin. In production the frontend (Vercel) and the API
 * (a host that can run a persistent process) are different origins, so this is
 * set at build time to the API's base URL.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

/*
 * Media paths come back from the API relative ("/files/abc.mp4"). Same-origin
 * in dev, but on Vercel they must be resolved against the API, not against the
 * static site — otherwise every video and image 404s in production.
 */
export const asset = (url: string) => (/^https?:\/\//.test(url) ? url : API_BASE + url);

export type Kind = 'video' | 'image' | 'audio';
export type Status = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface User {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  plan: string;
  credits: number;
  createdAt: string;
}

export interface Model {
  id: string;
  label: string;
  kind: Kind;
  provider: string;
  cost: number;
  badge: string | null;
  blurb: string;
  simulated: boolean;
  available: boolean;
  reason: string | null;
}

export interface Generation {
  id: string;
  kind: Kind;
  prompt: string;
  model: string;
  provider: string;
  status: Status;
  params: Record<string, unknown>;
  creditsCost: number;
  simulated: boolean;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  published: boolean;
  publishedAt: string | null;
  title: string | null;
  originalPrompt: string | null;
}

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  credits: number;
  monthly: number;
  annual: number;
  was: number | null;
  discount?: string;
  badge?: string;
  cta: string;
  style: 'plain' | 'accent' | 'hot';
  note: string;
  highlights: string[];
  unlimited: { name: string; included: boolean; tag?: string }[];
}

export interface CommunityPost {
  id: string;
  kind: Kind;
  prompt: string;
  title: string | null;
  model: string;
  simulated: boolean;
  outputUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  author: { handle: string; displayName: string };
  likes: number;
  likedByMe: boolean;
  mine: boolean;
}

export interface Catalog {
  models: Model[];
  voices: { id: string; name: string; description: string }[];
  aspectRatios: string[];
  costs: Record<Kind, number>;
  plans: Plan[];
  providerStatus: { gemini: boolean; simulator: boolean; enhancer: boolean };
}

/* The API's error shape is uniform, so surface its message rather than a generic one. */
export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TOKEN_KEY = '8xbuildai.token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: session lasts the tab, which is acceptable */
  }
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  let response: Response;

  try {
    response = await fetch(API_BASE + path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Is the API running on port 8787?');
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = body?.error ?? {};
    throw new ApiError(response.status, err.code ?? 'UNKNOWN', err.message ?? 'Request failed.', err);
  }
  return body as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),

  signup: (email: string, password: string, displayName: string) =>
    request<{ token: string; user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: User; stats: { total: number; completed: number } }>('/api/me'),

  catalog: (kind?: Kind) => request<Catalog>(`/api/catalog${kind ? `?kind=${kind}` : ''}`),

  createGeneration: (payload: Record<string, unknown>) =>
    request<{ generation: Generation; credits: number }>('/api/generations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listGenerations: (kind?: Kind) =>
    request<{ generations: Generation[] }>(`/api/generations${kind ? `?kind=${kind}` : ''}`),

  getGeneration: (id: string) =>
    request<{ generation: Generation; credits: number }>(`/api/generations/${id}`),

  deleteGeneration: (id: string) =>
    request<{ ok: true }>(`/api/generations/${id}`, { method: 'DELETE' }),

  /* Rewrites a prompt with Azure OpenAI. Slow enough to need its own spinner. */
  enhance: (kind: Kind, prompt: string) =>
    request<{ original: string; enhanced: string; model: string }>('/api/enhance', {
      method: 'POST',
      body: JSON.stringify({ kind, prompt }),
    }),

  publish: (id: string, published: boolean, title?: string) =>
    request<{ generation: Generation }>(`/api/generations/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ published, title }),
    }),

  community: (kind?: 'video' | 'image', sort: 'new' | 'top' = 'new') =>
    request<{ posts: CommunityPost[] }>(
      `/api/community?sort=${sort}${kind ? `&kind=${kind}` : ''}`
    ),

  like: (id: string) =>
    request<{ likes: number; likedByMe: boolean }>(`/api/community/${id}/like`, {
      method: 'POST',
    }),
};
