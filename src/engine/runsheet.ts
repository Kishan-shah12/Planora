import type { Occasion } from '../schemas';

export interface RunSheetItem {
  /** 24-hour local time, HH:MM. */
  time: string;
  title: string;
}

/**
 * A suggested order for the day itself. Times are typical, not prescriptive: the family adjusts
 * them to their muhurat, venue slot and customs.
 */
export const RUN_SHEETS: Record<Occasion, RunSheetItem[]> = {
  wedding: [
    { time: '08:00', title: 'Haldi and getting ready' },
    { time: '11:00', title: 'Final decor and stage check with the decorator' },
    { time: '16:30', title: 'Baraat assembles' },
    { time: '17:30', title: 'Baraat arrives; milni and welcome' },
    { time: '18:30', title: 'Jaimala on stage' },
    { time: '19:30', title: 'Dinner opens (caterer has the final count)' },
    { time: '20:30', title: 'Pheras at the muhurat' },
    { time: '23:00', title: 'Vidaai' },
    { time: '23:30', title: 'Settle vendor balances and pack up' },
  ],
  kids_birthday: [
    { time: '15:00', title: 'Set up decor and do the safety check' },
    { time: '16:00', title: 'Guests arrive; welcome activity' },
    { time: '16:30', title: 'Games, round one' },
    { time: '17:15', title: 'Entertainer or show' },
    { time: '17:45', title: 'Cake cutting' },
    { time: '18:00', title: 'Snacks and dinner' },
    { time: '18:45', title: 'Return gifts at the door' },
    { time: '19:00', title: 'Wind down; parents pick up' },
  ],
  milestone: [
    { time: '18:00', title: 'Venue, seating and AV check' },
    { time: '19:00', title: 'Guests arrive; welcome drinks' },
    { time: '19:45', title: 'Opening words' },
    { time: '20:00', title: 'Tribute video and speeches' },
    { time: '20:45', title: 'Cake and toast' },
    { time: '21:00', title: 'Dinner' },
    { time: '22:15', title: 'Family photograph' },
    { time: '22:30', title: 'Thank-you and farewell' },
  ],
  community: [
    { time: '06:00', title: 'Volunteers report; briefing' },
    { time: '07:00', title: 'Safety walkthrough: first aid, exits, power backup' },
    { time: '08:00', title: 'Gates open' },
    { time: '09:00', title: 'Main puja or opening ceremony' },
    { time: '12:30', title: 'Prasad or langar service' },
    { time: '17:00', title: 'Cultural programme' },
    { time: '20:00', title: 'Aarti or closing ceremony' },
    { time: '21:30', title: 'Clean-up and lost and found' },
  ],
};
