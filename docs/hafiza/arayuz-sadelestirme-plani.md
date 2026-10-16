# Arayüzü sadeleştirme planı

Durum: İnceleme tamamlandı, uygulama için önerilen plan. Tarih: 16 Ekim 2026. İncelenen sürüm: 1.0.39/b40 (`75deea2`). Bu belge yapılmış tasarım değişikliği değil, sonraki uygulama sırasıdır.

## 1. Amaç ve sınırlar

Teknolojiye alışık olmayan kişi, yanında açıklayan biri olmadan doğru işe başlayabilmeli, kaydının durumunu anlayabilmeli ve kaldığı yere dönebilmelidir.

- Mevcut renk paleti ve `Colors` değerleri korunacak. Değişiklik; yerleşim, yazı hiyerarşisi, boşluklar, menü yapısı, buton adı ve geri bildirim üzerinde yapılacak.
- Arama ve Anket ayrı kalacak. Tür seçiminden sonraki oluşturma akışı iki adım olacak.
- Hesap açma, sunucu, rol seçme zorunluluğu ve uzun başlangıç eğitimi eklenmeyecek. Koordinatör/gönüllü seçenekleri projenin mevcut rolünden belirlenecek.
- Yeni açılır menüler ve iç içe akordiyonlar yerine kısa, alt alta satırlar kullanılacak. Seyrek kullanılan işlemler açıkça adlandırılmış ayrı bir seçenekler ekranına taşınacak.
- Dosya kimlikleri, telefon tekilliği, görev rezervasyonu, devir, eski dosya uyumu ve kurtarma kuralları korunacak. Kolaylaştırma, birleştirme/geri yükleme onaylarını atlamak anlamına gelmeyecek.
- Bu plan, önceki master planın veri güvenliği ve cihaz kabul maddelerini kapatmaz.

## 2. Gerçekte ne incelendi?

Güncel web derlemesi, boş yerel oturumda 390 × 844 telefon görünümünde kullanıldı. Gerçek telefon araması veya başka kişiye dosya gönderimi yapılmadı. Yalnız sentetik proje, cevap ve görev oluşturuldu.

| Senaryo | Gözlenen sonuç |
| --- | --- |
| Boş ana ekran → Arama/Anket seçimi | İki tür seçilebildi; ana ekranda başlamadan önce üç dosya/sonuç girişi ve iPhone açıklaması görüldü. |
| İki adımda şıklı anket oluşturma | Ad, soru ve iki seçenek girildi; kayıt yapmayan önizleme açıldı; proje oluşturuldu. |
| Anketi doldurma | Bir cevap kaydedildi; sayı 1 oldu ve form yeni cevap için temizlendi. Başarı için ayrı tarayıcı uyarısı kapatmak gerekti. |
| Anket paylaşım ekranı | Soruları paylaşma ve gelen cevap açma seçenekleri görüldü; gerçek paylaşım yapılmadı. |
| Arama projesi oluşturma | İki sentetik kişi eklendi, ikinci adımda örnek ve sütun eşlemesi gösterildi. |
| Arama sonucunu kaydetme | Telefonu aramadan bir kişi için Ulaşılamadı kaydedildi; ikinci kişiye geçildi. |
| Excel/CSV ekranı | Her biçim için ayrı Paylaş/Kaydet seçenekleri görüldü; dört benzer eylem aynı ekrandaydı. |
| Görev hazırlama | Bir kişilik görev ayrıldı, yedek indirme akışı çalıştı. Başarı uyarısından sonra boş Yeni görev formu ekranda kaldı; yeni görev kartı aşağıdaydı. |
| Gelen dosya ekranı | Tek dosya seçme düğmesi ve yönerge görüldü. Bu incelemede WhatsApp veya dosya seçiciyle yeni bir görev içe alınmadı. |
| Ayarlar | Dört liste biçimi ve tüm soru düzenleri aynı uzun sayfada; yedek/yardım seçenekleri aşağıdaydı. |
| Varsayılan soru düzenleme | Aramaya özgü isim/telefon açıklamasıyla ayrı editör açıldı; ayar kaydedilmedi. |
| Yedekler | Geri yükleme ve tarayıcı koruması, mevcut projenin yedeğini alma eyleminden önce gösterildi. Dosya oluşturulmadı. |
| Hata paneli → geri dön | Ayarlardan açılan panelin dönüşü ana ekranı açtı; ayarlardaki konum korunmadı. |
| Açık canlı web sekmesi | Güncelleme uyarısı görüldü; yenileme sonrasında eski ana ekran etiketleri kaldı. Güncel derleme ayrı yerel oturumda incelendi. Kalıcı veri silinmedi. |

