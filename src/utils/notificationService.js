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
/**
 * สร้างข้อความแสดงรายการครุภัณฑ์ (รองรับทั้งแบบชิ้นเดียว และหลายชิ้น)
 */
function formatEquipmentDetails(request) {
    if (request.items && Array.isArray(request.items) && request.items.length > 0) {
        const lines = request.items.map((item, idx) => 
            `  ${idx + 1}. ${item.equipmentName} (${item.quantity} ชิ้น)${item.equipmentSerial ? ` [SN: ${item.equipmentSerial}]` : ''}`
        );
        const totalQty = request.totalQuantity || request.quantity || request.items.reduce((s, i) => s + (i.quantity || 1), 0);
        return `รายการครุภัณฑ์ (${request.items.length} รายการ, รวม ${totalQty} ชิ้น):\n${lines.join('\n')}`;
    }
    return `ครุภัณฑ์: ${request.equipmentName} (${request.quantity} ชิ้น)`;
}

function getEquipmentTitle(request) {
    if (request.items && Array.isArray(request.items) && request.items.length > 0) {
        if (request.items.length === 1) {
            return `${request.items[0].equipmentName} (${request.items[0].quantity} ชิ้น)`;
        }
        const totalQty = request.totalQuantity || request.quantity || request.items.reduce((s, i) => s + (i.quantity || 1), 0);
        return `${request.items[0].equipmentName} และอื่นๆ รวม ${request.items.length} รายการ (${totalQty} ชิ้น)`;
    }
    return `${request.equipmentName} (${request.quantity} ชิ้น)`;
}

/**
 * สร้างหัวข้อและเนื้อหาอีเมลตามสถานะคำขอ
 */
