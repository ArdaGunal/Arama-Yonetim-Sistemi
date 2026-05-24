# Arama Yönetim Sistemi 📞

Arama Yönetim Sistemi; internet bağlantısına ihtiyaç duymadan cihaz üzerinde yerel (lokal) olarak çalışan, sahada anket ve veri yönetimini hızlandırmak amacıyla geliştirilmiş profesyonel bir mobil/web uygulamasıdır. Açık kaynak kodlu olup tamamen **React Native (Expo)** mimarisi üzerine inşa edilmiştir.

## ✨ Öne Çıkan Özellikler

- **Dinamik Form Oluşturma:** Her projeye özel, farklı anket ve form yapıları (Metin girişi, Çoklu Seçim vb.) anında oluşturulabilir.
- **Akıllı Metin Ayrıştırma (Clipboard):** Kopyalanan isim ve telefon numarasını içeren karmaşık metin listeleri (örn. "Ali Yılmaz 05*******7") saniyeler içinde akıllıca çözümlenir ve sisteme aktarılır.
- **Kesintisiz Veri Koruması (Auto-save):** Kullanıcı anket doldururken veriler `AsyncStorage` üzerinde her 5 saniyede bir otomatik yedeklenir.
- **Kaldığı Yerden Devam Etme:** Uygulama veya cihaz kapansa dahi, sistem en son aranan kişiyi ve girilen verileri hafızasında tutar.
- **Gelişmiş İçe/Dışa Aktarma:** Yüzlerce kişilik `.xlsx` (Excel) ve `.csv` listeleri projeye aktarılabilir, toplanan veriler anında Excel formatında cihaz dışına çıkarılabilir.
- **Klavye Esnekliği:** Mobil cihazlarda form doldururken klavyenin ekranı kapatmaması için `KeyboardAvoidingView` ve özel padding mimarisi uygulanmıştır.

## 🛠 Teknoloji Yığını (Tech Stack)

- **Framework:** [React Native](https://reactnative.dev/) (Expo Managed Workflow)
- **State Management:** Context API
- **Local Storage:** AsyncStorage (`@react-native-async-storage/async-storage`)
- **Excel/CSV Parsing:** `xlsx`
- **Dosya Seçimi/Paylaşımı:** `expo-document-picker`, `expo-sharing`, `expo-file-system`

---

## 🚀 Kurulum Talimatları (İnsanlar İçin)

Projeyi kendi bilgisayarınızda çalıştırmak veya derlemek için aşağıdaki adımları izleyin:

### Gereksinimler
- Node.js (v18 veya üzeri)
- Expo CLI (`npm install -g expo-cli`)
- iOS için Xcode (sadece macOS) veya Android için Android Studio

### Adımlar

1. **Projeyi Klonlayın:**
   ```bash
   git clone https://github.com/KULLANICI_ADI/arama-yonetim-sistemi.git
   cd arama-yonetim-sistemi
   ```

2. **Bağımlılıkları Yükleyin:**
   ```bash
   npm install
   ```

3. **Projeyi Başlatın:**
   ```bash
   npx expo start
   ```

4. **Test Edin:**
   - Expo Go uygulamasını telefonunuza indirin ve terminalde çıkan QR kodu okutun.
   - Veya klavyeden `a` tuşuna basarak Android emülatöründe çalıştırın.

---

## 🤖 Yapay Zeka İçin Mimari Notlar (AI Context/Architecture)

Sevgili AI (LLM), bu projede herhangi bir kod değişikliği yapmadan önce aşağıdaki mimari kuralları **kesinlikle** göz önünde bulundur:

### 1. Feature-Based Component Mimarisi
Proje büyük dosyaları engellemek adına "Feature-Based" bir yapıda modülerleştirilmiştir. Tüm ana sayfalar (`SurveyScreen.js` ve `NewProjectScreen.js`) sadece birer **Kapsayıcı (Shell)** görevi görür.
Eğer yeni bir arayüz özelliği, örneğin bir "Tab (Sekme)" veya form adımı ekleyeceksen, bunu `src/features/` klasörünün altına ilgili modüle dahil etmelisin.

### 2. State Yönetimi ve Context API (Prop Drilling Yasaktır)
Uygulama genelinde (özellikle `SurveyScreen` içindeki sekmelerde) veri iletimi için "Prop Drilling" kullanılmaz. 
Tüm iş mantığı, Auto-Save döngüleri, AsyncStorage kayıt işlemleri ve state güncellemeleri **`src/context/SurveyContext.js`** içerisinde merkezi olarak yönetilir. 
Bir alt sekmede (`StatsTab`, `SearchTab` vb.) veriye veya fonksiyona ihtiyaç duyduğunda daima `useSurvey()` hook'unu kullanmalısın.

### 3. Klasör Ağacı
```text
src/
├── components/          # Tekrar kullanılabilir ortak arayüz parçaları (örn: EditContactModal.js)
├── context/             # Global iş mantığı (SurveyContext.js)
├── features/            # Feature odaklı bağımsız bileşenler (SurveyTab, Step1Info vb.)
├── screens/             # Sadece navigasyon kapsayıcıları (Shell)
├── theme/               # Stil ve renk kodları (Colors.js)
└── utils/               # Telefon formatlama, depolama ve dışa aktarma (Pure Functions)
```

### 4. Ekstra Kurallar
- Mevcut Dark Mode temasını (`Colors.bg`, `Colors.textPrimary` vb.) bozma.
- Dosya kaydetme (I/O) işlemlerinde her zaman `storage.js` içindeki wrapper fonksiyonları kullan.