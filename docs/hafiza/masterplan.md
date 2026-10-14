# Master plan — Arama ve Anket

**Başlangıç:** 14 Ekim 2026. **Amaç:** Teknik bilgisi az olan gönüllünün arama veya anket işini karıştırmadan tamamlaması; koordinatörün kişi ve cevap kaybetmeden dosyaları dağıtıp toplaması. Android APK ve statik PWA aynı dosya sözleşmesini kullanır. Sunucu ve merkezi veritabanı kurulmaz.

Bu belge bundan sonraki işlerin öncelik sırasıdır. [Önceki ürün planı](plan.md) arama/görev kararlarının ayrıntılı geçmişidir; bu master plan yapılacak değişiklikleri yönetir. Her fazın bitişi, aşağıdaki **kabul ölçütleri** karşılanınca kaydedilir. Özellikle depolama, yedek, birleştirme ve dosya sözleşmesindeki değişiklikler Android emülatöründe ayrıca denenir. Gerçek iPhone testi cihaz bulunduğunda yapılır.

## 1. Ürün sınırı ve iki ana yol

| Yol | İlk ekran | Temel kayıt | Paylaşım | Dışa aktarma |
| --- | --- | --- | --- | --- |
| **Arama** | Ad → kişi listesi/Excel → sorular | Kalıcı `recordId` ve telefon; arama durumu ile soru cevapları ayrı | Görev ve sonuç paketleri, yedek | Kaynak Excel + güncel durum + arama geçmişi |
| **Anket** | Ad → sorular; kişi listesi yok | Her doldurmaya ayrı `responseId` ve zaman | Şablon, yedek; çok cihazlı cevap paketi sonraki faz | Yanıt zamanı/kimliği + sorular |

Ana ekrandaki **Yeni Proje Oluştur** önce **Arama** ve **Anket** seçeneklerini gösterir. Tür seçildikten sonra oluşturma içinde değişmez. Geri gidip diğer tür seçilebilir; tür değiştirme, doldurulmuş formu veya listeyi sessizce silmez. Şablonlar yalnızca kendi türünde görünür. Önceden kayıtlı `mode` alanı olmayan projeler `calls` olarak okunur; veri topluca dönüştürülmez.

Anket varsayılan olarak **tek cihazda veri toplama** işidir. İsim/telefon zorunlu değildir. Anonim yanıtların aynı kişiden gelip gelmediği güvenilir biçimde saptanamaz; iki yanıtı otomatik birleştirmek için açıkça seçilmiş bir yanıtlayan anahtarı gerekir. Arama görevlerindeki telefon benzersizliği anketlere uygulanmaz.

## 2. Mevcut kodun risk haritası (başlangıç envanteri)

