export function pickKeys<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      Object.defineProperty(result, key, {
        value: obj[key],
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return result;
}