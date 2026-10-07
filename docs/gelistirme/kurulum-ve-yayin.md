# Kurulum, test ve APK üretimi

## Gereksinimler

- Node.js 20.19.4 veya üzeri ve npm.
- Android APK için Windows'ta Android Studio, Android SDK ve Java. `localapk.bat`, Android Studio'nun JBR kurulumunu veya `JAVA_HOME` değerini kullanır; SDK için `ANDROID_HOME` ya da `%LOCALAPPDATA%\Android\Sdk` konumunu bekler.
- Kaynak kod: `https://github.com/ArdaGunal/Arama-Yonetim-Sistemi`. Güncel proje dosyaları depo kökündedir. Bilgisayarınızda klasör adını değiştirmek derleme komutlarını değiştirmez.

## Yeni bilgisayarda

```powershell
git clone https://github.com/ArdaGunal/Arama-Yonetim-Sistemi.git
cd Arama-Yonetim-Sistemi
npm ci
npm test
npx expo start
```

Expo terminalinden Android emülatörünü açabilir veya cihazda uygun geliştirme istemcisiyle çalışabilirsiniz. Web geliştirme sunucusu için `npm run web` veya Windows'ta `baslat.bat` kullanılır.

## Yerel Android APK

```powershell
.\localapk.bat
```

Betik her derlemede `expo prebuild --platform android --no-install` ile Android projesini günceller, `assembleRelease` çalıştırır ve oluşan APK'yı `APK/AramaYonetim-v<SÜRÜM>-b<KOD>-<TARİH>.apk` olarak kopyalar. `APK/` ve `android/` Git dışında tutulur. Sürüm bilgisi `app.json` içindeki `expo.version` ve `expo.android.versionCode` alanlarından gelir; `package.json` sürümü de aynı tutulmalıdır. Yeni APK dağıtmadan önce sürüm kodunu artırın ve gerçek cihazda içe aktarma, kayıt, dışa aktarma, rapor paylaşma akışlarını kontrol edin.

Yerel `assembleRelease` APK'sı mevcut debug anahtarıyla imzalanır. Bu nedenle Play Store için yayın imzası veya yükseltme uyumluluğu varsaymayın. `apk-olustur.bat` ayrı bir EAS bulut derleme yoludur ve Expo hesabı gerektirir.

## GitHub'a değişiklik gönderme

```powershell
git status
npm test
git add .
git diff --cached --stat
git commit -m "Değişikliği özetle"
git push origin main
```

`git add .` sonrasında kişi verileri, raporlar, anahtarlar veya büyük üretilmiş dosyalar eklenmediğini `git diff --cached --name-only` ile kontrol edin. `APK/`, `android/`, `node_modules/` ve Expo önbelleği kaynak kodu değildir. GitHub bağlantısı değişirse `git remote -v` ile kontrol edin.
