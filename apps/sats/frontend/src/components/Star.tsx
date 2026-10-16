import { toggleWatch, useWatchlist } from "../watchlist";

/** ★ toggle. Stops the click so it works inside clickable table rows. */
export default function Star({ code }: { code: string }) {
  const { has } = useWatchlist();
  const on = has(code);
  return (
    <button
      type="button"
      className={`star ${on ? "on" : ""}`}
      aria-pressed={on}
      aria-label={on ? `Hapus ${code} dari watchlist` : `Tambah ${code} ke watchlist`}
      title={on ? "Hapus dari watchlist" : "Tambah ke watchlist"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleWatch(code);
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
