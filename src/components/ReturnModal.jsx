import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const QUICK_CONDITIONS = [
    '✅ สภาพปกติ ครบถ้วน',
    '⚠️ สภาพใช้งานได้ มีรอยเล็กน้อย',
    '🔧 ชำรุด/มีปัญหา (ส่งซ่อม)',
    '❌ ครุภัณฑ์/อุปกรณ์ไม่ครบ'
];

export default function ReturnModal({ isOpen, request, onConfirm, onCancel }) {
    const { user } = useAuth();

    // ดึงชื่อผู้รับคืนล่าสุดจาก localStorage หรือชื่อ user ในระบบ
    const [receiverName, setReceiverName] = useState(() => {
        return localStorage.getItem('smo_last_return_receiver') || user?.displayName || '';
    });
    const [returnNotes, setReturnNotes] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen || !request) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmedName = receiverName.trim();
        if (!trimmedName) {
            setError('กรุณาระบุชื่อผู้รับคืนพัสดุ (เช่น ชื่อกรรมการสโมสรนิสิต หรือเจ้าหน้าที่)');
            return;
        }

        setSubmitting(true);
        try {
            // บันทึกชื่อไว้ใน localStorage เพื่อความสะดวกรวดเร็วในครั้งถัดไป
            localStorage.setItem('smo_last_return_receiver', trimmedName);

            await onConfirm({
                returnedReceiverName: trimmedName,
                returnNotes: returnNotes.trim()
            });
        } catch (err) {
            console.error('Error confirming return:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const hasMultiItems = request.items && Array.isArray(request.items) && request.items.length > 0;
    const totalQty = request.totalQuantity || request.quantity || (hasMultiItems ? request.items.reduce((s, i) => s + (i.quantity || 1), 0) : 1);

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>📥 บันทึกการรับคืนพัสดุ / ครุภัณฑ์</h3>
                    <button className="modal-close" onClick={onCancel} aria-label="ปิด">×</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '75vh' }}>
                        {/* การ์ดสรุปข้อมูลผู้ยืมและครุภัณฑ์ */}
                        <div className="return-modal-summary-box" style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: '10px',
                            padding: '1rem',
                            marginBottom: '1.25rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>รหัสคำขอ: </span>
                                    <code style={{ fontSize: '0.8rem', background: '#ffffff', padding: '1px 5px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                        {request.id}
                                    </code>
                                </div>
                                <span style={{ fontSize: '0.8rem', background: '#dbeafe', color: '#1d4ed8', fontWeight: 600, padding: '2px 8px', borderRadius: '12px' }}>
                                    อนุมัติแล้ว
                                </span>
                            </div>

                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e3a8a', marginBottom: '4px' }}>
                                👤 ผู้ยืม: {request.borrowerName} {request.studentId ? `(${request.studentId})` : (request.staffId ? `(${request.staffId})` : '')}
                            </div>

                            {request.affiliation && (
                                <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '6px' }}>
                                    🏛️ สังกัด: {request.affiliation}
                                </div>
                            )}

                            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #bfdbfe' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e3a8a', marginBottom: '4px' }}>
                                    📦 รายการครุภัณฑ์ที่จะรับคืน ({hasMultiItems ? `${request.items.length} รายการ, รวม ${totalQty} ชิ้น` : `${totalQty} ชิ้น`}):
                                </div>
                                {hasMultiItems ? (
                                    <ul style={{ margin: '0', paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#334155' }}>
                                        {request.items.map((it, idx) => (
                                            <li key={idx} style={{ marginBottom: '2px' }}>
                                                <strong>{it.equipmentName}</strong> × {it.quantity || 1} ชิ้น
                                                {it.equipmentSerial && <span style={{ color: '#64748b' }}> (SN: {it.equipmentSerial})</span>}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                                        • <strong>{request.equipmentName}</strong> × {request.quantity || 1} ชิ้น
                                        {request.equipmentSerial && <span style={{ color: '#64748b' }}> (SN: {request.equipmentSerial})</span>}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ช่องกรอกชื่อผู้รับคืน */}
                        <div className="form-group">
                            <label className="form-label">
                                👤 ชื่อผู้รับคืนพัสดุ (Admin / กรรมการสโมสร) <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="ระบุชื่อ-นามสกุล หรือชื่อเล่น เช่น นายเจตพล ชัยชนะ, สโมสรนิสิต วท.ด."
                                value={receiverName}
                                onChange={e => {
                                    setReceiverName(e.target.value);
                                    if (e.target.value.trim()) setError('');
                                }}
                                autoFocus
                            />
                            {error && <p className="form-error" style={{ color: '#ef4444', fontSize: '0.825rem', marginTop: '4px' }}>{error}</p>}
                            <small style={{ color: '#64748b', fontSize: '0.78rem', display: 'block', marginTop: '4px' }}>
                                💡 ระบบจะบันทึกชื่อนี้ไว้ในประวัติคำขอ และส่งอีเมลยืนยันไปยังผู้ยืมเพื่อเป็นหลักฐาน
                            </small>
                        </div>

                        {/* สภาพพัสดุ / หมายเหตุการรับคืน */}
                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>📝 สภาพพัสดุ / หมายเหตุตอนรับคืน</span>
                                <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '0.8rem' }}>ไม่บังคับ</span>
                            </label>

                            {/* ปุ่มเลือกด่วน */}
                            <div className="quick-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                {QUICK_CONDITIONS.map((cond, idx) => (
                                    <button
                                        type="button"
                                        key={idx}
                                        className="quick-tag-btn"
                                        style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                                        onClick={() => setReturnNotes(cond)}
                                    >
                                        {cond}
                                    </button>
                                ))}
                            </div>

                            <input
                                type="text"
                                className="form-input"
                                placeholder="เช่น สภาพสมบูรณ์ ครบทุกอุปกรณ์ หรือมีรอยขีดข่วนเล็กน้อย..."
                                value={returnNotes}
                                onChange={e => setReturnNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
                            ยกเลิก
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {submitting ? '⏳ กำลังบันทึก...' : '📥 ยืนยันการรับคืน'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
