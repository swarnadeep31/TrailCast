// Must match INTERESTS and REFERRAL_SOURCES in server/src/models/User.ts.
export const INTERESTS: Record<string, string> = {
  riding: 'Motorcycle riding',
  trekking: 'Trekking & hiking',
  climbing: 'Mountaineering & climbing',
  cycling: 'Cycling',
  camping: 'Camping',
  travel: 'Road trips & travel',
  other: 'Something else',
};

export const REFERRAL_SOURCES: Record<string, string> = {
  friend: 'A friend told me',
  youtube: 'YouTube',
  instagram: 'Instagram',
  search: 'Google or another search engine',
  other: 'Somewhere else',
};
