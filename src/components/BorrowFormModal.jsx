import { useState, useMemo } from 'react';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { getStudentEmail } from '../utils/notificationService';
import { getBorrowDurationText } from '../utils/dateUtils';
import FacultySelect, { FACULTIES } from './FacultySelect';

export default function BorrowFormModal({
    equipment = null,
    initialItems = null,
    allEquipments = [],
    onClose,
    onSubmit
}) {
    // วันนี้ในรูปแบบ YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    // คำนวณเวลาปัจจุบันปัดเศษเป็น 30 นาที หรือเวลาทำการเริ่มต้น
    const getInitialTimes = () => {
        const now = new Date();
        const curH = now.getHours();
        const curM = now.getMinutes() >= 30 ? '30' : '00';
        const borrowH = curH >= 8 && curH <= 17 ? String(curH).padStart(2, '0') : '08';
        const borrowM = curH >= 8 && curH <= 17 ? curM : '30';
        return {
            borrowTime: `${borrowH}:${borrowM}`,
            returnTime: '16:30' // เวลาเลิกเรียน/ปิดทำการสโมสรนิสิตยอดนิยม
        };
    };

    const initialTimes = getInitialTimes();

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
        borrowDate: today,
        borrowTime: initialTimes.borrowTime,
        returnDate: today,
        returnTime: initialTimes.returnTime,
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

    // กำหนดระยะเวลายืมสูงสุด 7 วัน (1 สัปดาห์)
    const MAX_BORROW_DAYS = 7;
    const maxReturnDate = useMemo(() => {
        if (!formData.borrowDate) return '';
        const b = new Date(formData.borrowDate + 'T00:00:00');
        b.setDate(b.getDate() + MAX_BORROW_DAYS);
        return b.toISOString().split('T')[0];
    }, [formData.borrowDate]);

    // คำนวณความถูกต้องและระยะเวลายืมแบบ Realtime
    const durationInfo = useMemo(() => {
        if (!formData.borrowDate || !formData.returnDate || !formData.borrowTime || !formData.returnTime) {
            return null;
        }

        const bDate = new Date(`${formData.borrowDate}T${formData.borrowTime}:00`);
        const rDate = new Date(`${formData.returnDate}T${formData.returnTime}:00`);

        if (isNaN(bDate.getTime()) || isNaN(rDate.getTime())) return null;

        const diffMs = rDate.getTime() - bDate.getTime();
        const maxMs = MAX_BORROW_DAYS * 24 * 60 * 60 * 1000;
        const isTooLong = diffMs > maxMs;
        const isValid = diffMs >= 15 * 60 * 1000 && !isTooLong;
        const text = getBorrowDurationText(bDate, rDate);

        return {
            isValid,
            isTooLong,
            diffMs,
            text,
            isSameDay: formData.borrowDate === formData.returnDate
        };
    }, [formData.borrowDate, formData.borrowTime, formData.returnDate, formData.returnTime]);

    // ฟังก์ชันช่วยตั้งค่าปุ่มลัด (Quick Presets)
    const applyPreset = (presetKey) => {
        const baseDate = formData.borrowDate ? new Date(formData.borrowDate + 'T00:00:00') : new Date(today + 'T00:00:00');

        if (presetKey === 'today_evening') {
            setFormData(prev => ({
                ...prev,
                returnDate: prev.borrowDate || today,
                returnTime: '16:30'
            }));
        } else if (presetKey === 'today_night') {
            setFormData(prev => ({
                ...prev,
                returnDate: prev.borrowDate || today,
                returnTime: '19:00'
            }));
        } else if (presetKey === 'tomorrow_morning') {
            const nextDay = new Date(baseDate);
            nextDay.setDate(nextDay.getDate() + 1);
            setFormData(prev => ({
                ...prev,
                returnDate: nextDay.toISOString().split('T')[0],
                returnTime: '09:00'
            }));
        } else if (presetKey === 'tomorrow_evening') {
            const nextDay = new Date(baseDate);
            nextDay.setDate(nextDay.getDate() + 1);
            setFormData(prev => ({
                ...prev,
                returnDate: nextDay.toISOString().split('T')[0],
                returnTime: '16:30'
            }));
        } else if (presetKey === 'days_3') {
            const future = new Date(baseDate);
            future.setDate(future.getDate() + 3);
            setFormData(prev => ({
                ...prev,
                returnDate: future.toISOString().split('T')[0],
                returnTime: '16:30'
            }));
        } else if (presetKey === 'days_7') {
            const future = new Date(baseDate);
            future.setDate(future.getDate() + 7);
            setFormData(prev => ({
                ...prev,
                returnDate: future.toISOString().split('T')[0],
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

        // ตรวจสอบวันที่ยืม
        if (!formData.borrowDate) {
            newErrors.borrowDate = 'กรุณาเลือกวันที่ยืม';
        } else if (formData.borrowDate < today) {
            newErrors.borrowDate = 'ไม่สามารถยืมย้อนหลังได้ (ต้องเป็นวันนี้เป็นต้นไป)';
        }

        if (!formData.borrowTime) {
            newErrors.borrowTime = 'กรุณาระบุเวลาที่ยืม';
        }

        // ตรวจสอบกำหนดคืน
        if (!formData.returnDate) {
            newErrors.returnDate = 'กรุณาเลือกกำหนดคืน';
        } else if (formData.returnDate < formData.borrowDate) {
            newErrors.returnDate = 'กำหนดคืนต้องไม่ก่อนวันที่ยืม';
        } else if (maxReturnDate && formData.returnDate > maxReturnDate) {
            newErrors.returnDate = 'ยืมได้สูงสุดไม่เกิน 7 วัน (1 สัปดาห์)';
        }

        if (!formData.returnTime) {
            newErrors.returnTime = 'กรุณาระบุเวลาคืน';
        }

        // ตรวจสอบวันและเวลาแบบละเอียด
        if (formData.borrowDate && formData.returnDate && formData.borrowTime && formData.returnTime) {
            const bDate = new Date(`${formData.borrowDate}T${formData.borrowTime}:00`);
            const rDate = new Date(`${formData.returnDate}T${formData.returnTime}:00`);
            const diffMs = rDate.getTime() - bDate.getTime();
            const maxMs = MAX_BORROW_DAYS * 24 * 60 * 60 * 1000;

            if (rDate <= bDate) {
                newErrors.returnTime = 'เวลาคืนต้องอยู่หลังเวลาที่ยืม';
            } else if (diffMs < 15 * 60 * 1000) {
                newErrors.returnTime = 'ระยะเวลายืมต้องไม่น้อยกว่า 15 นาที';
            } else if (diffMs > maxMs) {
                newErrors.returnTime = 'ยืมได้สูงสุดไม่เกิน 7 วัน (1 สัปดาห์)';
            }
        }

        if (!formData.purpose.trim()) newErrors.purpose = 'กรุณากรอกวัตถุประสงค์';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        setSubmitting(true);
        try {
            const borrowDateTime = new Date(`${formData.borrowDate}T${formData.borrowTime}:00`);
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
                studentId: formData.borrowerType === 'student' ? formData.studentId.trim() : '-',
                staffId: '',
                position: formData.borrowerType === 'staff' ? formData.position.trim() : '',
                studentEmail: contactEmail,
                borrowerEmail: contactEmail,
                contactEmail: contactEmail,
                affiliation: formData.borrowerType === 'student'
                    ? (formData.affiliation.trim() || 'คณะวิทยาศาสตร์และนวัตกรรมดิจิทัล')
                    : (formData.affiliation ? formData.affiliation.trim() : '-'),
                borrowDate: Timestamp.fromDate(borrowDateTime),
                returnDate: Timestamp.fromDate(returnDateTime),
                borrowTime: formData.borrowTime,
                returnTime: formData.returnTime,
                status: 'pending',
                requestDate: serverTimestamp(),
                approvedDate: null,
                returnedDate: null,
                rejectedDate: null,
                rejectReason: null
            });
            onClose();
        } catch (error) {
            console.error('Error submitting borrow request:', error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>📝 แบบฟอร์มขอยืมครุภัณฑ์</h3>
                    <button className="modal-close" onClick={onClose} aria-label="ปิด">×</button>
                </div>
                <form onSubmit={handleSubmit}>
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
                            <h4 className="schedule-section-title">
                                📅 กำหนดเวลายืมและส่งคืน
                            </h4>

                            {/* วันที่และเวลาที่ยืม */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">
                                        วันที่ยืม <span className="required">*</span>
                                        <small className="label-hint"> (ยืมได้ตั้งแต่วันนี้เป็นต้นไป)</small>
                                    </label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        min={today}
                                        value={formData.borrowDate}
                                        onChange={e => {
                                            const newBorrowDate = e.target.value;
                                            setFormData(prev => {
                                                let nextReturnDate = prev.returnDate;
                                                if (newBorrowDate) {
                                                    const b = new Date(newBorrowDate + 'T00:00:00');
                                                    b.setDate(b.getDate() + MAX_BORROW_DAYS);
                                                    const newMax = b.toISOString().split('T')[0];
                                                    if (nextReturnDate < newBorrowDate) {
                                                        nextReturnDate = newBorrowDate;
                                                    } else if (nextReturnDate > newMax) {
                                                        nextReturnDate = newMax;
                                                    }
                                                }
                                                return {
                                                    ...prev,
                                                    borrowDate: newBorrowDate,
                                                    returnDate: nextReturnDate
                                                };
                                            });
                                        }}
                                    />
                                    {errors.borrowDate && <p className="form-error">{errors.borrowDate}</p>}
                                </div>

                                <div className="form-group">
                                    <label className="form-label">
                                        เวลาที่ยืม <span className="required">*</span>
                                    </label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={formData.borrowTime}
                                        onChange={e => setFormData({ ...formData, borrowTime: e.target.value })}
                                    />
                                    {errors.borrowTime && <p className="form-error">{errors.borrowTime}</p>}
                                </div>
                            </div>

                            {/* วันที่และเวลาที่คืน */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">
                                        กำหนดคืน (วันที่) <span className="required">*</span>
                                        <small className="label-hint-warning"> (ยืมได้สูงสุดไม่เกิน 7 วัน)</small>
                                    </label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        min={formData.borrowDate || today}
                                        max={maxReturnDate}
                                        value={formData.returnDate}
                                        onChange={e => setFormData({ ...formData, returnDate: e.target.value })}
                                    />
                                    {errors.returnDate && <p className="form-error">{errors.returnDate}</p>}
                                </div>

                                <div className="form-group">
                                    <label className="form-label">
                                        เวลาที่คืน <span className="required">*</span>
                                    </label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={formData.returnTime}
                                        onChange={e => setFormData({ ...formData, returnTime: e.target.value })}
                                    />
                                    {errors.returnTime && <p className="form-error">{errors.returnTime}</p>}
                                </div>
                            </div>

                            {/* Quick Presets for Return */}
                            <div className="preset-container">
                                <span className="preset-label">⚡ ตัวเลือกคืนด่วน:</span>
                                <div className="preset-chips">
                                    <button
                                        type="button"
                                        className={`preset-chip ${formData.returnDate === formData.borrowDate && formData.returnTime === '16:30' ? 'active' : ''}`}
                                        onClick={() => applyPreset('today_evening')}
                                    >
                                        🌅 คืนเย็นนี้ (16:30 น.)
                                    </button>
                                    <button
                                        type="button"
                                        className={`preset-chip ${formData.returnDate === formData.borrowDate && formData.returnTime === '19:00' ? 'active' : ''}`}
                                        onClick={() => applyPreset('today_night')}
                                    >
                                        🌙 คืนค่ำนี้ (19:00 น.)
                                    </button>
                                    <button
                                        type="button"
                                        className="preset-chip"
                                        onClick={() => applyPreset('tomorrow_morning')}
                                    >
                                        ☀️ คืนพรุ่งนี้เช้า (09:00 น.)
                                    </button>
                                    <button
                                        type="button"
                                        className="preset-chip"
                                        onClick={() => applyPreset('days_3')}
                                    >
                                        📆 ยืม 3 วัน
                                    </button>
                                    <button
                                        type="button"
                                        className="preset-chip"
                                        onClick={() => applyPreset('days_7')}
                                    >
                                        🗓️ 1 สัปดาห์ (สูงสุด)
                                    </button>
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
                                                    <span className="same-day-tag"> (ยืมเช้า-คืนเย็นวันเดียวกัน)</span>
                                                )}
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
