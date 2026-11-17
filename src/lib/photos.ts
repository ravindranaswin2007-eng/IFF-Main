const path = '/photos/';

export const photos = {
  career: `${path}professional-gathering.webp`,
  conversation: `${path}conversation-over-lunch.webp`,
  dialogue: `${path}leaders-in-discussion.webp`,
  roundtable: `${path}leaders-in-discussion.webp`,
  summit: `${path}event-audience.webp`,
  community: `${path}community-portrait.webp`,
  highlight: `${path}forum-presenters.webp`,
  group: `${path}forum-community.webp`,
  leadership: `${path}leadership-gathering.webp`,
  reception: `${path}networking-reception.webp`,
  speaking: `${path}speaker-with-microphone.webp`,
  conference: `${path}conference-reception.webp`,
};
import type { PhotoChoice, PhotoSlot, pagePhotoSlots } from './cms';


export type PhotoPage = keyof typeof pagePhotoSlots;
type Placement = PhotoChoice & { slot: PhotoSlot; label: string };

const hero = (src: string, alt: string): Placement => ({ slot: 'hero', label: 'Hero photograph', src, alt });
const footer = (src: string, alt = ''): Placement => ({ slot: 'footer', label: 'Closing banner', src, alt });

export const photoPlacements: Record<PhotoPage, Placement[]> = {
  '/': [hero(photos.group, 'IFF community gathering'), footer(photos.reception)],
  '/about': [hero(photos.dialogue, 'Financial professionals in conversation at an IFF gathering'), footer(photos.leadership)],
  '/professionals': [hero(photos.career, 'Professionals networking at an IFF gathering'), footer(photos.leadership, 'A group photograph at an IFF leadership gathering')],
  '/organisations': [hero(photos.roundtable, 'Financial professionals in discussion at an IFF gathering'),
    { slot: 'partnership', label: 'Partnership feature', src: photos.speaking, alt: 'A speaker at an IFF gathering' },
    footer(photos.reception, 'Attendees in conversation at an IFF reception')],
  '/events': [hero(photos.roundtable, 'Financial professionals gathering for an IFF event'),
    { slot: 'gallery-1', label: 'Gallery photo 1', src: photos.highlight, alt: 'Presenters gathering at an IFF event' },
    { slot: 'gallery-2', label: 'Gallery photo 2', src: photos.career, alt: 'Executive networking' },
    { slot: 'gallery-3', label: 'Gallery photo 3', src: photos.roundtable, alt: 'Financial professionals in discussion' },
    { slot: 'gallery-4', label: 'Gallery photo 4', src: photos.community, alt: 'Financial leaders connecting' },
    { slot: 'gallery-5', label: 'Gallery photo 5', src: photos.summit, alt: 'Audience at an IFF event' },
    footer(photos.community)],
  '/knowledge-hub': [hero(photos.highlight, 'Presenters at an IFF event'), footer(photos.roundtable)],
  '/job-seekers': [hero(photos.career, 'Members of the IFF professional community'),
    { slot: 'career-conversation', label: 'Career conversation feature', src: photos.conversation, alt: 'Financial professionals sharing a conversation' },
    footer(photos.conversation)],
  '/speaking': [hero(photos.speaking, 'A speaker addressing an IFF gathering'), footer(photos.highlight)],
  '/contact': [hero(photos.conference, 'Attendees connecting at an IFF event'), footer(photos.reception)],
};
