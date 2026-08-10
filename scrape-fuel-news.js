/**
 * backend/scrape-fuel-news.js
 *
 * Günde 3 kez (07:00 / 17:00 / 00:15 TR saati) GitHub Actions tarafından çalıştırılır.
 * - Belirlenen haber sitelerinden güncel akaryakıt haberlerini çeker
 * - Metni Gemini API'ye yollayıp benzin/motorin/otogaz için
 *   { type: "zam"|"indirim"|"yok", amount, headline, detail, source, url } üretir
 * - Sonucu data/expectations.json dosyasına yazar (repo'ya commit edilir,
 *   uygulama bu dosyayı GitHub raw URL üzerinden okur)
 *
 * Gereken ortam değişkeni: GEMINI_API_KEY (GitHub repo secrets içine eklenmeli)
 * API anahtarını https://aistudio.google.com/apikey adresinden ücretsiz alabilirsin.
 */

const fs = require("fs");
const path = require("path");

// Taranacak kaynaklar — akaryakıt fiyat haberlerini en sık ve en hızlı yayınlayan siteler.
// İstersen bu listeyi genişletebilir/daraltabiliriz.
const SOURCES = [
  { name: "Birgün", url: "https://www.birgun.net/ekonomi" },
  { name: "Habertürk", url: "https://www.haberturk.com/ekonomi" },
  { name: "Bigpara (Hürriyet)", url: "https://bigpara.hurriyet.com.tr/ekonomi-haberleri/" },
  { name: "NationalTurk", url: "https://www.nationalturk.com/ekonomi/" },
  { name: "Dünya Gazetesi", url: "https://www.dunya.com/enerji" },
];

const OUTPUT_PATH = path.join(__dirname, "data", "expectations.json");

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; YakitFiyatlariBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Fetch failed for ${url}: ${res.status}`);
  return await res.text();
}

// Kaba bir ön filtre: sayfa HTML'inden akaryakıt ile ilgili olabilecek linkleri/başlıkları çıkarır.
// Basit tutuyoruz — asıl anlama işini Claude'a bırakıyoruz.
function extractCandidateText(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // "benzin", "motorin", "otogaz", "akaryakıt" geçen 300 karakterlik pencereleri topla
  const keywords = ["benzin", "motorin", "otogaz", "lpg", "akaryakıt", "mazot"];
  const lower = text.toLowerCase();
  const chunks = [];
  keywords.forEach((kw) => {
    let idx = lower.indexOf(kw);
    let guard = 0;
    while (idx !== -1 && guard < 3) {
      chunks.push(text.slice(Math.max(0, idx - 200), idx + 400));
      idx = lower.indexOf(kw, idx + 400);
      guard++;
    }
  });
  return chunks.join("\n---\n").slice(0, 6000); // token limiti için kısıtla
}

async function classifyWithGemini(sourceName, sourceUrl, candidateText) {
  const prompt = `Aşağıda "${sourceName}" adlı Türk haber sitesinden alınmış, akaryakıt (benzin/motorin/otogaz) ile ilgili ham metin parçaları var.
Bu metinlere dayanarak benzin, motorin ve otogaz (LPG) için AYRI AYRI şu JSON şemasında bir değerlendirme üret:

{
  "benzin": { "type": "zam"|"indirim"|"yok", "amount": "örn. 1,56 ₺" veya null, "headline": "kısa başlık (max 10 kelime)", "detail": "1-2 cümlelik açıklama" },
  "motorin": { ... aynı şema ... },
  "otogaz": { ... aynı şema ... }
}

Kurallar:
- Eğer metinde o yakıt türüyle ilgili güncel/yakın tarihli bir zam veya indirim beklentisi/haberi YOKSA type: "yok" yaz.
- Sadece JSON döndür, başka hiçbir şey yazma, markdown kod bloğu kullanma.
- Spekülatif söylentileri "sektör kaynaklarına göre" gibi ifadelerle net gerçeklerden ayırt et ama yine de en güncel bilgiyi özetle.

METİN:
${candidateText}`;

  const model = "gemini-2.5-flash"; // hızlı ve düşük maliyetli; istersen gemini-2.5-pro ile değiştirebilirsin
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    }
  );

  const data = await res.json();
  const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOut) throw new Error("Gemini yanıtında metin bulunamadı: " + JSON.stringify(data).slice(0, 300));

  const cleaned = textOut.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  // Her yakıt türüne kaynak bilgisini ekle
  ["benzin", "motorin", "otogaz"].forEach((k) => {
    if (parsed[k]) {
      parsed[k].source = sourceName;
      parsed[k].url = sourceUrl;
    }
  });
  return parsed;
}

async function main() {
  const results = [];
  for (const src of SOURCES) {
    try {
      const html = await fetchPage(src.url);
      const candidate = extractCandidateText(html);
      if (!candidate) continue;
      const classified = await classifyWithGemini(src.name, src.url, candidate);
      results.push(classified);
    } catch (err) {
      console.error(`[UYARI] ${src.name} taranamadı:`, err.message);
    }
  }

  if (results.length === 0) {
    console.error("Hiçbir kaynaktan veri alınamadı, mevcut dosya korunuyor.");
    return;
  }

  // En "bilgilendirici" olanı seç: type "yok" olmayan ilk sonucu tercih et
  const merged = {};
  for (const fuel of ["benzin", "motorin", "otogaz"]) {
    const best = results.find((r) => r[fuel] && r[fuel].type !== "yok") ||
      results.find((r) => r[fuel]);
    if (best) merged[fuel] = best[fuel];
  }

  const output = {
    updatedAt: new Date().toISOString(),
    expectations: merged,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log("Yazıldı:", OUTPUT_PATH);
}

main().catch((err) => {
  console.error("Beklenmeyen hata:", err);
  process.exit(1);
});
