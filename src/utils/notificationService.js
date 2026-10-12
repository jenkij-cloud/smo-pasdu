/**
 * Notification Service
 * จัดการการแจ้งเตือนอีเมลมหาวิทยาลัย (@tsu.ac.th) จาก studentscidi.68@gmail.com
 */

import { formatDate } from './dateUtils';

export const OFFICIAL_SENDER_EMAIL = 'studentscidi.68@gmail.com';

/**
 * แปลงรหัสนิสิตเป็นอีเมลมหาวิทยาลัยทักษิณ เช่น 6720210035 -> 6720210035@tsu.ac.th
 */
export function getStudentEmail(studentId) {
    if (!studentId) return '';
    const cleanId = String(studentId).trim().replace(/[-\s]/g, '');
    return `${cleanId}@tsu.ac.th`;
}

/**
 * สร้างหัวข้อและเนื้อหาอีเมลตามสถานะคำขอ
 */
export function generateEmailTemplate(type, request) {
    const studentEmail = request.studentEmail || getStudentEmail(request.studentId);
    const returnDateStr = formatDate(request.returnDate);
    const borrowDateStr = formatDate(request.borrowDate);

    switch (type) {
        case 'approved':
        case 'STATUS_APPROVED':
            return {
                to: studentEmail,
                subject: `[สโมสรนิสิต TSU] อนุมัติคำขอยืมครุภัณฑ์: ${request.equipmentName}`,
                body: `เรียนคุณ ${request.borrowerName} (${request.studentId})

สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล มหาวิทยาลัยทักษิณ
ขอแจ้งให้ทราบว่า คำขอยืมครุภัณฑ์ "${request.equipmentName}" จำนวน ${request.quantity} ชิ้น
ได้รับการ "อนุมัติ" เรียบร้อยแล้ว ✅

📋 รายละเอียดการยืม:
- ครุภัณฑ์: ${request.equipmentName} (${request.quantity} ชิ้น)
- สถานที่ใช้งาน: ${request.location || '-'}
- วันที่ยืม: ${borrowDateStr}
- กำหนดส่งคืน: ${returnDateStr}
- วัตถุประสงค์: ${request.purpose || '-'}

📌 กรุณานำบัตรประจำตัวนิสิตมาติดต่อขอรับครุภัณฑ์ ณ ห้องสโมสรนิสิต
และโปรดนำมาส่งคืนภายในกำหนดเวลาดังกล่าว

ขอขอบคุณ
สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล
มหาวิทยาลัยทักษิณ (${OFFICIAL_SENDER_EMAIL})`
            };

        case 'rejected':
        case 'STATUS_REJECTED':
            return {
                to: studentEmail,
                subject: `[สโมสรนิสิต TSU] แจ้งผลการพิจารณาคำขอยืมครุภัณฑ์: ${request.equipmentName}`,
                body: `เรียนคุณ ${request.borrowerName} (${request.studentId})

สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล มหาวิทยาลัยทักษิณ
ขอแจ้งให้ทราบว่า คำขอยืมครุภัณฑ์ "${request.equipmentName}" จำนวน ${request.quantity} ชิ้น
"ไม่ได้รับการอนุมัติ" ❌

📌 เหตุผล:
${request.rejectReason || 'ข้อมูลไม่ครบถ้วนหรือไม่เป็นไปตามระเบียบของสโมสร'}

หากมีข้อสงสัยหรือต้องการสอบถามข้อมูลเพิ่มเติม สามารถติดต่อได้ที่ห้องสโมสรนิสิต

ขอขอบคุณ
สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล
มหาวิทยาลัยทักษิณ (${OFFICIAL_SENDER_EMAIL})`
            };

        case 'overdue':
        case 'STATUS_OVERDUE':
            return {
                to: studentEmail,
                subject: `[ด่วน - สโมสรนิสิต TSU] แจ้งเตือนเกินกำหนดส่งคืนครุภัณฑ์: ${request.equipmentName}`,
                body: `เรียนคุณ ${request.borrowerName} (${request.studentId})

⚠️ ด่วนที่สุด: การยืมครุภัณฑ์ "${request.equipmentName}" จำนวน ${request.quantity} ชิ้น
ได้ "เกินกำหนดส่งคืน" แล้ว (กำหนดคืน: ${returnDateStr})

กรุณานำครุภัณฑ์ดังกล่าวมาส่งคืน ณ ห้องสโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัลโดยเร็วที่สุด
เพื่อไม่ให้กระทบต่อกิจกรรมของนิสิตท่านอื่นและระเบียบวินัยของสโมสร

หากมีเหตุขัดข้องประการใด โปรดติดต่อผู้ดูแลสโมสรนิสิตทันที

ขอขอบคุณ
สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล
มหาวิทยาลัยทักษิณ (${OFFICIAL_SENDER_EMAIL})`
            };

        case 'returned':
        case 'STATUS_RETURNED':
            return {
                to: studentEmail,
                subject: `[สโมสรนิสิต TSU] ยืนยันการรับคืนครุภัณฑ์: ${request.equipmentName}`,
                body: `เรียนคุณ ${request.borrowerName} (${request.studentId})

สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล มหาวิทยาลัยทักษิณ
ขอแจ้งว่าได้รับคืนครุภัณฑ์ "${request.equipmentName}" จำนวน ${request.quantity} ชิ้น เรียบร้อยแล้ว 🔵

การยืมครุภัณฑ์ในรายการนี้เสร็จสมบูรณ์

ขอขอบคุณที่ให้ความร่วมมือในการส่งคืนครุภัณฑ์ตามกำหนด
สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล
มหาวิทยาลัยทักษิณ (${OFFICIAL_SENDER_EMAIL})`
            };

        default:
            return {
                to: studentEmail,
                subject: `[สโมสรนิสิต TSU] แจ้งเตือนการยืมครุภัณฑ์: ${request.equipmentName}`,
                body: `เรียนคุณ ${request.borrowerName} (${request.studentId})\n\nรายการยืมครุภัณฑ์: ${request.equipmentName} (${request.quantity} ชิ้น)\nสถานะ: ${request.status}\nกำหนดคืน: ${returnDateStr}`
            };
    }
}

