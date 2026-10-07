# Mimari ve veri akışı

## Kod haritası

| Yer | Görev |
| --- | --- |
| `App.js`, `index.js` | Uygulama girişi, gezinme ve hata sınırı |
| `src/screens/HomeScreen.js` | Proje listesi ve geliştirici paneline giriş |
| `src/screens/NewProjectScreen.js`, `src/features/new-project/` | Liste içe aktarma ve form oluşturma |
| `src/screens/SurveyScreen.js`, `src/features/active-survey/` | Anket, arama ve istatistik ekranları |
| `src/context/SurveyContext.js` | Aktif anketin durumu ve otomatik kayıt |
| `src/utils/storage.js` | AsyncStorage okuma/yazma ve taslaklar |
| `src/utils/phoneUtils.js` | Telefon temizleme ve metin/Excel ayrıştırma |
| `src/utils/exportUtils.js`, `src/screens/ExportScreen.js` | Excel/CSV çıktısı |
| `src/utils/diagnostics.js`, `src/screens/DeveloperPanel.js` | Hata kaydı ve rapor paylaşımı |
| `src/utils/backupFormat.js`, `src/screens/BackupScreen.js` | Sürümlü `.ays` yedeği, doğrulama, dışa aktarma ve geri yükleme |
| `plugins/withCrashInfo.js`, `native-crash/` | Android yerel çökme kaydını Expo prebuild sırasında ekleme |
| `src/theme/colors.js` | Ortak renkler |
| `tests/regression.test.cjs` | Depolama ve içe aktarma regresyonları |

## Bugünkü veri modeli

`storage.js`, proje özetlerini `@ays_projects`, kişi dizisini `@ays_project_data_<id>`, o anda yazılan form taslağını `@ays_draft_<id>` anahtarlarında tutar. Tanılama kaydı ayrıca saklanır. Projede `fields` (sorular/şıklar), `contacts`, `currentIndex` vardır. Kişide `id`, normalleştirilmiş `phone`, alan kimliklerine göre `data`, `completed` ve `completedAt` bulunur.

Yazmalar kuyruklanır; ekran yüklenirken bekleyen yazmaların bitmesi beklenir. Yeni depolama işlemlerinde `storage.js` üzerinden geçin. Bu yapı cihaz içi kullanım içindir: koordinatör ile 100 gönüllü arasında görevleri veya sonuçları eşitlemez. Telefon numarası mevcut içe aktarmada kişi listesi için önemli bir anahtardır; gelecekteki dağıtım/birleştirme için plandaki kalıcı `recordId` ve `assignmentId` gerekir.

## İçe ve dışa aktarma sınırları

Metin ayrıştırma ve ilk Excel sayfasından veri okuma `phoneUtils.js` içindedir. Telefon biçimini ve sütun eşleştirmesini değiştirirken başlıksız tablo, isimlerin aynı olması ve baştaki sıfırları içeren numaralar için test ekleyin. Mevcut dışa aktarma tek proje için bir çalışma tablosu üretir. İlk yüklenen Excel'in bütün sütunlarını koruyan nihai birleştirme henüz yoktur.

## Tanılama

JS hatası raporu hata metni, yığın izi, platform, sürüm ve son işlem izlerini içerir. Android yerel çökmesi olduğunda kayıt sonraki açılışta gösterilir. `plugins/withCrashInfo.js` üretilen `android/` dosyalarına yerel modülü kopyalar; kaynak düzenleme `native-crash/` ve `plugins/` içinde yapılır. Hata raporları kişi bilgisi içerebilir; GitHub'a eklemeyin.

## Tasarlanan gelecek yapı

Koordinatörün ana dosyayı saklaması, form sürümünü belirlemesi, çakışmasız görev paketleri oluşturması; gönüllülerin yalnızca kendi kişilerini açıp sürümlü sonuç dosyası göndermesi; koordinatörün önizleme ve yedek sonrası birleştirmesi [ürün planında](../hafiza/plan.md) anlatılır. Dosya biçimi kesinleşmeden gerçek etkinlik verileri üzerinde otomatik birleştirme yapılmamalıdır.
