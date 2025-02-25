/**
 * Generates a valid UUID v4
 * @returns A UUID v4 string
 */
export function generateUUID(): string {
  // Implementation based on RFC4122 version 4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