/**
 * สร้างลิงก์ mailto: เพื่อเปิดแอปอีเมลพร้อมเขียนข้อความอัตโนมัติ
 */
export function createMailtoUrl(type, request) {
    const template = generateEmailTemplate(type, request);
    return `mailto:${template.to}?subject=${encodeURIComponent(template.subject)}&body=${encodeURIComponent(template.body)}`;
}

/**
 * ส่งการแจ้งเตือนอีเมลอัตโนมัติผ่าน Google Apps Script Webhook
 */
export async function sendBorrowNotification({ type, data }) {
    const studentEmail = data.studentEmail || getStudentEmail(data.studentId);
    const template = generateEmailTemplate(type, data);

    console.log(`[Notification Service] Sender: ${OFFICIAL_SENDER_EMAIL}`);
    console.log(`[Notification Service] Target Student Email: ${studentEmail}`);
    console.log(`[Notification Service] Subject: ${template.subject}`);

    const savedWebhook = localStorage.getItem('smo_notification_webhook');

    if (savedWebhook) {
        try {
            await fetch(savedWebhook, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender: OFFICIAL_SENDER_EMAIL,
                    to: template.to,
                    subject: template.subject,
                    body: template.body,
                    timestamp: new Date().toISOString()
                })
            });
            return { success: true, mode: 'webhook', email: studentEmail };
        } catch (err) {
            console.warn('[Notification Service] Webhook delivery failed:', err);
        }
    }

    return { success: true, mode: 'logged', email: studentEmail };
}

export function generateBorrowSlipText(request) {
    const studentEmail = request.studentEmail || getStudentEmail(request.studentId);
    return `[สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล มหาวิทยาลัยทักษิณ]
ส่งจาก: ${OFFICIAL_SENDER_EMAIL}
ใบยืนยันการยืมครุภัณฑ์:
- ผู้ยืม: ${request.borrowerName} (${request.studentId})
- อีเมลมหาวิทยาลัย: ${studentEmail}
- เบอร์โทร: ${request.phone}
- ครุภัณฑ์: ${request.equipmentName} (${request.quantity} ชิ้น)
- สถานที่: ${request.location || '-'}
- วัตถุประสงค์: ${request.purpose || '-'}
- สถานะ: ${request.status}
- วันที่ยืม: ${request.borrowDate ? formatDate(request.borrowDate) : '-'}
- กำหนดคืน: ${request.returnDate ? formatDate(request.returnDate) : '-'}`;
}
