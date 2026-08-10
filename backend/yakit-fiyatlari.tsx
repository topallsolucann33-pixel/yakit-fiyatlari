import React, { useState, useMemo, useRef, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChevronDown, Search, X, TrendingUp, TrendingDown, Fuel, Droplet, Wind, ArrowUpCircle, ArrowDownCircle, MinusCircle, ExternalLink, Coins, DollarSign, RefreshCw } from "lucide-react";

const CITIES = [
  "Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın","Balıkesir",
  "Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum","Denizli",
  "Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkari",
  "Hatay","Isparta","Mersin","İstanbul","İzmir","Kars","Kastamonu","Kayseri","Kırklareli","Kırşehir",
  "Kocaeli","Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin","Muğla","Muş","Nevşehir",
  "Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Tekirdağ","Tokat",
  "Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray","Bayburt","Karaman",
  "Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova","Karabük","Kilis","Osmaniye","Düzce"
];

const FUELS = [
  { key: "benzin", label: "Benzin", unit: "95 Oktan Kurşunsuz", base: 69.75, color: "#2FAE60", icon: Fuel },
  { key: "motorin", label: "Motorin", unit: "Dizel", base: 81.56, color: "#E8890C", icon: Droplet },
  { key: "otogaz", label: "Otogaz", unit: "LPG", base: 34.13, color: "#2E7DD1", icon: Wind },
];

// Beklenen zam/indirim bilgisi — EPDK duyuruları ve haber sitelerinden toplanan (örnek/mock) veriler.
// Gerçek entegrasyonda bu obje otomatik haber taraması + EPDK sitesi verisiyle dolacak.
const EXPECTATIONS = {
  benzin: {
    type: "zam", // "zam" | "indirim" | "yok"
    headline: "Pazartesi gece yarısı ~1,56 ₺ zam bekleniyor",
    detail: "Sektör kaynaklarına göre litre fiyatına 2,08 TL'lik artış öngörülüyor; bunun 1,56 TL'si pompa fiyatına yansıyacak.",
    source: "NationalTurk",
    url: "https://www.nationalturk.com/ekonomi/benzin-zam/",
  },
  motorin: {
    type: "indirim",
    headline: "9 Ağustos'ta ~1 ₺ indirim pompaya yansıdı",
    detail: "Brent petrol fiyatlarındaki gerilemeyle motorin grubunda litre başına yaklaşık 1 TL'lik indirim gerçekleşti.",
    source: "Birgün",
    url: "https://www.birgun.net/haber/benzin-ve-motorin-fiyatlarinda-indirim-zam-var-mi-6-agustos-2026-motorin-benzin-ve-lpg-fiyatlari-727808",
  },
  otogaz: {
    type: "yok",
    headline: "Yeni bir zam/indirim beklentisi bulunmuyor",
    detail: "4 Ağustos'ta uygulanan 2,42 TL'lik zamdan bu yana LPG fiyatlarında değişiklik beklenmiyor.",
    source: "Habertürk",
    url: "https://www.haberturk.com/bilgi/foto/motorine-indirim-mi-geliyor-mazota-ne-kadar-indirim-gelecek-4-agustos-2026-istanbul-izmir-ankara-akaryakit-fiyatlari-3903358",
  },
};

// Backend kurulduktan sonra bu URL'yi GitHub Actions'ın yazdığı raw JSON dosyasına yönlendir, örn:
// "https://raw.githubusercontent.com/KULLANICI_ADIN/REPO_ADIN/main/backend/data/expectations.json"
const REMOTE_EXPECTATIONS_URL = "https://raw.githubusercontent.com/topallsolucann33-pixel/yakit-fiyatlari/main/backend/data/expectations.json";

const EXPECTATION_STYLE = {
  zam: { bg: "#FFF1F0", fg: "#D70015", icon: ArrowUpCircle },
  indirim: { bg: "#EEFBF2", fg: "#1F8A3D", icon: ArrowDownCircle },
  yok: { bg: "#F2F2F7", fg: "#6E6E73", icon: MinusCircle },
};

