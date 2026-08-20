/**
 * Where the API is and how to authenticate to it.
 *
 * Read from the environment at build time rather than committed. The ingest
 * token is a shared secret, and a repository is not a place for one.
 *
 *   EXPO_PUBLIC_AERA_API_URL=http://192.168.1.10:8000
 *   EXPO_PUBLIC_AERA_TOKEN=...
 */

export const config = {
  apiUrl: process.env.EXPO_PUBLIC_AERA_API_URL ?? '',
  ingestToken: process.env.EXPO_PUBLIC_AERA_TOKEN ?? '',
};

export function configured(): boolean {
  return config.apiUrl !== '' && config.ingestToken !== '';
}