export function generateEmailTemplate(type, request) {
    const studentEmail = request.studentEmail || request.borrowerEmail || request.contactEmail || getStudentEmail(request.studentId);
    const returnDateStr = formatDate(request.returnDate, true);
    const borrowDateStr = formatDate(request.borrowDate, true);
    const equipDetails = formatEquipmentDetails(request);
    const equipTitle = getEquipmentTitle(request);
    const borrowerIdentifier = request.borrowerType === 'staff'
        ? (request.staffEmail || request.position || 'อาจารย์/บุคลากร')
        : (request.studentId || '-');

    switch (type) {
        case 'approved':
        case 'STATUS_APPROVED':
            return {
                to: studentEmail,
                subject: `[สโมสรนิสิต TSU] อนุมัติคำขอยืมครุภัณฑ์: ${equipTitle}`,
                body: `เรียนคุณ ${request.borrowerName} (${borrowerIdentifier})

สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล มหาวิทยาลัยทักษิณ
ขอแจ้งให้ทราบว่า คำขอยืมครุภัณฑ์ของคุณได้รับการ "อนุมัติ" เรียบร้อยแล้ว ✅

📋 รายละเอียดการยืม:
${equipDetails}
- สถานที่ใช้งาน: ${request.location || '-'}
- วันที่ยืม: ${borrowDateStr}
- กำหนดส่งคืน: ${returnDateStr}
- วัตถุประสงค์: ${request.purpose || '-'}

📌 กรุณานำบัตรประจำตัวนิสิต/บุคลากรมาติดต่อขอรับครุภัณฑ์ ณ ห้องสโมสรนิสิต
และโปรดนำมาส่งคืนภายในกำหนดเวลาดังกล่าว

ขอขอบคุณ
สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล
มหาวิทยาลัยทักษิณ (${OFFICIAL_SENDER_EMAIL})`
            };

        case 'rejected':
        case 'STATUS_REJECTED':
            return {
                to: studentEmail,
                subject: `[สโมสรนิสิต TSU] แจ้งผลการพิจารณาคำขอยืมครุภัณฑ์: ${equipTitle}`,
                body: `เรียนคุณ ${request.borrowerName} (${borrowerIdentifier})

สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล มหาวิทยาลัยทักษิณ
ขอแจ้งให้ทราบว่า คำขอยืมครุภัณฑ์ของคุณ "ไม่ได้รับการอนุมัติ" ❌

📋 รายการ:
${equipDetails}

📌 เหตุผล:
${request.rejectReason || 'ข้อมูลไม่ครบถ้วนหรือไม่เป็นไปตามระเบียบของสโมสร'}

หากมีข้อสงสัยหรือต้องการสอบถามข้อมูลเพิ่มเติม สามารถติดต่อได้ที่ห้องสโมสรนิสิต

ขอขอบคุณ
สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล
มหาวิทยาลัยทักษิณ (${OFFICIAL_SENDER_EMAIL})`
            };

        case 'due_soon':
        case 'STATUS_DUE_SOON':
            return {
                to: studentEmail,
                subject: `[แจ้งเตือนด่วน - สโมสรนิสิต TSU] ใกล้ถึงกำหนดส่งคืนครุภัณฑ์ในอีก 1 ชม.: ${equipTitle}`,
                body: `เรียนคุณ ${request.borrowerName} (${borrowerIdentifier})

สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล มหาวิทยาลัยทักษิณ
ขอแจ้งเตือนว่า การยืมครุภัณฑ์ของคุณ "ใกล้จะถึงกำหนดส่งคืนในอีกประมาณ 1 ชั่วโมง" ⏰

📋 รายละเอียดการยืม:
${equipDetails}
- สถานที่ใช้งาน: ${request.location || '-'}
- วันที่ยืม: ${borrowDateStr}
- กำหนดส่งคืน: ${returnDateStr}
- วัตถุประสงค์: ${request.purpose || '-'}

📌 กรุณาตรวจสอบความเรียบร้อยและนำครุภัณฑ์มาส่งคืน ณ ห้องสโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล
ภายในกำหนดเวลาดังกล่าว เพื่ออำนวยความสะดวกแก่นิสิตและอาจารย์ท่านอื่นที่รอใช้งานต่อไป

หากนำมาส่งคืนเรียบร้อยแล้ว หรือมีเหตุขัดข้องประการใด โปรดติดต่อเจ้าหน้าที่สโมสรนิสิตทันที

ขอขอบคุณ
สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล
มหาวิทยาลัยทักษิณ (${OFFICIAL_SENDER_EMAIL})`
            };

        case 'overdue':
        case 'STATUS_OVERDUE':
            return {
                to: studentEmail,
                subject: `[ด่วนที่สุด - สโมสรนิสิต TSU] แจ้งเตือนเกินกำหนดส่งคืนครุภัณฑ์: ${equipTitle}`,
                body: `เรียนคุณ ${request.borrowerName} (${borrowerIdentifier})

⚠️ ด่วนที่สุด: การยืมครุภัณฑ์ของคุณได้ "เกินกำหนดส่งคืน" แล้ว 🔥
(กำหนดคืน: ${returnDateStr})

📋 รายการครุภัณฑ์ที่ต้องส่งคืน:
${equipDetails}

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
                subject: `[สโมสรนิสิต TSU] ยืนยันการรับคืนครุภัณฑ์: ${equipTitle}`,
                body: `เรียนคุณ ${request.borrowerName} (${borrowerIdentifier})

สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล มหาวิทยาลัยทักษิณ
ขอแจ้งว่าได้รับคืนครุภัณฑ์เรียบร้อยแล้ว 🔵

📋 รายการที่ส่งคืน:
${equipDetails}
${request.returnedReceiverName ? `👤 ผู้รับคืน: ${request.returnedReceiverName}\n` : ''}${request.returnNotes ? `📝 หมายเหตุสภาพพัสดุ: ${request.returnNotes}\n` : ''}
การยืมครุภัณฑ์ในรายการนี้เสร็จสมบูรณ์เรียบร้อย

ขอขอบคุณที่ให้ความร่วมมือในการส่งคืนครุภัณฑ์ตามกำหนด
สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล
มหาวิทยาลัยทักษิณ (${OFFICIAL_SENDER_EMAIL})`
            };

        default:
            return {
                to: studentEmail,
                subject: `[สโมสรนิสิต TSU] แจ้งเตือนการยืมครุภัณฑ์: ${equipTitle}`,
                body: `เรียนคุณ ${request.borrowerName} (${borrowerIdentifier})\n\n${equipDetails}\nสถานะ: ${request.status}\nกำหนดคืน: ${returnDateStr}`
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
    const studentEmail = data.studentEmail || data.borrowerEmail || data.contactEmail || getStudentEmail(data.studentId);
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
    const studentEmail = request.studentEmail || request.borrowerEmail || request.contactEmail || getStudentEmail(request.studentId);
    const equipDetails = formatEquipmentDetails(request);

    return `[สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล มหาวิทยาลัยทักษิณ]
ส่งจาก: ${OFFICIAL_SENDER_EMAIL}
ใบยืนยันการยืมครุภัณฑ์:
- ผู้ยืม: ${request.borrowerName} (${request.borrowerType === 'staff' ? (request.staffEmail || 'อาจารย์/บุคลากร') : request.studentId})
- อีเมลติดต่อ: ${studentEmail}
- เบอร์โทร: ${request.phone}
${equipDetails}
- สถานที่: ${request.location || '-'}
- วัตถุประสงค์: ${request.purpose || '-'}
- สถานะ: ${request.status}
- วันที่ยืม: ${request.borrowDate ? formatDate(request.borrowDate, true) : '-'}
- กำหนดคืน: ${request.returnDate ? formatDate(request.returnDate, true) : '-'}
${request.returnedDate ? `- วันที่ส่งคืนจริง: ${formatDate(request.returnedDate, true)}\n` : ''}${request.returnedReceiverName ? `- ผู้รับคืน: ${request.returnedReceiverName}\n` : ''}${request.returnNotes ? `- หมายเหตุการรับคืน: ${request.returnNotes}\n` : ''}`;
}