// Seeded PRNG so each city gets a stable, repeatable-looking history
function seedFromString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function generateHistory(city, base, cityIndex) {
  const rand = seedFromString(city + base.toFixed(2));
  const days = 30;
  const cityOffset = ((cityIndex % 7) - 3) * 0.18; // small regional variance
  let price = base + cityOffset;
  const points = [];
  const today = new Date();
  // occasional step changes (zam/indirim) rather than pure noise, more realistic for pump prices
  let stepsLeft = 0;
  let stepDir = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (stepsLeft <= 0 && rand() < 0.18) {
      stepDir = rand() < 0.5 ? -1 : 1;
      stepsLeft = 1;
    }
    if (stepsLeft > 0) {
      price += stepDir * (0.5 + rand() * 1.4);
      stepsLeft--;
    } else {
      price += (rand() - 0.5) * 0.06;
    }
    points.push({
      date: d,
      label: d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }),
      price: Math.max(1, Number(price.toFixed(2))),
    });
  }
  return points;
}

function formatTL(v) {
  return v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function CustomTooltip({ active, payload, label, color }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: "rgba(28,28,30,0.92)", color: "#fff", padding: "8px 12px",
      borderRadius: 10, fontSize: 12, fontFamily: "inherit", boxShadow: "0 4px 14px rgba(0,0,0,0.25)"
    }}>
      <div style={{ opacity: 0.7, marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, color }}>{formatTL(payload[0].value)}</div>
    </div>
  );
}

function ExpectationButton({ fuelKey, liveExpectations }) {
  const exp = (liveExpectations && liveExpectations[fuelKey]) || EXPECTATIONS[fuelKey];
  if (!exp) return null;
  const style = EXPECTATION_STYLE[exp.type];
  const Icon = style.icon;

  return (
    <button
      onClick={() => window.open(exp.url, "_blank", "noopener,noreferrer")}
      style={{
        width: "100%", textAlign: "left", border: "none", cursor: "pointer",
        background: style.bg, borderRadius: 14, padding: "10px 12px",
        marginTop: 12, display: "flex", gap: 9, alignItems: "flex-start"
      }}
    >
      <Icon size={17} color={style.fg} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: style.fg, lineHeight: 1.35 }}>
          {exp.headline}
        </div>
        <div style={{ fontSize: 11.5, color: "#6E6E73", marginTop: 2, lineHeight: 1.4 }}>
          {exp.detail}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 3, marginTop: 5,
          fontSize: 11, fontWeight: 600, color: style.fg, opacity: 0.85
        }}>
          Kaynak: {exp.source} <ExternalLink size={11} />
        </div>
      </div>
    </button>
  );
}

function FuelCard({ fuel, city, cityIndex, range, setRange, liveExpectations }) {
  const history = useMemo(() => generateHistory(city, fuel.base, cityIndex), [city, fuel.base, cityIndex]);
  const visible = range === 7 ? history.slice(-7) : history;
  const current = history[history.length - 1].price;
  const prev = history[history.length - 2].price;
  const diff = Number((current - prev).toFixed(2));
  const up = diff > 0;
  const flat = Math.abs(diff) < 0.005;
  const Icon = fuel.icon;

  return (
    <div style={{
      background: "#fff", borderRadius: 20, padding: "18px 18px 10px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 20px -12px rgba(0,0,0,0.12)",
      marginBottom: 16, border: "1px solid rgba(0,0,0,0.04)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11, background: fuel.color + "1A",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Icon size={18} color={fuel.color} strokeWidth={2.3} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: -0.2 }}>{fuel.label}</div>
            <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 1 }}>{fuel.unit}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5 }}>{formatTL(current)}</div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3,
            fontSize: 12.5, fontWeight: 600, color: flat ? "#8E8E93" : up ? "#FF3B30" : "#2FAE60", marginTop: 2
          }}>
            {!flat && (up ? <TrendingUp size={13} /> : <TrendingDown size={13} />)}
            {flat ? "Değişim yok" : `${up ? "+" : ""}${diff.toFixed(2)} ₺`}
          </div>
        </div>
      </div>

      <ExpectationButton fuelKey={fuel.key} liveExpectations={liveExpectations} />

      <div style={{ height: 130, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={visible} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
            <CartesianGrid vertical={false} stroke="#F0F0F2" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#B0B0B5" }}
              axisLine={false}
              tickLine={false}
              interval={range === 7 ? 0 : 4}
            />
            <YAxis
              domain={["dataMin - 1", "dataMax + 1"]}
              tick={{ fontSize: 10, fill: "#B0B0B5" }}
              axisLine={false}
              tickLine={false}
              width={38}
            />
            <Tooltip content={<CustomTooltip color={fuel.color} />} />
            <Line
              type="monotone"
              dataKey="price"
              stroke={fuel.color}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: fuel.color, stroke: "#fff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, paddingBottom: 4 }}>
        {[7, 30].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600,
              padding: "4px 10px", borderRadius: 20,
              background: range === r ? fuel.color : "#F2F2F7",
              color: range === r ? "#fff" : "#8E8E93",
              transition: "all .15s"
            }}
          >
            {r} Gün
          </button>
        ))}
      </div>
    </div>
  );
}

