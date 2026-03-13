/** Maximum pixel dimension (width or height) for proof images sent to the server. */
const MAX_IMAGE_PX = 1200;

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

  // Downscale if either dimension exceeds MAX_IMAGE_PX, preserving aspect ratio.
  let w = image.naturalWidth || image.width;
  let h = image.naturalHeight || image.height;
  if (w > MAX_IMAGE_PX || h > MAX_IMAGE_PX) {
    if (w >= h) {
      h = Math.round((h / w) * MAX_IMAGE_PX);
      w = MAX_IMAGE_PX;
    } else {
      w = Math.round((w / h) * MAX_IMAGE_PX);
      h = MAX_IMAGE_PX;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context is unavailable');
  }
  ctx.drawImage(image, 0, 0, w, h);
  const webp = canvas.toDataURL('image/webp', quality);
  if (!webp.startsWith('data:image/webp')) {
    throw new Error('Failed converting image to WebP');
  }
  return webp;
}