| Yer | Gözlenen durum | Risk | Hedef |
| --- | --- | --- | --- |
| `src/screens/NewProjectScreen.js` (~404 satır) | Excel okuma, şablon, soru düzenleme ve iki türün kaydı tek ekranda | Bir türde değişiklik diğerini etkileyebilir; türü şablon da değiştirebiliyor | Ayrı arama/anket oluşturma denetleyicileri; ortak soru düzenleyici |
| `src/features/new-project/Step1Info.js` | Kişi listesi `×` ile kaldırılıyor, anket aynı ekrana sıkıştırılmış | Yanlışlıkla liste kaybı; anketi bulmak zor | Açık tür seçimi ve iki ayrı ilk adım |
| `src/features/new-project/Step2Review.js` | Kişi incelemesi ile anket soruları aynı JSX içinde koşullu | `source`/`analysis` boşken hata riski | `CallSourceReview`, `QuestionEditor`, `SurveyBuilder` bileşenleri |
| `src/utils/storage.js` (~1090 satır) | Proje, yedek, görev, sonuç, şablon ve anket yanıtı aynı modülde | Yazma sırası ve geri alma kuralları okunması zor | Tek işlem kuyruğu korunarak alan bazlı depolar/repository'ler |
| `src/utils/backupFormat.js` (~373 satır) | Çağrı kişisi ve anket yanıtı aynı `contacts` dizisinde; anket `phone: ''` taşır | Yanlış dalda telefon/görev kuralı uygulanabilir | Ayrı `CallContact`/`SurveyResponse` doğrulayıcısı ve sürümlü uyumluluk katmanı |
| `src/context/SurveyContext.js` (~452 satır) | Arama durumu ve otomatik kayıt; bazı yazma hataları `console.error` ile geçiliyor | Kullanıcı kayıt başarısızlığını fark etmeyebilir | Görünür hata/yeniden dene, kaydediliyor/kaydedildi durumu |
| `src/utils/exportUtils.js` | Arama ve anket Excel/CSV dalları aynı modülde | Sütun kayması/yanlış alan aktarımı | Ayrı saf tablo üreticileri; ortak dosya yazma katmanı |
| `tests/regression.test.cjs` | 46 senaryo tek dosyada | İlgili testleri bulmak ve izole çalıştırmak zor | Format/depo/görev/anket test dosyalarına kademeli bölme |
| `docs/` | Eski plan ve dosya sözleşmesi bazı şema sürümlerini eski gösteriyor | Devralan kişi yanlış biçim uygulayabilir | Sürüm tablosunu kodla eşzamanlı tutma ve devir kontrol listesi |

**İlke:** Sırf dosyaları küçültmek için çalışan kodu yeniden yazma. Her taşıma küçük, davranış koruyan bir adım olacak; önce mevcut davranışa regresyon testi, sonra taşıma. `contacts` veri anahtarını veya `.ays` içeriğini tek seferde değiştirme.

## 3. Hedef dosya ve sorumluluk yapısı

```text
src/
  domain/
    projects/       mode, kimlik, sürüm ve geçiş kuralları
    forms/          alan/şık doğrulama, önizleme modeli, şablon
    calls/          kişi havuzu, tekrar, görev ve geri arama kuralları
    surveys/        yanıt, taslak, çok cihazlı paket ve birleştirme kuralları
  data/
    projectStore/   metadata, kişi/yanıt yan dosyaları, yazma kuyruğu
    files/          .ays/.ayst kodlayıcı ve sürüm adaptörleri
  features/
    calls/           arama ekranı ve proje hazırlama (başlandı)
    surveys/         anket ekranı ve proje hazırlama (başlandı)
    new-project/     iki türün ortak soru/şablon bileşenleri
    backup/
  screens/          yalnızca gezinme ve ekran bileşimi
  theme/            renk, yazı ve dokunma ölçüleri
tests/
  domain/ data/ flows/ compatibility/
```

Bu **hedef yapı**dır; mevcut dosyalar bir anda taşınmaz. `storage.js` önce mevcut API'yi koruyan bir giriş modülü olarak kalır. İç fonksiyonlar alan bazlı modüllere taşındıkça ekran importları değişmez. Dış dosya sürümleri yalnızca biçim değişirse artırılır; dosya taşıma tek başına şema sürümü artırmaz.

**400 satır kuralı:** `src/features/calls/` ve `src/features/surveys/` altındaki her klasörde **doğrudan duran** `.js`, `.jsx`, `.ts`, `.tsx` dosyalarının fiziksel satır toplamı en fazla 400'dür. Bir alt klasör açılırsa onun da doğrudan kaynak toplamı ayrıca 400'ü geçemez; böylece sınırsız büyüyen tek bir klasör oluşmaz. `npm test` içindeki `scripts/check-feature-size.mjs` bu sınırı CI'da uygular. Ortak soru/şablon kodu `new-project/` içinde kalır; sırf sayıyı tutturmak için aynı kod iki türe kopyalanmaz. Arama veya Anket'e özgü kod başka yerde kaldığı sürece ayrım tamamlandı sayılmaz.

