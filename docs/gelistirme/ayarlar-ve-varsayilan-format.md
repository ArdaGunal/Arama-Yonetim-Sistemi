# Ayarlar ve varsayılan format

## Amaç

Ana ekran yalnızca günlük işe giriş sağlar. Sağ üstteki **Ayarlar** içinde yedek, tanılama ve yeni etkinlik varsayılanları bulunur. Tercihler yalnızca bu cihazdaki **yeni** etkinlikleri etkiler; mevcut etkinlik ve cevaplar değişmez.

## Kişi listesi

Metin yapıştırmada dört düzen seçilebilir: isim–telefon (ilk kurulum varsayılanı), telefon–isim, yalnız telefon, başlıklı tablo. Başlıklı tabloda ilk satır sütun adıdır; Tab veya noktalı virgül sütunları ayırır. Excel/CSV dosyalarında kaynak önizleme ve sütun düzeltme her zaman kullanılabilir. Yalnız telefonlu satırın adı açıkça **İsimsiz kişi** olur ve görüşme sırasında düzeltilebilir. Telefon her kişi için zorunludur; aynı numara incelemesiz iki kez ana listeye girmez.

## Sorular ve paylaşım

Şablon düzenleyici sadece ek soruları, türlerini, şıklarını ve zorunluluklarını gösterir. İsim ve telefon arama kimliği olarak korunur. Sıfır ek soru da geçerli bir düzendir. Seçilen şablon yeni etkinlikte kendiliğinden açılır; etkinlik kurulurken başka bir şablon veya standart düzen seçilebilir.

Kaynak tablodaki sütun adı bir soru adıyla aynıysa yazılı veya şıklı soruya bağlanır. Şıklı sütun değeri seçeneklerde yoksa etkinlik kurulurken açık hata gösterilir; sessizce farklı bir cevaba dönüştürülmez.

`.ayst` şablon sürüm 2, sorulara ve kaynak sütun eşleştirmesine ek olarak metin yapıştırma düzenini taşır. İçe alınan şablon cihazda saklanır ve varsayılan seçilir. Eski sürüm 1 okunur; metin düzeni isim–telefon kabul edilir. Şablon **kişi listesi veya cevap içermez**. Başka cihaza şablon aktarılabilir; uygulama verileri için ayrıca `.ays` etkinlik yedeği gerekir.

## Veri sınırı ve kontrol

Tercihler AsyncStorage'da `@ays_app_settings_v1` altında tutulur. Var olan `.ays` yedeklerinin biçimi değişmez. Cihaz tercihi `.ays` etkinlik yedeğinin parçası değildir; soru düzeni `.ayst` olarak ayrıca paylaşılmalıdır. Ayar kaydı bozuksa uygulama sessizce üzerine yazmaz ve tanılama raporu oluşturur.

Kontrol komutları: `npm test`, `npm run build:web`, `npm run benchmark:large`, `localapk.bat nopause`. 1.0.15/b16 Android emülatöründe ayar seçimi ve kalıcılığı, varsayılan liste düzeninin yeni etkinliğe yansıması, soru/şık editörü, yedek ve tanılama bağlantıları ve mevcut projelerin korunması denendi. Şablon dosyası sürüm 1/2 okuma ve kaynak sütun eşleşmesi otomatik testte doğrulandı. Şablonun iki gerçek Android cihaz arasında WhatsApp ile aktarımı ve gerçek iPhone testi cihaz bulunana kadar açıktır.