Bu bir senaryo ve uzman incelemesidir; gerçek, teknolojiye uzak üç gönüllü denemesinin yerine geçmez. Bu turda Android APK ve fiziksel iPhone üzerinde tasarım kabulü yapılmadı.

## 3. Öncelikli sorunlar

| Öncelik | Sorun | Kullanıcıya etkisi | Karar |
| --- | --- | --- | --- |
| P1 | Ana ekranda görev açma, iki sonuç kutusu ve proje oluşturma yarışıyor. | İlk adım için fazla seçim var. | Ana ekranı projeler ve tek dosya açma girişi etrafında kur. |
| P1 | İlk görevden sonra proje kartı Aramaya başla yerine Görevleri yönet yoluna gidiyor. | Aynı karta basmak zamanla başka ekran açıyor. | Koordinatör kartının hedefi sabit proje özeti olsun. |
| P1 | Görev hazırlanınca paylaşılacak kart aşağıda kalıyor. | Kullanıcı boş formu görüp işlemin bitmediğini düşünebilir. | Yeni görev için başarı kartını ve Görevi paylaş eylemini hemen göster. |
| P1 | Ayarlarda veri koruma/yardım alt tarafta. | Yedek ve sorun raporu bulunması zor. | Ayarlar ilk ekranı kısa menü olsun. |
| P1 | Ana proje kartında silme çarpısı var. | Kapatma ile silme karışabilir; yanlış dokunma riski artar. | Proje silmeyi Proje seçenekleri altına taşı. Mevcut dış yedek koşulu korunsun. |
| P1 | Ayarlardaki seçili radyolar erişilebilirlik ağacında seçilmemiş görünüyor. | Ekran okuyucu seçili biçimi doğru aktaramayabilir. | Radio için doğru checked durumu ve grup etiketi kullan. |
| P2 | Uzun proje adları tek satırda kesiliyor. | Benzer adlı projeler ayırt edilemiyor. | İki satır ad, tür, gerekli olduğunda tarih/saat; ayrıntıda tam ad. |
| P2 | Proje/etkinlik/form/şablon/paket sözcükleri karışıyor. | Aynı kavram farklıymış gibi algılanıyor. | Aşağıdaki ortak sözlüğü uygula. |
| P2 | Anket doldurmadan önce yönetim/paylaşım eylemleri var. | Cevap verecek kişi yönetim seçeneklerine takılıyor. | Doldurma ekranını yalnız sorular ve kayıt için kullan. |
| P2 | Rutin kayıtta modal başarı uyarısı kapanmalı. | Her cevapta fazladan işlem gerekiyor. | Kalıcı olmayan, erişilebilir satır içi kayıt bildirimi kullan. |
| P2 | Görev açıklamasında Görev sayısını yazın deniyor; alan kişi sayısı istiyor. | Yanlış sayı girilebilir. | Kaç kişiyi ayıracağınızı yazın metni kullan. |
| P2 | Arama sekmeleri ve bazı eylemler erişilebilirlik ağacında yalnız metin/kapsayıcı. | Klavye ve ekran okuyucu kullanımı belirsiz. | Buton/sekme rolleri, seçili durum ve odak sırası ekle. |
| P2 | Güncelleme için kapatıp açma yönergesi sonucu belirsiz. | Kullanıcı yeni sürüme geçtiğini anlayamıyor. | Sürümü göster; güvenli Güncellemeyi uygula akışı hazırla. |

## 4. Menü düzeni

### 4.1 Ana ekran

Üstte uygulama adı ve sağda **Ayarlar** kalacak. Altında tek **Dosya aç** girişi olacak. Görev, anket, sonuç, yedek veya hazır soru dosyasının türünü kullanıcı seçmeyecek; dosyanın türü okunup doğru inceleme ekranı açılacak.

Boş durumda Dosya aç başlangıç kartında, projeler varken başlığın altında bulunacak; aynı ekranda tekrarlanmayacak. Yeni proje oluştur düğmesi de boş durumda başlangıç kartında, projeler varken güvenli alt alanda bir kez gösterilecek.

