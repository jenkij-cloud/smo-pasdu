import { useState, useMemo } from 'react';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { getStudentEmail } from '../utils/notificationService';
import { getBorrowDurationText } from '../utils/dateUtils';

export default function BorrowFormModal({ equipment, onClose, onSubmit }) {
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

    const [formData, setFormData] = useState({
        borrowerName: '',
        studentId: '',
        phone: '',
        affiliation: '',
        quantity: 1,
        location: '',
        borrowDate: today,
        borrowTime: initialTimes.borrowTime,
        returnDate: today, // เริ่มต้นยืมวันนี้ คืนวันนี้
        returnTime: initialTimes.returnTime,
        purpose: ''
    });

    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const studentEmail = getStudentEmail(formData.studentId);

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
            // คืนเย็นวันนี้ 16:30 น.
            setFormData(prev => ({
                ...prev,
                returnDate: prev.borrowDate || today,
                returnTime: '16:30'
            }));
        } else if (presetKey === 'today_night') {
            // คืนค่ำวันนี้ 19:00 น.
            setFormData(prev => ({
                ...prev,
                returnDate: prev.borrowDate || today,
                returnTime: '19:00'
            }));
        } else if (presetKey === 'tomorrow_morning') {
            // คืนพรุ่งนี้เช้า 09:00 น.
            const nextDay = new Date(baseDate);
            nextDay.setDate(nextDay.getDate() + 1);
            setFormData(prev => ({
                ...prev,
                returnDate: nextDay.toISOString().split('T')[0],
                returnTime: '09:00'
            }));
        } else if (presetKey === 'tomorrow_evening') {
            // คืนพรุ่งนี้เย็น 16:30 น.
            const nextDay = new Date(baseDate);
            nextDay.setDate(nextDay.getDate() + 1);
            setFormData(prev => ({
                ...prev,
                returnDate: nextDay.toISOString().split('T')[0],
                returnTime: '16:30'
            }));
        } else if (presetKey === 'days_3') {
            // ยืม 3 วัน (16:30 น.)
            const future = new Date(baseDate);
            future.setDate(future.getDate() + 3);
            setFormData(prev => ({
                ...prev,
                returnDate: future.toISOString().split('T')[0],
                returnTime: '16:30'
            }));
        } else if (presetKey === 'days_7') {
            // ยืม 7 วัน (สูงสุด 1 สัปดาห์)
            const future = new Date(baseDate);
            future.setDate(future.getDate() + 7);
            setFormData(prev => ({
                ...prev,
                returnDate: future.toISOString().split('T')[0],
                returnTime: '16:30'
            }));
        }
        // ล้าง error ที่เกี่ยวข้องกับวันคืนถ้ามี
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
        if (!formData.borrowerName.trim()) newErrors.borrowerName = 'กรุณากรอกชื่อ-สกุล';
        if (!formData.studentId.trim()) newErrors.studentId = 'กรุณากรอกรหัสนิสิต';
        if (!formData.phone.trim()) newErrors.phone = 'กรุณากรอกเบอร์โทรศัพท์';
        if (!formData.location.trim()) newErrors.location = 'กรุณากรอกสถานที่ใช้งาน';
        
        // ตรวจสอบวันที่ยืม (ห้ามยืมย้อนหลัง)
        if (!formData.borrowDate) {
            newErrors.borrowDate = 'กรุณาเลือกวันที่ยืม';
        } else if (formData.borrowDate < today) {
            newErrors.borrowDate = 'ไม่สามารถยืมย้อนหลังได้ (ต้องเป็นวันนี้เป็นต้นไป)';
        }

        if (!formData.borrowTime) {
            newErrors.borrowTime = 'กรุณาระบุเวลาที่ยืม';
        }

        // ตรวจสอบกำหนดคืน (ต้องไม่ก่อนวันยืม และไม่เกิน 7 วัน)
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
        if (!formData.quantity || formData.quantity < 1) newErrors.quantity = 'จำนวนต้องมากกว่า 0';
        if (formData.quantity > equipment.quantity) newErrors.quantity = `จำนวนเกินสต็อกคงเหลือ (${equipment.quantity} ชิ้น)`;

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

            await onSubmit({
                ...formData,
                studentEmail,
                equipmentId: equipment.id,
                equipmentName: equipment.name,
                equipmentCategory: equipment.category || '',
                equipmentSerial: equipment.serialNumber || '',
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
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>📝 แบบฟอร์มขอยืมครุภัณฑ์</h3>
                    <button className="modal-close" onClick={onClose} aria-label="ปิด">×</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {/* Equipment Preview */}
                        <div className="borrow-equipment-preview">
                            {equipment.imageUrl ? (
                                <img
                                    src={equipment.imageUrl}
                                    alt={equipment.name}
                                    className="preview-equip-img"
                                />
                            ) : (
                                <div className="preview-equip-placeholder">📦</div>
                            )}
                            <div className="preview-equip-info">
                                <h4>{equipment.name}</h4>
                                <div className="preview-badges">
                                    <span className="card-category">{equipment.category}</span>
                                    {equipment.serialNumber && (
                                        <span className="badge-serial">SN: {equipment.serialNumber}</span>
                                    )}
                                </div>
                                <p className="preview-stock">
                                    คงเหลือในคลัง: <strong>{equipment.quantity}</strong> ชิ้น
                                </p>
                            </div>
                        </div>

                        {/* Borrower Name */}
                        <div className="form-group">
                            <label className="form-label">
                                ชื่อ-สกุล <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="เช่น นายสมชาย ใจดี"
                                value={formData.borrowerName}
                                onChange={e => setFormData({ ...formData, borrowerName: e.target.value })}
                            />
                            {errors.borrowerName && <p className="form-error">{errors.borrowerName}</p>}
                        </div>

                        {/* Student ID & Phone */}
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

                        {/* Affiliation & Quantity */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">สังกัด / ชมรม / สาขาวิชา</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น สาขาวิชาวิทยาการคอมพิวเตอร์"
                                    value={formData.affiliation}
                                    onChange={e => setFormData({ ...formData, affiliation: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                    จำนวนที่ต้องการยืม <span className="required">*</span>
                                </label>
                                <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    max={equipment.quantity}
                                    value={formData.quantity}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFormData({
                                            ...formData,
                                            quantity: val === "" ? "" : parseInt(val)
                                        });
                                    }}
                                />
                                {errors.quantity && <p className="form-error">{errors.quantity}</p>}
                            </div>
                        </div>

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
                            disabled={submitting || (durationInfo && !durationInfo.isValid)}
                        >
                            {submitting ? '⏳ กำลังบันทึก...' : '📤 ส่งคำขอยืม'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
