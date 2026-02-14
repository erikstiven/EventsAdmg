import { config } from './config';

const API_BASE_URL = config.API_BASE_URL;

export interface PublicConfigResponse {
  API_BASE_URL: string;
}

export async function fetchPublicConfig(): Promise<PublicConfigResponse | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config`);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    return null;
  } catch (error) {
    return null;
  }
}
