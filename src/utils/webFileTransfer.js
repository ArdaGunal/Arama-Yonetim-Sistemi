export function downloadWebFile(content, name, mimeType = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** iPhone paylaş menüsü varsa dosyayı verir; destek yoksa Dosyalar'a indirilir. */
export async function shareOrDownloadWebFile(content, name, mimeType = 'application/json') {
  if (typeof File !== 'undefined' && typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function') {
    const file = new File([content], name, { type: mimeType });
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return 'shared';
      }
    } catch (error) { if (error?.name === 'AbortError') return 'cancelled'; }
  }
  downloadWebFile(content, name, mimeType);
  return 'downloaded';
}
