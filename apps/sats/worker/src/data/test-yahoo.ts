import { fetchYahooDaily } from "./yahoo";

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const twoYearsAgo = now - 2 * 365 * 24 * 60 * 60;

  const bars = await fetchYahooDaily(
    "BBCA.JK",
    twoYearsAgo,
    now,
  );

  console.log("===== YAHOO DATA TEST =====");
  console.log("Symbol: BBCA.JK");
  console.log("Bars:", bars.length);
  console.log("First:", bars[0]);
  console.log("Last:", bars[bars.length - 1]);
  console.log("===========================");
}

main().catch((error) => {
  console.error("Yahoo test failed:");
  console.error(error);
  process.exit(1);
});