Ana içerik **Projelerim** olacak. Henüz proje yoksa iki açık başlangıç eylemi gösterilecek: **Yeni proje oluştur** ve **Bana gelen dosyayı aç**. Küçük bir açıklama, hazır görev alanın dosya açacağını, kendi listesini hazırlayanın proje oluşturacağını söyleyecek.

Proje varsa kartlar öncelikli olacak. Kart yalnız ad, tür/rol, kısa ilerleme ve bir açma eylemi içerecek. Soruları düzenleme, görev dağıtma ve silme ana kartın ayrı satırları olmayacak. Yeni proje düğmesi, son kartı kapatmayacak güvenli alt alanda kalacak.

**Gelen dosyalar** bağlantısı yalnız bekleyen sonuç varsa sayısıyla dikkat çekecek. Arama ve anket sonuçları tek listede tür etiketiyle ayrılacak; dosya kutuları kaybolmayacak. Sıfır sonuç için ana ekranda iki ayrı boş kutu bağlantısı gösterilmeyecek.

iPhone kurulum yönergesi yalnız ilgili platformda, Yardım altında bulunacak; gerekiyorsa ilk kullanımda kapatılabilir kısa bir ipucu verilecek. Kaydedilmemiş/gönderilmemiş veri uyarıları ipucundan bağımsız kalacak.

### 4.2 Projeyi açma

Koordinatörün kartı, görev sayısından bağımsız olarak aynı **Proje özeti** ekranını açacak. Gönüllünün kartı doğrudan kendi çalışma ekranına devam edecek. Kullanıcıya Koordinatör müsün/Gönüllü müsün sorusu sorulmayacak.

| Proje | İlk eylem | Diğer açık eylemler | Seyrek işlemler |
| --- | --- | --- | --- |
| Koordinatör arama | Aramaya başla; görev dağıtılmışsa uygun Kendi görevim yolu | Görev dağıt, Gelen sonuçları incele (sayı varsa) | Proje seçenekleri: Sorular, Excel al, Yedek, Projeyi sil |
| Gönüllü arama | Aramaya devam et | Kaydedilmiş yeni sonuç varsa Sonuçlarımı gönder | Kişiler, kısa görev özeti; başka kişilere görev dağıtma yok |
| Koordinatör anket | Cevap doldur | Cevaplar, Anketi paylaş, Gelen cevapları ekle | Proje seçenekleri: Sorular, Excel al, Yedek, Projeyi sil |
| Gönüllü anket | Cevap doldur | Gönderilmeyen yanıt varsa Cevaplarımı gönder | Kendi cevapları; ana anketi yönetme seçenekleri yok |

Proje seçenekleri, iç içe açılır menü yerine kısa bir sayfa olacak. Projenin adı ve türü bu sayfalarda görünür kalacak. Kaydetme işlemleri açık isimleriyle sunulacak; sadece simgeye dayanılmayacak.

Koordinatörün kendisinin arama yapacağı yol mevcut rezervasyon kurallarını kullanacak. Başkasına ayrılan kişi doğrudan ana listeden aranabilir hale getirilmeyecek; gerektiğinde önce kendine görev ayırma veya açık devir adımı kullanılacak.

### 4.3 Ayarlar

İlk ayarlar sayfası alt alta şu satırlardan oluşacak:

1. **Yedekler** — Son yedek durumu; Yedek al / Geri yükle.
2. **Hazır sorularım** — Arama ve Anket için ayrı düzenler ve geçerli seçim özeti.
3. **Kişi listesi biçimi** — Örneğin İsim → telefon; ayrıntıyı açınca dört seçenek ve örnek satır.
4. **Nasıl kullanılır?** — Görev alma, sonuç gönderme ve iPhone kurulumu için kısa adımlar.
5. **Sorun bildir** — Hata raporunu görüntüle/paylaş.

Altta uygulama sürümü ve varsa güncelleme durumu gösterilecek. Liste biçimi/sorular değişince aynı yerde **Yeni projeler için kaydedildi** bildirimi görünecek. Mevcut projelerin etkilenmediği kısa açıklama, ilgili ayar sayfasında yer alacak.

Hazır sorular ayrıntısında mevcut düzen, **Düzenle**, **Dosyadan ekle**, **Paylaş** ve **Yeni projelerde bunu kullan** açıkça ayrılacak. Dosyadan eklemek tek başına varsayılanı değiştirmeyecek. Arama/Anket seçimleri, eski ayar dosyasını okuyabilen uyumlu bir geçişle ayrılacak; mevcut doğru seçim kaybolmayacak.

## 5. Çalışma akışları

### Proje oluşturma ve sorular

- Tür seçimi iki kartla kalacak. Arama/Anket açıklaması birer kısa cümle olacak; geliştiricinin Anket Platformu bağlantısı bu alanın altında ikincil kalacak.
- Arama 1/2: Proje adı, listeyi yapıştır veya Excel'den seç, örnek satır, **Listeyi kontrol et**. Hazır soru seçimi bu adımın ana eyleminin arkasında kalmayacak; sorular adımında yer alacak.
- Anket 1/2: Proje adı ve Hazır sorular kullan / Kendi sorularımı yaz başlangıcı; tek **Sorulara geç** eylemi.
- 2/2: Aramada kısa kişi özeti ve gerektiğinde **Listeyi düzelt**; ardından sorular. Ankette doğrudan sorular. Üstte **Önizle**, altta sabit **Projeyi oluştur** ve **Geri**.
- Şıklı soruda iki boş seçenek otomatik gelecek. Soru türü iki görünür seçenekle seçilecek; zorunlu cevap seçimi açıkça etiketlenecek.
- Şablon kaydet/paylaş işlemleri oluşturma sırasında ana eylemlerle yarışmayacak; hazır düzen yönetimine veya oluşturma sonrasına taşınacak. Hazır soru kullanma olanağı korunacak.
- Eksik alan varsa ileri/kaydet düğmesinin yanında neden yazacak; ilk hatalı alana odaklanılacak. Kullanıcı yalnız gri bir düğmeyle karşılaşmayacak.
- Önizleme başlığında **Deneme — cevaplar kaydedilmez** kalacak. Kapatma soruları ve girilmiş seçenekleri değiştirmeyecek.
- Aynı adlı proje uyarısındaki **Adı değiştir / Yine de oluştur** korunacak.
- Oluşturma bitince proje özeti açılacak; kullanıcı yeni kartını ana sayfada aramak zorunda kalmayacak.

### Arama yapma

- Üstte Kişi 2/50 gibi konum ve Kaydedilen 12/50 gibi sonuç birbirinden ayrılacak. İlerleme sözcüğü iki anlamda kullanılmayacak.
- Kişi adı/numarası ve açık **Telefonu aç** düğmesi olacak. Diğer alanlara dokunmak yanlışlıkla telefon uygulamasını açmayacak.
- Görüşüldü, Ulaşılamadı, Sonra ara ve Yanlış numara aynı adlarla kalacak. Sonra ara notu ve zamanı yalnız seçildiğinde görünür olacak.
- **Kaydet ve sonraki kişi** ana eylem olacak. Önceki/Sonraki yalnız gezinme için kullanılacak; kaydedilmeyen durum/taslak bilgisi görünür olacak.
- Arama, Kişiler ve Özet sekmeleri doğru erişilebilirlik rolleriyle kullanılacak. Excel alma ve proje yönetimi, kişi cevaplama alanında baskın olmayacak.
- Son kişide kayıt sonrası işin durumuna uygun **Sonuçlarımı gönder** veya **Proje özetine dön** gösterilecek. Kısmi sonuç paylaşma desteği korunacak.

### Anket doldurma

- Doldurma ekranında proje adı, sorular ve **Cevabı kaydet** baskın olacak. Koordinatörün yönetim/paylaşım işlemleri proje özetinde kalacak.
- Kayıt sonrası modal yerine **Cevap kaydedildi · Yeni cevap hazır** bildirimi, güncel sayaç ve temiz form gösterilecek. Hata olursa cevap ekranda kalacak ve **Yeniden dene** yolu bulunacak.
- Taslak geri gelirse **Yarım kalan cevabınız açıldı** yazacak. Taslağı temizleme, cevap silme ve yeni cevap başlatma birbirine karışmayacak.
- Kaydedilen cevap listesi arama, ayrıntı, düzenleme ve Silinenler/geri alma işlevlerini koruyacak.

### Görev dağıtma, paylaşma ve geri alma

