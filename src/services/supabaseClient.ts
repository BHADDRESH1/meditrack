// ==============================================================================
// MEDiTRACK: Supabase Client Adapter & Remote Data Integration (Phase 5.5)
// Connects to PostgreSQL PostgREST API, Supabase Auth, and stored procedures.
// Enforces explicit data modes (SUPABASE vs DEMO) without silent fallback masking.
// ==============================================================================

export type DataMode = 'SUPABASE' | 'DEMO';

const DATA_MODE_STORAGE_KEY = 'meditrack_data_mode';
const SUPABASE_AUTH_TOKEN_KEY = 'meditrack_supabase_token';
const SUPABASE_AUTH_REFRESH_KEY = 'meditrack_supabase_refresh_token';

export const isSupabaseConfigured = (): boolean => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key && url !== 'https://your-project.supabase.co');
};

export const getSupabaseConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  return {
    url,
    publishableKey: key,
    isConfigured: isSupabaseConfigured(),
  };
};

let inMemoryDataMode: DataMode | null = null;
let inMemoryToken: string | null = null;
let inMemoryRefreshToken: string | null = null;

// --- DATA MODE MANAGEMENT ---
export const getDataMode = (): DataMode => {
  if (inMemoryDataMode) {
    return inMemoryDataMode;
  }
  if (!isSupabaseConfigured()) {
    return 'DEMO';
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(DATA_MODE_STORAGE_KEY);
      if (saved === 'DEMO' || saved === 'SUPABASE') {
        return saved;
      }
    }
  } catch {}

  // In test runner (Vitest), default to DEMO unless explicitly set, ensuring existing test suite stability.
  // In browser runtime (development/production), default to SUPABASE connected mode.
  if (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || import.meta.env?.MODE === 'test')) {
    return 'DEMO';
  }

  return 'SUPABASE';
};

type ModeChangeListener = (mode: DataMode) => void;
const modeChangeListeners = new Set<ModeChangeListener>();

export const onDataModeChange = (listener: ModeChangeListener): (() => void) => {
  modeChangeListeners.add(listener);
  return () => {
    modeChangeListeners.delete(listener);
  };
};

export const setDataMode = (mode: DataMode): void => {
  inMemoryDataMode = mode;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DATA_MODE_STORAGE_KEY, mode);
    }
  } catch {}
  modeChangeListeners.forEach(fn => {
    try {
      fn(mode);
    } catch {}
  });
};

export const getSupabaseAccessToken = (): string | null => {
  if (inMemoryToken) return inMemoryToken;
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(SUPABASE_AUTH_TOKEN_KEY);
    }
  } catch {}
  return null;
};

export const getSupabaseRefreshToken = (): string | null => {
  if (inMemoryRefreshToken) return inMemoryRefreshToken;
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(SUPABASE_AUTH_REFRESH_KEY);
    }
  } catch {}
  return null;
};

export const setSupabaseSession = (accessToken: string | null, refreshToken?: string | null): void => {
  inMemoryToken = accessToken;
  inMemoryRefreshToken = refreshToken || null;
  try {
    if (typeof localStorage !== 'undefined') {
      if (accessToken) {
        localStorage.setItem(SUPABASE_AUTH_TOKEN_KEY, accessToken);
      } else {
        localStorage.removeItem(SUPABASE_AUTH_TOKEN_KEY);
      }
      if (refreshToken) {
        localStorage.setItem(SUPABASE_AUTH_REFRESH_KEY, refreshToken);
      } else {
        localStorage.removeItem(SUPABASE_AUTH_REFRESH_KEY);
      }
    }
  } catch {}
};

export const clearSupabaseSession = (): void => {
  inMemoryToken = null;
  inMemoryRefreshToken = null;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SUPABASE_AUTH_TOKEN_KEY);
      localStorage.removeItem(SUPABASE_AUTH_REFRESH_KEY);
    }
  } catch {}
};

