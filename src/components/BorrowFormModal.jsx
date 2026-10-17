import { useState, useMemo } from 'react';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { getStudentEmail } from '../utils/notificationService';
import { getBorrowDurationText } from '../utils/dateUtils';
import { useToast } from '../context/ToastContext';
import FacultySelect, { FACULTIES } from './FacultySelect';

// ฟังก์ชันแปลง Date เป็น YYYY-MM-DD ตามเวลาท้องถิ่นไทย (ป้องกันปัญหา timezone UTC+7 เลื่อนวัน)
const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// ฟังก์ชันแปลง Date เป็น HH:MM ตามเวลาท้องถิ่นไทย
const getLocalTimeString = (d = new Date()) => {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
};

// ฟังก์ชันบวกวันตามปฏิทินท้องถิ่น
const addDaysLocal = (baseDateStr, days) => {
    if (!baseDateStr) return '';
    const [y, m, d] = baseDateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return getLocalDateString(dt);
};

// รายชื่อวันและเดือนภาษาไทยย่อ
const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const formatThaiDateShort = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dayName = THAI_DAYS_SHORT[dt.getDay()];
    const monthName = THAI_MONTHS_SHORT[m - 1];
    return `${dayName} ${d} ${monthName}`;
};

export default function BorrowFormModal({
    equipment = null,
    initialItems = null,
    allEquipments = [],
    onClose,
    onSubmit
}) {
    const toast = useToast();
    const [hpWebsite, setHpWebsite] = useState('');
    // วันนี้ในรูปแบบ YYYY-MM-DD ตามเวลาท้องถิ่นไทย
    const today = getLocalDateString();
    const MAX_BORROW_DAYS = 7;
    const maxBorrowDate = addDaysLocal(today, MAX_BORROW_DAYS);

    // กำหนดเวลายืมเริ่มต้นเป็นเวลาปัจจุบันทันที (ฟิกเวลาตอนนี้ ห้ามยืมย้อนหลัง)
    const getInitialSchedule = () => {
        const now = new Date();
        const curTimeStr = getLocalTimeString(now);
        let returnDateStr = today;
        let returnTimeStr = '16:30';

        if (curTimeStr >= '16:00') {
            const curH = now.getHours();
            if (curH <= 21) {
                // เย็นหรือค่ำ: บวก 2 ชั่วโมงจากปัจจุบัน (ไม่เกิน 23:59)
                const retDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
                returnTimeStr = getLocalTimeString(retDate);
            } else {
                // ดึกมากแล้ว (22:00+): ส่งคืนพรุ่งนี้เย็น 16:30 น.
                returnDateStr = addDaysLocal(today, 1);
                returnTimeStr = '16:30';
            }
        }

        return {
            borrowDate: today,
            borrowTime: curTimeStr,
            returnDate: returnDateStr,
            returnTime: returnTimeStr
        };
    };

    const initialSchedule = getInitialSchedule();

    // รายการครุภัณฑ์ที่เลือกไว้ (รองรับการยืมหลายชิ้น/หลายรายการพร้อมกัน)
    const [selectedItems, setSelectedItems] = useState(() => {
        if (initialItems && Array.isArray(initialItems) && initialItems.length > 0) {
            return initialItems.map(item => ({
                equipmentId: item.id || item.equipmentId,
                equipmentName: item.name || item.equipmentName,
                equipmentCategory: item.category || item.equipmentCategory || '',
                equipmentSerial: item.serialNumber || item.equipmentSerial || '',
                imageUrl: item.imageUrl || '',
                availableStock: typeof item.availableStock === 'number' ? item.availableStock : (item.quantity || 1),
                quantity: item.borrowQuantity || 1
            }));
        }
        if (equipment) {
            return [{
                equipmentId: equipment.id,
                equipmentName: equipment.name,
                equipmentCategory: equipment.category || '',
                equipmentSerial: equipment.serialNumber || '',
                imageUrl: equipment.imageUrl || '',
                availableStock: equipment.quantity,
                quantity: 1
            }];
        }
        return [];
    });

    const [showAddEquipment, setShowAddEquipment] = useState(false);
    const [searchEquipToAdd, setSearchEquipToAdd] = useState('');

    const [selectedFaculty, setSelectedFaculty] = useState('คณะวิทยาศาสตร์และนวัตกรรมดิจิทัล');
    const [customAffiliation, setCustomAffiliation] = useState('');

    const [formData, setFormData] = useState({
        borrowerType: 'student', // 'student' | 'staff'
        borrowerName: '',
        studentId: '',
        staffEmail: '',
        phone: '',
        affiliation: 'คณะวิทยาศาสตร์และนวัตกรรมดิจิทัล',
        position: '',
        location: '',
        borrowDate: initialSchedule.borrowDate,
        borrowTime: initialSchedule.borrowTime,
        returnDate: initialSchedule.returnDate,
        returnTime: initialSchedule.returnTime,
        purpose: ''
    });

    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const studentEmail = getStudentEmail(formData.studentId);
    const contactEmail = formData.borrowerType === 'student'
        ? studentEmail
        : formData.staffEmail.trim();

    // จัดการจำนวนของแต่ละชิ้น
    const handleItemQuantityChange = (equipmentId, delta) => {
        setSelectedItems(prev => prev.map(item => {
            if (item.equipmentId !== equipmentId) return item;
            const cur = parseInt(item.quantity, 10) || 1;
            const next = Math.max(1, Math.min(item.availableStock, cur + delta));
            return { ...item, quantity: next };
        }));
    };

    const handleItemQuantityInput = (equipmentId, val) => {
        setSelectedItems(prev => prev.map(item => {
            if (item.equipmentId !== equipmentId) return item;
            if (val === '') return { ...item, quantity: '' };
            const num = parseInt(val, 10);
            if (isNaN(num)) return item;
            return { ...item, quantity: Math.max(1, Math.min(item.availableStock, num)) };
        }));
    };

    // ลบครุภัณฑ์ออกจากรายการ
    const handleRemoveItem = (equipmentId) => {
        setSelectedItems(prev => prev.filter(item => item.equipmentId !== equipmentId));
    };

    // เพิ่มครุภัณฑ์ใหม่ลงในรายการ
    const handleAddItem = (eq) => {
        setSelectedItems(prev => {
            if (prev.some(it => it.equipmentId === eq.id)) return prev;
            return [
                ...prev,
                {
                    equipmentId: eq.id,
                    equipmentName: eq.name,
                    equipmentCategory: eq.category || '',
                    equipmentSerial: eq.serialNumber || '',
                    imageUrl: eq.imageUrl || '',
                    availableStock: eq.quantity,
                    quantity: 1
                }
            ];
        });
        setShowAddEquipment(false);
        setSearchEquipToAdd('');
    };

    // รายการครุภัณฑ์ในระบบที่ยังไม่ได้เลือกและมีของในสต็อก
    const availableToAdd = useMemo(() => {
        const selectedIds = new Set(selectedItems.map(i => i.equipmentId));
        return allEquipments
            .filter(e => !selectedIds.has(e.id) && e.quantity > 0)
            .filter(e => {
                if (!searchEquipToAdd.trim()) return true;
                const kw = searchEquipToAdd.toLowerCase();
                return (
                    e.name.toLowerCase().includes(kw) ||
                    (e.category && e.category.toLowerCase().includes(kw)) ||
                    (e.serialNumber && e.serialNumber.toLowerCase().includes(kw))
                );
            });
    }, [allEquipments, selectedItems, searchEquipToAdd]);

    // ผลรวมจำนวนชิ้นทั้งหมด
    const totalQuantity = useMemo(() => {
        return selectedItems.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);
    }, [selectedItems]);

    // จัดการเลือกคณะจาก Dropdown หรือกรอกเองเมื่อเลือก อื่นๆ
    const handleFacultySelect = (value) => {
        setSelectedFaculty(value);
        if (value === 'อื่นๆ (ระบุเอง)') {
            setFormData(prev => ({ ...prev, affiliation: customAffiliation }));
        } else {
            setFormData(prev => ({ ...prev, affiliation: value }));
        }
        if (errors.affiliation) {
            setErrors(prev => {
                const copy = { ...prev };
                delete copy.affiliation;
                return copy;
            });
        }
    };

    const handleCustomAffiliationChange = (val) => {
        setCustomAffiliation(val);
        setFormData(prev => ({ ...prev, affiliation: val }));
        if (errors.affiliation) {
            setErrors(prev => {
                const copy = { ...prev };
                delete copy.affiliation;
                return copy;
            });
        }
    };

    const handleTypeSwitch = (type) => {
        setFormData(prev => ({
            ...prev,
            borrowerType: type,
            affiliation: type === 'student'
                ? (selectedFaculty === 'อื่นๆ (ระบุเอง)' ? customAffiliation : selectedFaculty)
                : ''
        }));
        setErrors(prev => {
            const copy = { ...prev };
            delete copy.studentId;
            delete copy.staffEmail;
            delete copy.affiliation;
            return copy;
        });
    };

    // คำนวณวันส่งคืนสูงสุด (ไม่เกิน 7 วันนับจากวันที่ยืม) โดยใช้ local date ป้องกันปัญหา timezone
    const maxReturnDate = useMemo(() => {
        if (!formData.borrowDate) return '';
        return addDaysLocal(formData.borrowDate, MAX_BORROW_DAYS);
    }, [formData.borrowDate]);

    // สร้างตัวเลือกวันส่งคืน 7 วันสำหรับแถบปฏิทินด่วน (Visual 7-Day Day Selector)
    const returnDayOptions = useMemo(() => {
        const base = formData.borrowDate || today;
        const options = [];
        for (let i = 0; i <= MAX_BORROW_DAYS; i++) {
            const dStr = addDaysLocal(base, i);
            const [y, m, d] = dStr.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            const dayName = THAI_DAYS_SHORT[dt.getDay()];
            const monthName = THAI_MONTHS_SHORT[m - 1];
            options.push({
                offset: i,
                dateStr: dStr,
                dayName,
                dayNumber: d,
                monthName,
                label: i === 0 ? 'วันเดียวกัน' : i === 1 ? 'พรุ่งนี้' : `+${i} วัน`,
                isMax: i === MAX_BORROW_DAYS
            });
        }
        return options;
    }, [formData.borrowDate, today]);

    // สร้างตัวเลือกวันที่ยืม 7 วันสำหรับแถบปฏิทินด่วน (Visual 7-Day Day Selector for Borrow)
    const borrowDayOptions = useMemo(() => {
        const options = [];
        for (let i = 0; i <= MAX_BORROW_DAYS; i++) {
            const dStr = addDaysLocal(today, i);
            const [y, m, d] = dStr.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            const dayName = THAI_DAYS_SHORT[dt.getDay()];
            const monthName = THAI_MONTHS_SHORT[m - 1];
            options.push({
                offset: i,
                dateStr: dStr,
                dayName,
                dayNumber: d,
                monthName,
                label: i === 0 ? 'วันนี้' : i === 1 ? 'พรุ่งนี้' : `+${i} วัน`,
                isMax: i === MAX_BORROW_DAYS
            });
        }
        return options;
    }, [today]);

    // ตั้งค่ากลับเป็นวันนี้แบบ Real-time
    const syncToCurrentTime = () => {
        const nowTime = getLocalTimeString();
        setFormData(prev => {
            let nextReturnTime = prev.returnTime;
            // ถ้าคืนวันนี้ และเวลาคืนเดิมน้อยกว่าหรือเท่ากับเวลาปัจจุบัน ให้ขยับเวลาคืนเป็น +2 ชม.
            if (prev.returnDate === today && nextReturnTime <= nowTime) {
                const now = new Date();
                const retDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
                nextReturnTime = getLocalTimeString(retDate);
            }
            return {
                ...prev,
                borrowDate: today,
                borrowTime: nowTime,
                returnDate: prev.returnDate < today ? today : prev.returnDate,
                returnTime: nextReturnTime
            };
        });
        if (toast) toast.success(`⚡ ปรับเป็นยืมวันนี้เรียบร้อย`);
    };

    // ปรับเวลาคืนด่วน (+1, +2, +4 ชม.)
    const applyReturnTimeOffset = (hours) => {
        const base = new Date();
        const target = new Date(base.getTime() + hours * 60 * 60 * 1000);
        const nextTime = getLocalTimeString(target);

        // ถ้าเวลาล้นข้ามวัน
        if (target.getDate() !== base.getDate()) {
            const nextDay = addDaysLocal(formData.borrowDate || today, 1);
            if (nextDay <= maxReturnDate) {
                setFormData(prev => ({ ...prev, returnDate: nextDay, returnTime: nextTime }));
            }
        } else {
            setFormData(prev => ({ ...prev, returnDate: prev.borrowDate || today, returnTime: nextTime }));
        }
    };

    // จัดการเปลี่ยนวันที่ยืม พร้อมระบบ Auto-Clamp ป้องกันเลือกย้อนหลังหรือเกิน 7 วัน
    const handleBorrowDateChange = (val) => {
        if (!val) return;
        let nextBorrowDate = val;

        // ล็อคห้ามยืมย้อนหลัง
        if (nextBorrowDate < today) {
            if (toast) toast.warning('ไม่สามารถยืมย้อนหลังได้ (ระบบปรับเป็นวันนี้ให้แล้ว)');
            nextBorrowDate = today;
        }

        // ล็อคห้ามจองล่วงหน้าเกิน 7 วัน
        if (maxBorrowDate && nextBorrowDate > maxBorrowDate) {
            if (toast) toast.warning(`สามารถจองยืมล่วงหน้าได้สูงสุดไม่เกิน ${MAX_BORROW_DAYS} วัน`);
            nextBorrowDate = maxBorrowDate;
        }

        const nowTime = getLocalTimeString();
        const nextBorrowTime = nextBorrowDate === today ? nowTime : '08:30';

        setFormData(prev => {
            const newMaxReturn = addDaysLocal(nextBorrowDate, MAX_BORROW_DAYS);
            let nextReturnDate = prev.returnDate;

            // ถ้ากำหนดคืนเดิมน้อยกว่าวันที่ยืมใหม่ -> ปรับให้เท่ากับวันที่ยืมใหม่
            if (nextReturnDate < nextBorrowDate) {
                nextReturnDate = nextBorrowDate;
            } else if (nextReturnDate > newMaxReturn) {
                // ถ้ากำหนดคืนเดิมเกิน 7 วันของวันที่ยืมใหม่ -> ล็อคให้ไม่เกิน 7 วัน
                nextReturnDate = newMaxReturn;
            }

            let nextReturnTime = prev.returnTime;
            if (nextReturnDate === nextBorrowDate && nextReturnTime <= nextBorrowTime) {
                const now = new Date();
                const retDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
                nextReturnTime = getLocalTimeString(retDate);
            }

            return {
                ...prev,
                borrowDate: nextBorrowDate,
                borrowTime: nextBorrowTime,
                returnDate: nextReturnDate,
                returnTime: nextReturnTime
            };
        });

        if (errors.borrowDate || errors.borrowTime) {
            setErrors(prev => {
                const copy = { ...prev };
                delete copy.borrowDate;
                delete copy.borrowTime;
                return copy;
            });
        }
    };

    // จัดการเปลี่ยนกำหนดคืน (วันที่) พร้อมระบบ Auto-Clamp ล็อคห้ามเกิน 7 วันบนทุกอุปกรณ์ (โดยเฉพาะโทรศัพท์)
    const handleReturnDateChange = (val) => {
        if (!val) return;
        const minAllowed = formData.borrowDate || today;
        const maxAllowed = maxReturnDate;

        let nextReturnDate = val;

        if (nextReturnDate < minAllowed) {
            if (toast) toast.warning('กำหนดคืนต้องไม่ก่อนวันที่ยืม');
            nextReturnDate = minAllowed;
        } else if (maxAllowed && nextReturnDate > maxAllowed) {
            if (toast) toast.warning(`ระบบล็อคยืมได้สูงสุดไม่เกิน ${MAX_BORROW_DAYS} วัน (ไม่เกิน ${formatThaiDateShort(maxAllowed)})`);
            nextReturnDate = maxAllowed;
        }

        setFormData(prev => ({
            ...prev,
            returnDate: nextReturnDate
        }));

        if (errors.returnDate) {
            setErrors(prev => {
                const copy = { ...prev };
                delete copy.returnDate;
                return copy;
            });
        }
    };

    // จัดการเปลี่ยนเวลาส่งคืน พร้อมตรวจสอบไม่ให้ย้อนหลัง
    const handleReturnTimeChange = (val) => {
        if (!val) return;
        const nowTime = getLocalTimeString();
        const effectiveBorrowTime = formData.borrowDate === today ? nowTime : (formData.borrowTime || '08:30');

        // 1. ถ้าส่งคืนวันนี้ และเวลาคืนน้อยกว่าหรือเท่ากับเวลาปัจจุบัน
        if (formData.returnDate === today && val <= nowTime) {
            if (toast) toast.warning(`เวลาส่งคืนต้องอยู่หลังเวลาปัจจุบัน (ปัจจุบันคือ ${nowTime} น.)`);
            return;
        }

        // 2. ถ้าคืนวันเดียวกับวันที่ยืม และเวลาคืนน้อยกว่าหรือเท่ากับเวลาเริ่มต้นยืม
        if (formData.returnDate === formData.borrowDate && val <= effectiveBorrowTime) {
            if (toast) toast.warning(`เวลาส่งคืนต้องอยู่หลังเวลาเริ่มต้นยืม (${effectiveBorrowTime} น.)`);
        }

        setFormData(prev => ({ ...prev, returnTime: val }));

        if (errors.returnTime) {
            setErrors(prev => {
                const copy = { ...prev };
                delete copy.returnTime;
                return copy;
            });
        }
    };

    // คำนวณความถูกต้องและระยะเวลายืมแบบ Realtime
    const durationInfo = useMemo(() => {
        if (!formData.borrowDate || !formData.returnDate || !formData.returnTime) {
            return null;
        }

        const nowTime = getLocalTimeString();
        const effectiveBorrowTime = formData.borrowDate === today ? nowTime : (formData.borrowTime || '08:30');

        const bDate = new Date(`${formData.borrowDate}T${effectiveBorrowTime}:00`);
        const rDate = new Date(`${formData.returnDate}T${formData.returnTime}:00`);

        if (isNaN(bDate.getTime()) || isNaN(rDate.getTime())) return null;

        const diffMs = rDate.getTime() - bDate.getTime();
        const maxMs = MAX_BORROW_DAYS * 24 * 60 * 60 * 1000;

        const isReturnPast = formData.returnDate === today && formData.returnTime < nowTime;
        const isTooLong = diffMs > maxMs;
        const isReturnBeforeBorrow = diffMs < 10 * 60 * 1000;
        const isValid = !isReturnPast && !isTooLong && !isReturnBeforeBorrow;
        const text = getBorrowDurationText(bDate, rDate);

        return {
            isValid,
            isReturnPast,
            isTooLong,
            isReturnBeforeBorrow,
            diffMs,
            text,
            isSameDay: formData.borrowDate === formData.returnDate
        };
    }, [formData.borrowDate, formData.borrowTime, formData.returnDate, formData.returnTime, today]);

    // ฟังก์ชันช่วยตั้งค่าปุ่มลัด (Quick Presets)
    const applyPreset = (presetKey) => {
        const base = formData.borrowDate || today;

        if (presetKey === 'today_evening') {
            setFormData(prev => ({
                ...prev,
                returnDate: base,
                returnTime: '16:30'
            }));
        } else if (presetKey === 'today_night') {
            setFormData(prev => ({
                ...prev,
                returnDate: base,
                returnTime: '19:00'
            }));
        } else if (presetKey === 'tomorrow_morning') {
            setFormData(prev => ({
                ...prev,
                returnDate: addDaysLocal(base, 1),
                returnTime: '09:00'
            }));
        } else if (presetKey === 'tomorrow_evening') {
            setFormData(prev => ({
                ...prev,
                returnDate: addDaysLocal(base, 1),
                returnTime: '16:30'
            }));
        } else if (presetKey === 'days_3') {
            setFormData(prev => ({
                ...prev,
                returnDate: addDaysLocal(base, 3),
                returnTime: '16:30'
            }));
        } else if (presetKey === 'days_7') {
            setFormData(prev => ({
                ...prev,
                returnDate: addDaysLocal(base, 7),
                returnTime: '16:30'
            }));
        }
        if (errors.returnDate || errors.returnTime) {
            setErrors(prev => {
                const copy = { ...prev };
                delete copy.returnDate;
                delete copy.returnTime;
                return copy;
            });
        }
    };

    const validate = () => {
        const newErrors = {};

        // ตรวจสอบรายการครุภัณฑ์
        if (selectedItems.length === 0) {
            newErrors.items = 'กรุณาเลือกครุภัณฑ์ที่ต้องการยืมอย่างน้อย 1 รายการ';
        } else {
            for (const item of selectedItems) {
                const qty = parseInt(item.quantity, 10);
                if (!qty || qty < 1) {
                    newErrors.items = `จำนวนของ "${item.equipmentName}" ต้องมากกว่า 0`;
                    break;
                }
                if (qty > item.availableStock) {
                    newErrors.items = `จำนวนของ "${item.equipmentName}" เกินคงเหลือในคลัง (${item.availableStock} ชิ้น)`;
                    break;
                }
            }
        }

        if (!formData.borrowerName.trim()) newErrors.borrowerName = 'กรุณากรอกชื่อ-สกุล';
        if (!formData.phone.trim()) newErrors.phone = 'กรุณากรอกเบอร์โทรศัพท์';
        if (!formData.location.trim()) newErrors.location = 'กรุณากรอกสถานที่ใช้งาน';

        if (formData.borrowerType === 'student') {
            if (!formData.studentId.trim()) newErrors.studentId = 'กรุณากรอกรหัสนิสิต';
            if (!formData.affiliation.trim()) {
                newErrors.affiliation = 'กรุณาเลือกหรือระบุคณะ';
            }
        } else {
            if (!formData.staffEmail.trim()) {
                newErrors.staffEmail = 'กรุณากรอกอีเมลติดต่อ (TSU Mail หรือ Gmail)';
            } else if (!formData.staffEmail.includes('@') || !formData.staffEmail.includes('.')) {
                newErrors.staffEmail = 'รูปแบบอีเมลไม่ถูกต้อง';
            }
            // สังกัด/หน่วยงาน ไม่บังคับสำหรับอาจารย์/บุคลากร/รร.สาธิต/วมว./นักเรียน (เว้นว่างได้)
        }

        const nowTime = getLocalTimeString();
        const effectiveBorrowTime = formData.borrowDate === today ? nowTime : (formData.borrowTime || '08:30');

        // ตรวจสอบวันที่ยืม
        if (!formData.borrowDate) {
            newErrors.borrowDate = 'กรุณาเลือกวันที่ยืม';
        } else if (formData.borrowDate < today) {
            newErrors.borrowDate = 'ไม่สามารถยืมย้อนหลังได้ (ต้องเป็นวันนี้เป็นต้นไป)';
        } else if (maxBorrowDate && formData.borrowDate > maxBorrowDate) {
            newErrors.borrowDate = `สามารถจองยืมล่วงหน้าได้ไม่เกิน ${MAX_BORROW_DAYS} วัน`;
        }

        // ตรวจสอบกำหนดคืน
        if (!formData.returnDate) {
            newErrors.returnDate = 'กรุณาเลือกกำหนดคืน';
        } else if (formData.returnDate < formData.borrowDate) {
            newErrors.returnDate = 'กำหนดคืนต้องไม่ก่อนวันที่ยืม';
        } else if (maxReturnDate && formData.returnDate > maxReturnDate) {
            newErrors.returnDate = `ยืมได้สูงสุดไม่เกิน ${MAX_BORROW_DAYS} วัน (1 สัปดาห์)`;
        }

        // ตรวจสอบเวลาคืน
        if (!formData.returnTime) {
            newErrors.returnTime = 'กรุณาระบุเวลาคืน';
        } else if (formData.returnDate === today && formData.returnTime <= nowTime) {
            newErrors.returnTime = `เวลาส่งคืนต้องอยู่หลังเวลาปัจจุบัน (ปัจจุบันคือ ${nowTime} น.)`;
        }

        // ตรวจสอบวันและเวลาแบบละเอียด
        if (formData.borrowDate && formData.returnDate && formData.returnTime) {
            const bDate = new Date(`${formData.borrowDate}T${effectiveBorrowTime}:00`);
            const rDate = new Date(`${formData.returnDate}T${formData.returnTime}:00`);
            const diffMs = rDate.getTime() - bDate.getTime();
            const maxMs = MAX_BORROW_DAYS * 24 * 60 * 60 * 1000;

            if (rDate <= bDate) {
                newErrors.returnTime = 'เวลาคืนต้องอยู่หลังเวลาที่ยืม';
            } else if (diffMs < 10 * 60 * 1000) {
                newErrors.returnTime = 'ระยะเวลายืมต้องไม่น้อยกว่า 10 นาที';
            } else if (diffMs > maxMs) {
                newErrors.returnTime = `ยืมได้สูงสุดไม่เกิน ${MAX_BORROW_DAYS} วัน (1 สัปดาห์)`;
            }
        }

        if (!formData.purpose.trim()) newErrors.purpose = 'กรุณากรอกวัตถุประสงค์';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 1. ตรวจสอบ Anti-Bot Honeypot: หากบอทแอบกรอกฟิลด์ที่มองไม่เห็น ให้ระงับทันที
        if (hpWebsite) {
            console.warn('[Security] Bot submission intercepted via honeypot');
            onClose();
            return;
        }

        // 2. ป้องกันการส่งสแปมซ้ำซ้อน (Rate Limit Cooldown: 10 วินาที)
        const lastSubmit = localStorage.getItem('smo_last_borrow_submit_time');
        const now = Date.now();
        if (lastSubmit && now - parseInt(lastSubmit, 10) < 10000) {
            if (toast) toast.warning('กรุณารอสักครู่ (10 วินาที) ก่อนส่งคำขอถัดไป เพื่อป้องกันข้อมูลซ้ำซ้อน');
            return;
        }

        if (!validate()) return;

        setSubmitting(true);
        try {
            const cleanStr = (s) => String(s || '').replace(/[<>]/g, '').trim();

            const nowTime = getLocalTimeString();
            const effectiveBorrowTime = formData.borrowDate === today ? nowTime : (formData.borrowTime || '08:30');

            const borrowDateTime = new Date(`${formData.borrowDate}T${effectiveBorrowTime}:00`);
            const returnDateTime = new Date(`${formData.returnDate}T${formData.returnTime}:00`);

            const primaryItem = selectedItems[0];
            const equipmentNamesStr = selectedItems.map(i => `${i.equipmentName} (${i.quantity})`).join(', ');

            const itemsPayload = selectedItems.map(item => ({
                equipmentId: item.equipmentId,
                equipmentName: item.equipmentName,
                equipmentCategory: item.equipmentCategory || '',
                equipmentSerial: item.equipmentSerial || '',
                imageUrl: item.imageUrl || '',
                quantity: parseInt(item.quantity, 10) || 1
            }));

            await onSubmit({
                ...formData,
                borrowerName: cleanStr(formData.borrowerName),
                phone: cleanStr(formData.phone),
                location: cleanStr(formData.location),
                purpose: cleanStr(formData.purpose),
                items: itemsPayload,
                totalItems: selectedItems.length,
                totalQuantity: totalQuantity,
                // ข้อมูลสำหรับความเข้ากันได้ย้อนหลัง (Backward Compatibility)
                equipmentId: primaryItem.equipmentId,
                equipmentName: equipmentNamesStr,
                equipmentCategory: primaryItem.equipmentCategory || '',
                equipmentSerial: primaryItem.equipmentSerial || '',
                quantity: totalQuantity,
                borrowerType: formData.borrowerType,
                studentId: formData.borrowerType === 'student' ? cleanStr(formData.studentId) : '-',
                staffId: '',
                position: formData.borrowerType === 'staff' ? cleanStr(formData.position) : '',
                studentEmail: contactEmail,
                borrowerEmail: contactEmail,
                contactEmail: contactEmail,
                affiliation: formData.borrowerType === 'student'
                    ? (cleanStr(formData.affiliation) || 'คณะวิทยาศาสตร์และนวัตกรรมดิจิทัล')
                    : (formData.affiliation ? cleanStr(formData.affiliation) : '-'),
                borrowDate: Timestamp.fromDate(borrowDateTime),
                returnDate: Timestamp.fromDate(returnDateTime),
                borrowTime: effectiveBorrowTime,
                returnTime: formData.returnTime,
                status: 'pending',
                requestDate: serverTimestamp(),
                approvedDate: null,
                returnedDate: null,
                rejectedDate: null,
                rejectReason: null
            });
            localStorage.setItem('smo_last_borrow_submit_time', String(Date.now()));
            onClose();
        } catch (error) {
            console.error('Error submitting borrow request:', error);
            if (toast) {
                const errorMsg = error.message && (error.message.includes('ขออภัย') || error.message.includes('ไม่พบข้อมูล') || error.message.includes('คงเหลือ'))
                    ? error.message
                    : 'เกิดข้อผิดพลาดในการส่งคำขอยืม กรุณาลองใหม่อีกครั้ง';
                toast.error(errorMsg);
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>📝 แบบฟอร์มขอยืมครุภัณฑ์</h3>
                    <button className="modal-close" onClick={onClose} aria-label="ปิด">×</button>
                </div>
                <form onSubmit={handleSubmit}>
                    {/* Anti-Bot Honeypot (ซ่อนจากผู้ใช้งานจริง หากบอทแอบกรอกระบบจะดักจับทันที) */}
                    <div style={{ display: 'none', position: 'absolute', left: '-9999px', opacity: 0 }} aria-hidden="true">
                        <input
                            type="text"
                            name="hp_website_confirm"
                            tabIndex={-1}
                            autoComplete="off"
                            value={hpWebsite}
                            onChange={e => setHpWebsite(e.target.value)}
                        />
                    </div>
                    <div className="modal-body">
                        {/* Section: รายการครุภัณฑ์ที่ยืม (รองรับครั้งละหลายชิ้น) */}
                        <div className="borrow-items-container">
                            <div className="borrow-items-header">
                                <label className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--primary-dark)' }}>
                                    📦 รายการครุภัณฑ์ที่ต้องการยืม ({selectedItems.length} รายการ, รวม {totalQuantity} ชิ้น)
                                </label>
                                {allEquipments.length > 0 && (
                                    <button
                                        type="button"
                                        className="btn-add-item-trigger"
                                        onClick={() => setShowAddEquipment(!showAddEquipment)}
                                    >
                                        {showAddEquipment ? '✕ ปิดตัวเลือก' : '➕ เพิ่มครุภัณฑ์ชิ้นอื่น'}
                                    </button>
                                )}
                            </div>

                            {errors.items && (
                                <div className="alert alert-error" style={{ margin: '0.5rem 0', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
                                    ⚠️ {errors.items}
                                </div>
                            )}

                            {/* แสดงรายการครุภัณฑ์ที่เลือก */}
                            {selectedItems.length === 0 ? (
                                <div className="empty-items-notice">
                                    <p>ยังไม่มีครุภัณฑ์ในรายการ กรุณากดปุ่ม <strong>"➕ เพิ่มครุภัณฑ์ชิ้นอื่น"</strong> ด้านบน</p>
                                </div>
                            ) : (
                                <div className="borrow-items-list">
                                    {selectedItems.map((item) => (
                                        <div key={item.equipmentId} className="borrow-item-card">
                                            <div className="borrow-item-preview">
                                                {item.imageUrl ? (
                                                    <img src={item.imageUrl} alt={item.equipmentName} className="borrow-item-img" />
                                                ) : (
                                                    <div className="borrow-item-placeholder">📦</div>
                                                )}
                                            </div>

                                            <div className="borrow-item-info">
                                                <h4 className="borrow-item-title">{item.equipmentName}</h4>
                                                <div className="borrow-item-meta">
                                                    <span className="card-category-sm">{item.equipmentCategory || 'ทั่วไป'}</span>
                                                    {item.equipmentSerial && (
                                                        <span className="badge-serial-sm">SN: {item.equipmentSerial}</span>
                                                    )}
                                                    <span className="borrow-item-stock">
                                                        คงเหลือในคลัง: <strong>{item.availableStock}</strong> ชิ้น
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="borrow-item-controls">
                                                <div className="quantity-stepper">
                                                    <button
                                                        type="button"
                                                        className="btn-stepper btn-stepper-minus"
                                                        disabled={Number(item.quantity) <= 1}
                                                        onClick={() => handleItemQuantityChange(item.equipmentId, -1)}
                                                        title="ลดจำนวน"
                                                        aria-label="ลดจำนวน"
                                                    >
                                                        −
                                                    </button>
                                                    <input
                                                        type="number"
                                                        className="stepper-input"
                                                        min="1"
                                                        max={item.availableStock}
                                                        value={item.quantity}
                                                        onChange={(e) => handleItemQuantityInput(item.equipmentId, e.target.value)}
                                                        onBlur={() => {
                                                            if (!item.quantity || item.quantity < 1) {
                                                                handleItemQuantityInput(item.equipmentId, 1);
                                                            }
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn-stepper btn-stepper-plus"
                                                        disabled={Number(item.quantity) >= item.availableStock}
                                                        onClick={() => handleItemQuantityChange(item.equipmentId, 1)}
                                                        title="เพิ่มจำนวน"
                                                        aria-label="เพิ่มจำนวน"
                                                    >
                                                        +
                                                    </button>
                                                </div>

                                                {selectedItems.length > 1 && (
                                                    <button
                                                        type="button"
                                                        className="btn-remove-item"
                                                        onClick={() => handleRemoveItem(item.equipmentId)}
                                                        title="ลบรายการนี้"
                                                        aria-label="ลบรายการนี้"
                                                    >
                                                        🗑️
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* แผงค้นหาและเลือกครุภัณฑ์เพิ่ม */}
                            {showAddEquipment && (
                                <div className="add-equipment-dropdown-panel">
                                    <div className="add-equip-search-box">
                                        <input
                                            type="text"
                                            className="form-input form-input-sm"
                                            placeholder="🔍 พิมพ์ชื่อหรือหมวดหมู่เพื่อค้นหาครุภัณฑ์ที่ต้องการเพิ่ม..."
                                            value={searchEquipToAdd}
                                            onChange={e => setSearchEquipToAdd(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    <div className="add-equip-results-list">
                                        {availableToAdd.length === 0 ? (
                                            <div className="add-equip-empty">
                                                {searchEquipToAdd ? 'ไม่พบครุภัณฑ์ที่ตรงกับการค้นหา หรือถูกเลือกไปแล้ว' : 'ไม่มีครุภัณฑ์อื่นที่พร้อมให้ยืมในขณะนี้'}
                                            </div>
                                        ) : (
                                            availableToAdd.map(eq => (
                                                <div key={eq.id} className="add-equip-item" onClick={() => handleAddItem(eq)}>
                                                    <div className="add-equip-item-left">
                                                        <span className="add-equip-icon">📦</span>
                                                        <div>
                                                            <div className="add-equip-name">{eq.name}</div>
                                                            <div className="add-equip-sub">
                                                                <span>{eq.category || 'ทั่วไป'}</span> • คงเหลือ: <strong>{eq.quantity}</strong> ชิ้น
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button type="button" className="btn btn-sm btn-primary">
                                                        + เพิ่ม
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Borrower Type Tabs */}
                        <div className="borrower-type-container" style={{ marginTop: '1.25rem' }}>
                            <label className="form-label" style={{ marginBottom: '0.4rem', fontWeight: 600 }}>
                                ประเภทผู้ขอยืม <span className="required">*</span>
                            </label>
                            <div className="borrower-type-tabs">
                                <button
                                    type="button"
                                    className={`borrower-type-tab ${formData.borrowerType === 'student' ? 'active' : ''}`}
                                    onClick={() => handleTypeSwitch('student')}
                                >
                                    <span className="tab-icon">🎓</span>
                                    <span className="tab-title">นิสิต</span>
                                    <span className="tab-subtitle">มหาวิทยาลัยทักษิณ</span>
                                </button>
                                <button
                                    type="button"
                                    className={`borrower-type-tab ${formData.borrowerType === 'staff' ? 'active' : ''}`}
                                    onClick={() => handleTypeSwitch('staff')}
                                >
                                    <span className="tab-icon">👔</span>
                                    <span className="tab-title">อาจารย์ / บุคลากร / อื่นๆ</span>
                                    <span className="tab-subtitle">อาจารย์, รร.สาธิต, วมว., นักเรียน</span>
                                </button>
                            </div>
                        </div>

                        {/* Borrower Name */}
                        <div className="form-group">
                            <label className="form-label">
                                {formData.borrowerType === 'staff' ? 'ชื่อ-สกุล (อาจารย์ / ครู / ผู้ขอยืม)' : 'ชื่อ-สกุล นิสิต'} <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder={formData.borrowerType === 'staff' ? "เช่น ดร.สมชาย ใจดี, ครูสมหญิง (สาธิต), หรือ นายนพดล (วมว.)" : "เช่น นายสมชาย ใจดี"}
                                value={formData.borrowerName}
                                onChange={e => setFormData({ ...formData, borrowerName: e.target.value })}
                            />
                            {errors.borrowerName && <p className="form-error">{errors.borrowerName}</p>}
                        </div>

                        {/* Conditional Fields based on Borrower Type */}
                        {formData.borrowerType === 'student' ? (
                            <>
                                {/* Student: ID & Phone */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">
                                            รหัสนิสิต <span className="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="เช่น 6720210035"
                                            value={formData.studentId}
                                            onChange={e => setFormData({ ...formData, studentId: e.target.value })}
                                        />
                                        {formData.studentId.trim() && (
                                            <div className="email-hint-badge">
                                                📧 เมลนิสิต: <strong>{studentEmail}</strong>
                                            </div>
                                        )}
                                        {errors.studentId && <p className="form-error">{errors.studentId}</p>}
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">
                                            เบอร์โทรศัพท์ <span className="required">*</span>
                                        </label>
                                        <input
                                            type="tel"
                                            className="form-input"
                                            placeholder="เช่น 0812345678"
                                            value={formData.phone}
                                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                        {errors.phone && <p className="form-error">{errors.phone}</p>}
                                    </div>
                                </div>

                                {/* Student: Faculty Dropdown */}
                                <FacultySelect
                                    value={selectedFaculty}
                                    onChange={handleFacultySelect}
                                    customValue={customAffiliation}
                                    onCustomChange={handleCustomAffiliationChange}
                                    error={errors.affiliation}
                                    required={true}
                                    label="คณะ"
                                />
                            </>
                        ) : (
                            <>
                                {/* Staff / Teachers / Satit / SCiUS / External: Email & Phone */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">
                                            อีเมลติดต่อ (TSU Mail / Gmail / โรงเรียน) <span className="required">*</span>
                                        </label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            placeholder="เช่น ajarn@tsu.ac.th หรือ somchai@gmail.com"
                                            value={formData.staffEmail}
                                            onChange={e => setFormData({ ...formData, staffEmail: e.target.value })}
                                        />
                                        {formData.staffEmail.trim() && (
                                            <div className="email-hint-badge">
                                                📧 สำหรับรับแจ้งเตือนผลอนุมัติและแจ้งเตือนกำหนดเวลาคืน
                                            </div>
                                        )}
                                        {errors.staffEmail && <p className="form-error">{errors.staffEmail}</p>}
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">
                                            เบอร์โทรศัพท์ <span className="required">*</span>
                                        </label>
                                        <input
                                            type="tel"
                                            className="form-input"
                                            placeholder="เช่น 0812345678 หรือ เบอร์ต่อภายใน"
                                            value={formData.phone}
                                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                        {errors.phone && <p className="form-error">{errors.phone}</p>}
                                    </div>
                                </div>

                                {/* Staff / Teachers / Satit / SCiUS: Flexible Affiliation (Optional) */}
                                <div className="form-group">
                                    <div className="affiliation-header-row">
                                        <label className="form-label" style={{ marginBottom: 0 }}>
                                            หน่วยงาน / โรงเรียน / สังกัด <span className="optional-badge">(ไม่บังคับ - เว้นว่างได้)</span>
                                        </label>
                                    </div>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="เช่น รร.สาธิต ม.ทักษิณ, โครงการ วมว., คณะวิทย์ฯ (หรือเว้นว่างไว้)"
                                        value={formData.affiliation}
                                        onChange={e => setFormData({ ...formData, affiliation: e.target.value })}
                                    />
                                    <div className="quick-affiliation-tags">
                                        <span className="quick-tag-label">แตะระบุด่วน:</span>
                                        <button
                                            type="button"
                                            className={`quick-tag-chip ${formData.affiliation === 'โรงเรียนสาธิต มหาวิทยาลัยทักษิณ' ? 'active' : ''}`}
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                affiliation: prev.affiliation === 'โรงเรียนสาธิต มหาวิทยาลัยทักษิณ' ? '' : 'โรงเรียนสาธิต มหาวิทยาลัยทักษิณ'
                                            }))}
                                        >
                                            🏫 รร.สาธิต ม.ทักษิณ
                                        </button>
                                        <button
                                            type="button"
                                            className={`quick-tag-chip ${formData.affiliation === 'โครงการ วมว. มหาวิทยาลัยทักษิณ' ? 'active' : ''}`}
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                affiliation: prev.affiliation === 'โครงการ วมว. มหาวิทยาลัยทักษิณ' ? '' : 'โครงการ วมว. มหาวิทยาลัยทักษิณ'
                                            }))}
                                        >
                                            🔬 โครงการ วมว.
                                        </button>
                                        <button
                                            type="button"
                                            className={`quick-tag-chip ${formData.affiliation === 'คณะวิทยาศาสตร์และนวัตกรรมดิจิทัล' ? 'active' : ''}`}
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                affiliation: prev.affiliation === 'คณะวิทยาศาสตร์และนวัตกรรมดิจิทัล' ? '' : 'คณะวิทยาศาสตร์และนวัตกรรมดิจิทัล'
                                            }))}
                                        >
                                            💻 คณะวิทย์ฯ-ดิจิทัล
                                        </button>
                                        <button
                                            type="button"
                                            className={`quick-tag-chip ${formData.affiliation === 'มหาวิทยาลัยทักษิณ' ? 'active' : ''}`}
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                affiliation: prev.affiliation === 'มหาวิทยาลัยทักษิณ' ? '' : 'มหาวิทยาลัยทักษิณ'
                                            }))}
                                        >
                                            🏛️ ม.ทักษิณ
                                        </button>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">
                                        ตำแหน่ง / ชั้นปี <span className="optional-badge">(ถ้ามี - เว้นว่างได้)</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="เช่น ครูผู้สอน, นักเรียน ม.5 (วมว.), เจ้าหน้าที่, หรืออาจารย์ประจำสาขา"
                                        value={formData.position}
                                        onChange={e => setFormData({ ...formData, position: e.target.value })}
                                    />
                                </div>
                            </>
                        )}

                        {/* Location */}
                        <div className="form-group">
                            <label className="form-label">
                                สถานที่ใช้งาน <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="เช่น ห้อง SC101 หรือ ลานกิจกรรมชั้น 1"
                                value={formData.location}
                                onChange={e => setFormData({ ...formData, location: e.target.value })}
                            />
                            {errors.location && <p className="form-error">{errors.location}</p>}
                        </div>

                        {/* ===== Borrow Schedule (Date & Time) ===== */}
                        <div className="schedule-card-box">
                            {/* Schedule Cards Grid: 1. ขอยืม 2. ส่งคืน */}
                            <div className="schedule-cards-grid">
                                {/* Card 1: กำหนดวันที่ยืม */}
                                <div className="schedule-subcard borrow-subcard">
                                    <div className="schedule-subcard-header">
                                        <div className="subcard-title">
                                            <span className="subcard-icon borrow-icon">🟢</span>
                                            <strong>1. วันที่ต้องการยืม</strong>
                                        </div>
                                        <span className="subcard-badge borrow-badge">
                                            {formData.borrowDate === today ? 'ยืมวันนี้' : formatThaiDateShort(formData.borrowDate)}
                                        </span>
                                    </div>

                                    {/* Visual 7-Day Day Selector Strip for Borrow */}
                                    <div className="visual-days-container">
                                        <div className="visual-days-header">
                                            <span className="visual-days-title">🗓️ เลือกวันที่ต้องการยืม (แตะเลือกได้ทันที):</span>
                                            <span className="visual-days-hint">ไม่เกิน {formatThaiDateShort(maxBorrowDate)}</span>
                                        </div>
                                        <div className="visual-days-scroll">
                                            {borrowDayOptions.map(opt => {
                                                const isSelected = formData.borrowDate === opt.dateStr;
                                                return (
                                                    <button
                                                        key={opt.dateStr}
                                                        type="button"
                                                        className={`visual-day-card ${isSelected ? 'active' : ''}`}
                                                        onClick={() => handleBorrowDateChange(opt.dateStr)}
                                                    >
                                                        <span className="vday-name">{opt.dayName}</span>
                                                        <span className="vday-num">{opt.dayNumber}</span>
                                                        <span className="vday-tag">{opt.label}</span>
                                                    </button>
                                                );
                                            })}
                                            {/* Locked 8th Day Indicator */}
                                            <div
                                                className="visual-day-card locked"
                                                title="จองยืมล่วงหน้าได้สูงสุดไม่เกิน 7 วัน"
                                                onClick={() => {
                                                    if (toast) toast.info('จองยืมล่วงหน้าได้สูงสุดไม่เกิน 7 วัน');
                                                }}
                                            >
                                                <span className="vday-name">🔒</span>
                                                <span className="vday-num">+8</span>
                                                <span className="vday-tag">ล็อค</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="form-group schedule-field" style={{ marginBottom: 0 }}>
                                        <label className="form-label schedule-field-label">
                                            <span>📅 วันที่เริ่มต้นยืม</span>
                                            <span className="required">*</span>
                                        </label>
                                        <div className="input-decorated-wrap">
                                            <input
                                                type="date"
                                                className="form-input form-input-decorated"
                                                min={today}
                                                max={maxBorrowDate}
                                                value={formData.borrowDate}
                                                onChange={e => handleBorrowDateChange(e.target.value)}
                                                onBlur={e => handleBorrowDateChange(e.target.value)}
                                            />
                                        </div>
                                        {errors.borrowDate && <p className="form-error">{errors.borrowDate}</p>}
                                        <div style={{
                                            fontSize: '0.8rem',
                                            color: '#475569',
                                            marginTop: '0.55rem',
                                            padding: '0.45rem 0.65rem',
                                            background: 'rgba(255, 255, 255, 0.75)',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(226, 232, 240, 0.9)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem'
                                        }}>
                                            <span>⚡</span>
                                            <span>
                                                {formData.borrowDate === today
                                                    ? 'เริ่มนับเวลาตั้งแต่ส่งคำขอยืม (ตามเวลาปัจจุบัน)'
                                                    : 'เริ่มยืมตั้งแต่ช่วงเปิดทำการ (08:30 น.)'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Card 2: กำหนดส่งคืน */}
                                <div className="schedule-subcard return-subcard">
                                    <div className="schedule-subcard-header">
                                        <div className="subcard-title">
                                            <span className="subcard-icon return-icon">🔵</span>
                                            <strong>2. กำหนดวันและเวลาส่งคืน</strong>
                                        </div>
                                        <span className="subcard-badge return-badge">
                                            🔒 สูงสุดไม่เกิน 7 วัน
                                        </span>
                                    </div>

                                    {/* Visual 7-Day Day Selector Strip */}
                                    <div className="visual-days-container">
                                        <div className="visual-days-header">
                                            <span className="visual-days-title">🗓️ เลือกวันส่งคืนด่วน (แตะเลือกได้ทันที):</span>
                                            <span className="visual-days-hint">ไม่เกิน {formatThaiDateShort(maxReturnDate)}</span>
                                        </div>
                                        <div className="visual-days-scroll">
                                            {returnDayOptions.map(opt => {
                                                const isSelected = formData.returnDate === opt.dateStr;
                                                return (
                                                    <button
                                                        key={opt.dateStr}
                                                        type="button"
                                                        className={`visual-day-card ${isSelected ? 'active' : ''}`}
                                                        onClick={() => handleReturnDateChange(opt.dateStr)}
                                                    >
                                                        <span className="vday-name">{opt.dayName}</span>
                                                        <span className="vday-num">{opt.dayNumber}</span>
                                                        <span className="vday-tag">{opt.label}</span>
                                                    </button>
                                                );
                                            })}
                                            {/* Locked 8th Day Indicator */}
                                            <div
                                                className="visual-day-card locked"
                                                title="ตามระเบียบสโมสรนิสิต ยืมได้สูงสุดไม่เกิน 7 วัน (ระบบล็อคอัตโนมัติ)"
                                                onClick={() => {
                                                    if (toast) toast.info('ตามระเบียบสโมสรนิสิต ยืมได้สูงสุดไม่เกิน 7 วัน (ระบบล็อคอัตโนมัติ)');
                                                }}
                                            >
                                                <span className="vday-name">🔒</span>
                                                <span className="vday-num">+8</span>
                                                <span className="vday-tag">ล็อค</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="schedule-inputs-row">
                                        {/* วันที่คืน */}
                                        <div className="form-group schedule-field">
                                            <label className="form-label schedule-field-label">
                                                <span>📅 กำหนดคืน (วันที่)</span>
                                                <span className="required">*</span>
                                            </label>
                                            <div className="input-decorated-wrap">
                                                <input
                                                    type="date"
                                                    className="form-input form-input-decorated"
                                                    min={formData.borrowDate || today}
                                                    max={maxReturnDate}
                                                    value={formData.returnDate}
                                                    onChange={e => handleReturnDateChange(e.target.value)}
                                                    onBlur={e => handleReturnDateChange(e.target.value)}
                                                />
                                            </div>
                                            {errors.returnDate && <p className="form-error">{errors.returnDate}</p>}
                                        </div>

                                        {/* เวลาที่คืน */}
                                        <div className="form-group schedule-field">
                                            <label className="form-label schedule-field-label">
                                                <span>🕒 เวลาที่คืน</span>
                                                <span className="required">*</span>
                                            </label>
                                            <div className="input-decorated-wrap">
                                                <input
                                                    type="time"
                                                    className="form-input form-input-decorated"
                                                    min={
                                                        formData.returnDate === today
                                                            ? getLocalTimeString()
                                                            : (formData.returnDate === formData.borrowDate ? (formData.borrowDate === today ? getLocalTimeString() : (formData.borrowTime || '08:30')) : undefined)
                                                    }
                                                    value={formData.returnTime}
                                                    onChange={e => handleReturnTimeChange(e.target.value)}
                                                    onBlur={e => handleReturnTimeChange(e.target.value)}
                                                />
                                            </div>
                                            {errors.returnTime && <p className="form-error">{errors.returnTime}</p>}
                                        </div>
                                    </div>

                                    {/* Quick Return Presets */}
                                    <div className="preset-container">
                                        <span className="preset-label">⚡ ทางลัดเวลาคืน:</span>
                                        <div className="preset-chips">
                                            <button
                                                type="button"
                                                className="preset-chip"
                                                onClick={() => applyReturnTimeOffset(1)}
                                            >
                                                ⏱️ +1 ชม.
                                            </button>
                                            <button
                                                type="button"
                                                className="preset-chip"
                                                onClick={() => applyReturnTimeOffset(2)}
                                            >
                                                ⏱️ +2 ชม.
                                            </button>
                                            <button
                                                type="button"
                                                className="preset-chip"
                                                onClick={() => applyReturnTimeOffset(4)}
                                            >
                                                ⏱️ +4 ชม.
                                            </button>
                                            {getLocalTimeString() < '16:30' && (
                                                <button
                                                    type="button"
                                                    className={`preset-chip ${formData.returnDate === formData.borrowDate && formData.returnTime === '16:30' ? 'active' : ''}`}
                                                    onClick={() => applyPreset('today_evening')}
                                                >
                                                    🌅 เย็นนี้ (16:30)
                                                </button>
                                            )}
                                            {getLocalTimeString() < '19:00' && (
                                                <button
                                                    type="button"
                                                    className={`preset-chip ${formData.returnDate === formData.borrowDate && formData.returnTime === '19:00' ? 'active' : ''}`}
                                                    onClick={() => applyPreset('today_night')}
                                                >
                                                    🌙 ค่ำนี้ (19:00)
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="preset-chip"
                                                onClick={() => applyPreset('tomorrow_morning')}
                                            >
                                                ☀️ พรุ่งนี้เช้า (09:00)
                                            </button>
                                            <button
                                                type="button"
                                                className="preset-chip"
                                                onClick={() => applyPreset('days_3')}
                                            >
                                                📆 3 วัน
                                            </button>
                                            <button
                                                type="button"
                                                className="preset-chip"
                                                onClick={() => applyPreset('days_7')}
                                            >
                                                🗓️ 7 วัน (สูงสุด)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Duration Indicator Pill */}
                            {durationInfo && (
                                <div className={`duration-pill ${durationInfo.isValid ? 'duration-valid' : 'duration-invalid'}`}>
                                    {durationInfo.isValid ? (
                                        <>
                                            <span className="duration-icon">⏱️</span>
                                            <span>
                                                ระยะเวลายืม: <strong>{durationInfo.text}</strong>
                                                {durationInfo.isSameDay && (
                                                    <span className="same-day-tag"> (ยืม-คืนวันเดียวกัน)</span>
                                                )}
                                            </span>
                                        </>
                                    ) : durationInfo.isBorrowPast ? (
                                        <>
                                            <span className="duration-icon">⚠️</span>
                                            <span>
                                                <strong>ไม่สามารถยืมเวลาย้อนหลังได้:</strong> เวลาปัจจุบันคือ {getLocalTimeString()} น. (กรุณาเลือกเวลาปัจจุบันเป็นต้นไป)
                                            </span>
                                        </>
                                    ) : durationInfo.isReturnPast ? (
                                        <>
                                            <span className="duration-icon">⚠️</span>
                                            <span>
                                                <strong>เวลาส่งคืนต้องไม่เป็นเวลาย้อนหลัง:</strong> เวลาปัจจุบันคือ {getLocalTimeString()} น.
                                            </span>
                                        </>
                                    ) : durationInfo.isTooLong ? (
                                        <>
                                            <span className="duration-icon">⚠️</span>
                                            <span>
                                                ระยะเวลายืมเกินกำหนด! <strong>ยืมได้ไม่เกิน 7 วัน (1 สัปดาห์)</strong> ตามระเบียบสโมสรนิสิต
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="duration-icon">⚠️</span>
                                            <span>เวลาคืนต้องอยู่หลังเวลาที่ยืมอย่างน้อย 15 นาที</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Purpose */}
                        <div className="form-group" style={{ marginTop: '1.25rem' }}>
                            <label className="form-label">
                                วัตถุประสงค์การใช้งาน <span className="required">*</span>
                            </label>
                            <textarea
                                className="form-textarea"
                                placeholder="อธิบายวัตถุประสงค์ในการยืม เช่น ใช้จัดโครงการสัมมนาวิชาการคณะ..."
                                value={formData.purpose}
                                onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                            />
                            {errors.purpose && <p className="form-error">{errors.purpose}</p>}
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={submitting || (durationInfo && !durationInfo.isValid) || selectedItems.length === 0}
                        >
                            {submitting ? '⏳ กำลังบันทึก...' : `📤 ส่งคำขอยืม (${selectedItems.length} รายการ, ${totalQuantity} ชิ้น)`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
