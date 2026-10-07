# `.ays` dosya sözleşmesi — sürüm 2

Bu sürüm **tam etkinlik yedeği** içindir. Dosya UTF-8 JSON'dur. Gönüllüye görev dağıtma veya sonuç birleştirme dosyası olarak kullanılmaz. İleride görev ve sonuç dosyaları ayrı `kind` ve sürümle tanımlanacaktır.

## Zarf

```json
{
  "format": "arama-yonetim-sistemi",
  "schemaVersion": 2,
  "kind": "backup",
  "createdAt": "2026-10-07T08:00:00.000Z",
  "eventId": "kalici-etkinlik-kimligi",
  "payload": { "project": {} },
  "integrity": { "algorithm": "SHA-256", "sha256": "64-kucuk-harfli-hex-karakter" }
}
```

`payload.project` içinde `id`, `eventId`, `name`, `createdAt`, `currentIndex`, `fields` ve `contacts` bulunur. Bu sürümde proje `id` ile `eventId` aynıdır. Her kişide `id`, `recordId`, `phone`, `data`, `completed`, `completedAt` bulunur; kişi `id` ile `recordId` aynıdır. Eski projelerde `eventId` ve `recordId` yoksa yedek hazırlanırken mevcut `id` değerleri kullanılır. İsim veya telefon, kayıt kimliği yerine kullanılmaz.

`fields` dizisinde alan `id`, `label`, `type` (`text` veya `select`), `options`, `order` ve varsa `isSystemField: "name"` vardır. `data`, alan kimliğinden metin cevabına eşlemedir. Telefon doğrudan kişi kaydındadır. Kişi sırası, `currentIndex` ve tamamlanma bilgisi yedeğe girer.

Sürüm 2'de `payload.project` ayrıca `formVersion`, `formLocked`, `templateId` ve `sourceReview` taşır. Kişide `sourceRow` bulunabilir. `sourceReview` içinde kaynak dosya adı, başlık durumu, veri satırı sayısı, sütun görevleri ile seçilmeyen tekrar ve okunamayan satırların `sourceRow`, `cells`, `reason` kayıtları vardır. İlk kaynak Excel'in biçimi ve ek sayfaları yine yedeğe alınmaz. Sürüm 1 yedekleri okunur; eksik yeni alanlar varsayılan değerlere dönüştürülür.

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
