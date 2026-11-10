code block. No prose, no explanation.
    *   Constraints: Pure function, no imports, no external deps, surgical and minimal.
    *   Signature: `export function pickKeys<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>`
    *   Requirements:
        *   Return a *new* object with only the specified keys.
        *   Do not mutate input.
        *   Handle duplicate keys gracefully.
        *   Strict type-checking compliance.