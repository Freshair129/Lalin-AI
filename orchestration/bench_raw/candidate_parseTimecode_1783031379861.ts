code block, no prose, pure function, no imports. So I will write just the function definition with its implementation.

Implementation steps:
- Use regex to match exactly "MM:SS.mmm". The pattern should be `^\d{2}:\d{2}\.\d{3}$`. This ensures 2 digits for minutes, colon, 2 digits for seconds, dot, and 3 digits for milliseconds.
- After matching, parse the parts: split by ":" to get minutes and seconds string, then split seconds by "." to get seconds and milliseconds strings.
- Convert minutes and seconds to numbers (they are already numeric strings). Multiply minutes by 60 and add seconds.
- For milliseconds, convert to a number and divide by 1000 to get fractional seconds. Add that to the total.
- Return the result as a number.

Edge cases:
- If regex doesn't match, return -1.
- Ensure minutes are between 00-99 (regex already enforces exactly two digits).
- Ensure seconds are between 00-59 (regex allows any two digits, but we must check that the second part is <= 59). Actually the regex `^\d{2}:\d{2}\.\d{3}$` will match "10:60.000" which is invalid because seconds > 59. So after matching, I need to parse and validate seconds < 60.
- Similarly minutes must be <= 99 (regex already ensures exactly two digits, but we might want to enforce that the first part is <= 99; regex doesn't restrict value, just length). However the spec says "minutes 00-99", so any two-digit number from 00 to 99 is allowed. So no extra check needed beyond regex.
- For seconds, we must ensure it's between 00 and 59 inclusive. So after parsing, if seconds >= 60, return -1.

Implementation details:
- Use `RegExp` with the pattern `^\d{2}:\d{2}\.\d{3}$`.
- Use `.match()` to test. If not matched, return -1.
- Extract groups or use string slicing after match. Since we only need the whole string, we can just split by ":" and ".".

Let's write code: