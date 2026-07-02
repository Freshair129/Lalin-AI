import uuid


def short_id() -> str:
    """id สั้น ๆ อ่านง่ายสำหรับ job/voice."""
    return uuid.uuid4().hex[:12]
