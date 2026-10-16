import { STRATEGIES, setStrategy, useStrategy, type StrategyId } from "../strategy";

/** Strategy choice, shown only on the pages it affects (Sinyal, Track Record). The choice is global and remembered. */
export default function StrategyPicker() {
  const strategy = useStrategy();
  return (
    <div className="select">
      <label htmlFor="f-strategy">Strategi</label>
      <select id="f-strategy" value={strategy.id} onChange={(e) => setStrategy(e.target.value as StrategyId)}>
        {STRATEGIES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