// --- SYSTEM REACHABILITY CHECK ---
export const verifySupabaseConnection = async (): Promise<{
  reachable: boolean;
  status: number | string;
  url: string;
  error?: string;
}> => {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    return {
      reachable: false,
      status: 'NOT_CONFIGURED',
      url: config.url,
      error: 'Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY) are not configured.',
    };
  }

  try {
    const res = await fetch(`${config.url}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: config.publishableKey,
      },
    });

    if (res.ok || res.status < 500) {
      return {
        reachable: true,
        status: res.status,
        url: config.url,
      };
    }

    return {
      reachable: false,
      status: res.status,
      url: config.url,
      error: `Supabase returned HTTP ${res.status}: ${res.statusText}`,
    };
  } catch (err) {
    return {
      reachable: false,
      status: 'NETWORK_ERROR',
      url: config.url,
      error: err instanceof Error ? err.message : 'Unknown network failure connecting to Supabase',
    };
  }
};

// --- STANDARDIZED REST INTERACTION ---
export interface SupabaseResponse<T> {
  data: T | null;
  error: string | null;
  errorCode?: string;
  status: number;
  count?: number;
}

export const supabaseRest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<SupabaseResponse<T>> => {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    return {
      data: null,
      error: 'Supabase is not configured with valid credentials.',
      errorCode: 'NOT_CONFIGURED',
      status: 0,
    };
  }

  const token = getSupabaseAccessToken();
  const headers: Record<string, string> = {
    apikey: config.publishableKey,
    Authorization: `Bearer ${token || config.publishableKey}`,
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const targetUrl = `${config.url}/rest/v1/${cleanEndpoint}`;

  try {
    const res = await fetch(targetUrl, {
      ...options,
      headers,
    });

    let count: number | undefined;
    const contentRange = res.headers.get('content-range');
    if (contentRange) {
      const parts = contentRange.split('/');
      if (parts[1] && parts[1] !== '*') {
        count = parseInt(parts[1], 10);
      }
    }

    const text = await res.text();
    let json: any = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }

    if (!res.ok) {
      const errorMessage = json?.message || json?.msg || json?.error_description || text || `HTTP ${res.status}`;
      const errorCode = json?.code || (res.status === 401 || res.status === 403 ? 'UNAUTHORIZED' : 'DATABASE_ERROR');
      return {
        data: null,
        error: errorMessage,
        errorCode,
        status: res.status,
      };
    }

    return {
      data: json as T,
      error: null,
      status: res.status,
      count,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Network failure communicating with Supabase',
      errorCode: 'NETWORK_ERROR',
      status: 0,
    };
  }
};

// --- AUTHORITATIVE STORED PROCEDURE (RPC) EXECUTION ---
export const supabaseRpc = async <T>(
  rpcName: string,
  params: Record<string, any> = {}
): Promise<SupabaseResponse<T>> => {
  return supabaseRest<T>(`rpc/${rpcName}`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
};

/**
 * Sanitizes raw Supabase or PostgreSQL error details to protect against leaking
 * credentials, tokens, schema internals, raw SQL, or stack traces to end-users.
 */
export const sanitizeSupabaseError = (
  rawError: unknown,
  fallbackMessage: string = 'Unable to load live inventory data.'
): string => {
  if (!rawError) return fallbackMessage;

  const errStr = typeof rawError === 'string'
    ? rawError
    : (rawError as any)?.message || String(rawError);

  // Identify sensitive tokens, credentials, or internal query fragments
  const sensitivePatterns = [
    /bearer\s+[a-z0-9._-]+/i,
    /apikey[:=\s]+[a-z0-9._-]+/i,
    /token[:=\s]+[a-z0-9._-]+/i,
    /password[:=\s]+[^\s&]+/i,
    /https?:\/\/[^\s]+/i,
    /postgres(?:ql)?:\/\/[^\s]+/i,
    /:[^/@\s]+@[^\s]+/i,
    /\b(select|insert|update|delete|from|where|join|pg_|postgrest)\b/i,
    /42501|42P01|P0001|23505/i,
    /\bat\s+.+\(.*:\d+:\d+\)/,
    /stack\s*trace/i,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(errStr)) {
      if (errStr.includes('INSUFFICIENT_STOCK')) {
        return 'Insufficient inventory stock to complete this transaction.';
      }
      if (errStr.includes('permission denied') || errStr.includes('42501')) {
        return 'Access denied: Insufficient permissions for live database resource.';
      }
      return fallbackMessage;
    }
  }

  // If short and safe (no code/stack/tokens), return clean message
  if (errStr.length < 120 && !errStr.includes('\n')) {
    return errStr;
  }

  return fallbackMessage;
};

