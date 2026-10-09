# `.ays` dosya sözleşmesi — yedek sürüm 5, görev sürüm 2, sonuç sürüm 1

Dosyalar UTF-8 JSON'dur. `kind: "backup"` tam etkinlik yedeği, `kind: "assignment"` tek gönüllünün görev paketi, `kind: "result"` gönüllünün sonuç paketidir.

## Zarf

```json
{
  "format": "arama-yonetim-sistemi",
  "schemaVersion": 5,
  "kind": "backup",
  "createdAt": "2026-10-07T08:00:00.000Z",
  "eventId": "kalici-etkinlik-kimligi",
  "payload": { "project": {} },
  "integrity": { "algorithm": "SHA-256", "sha256": "64-kucuk-harfli-hex-karakter" }
}
```

`payload.project` içinde `id`, `eventId`, `name`, `createdAt`, `currentIndex`, `fields` ve `contacts` bulunur. Koordinatör projesinde `id` ile `eventId` aynıdır; gönüllü projesinde `id` görev kimliğidir ve `eventId` ana etkinliği gösterir. Her kişide `id`, `recordId`, `phone`, `data`, `completed`, `completedAt` bulunur; kişi `id` ile `recordId` aynıdır. Eski projelerde `eventId` ve `recordId` yoksa yedek hazırlanırken mevcut `id` değerleri kullanılır. İsim veya telefon, kayıt kimliği yerine kullanılmaz.

`fields` dizisinde alan `id`, `label`, `type` (`text` veya `select`), `options`, `order`, isteğe bağlı `required` ve varsa `isSystemField: "name"` vardır. `required`, `Görüşüldü` seçilen aramalarda boş cevabı engeller. `data`, alan kimliğinden metin cevabına eşlemedir. Telefon doğrudan kişi kaydındadır. Kişi sırası, `currentIndex` ve tamamlanma bilgisi yedeğe girer.

Sürüm 2'de `payload.project` ayrıca `formVersion`, `formLocked`, `templateId` ve `sourceReview` taşır. Kişide `sourceRow` bulunabilir. `sourceReview` içinde kaynak dosya adı, başlık durumu, veri satırı sayısı, sütun görevleri ile seçilmeyen tekrar ve okunamayan satırların `sourceRow`, `cells`, `reason` kayıtları vardır. Sürüm 3'te `role`, `assignmentId`, `importDigest` ve `assignments` eklenir. Sürüm 4 kişi başına `callStatus`, `callbackNote`, `callbackAt`, `attempts`; görev başına `packetDigest`, `resultRevision`, `resultDigest`, `lastApplied`; koordinatöre `mergeConflicts`, gönüllüye `round` ve `resultRevision` ekler. Sürüm 5 `formHistory` içine `{ version, fields }` kayıtlarını ekler. Kişi cevaplarında artık kullanılmayan eski alan kimlikleri korunur. Sürüm 1–4 yedekleri okunur.

Sürüm 5 koordinatör yedeğinde isteğe bağlı `sourceWorkbook` eki de bulunabilir: `{ name, format, base64, byteLength, sha256 }`. `format` `xlsx`, `xlsm` veya `xls` olur; orijinal dosya en fazla 8 MiB'dir. `base64` orijinal baytları aynen taşır; iç SHA-256 bu baytların base64 metni üzerinden hesaplanır. Dış zarf özeti bütün eki de kapsar. Gönüllü yedeğinde ana Excel bulunmaz. Eski uygulama sürümü bu isteğe bağlı alanı okuyup yeniden yedeklerken atabilir; kaynak biçimini korumak için güncel sürümle geri yükleyin.

Koordinatör kilitli formu düzenlediğinde `formVersion` artar. Adı, türü veya şıkları değişen soruya yeni alan kimliği verilir; eski cevap kendi eski alanında ve görev formunda kalır. Güncel Excel eski alanları form sürümü etiketiyle ayrıca gösterir. Eski görevden gelen sonuç kendi görev formuyla doğrulanır ve güncel formun başka alanlarını silmez.

## `.ays` görev paketi

Zarf `format: "arama-yonetim-sistemi"`, `schemaVersion: 2`, `kind: "assignment"`, `eventId`, `assignmentId`, `createdAt`, `payload.assignment` ve SHA-256 `integrity` içerir. Sürüm 1 görevleri de okunur ve yeniden paylaşıldığında eski dosya özeti korunur. İçerik etkinlik adı, gönüllü adı, `formVersion`, `round`, zorunlu alan bilgisi dahil formun tamamı ve **yalnızca atanmış kişilerin** `recordId`, telefon ve başlangıç verileridir. Geri aramada `round` 2 veya daha büyük olur; önceki kısa not ve karşılaştırma için başlangıç görüntüsü de taşınır. Aynı görev yeniden paylaşıldığında kimliği ve içeriği değişmez.

Koordinatör `prepared`, `sent`, `partial`, `completed`, `cancelled` durumlarını saklar. Kısmi veya tam sonuç birleştirilince görev durumu güncellenir. Hazırlanmış görev iptal edilince kişiler havuza döner. Gönderilmiş görev iptal edilirse eski dosyanın gönüllüde kalabileceği uyarılır. Görev dosyasının kendisi durum taşımaz.

## `.ays` sonuç paketi

