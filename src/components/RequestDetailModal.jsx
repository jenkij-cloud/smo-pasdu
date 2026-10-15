import StatusBadge from './StatusBadge';
import { formatDate, formatDateTime, isOverdue, getDaysOverdue, getOverdueText, getBorrowDurationText, isDueSoon, getDueSoonText, maskPhone, maskEmail } from '../utils/dateUtils';
import { generateBorrowSlipText, getStudentEmail, createMailtoUrl } from '../utils/notificationService';
import { useToast } from '../context/ToastContext';

export default function RequestDetailModal({
    isOpen,
    request,
    onClose,
    isAdmin = false,
    onApprove,
    onReject,
    onReturn,
    onSendDueReminder
}) {
    const toast = useToast();
    if (!isOpen || !request) return null;

    const overdue = isOverdue(request);
    const overdueText = getOverdueText(request);
    const overdueDays = getDaysOverdue(request);
    const dueSoon = isDueSoon(request);
    const dueSoonText = getDueSoonText(request);
    const studentEmail = request.studentEmail || request.borrowerEmail || request.contactEmail || getStudentEmail(request.studentId);
    const durationText = getBorrowDurationText(request.borrowDate, request.returnDate);

    const handleCopySlip = () => {
        const text = generateBorrowSlipText(request);
        navigator.clipboard.writeText(text);
        toast.success('คัดลอกรายละเอียดคำขอเรียบร้อยแล้ว!');
    };

    const mailtoType = overdue ? 'overdue' : (dueSoon ? 'due_soon' : request.status);
    const mailtoUrl = createMailtoUrl(mailtoType, request);

    const hasMultiItems = request.items && Array.isArray(request.items) && request.items.length > 0;
    const totalQty = request.totalQuantity || request.quantity || (hasMultiItems ? request.items.reduce((s, i) => s + (i.quantity || 1), 0) : 1);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>📋 รายละเอียดคำขอยืมครุภัณฑ์</h3>
                    <button className="modal-close" onClick={onClose} aria-label="ปิด">×</button>
                </div>
                <div className="modal-body">
                    <div className="detail-header-card">
                        <div>
                            <h2 style={{ fontSize: '1.25rem', color: 'var(--primary-dark)', marginBottom: '4px' }}>
                                {hasMultiItems && request.items.length > 1
                                    ? `รายการขอยืม (${request.items.length} รายการ, รวม ${totalQty} ชิ้น)`
                                    : request.equipmentName}
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                รหัสอ้างอิง: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{request.id}</code>
                            </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <StatusBadge status={overdue ? 'overdue' : request.status} />
                            {overdue && (
                                <p style={{ color: 'var(--status-rejected)', fontSize: '0.8rem', fontWeight: 600, marginTop: '4px' }}>
                                    🔥 เกินกำหนดแล้ว {overdueText || `${overdueDays} วัน`}
                                </p>
                            )}
                            {dueSoon && !overdue && (
                                <p style={{ color: '#d97706', fontSize: '0.8rem', fontWeight: 600, marginTop: '4px' }}>
                                    ⏰ ใกล้ถึงกำหนดคืน ({dueSoonText})
                                </p>
                            )}
                        </div>
                    </div>

                    {/* แจ้งเตือนกรณีใกล้ถึงกำหนดส่งคืน */}
                    {dueSoon && !overdue && (
                        <div className="alert alert-warning" style={{ margin: '1rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <strong>⏰ ใกล้ถึงกำหนดส่งคืนในอีก 1 ชั่วโมง ({dueSoonText})</strong>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.875rem' }}>
                                    {request.dueReminderSent
                                        ? '✅ ระบบได้ส่งอีเมลแจ้งเตือนไปยังผู้ยืมแล้ว'
                                        : 'ยังไม่ได้ส่งอีเมลแจ้งเตือน หรือกำลังจะส่งตามรอบอัตโนมัติ'}
                                </p>
                            </div>
                            {isAdmin && onSendDueReminder && (
                                <button
                                    type="button"
                                    className="btn btn-warning btn-sm"
                                    onClick={() => onSendDueReminder(request)}
                                >
                                    🔔 {request.dueReminderSent ? 'ส่งเมลเตือนซ้ำ' : 'ส่งเมลเตือน 1 ชม.'}
                                </button>
                            )}
                        </div>
                    )}

                    {request.status === 'rejected' && request.rejectReason && (
                        <div className="alert alert-error" style={{ margin: '1rem 0' }}>
                            <div>
                                <strong>เหตุผลที่ปฏิเสธ:</strong>
                                <p style={{ marginTop: '4px' }}>{request.rejectReason}</p>
                            </div>
                        </div>
                    )}

                    {/* ตารางแสดงรายการครุภัณฑ์ (รองรับหลายชิ้น) */}
                    {hasMultiItems ? (
                        <div className="detail-section" style={{ margin: '1rem 0' }}>
                            <h4>📦 รายการครุภัณฑ์ที่ยืม ({request.items.length} รายการ, รวม {totalQty} ชิ้น)</h4>
                            <div className="detail-items-table-wrapper">
                                <table className="detail-items-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>ครุภัณฑ์</th>
                                            <th>หมวดหมู่</th>
                                            <th>รหัส SN</th>
                                            <th style={{ textAlign: 'center' }}>จำนวน</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {request.items.map((it, idx) => (
                                            <tr key={it.equipmentId || idx}>
                                                <td>{idx + 1}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {it.imageUrl ? (
                                                            <img src={it.imageUrl} alt={it.equipmentName} className="detail-item-thumb" />
                                                        ) : (
                                                            <span style={{ fontSize: '1.25rem' }}>📦</span>
                                                        )}
                                                        <strong>{it.equipmentName}</strong>
                                                    </div>
                                                </td>
                                                <td><span className="card-category-sm">{it.equipmentCategory || '-'}</span></td>
                                                <td><code style={{ fontSize: '0.85rem' }}>{it.equipmentSerial || '-'}</code></td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span className="badge-qty" style={{ fontSize: '0.9rem' }}>{it.quantity} ชิ้น</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'right', fontWeight: 700 }}>รวมทั้งหมด:</td>
                                            <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>
                                                {totalQty} ชิ้น
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    ) : null}

                    <div className="detail-grid">
                        <div className="detail-section">
                            <h4>👤 ข้อมูลผู้ยืม</h4>
                            <div className="detail-row">
                                <span className="detail-label">ประเภทผู้ยืม:</span>
                                <span>
                                    {request.borrowerType === 'staff' ? (
                                        <span className="badge-borrower-type staff">👔 อาจารย์ / บุคลากร</span>
                                    ) : (
                                        <span className="badge-borrower-type student">🎓 นิสิต</span>
                                    )}
                                </span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">ชื่อ-สกุล:</span>
                                <span style={{ fontWeight: 600 }}>{request.borrowerName}</span>
                            </div>
                            {request.borrowerType === 'staff' ? (
                                <>
                                    {request.position && (
                                        <div className="detail-row">
                                            <span className="detail-label">ตำแหน่ง:</span>
                                            <span>{request.position}</span>
                                        </div>
                                    )}
                                    <div className="detail-row">
                                        <span className="detail-label">คณะ:</span>
                                        <span>{request.affiliation || '-'}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">อีเมลติดต่อ:</span>
                                        <span>
                                            {isAdmin ? (
                                                <a href={`mailto:${studentEmail}`} className="link-student-email">
                                                    📧 {studentEmail}
                                                </a>
                                            ) : (
                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                    🔒 {maskEmail(studentEmail)}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="detail-row">
                                        <span className="detail-label">รหัสนิสิต:</span>
                                        <span>{request.studentId}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">อีเมลมหาวิทยาลัย:</span>
                                        <span>
                                            {isAdmin ? (
                                                <a href={`mailto:${studentEmail}`} className="link-student-email">
                                                    📧 {studentEmail}
                                                </a>
                                            ) : (
                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                    🔒 {maskEmail(studentEmail)}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">คณะ:</span>
                                        <span>{request.affiliation || '-'}</span>
                                    </div>
                                </>
                            )}
                            <div className="detail-row">
                                <span className="detail-label">เบอร์โทรศัพท์:</span>
                                <span>
                                    {isAdmin ? (
                                        <a href={`tel:${request.phone}`} style={{ color: 'var(--primary)' }}>{request.phone}</a>
                                    ) : (
                                        <span style={{ color: 'var(--text-secondary)' }}>🔒 {maskPhone(request.phone)}</span>
                                    )}
                                </span>
                            </div>
                        </div>

                        <div className="detail-section">
                            <h4>📅 ข้อมูลเวลาและสถานที่</h4>
                            {!hasMultiItems && (
                                <div className="detail-row">
                                    <span className="detail-label">จำนวนที่ยืม:</span>
                                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{request.quantity} ชิ้น</span>
                                </div>
                            )}
                            <div className="detail-row">
                                <span className="detail-label">สถานที่ใช้งาน:</span>
                                <span>{request.location || '-'}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">วันที่ยืม:</span>
                                <span style={{ fontWeight: 500 }}>{formatDate(request.borrowDate, true)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">กำหนดคืน:</span>
                                <span style={{ color: overdue ? 'var(--status-rejected)' : 'var(--primary-dark)', fontWeight: 600 }}>
                                    {formatDate(request.returnDate, true)}
                                </span>
                            </div>
                            {durationText && (
                                <div className="detail-row">
                                    <span className="detail-label">ระยะเวลายืม:</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>⏱️ {durationText}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="detail-section" style={{ marginTop: '1rem' }}>
                        <h4>📝 วัตถุประสงค์การใช้งาน</h4>
                        <div className="detail-purpose-box">
                            {request.purpose || 'ไม่มีการระบุ'}
                        </div>
                    </div>

                    <div className="detail-timeline" style={{ marginTop: '1rem' }}>
                        <h4>⏱️ ประวัติการดำเนินการ (Timeline)</h4>
                        <ul className="timeline-list">
                            <li>
                                <span className="timeline-dot"></span>
                                <div>
                                    <strong>ยื่นคำขอ:</strong> {formatDate(request.requestDate, true)}
                                </div>
                            </li>
                            {request.approvedDate && (
                                <li>
                                    <span className="timeline-dot timeline-dot-success"></span>
                                    <div>
                                        <strong>อนุมัติคำขอ:</strong> {formatDate(request.approvedDate, true)}
                                    </div>
                                </li>
                            )}
                            {request.dueReminderSent && (
                                <li>
                                    <span className="timeline-dot" style={{ backgroundColor: '#f59e0b' }}></span>
                                    <div>
                                        <strong>ส่งอีเมลเตือนส่งคืน (ก่อน 1 ชม.):</strong> {request.dueReminderSentAt ? formatDate(request.dueReminderSentAt, true) : 'ส่งแล้ว'}
                                    </div>
                                </li>
                            )}
                            {request.rejectedDate && (
                                <li>
                                    <span className="timeline-dot timeline-dot-danger"></span>
                                    <div>
                                        <strong>ปฏิเสธคำขอ:</strong> {formatDate(request.rejectedDate, true)}
                                    </div>
                                </li>
                            )}
                            {request.returnedDate && (
                                <li>
                                    <span className="timeline-dot timeline-dot-info"></span>
                                    <div>
                                        <strong>รับคืนครุภัณฑ์:</strong> {formatDate(request.returnedDate, true)}
                                        {request.returnedReceiverName && (
                                            <div style={{ fontSize: '0.875rem', color: '#1d4ed8', marginTop: '4px', fontWeight: 600 }}>
                                                👤 ผู้รับคืน: {request.returnedReceiverName}
                                                {request.returnNotes && (
                                                    <span style={{ color: '#475569', fontWeight: 400, marginLeft: '6px' }}>
                                                        ({request.returnNotes})
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </li>
                            )}
                        </ul>
                    </div>
                </div>

                <div className="modal-footer modal-footer-detail">
                    {isAdmin && (
                        <div className="modal-footer-secondary-actions">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopySlip}>
                                📋 คัดลอกข้อมูล
                            </button>
                            <a
                                href={mailtoUrl}
                                className="btn btn-warning btn-sm"
                                title={`ส่งอีเมลหา ${studentEmail}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                ✉️ ส่งอีเมลหาผู้ยืม
                            </a>
                        </div>
                    )}
                    <div className="modal-footer-primary-actions">
                        {isAdmin && request.status === 'pending' && (
                            <>
                                <button
                                    type="button"
                                    className="btn btn-success"
                                    onClick={() => onApprove && onApprove(request)}
                                >
                                    ✓ อนุมัติ
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => onReject && onReject(request)}
                                >
                                    ✕ ปฏิเสธ
                                </button>
                            </>
                        )}
                        {isAdmin && request.status === 'approved' && (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => onReturn && onReturn(request)}
                            >
                                📥 รับคืนครุภัณฑ์
                            </button>
                        )}
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            ปิด
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
