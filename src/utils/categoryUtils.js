// ฟังก์ชันจับคู่อีโมจิ/ไอคอนให้เข้ากับหมวดหมู่ต่างๆ ของสโมสรนิสิต
export const getCategoryIcon = (category) => {
    if (!category || category === 'all') return '📁';
    const lower = category.toLowerCase().trim();

    // กีฬา / นันทนาการ
    if (lower.includes('กีฬา') || lower.includes('sport') || lower.includes('บอล') || lower.includes('นันทนาการ') || lower.includes('เกม')) return '⚽';

    // เครื่องเขียน / อุปกรณ์สำนักงาน
    if (lower.includes('เขียน') || lower.includes('ปากกา') || lower.includes('สำนักงาน') || lower.includes('กระดาษ') || lower.includes('เครื่องเขียน') || lower.includes('กรรไกร') || lower.includes('แฟ้ม')) return '✏️';

    // เครื่องเสียง / อุปกรณ์เสียง / สื่อสาร / ไมค์
    if (lower.includes('เสียง') || lower.includes('ไมค์') || lower.includes('ลำโพง') || lower.includes('วิทยุ') || lower.includes('สื่อสาร') || lower.includes('audio') || lower.includes('mic')) return '🎤';

    // อิเล็กทรอนิกส์ / คอมพิวเตอร์ / ไอที
    if (lower.includes('คอม') || lower.includes('ไอที') || lower.includes('it') || lower.includes('โน้ตบุ๊ก') || lower.includes('จอ') || lower.includes('สายแปลง') || lower.includes('ปลั๊ก') || lower.includes('ไฟ')) return '💻';

    // ภาพ / กล้อง / โปรเจคเตอร์ / โสตทัศนูปกรณ์
    if (lower.includes('กล้อง') || lower.includes('ถ่ายภาพ') || lower.includes('โปรเจคเตอร์') || lower.includes('ฉาย') || lower.includes('ภาพ') || lower.includes('photo') || lower.includes('camera')) return '📷';

    // โต๊ะ / เก้าอี้ / เฟอร์นิเจอร์ / สถานที่ / เต็นท์
    if (lower.includes('โต๊ะ') || lower.includes('เก้าอี้') || lower.includes('เฟอร์นิเจอร์') || lower.includes('เต็นท์') || lower.includes('ฉาก') || lower.includes('เวที')) return '🪑';

    // ยานพาหนะ / ขนย้าย / รถเข็น
    if (lower.includes('รถเข็น') || lower.includes('ขนย้าย') || lower.includes('ล้อเลื่อน')) return '🛒';

    // ดนตรี / การแสดง
    if (lower.includes('ดนตรี') || lower.includes('กีตาร์') || lower.includes('กลอง') || lower.includes('เพลง')) return '🎸';

    // พยาบาล / ปฐมพยาบาล / สุขภาพ
    if (lower.includes('พยาบาล') || lower.includes('ยา') || lower.includes('ปฐมพยาบาล') || lower.includes('health') || lower.includes('first aid')) return '🩹';

    // ทำความสะอาด / สุขาภิบาล
    if (lower.includes('สะอาด') || lower.includes('ไม้กวาด') || lower.includes('ถังขยะ')) return '🧹';

    // อาหาร / เครื่องดื่ม / จัดเลี้ยง
    if (lower.includes('อาหาร') || lower.includes('เครื่องดื่ม') || lower.includes('จัดเลี้ยง') || lower.includes('แก้ว') || lower.includes('จาน') || lower.includes('กระติก')) return '🥤';

    // ตรา / สัญลักษณ์ / ธง / รางวัล / เหรียญ
    if (lower.includes('ตรา') || lower.includes('สัญลักษณ์') || lower.includes('ป้าย') || lower.includes('ธง') || lower.includes('ถ้วย') || lower.includes('เหรียญ') || lower.includes('รางวัล')) return '🏅';

    // เอกสาร / ทะเบียน / หนังสือ
    if (lower.includes('เอกสาร') || lower.includes('หนังสือ') || lower.includes('ตำรา')) return '📄';

    // วัสดุ / อุปกรณ์ / ช่าง / เครื่องมือ
    if (lower.includes('ช่าง') || lower.includes('เครื่องมือ')) return '🔧';
    if (lower.includes('วัสดุ') || lower.includes('อุปกรณ์')) return '📦';

    // หมวดหมู่อื่นๆ
    return '🏷️';
};

