/** Centralized runtime configuration derived from environment variables. */

/**
 * Normalizes an API path prefix:
 *  - defaults to "/api"
 *  - ensures a single leading slash
 *  - strips trailing slashes
 *  - an empty string or "/" means "no prefix" (serve at root)
 */
function normalizePrefix(value: string | undefined): string {
  const raw = (value ?? '/api').trim()
  if (raw === '' || raw === '/') return ''
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  return withLeading.replace(/\/+$/, '')
}

/** Base path all routes and docs live under, e.g. "/api". */
export const API_PREFIX = normalizePrefix(process.env.API_PREFIX)

/**
 * Public origin used in the OpenAPI `servers` list so "Try it out" hits the
 * right host in production (e.g. https://smartsupply.gr). Falls back to local.
 */
export const PUBLIC_URL =
  process.env.PUBLIC_URL?.replace(/\/+$/, '') ??
  `http://localhost:${process.env.PORT ?? '3000'}`
