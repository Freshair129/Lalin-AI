code block. No prose. Pure function, no imports.

Implement EXACTLY this signature in frontend/src/utils/pickKeys.ts:
export function pickKeys<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>

Rules:
- return a NEW object containing only the given keys (own enumerable properties of obj).
- do not mutate the input object.
- duplicate keys in the list must not duplicat

Approach: TypeScript Generic Function for Picking Keys

Let me implement this carefully, considering edge cases and type safety.
</think>