- Yeni görev alanı sayfanın üstünde olacak: **Kime?** (Başkasına / Kendime), gerekiyorsa kişi adı, **Kaç kişi?**, tek **Görevi hazırla**.
- Dağıtılabilir kişi sayısı alanın yanında yazacak; istenen sayı fazla veya alan boşsa nedeni gösterilecek. Dört büyük sayaç ana formu aşağı itmeyecek; ek durumlar kısa özet olacak.
- Yarım kalan kişiler varsa otomatik öncelik mevcut kurala göre korunacak; kullanıcıya Yeni görevde önce yarım kalanlar seçilir denecek.
- Hazırlama sonrası görev özeti ve **Görevi paylaş** hemen görünür olacak. Yeni görev formu, **Başka görev hazırla** seçilince açılacak.
- Hazırlandı / Sonuç bekleniyor / Kısmen tamamlandı / Tamamlandı / İptal gibi durumlar tek sözlük kullanacak. Paylaşım menüsünün açılması dosyanın alıcıya ulaştığı kabul edilmeyecek.
- Paylaşım sonrası **Dosyayı gönderdim** seçimi mevcut manuel gönderim durumu için kullanılacak. İptal edilen paylaşım gönderilmemiş hatırlatmasını kaldırmayacak.
- Yapılmayan kişileri geri alma ekranında kaç kişinin döneceği yazacak. İki açık işlem: **Başkasına ver** / **Dağıtılacaklara geri al**. Tamamlananlar ayrılacak; eski görevin durumu/sonuç çatışması saklanacak.

### Dosya açma ve birleştirme

- Ana dosya açma girişi ve WhatsApp bağlantısı aynı tür tespiti/yönlendirme kurallarını kullanacak. Kullanıcı dosya uzantısını veya hangi menüyü seçmesi gerektiğini bilmek zorunda kalmayacak.
- Görev/anket formu güvenli içe alma sonrasında adı, ait olduğu proje ve kişi/soru sayısıyla **Başla** sunacak. Aynı dosya yeniden açılırsa Cevaplarınız korundu bildirimi olacak.
- Sonuç paketi eşleşen projede incelemeyi açacak; eşleşmeyen sonuç kalıcı gelen kutusunda tutulacak. Yanlış projeye zorla ekleme olmayacak.
- Yedek ve hazır sorular otomatik uygulanmayacak. Türü söylenip ilgili inceleme/ayar ekranına yönlendirilecek.
- Birleştirme ekranında önce **Yeni / Zaten ekli / Karar gerekiyor** özeti; yalnız karar gereken kişiler ayrıntılı olacak. Otomatik sessiz çakışma çözümü yapılmayacak.
- Ana eylem ne ekleyeceğini söyleyecek: örneğin **10 cevabı ekle**. Güncel dış yedek gereksinimi, eksikse bu eylemin yanında neden ve **Önce yedek al** yolu ile gösterilecek.
- İşlem sonrası Eklenen 10, Atlanan 2 gibi sonuç ve projeye dönme yolu gösterilecek. Tekrar açma, eski görevden gelen sonuç ve devir çatışması regresyonları korunacak.

### Yedek, Excel ve sorun raporu

- Yedekler sayfasında önce proje seçimi ve **Yedeği kaydet**; ardından daha seyrek **Yedekten geri yükle** olacak. Web'de eylem adı **Yedeği indir**, Android'de **Klasöre kaydet** gibi gerçek davranışı anlatacak.
- Yedek dosyası, görev sonucu ve Excel raporu birbirine karıştırılmayacak; kısa amaç açıklaması verilecek. Geri yükleme önizlemesi ve mevcut veriyi dışarı yedekleme koruması kalacak.
- Excel raporu ana seçenek olacak; CSV ayrı bir İhtiyaç halinde CSV satırında kalacak. Bir biçim seçilince Kaydet/Paylaş anlaşılır biçimde gösterilecek; dört aynı isimli büyük buton aynı anda sunulmayacak.
- Ayarlardan açılan **Sorun bildir** normal bir geri dönüşle ayarlara dönecek ve gezinmeyi sıfırlamayacak. Gerçek çökme sonrası kurtarma paneli ayrı davranışını koruyacak.
- Raporda önce kısa sorun açıklaması ve **Raporu paylaş** olacak; teknik ayrıntılar ayrı ekranda incelenebilecek. Var olan rapor içeriği korunacak.
- Güncelleme alanı mevcut/yeni sürümü gösterecek. **Güncellemeyi uygula** işleminde bekleyen yazmalar tamamlanacak; kaydedilmemiş veri ve gönderilmeyen sonuç için gerekli açıklama/koruma olacak. Önbelleği/veriyi silme kullanıcı çözümü olarak sunulmayacak.