## 4. Fazlar ve kesin bitiş koşulları

### Faz 0 — Envanter ve güvenli temel

**Durum:** Tamamlandı. Kod ve dosya akışları tarandı; 46 regresyon testi, web derlemesi ve 5.000 kişi/100 görev sentetik ölçümü başlangıç noktası. 1.0.17/b18 APK eski veriler üzerinde emülatöre kuruldu. Eski sürüm yedekleri ve APK arşivi saklanır.

1. `main` ve yerel değişiklikleri kaydet; gerçek telefon/cevap dosyalarını Git'e alma.
2. `.ays` sürüm 1–7, `.ayst` sürüm 1–3, görev/sonuç paketleri için okuma matrisi çıkar.
3. Arama ve anket akışlarını ekran → depo → yedek → çıktı olarak diyagramla; her kayıt noktasında başarısızlık davranışını belirt.
4. `npm test`, web derlemesi, 5.000 kişi ölçümü ve Android mevcut veriyle yükseltme sonucunu baz çizgiye yaz.
5. Depo dosya sözleşmesi ve mevcut durum belgesindeki eski sürüm ifadelerini düzelt.

**Bitiş:** Her kalıcı veri türünün sahibi, dosya sürümü ve geri dönüş yolu belgeli; ana akışlar için başlangıç testi mevcut.

**Kalıcı veri ve dosya matrisi:**

| Veri | Yerel sahibi | Paylaşılan biçim | Eski sürüm okuma | Kurtarma yolu |
| --- | --- | --- | --- | --- |
| Arama projesi ve kişiler | `storage.js`, metadata + kişi yan dosyası | `.ays` yedek v7 | v1–6 | Dış yedek; tekrarlı içe alma kimliğe göre güvenli |
| Anket ve yanıtlar | `storage.js`, şimdilik aynı yan dosya | `.ays` yedek v7, `mode: survey` | v7 anket; v1–6 arama | Dış yedek; başka cihazla otomatik yanıt birleşimi henüz yok |
| Form şablonu | Şablon deposu | `.ayst` arama v2, anket v3 | v1–3 | Şablon tekrar içe aktarılabilir; kişisel cevap taşımaz |
| Arama görevi | Görev deposu | `.ays` görev v2 | v1–2 | Ana koordinatör projesi ve görev dosyası |
| Arama sonucu | Gelen kutusu, birleştirme günlüğü | `.ays` sonuç v2 | v1–2 | Birleştirme öncesi dış yedek, kesinti günlüğü |
| Orijinal Excel | Kaynak çalışma kitabı yan dosyası | Tam yedekte ek, ayrıca aynen dışa aktarım | Kaynak eki olmayan eski projede yok | Topluluk arşivindeki ilk Excel |

**Kayıt akışları:** `Arama seç → listeyi ayrıştır → tekrar/sütun incele → proje ve kişiler → görev ayır → sonuç gelen kutusu → önizleme/çakışma → yedek → birleştir → Excel`. Ayrıştırma/kayıt hatası ekranda kalır; görev ve birleştirme değişikliklerinde yedek ve kurtarma günlüğü devrededir. `Anket seç → soruları hazırla → proje oluştur → cevap formu → cihazdaki yanıt → yedek/Excel`. Cevap kaydı başarısızsa ekranda hata görünmelidir; henüz kaydedilmemiş form cevabının yeniden açılması Faz 3 kapsamındadır.

### Faz 1 — Tür seçimi ve ilk ekranların ayrılması

**Durum:** Tamamlandı (1.0.17/b18). Emülatörde iki kart, türlere özgü ilk adım, boş ad uyarısı, anket önizlemesi ve iki türün proje kaydı doğrulandı. Mevcut projeler korunarak yükseltildi.

