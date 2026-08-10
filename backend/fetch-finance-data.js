/**
 * fetch-finance-data.js
 *
 * Altın/gümüş/döviz verisini xaus.com API'sinden (ücretsiz, anahtarsız) çeker,
 * hesaplanmış TL değerleriyle backend/data/finance.json dosyasına yazar.
 *
 * Uygulama bu veriyi doğrudan xaus.com'dan DEĞİL, bu dosyanın GitHub raw linkinden okur.
 * Sebep: Uygulamanın çalıştığı önizleme ortamı, güvenlik amacıyla rastgele üçüncü parti
 * sitelere tarayıcıdan doğrudan bağlantıyı engelliyor; GitHub raw ise güvenilir kabul ediliyor.
 *
 * Bu script'in LLM'e (Gemini/Claude) ihtiyacı yok, sadece matematik.
 */

const fs = require("fs");
const path = require("path");

const SOURCE_URL = "https://xaus.com/api/v1/spot";
const OUTPUT_PATH = path.join(__dirname, "data", "finance.json");

async function main() {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; YakitFiyatlariBot/1.0)" },
  });
  if (!res.ok) throw new Error(`xaus.com isteği başarısız: ${res.status}`);
  const data = await res.json();

  const usdTry = data.fx_rates?.TRY;
  const eurTry = data.fx_rates?.TRY && data.fx_rates?.EUR ? data.fx_rates.TRY / data.fx_rates.EUR : null;
  const gbpTry = data.fx_rates?.TRY && data.fx_rates?.GBP ? data.fx_rates.TRY / data.fx_rates.GBP : null;

  const gramAltinUsd = data.per_gram_usd; // USD / gram
  const gramAltinTry = gramAltinUsd && usdTry ? gramAltinUsd * usdTry : null;
  const onsAltinUsd = data.spot_usd_oz; // USD / troy ons

  const gumusUsdOz = data.silver_usd_oz;
  const gumusGramTry = gumusUsdOz && usdTry ? (gumusUsdOz / 31.1035) * usdTry : null;

  // Çeyrek altın: standart 1,75 gr saf altın karşılığı + piyasa işçilik/talep primi (~%7-8) — yaklaşık değerdir.
  const ceyrekAltinTry = gramAltinTry ? gramAltinTry * 1.75 * 1.075 : null;

  const output = {
    updatedAt: new Date().toISOString(),
    source: "xaus.com",
    gramAltinTry,
    ceyrekAltinTry,
    onsAltinUsd,
    gumusGramTry,
    usdTry,
    eurTry,
    gbpTry,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log("Yazıldı:", OUTPUT_PATH, output);
}

main().catch((err) => {
  console.error("Beklenmeyen hata:", err);
  process.exit(1);
});
