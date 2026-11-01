export const SECTIONS = [
  { id: 'overview', label: 'Overview', path: '' },
  { id: 'evidence', label: 'Evidence', path: '/evidence' },
  { id: 'record', label: 'Track record', path: '/record' },
  { id: 'terms', label: 'Terms', path: '/terms' },
  { id: 'technical', label: 'Technical', path: '/technical' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']
export const isSection = (s: string): s is Exclude<SectionId, 'overview'> => SECTIONS.some(x => x.id === s && x.id !== 'overview')