1. Ana buton iki kartlı seçim ekranını açar: **Arama** / **Anket**. Kartlar tek cümleyle farkı anlatır ve en az 44 dp dokunma alanı sağlar.
2. Arama ilk ekranı yalnız ad, kişi listesi ve arama şablonlarını gösterir. Anket ilk ekranı yalnız ad, soru başlangıcı ve anket şablonlarını gösterir.
3. Kişi listesi kartındaki `×` ve listeyi kaldır/geri ekle geçişleri silinir. Tür seçimi şablon tarafından değiştirilmez; yanlış türde şablon açıklayıcı mesajla reddedilir.
4. İki yol da mevcut 2 adımlı oluşturmayı korur. Oluşturma bitince seçim ekranında kalmadan ana ekrana döner. Mevcut projeler ve dosyalar değişmez.
5. Android emülatöründe iki kart, geri, boş ad, anket kaydı, arama listesi, eski projelerin açılması; web derlemesi ve regresyon testi doğrulanır.

**Bitiş:** Çarpı yok; her tür kendi ilk adımına gider; varsayılan şablon diğer türü sessizce açmaz; mevcut veri korunur.

### Faz 2 — Davranışı değiştirmeden kodu ayırma

**Durum:** Başlandı. İlk adım ekranları ve proje hazırlama kuralları `calls/` ile `surveys/` içine taşındı; ekran ortak kalırken iki türün proje nesnesi ayrı saf fonksiyonlarla üretiliyor. Yeni testler veri biçimi ayrımını doğruluyor. Depolama, dışa aktarma ve ikinci adımın ayrılması henüz sürüyor.

1. `NewProjectScreen` içindeki kaynak Excel/metin ayrıştırma ve kaydetme hazırlığını saf fonksiyonlara çıkar. Arama ve anket için ayrı kaydetme komutları oluştur; ortak alan doğrulamasını tek yerde tut.
2. `Step2Review` içinden kişi/sütun/tekrar incelemesini ayır. Ortak soru editörü, iki türden de aynı davranışı versin; önizleme kayıt yazmasın.
3. Depoyu önce okuma, sonra yazma işlemleri halinde modüllere ayır. Mevcut `enqueueWrite` tek sıra garantisini ve merge journal kurtarmasını koru. Her taşıma sonrası arama/görev/yedek regresyonunu çalıştır.
4. `exportUtils` içinde arama ve anket satır üreticilerini ayır; Excel/CSV sütunlarını aynı saf modelden üret. Sıfırla başlayan telefon/okul numarası metin kalsın.
5. 46 testlik dosyayı alanlara göre böl; fixture'lar sentetik kalsın. Yeni modüllerde anlamsız `catch {}` ve `console.error` ile kullanıcıdan gizlenen yazma hatalarını incele, görünür hata ve yeniden deneme ekle.

**Bitiş:** Ekranlar veri sözleşmesi ayrıntısını bilmez; aynı `.ays`, Excel ve görev sonuçları önceki sürümle eşdeğer çıkar. Büyük taşımalarda Android duman testi geçer.

### Faz 3 — Anket verisi ve veri kaybına karşı koruma

1. Şu an `contacts` yan dosyasında tutulan listesiz yanıtları ayrı `responses` modeliyle temsil et. Eski `mode: survey` projeleri yüklemede kayıpsız adaptörle oku; yeni şemaya geçiş için atomik yazma günlüğü ve geri alma testi hazırla.
2. Kaydedilmemiş anketi yerel taslak olarak sakla. Form açıldığında kaldığı yerden devam, **Taslağı sil** ve **Cevabı kaydet** açık ayrılır. Taslak `.ays` yedeğine nasıl gireceği karara bağlanmadan geçiş yapılmaz.
3. Yanıt listesi: zaman, ilk anlamlı cevap, arama, ayrıntı. Düzeltme/silme için önce geri alınabilir işlem veya güncel yedek. Her yanıtın kalıcı kimliği ve düzenleme geçmişi korunur.
4. Form sürümü değiştiğinde eski yanıtlar eski alanlarla korunur. Yeni zorunlu alan eski yanıtı geriye dönük geçersiz yapmaz. Excel/CSV eski sürüm alanlarını açık etiketlerle verir.
5. Anket yedeğini dışarı kaydetme hatası ekranda görünür; web depolama temizlenmesi ve uygulama zorla kapanması test edilir.