Zarf `schemaVersion: 1`, `kind: "result"`, `eventId`, `assignmentId`, `exportedAt`, `payload.result` ve SHA-256 özeti içerir. `payload.result` içinde `formVersion`, `round`, artan `revision`, kaynak görev dosyasının `assignmentDigest` özeti, form alanları ve görevdeki bütün kişilerin son durumu bulunur. Her kişide `recordId`, telefon, cevaplar, `completed`, `callStatus`, geri arama notu/tarihi ve kimlikli `attempts` listesi vardır. Boş kalan kişiler de pakette bulunur; koordinatör bunları değişiklik olarak uygulamaz.

Aynı dosya ikinci kez alınırsa atlanır. Aynı görevde daha yüksek `revision` eski sürümü geçer; aynı sürümde farklı içerik reddedilir. Sonuç yalnızca doğru etkinlik, görev, tur, form ve telefonlarla eşleşirse önizlenir. Koordinatörün ana cevabı görev başlangıcından beri değiştiyse karar ister. Birleştirme öncesi yedek alınır; yazma sırasında kesinti olursa kurtarma günlüğü eski metadata ve kişileri geri yükler.

Görev hazırlanıp gönderildiğinde veya iptal edildiğinde ve sonuçlar birleştirildikten sonra yeni `.ays` yedeği oluşturulur. Android'de ilk kullanımda yedek klasörü seçilir; sonraki dosyalar aynı klasöre yazılır. Web'de dosya İndirilenler'e gönderilir. iPhone'da paylaşım menüsünde **Dosyalara Kaydet** seçilmelidir. Klasör izni verilmezse veya yazma başarısız olursa işlem kaybolmaz; ekran yedeği ayrıca kaydetme uyarısı gösterir. Birleştirme öncesi dış yedek hâlâ zorunludur.

Gönüllü aynı dosyayı tekrar açarsa ikinci proje oluşmaz ve cevapları silinmez. Aynı `assignmentId` ile farklı içerik reddedilir. Gönüllünün kişi listesi değiştirilemez. Görev dosyasının SHA-256 özeti bozulmayı saptar; kimlik doğrulama veya şifreleme sağlamaz.

## `.ayst` form şablonu

Şablon UTF-8 JSON'dur; `format: "arama-yonetim-template"`, `schemaVersion: 1`, `kind: "template"`, `templateId`, `createdAt`, `name`, `fields`, `sourceColumns` ve aynı SHA-256 `integrity` zarfını kullanır. Alanlar isim ve telefon sistem alanlarını, soru türlerini, şıkları, zorunlu alan bilgisini ve sıralamayı taşır. `sourceColumns` etiket/görev (`phone`, `name`, `field`, `ignore`) ve varsa alan kimliği eşleştirmesidir. Şablonda kişi, telefon listesi veya cevap bulunmaz. İçe aktarılan şablon cihazda saklanır ve yeni etkinlikte seçilebilir.

Yeni içe alınan Excel'in orijinali tam yedeğe eklenir; daha önce oluşturulmuş etkinliklerde kaynak dosya sonradan üretilemez. Kaynak dosyanın ayrıca topluluk arşivinde saklanması gerekir.

## Bütünlük hesabı

`integrity` çıkarılmış zarfın anahtarları her nesnede alfabetik sıralanarak JSON'a dönüştürülür; dizilerin sırası korunur. Bu UTF-8 metnin SHA-256 özeti küçük harfli hex olarak `integrity.sha256` içine yazılır. Okuyucu önce biçim ve sürümü, sonra özeti, sonra içerikteki kimlikleri ve alanları doğrular. Dosya en fazla 30 MiB olarak kabul edilir.

SHA-256 burada dosyanın yanlışlıkla bozulduğunu saptar. **İmza veya şifreleme değildir:** dosyaya erişen biri içeriği değiştirip özeti yeniden hesaplayabilir. Dosya telefon ve cevap içerdiği için yalnızca ilgili kişilerle paylaşılmalıdır.

Web uygulamasında SHA-256 için güvenli bağlam gerekir: geliştirmede `localhost`, yayında HTTPS kullanılmalıdır.

## Geri yükleme kuralları

1. Dosya kullanıcı tarafından seçilir; etkinlik adı, kimliği, kişi/alan sayıları ve tarih önizlemede gösterilir.
2. Cihazda aynı etkinlik yoksa proje tam olarak bir kez eklenir.
3. Aynı etkinlik ve aynı içerik varsa ikinci içe aktarma atlanır.
4. Aynı etkinlik farklı içerikle varsa otomatik işlem durur. Kullanıcı mevcut etkinliği dışarı yedekledikten ve açıkça onayladıktan sonra, aynı proje ve etkinlik kimliğine sahip dosyayla değiştirebilir. Değiştirme bir birleştirme değildir; dosyadaki eski cevaplar cihazdaki yeni cevapların yerini alabilir.
5. Bilinmeyen sürüm, yinelenen `recordId`, bozuk özet veya yanlış kimlikler reddedilir.

Değiştirmede dışarı kaydedilen mevcut sürümle işlemin başındaki sürüm yeniden karşılaştırılır. Arada değişiklik varsa yeniden yedek istenir. Yazma kesilirse yerel kurtarma günlüğü eski proje, kişi ve taslağı geri getirir. Dışarı kaydedilen `.ays` dosyası ayrıca korunmalıdır. Sonuç paketleri yedek geri yükleme ekranından değil, etkinliğin **Gelen sonuçları topla** ekranından işlenir.
