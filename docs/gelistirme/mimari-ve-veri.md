# Mimari ve veri akışı

## Kod haritası

| Yer | Görev |
| --- | --- |
| `App.js`, `index.js` | Uygulama girişi, gezinme ve hata sınırı |
| `src/screens/HomeScreen.js` | Proje listesi ve geliştirici paneline giriş |
| `src/screens/NewProjectScreen.js`, `src/screens/EditFormScreen.js`, `src/features/calls/`, `src/features/surveys/`, `src/features/forms/`, `src/features/new-project/` | Arama ve Anket proje hazırlığı ile form düzenleme; ortak soru editörü, önizleme ve şablon ekranları |
| `src/screens/AssignmentsScreen.js`, `src/screens/AssignmentImportScreen.js` | Koordinatörün görev ayırması ve gönüllünün dosya açması |
| `src/screens/ResultsImportScreen.js`, `src/screens/IncomingFileScreen.js` | Sonuçları inceleyip birleştirme ve Android'de dışarıdan dosya açma |
| `src/screens/SurveyScreen.js`, `src/features/active-survey/` | Anket, arama ve istatistik ekranları |
| `src/context/SurveyContext.js` | Aktif anketin durumu ve otomatik kayıt |
| `src/utils/storage.js` | AsyncStorage okuma/yazma ve taslaklar |
| `src/data/projectStore/projectReads.js` | Proje metadatası ve kişi yan dosyası okuması; eski proje sayaçlarını tamamlama |
| `src/data/projectStore/projectWrites.js` | Yeni proje, anket yanıtı ve kişi güncellemesinde yan dosya → metadata yazımı; yazma hatasında geri alma |
| `src/data/projectStore/assignment/` | Görev ayırma, durum değiştirme, kişi devri ve koordinatör cevabının saf doğrulama/yazma hazırlığı; tek yazma kuyruğu `storage.js` içinde kalır |
| `src/data/projectStore/backup/` | Tam yedeği hazırlama, geri yükleme ve mevcut projeyi yedekle değiştirme; tek yazma kuyruğu ve kurtarma günlüğü `storage.js` denetiminde kalır |
| `src/data/projectStore/call-transfer/` | Gönüllü görevini açma, arama sonuç dosyası oluşturma ve ana kişi listesine birleştirme |
| `src/data/projectStore/survey-transfer/` | Gönüllü anketini açma, cevap dosyası oluşturma ve ana ankete birleştirme |
| `src/data/projectStore/lifecycle/` | Formu kilitleme/sürüm açma ve dış yedekle doğrulanmış proje silme |
| `src/data/projectStore/projectUpdateJournal.js`, `projectUpdateJournalStore.js` | Kişi güncellemesi veya listesiz anket cevabı yarım kalırsa eski metadata/yan dosya görüntüsünü ilk okumada geri getirme; Android'de uygulama dosya alanı, web'de IndexedDB |
| `src/features/surveys/surveyDraft.js`, `surveyResponses.js`, `src/screens/FreeSurveyScreen.js`, `SurveyResponsesScreen.js` | Anket taslağı, ayrı yanıt modeli, eski yedek adaptörü, cevap ve yanıt listesi/düzeltme ekranları |
| `src/utils/phoneUtils.js` | Telefon temizleme ve metin/Excel ayrıştırma |
| `src/features/calls/callSourceTemplate.js`, `callExport.js`, `pool/assignmentPool.js` | Arama kaynak şablonu, Excel/CSV satırları ve görev havuzu saf kuralları |
| `src/utils/exportUtils.js`, `src/screens/ExportScreen.js` | Excel/CSV çıktısı |
| `src/utils/sourceWorkbookArchive.js`, `src/utils/sourceWorkbookStore.js` | Orijinal Excel eki, ayrı cihaz depolaması ve OOXML sonuç sayfaları |
| `src/utils/diagnostics.js`, `src/screens/DeveloperPanel.js` | Hata kaydı ve rapor paylaşımı |
| `src/utils/backupFormat.js`, `src/screens/BackupScreen.js` | Sürümlü `.ays` yedeği, doğrulama, dışa aktarma ve geri yükleme |
| `src/utils/automaticBackup.js` | Önemli işlemlerden sonra dış yedek dosyası ve Android yedek klasörü |
| `src/utils/formValidation.js` | Görüşülen kişide zorunlu cevap kontrolü |
| `src/utils/assignmentFormat.js`, `src/utils/canonicalJson.js` | `.ays` görev paketi ve ortak bütünlük hesabı |
| `src/utils/resultFormat.js`, `src/utils/resultMerge.js` | `.ays` sonuç paketi, sürüm/çakışma incelemesi ve karar uygulama |
| `src/features/survey-transfer/`, `src/screens/SurveyTransferScreen.js`, `SurveyInboxScreen.js` | Anket form/cevap dosyası, kalıcı gelen kutusu, önizleme ve kararlı birleştirme |
| `plugins/withCrashInfo.js`, `native-crash/` | Android yerel çökme kaydını Expo prebuild sırasında ekleme |
| `src/theme/colors.js` | Ortak renkler |
| `tests/regression-projects.test.cjs`, `regression-calls.test.cjs`, `regression-surveys.test.cjs` | Proje/depo, arama/görev ve anket regresyonları; ortak düzenek `tests/support/regressionHarness.cjs` |

