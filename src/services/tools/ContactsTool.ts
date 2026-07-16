import * as Contacts from 'expo-contacts';
import type { ToolDefinition } from '../../types/tool';

/**
 * Contacts lookup tool. Privacy-sensitive `read` tier — returns a bounded,
 * field-limited summary, never full contact payloads, to control context size
 * and PII exposure.
 */
export const contactsSearch: ToolDefinition = {
  name: 'contacts_search',
  description:
    'Searches the device contacts for a name and returns up to 10 matches with name + first phone/email. Use only when the user asks about a contact.',
  risk: 'read',
  parameters: [
    { name: 'query', type: 'string', description: 'Name (or part of a name) to search for.', required: true },
  ],
  execute: async (args) => {
    const perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== 'granted') return JSON.stringify({ ok: false, error: 'contacts_permission_denied' });

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
    });
    const q = String(args.query).toLowerCase();
    const matches = data
      .filter((c) => c.name && c.name.toLowerCase().includes(q))
      .slice(0, 10)
      .map((c) => ({
        name: c.name,
        phone: c.phoneNumbers?.[0]?.number,
        email: c.emails?.[0]?.email,
      }));
    return JSON.stringify({ ok: true, count: matches.length, contacts: matches });
  },
};
