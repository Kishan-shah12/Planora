import type { Category, Occasion, Task } from '../schemas';

export const OCCASION_LABELS: Record<Occasion, string> = {
  wedding: 'Wedding',
  kids_birthday: "Kid's birthday",
  milestone: 'Milestone birthday / anniversary',
  community: 'Community festival',
};

/** Allocation percentages (assumptions, documented in README). Each row sums to 100. */
export const ALLOCATION_PRESETS: Record<Occasion, Record<Category, number>> = {
  wedding: {
    venue: 20,
    catering: 35,
    decor: 12,
    photography: 10,
    entertainment: 8,
    misc: 5,
    contingency: 10,
  },
  kids_birthday: {
    venue: 15,
    catering: 30,
    decor: 15,
    photography: 5,
    entertainment: 20,
    misc: 5,
    contingency: 10,
  },
  milestone: {
    venue: 20,
    catering: 35,
    decor: 10,
    photography: 10,
    entertainment: 10,
    misc: 5,
    contingency: 10,
  },
  community: {
    venue: 20,
    catering: 25,
    decor: 15,
    photography: 5,
    entertainment: 15,
    misc: 10,
    contingency: 10,
  },
};

const BASE_LABELS: Record<Category, string> = {
  venue: 'Venue',
  catering: 'Catering',
  decor: 'Decor',
  photography: 'Photography & video',
  entertainment: 'Entertainment',
  misc: 'Miscellaneous',
  contingency: 'Contingency buffer',
};

const LABEL_OVERRIDES: Partial<Record<Occasion, Partial<Record<Category, string>>>> = {
  kids_birthday: { entertainment: 'Games & activities', misc: 'Return gifts' },
  milestone: { entertainment: 'Tribute & AV' },
  community: { misc: 'Permits & safety' },
};

export function categoryLabel(occasion: Occasion, category: Category): string {
  return LABEL_OVERRIDES[occasion]?.[category] ?? BASE_LABELS[category];
}

type Template = Omit<Task, 'status'>;
const t = (
  id: string,
  title: string,
  category: Category,
  leadDays: number,
  durationDays: number,
  dependsOn: string[] = [],
): Template => ({ id, title, category, leadDays, durationDays, dependsOn });

/**
 * Task templates. Lead times are estimates for a typical Indian celebration. A dependency's lead
 * is always >= the dependent's lead + its duration, so an on-time plan never starts "at risk".
 */
