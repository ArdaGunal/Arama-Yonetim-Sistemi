# Mimari ve veri akışı

## Kod haritası

| Yer | Görev |
| --- | --- |
| `App.js`, `index.js` | Uygulama girişi, gezinme ve hata sınırı |
| `src/screens/HomeScreen.js` | Proje listesi ve geliştirici paneline giriş |
| `src/screens/NewProjectScreen.js`, `src/features/new-project/` | Liste içe aktarma ve form oluşturma |
| `src/screens/AssignmentsScreen.js`, `src/screens/AssignmentImportScreen.js` | Koordinatörün görev ayırması ve gönüllünün dosya açması |
| `src/screens/ResultsImportScreen.js`, `src/screens/IncomingFileScreen.js` | Sonuçları inceleyip birleştirme ve Android'de dışarıdan dosya açma |
| `src/screens/SurveyScreen.js`, `src/features/active-survey/` | Anket, arama ve istatistik ekranları |
| `src/context/SurveyContext.js` | Aktif anketin durumu ve otomatik kayıt |
| `src/utils/storage.js` | AsyncStorage okuma/yazma ve taslaklar |
| `src/utils/phoneUtils.js` | Telefon temizleme ve metin/Excel ayrıştırma |
| `src/utils/exportUtils.js`, `src/screens/ExportScreen.js` | Excel/CSV çıktısı |
| `src/utils/diagnostics.js`, `src/screens/DeveloperPanel.js` | Hata kaydı ve rapor paylaşımı |
| `src/utils/backupFormat.js`, `src/screens/BackupScreen.js` | Sürümlü `.ays` yedeği, doğrulama, dışa aktarma ve geri yükleme |
| `src/utils/assignmentFormat.js`, `src/utils/canonicalJson.js` | `.ays` görev paketi ve ortak bütünlük hesabı |
| `src/utils/resultFormat.js`, `src/utils/resultMerge.js` | `.ays` sonuç paketi, sürüm/çakışma incelemesi ve karar uygulama |
| `plugins/withCrashInfo.js`, `native-crash/` | Android yerel çökme kaydını Expo prebuild sırasında ekleme |
| `src/theme/colors.js` | Ortak renkler |
| `tests/regression.test.cjs` | Depolama ve içe aktarma regresyonları |

## Bugünkü veri modeli

`storage.js`, proje özetlerini `@ays_projects`, kişi dizisini `@ays_project_data_<id>`, o anda yazılan form taslağını `@ays_draft_<id>` anahtarlarında tutar. Tanılama kaydı ayrıca saklanır. Projede `fields` (sorular/şıklar), `contacts`, `currentIndex` vardır. Kişide `id`, `recordId`, normalleştirilmiş `phone`, alan kimliklerine göre `data`, `completed`, `completedAt`, ayrı `callStatus` ve kimlikli `attempts` geçmişi bulunur.

Yazmalar kuyruklanır; ekran yüklenirken bekleyen yazmaların bitmesi beklenir. Yeni depolama işlemlerinde `storage.js` üzerinden geçin. Bu yapı cihaz içi kullanım içindir; görevler ve sonuçlar dosyayla aktarılır. Telefon aynı etkin görevler arasında tekrar dağıtımı önler; sonuç birleştirmede kalıcı `recordId` kullanılır. Birleştirmede `@ays_merge_journal` eski kişi/metadata görüntüsünü tutar; kesinti sonrası ilk proje okuması bu görüntüyü geri getirir.

Koordinatör projesinde `eventId`, `formVersion`, `formLocked` ve `assignments` vardır. Her görev `assignmentId`, gönüllü adı, durum, tur ve ayrılmış kişilerin değişmez başlangıç görüntüsünü tutar. Görev oluşturma ve kişi rezervasyonu aynı kuyruklanmış metadata yazımında yapılır. Gönüllü projesinin `id` değeri görev kimliğidir; `eventId` ana etkinliği gösterir. `importDigest`, aynı dosyayı tekrar açınca cevapları korur. `resultRevision` her sonuç paylaşımında artar. Gönüllü kişi listesi değiştirilemez. Birleştirme telefon veya isim yerine `recordId`, görev için `assignmentId` kullanır; çakışma kararı `mergeConflicts` içinde tutulur.

## İçe ve dışa aktarma sınırları

Metin ayrıştırma ve ilk Excel sayfasından veri okuma `sourcePreview.js`, `phoneUtils.js` ve `NewProjectScreen.js` içindedir. Telefon biçimini ve sütun eşleştirmesini değiştirirken başlıksız tablo, isimlerin aynı olması ve baştaki sıfırları içeren numaralar için test ekleyin. Yeni etkinliklerde kaynak satır hücreleri saklanır; nihai Excel'de ilk sayfadaki kaynak sütunları kendi sıralarında, güncel cevaplar ise yanlarında görünür. Eski etkinliklerin daha önce saklanmamış hücreleri geri getirilemez. Özgün Excel biçimi ve ek sayfalar korunmaz.

## Tanılama

JS hatası raporu hata metni, yığın izi, platform, sürüm ve son işlem izlerini içerir. Android yerel çökmesi olduğunda kayıt sonraki açılışta gösterilir. `plugins/withCrashInfo.js` üretilen `android/` dosyalarına yerel modülü kopyalar; kaynak düzenleme `native-crash/` ve `plugins/` içinde yapılır. Hata raporları kişi bilgisi içerebilir; GitHub'a eklemeyin.

## Tasarlanan gelecek yapı

Sonraki büyük iş, gerçek iPhone'da çevrimdışı PWA ve dosya akışının doğrulanmasıdır. Ayrıca 5.000 kişi/100 görev performansı ile WhatsApp'ın farklı Android sürümlerinde dosyaya dokunarak açma davranışı ölçülmelidir.
