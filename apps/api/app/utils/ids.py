# @req FR-06 — id สั้นของ job (ใช้เป็น project id ตาม FR-10.1 ด้วย)
import uuid


def short_id() -> str:
    """id สั้น ๆ อ่านง่ายสำหรับ job/voice."""
    return uuid.uuid4().hex[:12]
