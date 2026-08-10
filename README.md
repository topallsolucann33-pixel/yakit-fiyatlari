# Akaryakıt Haber Tarama Sistemi — Kurulum

Bu sistem, günde **3 kez** (07:00 / 17:00 / 00:15 – Türkiye saati) otomatik olarak
akaryakıt haber sitelerini tarar, Gemini API ile "zam mı indirim mi bekleniyor"
bilgisini yapılandırılmış veriye çevirir ve `data/expectations.json` dosyasına yazar.
Uygulama bu dosyayı okuyarak kartlardaki beklenti kutularını günceller.

## Neden bu 3 saat?

Güncel haberleri incelediğimde şu ritim ortaya çıktı:

- **16:00** → Rafineriler (TÜPRAŞ vb.) günlük fiyat listesini dağıtım şirketlerine bildiriyor.
  Bu yüzden **17:00** taraması, akşam için "bu gece ne bekleniyor" haberlerini yakalıyor.
- **00:01** → Yeni fiyatlar resmen yürürlüğe giriyor. **00:15** taraması, "gece yarısı zam/indirim geldi" haberlerini yakalıyor.
- Sabah siteler önceki gece netleşen durumu özetliyor. **07:00** taraması bunu yakalıyor.

## Kurulum Adımları

1. Bu `backend/` klasörünü kendi GitHub reponuza yükleyin (örn. `yakit-fiyatlari-backend`).
2. Repo → **Settings → Secrets and variables → Actions** yolundan yeni bir secret ekleyin:
   - Adı: `GEMINI_API_KEY`
   - Değeri: Google AI Studio'dan aldığınız ücretsiz API anahtarı (aistudio.google.com/apikey)
   - **Önemli:** Bu anahtarı hiçbir zaman kod içine yazmayın veya sohbette paylaşmayın —
     yalnızca bu "Secrets" ekranına girin, orada şifreli saklanır ve kimseye görünmez.
3. Repo → **Settings → Actions → General** kısmından "Workflow permissions"ı
   **Read and write permissions** olarak ayarlayın (script sonucu otomatik commit'leyebilsin diye).
4. `.github/workflows/scrape-fuel-news.yml` otomatik olarak günde 3 kez çalışmaya başlayacak.
   İlk testi beklemeden görmek isterseniz: repo → **Actions** sekmesi →
   "Akaryakıt Haber Taraması" → **Run workflow** ile manuel tetikleyebilirsiniz.
5. Script her çalıştığında `backend/data/expectations.json` dosyasını günceller ve commit'ler.
   Bu dosyanın "raw" linkini kopyalayın, örn:
   `https://raw.githubusercontent.com/KULLANICI_ADIN/REPO_ADIN/main/backend/data/expectations.json`
6. `yakit-fiyatlari.jsx` dosyasındaki `REMOTE_EXPECTATIONS_URL` sabitine bu linki yapıştırın.
   Uygulama artık her açılışta canlı veriyi çekecek.

## Kaynak listesini genişletmek

`scrape-fuel-news.js` içindeki `SOURCES` dizisine istediğiniz haber sitesini
`{ name, url }` formatında ekleyebilirsiniz. EPDK'nin kendi sitesinde de
duyuru/istatistik sayfaları var — resmi bir API sunmuyor ama aynı yönteme
(sayfayı çekip Claude ile özetletme) o sayfa için de eklenebilir.

## Maliyet notu

Her çalıştırmada kaynak başına 1 Gemini API çağrısı yapılıyor (5 kaynak x günde 3 kez
= günde 15 çağrı). `gemini-2.5-flash` modelinin ücretsiz kullanım kotası bu hacim için
büyük olasılıkla yeterli olacaktır (Google AI Studio'da güncel ücretsiz kota limitlerini
kontrol edebilirsiniz). GitHub Actions tarafı da ücretsiz kota içinde kalır
(günde ~3-6 dakika, aylık ücretsiz 2.000 dakikanın çok altında).
