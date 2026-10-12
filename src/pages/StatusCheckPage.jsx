import { useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import RequestDetailModal from '../components/RequestDetailModal';
import { formatDate, isOverdue, getDaysOverdue, getOverdueText, getBorrowDurationText } from '../utils/dateUtils';
import { getStudentEmail } from '../utils/notificationService';
import { useToast } from '../context/ToastContext';

export default function StatusCheckPage() {
    const toast = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);

    const handleSearch = async (e) => {
        e.preventDefault();
        const trimmed = searchQuery.trim();
        if (!trimmed) return;

        setLoading(true);
        setSearched(true);

        try {
            // ถ้ากรอกมาเป็นอีเมล เช่น 6720210035@tsu.ac.th ให้สกัดเป็นรหัสนิสิตด้วย
            const extractedId = trimmed.toLowerCase().includes('@tsu.ac.th')
                ? trimmed.split('@')[0]
                : trimmed;

            // ค้นหาตามรหัสนิสิต, รหัสบุคลากร, เบอร์โทร, หรืออีเมล
            const qStudent = query(
                collection(db, 'borrowRequests'),
                where('studentId', '==', extractedId)
            );

            const qStaffId = query(
                collection(db, 'borrowRequests'),
                where('staffId', '==', trimmed)
            );

            const qPhone = query(
                collection(db, 'borrowRequests'),
                where('phone', '==', trimmed)
            );

            const qEmail = query(
                collection(db, 'borrowRequests'),
                where('studentEmail', '==', trimmed.toLowerCase())
            );

            const [snapStudent, snapStaff, snapPhone, snapEmail] = await Promise.all([
                getDocs(qStudent),
                getDocs(qStaffId),
                getDocs(qPhone),
                getDocs(qEmail)
            ]);

            const map = new Map();
            snapStudent.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
            snapStaff.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
            snapPhone.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
            snapEmail.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));

            const items = Array.from(map.values());

            // เรียงลำดับจากรายการล่าสุดลงมา
            items.sort((a, b) => {
                const dateA = a.requestDate?.toDate?.() || new Date(0);
                const dateB = b.requestDate?.toDate?.() || new Date(0);
                return dateB - dateA;
            });

            setResults(items);

            if (items.length > 0) {
                toast.success(`พบรายการคำขอ ${items.length} รายการ`);
            } else {
                toast.info('ไม่พบรายการคำขอยืมสำหรับข้อมูลนี้');
            }
        } catch (error) {
            console.error('Error searching:', error);
            toast.error('เกิดข้อผิดพลาดในการค้นหาข้อมูล');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Header />
            <main className="main-container">
                <div className="page-header">
                    <h2>📋 ตรวจสอบสถานะการยืมครุภัณฑ์</h2>
                    <p>กรอกรหัสนิสิต, รหัสบุคลากร, อีเมล หรือเบอร์โทรศัพท์ เพื่อติดตามสถานะคำขอยืม</p>
                </div>

                <div className="status-check-search">
                    <form onSubmit={handleSearch} className="search-form">
                        <div className="search-input-wrapper">
                            <span className="search-icon">🔍</span>
                            <input
                                type="text"
                                className="search-input"
                                placeholder="กรอกรหัสนิสิต, รหัสบุคลากร, อีเมล หรือเบอร์โทร"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading || !searchQuery.trim()}
                        >
                            {loading ? '⏳ กำลังค้นหา...' : '🔍 ตรวจสอบ'}
                        </button>
                    </form>
                </div>

                {loading && (
                    <div className="loading">
                        <div className="spinner"></div>
                        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>กำลังค้นหาข้อมูล...</p>
                    </div>
                )}

                {!loading && searched && results.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-state-icon">📭</div>
                        <h3>ไม่พบรายการคำขอยืม</h3>
                        <p>ไม่พบรายการที่ตรงกับ "{searchQuery}" กรุณาตรวจสอบรหัสนิสิตหรือเบอร์โทรอีกครั้ง</p>
                    </div>
                )}

                {!loading && results.length > 0 && (
                    <div className="status-results">
                        <div className="results-header">
                            <h3>📄 พบ {results.length} รายการ สำหรับ "{searchQuery}"</h3>
                        </div>
                        <div className="status-cards">
                            {results.map(request => {
                                const overdue = isOverdue(request);
                                const overdueDays = getDaysOverdue(request);
                                const studentEmail = request.studentEmail || getStudentEmail(request.studentId);

                                return (
                                    <div
                                        key={request.id}
                                        className={`status-card ${overdue ? 'overdue' : ''} ${request.status === 'rejected' ? 'rejected-card' : ''}`}
                                    >
                                        <div className="status-card-header">
                                            <h4>{request.equipmentName}</h4>
                                            <StatusBadge status={overdue ? 'overdue' : request.status} />
                                        </div>

                                        <div className="status-card-body">
                                            <div className="status-card-row">
                                                <span className="status-card-label">📦 จำนวน:</span>
                                                <span style={{ fontWeight: 600 }}>{request.quantity} ชิ้น</span>
                                            </div>
                                            <div className="status-card-row">
                                                <span className="status-card-label">📧 เมลผู้ยืม:</span>
                                                <span style={{ color: 'var(--primary)' }}>{studentEmail}</span>
                                            </div>
                                            <div className="status-card-row">
                                                <span className="status-card-label">📍 สถานที่ใช้งาน:</span>
                                                <span>{request.location || '-'}</span>
                                            </div>
                                            <div className="status-card-row">
                                                <span className="status-card-label">📅 วันที่ยื่นคำขอ:</span>
                                                <span>{formatDate(request.requestDate, true)}</span>
                                            </div>
                                            <div className="status-card-row">
                                                <span className="status-card-label">📅 วันที่ยืม:</span>
                                                <span>{formatDate(request.borrowDate)}</span>
                                            </div>
                                            <div className="status-card-row">
                                                <span className="status-card-label">📅 กำหนดคืน:</span>
                                                <span className={overdue ? 'overdue-text' : ''} style={{ fontWeight: overdue ? 700 : 500 }}>
                                                    {formatDate(request.returnDate)}
                                                </span>
                                            </div>
                                            {request.borrowDate && request.returnDate && (
                                                <div className="status-card-row">
                                                    <span className="status-card-label">⏱️ ระยะเวลายืม:</span>
                                                    <span style={{ color: 'var(--text-secondary)' }}>
                                                        {getBorrowDurationText(request.borrowDate, request.returnDate)}
                                                    </span>
                                                </div>
                                            )}

                                            {/* แสดงเหตุผลการปฏิเสธอย่างชัดเจน */}
                                            {request.status === 'rejected' && request.rejectReason && (
                                                <div className="reject-reason-box">
                                                    <strong>❌ เหตุผลที่ไม่อนุมัติ:</strong>
                                                    <p>{request.rejectReason}</p>
                                                </div>
                                            )}

                                            {overdue && (
                                                <div className="overdue-warning">
                                                    🔥 เกินกำหนดคืนแล้ว {getOverdueText(request) || `${overdueDays} วัน`}! กรุณานำครุภัณฑ์มาส่งคืนสโมสรนิสิตโดยเร็ว
                                                </div>
                                            )}
                                        </div>

                                        <div className="status-card-footer">
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                style={{ width: '100%' }}
                                                onClick={() => setSelectedRequest(request)}
                                            >
                                                🔍 ดูรายละเอียดทั้งหมด
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>

            {selectedRequest && (
                <RequestDetailModal
                    isOpen={Boolean(selectedRequest)}
                    request={selectedRequest}
                    onClose={() => setSelectedRequest(null)}
                />
            )}
        </>
    );
}