## 6. Ortak dil ve görsel kurallar

| Şu an kullanılan terim | Kullanıcıya gösterilecek terim |
| --- | --- |
| Proje / Etkinlik (aynı nesne) | Proje; örnek ad Etkinlik aramaları olabilir |
| Şablon / Düzen / Format (soru seti) | Hazır sorular |
| Format (gelen metin) | Kişi listesi biçimi |
| Paket | Görev dosyası veya Cevap dosyası |
| Dışa aktar | Excel al / Sonuçlarımı gönder / Yedeği kaydet; bağlama göre |
| Tanılama / Geliştirici paneli | Sorun bildir / Hata raporu |
| Form 2 | Gerekliyse Soruların 2. sürümü; teknik ayrıntıda kimlikler korunur |

- Renkler değişmeyecek. Var olan vurgu, uyarı, başarı ve zemin renkleri kendi anlamlarıyla kullanılacak; yeni renk paleti üretilmeyecek.
- Başlıklar cümle biçiminde yazılacak. Her metni büyük harfle ve çok kalın yazmak yerine önem sırasına göre yazı boyutu/ağırlığı kullanılacak.
- Ana metin yaklaşık 15–16, yardımcı metin 13–14, buton metni 16 birim olacak; gerçek cihazda okunabilirlik doğrulanacak.
- Mobil dokunma alanı en az 48 dp; kısa web kontrolleri en az 44 px olacak. Uzun Türkçe etiketler ve büyütülmüş yazı için sabit yükseklik yerine minimum yükseklik kullanılacak.
- Sayfa kenarı yaklaşık 16, ilişkili öğeler arası 8–12, bölüm arası 20–24 birim olacak. Aynı tür kart/buton aynı kurala uyacak.
- Her çalışma ekranında bir baskın eylem bulunacak; navigasyon satırları onunla yarışmayacak. Renk tek başına durum anlatmayacak; durum yazıyla da gösterilecek.
- Alt eylem alanı klavyeyi, güvenli alanı ve son liste öğesini kapatmayacak. Klavye açıkken asıl kayıt eylemi erişilebilir kalacak.
- Başarı mesajı ekran okuyucuya duyurulacak. Hatalı alan, seçim durumu, odak sırası ve buton/sekme rolleri doğrulanacak.

## 7. Uygulama fazları

| Faz | İş | Öncelikli dosyalar/alanlar | Kabul |
| --- | --- | --- | --- |
| A — Ortak düzen ve ana ekran | Ortak buton/menü satırı/alan hatası kuralları; sade ana ekran; kartlarda silmeyi taşıma; ayarlar kısa menüsü | `HomeScreen`, `SettingsScreen`, küçük ortak UI bileşenleri | Boş/dolu ana ekran; uzun/aynı adlı projeler; yardım ve yedek menüsü bulunabiliyor. Renkler aynı. |
| B — Sabit proje yolları | Koordinatöre proje özeti; gönüllüye çalışma ekranı; yönetim seçeneklerini çalışma formundan ayırma | `App.js`, proje özeti ekranı, `FreeSurveyScreen`, `SurveyScreen`, arama sekmeleri | Görev sayısı artsa da aynı kart aynı hedefi açıyor; gönüllü koordinatör işlemi görmüyor; geri dönüş ve taslak korunuyor. Riskli gezinme için APK emülatör testi. |
| C — İki adım ve soru düzeni | Oluşturma etiketleri, yardımcı şablon eylemleri, hata/odak, önizleme ve kayıt sonrası doğru ekran | `new-project/`, `calls/CallStart`, `surveys/SurveyStart`, `forms/` | Arama ve Anket iki adım; iki seçenek; önizleme kayıt yazmıyor; geçersiz girişin nedeni görünüyor. |
| D — Görev ve dosyalar | Görev hazırlama sonrası paylaş; tek gelen kutusu; ortak dosya giriş yolu; sade merge özeti | `AssignmentsScreen`, iki inbox ekranı, `AssignmentImportScreen`, `IncomingFileScreen`, sonuç inceleme ekranları | İptal/devir/geç sonuç/aynı dosya/yanlış proje; kişi kaybı ve sessiz ezme yok. Dosya ve görev akışı APK'da sentetik veriyle test edilir. |
| E — Ayrıntılı ayarlar ve yardım | Türe göre hazır sorular; biçim örneği; yedek/çıktı isimleri; normal hata paneli dönüşü; güvenli güncelleme | `appSettings`, `TemplateEditorScreen`, `BackupScreen`, `ExportScreen`, `DeveloperPanel`, PWA güncelleme kodu | Eski ayar doğru açılıyor; yanlış tür varsayılanı diğer türü değiştirmiyor; yedek/rapor paylaşılabiliyor; güncelleme cevapları koruyor. |
| F — Kullanılabilirlik kabulü | Küçük/büyük ekran, büyük yazı, klavye, ekran okuyucu; üç gerçek gönüllü | Kabul matrisi, kullanım belgeleri, gerekirse ilgili ekran | Aşağıdaki senaryolar yardım almadan tamamlanıyor; takılınan adımlar düzeltilip tekrar deneniyor. |

