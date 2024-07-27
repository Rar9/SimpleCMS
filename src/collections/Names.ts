import widgets from '@components/widgets';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name coming from filename so not needed

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'fluent:rename-28-filled',
	status: 'unpublished',
	revision: true,

	// Collection Permissions by user Roles
	permissions: {
		admin:{read:true,write:true},
		developer: {
			read: false
		}
	},

	// Defined Fields that are used in your Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Text({
			label: 'First Name',
			translated: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter First Name',
			width: 2
		}),
		widgets.Text({
			label: 'Last Name',
			translated: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter Last Name',
			width: 2,
			required: true,
			permissions: {
				developer: {
					read: false
				}
			}
		})
	]
};
export default schema;