## Bugünkü veri modeli

`storage.js`, proje özetlerini `@ays_projects`, arama kişilerini `@ays_project_data_<id>`, yeni anket yanıtlarını `@ays_survey_responses_<id>`, o anda yazılan form taslağını `@ays_draft_<id>` anahtarlarında tutar. Anket taslağı `{ formVersion, data }` biçimindedir; kayıtlı cevap değildir. Tanılama kaydı ayrıca saklanır. Arama projesinde `contacts`, anket projesinde `responses` vardır. Anket yanıtı `{ id, data, submittedAt, formVersion, history, deletedAt }` biçimindedir; kişiye ait telefon veya arama durumu içermez. Düzeltmede önceki cevap `history` içinde kalır. Silme `deletedAt` doldurur, geri alma bunu temizler; her iki olay geçmişte saklanır. Etkin liste/sayaç/Excel silinmiş yanıtları dışarıda bırakır; `.ays` v10 yedeği hepsini içerir. `responseStorage: 1` olan ankette yanıt dosyası bulunamazsa uygulama hata verir. Eski anketlerin kişi yan dosyası ilk yeni yanıt kaydına kadar okunur, sonra tek kurtarma günlüğüyle ayrı depoya taşınır. Kişide `id`, `recordId`, normalleştirilmiş `phone`, alan kimliklerine göre `data`, `completed`, `completedAt`, ayrı `callStatus` ve kimlikli `attempts` geçmişi bulunur.

Orijinal Excel baytları proje metadata'sına konmaz. Metadata yalnızca dosya adı, biçim, boyut, SHA-256 ve değişmez ek kimliğini taşır; web'de içerik IndexedDB, Android/iOS'ta uygulama belge dizininde saklanır. `.ays` tam yedeği ekin tamamını içerir. Geri yüklemede ek önce yazılır, sonra proje metadata'sı ona işaret eder. Yedek değiştirme günlüğü eski işaretçiyi geri getirir; kaynak ekleri değişmez kimlikle tutulduğu için kesintide eski dosya korunur.

Ana ekrandan silme `saveEventBackup` ile dış dosya üretildikten ve kullanıcı dosyayı kontrol ettiğini onayladıktan sonra `deleteProject(projectId, snapshot)` çağırır. Depolama kuyruğu içinde güncel kişi, form ve taslak görüntüsü yedek görüntüsüyle tekrar karşılaştırılır; arada değişiklik varsa silme reddedilir. `deleteProject` için yedek görüntüsü zorunludur.

Yazmalar kuyruklanır; ekran yüklenirken bekleyen yazmaların bitmesi beklenir. Yeni depolama işlemlerinde `storage.js` üzerinden geçin. Bu yapı cihaz içi kullanım içindir; görevler ve sonuçlar dosyayla aktarılır. Telefon aynı etkin görevler arasında tekrar dağıtımı önler; sonuç birleştirmede kalıcı `recordId` kullanılır. Birleştirmede `@ays_merge_journal` eski kişi/metadata görüntüsünü tutar; kesinti sonrası ilk proje okuması bu görüntüyü geri getirir. Geri alma başarısızsa günlük yerinde kalır ve ekrana yeniden açma yolu söylenir. Açıkça onaylanan yedek değiştirmesinde aynı günlük taslağı ve anketin iki yan dosyasını da geri alır. Yeni yedek geri yüklemesi yarım kalırsa günlük yeni yan dosyayı ve taslağı temizler. Kişi listesi güncellemesi ve anket cevabı ekleme/düzeltme/silme/geri almada ortak kurtarma kaydı yeni yan dosyadan önce yazılır ve metadata başarılı olduktan sonra silinir. Anket cevabı yazılırken taslak ve varsa eski kişi yan dosyası aynı günlüğe alınır ve ancak cevap kaydı başarılı olunca temizlenir. Uygulama bu arada kapanırsa ilk proje okuması eski yan dosyaları, metadatayı ve taslağı geri getirir. Yan dosya önceden yoksa sonradan oluşan dosya kaldırılır. Web'de bu kurtarma kaydı `localStorage` kotasını doldurmamak için `IndexedDB` içindedir; Android'de AsyncStorage'ın varsayılan 6 MB sınırını aşmamak için önce geçici dosyaya, sonra `ays-project-update-journal.json` dosyasına taşınır. `.ays` v10 anket yedeği yanıt, geçmiş ve paket birleştirme kararlarını taşır; v9 ve öncesi anket yedekleri okunur. Arama yedeği v8 kalır.

