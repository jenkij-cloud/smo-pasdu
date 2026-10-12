import { useState } from 'react';

const QUICK_REASONS = [
    'ครุภัณฑ์ถูกจองสำหรับกิจกรรมของคณะแล้ว',
    'ข้อมูลผู้ยืมหรือรหัสนิสิตไม่ครบถ้วน / ติดต่อไม่ได้',
    'ระยะเวลาการยืมเกินกำหนดตามระเบียบสโมสร',
    'ครุภัณฑ์อยู่ระหว่างการซ่อมบำรุง / ไม่พร้อมใช้งาน'
];

export default function RejectReasonModal({ isOpen, request, onConfirm, onCancel }) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen || !request) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reason.trim()) {
            setError('กรุณาระบุเหตุผลในการปฏิเสธคำขอนี้ เพื่อให้นิสิตรับทราบ');
            return;
        }
        setSubmitting(true);
        try {
            await onConfirm(reason.trim());
            setReason('');
            setError('');
        } catch (err) {
            console.error('Error rejecting:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleSelectQuick = (r) => {
        setReason(r);
        setError('');
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header modal-header-danger">
                    <h3>❌ ระบุเหตุผลในการปฏิเสธคำขอยืม</h3>
                    <button className="modal-close" onClick={onCancel} aria-label="ปิด">×</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                            <strong>ผู้ยืม:</strong> {request.borrowerName} ({request.studentId})<br />
                            <strong>ครุภัณฑ์:</strong> {request.equipmentName} ({request.quantity} ชิ้น)
                        </div>

                        <div className="form-group">
                            <label className="form-label">
                                เหตุผลสำเร็จรูป (คลิกเพื่อเลือกด่วน)
                            </label>
                            <div className="quick-tags">
                                {QUICK_REASONS.map((qr, idx) => (
                                    <button
                                        type="button"
                                        key={idx}
                                        className="quick-tag-btn"
                                        onClick={() => handleSelectQuick(qr)}
                                    >
                                        📌 {qr}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">
                                ระบุเหตุผล <span className="required">*</span>
                            </label>
                            <textarea
                                className="form-textarea"
                                rows={3}
                                placeholder="พิมพ์เหตุผลเพื่อให้ผู้ยืมทราบผ่านหน้าตรวจสอบสถานะ..."
                                value={reason}
                                onChange={e => {
                                    setReason(e.target.value);
                                    if (e.target.value.trim()) setError('');
                                }}
                            />
                            {error && <p className="form-error">{error}</p>}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
                            ยกเลิก
                        </button>
                        <button type="submit" className="btn btn-danger" disabled={submitting}>
                            {submitting ? '⏳ กำลังบันทึก...' : '🚫 ยืนยันปฏิเสธ'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
