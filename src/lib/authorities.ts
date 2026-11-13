// Authorities a report can be sent to. Contact details here are PLACEHOLDERS until checked against
// each authority's official website — the app shows them highlighted and asks the person to confirm.
import type { Category } from './reports';

export type Authority = {
  id: string;
  name: string;
  categories: Category[];
  /** Official email, or null if the authority only takes reports through its own app/site. */
  email: string | null;
  /** Official app or online form, if any. */
  url: string | null;
  verified: boolean;
};

export const AUTHORITIES: Authority[] = [
  { id: 'police', name: 'Mauritius Police Force', categories: ['safety'], email: null, url: null, verified: false },
  { id: 'nta', name: 'National Transport Authority', categories: ['transport'], email: null, url: null, verified: false },
  { id: 'rda', name: 'Road Development Authority', categories: ['transport'], email: null, url: null, verified: false },
  { id: 'health', name: 'Ministry of Health and Wellness', categories: ['health'], email: null, url: null, verified: false },
  { id: 'environment', name: 'Ministry of Environment', categories: ['environment'], email: null, url: null, verified: false },
  { id: 'council', name: 'Your municipal or district council', categories: ['environment', 'transport', 'other', 'safety'], email: null, url: null, verified: false },
  { id: 'cwa', name: 'Central Water Authority', categories: ['health', 'other'], email: null, url: null, verified: false },
  { id: 'ceb', name: 'Central Electricity Board', categories: ['safety', 'other'], email: null, url: null, verified: false },
];

export function authoritiesFor(category: Category) {
  const matching = AUTHORITIES.filter((a) => a.categories.includes(category));
  const rest = AUTHORITIES.filter((a) => !a.categories.includes(category));
  return [...matching, ...rest];
}
