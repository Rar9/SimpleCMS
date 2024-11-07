/**
 * @file config/roles.ts
 * @description  Role configuration file
 */

import type { Role } from '../src/auth/types';
import { permissions } from '../src/auth/permissions';

export const roles: Role[] = [
	{
		_id: 'admin',
		name: 'Administrator',
		description: 'Administrator - Full access to all system features',
		isAdmin: true,
		permissions: permissions.map((p) => p._id) // All permissions
	},
	{
		_id: 'developer',
		name: 'Developer',
		description: 'Developer Role - No Permissions',
		permissions: [] // No permissions
	},
	{
		_id: 'editor',
		name: 'Editor',
		description: 'Editor Role - No Permissions',
		permissions: [] // No permissions
	},
	{
		_id: 'user',
		name: 'User',
		description: 'User Role - No Permissions',
		permissions: [] // No permissions
	}
];

// Function to register a new role
export function registerRole(newRole: Role): void {
	const exists = roles.some((role) => role._id === newRole._id); // Use _id for consistency
	if (!exists) {
		roles.push(newRole);
	}
}

// Function to register multiple roles
export function registerRoles(newRoles: Role[]): void {
	newRoles.forEach(registerRole);
}
