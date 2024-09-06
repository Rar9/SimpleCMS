/**
 * @file src/auth/permissionCheck.ts
 * @description User permission checking utility for server-side routes.
 *
 * Provides a function to check user permissions based on their role and the required permissions for a specific action or resource.
 */

import type { User, PermissionAction, ContextType, Permission } from './types';
import { authAdapter } from '@src/databases/db';
import logger from '@src/utils/logger';

export interface PermissionConfig {
	contextId: string;
	name: string;
	action: PermissionAction;
	contextType: ContextType | string;
}

// Cache to store roles and permissions temporarily
const rolePermissionCache: Record<string, Permission[]> = {};

// Function to check user permissions
export async function checkUserPermission(user: User, config: PermissionConfig): Promise<{ hasPermission: boolean; isRateLimited: boolean }> {
	try {
		// Automatically grant permissions to admin users
		if (user.role === 'admin') {
			return { hasPermission: true, isRateLimited: false };
		}

		// Check if authAdapter is initialized
		if (!authAdapter) {
			logger.error('Authentication adapter is not initialized.');
			return { hasPermission: false, isRateLimited: false };
		}

		// Retrieve cached role permissions or fetch from adapter if not cached
		let userPermissions: Permission[] = rolePermissionCache[user.role];
		if (!userPermissions) {
			const userRole = await authAdapter.getRoleByName(user.role);
			if (!userRole) {
				logger.warn(`Role ${user.role} not found for user ${user.email}`);
				return { hasPermission: false, isRateLimited: false };
			}

			// Fetch all permissions and filter by the user's role permissions
			const allPermissions = await authAdapter.getAllPermissions();
			userPermissions = allPermissions.filter((permission) => userRole.permissions.has(permission.id));

			rolePermissionCache[user.role] = userPermissions; // Cache the result
		}

		// Check for self-lockout attempt
		if (config.requiredRole !== 'admin' && user.role === config.requiredRole) {
			const hasSelfLockout = userPermissions.every(
				(permission) => permission.id !== config.contextId || permission.action !== config.action || permission.type !== config.contextType
			);

			if (hasSelfLockout) {
				logger.error(`User ${user.email} attempted a self-lockout by role change`);
				return { hasPermission: false, isRateLimited: false };
			}
		}

		// Check if the user has the required permission
		const hasPermission = userPermissions.some(
			(permission) =>
				permission.id === config.contextId &&
				permission.action === config.action &&
				(permission.type === config.contextType || permission.type === 'system')
		);

		if (!hasPermission) {
			logger.info(`User ${user.email} lacks required permission for ${config.contextId}`);
		}

		return { hasPermission, isRateLimited: false };
	} catch (error) {
		logger.error(`Error checking user permission: ${(error as Error).message}`);
		return { hasPermission: false, isRateLimited: false };
	}
}
