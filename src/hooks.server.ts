/**
 * @file src/hooks.server.ts
 * @description Server-side hooks for SvelteKit application
 *
 * This file handles:
 * - Authentication and session management
 * - Rate limiting for API endpoints
 * - Permission checks for protected routes
 * - Static asset caching
 * - API response caching using existing session store
 * - Security headers
 * - OAuth route handling
 * - Performance logging
 */

import { privateEnv } from '@root/config/private';
import { redirect, error, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Rate Limiter
import { RateLimiter } from 'sveltekit-rate-limiter/server';

// Auth and Database Adapters
import { auth, initializationPromise, dbAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { checkUserPermission } from '@src/auth/permissionCheck';
import { getAllPermissions } from '@src/auth/permissionManager';

// Cache
import { getCacheStore } from '@src/cacheStore/index.server';

// System Logger
import { logger } from '@utils/logger';

// Initialize rate limiter
const limiter = new RateLimiter({
	IP: [300, 'h'], // 300 requests per hour per IP
	IPUA: [150, 'm'], // 150 requests per minute per IP+User-Agent
	cookie: {
		name: 'sveltycms_ratelimit',
		secret: privateEnv.JWT_SECRET_KEY as string,
		rate: [500, 'm'], // 500 requests per minute per cookie
		preflight: true
	}
});

// Get a stricter rate limiter for API requests
const apiLimiter = new RateLimiter({
	IP: [100, 'm'],
	IPUA: [50, 'm']
});

// Check if a given pathname is a static asset
const isStaticAsset = (pathname: string): boolean =>
	pathname.startsWith('/static/') || pathname.startsWith('/_app/') || pathname.endsWith('.js') || pathname.endsWith('.css');

// Check if the given IP is localhost
const isLocalhost = (ip: string): boolean => ip === '::1' || ip === '127.0.0.1';

// Check if a route is an OAuth route
const isOAuthRoute = (pathname: string): boolean => pathname.startsWith('/login') && pathname.includes('OAuth');

// Check if the route is public or an OAuth route
const isPublicOrOAuthRoute = (pathname: string): boolean => {
	const publicRoutes = ['/login', '/register', '/forgot-password'];
	return publicRoutes.some((route) => pathname.startsWith(route)) || isOAuthRoute(pathname);
};

// Create an HTML response for rate limiting
const createHtmlResponse = (message: string, status: number): never => {
	const html = `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${message}</title>
                <style>
                    body {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        font-family: Arial, sans-serif;
                        background-color: #121212;
                        color: #FFFFFF;
                        margin: 0;
                    }
                    .logo {
                        width: 100px;
                        height: 100px;
                        margin-bottom: 20px;
                        fill: #FFFFFF;
                    }
                    h1 { font-size: 2em; margin-bottom: 10px; }
                    p { font-size: 1.2em; }
                </style>
            </head>
            <body>
                <svg class="logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="#FFFFFF" stroke-width="2"/>
                </svg>
                <h1>${message}</h1>
                <p>Please try again later.</p>
            </body>
        </html>`;
	throw error(status, html);
};

// Get user from session ID, using cache if available
const getUserFromSessionId = async (session_id: string | undefined): Promise<any> => {
	if (!session_id) return null;
	const cacheStore = getCacheStore();
	let user = await cacheStore.get(session_id);
	if (!user) {
		try {
			user = await auth?.validateSession({ session_id });
			if (user) {
				// Extended session duration to 24 hours
				await cacheStore.set(session_id, user, new Date(Date.now() + 24 * 3600 * 1000));
			}
		} catch (err) {
			logger.error(`Session validation error: ${err}`);
			// Clear the invalid session cookie
			return null;
		}
	} else {
		try {
			// Double-check the session is still valid in the database
			const validSession = await auth?.validateSession({ session_id });
			if (!validSession) {
				await cacheStore.delete(session_id);
				return null;
			}
			// Extend session on activity
			await cacheStore.set(session_id, user, new Date(Date.now() + 24 * 3600 * 1000));
		} catch (err) {
			logger.error(`Session revalidation error: ${err}`);
			await cacheStore.delete(session_id);
			return null;
		}
	}
	return user;
};

// Handle static asset caching
const handleStaticAssetCaching: Handle = async ({ event, resolve }) => {
	if (isStaticAsset(event.url.pathname)) {
		const response = await resolve(event);
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
		return response;
	}
	return resolve(event);
};

// Handle rate limiting
const handleRateLimit: Handle = async ({ event, resolve }) => {
	if (isStaticAsset(event.url.pathname) || isLocalhost(event.getClientAddress())) {
		return resolve(event);
	}

	const isApiRequest = event.url.pathname.startsWith('/api/');
	const currentLimiter = isApiRequest ? apiLimiter : limiter;

	if (await currentLimiter.isLimited(event)) {
		logger.warn(`Rate limit exceeded for IP: ${event.getClientAddress()}, endpoint: ${event.url.pathname}`);
		throw error(429, isApiRequest ? 'Too Many Requests' : createHtmlResponse('Too Many Requests', 429));
	}

	return resolve(event);
};

// Handle authentication, authorization, and API caching
const handleAuth: Handle = async ({ event, resolve }) => {
	if (isStaticAsset(event.url.pathname)) return resolve(event);

	const start = performance.now();
	logger.debug('Starting handleAuth function');

	// Wait for database initialization
	try {
		await initializationPromise;
		logger.debug('Database initialization complete');

		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database system is not available');
		}

		if (!auth) {
			logger.error('Authentication system not initialized');
			throw error(500, 'Authentication system is not available');
		}
	} catch (err) {
		logger.error(`System initialization failed: ${err}`);
		if (!isPublicOrOAuthRoute(event.url.pathname)) {
			throw redirect(302, '/login');
		}
		return resolve(event);
	}

	const session_id = event.cookies.get(SESSION_COOKIE_NAME);
	logger.debug(`Session ID from cookie: ${session_id || 'Not present'}`);

	const user = await getUserFromSessionId(session_id);

	// If session is invalid, clear the cookie
	if (session_id && !user) {
		event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	}

	logger.debug(`User from session: ${user ? JSON.stringify(user) : 'Not found'}`);

	event.locals.user = user;
	event.locals.permissions = user?.permissions || [];
	event.locals.session_id = session_id;

	const isPublicRoute = isPublicOrOAuthRoute(event.url.pathname);
	const isApiRequest = event.url.pathname.startsWith('/api/');

	// Check if this is the first user, regardless of session
	let userCount = 0;
	try {
		userCount = await auth.getUserCount();
	} catch (err) {
		logger.error(`Failed to get user count: ${err}`);
		// If we can't get user count, assume it's not first user for safety
		if (!isPublicOrOAuthRoute(event.url.pathname)) {
			throw redirect(302, '/login');
		}
	}

	const isFirstUser = userCount === 0;
	event.locals.isFirstUser = isFirstUser;
	logger.debug(`Is first user: ${isFirstUser}, Total users: ${userCount}`);

	if (user) {
		try {
			// Fetch user roles
			event.locals.roles = await auth.getAllRoles();
			logger.debug(`Roles retrieved for user ${user.email}: ${JSON.stringify(event.locals.roles)}`);

			// Check for admin permissions
			const manageUsersPermissionConfig = {
				contextId: 'config/userManagement',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			};
			const { hasPermission } = await checkUserPermission(user, manageUsersPermissionConfig);
			event.locals.hasManageUsersPermission = hasPermission;
			logger.debug(`User ${user.email} has manage users permission: ${hasPermission}`);

			// Fetch admin data if user has permission
			if (user.isAdmin || hasPermission) {
				event.locals.allUsers = await auth.getAllUsers();
				event.locals.allTokens = await auth.getAllTokens();
				logger.debug(`Retrieved ${event.locals.allUsers.length} users and ${event.locals.allTokens.length} tokens for admin`);
			}
		} catch (err) {
			logger.error(`Error fetching user data: ${err}`);
			// If we can't fetch user data, session might be invalid
			if (!isPublicOrOAuthRoute(event.url.pathname)) {
				throw redirect(302, '/login');
			}
		}
	}

	const responseTime = performance.now() - start;
	logger.debug(
		`Route ${event.url.pathname} - ${responseTime.toFixed(2)}ms ${getPerformanceEmoji(responseTime)}: isPublicRoute=${isPublicRoute}, isApiRequest=${isApiRequest}`
	);

	if (isOAuthRoute(event.url.pathname)) {
		logger.debug('OAuth route detected, passing through');
		return resolve(event);
	}

	if (!user && !isPublicRoute && !isFirstUser) {
		logger.debug('User not authenticated and not on public route, redirecting to login');
		throw isApiRequest ? error(401, 'Unauthorized') : redirect(302, '/login');
	}

	if (user && isPublicRoute && !isOAuthRoute(event.url.pathname)) {
		logger.debug('Authenticated user on public route, redirecting to home');
		return redirect(302, '/');
	}

	if (isApiRequest && user) {
		logger.debug('Handling API request for authenticated user');
		return handleApiRequest(event, resolve, user);
	}

	logger.debug('Proceeding with normal request handling');
	return resolve(event);
};

// Handle API requests, including permission checks and caching
const handleApiRequest = async (event: any, resolve: any, user: any): Promise<Response> => {
	const apiEndpoint = event.url.pathname.split('/')[2];
	const permissionId = `api:${apiEndpoint}`;

	const allPermissions = await getAllPermissions();
	const requiredPermission = allPermissions.find((p) => p._id === permissionId);

	// Check permissions for API access
	if (requiredPermission) {
		const { hasPermission } = await checkUserPermission(user, {
			contextId: permissionId,
			name: `Access ${apiEndpoint} API`,
			action: requiredPermission.action,
			contextType: requiredPermission.type
		});
		if (!hasPermission) {
			logger.warn(`User ${user._id} attempted to access ${apiEndpoint} API without permission`);
			throw error(403, 'Forbidden');
		}
	}

	// Handle both GET and POST requests
	if (event.request.method === 'GET') {
		return handleCachedApiRequest(event, resolve, apiEndpoint, user._id);
	} else {
		// For POST, PUT, DELETE, etc., just resolve the event
		return resolve(event);
	}
};

// Handle cached API requests
const handleCachedApiRequest = async (event: any, resolve: any, apiEndpoint: string, userId: string): Promise<Response> => {
	const cacheStore = getCacheStore();
	const cacheKey = `api:${apiEndpoint}:${userId}`;
	const cachedResponse = await cacheStore.get(cacheKey);

	if (cachedResponse) {
		logger.debug(`Cache hit for ${cacheKey}`);
		return new Response(JSON.stringify(cachedResponse), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	logger.debug(`Cache miss for ${cacheKey}, resolving request`);
	const response = await resolve(event);

	// Clone the response so we can read it multiple times
	const clonedResponse = response.clone();

	try {
		// Special handling for GraphQL responses
		if (apiEndpoint === 'graphql') {
			// For GraphQL, we'll pass through the response as-is
			return response;
		}

		// For other API endpoints, handle as JSON
		const responseData = await response.json();

		// Only cache successful responses
		if (response.ok) {
			await cacheStore.set(cacheKey, responseData, new Date(Date.now() + 300 * 1000)); // Cache for 5 minutes
			logger.debug(`Stored ${cacheKey} in cache`);
		}

		return new Response(JSON.stringify(responseData), {
			status: response.status,
			headers: {
				'Content-Type': 'application/json',
				...Object.fromEntries(response.headers)
			}
		});
	} catch (err) {
		logger.error(`Error processing API response for ${apiEndpoint}: ${err}`);
		// If JSON parsing fails, return the original response
		return clonedResponse;
	}
};

// Add security headers to the response
const addSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const headers = {
		'X-Frame-Options': 'SAMEORIGIN',
		'X-XSS-Protection': '1; mode=block',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'geolocation=(), microphone=()'
	};

	Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));

	// Only set HSTS header on HTTPS connections
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}

	return response;
};

const getPerformanceEmoji = (responseTime: number): string => {
	if (responseTime < 100) return '🚀';
	if (responseTime < 500) return '⚡';
	if (responseTime < 1000) return '⏱️';
	if (responseTime < 3000) return '🕰️';
	return '🐢';
};

// Combine all hooks
export const handle: Handle = sequence(handleStaticAssetCaching, handleRateLimit, handleAuth, addSecurityHeaders);

// Helper function to invalidate API cache
export const invalidateApiCache = async (apiEndpoint: string, userId: string): Promise<void> => {
	const cacheStore = getCacheStore();
	const cacheKey = `api:${apiEndpoint}:${userId}`;
	await cacheStore.delete(cacheKey);
	logger.debug(`Invalidated cache for ${cacheKey}`);
};