**Bitiş:** Başlanmış ama kaydedilmemiş yanıt yeniden açılır; kayıtlı yanıt ve taslak yedek/geri yükleme sonrası kaybolmaz; eski 1.0.16 anketleri okunur.

### Faz 4 — Dosyayla çok cihazlı anket toplama

1. Koordinatör anket şablonunu/form paketini paylaşır; karşı cihaz aynı `eventId` ve `formVersion` ile doldurur. Sunucu gerekmez.
2. Yanıt paketi `eventId`, `formVersion`, kaynak cihaz kimliği, paket kimliği/sürümü ve her yanıtın kalıcı `responseId` değerini taşır. Bütünlük özeti bozulmayı saptar; kimlik doğrulama veya şifreleme iddiası taşımaz.
3. Aynı paket ve aynı yanıt tekrar açılınca ikinci kayıt oluşmaz. Aynı kimlik farklı içerikle gelirse otomatik üzerine yazılmaz; koordinatör önizler. İki anonim yanıtın aynı insana ait olduğu varsayılmaz.
4. Birleştirmeden önce güncel dış yedek zorunlu, yazma sırasında kesinti için kurtarma günlüğü zorunlu. Gönüllüye **Gönderilmeyen yanıt var** uyarısı ve tek büyük paylaş butonu verilir.
5. Eski sürüm/yanlış etkinlik/eksik dosya/iPhone'dan gelen dosya senaryoları, ters sıra ve yinelenen paketler test edilir.

**Bitiş:** İki cihazın 10 + 7 yanıtı, tekrarlanan dosya yeniden açıldığında da 17 kalır; çakışma görünür; eski cevap sessizce silinmez.

### Faz 5 — Saha kullanımını basitleştirme

1. Ana sayfada tür rozeti ve türe özgü birincil eylem: **Aramaya başla** veya **Anketi doldur**. Gönüllü görev dosyası açma önde kalır; koordinatöre ait seçenekler gönüllüde görünmez.
2. Her ekranda tek baskın eylem; teknik kelimeler yardım bölümünde. Hata mesajı neyin yanlış olduğunu ve düzeltme yolunu söyler. Erişilebilir etiket, yeterli kontrast/dokunma alanı, büyük yazı ve klavye kapatma kontrolü yapılır.
3. Kısa içe alma rehberi, örnek veriyle güvenli deneme, anket önizlemesinde kalıcı kayıt yapılmadığını açık işaretleme.
4. Gelişmiş form mantığı (şarta göre soru, sayı/tarih doğrulama) **ayrı isteğe bağlı bölümde** ve görsel kurallarla gelir; varsayılan anket basit kalır. Yanıt dışa aktarımında alan kimlikleri sabit tutulur.

**Bitiş:** İlk kez kullanan kişi yardım almadan proje türünü seçip ilk cevabı kaydeder; yanlış/eksik adımda neden ve çözüm görünür. Kullanılabilirlik denemesi en az üç teknolojiye uzak gönüllüyle yapılır.

### Faz 6 — Platform, sürüm ve devir kabulü

