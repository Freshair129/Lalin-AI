export function pickKeys<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const result: Record<K, T[K]> = {};
    for (const key of keys) {
        result[key] = obj[key];
    }
    return result as Pick<T, K>;
}