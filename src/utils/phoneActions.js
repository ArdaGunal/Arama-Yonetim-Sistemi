import { Alert, Linking, Platform } from 'react-native';

/** Telefon uygulaması yoksa numarayı elle kullanabilmek için ekranda tutar. */
export async function openPhoneDialer(phone) {
  const number = String(phone || '').trim().replace(/^\+90/, '0');
  const inform = (message) => Platform.OS === 'web'
    ? window.alert(message) : Alert.alert('Telefon açılamadı', message);
  if (!number) {
    inform('Bu kişinin telefon numarası yok. Kişi bilgisini kontrol edin.');
    return false;
  }
  try {
    await Linking.openURL(`tel:${number}`);
    return true;
  } catch {
    inform(`Telefon uygulaması açılamadı. Telefon uygulamanızı açıp bu numarayı yazın: ${number}`);
    return false;
  }
}
