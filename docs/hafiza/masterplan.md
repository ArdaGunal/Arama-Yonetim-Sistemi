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

**Detaylı anket yolu:** Tür seçimi ekranında geliştiricinin [Anket Platformu](https://anketplatformu.com/) sitesine açık bir bağlantı bulunur. Uygulamadaki Anket temel ve cihazda saklanan akıştır; ayrıntılı anket hazırlamak isteyen kişi siteyi tarayıcıda açar. İki hizmet arasında hesap, form veya cevap aktarımı yoktur. Dış site seçeneği reklâm olarak açıkça etiketlenir; uygulamadaki temel Anket yolunu engellemez.

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
| `tests/regression-*.test.cjs` | 88 senaryo proje, arama/görev ve anket dosyalarında | Ortak test düzeneği `tests/support/regressionHarness.cjs` içinde | Yeni senaryoyu ilgili alan dosyasına ekle |
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
    forms/           iki türün ortak soru/şık düzenleyicisi
    new-project/     oluşturma kabuğu, önizleme ve şablon seçimi
    backup/
  screens/          yalnızca gezinme ve ekran bileşimi
  theme/            renk, yazı ve dokunma ölçüleri
tests/
  domain/ data/ flows/ compatibility/
```

Bu **hedef yapı**dır; mevcut dosyalar bir anda taşınmaz. `storage.js` önce mevcut API'yi koruyan bir giriş modülü olarak kalır. İç fonksiyonlar alan bazlı modüllere taşındıkça ekran importları değişmez. Dış dosya sürümleri yalnızca biçim değişirse artırılır; dosya taşıma tek başına şema sürümü artırmaz.

**400 satır kuralı:** `src/features/calls/`, `surveys/`, `forms/`, `new-project/` ve `src/data/projectStore/` altındaki her klasörde **doğrudan duran** `.js`, `.jsx`, `.ts`, `.tsx` dosyalarının fiziksel satır toplamı en fazla 400'dür. Bir alt klasör açılırsa onun da doğrudan kaynak toplamı ayrıca 400'ü geçemez; böylece sınırsız büyüyen tek bir klasör oluşmaz. `npm test` içindeki `scripts/check-feature-size.mjs` bu sınırı CI'da uygular. Ortak soru kodu `forms/`, önizleme/şablon kodu `new-project/` içinde kalır; sırf sayıyı tutturmak için aynı kod iki türe kopyalanmaz. Arama veya Anket'e özgü kod başka yerde kaldığı sürece ayrım tamamlandı sayılmaz.

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
| Arama projesi ve kişiler | `storage.js`, metadata + kişi yan dosyası | `.ays` yedek v8 | v1–7 | Dış yedek; tekrarlı içe alma kimliğe göre güvenli |
| Anket ve yanıtlar | `storage.js` ve ayrı anket yanıt dosyası | `.ays` yedek v10, ayrıca anket form/cevap paketi v1 | v7–9 anket; v1–6 arama | Dış yedek; kalıcı gelen kutusu ve önizlemeli cevap birleştirme |
| Form şablonu | Şablon deposu | `.ayst` arama v2, anket v3 | v1–3 | Şablon tekrar içe aktarılabilir; kişisel cevap taşımaz |
| Arama görevi | Görev deposu | `.ays` görev v2 | v1–2 | Ana koordinatör projesi ve görev dosyası |
| Arama sonucu | Gelen kutusu, birleştirme günlüğü | `.ays` sonuç v2 | v1–2 | Birleştirme öncesi dış yedek, kesinti günlüğü |
| Orijinal Excel | Kaynak çalışma kitabı yan dosyası | Tam yedekte ek, ayrıca aynen dışa aktarım | Kaynak eki olmayan eski projede yok | Topluluk arşivindeki ilk Excel |

**Kayıt akışları:** `Arama seç → listeyi ayrıştır → tekrar/sütun incele → proje ve kişiler → görev ayır → sonuç gelen kutusu → önizleme/çakışma → yedek → birleştir → Excel`. Ayrıştırma/kayıt hatası ekranda kalır; görev ve birleştirme değişikliklerinde yedek ve kurtarma günlüğü devrededir. `Anket seç → soruları hazırla → proje oluştur → cevap formu → cihazdaki yanıt → yedek/Excel`. Kaydedilmemiş anket cevabı ayrı yerel taslaktır; yeniden açılır ve `.ays` yedeğine girer. Cevap kaydı başarısızsa taslak ve hata ekranda kalır.

### Faz 1 — Tür seçimi ve ilk ekranların ayrılması

**Durum:** Tamamlandı (1.0.17/b18). Emülatörde iki kart, türlere özgü ilk adım, boş ad uyarısı, anket önizlemesi ve iki türün proje kaydı doğrulandı. Mevcut projeler korunarak yükseltildi.

1. Ana buton iki kartlı seçim ekranını açar: **Arama** / **Anket**. Kartlar tek cümleyle farkı anlatır ve en az 44 dp dokunma alanı sağlar.
2. Arama ilk ekranı yalnız ad, kişi listesi ve arama şablonlarını gösterir. Anket ilk ekranı yalnız ad, soru başlangıcı ve anket şablonlarını gösterir.
3. Kişi listesi kartındaki `×` ve listeyi kaldır/geri ekle geçişleri silinir. Tür seçimi şablon tarafından değiştirilmez; yanlış türde şablon açıklayıcı mesajla reddedilir.
4. İki yol da mevcut 2 adımlı oluşturmayı korur. Oluşturma bitince seçim ekranında kalmadan ana ekrana döner. Mevcut projeler ve dosyalar değişmez.
5. Android emülatöründe iki kart, geri, boş ad, anket kaydı, arama listesi, eski projelerin açılması; web derlemesi ve regresyon testi doğrulanır.

**Bitiş:** Çarpı yok; her tür kendi ilk adımına gider; varsayılan şablon diğer türü sessizce açmaz; mevcut veri korunur.

### Faz 2 — Davranışı değiştirmeden kodu ayırma

**Durum:** Sürüyor. İlk adım ekranları ve proje hazırlama kuralları `calls/` ile `surveys/` içine taşındı; iki türün proje nesnesi ayrı saf fonksiyonlarla üretiliyor. İkinci ekrandaki kişi/tekrar/sütun incelemesi `calls/CallSourceReview.js` içine alındı. Yeni ve mevcut projelerde ortak `forms/QuestionEditor.js` kullanılıyor; mevcut form ekranının kabuğu `forms/EditFormBuilder.js` içinde. Proje okuma mantığı `data/projectStore/projectReads.js`, yeni proje, anket yanıtı ve kişi güncelleme yazımları ile hata geri almaları `data/projectStore/projectWrites.js` içinde. Görev ayırma, durum değiştirme, kişi devri ve koordinatör cevabı `data/projectStore/assignment/` içine taşındı. Kişi güncellemesi ve listesiz anket cevabı için kesintide eski metadata/yanıt görüntüsünü geri getiren ortak kalıcı kayıt eklendi; web kaydı `IndexedDB`, Android kaydı uygulama dosya alanını kullanır. Kurtarma kontrolü ve tek yazma kuyruğu `storage.js` içinde kalır. Arama kaynak şablonu, görev havuzu ve Excel/CSV satırları da `features/calls/` altında saf modüllere taşındı. Regresyonlar üç alan dosyasına ayrıldı; 91 senaryo geçiyor. Yedek ve kalan depo yazımlarının ayrılması açıktır.

1. `NewProjectScreen` içindeki kaynak Excel/metin ayrıştırma ve kaydetme hazırlığını saf fonksiyonlara çıkar. Arama ve anket için ayrı kaydetme komutları oluştur; ortak alan doğrulamasını tek yerde tut.
2. `Step2Review` içinden kişi/sütun/tekrar incelemesini ayır. Ortak soru editörü, iki türden de aynı davranışı versin; önizleme kayıt yazmasın.
3. Depoyu önce okuma, sonra yazma işlemleri halinde modüllere ayır. Mevcut `enqueueWrite` tek sıra garantisini ve merge journal kurtarmasını koru. Her taşıma sonrası arama/görev/yedek regresyonunu çalıştır.
4. **Tamamlandı (1.0.36/b37):** Arama ve anket satır üreticileri ayrı modülde; Excel/CSV aynı saf modelden çıkar. Sıfırla başlayan telefon/okul numarası metin kalır.
5. **Kısmen tamamlandı (1.0.37/b38):** 91 regresyon testi proje, arama/görev ve anket dosyalarında; fixture'lar sentetik kaldı. Arama taslağı ve otomatik kaydın hatası görünür ve yeniden denenebilir. Silme sonrası temizleme hatası tanılama raporuna çıkar. Yedek/görev geri alması başarısızsa kurtarma günlüğü saklanır ve kullanıcıya yeniden açma yolu söylenir. Kalan depo yazımlarını ayırırken gizli yazma hatalarını taramaya devam et.

**Bitiş:** Ekranlar veri sözleşmesi ayrıntısını bilmez; aynı `.ays`, Excel ve görev sonuçları önceki sürümle eşdeğer çıkar. Büyük taşımalarda Android duman testi geçer.

### Faz 3 — Anket verisi ve veri kaybına karşı koruma

1. **Tamamlandı (1.0.31/b32):** Listesiz yanıtlar `responses` modeli ve ayrı `@ays_survey_responses_<id>` yan dosyası kullanır. Eski `mode: survey` projeleri eski kişi yan dosyasından salt okunur adaptörle açılır; ilk yeni cevapta günlükle taşınır. Kesinti, taslak, yedek değiştirme ve geri alma testleri vardır. `.ays` v8 dosya biçimi paylaşım uyumu için korunur; sınırda eski yanıt temsilini kullanan adaptör çalışır.
2. **Tamamlandı:** Kaydedilmemiş anket ayrı yerel taslaktır. Form açıldığında kaldığı yerden devam eder; **Taslağı sil** ve **Cevabı kaydet** ayrı işlemlerdir. `.ays` v8 taslağı da kapsar; v7 yedekleri taslaksız okunur. Cevap kaydı ve taslak temizleme ortak kurtarma günlüğüne bağlıdır.
3. **Tamamlandı (1.0.32/b33):** Yanıt listesi zaman ve ilk anlamlı cevapla görünür; cevap/tarih arama, ayrıntı, düzeltme ve **Silinenler** bölümünden geri alma vardır. Silme yanıtı kalıcı olarak yok etmez. Düzeltme öncesi cevap ve silme/geri alma olayları geçmişte tutulur; kimlik değişmez. Yazma günlükle korunur, eski `.ays` v8 okunur ve anket `.ays` v9 geçmişi de taşır.
4. **Tamamlandı (1.0.33/b34):** Form sürümü değiştiğinde eski yanıtlar eski alanlarla korunur. Yeni zorunlu alan eski yanıtı geriye dönük geçersiz yapmaz. Excel/CSV ve istatistik ekranı eski sürüm alanlarını `Form N` etiketiyle ayrı gösterir; aynı adlı sütunlar ayrıca ayırt edilir.
5. **Tamamlandı (1.0.34/b35):** Anket yedeğini dışarı kaydetme hatası ve iptal ekranda görünür; yeniden deneme sunulur. Android klasöre yazma tamamlanınca, web/Paylaş akışında ise kullanıcı dosyayı kontrol edince yedek uyarısı kapanır. Dosya hazırlanırken yeni cevap gelirse eski yedek güncel sayılmaz. Boş tarayıcı depolamasına `.ays` geri yükleme ve uygulamayı zorla kapatıp açma doğrulanır.

**Bitiş:** Başlanmış ama kaydedilmemiş yanıt yeniden açılır; kayıtlı yanıt ve taslak yedek/geri yükleme sonrası kaybolmaz; eski 1.0.16 anketleri okunur.

### Faz 4 — Dosyayla çok cihazlı anket toplama

**Durum:** Uygulama ve yerel web kabulü tamamlandı (1.0.35/b36). İki gönüllüde 10 + 7 cevap, yinelenen paket, farklı içerikli aynı yanıt, eski sürüm, yanlış etkinlik, yarım yazma ve güncel yedek kuralı otomatik test edildi. Boş tarayıcıda ana anket yedeği geri yüklenene kadar cevap paketinin gelen kutusunda beklemesi, sonra birleştirilmesi ekran üzerinden denendi. Gerçek iPhone dosya alışverişi kullanıcı cihaz bulana kadar bekler.

1. Koordinatör anket şablonunu/form paketini paylaşır; karşı cihaz aynı `eventId` ve `formVersion` ile doldurur. Sunucu gerekmez.
2. Yanıt paketi `eventId`, `formVersion`, kaynak cihaz kimliği, paket kimliği/sürümü ve her yanıtın kalıcı `responseId` değerini taşır. Bütünlük özeti bozulmayı saptar; kimlik doğrulama veya şifreleme iddiası taşımaz.
3. Aynı paket ve aynı yanıt tekrar açılınca ikinci kayıt oluşmaz. Aynı kimlik farklı içerikle gelirse otomatik üzerine yazılmaz; koordinatör önizler. İki anonim yanıtın aynı insana ait olduğu varsayılmaz.
4. Birleştirmeden önce güncel dış yedek zorunlu, yazma sırasında kesinti için kurtarma günlüğü zorunlu. Gönüllüye **Gönderilmeyen yanıt var** uyarısı ve tek büyük paylaş butonu verilir.
5. Eski sürüm/yanlış etkinlik/eksik dosya/iPhone'dan gelen dosya senaryoları, ters sıra ve yinelenen paketler test edilir.

**Bitiş:** İki cihazın 10 + 7 yanıtı, tekrarlanan dosya yeniden açıldığında da 17 kalır; çakışma görünür; eski cevap sessizce silinmez.

### Faz 5 — Saha kullanımını basitleştirme

1. **Uygulandı (1.0.37/b38):** Ana sayfada tür rozeti ve karta basınca yapılacak işe uygun **Aramaya başla**, **Anketi doldur** veya **Görevleri yönet** etiketi vardır. Gönüllü görev dosyası açma önde kalır; koordinatöre ait seçenekler gönüllü kartında görünmez. Aynı adlı projeler kimlikleriyle ayrı kalır; ana ekranda tarih/saat ve türle ayırt edilir. Yeni proje adı mevcut adla eşleşince **Adı değiştir / Yine de oluştur** uyarısı 1.0.26'da tamamlandı.
2. Her ekranda tek baskın eylem; teknik kelimeler yardım bölümünde. Hata mesajı neyin yanlış olduğunu ve düzeltme yolunu söyler. Erişilebilir etiket, yeterli kontrast/dokunma alanı, büyük yazı ve klavye kapatma kontrolü yapılır.
3. **Uygulandı:** Gelen dosya ekranında WhatsApp'tan açma, Dosyalar'dan seçme ve sonuç dosyasını paylaşma adımları kısa anlatılır. Anket önizlemesinde sentetik örnek kişi/cevap vardır; üstte **Cevaplar kaydedilmez** yazısı görünür.
4. **Ürün kararı:** Bu uygulama temel anket olarak kalır. Şarta göre soru, sayı/tarih doğrulama gibi ayrıntılı form mantığı burada karmaşıklık yaratacağı için [Anket Platformu](https://anketplatformu.com/) yönlendirmesinde kalır. Yanıt dışa aktarımında alan kimlikleri sabit tutulur.
5. Tür seçiminde geliştiricinin Anket Platformu sitesine açıkça etiketlenmiş bağlantı bulunur. Dış site açılmazsa adres gösterilir; cevapların uygulamadan siteye aktarılmadığı anlaşılır kalır.

**Bitiş:** İlk kez kullanan kişi yardım almadan proje türünü seçip ilk cevabı kaydeder; yanlış/eksik adımda neden ve çözüm görünür. Kullanılabilirlik denemesi en az üç teknolojiye uzak gönüllüyle yapılır.

### Faz 6 — Platform, sürüm ve devir kabulü

1. Android APK: temiz kurulum, eski sürüm üstüne güncelleme, çevrimdışı, uygulamayı zorla kapatma, WhatsApp/Dosyalar açma, yedek ve Excel paylaşımı.
2. PWA: çevrimdışı tekrar açma, güncelleme önbelleği, depolama izni ve sekme kapanışı. Gerçek iPhone bulunduğunda Safari Ana Ekran, Dosyalar ve WhatsApp alışverişi ile geri yükleme.
3. **Sentetik ölçüm tamamlandı (1.0.37/b38):** 5.000 kişi/100 görev ve 5.000 anket yanıtının açılış/kayıt/Excel/CSV/yedek/geri yükleme süreleri Node üzerinde ölçüldü; veri bütünlüğü doğrulandı. Gerçek cihaz süresi ve cihaz sınıfına göre hedefler açık.
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
