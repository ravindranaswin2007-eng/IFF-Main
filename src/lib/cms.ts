export const eventCategories = ['Roundtables', 'Webinars', 'Networking', 'Summits'] as const;

export const pagePhotoSlots = {
  '/': 'Home', '/about': 'About Us', '/professionals': 'For Professionals',
  '/organisations': 'For Organisations', '/events': 'Events', '/knowledge-hub': 'Knowledge Hub',
  '/job-seekers': 'Job Seekers', '/speaking': 'Speaking Opportunities', '/contact': 'Contact Us',
} as const;

export type PhotoChoice = { src: string; alt: string };
export type PhotoSlot = 'hero' | 'footer' | 'partnership' | 'career-conversation' | `gallery-${1 | 2 | 3 | 4 | 5}`;
export type PagePhotographs = Record<string, Partial<Record<PhotoSlot, PhotoChoice>>>;
export type Branding = { logo: string; brochure: string; partners: string };

export type SiteEvent = {
  id: string; title: string; category: typeof eventCategories[number]; summary: string;
  date: string; location: string; registration: string; visible: boolean; featured: boolean; photo: string;
};

export type SitePerson = {
  id: string; name: string; role: string; organisation: string; photo: string; visible: boolean;
};

export type LibraryAsset = { id: string; label: string; url: string; filename: string; type: 'photo' | 'file' };

export type PublicCms = {
  events: SiteEvent[]; leadership: SitePerson[]; volunteers: SitePerson[];
  pages: PagePhotographs; branding: Branding;
};

export const defaultBranding = {
  logo: '', brochure: '', partners: 'SBI\nHDFC BANK\nICICI BANK\nAXIS BANK\nKotak\nBAJAJ FINSERV\nAdani',
};

export const emptyCms: PublicCms = { events: [], leadership: [], volunteers: [], pages: {}, branding: defaultBranding };

export const baselineEvents: SiteEvent[] = [
  { id: 'risk-roundtable', title: 'IFF Risk & Compliance Roundtable', category: 'Roundtables', summary: 'Managing systemic liquidity pressures, cyber exposure and evolving regulation.' },
  { id: 'lending-masterclass', title: 'Digital Lending & FLDG Masterclass', category: 'Webinars', summary: 'Decoding credit, digital lending guidelines and responsible innovation.' },
  { id: 'women-in-bfsi', title: 'Women in BFSI Leadership Assembly', category: 'Networking', summary: 'Connecting leaders and celebrating the perspectives shaping finance.' },
  { id: 'treasury-roundtable', title: 'Treasury & Liquidity Management', category: 'Roundtables', summary: 'Fresh perspectives on liquidity strategy and financial resilience.' },
  { id: 'annual-summit', title: 'IFF Annual Leadership Summit 2026: Navigating the Next Wave of Indian Banking', category: 'Summits', summary: 'Join C-suite visionaries, regulatory stalwarts, and infrastructure architects for a two-day symposium on economic resilience and generative AI.' },
].map((event, index) => ({ ...event, category: event.category as SiteEvent['category'], date: '', location: index === 4 ? 'Mumbai' : '', registration: '', visible: true, featured: index === 4, photo: index === 4 ? '/photos/event-audience.webp' : '' }));

export const baselineLeadership: SitePerson[] = ['Abhishek Varshney', 'Arnab', 'Sachin Agarwal'].map((name, index) => ({
  id: `founder-${index + 1}`, name, role: 'Founding leadership', organisation: '', photo: '', visible: true,
}));

export type StaffAccount = { id: string; name: string; email: string; role: 'admin' | 'editor'; active: boolean };
export type EditorIdentity = { name: string; role: StaffAccount['role'] };
