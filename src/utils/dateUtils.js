/**
 * ฟังก์ชันช่วยเหลือจัดการวันที่ เวลา ระยะเวลา และสถานะเกินกำหนด (Overdue)
 */

export function parseDate(timestamp) {
    if (!timestamp) return null;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    if (timestamp instanceof Date) {
        return timestamp;
    }
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * จัดรูปแบบวันที่ภาษาไทย (เลือกแสดงเวลาได้)
 */
export function formatDate(timestamp, includeTime = false) {
    const d = parseDate(timestamp);
    if (!d) return '-';

    const dateStr = d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    // ถ้ามีเวลา (ไม่ใช่ 00:00 หรือระบุ includeTime)
    const hasTime = includeTime || d.getHours() !== 0 || d.getMinutes() !== 0;
    if (hasTime) {
        const timeStr = d.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        return `${dateStr} เวลา ${timeStr} น.`;
    }

    return dateStr;
}

/**
 * จัดรูปแบบ วันที่ + เวลาแบบกระชับ e.g. "12 ต.ค. 2569 (16:30 น.)"
 */
export function formatDateTime(timestamp) {
    const d = parseDate(timestamp);
    if (!d) return '-';

    const dateStr = d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    const timeStr = d.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return `${dateStr} (${timeStr} น.)`;
}

/**
 * จัดรูปแบบช่วงเวลายืม-คืนแบบเข้าใจง่าย
 * - ถ้ายืมวันเดียวกัน: "12 ต.ค. 2569 (08:30 → 16:30 น.)"
 * - ถ้าข้ามวัน: "12 ต.ค. 2569 (08:30 น.) → 15 ต.ค. 2569 (16:30 น.)"
 */
export function formatDateTimeRange(borrowTimestamp, returnTimestamp) {
    const b = parseDate(borrowTimestamp);
    const r = parseDate(returnTimestamp);
    if (!b || !r) return '-';

    const isSameDay = b.getFullYear() === r.getFullYear() &&
        b.getMonth() === r.getMonth() &&
        b.getDate() === r.getDate();

    const bTime = b.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
    const rTime = r.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });

    if (isSameDay) {
        const dateStr = b.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        return {
            isSameDay: true,
            dateStr,
            timeRange: `${bTime} → ${rTime} น.`,
            fullText: `${dateStr} (${bTime} → ${rTime} น.)`
        };
    } else {
        const bDateStr = b.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        const rDateStr = r.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        return {
            isSameDay: false,
            bDateStr: `${bDateStr} (${bTime} น.)`,
            rDateStr: `${rDateStr} (${rTime} น.)`,
            fullText: `${bDateStr} (${bTime} น.) → ${rDateStr} (${rTime} น.)`
        };
    }
}

/**
 * คำนวณระยะเวลาการยืมเป็นข้อความ e.g. "8 ชม. (ยืมวันเดียว)" หรือ "3 วัน 2 ชม."
 */
export function getBorrowDurationText(borrowTimestamp, returnTimestamp) {
    const b = parseDate(borrowTimestamp);
    const r = parseDate(returnTimestamp);
    if (!b || !r) return '';

    const diffMs = r.getTime() - b.getTime();
    if (diffMs <= 0) return 'เวลาคืนต้องหลังเวลายืม';

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    if (days === 0) {
        if (minutes === 0) {
            return `${hours} ชั่วโมง (ยืมวันเดียว)`;
        }
        return `${hours} ชม. ${minutes} นาที (ยืมวันเดียว)`;
    } else {
        if (remainingHours === 0 && minutes === 0) {
            return `${days} วัน`;
        } else if (remainingHours > 0) {
            return `${days} วัน ${remainingHours} ชม.`;
        }
        return `${days} วัน ${minutes} นาที`;
    }
}

/**
 * ตรวจสอบว่าเกินกำหนดส่งคืนหรือไม่ (แม่นยำระดับนาที)
 */
export function isOverdue(request) {
    if (!request || request.status !== 'approved') return false;
    const returnDate = parseDate(request.returnDate);
    if (!returnDate) return false;

    return new Date() > returnDate;
}

/**
 * คำนวณเวลาที่เกินกำหนดเป็นข้อความ e.g. "2 ชั่วโมง" หรือ "3 วัน"
 */
export function getOverdueText(request) {
    if (!isOverdue(request)) return '';
    const returnDate = parseDate(request.returnDate);
    if (!returnDate) return '';

    const diffMs = new Date().getTime() - returnDate.getTime();
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} วัน`;
    } else if (hours > 0) {
        return `${hours} ชั่วโมง`;
    } else {
        return `${Math.max(1, totalMinutes)} นาที`;
    }
}

export function getDaysOverdue(request) {
    if (!isOverdue(request)) return 0;
    const returnDate = parseDate(request.returnDate);
    if (!returnDate) return 0;

    const diffMs = new Date().getTime() - returnDate.getTime();
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
