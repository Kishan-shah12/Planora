import { effectiveCost, formatINR } from '../engine';
import type { Quote } from '../schemas';

const NOT_STATED = 'Not stated';
const rupees = (v: number | null) => (v === null ? NOT_STATED : formatINR(v));

/** The fields extracted from a quote, with "Not stated" wherever the vendor said nothing. */
export function QuoteFacts({ quote, guests }: { quote: Quote; guests: number }) {
  const rows: [string, string][] = [
    ['Vendor', quote.vendorName ?? NOT_STATED],
    ['Total price', rupees(quote.totalPrice)],
    ['Price per plate', rupees(quote.pricePerPlate)],
    ['Guest minimum', quote.guestMinimum === null ? NOT_STATED : String(quote.guestMinimum)],
    ['Overtime fee per hour', rupees(quote.overtimeFeePerHour)],
    [
      'Tax included',
      quote.taxIncluded === null ? NOT_STATED : quote.taxIncluded ? 'Yes' : 'No, extra',
    ],
    ['Advance', quote.advancePercent === null ? NOT_STATED : `${quote.advancePercent}%`],
    ['Inclusions', quote.inclusions.length ? quote.inclusions.join(', ') : NOT_STATED],
    ['Exclusions', quote.exclusions.length ? quote.exclusions.join(', ') : NOT_STATED],
    ['Cancellation', quote.cancellationPolicy ?? NOT_STATED],
  ];
  const cost = effectiveCost(quote, guests);
  return (
    <table>
      <caption className="sr-only">Details found in the quotation</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row" className="w-2/5 font-medium text-ink-soft">
              {k}
            </th>
            <td>{v}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">Effective cost for {guests} guests</th>
          <td className="font-semibold">
            {cost === null ? 'Cannot be worked out yet' : formatINR(cost)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
