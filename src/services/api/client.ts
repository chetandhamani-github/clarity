import { Platform } from 'react-native';

export class ApiError extends Error {
  public status: number;
  public data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10000;

// Resolve default base URL based on platform if environment variable is not provided
function getDefaultBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  // Android emulator routes host machine loopback to 10.0.2.2
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8080';
  }
  return 'http://localhost:8080';
}

// Dynamically resolve fetch implementation (nitro-fetch on native, global fetch fallback)
function getFetchImplementation(): typeof fetch {
  try {
    const nitro = require('react-native-nitro-fetch');
    if (nitro && typeof nitro.fetch === 'function') {
      return nitro.fetch;
    }
  } catch {
    // Native nitro-fetch not available in test or fallback environment
  }
  return globalThis.fetch;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getDefaultBaseUrl();
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private logRequest(method: string, url: string, body?: unknown) {
    if (__DEV__) {
      console.log(`🌐 [API Request] ${method} ${url}`, body ?? '');
    }
  }

  private logResponse(method: string, url: string, status: number, data?: unknown) {
    if (__DEV__) {
      console.log(`✅ [API Response] ${method} ${url} [${status}]`, data ?? '');
    }
  }

  private logError(method: string, url: string, error: unknown) {
    if (__DEV__) {
      console.warn(`❌ [API Error] ${method} ${url}:`, error);
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    this.logRequest(method, url, body);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    const fetchFunc = getFetchImplementation();

    try {
      const response = await fetchFunc(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let parsedData: unknown = null;
      if (responseText && responseText.trim().length > 0) {
        try {
          parsedData = JSON.parse(responseText);
        } catch {
          parsedData = responseText;
        }
      }

      this.logResponse(method, url, response.status, parsedData);

      if (!response.ok) {
        const errorMessage =
          typeof parsedData === 'object' && parsedData !== null && 'message' in parsedData
            ? String((parsedData as Record<string, unknown>).message)
            : `Request failed with status ${response.status}`;
        throw new ApiError(errorMessage, response.status, parsedData);
      }

      return parsedData as T;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      this.logError(method, url, err);

      if (err instanceof ApiError) {
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(`Request timeout after ${timeoutMs}ms`, 408);
      }

      const fallbackMessage = err instanceof Error ? err.message : 'Network request failed';
      throw new ApiError(fallbackMessage, 0, err);
    }
  }

  public async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', endpoint, undefined, options);
  }

  public async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', endpoint, body, options);
  }
}

export const apiClient = new ApiClient();