// Altın/gümüş/döviz verisi artık doğrudan xaus.com'dan DEĞİL, bizim GitHub Actions
// backend'imizin ürettiği JSON'dan okunuyor (bkz. backend/fetch-finance-data.js).
// Sebep: önizleme ortamı rastgele üçüncü parti sitelere tarayıcıdan bağlantıyı engelliyor.
const FINANCE_DATA_URL = "https://raw.githubusercontent.com/topallsolucann33-pixel/yakit-fiyatlari/main/backend/data/finance.json";

function formatNumber(v, decimals = 2) {
  return v.toLocaleString("tr-TR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function BorsaCard({ icon: Icon, color, label, sub, value, unit, changeNote }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 18, padding: "16px 18px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 20px -12px rgba(0,0,0,0.12)",
      marginBottom: 14, border: "1px solid rgba(0,0,0,0.04)",
      display: "flex", justifyContent: "space-between", alignItems: "center"
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, background: color + "1A",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}>
          <Icon size={19} color={color} strokeWidth={2.2} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.2 }}>{label}</div>
          {sub && <div style={{ fontSize: 11.5, color: "#8E8E93", marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.4 }}>
          {value} <span style={{ fontSize: 12, fontWeight: 600, color: "#8E8E93" }}>{unit}</span>
        </div>
        {changeNote && <div style={{ fontSize: 11, color: "#8E8E93", marginTop: 1 }}>{changeNote}</div>}
      </div>
    </div>
  );
}

function BorsaScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);

  const load = () => {
    setLoading(true);
    fetch(FINANCE_DATA_URL)
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        setError(false);
        setLastFetch(new Date());
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 120000); // ekran açıkken 2 dakikada bir tazele
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#8E8E93", textTransform: "uppercase", letterSpacing: 0.3 }}>
          Altın
        </div>
        <button
          onClick={load}
          style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#007AFF", fontSize: 12, fontWeight: 600 }}
        >
          <RefreshCw size={13} className={loading ? "spin" : ""} />
          Yenile
        </button>
      </div>
      <style>{`@keyframes spinAnim { to { transform: rotate(360deg); } } .spin { animation: spinAnim 0.8s linear infinite; }`}</style>

      {error && (
        <div style={{ background: "#FFF1F0", color: "#D70015", borderRadius: 14, padding: 14, fontSize: 13, marginBottom: 14 }}>
          Veri alınamadı, internet bağlantını kontrol et ve "Yenile"ye dokun.
        </div>
      )}

      <BorsaCard icon={Coins} color="#D4A017" label="Gram Altın" sub="24 Ayar" value={data?.gramAltinTry ? formatNumber(data.gramAltinTry) : "—"} unit="₺" />
      <BorsaCard icon={Coins} color="#D4A017" label="Çeyrek Altın" sub="Yaklaşık, piyasa primi dahil" value={data?.ceyrekAltinTry ? formatNumber(data.ceyrekAltinTry) : "—"} unit="₺" />
      <BorsaCard icon={Coins} color="#B08D57" label="Ons Altın" sub="XAU / USD" value={data?.onsAltinUsd ? formatNumber(data.onsAltinUsd) : "—"} unit="$" />
      <BorsaCard icon={Coins} color="#9CA3AF" label="Gümüş" sub="Gram, XAG" value={data?.gumusGramTry ? formatNumber(data.gumusGramTry) : "—"} unit="₺" />

      <div style={{ fontSize: 13, fontWeight: 700, color: "#8E8E93", textTransform: "uppercase", letterSpacing: 0.3, margin: "18px 0 4px" }}>
        Döviz
      </div>
      <BorsaCard icon={DollarSign} color="#1F8A3D" label="Dolar" sub="USD/TRY" value={data?.usdTry ? formatNumber(data.usdTry, 4) : "—"} unit="₺" />
      <BorsaCard icon={DollarSign} color="#2E7DD1" label="Euro" sub="EUR/TRY" value={data?.eurTry ? formatNumber(data.eurTry, 4) : "—"} unit="₺" />
      <BorsaCard icon={DollarSign} color="#7C3AED" label="Sterlin" sub="GBP/TRY" value={data?.gbpTry ? formatNumber(data.gbpTry, 4) : "—"} unit="₺" />

      <div style={{ fontSize: 11.5, color: "#B0B0B5", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
        Fiyatlar gösterge niteliğindedir, alım-satım için bankanızın/kuyumcunuzun güncel kurunu kontrol edin.
        {data?.updatedAt && ` Veri kaynağı ${new Date(data.updatedAt).toLocaleString("tr-TR")} itibarıyla güncellendi.`}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("yakit"); // "yakit" | "borsa" — açılışta hep Yakıt gelir
  const [city, setCity] = useState("İstanbul");
  const [cityLoaded, setCityLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState(30);
  const [liveExpectations, setLiveExpectations] = useState(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);
  const inputRef = useRef(null);

  // En son seçilen şehri hatırla — uygulama tekrar açıldığında o şehirle başlasın
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage?.get("lastCity", false);
        if (result?.value && CITIES.includes(result.value)) {
          setCity(result.value);
        }
      } catch (e) {
        // ilk açılış / kayıtlı şehir yok — varsayılan (İstanbul) ile devam
      } finally {
        setCityLoaded(true);
      }
    })();
  }, []);

  const selectCity = (c) => {
    setCity(c);
    setSheetOpen(false);
    window.storage?.set("lastCity", c, false).catch(() => {});
  };

  useEffect(() => {
    if (!REMOTE_EXPECTATIONS_URL) return;
    fetch(REMOTE_EXPECTATIONS_URL)
      .then((r) => r.json())
      .then((data) => {
        setLiveExpectations(data.expectations || null);
        setLiveUpdatedAt(data.updatedAt || null);
      })
      .catch(() => {
        // Sessizce mock veriye geri düş
      });
  }, []);

  useEffect(() => {
    if (sheetOpen) setTimeout(() => inputRef.current?.focus(), 250);
    else setQuery("");
  }, [sheetOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return CITIES;
    return CITIES.filter((c) => c.toLocaleLowerCase("tr-TR").includes(q));
  }, [query]);

  const cityIndex = CITIES.indexOf(city);

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
      background: "#F2F2F7", minHeight: "100vh", maxWidth: 430, margin: "0 auto",
      position: "relative", overflow: "hidden"
    }}>
      {/* Top bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(242,242,247,0.85)", backdropFilter: "blur(20px)",
        padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: "1px solid rgba(0,0,0,0.06)"
      }}>
        {activeTab === "yakit" ? (
          <>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Yakıt Fiyatları</div>
              <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 1 }}>Günlük güncel pompa fiyatları</div>
            </div>
            <button
              onClick={() => setSheetOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 4, background: "#fff",
                border: "1px solid rgba(0,0,0,0.06)", borderRadius: 20, padding: "8px 12px 8px 14px",
                fontSize: 14.5, fontWeight: 700, color: "#1C1C1E", cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
              }}
            >
              {city}
              <ChevronDown size={16} color="#8E8E93" />
            </button>
          </>
        ) : (
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Borsa</div>
            <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 1 }}>Altın ve döviz, anlık</div>
          </div>
        )}
      </div>

      {/* Content */}
      {activeTab === "yakit" ? (
        <div style={{ padding: "16px 16px 90px" }}>
          {FUELS.map((f) => (
            <FuelCard key={f.key} fuel={f} city={city} cityIndex={cityIndex} range={range} setRange={setRange} liveExpectations={liveExpectations} />
          ))}
          <div style={{ fontSize: 11.5, color: "#B0B0B5", textAlign: "center", marginTop: 4, lineHeight: 1.5 }}>
            Fiyat grafikleri örnek verilerdir.{" "}
            {liveExpectations
              ? `Zam/indirim beklentileri ${new Date(liveUpdatedAt).toLocaleString("tr-TR")} itibarıyla otomatik taramadan güncellendi.`
              : "Zam/indirim beklentileri örnek veridir; backend bağlandığında günde 3 kez otomatik güncellenecektir."}
          </div>
        </div>
      ) : (
        <BorsaScreen />
      )}

      {/* Alt sekme çubuğu */}
      <div style={{
        position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 0,
        width: "100%", maxWidth: 430, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", zIndex: 15,
        paddingBottom: "env(safe-area-inset-bottom, 0px)"
      }}>
        {[
          { key: "yakit", label: "Yakıt", icon: Fuel },
          { key: "borsa", label: "Borsa", icon: Coins },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, border: "none", background: "transparent", cursor: "pointer",
                padding: "9px 0 8px", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 2
              }}
            >
              <Icon size={22} color={active ? "#007AFF" : "#8E8E93"} strokeWidth={active ? 2.4 : 2} />
              <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500, color: active ? "#007AFF" : "#8E8E93" }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* City picker sheet */}
      {sheetOpen && (
        <>
          <div
            onClick={() => setSheetOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 20, maxWidth: 430, margin: "0 auto" }}
          />
          <div style={{
            position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 0,
            width: "100%", maxWidth: 430, background: "#fff", zIndex: 21,
            borderRadius: "22px 22px 0 0", boxShadow: "0 -8px 30px rgba(0,0,0,0.2)",
            height: "78vh", display: "flex", flexDirection: "column",
            animation: "slideUp .28s ease-out"
          }}>
            <style>{`@keyframes slideUp { from { transform: translate(-50%, 100%);} to { transform: translate(-50%, 0);} }`}</style>
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "#D1D1D6" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px 8px" }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Şehir Seç</div>
              <button onClick={() => setSheetOpen(false)} style={{
                border: "none", background: "#F2F2F7", borderRadius: "50%", width: 30, height: 30,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
              }}>
                <X size={16} color="#8E8E93" />
              </button>
            </div>
            <div style={{ padding: "4px 16px 10px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, background: "#F2F2F7",
                borderRadius: 12, padding: "9px 12px"
              }}>
                <Search size={16} color="#8E8E93" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Şehir ara"
                  style={{ border: "none", outline: "none", background: "transparent", fontSize: 15, flex: 1, color: "#1C1C1E" }}
                />
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "0 8px 24px" }}>
              {filtered.map((c) => (
                <button
                  key={c}
                  onClick={() => selectCity(c)}
                  style={{
                    width: "100%", textAlign: "left", padding: "13px 14px", border: "none",
                    background: c === city ? "#F2F2F7" : "transparent", borderRadius: 12,
                    fontSize: 15.5, fontWeight: c === city ? 700 : 500,
                    color: c === city ? "#007AFF" : "#1C1C1E", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center"
                  }}
                >
                  {c}
                  {c === city && <span style={{ fontSize: 13 }}>✓</span>}
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", color: "#8E8E93", padding: 30, fontSize: 14 }}>
                  Sonuç bulunamadı
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