export const TASK_TEMPLATES: Record<Occasion, Template[]> = {
  wedding: [
    t('venue', 'Book venue and fix muhurat date', 'venue', 180, 7),
    t('caterer', 'Shortlist and book caterer', 'catering', 165, 7, ['venue']),
    t('photographer', 'Book photographer and videographer', 'photography', 150, 5, ['venue']),
    t('decor', 'Finalise decor and mandap design', 'decor', 140, 7, ['venue']),
    t('entertainment', 'Book DJ and sangeet performers', 'entertainment', 120, 5, ['venue']),
    t('outfits', 'Order outfits, jewellery and trousseau', 'misc', 120, 10),
    t('invites-print', 'Design and print invitations', 'misc', 90, 7, ['venue']),
    t('invites-send', 'Send invitations (digital and physical)', 'misc', 75, 5, ['invites-print']),
    t('tasting', 'Menu tasting and finalise menu', 'catering', 60, 3, ['caterer']),
    t('rsvp', 'Collect RSVPs, travel and stay needs', 'misc', 21, 14, ['invites-send']),
    t('final-count', 'Give final guest count to caterer', 'catering', 10, 2, ['rsvp', 'tasting']),
    t('walkthrough', 'Venue and decor walkthrough', 'decor', 7, 1, ['decor']),
    t('run-sheet', 'Prepare day-of run sheet and vendor contacts', 'misc', 3, 1, [
      'final-count',
      'walkthrough',
    ]),
    t('balances', 'Settle vendor balances and tip envelopes', 'misc', 1, 1, ['run-sheet']),
  ],
  kids_birthday: [
    t('venue', 'Book party hall or plan the home setup', 'venue', 45, 3),
    t('theme', 'Pick theme and guest list', 'decor', 42, 3),
    t('caterer', 'Order cake and kid-friendly menu (check allergies)', 'catering', 30, 3, [
      'venue',
    ]),
    t('games', 'Plan games and book an entertainer', 'entertainment', 28, 5, ['theme']),
    t('decor', 'Order decor, balloons and backdrop', 'decor', 21, 5, ['theme']),
    t('invites', 'Send invitations to parents', 'misc', 21, 3, ['venue', 'theme']),
    t('gifts', 'Buy return gifts', 'misc', 14, 5, ['invites']),
    t('photo', 'Arrange a photographer or helper for photos', 'photography', 10, 2, ['venue']),
    t('rsvp', 'Confirm RSVPs and allergies', 'misc', 7, 4, ['invites']),
    t('safety', 'Safety check: space, snacks and supervision plan', 'venue', 5, 1, ['venue']),
    t('final-count', 'Final headcount to caterer and cake order', 'catering', 4, 1, [
      'rsvp',
      'caterer',
    ]),
    t('run-sheet', 'Party run sheet and helper roster', 'misc', 2, 1, ['games', 'final-count']),
  ],
  milestone: [
    t('venue', 'Book venue and fix the date', 'venue', 75, 5),
    t('caterer', 'Shortlist and book caterer', 'catering', 60, 5, ['venue']),
    t('photo-collect', 'Collect old photos and videos for the tribute', 'entertainment', 50, 14),
    t('photographer', 'Book photographer', 'photography', 45, 3, ['venue']),
    t('decor', 'Book decor and flowers', 'decor', 40, 5, ['venue']),
    t('invites', 'Design and send invitations', 'misc', 40, 5, ['venue']),
    t('tribute', 'Plan tribute video, speeches and AV', 'entertainment', 35, 10, ['photo-collect']),
    t('menu', 'Finalise menu (elder-friendly, low-spice options)', 'catering', 21, 3, ['caterer']),
    t('seating', 'Plan comfortable seating and access for elders', 'venue', 20, 3, ['venue']),
    t('rsvp', 'Confirm RSVPs and dietary needs', 'misc', 14, 7, ['invites']),
    t('final-count', 'Final guest count to caterer', 'catering', 7, 1, ['rsvp', 'menu']),
    t('av-test', 'Test AV and tribute video on site', 'entertainment', 3, 1, ['tribute']),
    t('run-sheet', 'Prepare day-of run sheet', 'misc', 2, 1, ['final-count', 'av-test']),
  ],
  community: [
    t('committee', 'Form organising committee and fix budget owners', 'misc', 110, 7),
    t('permits', 'Apply for permissions (police, municipal, loudspeaker)', 'misc', 90, 14, [
      'committee',
    ]),
    t('venue', 'Book ground or hall', 'venue', 95, 7, ['committee']),
    t('caterer', 'Book caterer or plan the prasad/langar kitchen', 'catering', 60, 7, ['venue']),
    t('decor', 'Plan decor, pandal and stage', 'decor', 50, 7, ['venue', 'permits']),
    t('entertainment', 'Book performers, sound and lights', 'entertainment', 45, 5, [
      'venue',
      'permits',
    ]),
    t('volunteers', 'Build volunteer roster and roles', 'misc', 40, 7, ['committee']),
    t('safety', 'Crowd, fire and first-aid safety plan', 'misc', 30, 5, ['permits', 'volunteers']),
    t('publicity', 'Publicity: posters and WhatsApp groups', 'misc', 30, 7, ['venue']),
    t('headcount', 'Estimate headcount and food quantity', 'catering', 7, 2, [
      'caterer',
      'publicity',
    ]),
    t('walkthrough', 'Walkthrough: layout, power backup and parking', 'venue', 4, 1, [
      'decor',
      'safety',
    ]),
    t('briefing', 'Final volunteer briefing and run sheet', 'misc', 1, 1, [
      'headcount',
      'walkthrough',
    ]),
  ],
};
