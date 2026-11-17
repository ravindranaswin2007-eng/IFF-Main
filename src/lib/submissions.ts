import { z } from 'zod';

export const topics = [
  'Membership', 'Institutional Partnership', 'Executive Roundtables',
  'Speaking Opportunities', 'Career Connections', 'Other',
] as const;

const shortText = z.string().trim().min(1).max(180);
const message = z.string().trim().max(4000);
const email = z.string().trim().email().max(254);
const webUrl = z.string().trim().url().max(2000).refine(value => /^https?:\/\//i.test(value));

export const submissionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('contact'), name: shortText, organisation: shortText,
    email, topic: z.enum(topics), message }),
  z.object({ kind: z.literal('career'), name: shortText, organisation: shortText,
    designation: shortText, email, linkedin: webUrl.or(z.literal('')), message }),
  z.object({ kind: z.literal('speaker'), name: shortText, organisation: shortText,
    designation: shortText, linkedin: webUrl, expertise: shortText, experience: message,
    message: message.min(1) }),
  z.object({ kind: z.literal('newsletter'), email }),
]);

export const publicationTypes = ['Blog', 'Report', 'Podcast', 'Webinar'] as const;

export const publicationSchema = z.object({
  type: z.enum(publicationTypes),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(350),
  body: z.string().trim().max(40_000),
  url: webUrl.or(z.string().regex(/^\/api\/iff\/media\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)).or(z.literal('')),
  status: z.enum(['draft', 'published']),
}).superRefine((post, ctx) => {
  if (post.status !== 'published') return;
  if (post.type === 'Blog' && post.body) return;
  if (post.url) return;
  ctx.addIssue({
    code: 'custom', path: ['url'],
    message: post.type === 'Blog' ? 'Add blog text or a link before publishing.' : 'Add a link before publishing.',
  });
});

export type PublicationInput = z.infer<typeof publicationSchema>;
export type Publication = PublicationInput & { id: string; publishedAt: string | null };

export const inboxKinds = {
  membership: 'Membership', contact: 'Contact', career: 'Career', speaker: 'Speaker', newsletter: 'Newsletter',
} as const;
export const inboxStatuses = {
  new: 'New', in_progress: 'In progress', waiting: 'Waiting for reply', closed: 'Closed',
} as const;
export type InboxKind = keyof typeof inboxKinds;
export type InboxStatus = keyof typeof inboxStatuses;

export const inboxUpdateSchema = z.object({
  status: z.enum(['new', 'in_progress', 'waiting', 'closed']),
  owner: z.string().trim().max(120),
  notes: z.string().trim().max(5000),
  revision: z.number().int().min(0).max(2_147_483_646),
});

export type InboxUpdate = z.infer<typeof inboxUpdateSchema>;
export type InboxEntry = InboxUpdate & {
  id: string;
  kind: InboxKind;
  receivedAt: string;
  fields: Record<string, string>;
  attachmentName: string | null;
};

export type InboxPage = { entries: InboxEntry[]; hasNext: boolean };