Yeni ortak bileşenler tek dev dosyada toplanmayacak. Yeni özellik alt klasörlerinde mevcut 400 satır denetimi uygulanacak. Veri yazma ve dosya sözleşmeleri ekran bileşenlerine geri taşınmayacak.

Her faz sonrası ilgili davranış testleri ve web derlemesi çalıştırılacak. Kalıcı veri, yönlendirme veya dosya akışına dokunan fazlarda APK üretilecek ve emülatörde ilgili yol denenecek. Belge/etiket düzeltmesi için gereksiz tam cihaz turu tekrarlanmayacak. APK'ler mevcut `APK/` arşivine girecek; sürüm ve kabul sonucu devir notuna yazılacak.

## 8. Kullanıcı kabul senaryoları

1. İlk kez açan kişi kendi listesini hazırlamakla gelen görevi açmak arasındaki farkı kısa açıklamadan anlayabilmeli.
2. Yeni Arama ve yeni Anket projesi yardım almadan oluşturulabilmeli. Zorunlu alan boşken neden durduğu anlaşılmalı.
3. Uzun ve aynı adlı projeler karıştırılmadan açılabilmeli; karta basmanın hedefi sonradan değişmemeli.
4. Bir arama sonucu kaydedilip sonraki kişiye geçilebilmeli; gerçek numara aranmadan sentetik senaryoyla denenmeli.
5. Anket cevabı kaydında kaydoldu mu belirsizliği kalmamalı; uygulama yeniden açılınca kayıt ve yarım taslak korunmalı.
6. Koordinatör görev hazırladıktan sonra paylaşacağı dosyayı aramamalı. Gönüllü dosyayı açıp başlayabilmeli ve kısmi sonucu gönderebilmeli.
7. Paylaşımı iptal etmek işi gönderilmiş göstermemeli. Görev iptalinde yapılmayan kişi yeniden dağıtılabilmeli.
8. Gelen sonuç doğru projeyi bulmalı; tekrar, eski görev, devir ve çakışma durumları açık anlatılmalı.
9. Ayarlardan yedek, varsayılan sorular ve hata raporu bulunabilmeli; her ayrıntı ekranı beklenen yere geri dönmeli.
10. 360 px dar ekran ve yüzde 200 yazı/zoom denemesinde ana eylem, hata metni ve son seçenek erişilebilir kalmalı. Klavye ile akış tamamlanmalı; seçili kontroller doğru duyurulmalı.
11. Web güncellemesinde sürüm değiştiği görülebilmeli; taslak/cevap kaybolmamalı. Gerçek iPhone ve Android sonuçları ayrıca kaydedilmeli.
12. Üç teknolojiye uzak gönüllüye sözlü yönlendirme verilmeden temel işler yaptırılmalı. Yanlış seçim, geri dönüş, anlaşılmayan sözcük ve yardım ihtiyacı not edilmeli; başarısız adım düzeltilip yeniden denenmeli.

## 9. Başlangıç kararı

İlk uygulama işi **Faz A: ana ekran ve kısa ayarlar menüsü** olacak. Sonraki adımlar bu düzenin üzerine sırayla kurulacak. Önceki planın açık gerçek cihaz/temiz kurulum/gönüllü kabul maddeleri [kabul kontrollerinde](../gelistirme/kabul-kontrolleri.md) izlenmeye devam edecek.
