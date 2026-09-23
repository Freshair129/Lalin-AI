// ประกาศเท่าที่ snippet ใช้ เพื่อให้ตรวจชนิดได้โดยไม่ต้องลง @types/node ในโปรเจกต์นี้
// โปรเจกต์ปลายทางที่มี @types/node อยู่แล้วจะใช้ของตัวเอง ไฟล์นี้ไม่ต้องคัดลอกไปด้วย
declare const process: { env: Record<string, string | undefined> };
