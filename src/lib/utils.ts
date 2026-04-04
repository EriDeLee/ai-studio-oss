import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a File to base64 data URL string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Alias for fileToBase64 - read a File and return base64 data URL
 */
export const readFileAsBase64 = fileToBase64;

/**
 * Convert base64 string to data URL
 */
export function base64ToDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Download a base64 image as a file
 */
export function downloadBase64Image(
  base64: string,
  mimeType: string,
  filename: string
): void {
  try {
    const link = document.createElement('a');
    link.href = base64ToDataUrl(base64, mimeType);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    console.error('Failed to download image');
  }
}

/**
 * Strip data URL prefix and return raw base64
 */
export function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    return dataUrl;
  }
  return dataUrl.slice(commaIndex + 1);
}

/**
 * Extract MIME type from data URL
 */
export function extractMimeType(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match ? match[1] : null;
}
