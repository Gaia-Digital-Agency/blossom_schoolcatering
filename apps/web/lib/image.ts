export async function fileToWebpDataUrl(file: File, quality = 0.82): Promise<string> {
  const asDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed reading image file'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed loading image for conversion'));
    img.src = asDataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context is unavailable');
  }
  ctx.drawImage(image, 0, 0);
  const webp = canvas.toDataURL('image/webp', quality);
  if (!webp.startsWith('data:image/webp')) {
    throw new Error('Failed converting image to WebP');
  }
  return webp;
}