1. Android APK: temiz kurulum, eski sürüm üstüne güncelleme, çevrimdışı, uygulamayı zorla kapatma, WhatsApp/Dosyalar açma, yedek ve Excel paylaşımı.
2. PWA: çevrimdışı tekrar açma, güncelleme önbelleği, depolama izni ve sekme kapanışı. Gerçek iPhone bulunduğunda Safari Ana Ekran, Dosyalar ve WhatsApp alışverişi ile geri yükleme.
3. 5.000 kişi/100 görev ölçümü ve anket tarafında binlerce yanıt için açılış/kayıt/Excel süresi. Hedefler ölçümden sonra cihaz sınıfına göre konur; testin geçmesi için veri bütünlüğü şarttır.
4. `docs/` devir kılavuzu, sürüm tablosu, dosya örnekleri (sentetik), yayın adımları ve kurtarma senaryoları güncel kalır. APK `APK/` arşivine sürüm koduyla girer, GitHub'a yalnız kaynak kodu gönderilir.

**Bitiş:** Android kabul matrisi ve web testleri geçer; iPhone sonucu gerçek cihazla kaydedilir. Yeni sorumlu README'den APK üretebilir ve `.ays` yedeğini geri yükleyebilir.

## 5. Benzer ürünlerden seçilen fikirler

| Kaynak | Gözlenen fikir | Bizdeki karar |
| --- | --- | --- |
| [ODK Collect — form yönetimi](https://docs.getodk.org/collect-forms/) | Çevrimdışı doldurmada taslak ve sonlandırılmış kayıt ayrı; taslak doğrulama durumu görünür. Sunucusuz form yönetimi de belgeli. | Anket taslağı/bitmiş yanıt ayrımı Faz 3; sunucu gerektirmeyen dosya akışı korunur. |
| [ODK Central — form sürümleri](https://docs.getodk.org/central-forms/) | Taslak form gerçek cevaplara karışmadan test edilir; eski sürüm yanıtları korunur. | Mevcut kaydetmeyen önizleme korunur; sürüm/alan kimliği regresyonu genişletilir. |
| [KoboToolbox — soru kütüphanesi](https://support.kobotoolbox.org/question_library.html) | Sorular ve şıklar yeniden kullanılabilir. | Mevcut `.ayst` şablonunu önce sağlamlaştır; sonra soru blokları ekle. |
| [KoboToolbox — form mantığı](https://support.kobotoolbox.org/form_logic.html) ve [Google Forms — koşullu bölümler](https://support.google.com/docs/answer/141062?hl=en) | İlgisiz sorular gizlenebilir; şık temelli dallanma yapılabilir. | Basit ankette gizli kalır; Faz 5'te isteğe bağlı, test edilebilir kural düzenleyici olarak değerlendirilir. |
| [KoboToolbox — web formları](https://support.kobotoolbox.org/data_through_webforms.html?highlight=collecting+data+) | Tarayıcıda taslak, çevrimdışı toplama ve kuyruk dışa aktarma akışları var. | Statik PWA'da yanıtlar cihazda kalır; dosyayla paylaşma/kurtarma görünür yapılır. |

Bu ürünler bazı akışlarda sunucu kullanır. Burada onların sunucu bağımlı yönetim modelini kopyalamıyoruz; yalnız veri kaybını azaltan ve kullanıcıyı doğru adıma götüren tasarım ilkelerini alıyoruz.

## 6. Her değişiklik için kontrol listesi

1. Değişikliğin **arama mı, anket mi, ortak mı** olduğunu yaz; diğer türün etkilenmemesi için uygun test seç.
2. Kalıcı veri veya dış dosya değişiyorsa eski sürüm okuma testi, yedek/geri yükleme ve kesinti testi ekle; şema sürümü gerekçesini belgeye yaz.
3. Yanlışlıkla gerçek kişi/telefon veya test yedeği Git'e girmesin. Testlerde sentetik numara kullan; gerçek numarayı arama.
4. `npm test`, web derlemesi ve `git diff --check` çalıştır. Riskli depolama/merge/UI değişiminde Android APK kurup ilgili yolu elle dene. Aynı güvenli kontrolü gereksiz yere her küçük taşıma için tekrarlama.
5. Başarılı fazın sürümünü, testini, APK yerini ve kalan sınırlamayı `proje-durumu.md` içine yaz; sonra kaynak kodu GitHub'a gönder.
