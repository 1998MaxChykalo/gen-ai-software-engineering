const TOKEN_KEY = "horizon.accessToken";

/**
 * Thin wrapper around localStorage for the bearer JWT. Kept as a single
 * module so every place that needs the token (API client, route guards)
 * agrees on storage semantics.
 */
export const authStore = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },
  isAuthenticated(): boolean {
    return localStorage.getItem(TOKEN_KEY) !== null;
  },
};
