// อ่านตำแหน่งจริง ณ ตอนกด ไม่ใช้เวลา hover หรือ store ที่อาจช้ากว่า media event
export function relativeSeekTarget(
  media: HTMLMediaElement,
  delta: number,
): number | null {
  if (
    !Number.isFinite(media.duration) ||
    media.duration <= 0 ||
    !Number.isFinite(media.currentTime) ||
    !Number.isFinite(delta)
  )
    return null;
  const target = media.currentTime + delta;
  let closest: number | null = null;
  for (let index = 0; index < media.seekable.length; index++) {
    const start = Math.max(0, media.seekable.start(index));
    // หลีกเลี่ยง ended event ที่เกิดเพราะ seek ไป endpoint ตรง ๆ
    const end = Math.max(
      start,
      Math.min(media.duration, media.seekable.end(index)) - 0.05,
    );
    const candidate = Math.max(start, Math.min(end, target));
    if (
      closest === null ||
      Math.abs(candidate - target) < Math.abs(closest - target)
    )
      closest = candidate;
  }
  return closest;
}
