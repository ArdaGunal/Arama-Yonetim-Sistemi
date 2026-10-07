# `.ays` dosya sözleşmesi — yedek sürüm 3 ve görev sürüm 1

Dosyalar UTF-8 JSON'dur. `kind: "backup"` tam etkinlik yedeği, `kind: "assignment"` tek gönüllünün görev paketidir. Sonuç birleştirme dosyası henüz yoktur.

## Zarf

```json
{
  "format": "arama-yonetim-sistemi",
  "schemaVersion": 3,
  "kind": "backup",
  "createdAt": "2026-10-07T08:00:00.000Z",
  "eventId": "kalici-etkinlik-kimligi",
  "payload": { "project": {} },
  "integrity": { "algorithm": "SHA-256", "sha256": "64-kucuk-harfli-hex-karakter" }
}
```

`payload.project` içinde `id`, `eventId`, `name`, `createdAt`, `currentIndex`, `fields` ve `contacts` bulunur. Koordinatör projesinde `id` ile `eventId` aynıdır; gönüllü projesinde `id` görev kimliğidir ve `eventId` ana etkinliği gösterir. Her kişide `id`, `recordId`, `phone`, `data`, `completed`, `completedAt` bulunur; kişi `id` ile `recordId` aynıdır. Eski projelerde `eventId` ve `recordId` yoksa yedek hazırlanırken mevcut `id` değerleri kullanılır. İsim veya telefon, kayıt kimliği yerine kullanılmaz.

`fields` dizisinde alan `id`, `label`, `type` (`text` veya `select`), `options`, `order` ve varsa `isSystemField: "name"` vardır. `data`, alan kimliğinden metin cevabına eşlemedir. Telefon doğrudan kişi kaydındadır. Kişi sırası, `currentIndex` ve tamamlanma bilgisi yedeğe girer.

Sürüm 2'de `payload.project` ayrıca `formVersion`, `formLocked`, `templateId` ve `sourceReview` taşır. Kişide `sourceRow` bulunabilir. `sourceReview` içinde kaynak dosya adı, başlık durumu, veri satırı sayısı, sütun görevleri ile seçilmeyen tekrar ve okunamayan satırların `sourceRow`, `cells`, `reason` kayıtları vardır. Sürüm 3'te `role`, `assignmentId`, `importDigest` ve `assignments` eklenir. Koordinatör yedeği görevlerin durumlarını ve oluşturuldukları andaki form/kişi görüntülerini içerir. Gönüllü yedeğinde `role: "volunteer"`, ana etkinlik `eventId` değeri, `assignmentId` ve içe alınan görev dosyasının özeti vardır. Sürüm 1 ve 2 yedekleri okunur; eksik alanlar varsayılan değerlere dönüştürülür.

## `.ays` görev paketi

Zarf `format: "arama-yonetim-sistemi"`, `schemaVersion: 1`, `kind: "assignment"`, `eventId`, `assignmentId`, `createdAt`, `payload.assignment` ve SHA-256 `integrity` içerir. İçerik etkinlik adı, gönüllü adı, `formVersion`, `round: 1`, formun tamamı ve **yalnızca atanmış kişilerin** `recordId`, telefon ve başlangıç verileridir. Aynı görev yeniden paylaşıldığında kimliği ve içeriği değişmez.

Koordinatör `prepared`, `sent`, `partial`, `completed`, `cancelled` durumlarını saklar. İlk iki durum ve iptal bu sürümde arayüzden yönetilir; kısmi/tam sonuç durumları sonuç akışında kullanılacaktır. Hazırlanmış görev iptal edilince kişiler havuza döner. Gönderilmiş görev iptal edilirse eski dosyanın gönüllüde kalabileceği uyarılır. Görev dosyasının kendisi durum taşımaz.

Gönüllü aynı dosyayı tekrar açarsa ikinci proje oluşmaz ve cevapları silinmez. Aynı `assignmentId` ile farklı içerik reddedilir. Gönüllünün kişi listesi değiştirilemez. Görev dosyasının SHA-256 özeti bozulmayı saptar; kimlik doğrulama veya şifreleme sağlamaz.

## `.ayst` form şablonu

Şablon UTF-8 JSON'dur; `format: "arama-yonetim-template"`, `schemaVersion: 1`, `kind: "template"`, `templateId`, `createdAt`, `name`, `fields`, `sourceColumns` ve aynı SHA-256 `integrity` zarfını kullanır. Alanlar isim ve telefon sistem alanlarını, soru türlerini, şıkları ve sıralamayı taşır. `sourceColumns` etiket/görev (`phone`, `name`, `field`, `ignore`) ve varsa alan kimliği eşleştirmesidir. Şablonda kişi, telefon listesi veya cevap bulunmaz. İçe aktarılan şablon cihazda saklanır ve yeni etkinlikte seçilebilir.

Yedek, uygulamaya aktarılmış bilgileri saklar; başlangıçtaki Excel dosyasının özgün biçimini veya bütün ek sayfalarını içermez. Koordinatör orijinal Excel'i ayrıca korumalıdır.

## Bütünlük hesabı

`integrity` çıkarılmış zarfın anahtarları her nesnede alfabetik sıralanarak JSON'a dönüştürülür; dizilerin sırası korunur. Bu UTF-8 metnin SHA-256 özeti küçük harfli hex olarak `integrity.sha256` içine yazılır. Okuyucu önce biçim ve sürümü, sonra özeti, sonra içerikteki kimlikleri ve alanları doğrular. Dosya en fazla 30 MiB olarak kabul edilir.

SHA-256 burada dosyanın yanlışlıkla bozulduğunu saptar. **İmza veya şifreleme değildir:** dosyaya erişen biri içeriği değiştirip özeti yeniden hesaplayabilir. Dosya telefon ve cevap içerdiği için yalnızca ilgili kişilerle paylaşılmalıdır.

Web uygulamasında SHA-256 için güvenli bağlam gerekir: geliştirmede `localhost`, yayında HTTPS kullanılmalıdır.

## Geri yükleme kuralları

1. Dosya kullanıcı tarafından seçilir; etkinlik adı, kimliği, kişi/alan sayıları ve tarih önizlemede gösterilir.
2. Cihazda aynı etkinlik yoksa proje tam olarak bir kez eklenir.
3. Aynı etkinlik ve aynı içerik varsa ikinci içe aktarma atlanır.
4. Aynı etkinlik farklı içerikle varsa işlem durur; mevcut veri silinmez veya sessizce birleştirilmez.
5. Bilinmeyen sürüm, yinelenen `recordId`, bozuk özet veya yanlış kimlikler reddedilir.

Mevcut proje üzerine geri alma, gönüllü görevleri ve sonuçların birleştirilmesi bu sürümde yoktur. Bunlar eklenirken sözleşme sürümü artırılmalı, eski yedekler için açık dönüştürme ve test eklenmelidir.
