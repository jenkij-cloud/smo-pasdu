import StatusBadge from './StatusBadge';
import { formatDate, formatDateTime, isOverdue, getDaysOverdue, getOverdueText, getBorrowDurationText } from '../utils/dateUtils';
import { generateBorrowSlipText, getStudentEmail, createMailtoUrl } from '../utils/notificationService';
import { useToast } from '../context/ToastContext';

export default function RequestDetailModal({
    isOpen,
    request,
    onClose,
    isAdmin = false,
    onApprove,
    onReject,
    onReturn
}) {
    const toast = useToast();
    if (!isOpen || !request) return null;

    const overdue = isOverdue(request);
    const overdueText = getOverdueText(request);
    const overdueDays = getDaysOverdue(request);
    const studentEmail = request.studentEmail || getStudentEmail(request.studentId);
    const durationText = getBorrowDurationText(request.borrowDate, request.returnDate);

    const handleCopySlip = () => {
        const text = generateBorrowSlipText(request);
        navigator.clipboard.writeText(text);
        toast.success('คัดลอกรายละเอียดคำขอเรียบร้อยแล้ว!');
    };

    const mailtoUrl = createMailtoUrl(overdue ? 'overdue' : request.status, request);

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
                                {request.equipmentName}
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
                        </div>
                    </div>

                    {request.status === 'rejected' && request.rejectReason && (
                        <div className="alert alert-error" style={{ margin: '1rem 0' }}>
                            <div>
                                <strong>เหตุผลที่ปฏิเสธ:</strong>
                                <p style={{ marginTop: '4px' }}>{request.rejectReason}</p>
                            </div>
                        </div>
                    )}

                    <div className="detail-grid">
                        <div className="detail-section">
                            <h4>👤 ข้อมูลผู้ยืม</h4>
                            <div className="detail-row">
                                <span className="detail-label">ชื่อ-สกุล:</span>
                                <span>{request.borrowerName}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">รหัสนิสิต:</span>
                                <span>{request.studentId}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">อีเมลมหาวิทยาลัย:</span>
                                <span>
                                    <a href={`mailto:${studentEmail}`} className="link-student-email">
                                        📧 {studentEmail}
                                    </a>
                                </span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">เบอร์โทรศัพท์:</span>
                                <span><a href={`tel:${request.phone}`} style={{ color: 'var(--primary)' }}>{request.phone}</a></span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">สังกัด / สาขา:</span>
                                <span>{request.affiliation || '-'}</span>
                            </div>
                        </div>

                        <div className="detail-section">
                            <h4>📦 รายละเอียดการยืม</h4>
                            <div className="detail-row">
                                <span className="detail-label">จำนวนที่ยืม:</span>
                                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{request.quantity} ชิ้น</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">สถานที่ใช้งาน:</span>
                                <span>{request.location || '-'}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">วันที่ยืม:</span>
                                <span style={{ fontWeight: 500 }}>{formatDate(request.borrowDate)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">กำหนดคืน:</span>
                                <span style={{ color: overdue ? 'var(--status-rejected)' : 'var(--primary-dark)', fontWeight: 600 }}>
                                    {formatDate(request.returnDate)}
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
                                    </div>
                                </li>
                            )}
                        </ul>
                    </div>
                </div>

                <div className="modal-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
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
                            ✉️ ส่งอีเมลหานิสิต
                        </a>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
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