Koordinatör projesinde `eventId`, `formVersion`, `formLocked` ve `assignments` vardır. Her görev `assignmentId`, gönüllü adı, durum, tur ve ayrılmış kişilerin değişmez başlangıç görüntüsünü tutar. Görev oluşturma ve kişi rezervasyonu aynı kuyruklanmış metadata yazımında yapılır. Gönüllü projesinin `id` değeri görev kimliğidir; `eventId` ana etkinliği gösterir. `importDigest`, aynı dosyayı tekrar açınca cevapları korur. `resultRevision` her sonuç paylaşımında artar. Gönüllü kişi listesi değiştirilemez. Birleştirme telefon veya isim yerine `recordId`, görev için `assignmentId` kullanır; çakışma kararı `mergeConflicts` içinde tutulur.

Formdaki `required` alanı yalnızca `Görüşüldü` olarak tamamlanan kayıtlarda uygulanır. Kilitli formda değişiklik yeni `formVersion` ve `formHistory` kaydı oluşturur; adı/türü/şıkları değişen soruya yeni kimlik verilir. Eski görev paketi kendi alan listesini taşır ve eski sonuç o listeyle doğrulanır. Koordinatörün cevap sözlüğü eski ve yeni alan kimliklerini birlikte tutabilir. `backupPending` ile `backupEpoch`, dış yedek alınamamış önemli değişiklikleri uygulama yeniden açıldığında da görünür kılar; yedek başarılı yazılırsa aynı epoch için uyarı temizlenir.

## İçe ve dışa aktarma sınırları

Anketin çok cihazlı akışında ana cihaz `survey-form` dosyası verir; gönüllü aynı `eventId` ve `formVersion` ile yerel cevap toplar. `survey-response` paketi kalıcı `responseId`, kaynak cihaz kimliği, paket kimliği ve sürümünü taşır. Dışarıdan gelen paket web'de IndexedDB, Android'de uygulama belge dizinindeki gelen kutusuna önce yazılır; manifest `@ays_incoming_surveys_v1` anahtarındadır. Ana proje yoksa paket bekler. Birleştirme eski proje/yanıt görüntüsünü kurtarma günlüğüne yazar; güncel dış yedek ve çakışma kararları olmadan ana yanıtları değiştirmez. Tam yedek v10, işlenmiş paketleri ve karar geçmişini taşır. Paket SHA-256 özeti bozulmayı saptar, göndereni doğrulamaz.

Metin ayrıştırma ve ilk Excel sayfasından veri okuma `sourcePreview.js`, `phoneUtils.js` ve `NewProjectScreen.js` içindedir. Telefon biçimini ve sütun eşleştirmesini değiştirirken başlıksız tablo, isimlerin aynı olması ve baştaki sıfırları içeren numaralar için test ekleyin. Yeni etkinliklerde kaynak satır hücreleri saklanır. `.xlsx/.xlsm` içe aktarımında kaynak ZIP parçaları, ek sayfalar, formüller ve stiller korunur; nihai dosyaya yalnızca yeni sonuç sayfası XML'leri eklenir. Çakışan sayfa adına `(2)` eki verilir. `.xls` ve Excel eki olmayan eski projelerde önceki yeniden üretilen çıktı kullanılır. Eski etkinliklerin daha önce saklanmamış kaynak dosyası geri getirilemez.

## Tanılama

JS hatası raporu hata metni, yığın izi, platform, sürüm ve son işlem izlerini içerir. Android yerel çökmesi olduğunda kayıt sonraki açılışta gösterilir. `plugins/withCrashInfo.js` üretilen `android/` dosyalarına yerel modülü kopyalar; kaynak düzenleme `native-crash/` ve `plugins/` içinde yapılır. Hata raporları kişi bilgisi içerebilir; GitHub'a eklemeyin.

## Tasarlanan gelecek yapı

Sonraki kabul işleri, [5.000 kişi/100 görev senaryosunun](buyuk-veri-performansi.md) gerçek Android telefonda ölçülmesi, WhatsApp'ın farklı Android sürümlerinde dosyaya dokunarak açma davranışı ve kullanıcı uygun cihaz bulduğunda gerçek iPhone'da çevrimdışı PWA ile dosya akışının doğrulanmasıdır.
