import type { Plan } from '../schemas';
import type { Action } from '../state/planStore';
import { QuoteAnalyzer } from './QuoteAnalyzer';
import { QuoteComparison } from './QuoteComparison';
import { VendorChecklist } from './VendorChecklist';

export default function VendorsTab({
  plan,
  dispatch,
}: {
  plan: Plan;
  dispatch: (action: Action) => void;
}) {
  return (
    <div className="space-y-6">
      <VendorChecklist plan={plan} dispatch={dispatch} />
      <QuoteAnalyzer plan={plan} dispatch={dispatch} />
      <QuoteComparison plan={plan} dispatch={dispatch} />
    </div>
  );
}
