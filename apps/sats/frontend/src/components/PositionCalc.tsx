import { useState } from "react";
import { fmtNum, fmtPct, fmtPrice, toTick } from "../format";
import { WithInfo } from "./Info";
import { HELP } from "../help";

const BUY_FEE = 0.0015; // perkiraan fee beli
const SELL_FEE = 0.0025; // perkiraan fee jual + PPh final 0,1%
const KEY = "sats.calc";

function load(): { modal: number; riskPct: number } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { modal: Number(v.modal) || 10_000_000, riskPct: Number(v.riskPct) || 1 };
  } catch {
    return { modal: 10_000_000, riskPct: 1 };
  }
}

const parseRp = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
const rp = (v: number) => `Rp ${fmtNum(Math.round(v))}`;

/**
 * Lot size from risk: (modal × risk%) / (harga beli − SL), rounded down to whole lots (100 lembar),
 * capped by the cash available.
 */
export default function PositionCalc(props: {
  price: number;
  sl: number;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
}) {
  const init = load();
  const [modal, setModal] = useState(init.modal);
  const [riskPct, setRiskPct] = useState(init.riskPct);
  const [buyText, setBuyText] = useState(String(toTick(props.price)));

  const save = (m: number, r: number) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ modal: m, riskPct: r }));
    } catch {
      /* ignore */
    }
  };

  const buy = parseRp(buyText);
  // Loss per share if SL hits, fees included, so the SL loss stays within the risk budget.
  const riskPerShare = buy * (1 + BUY_FEE) - props.sl * (1 - SELL_FEE);
  const budget = (modal * riskPct) / 100;
  const lotsByRisk = riskPerShare > 0 ? Math.floor(budget / (riskPerShare * 100)) : 0;
  const lotsByCash = buy > 0 ? Math.floor(modal / (buy * 100 * (1 + BUY_FEE))) : 0;
  const lots = Math.max(0, Math.min(lotsByRisk, lotsByCash));
  const shares = lots * 100;
  const cost = shares * buy * (1 + BUY_FEE);
  const pnl = (exit: number) => shares * exit * (1 - SELL_FEE) - cost;

  const rows: Array<[string, number | null, string]> = [
    ["TP3", props.tp3, "buy"],
    ["TP2", props.tp2, "buy"],
    ["TP1", props.tp1, "buy"],
    ["Stop Loss", props.sl, "sell"],
  ];

  return (
    <div className="calc">
      <h2>
        <WithInfo info={HELP.calc}>Kalkulator Posisi</WithInfo>
      </h2>
      <div className="calc-inputs">
        <label>
          <span>Modal</span>
          <input
            inputMode="numeric"
            value={fmtNum(modal)}
            onChange={(e) => {
              const v = parseRp(e.target.value);
              setModal(v);
              save(v, riskPct);
            }}
          />
        </label>
        <label>
          <span>Risiko / trade</span>
          <select
            value={riskPct}
            onChange={(e) => {
              const v = Number(e.target.value);
              setRiskPct(v);
              save(modal, v);
            }}
          >
            {[0.5, 1, 1.5, 2, 3, 5].map((v) => (
              <option key={v} value={v}>
                {String(v).replace(".", ",")}% ({rp((modal * v) / 100)})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Harga beli</span>
          <input inputMode="numeric" value={buyText} onChange={(e) => setBuyText(e.target.value.replace(/[^\d]/g, ""))} />
        </label>
      </div>

      {buy <= props.sl ? (
        <div className="state error">Harga beli di bawah atau sama dengan Stop Loss ({fmtPrice(props.sl)}).</div>
      ) : lots === 0 ? (
        <div className="state">
          Modal/risiko belum cukup untuk 1 lot (butuh risiko {rp(riskPerShare * 100)} per lot).
        </div>
      ) : (
        <>
          <div className="calc-result">
            <div>
              <div className="dim small">Jumlah beli</div>
              <div className="calc-lots">
                {fmtNum(lots)} lot <span className="dim small">({fmtNum(shares)} lembar)</span>
              </div>
            </div>
            <div className="num">
              <div className="dim small">Nilai posisi</div>
              <div className="mono strong">{rp(cost)}</div>
              <div className="dim small">{fmtPct((cost / modal) * 100)} dari modal</div>
            </div>
          </div>
          {lotsByCash < lotsByRisk && <div className="warn small">Dibatasi modal, bukan oleh risiko.</div>}
          <table className="calc-table">
            <tbody>
              {rows.map(([label, level, cls]) =>
                level == null ? null : (
                  <tr key={label}>
                    <td className={cls}>{label}</td>
                    <td className="num mono">{fmtPrice(level)}</td>
                    <td className={`num mono strong ${pnl(level) >= 0 ? "buy" : "sell"}`}>
                      {pnl(level) >= 0 ? "+" : "−"}
                      {rp(Math.abs(pnl(level)))}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <div className="dim small">
            Termasuk perkiraan fee beli 0,15% + jual 0,25%. Harga bisa gap melewati SL, jadi rugi aktual bisa lebih besar.
          </div>
        </>
      )}
    </div>
  );
}
