import { CATEGORIES, type Category, type Occasion, type Plan } from '../schemas';
import { categoryLabel } from './presets';

export type VendorStatus = 'not_started' | 'contacted' | 'quote_received' | 'quote_accepted';

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  not_started: 'Not started',
  contacted: 'Contacted',
  quote_received: 'Quotation received',
  quote_accepted: 'Quotation accepted',
};

type Bookable = Exclude<Category, 'contingency'>;

/** Who to book, per occasion. Short hints only: no vendor names, no prices. */
const VENDOR_HINTS: Record<Occasion, Record<Bookable, string>> = {
  wedding: {
    venue: 'Banquet hall, lawn or resort',
    catering: 'Caterer, menu tasting',
    decor: 'Decorator, florist, mandap',
    photography: 'Photographer, videographer',
    entertainment: 'DJ, sangeet performers',
    misc: 'Invitation printer, pandit, mehendi',
  },
  kids_birthday: {
    venue: 'Party hall or home setup',
    catering: 'Cake, kid-friendly snacks',
    decor: 'Balloons, backdrop, theme props',
    photography: 'Photographer or helper',
    entertainment: 'Entertainer, games host',
    misc: 'Return gifts, invitations',
  },
  milestone: {
    venue: 'Hall with comfortable seating',
    catering: 'Caterer, elder-friendly menu',
    decor: 'Florist, decorator',
    photography: 'Photographer',
    entertainment: 'AV and tribute video',
    misc: 'Invitations, gifts',
  },
  community: {
    venue: 'Ground or community hall',
    catering: 'Caterer or prasad kitchen',
    decor: 'Pandal, stage, lights',
    photography: 'Photographer or volunteers',
    entertainment: 'Sound system, performers',
    misc: 'Permits, safety, volunteers',
  },
};

export interface ChecklistItem {
  category: Bookable;
  label: string;
  hint: string;
  status: VendorStatus;
  quotes: number;
}

/** Status is derived from what the plan already knows; "contacted" is the one manual step. */
export function vendorChecklist(plan: Plan): ChecklistItem[] {
  return CATEGORIES.filter((c): c is Bookable => c !== 'contingency').map((category) => {
    const quotes = plan.quotes.filter((q) => q.category === category);
    const status: VendorStatus = quotes.some((q) => q.accepted)
      ? 'quote_accepted'
      : quotes.length > 0
        ? 'quote_received'
        : plan.contacted.includes(category)
          ? 'contacted'
          : 'not_started';
    return {
      category,
      label: categoryLabel(plan.occasion, category),
      hint: VENDOR_HINTS[plan.occasion][category],
      status,
      quotes: quotes.length,
    };
  });
}

export function toggleContacted(plan: Plan, category: Category): Plan {
  const contacted = plan.contacted.includes(category)
    ? plan.contacted.filter((c) => c !== category)
    : [...plan.contacted, category];
  return { ...plan, contacted };
}
