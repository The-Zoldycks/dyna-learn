// Image utilities — resize, compress, preview URLs

const MAX_DIMENSION = 1024;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const COMPRESSION_QUALITY = 0.8;

/**
 * Resize and compress image file to WebP
 * Returns { base64, mimeType, previewUrl }
 */
export async function processImage(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file (PNG, JPG, WebP, etc.).');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Image must be under 5MB for the Gemini API.');
  }

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Calculate new dimensions preserving aspect ratio
  let newWidth = width;
  let newHeight = height;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      newWidth = MAX_DIMENSION;
      newHeight = Math.round((height / width) * MAX_DIMENSION);
    } else {
      newHeight = MAX_DIMENSION;
      newWidth = Math.round((width / height) * MAX_DIMENSION);
    }
  }

  // Draw to canvas with new dimensions
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
  bitmap.close();

  // Convert to WebP blob
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      'image/webp',
      COMPRESSION_QUALITY
    );
  });

  // Convert to base64 for API
  const base64 = await blobToBase64(blob);
  const mimeType = 'image/webp';

  // Create preview URL (object URL for memory efficiency)
  const previewUrl = URL.createObjectURL(blob);

  return { base64, mimeType, previewUrl };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Revoke object URL when done with preview
 */
export function revokePreviewUrl(url) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Check if file is valid image under size limit
 */
export function validateImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    return { valid: false, error: 'Please select an image file (PNG, JPG, WebP, etc.).' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Image must be under 5MB for the Gemini API.' };
  }
  return { valid: true };
}