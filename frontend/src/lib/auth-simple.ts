/**
 * Simple authentication client for local development.
 * Replaces Atoms Backend auth to avoid onRefresh error.
 */

const API_BASE_URL = '';
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  permissions?: string[];
  is_superuser?: boolean;
  created_at?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

class AuthSimpleClient {
  private token: string | null = null;
  private user: User | null = null;

  constructor() {
    // Load token and user from localStorage on init
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem(TOKEN_KEY);
      const userStr = localStorage.getItem(USER_KEY);
      if (userStr) {
        try {
          this.user = JSON.parse(userStr);
        } catch (e) {
          console.error('Error parsing stored user:', e);
        }
      }
    }
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth-simple/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }

    const data: LoginResponse = await response.json();
    
    // Store token and user
    this.token = data.access_token;
    this.user = data.user;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }

    return data;
  }

  /**
   * Logout and clear stored data
   */
  logout(): void {
    this.token = null;
    this.user = null;
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }

  /**
   * Get current user information
   */
  async me(): Promise<User> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/auth-simple/me`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid, clear auth
        this.logout();
        throw new Error('Session expired');
      }
      throw new Error('Failed to get user info');
    }

    const user: User = await response.json();
    this.user = user;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    return user;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * Get stored token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Get stored user
   */
  getUser(): User | null {
    return this.user;
  }

  /**
   * Make authenticated API request
   */
  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${this.token}`,
    };

    return fetch(url, { ...options, headers });
  }
}

// Export singleton instance
export const authSimple = new AuthSimpleClient();
