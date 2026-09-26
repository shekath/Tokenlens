import { useId, useMemo } from 'react';
import type { Model } from '../lib/models';
import { DAYS_PER_MONTH, budgetShare, callsForBudget, rankByBudget } from '../lib/budget';
import { num, pct, usd } from '../lib/format';
import { usePersisted } from '../lib/useTheme';
import type { ModelRow } from './ModelTable';

/** How many models the card lists before pointing at the full table. */
const SHOWN = 8;

/**
 * "I have $X a month: how many calls does that buy?" - the cost sum run
 * backwards, over the same rows (and so the same assumptions) as the model
 * table. Free, like everything on the Analyse tab.
 */
export function BudgetCard({
  rows,
  model,
  plannedCallsPerDay,
  onSelect,
}: {
  rows: ModelRow[];
  model: Model;
  plannedCallsPerDay: number;
  onSelect: (id: string) => void;
}) {
  const [budget, setBudget] = usePersisted<number>('tokenticks.budget', 500, (v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null,
  );
  const inputId = useId();

  const ranked = useMemo(
    () => rankByBudget(rows, (r) => r.cost.total, budget, plannedCallsPerDay),
    [rows, budget, plannedCallsPerDay],
  );
  const focus = rows.find((r) => r.model.id === model.id);
  const focusCalls = focus ? callsForBudget(budget, focus.cost.total) : 0;
  const focusShare = focus ? budgetShare(budget, focus.cost.total, plannedCallsPerDay) : 0;
  const shown = ranked.slice(0, SHOWN);
  const focusShown = shown.some((r) => r.item.model.id === model.id);
  const calls = (n: number) => (Number.isFinite(n) ? num(n) : 'unlimited');

  return (
    <section className="card" aria-label="What a budget buys">
      <div className="card__head">
        <h3 className="card__title">What a budget buys</h3>
      </div>
      <p className="card__note">
        Set a monthly budget to see how many calls a day it pays for on each model, with this
        prompt and the assumptions above.
      </p>

      <div className="budget__row">
        <label className="field__label" htmlFor={inputId}>
          Monthly budget (USD)
        </label>
        <input
          id={inputId}
          className="input budget__input"
          type="number"
          min={0}
          step={50}
          inputMode="decimal"
          value={budget}
          onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
        />
      </div>

      {focus && budget > 0 ? (
        <p className="budget__answer">
          <strong>{Number.isInteger(budget) ? `$${num(budget)}` : usd(budget)}</strong> a month buys about <strong>{calls(focusCalls)}</strong>{' '}
          calls a day on {model.label}.{' '}
          <span className={focusShare > 1 ? 'budget__over' : 'budget__fits'}>
            Your {num(plannedCallsPerDay)} calls a day{' '}
            {focusShare > 1
              ? `cost ${usd(focus.cost.total * plannedCallsPerDay * DAYS_PER_MONTH)}, over budget by ${pct(focusShare - 1, 0)}.`
              : `use ${pct(focusShare, 0)} of it.`}
          </span>
        </p>
      ) : null}

      {budget > 0 && rows.length > 0 ? (
        <div className="tablewrap">
          <table className="data">
            <caption className="sr-only">Calls a day the monthly budget buys on each model, most first.</caption>
            <thead>
              <tr>
                <th>Model</th>
                <th>Calls a day</th>
                <th>Your volume</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ item, callsPerDay, planShare }) => (
                <tr
                  key={item.model.id}
                  className={item.model.id === model.id ? 'is-on' : undefined}
                  onClick={() => onSelect(item.model.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span className="cell-name">
                      {item.model.label}
                      <span className="cell-vendor">{item.model.vendor}</span>
                    </span>
                  </td>
                  <td className="num">{calls(callsPerDay)}</td>
                  <td className={`num ${planShare > 1 ? 'budget__over' : 'budget__fits'}`}>
                    {planShare > 1 ? `${pct(planShare - 1, 0)} over` : `${pct(planShare, 0)} of budget`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {budget > 0 && rows.length > SHOWN ? (
        <p className="card__note" style={{ marginTop: 8 }}>
          The {SHOWN} models that stretch the budget furthest
          {focusShown ? '' : `; ${model.label} is further down`}. Every model is in the table
          at the bottom of the page.
        </p>
      ) : null}
    </section>
  );
}
