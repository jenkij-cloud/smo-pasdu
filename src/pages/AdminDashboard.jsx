import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    runTransaction
} from 'firebase/firestore';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import ConfirmModal from '../components/ConfirmModal';
import RejectReasonModal from '../components/RejectReasonModal';
import RequestDetailModal from '../components/RequestDetailModal';
import EquipmentFormModal from '../components/EquipmentFormModal';
import EmailWebhookModal from '../components/EmailWebhookModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate, isOverdue, formatDateTimeRange, getOverdueText } from '../utils/dateUtils';
import { sendBorrowNotification, getStudentEmail, createMailtoUrl, OFFICIAL_SENDER_EMAIL } from '../utils/notificationService';

export default function AdminDashboard() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    // Tabs & State
    const [activeTab, setActiveTab] = useState('requests');
    const [requests, setRequests] = useState([]);
    const [equipments, setEquipments] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters & Search for Requests
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Filter & Search for Equipments
    const [equipmentSearch, setEquipmentSearch] = useState('');

    // Modals
    const [detailRequest, setDetailRequest] = useState(null);
    const [rejectingRequest, setRejectingRequest] = useState(null);
    const [confirmAction, setConfirmAction] = useState(null);
    const [showEquipmentForm, setShowEquipmentForm] = useState(false);
    const [editingEquipment, setEditingEquipment] = useState(null);
    const [showEmailConfig, setShowEmailConfig] = useState(false);

    // Check Auth
    useEffect(() => {
        if (!authLoading && !user) {
            navigate('/admin/login');
        }
    }, [user, authLoading, navigate]);

    // Subscribe to Firestore
    useEffect(() => {
        if (!user) return;

        const requestsQuery = query(collection(db, 'borrowRequests'), orderBy('requestDate', 'desc'));
        const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
            const items = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            }));
            setRequests(items);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching requests:', error);
            toast.error('ไม่สามารถดึงข้อมูลรายการคำขอยืมได้');
            setLoading(false);
        });

        const equipmentsQuery = query(collection(db, 'equipments'), orderBy('name'));
        const unsubEquipments = onSnapshot(equipmentsQuery, (snapshot) => {
            const items = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            }));
            setEquipments(items);
        }, (error) => {
            console.error('Error fetching equipments:', error);
            toast.error('ไม่สามารถดึงข้อมูลครุภัณฑ์ได้');
        });

        return () => {
            unsubRequests();
            unsubEquipments();
        };
    }, [user, toast]);

    // Stats Computation
    const stats = useMemo(() => {
        return {
            pending: requests.filter(r => r.status === 'pending').length,
            approved: requests.filter(r => r.status === 'approved' && !isOverdue(r)).length,
            rejected: requests.filter(r => r.status === 'rejected').length,
            returned: requests.filter(r => r.status === 'returned').length,
            overdue: requests.filter(r => isOverdue(r)).length
        };
    }, [requests]);

    // Filter Requests
    const filteredRequests = useMemo(() => {
        return requests.filter(r => {
            const matchesStatus =
                statusFilter === 'all' ? true :
                statusFilter === 'overdue' ? isOverdue(r) :
                r.status === statusFilter;

            if (!matchesStatus) return false;

            if (!searchKeyword.trim()) return true;
            const kw = searchKeyword.toLowerCase();
            const studentEmail = (r.studentEmail || getStudentEmail(r.studentId)).toLowerCase();

            return (
                (r.borrowerName && r.borrowerName.toLowerCase().includes(kw)) ||
                (r.studentId && r.studentId.toLowerCase().includes(kw)) ||
                (r.staffId && r.staffId.toLowerCase().includes(kw)) ||
                (r.affiliation && r.affiliation.toLowerCase().includes(kw)) ||
                (r.position && r.position.toLowerCase().includes(kw)) ||
                (studentEmail && studentEmail.includes(kw)) ||
                (r.phone && r.phone.toLowerCase().includes(kw)) ||
                (r.equipmentName && r.equipmentName.toLowerCase().includes(kw)) ||
                (r.location && r.location.toLowerCase().includes(kw))
            );
        });
    }, [requests, statusFilter, searchKeyword]);

    // Pagination Calculation
    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage) || 1;
    const paginatedRequests = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredRequests.slice(start, start + itemsPerPage);
    }, [filteredRequests, currentPage, itemsPerPage]);

    // Status Change with Transaction (Safe from double clicking / race condition)
    const handleStatusChange = async (requestId, newStatus, additionalData = {}) => {
        try {
            await runTransaction(db, async (transaction) => {
                const requestRef = doc(db, 'borrowRequests', requestId);
                const reqDoc = await transaction.get(requestRef);

                if (!reqDoc.exists()) {
                    throw new Error('ไม่พบรายการคำขอนี้ในระบบ');
                }

                const currentData = reqDoc.data();

                // คืนสต็อกเฉพาะกรณีที่สถานะเดิมยังไม่ใช่ 'returned' หรือ 'rejected' เพื่อกันบวกซ้ำ
                if ((newStatus === 'returned' || newStatus === 'rejected') &&
                    currentData.status !== 'returned' &&
                    currentData.status !== 'rejected') {

                    const equipRef = doc(db, 'equipments', currentData.equipmentId);
                    const equipDoc = await transaction.get(equipRef);

                    if (equipDoc.exists()) {
                        const currentQty = equipDoc.data().quantity || 0;
                        transaction.update(equipRef, {
                            quantity: currentQty + (currentData.quantity || 1)
                        });
                    }
                }

                const updates = {
                    status: newStatus,
                    ...additionalData
                };

                if (newStatus === 'approved') updates.approvedDate = serverTimestamp();
                if (newStatus === 'returned') updates.returnedDate = serverTimestamp();
                if (newStatus === 'rejected') updates.rejectedDate = serverTimestamp();

                transaction.update(requestRef, updates);
            });

            const targetReq = requests.find(r => r.id === requestId);
            const targetEmail = targetReq?.studentEmail || getStudentEmail(targetReq?.studentId);

            toast.success(`อัปเดตสถานะเป็น "${newStatus === 'approved' ? 'อนุมัติ' : newStatus === 'rejected' ? 'ปฏิเสธ' : 'คืนแล้ว'}" เรียบร้อยแล้ว`);

            // Trigger Notification to student email
            if (targetReq) {
                sendBorrowNotification({
                    type: `STATUS_${newStatus.toUpperCase()}`,
                    data: { ...targetReq, status: newStatus, ...additionalData }
                });
            }

            // Close modals if open
            setDetailRequest(null);
            setRejectingRequest(null);
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('เกิดข้อผิดพลาดในการอัปเดตสถานะ');
        }
    };

    // Rejection confirmation handler
    const handleConfirmReject = async (reason) => {
        if (!rejectingRequest) return;
        await handleStatusChange(rejectingRequest.id, 'rejected', { rejectReason: reason });
    };

    // Equipment Submission
    const handleEquipmentSubmit = async (data, equipmentId) => {
        try {
            if (equipmentId) {
                await updateDoc(doc(db, 'equipments', equipmentId), {
                    ...data,
                    updatedAt: serverTimestamp()
                });
                toast.success('แก้ไขข้อมูลครุภัณฑ์เรียบร้อยแล้ว');
            } else {
                await addDoc(collection(db, 'equipments'), {
                    ...data,
                    createdAt: serverTimestamp()
                });
                toast.success('เพิ่มครุภัณฑ์ใหม่สำเร็จ');
            }
        } catch (err) {
            console.error('Error saving equipment:', err);
            toast.error('เกิดข้อผิดพลาดในการบันทึกครุภัณฑ์');
        }
    };

    // Delete Equipment
    const handleDeleteEquipment = (equipment) => {
        setConfirmAction({
            title: 'ลบครุภัณฑ์',
            message: `คุณต้องการลบ "${equipment.name}" ออกจากระบบใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`,
            type: 'danger',
            confirmText: 'ลบข้อมูล',
            action: async () => {
                try {
                    await deleteDoc(doc(db, 'equipments', equipment.id));
                    toast.success('ลบครุภัณฑ์เรียบร้อยแล้ว');
                } catch (err) {
                    console.error('Error deleting equipment:', err);
                    toast.error('ไม่สามารถลบครุภัณฑ์ได้');
                }
            }
        });
    };

    // Export CSV with UTF-8 BOM
    const exportToCSV = () => {
        const dataToExport = filteredRequests;
        if (dataToExport.length === 0) {
            toast.warning('ไม่มีข้อมูลสำหรับ Export');
            return;
        }

        const headers = [
            'ลำดับ',
            'รหัสอ้างอิง',
            'ชื่อผู้ยืม',
            'รหัสนิสิต',
            'อีเมลมหาวิทยาลัย (@tsu.ac.th)',
            'เบอร์โทร',
            'สังกัด/สาขา',
            'ครุภัณฑ์',
            'จำนวน',
            'สถานที่ใช้งาน',
            'วันที่ยืม',
            'กำหนดคืน',
            'วัตถุประสงค์',
            'สถานะ',
            'เหตุผลที่ปฏิเสธ',
            'วันที่ยื่นคำขอ',
            'วันที่อนุมัติ',
            'วันที่คืนจริง'
        ];

        const statusLabels = {
            pending: 'รอดำเนินการ',
            approved: 'อนุมัติแล้ว',
            rejected: 'ปฏิเสธ',
            returned: 'คืนแล้ว'
        };

        const rows = dataToExport.map((r, index) => [
            index + 1,
            r.id,
            r.borrowerName,
            r.studentId,
            r.studentEmail || getStudentEmail(r.studentId),
            r.phone,
            r.affiliation || '-',
            r.equipmentName,
            r.quantity,
            r.location || '-',
            formatDate(r.borrowDate),
            formatDate(r.returnDate),
            r.purpose || '-',
            statusLabels[r.status] || r.status,
            r.rejectReason || '-',
            formatDate(r.requestDate, true),
            formatDate(r.approvedDate, true),
            formatDate(r.returnedDate, true)
        ]);

        const csvContent = '\uFEFF' + [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `รายงานการยืมครุภัณฑ์_SMO_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        toast.success('ดาวน์โหลดรายงาน CSV สำเร็จ!');
    };

    // Filter Equipments
    const filteredEquipmentsList = useMemo(() => {
        if (!equipmentSearch.trim()) return equipments;
        const kw = equipmentSearch.toLowerCase();
        return equipments.filter(e =>
            (e.name && e.name.toLowerCase().includes(kw)) ||
            (e.category && e.category.toLowerCase().includes(kw)) ||
            (e.serialNumber && e.serialNumber.toLowerCase().includes(kw))
        );
    }, [equipments, equipmentSearch]);

    if (authLoading || loading) {
        return (
            <>
                <Header />
                <div className="main-container">
                    <div className="loading">
                        <div className="spinner"></div>
                        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>กำลังเตรียมระบบผู้ดูแล...</p>
                    </div>
                </div>
            </>
        );
    }

    if (!user) return null;

    return (
        <>
            <Header />
            <main className="main-container">
                <div className="page-header page-header-flex">
                    <div>
                        <h2>🛠️ แผงควบคุมผู้ดูแลระบบ (Admin)</h2>
                        <p>จัดการคำขอยืม ตรวจสอบสต็อก และควบคุมครุภัณฑ์สโมสรนิสิต</p>
                    </div>
                    <div className="admin-quick-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowEmailConfig(true)}
                            title="ตั้งค่าระบบส่งอีเมลอัตโนมัติ"
                        >
                            📧 ตั้งค่าอีเมล ({OFFICIAL_SENDER_EMAIL})
                        </button>
                        <button className="btn btn-warning" onClick={exportToCSV}>
                            📥 Export CSV
                        </button>
                    </div>
                </div>

                <div className="admin-tabs">
                    <button
                        className={`admin-tab ${activeTab === 'requests' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('requests'); setCurrentPage(1); }}
                    >
                        📋 รายการคำขอยืม ({requests.length})
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'equipments' ? 'active' : ''}`}
                        onClick={() => setActiveTab('equipments')}
                    >
                        📦 จัดการคลังครุภัณฑ์ ({equipments.length})
                    </button>
                </div>

                {activeTab === 'requests' && (
                    <>
                        {/* Stats Cards */}
                        <div className="stats-grid">
                            <div className="stat-card pending" onClick={() => { setStatusFilter('pending'); setCurrentPage(1); }} style={{ cursor: 'pointer' }}>
                                <div className="stat-icon">🟡</div>
                                <div className="stat-info">
                                    <h4>รอดำเนินการ</h4>
                                    <div className="stat-number">{stats.pending}</div>
                                </div>
                            </div>
                            <div className="stat-card approved" onClick={() => { setStatusFilter('approved'); setCurrentPage(1); }} style={{ cursor: 'pointer' }}>
                                <div className="stat-icon">🟢</div>
                                <div className="stat-info">
                                    <h4>อนุมัติแล้ว</h4>
                                    <div className="stat-number">{stats.approved}</div>
                                </div>
                            </div>
                            <div className="stat-card rejected" onClick={() => { setStatusFilter('rejected'); setCurrentPage(1); }} style={{ cursor: 'pointer' }}>
                                <div className="stat-icon">🔴</div>
                                <div className="stat-info">
                                    <h4>ปฏิเสธ</h4>
                                    <div className="stat-number">{stats.rejected}</div>
                                </div>
                            </div>
                            <div className="stat-card returned" onClick={() => { setStatusFilter('returned'); setCurrentPage(1); }} style={{ cursor: 'pointer' }}>
                                <div className="stat-icon">🔵</div>
                                <div className="stat-info">
                                    <h4>คืนแล้ว</h4>
                                    <div className="stat-number">{stats.returned}</div>
                                </div>
                            </div>
                            {stats.overdue > 0 && (
                                <div className="stat-card overdue" onClick={() => { setStatusFilter('overdue'); setCurrentPage(1); }} style={{ cursor: 'pointer' }}>
                                    <div className="stat-icon">🔥</div>
                                    <div className="stat-info">
                                        <h4>เกินกำหนดคืน</h4>
                                        <div className="stat-number">{stats.overdue}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Search & Filter Toolbar */}
                        <div className="admin-toolbar">
                            <div className="filter-tabs">
                                <button
                                    className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
                                >
                                    ทั้งหมด ({requests.length})
                                </button>
                                <button
                                    className={`filter-tab ${statusFilter === 'pending' ? 'active' : ''}`}
                                    onClick={() => { setStatusFilter('pending'); setCurrentPage(1); }}
                                >
                                    🟡 รอดำเนินการ ({stats.pending})
                                </button>
                                <button
                                    className={`filter-tab ${statusFilter === 'approved' ? 'active' : ''}`}
                                    onClick={() => { setStatusFilter('approved'); setCurrentPage(1); }}
                                >
                                    🟢 อนุมัติแล้ว ({stats.approved})
                                </button>
                                <button
                                    className={`filter-tab ${statusFilter === 'rejected' ? 'active' : ''}`}
                                    onClick={() => { setStatusFilter('rejected'); setCurrentPage(1); }}
                                >
                                    🔴 ปฏิเสธ ({stats.rejected})
                                </button>
                                <button
                                    className={`filter-tab ${statusFilter === 'returned' ? 'active' : ''}`}
                                    onClick={() => { setStatusFilter('returned'); setCurrentPage(1); }}
                                >
                                    🔵 คืนแล้ว ({stats.returned})
                                </button>
                                {stats.overdue > 0 && (
                                    <button
                                        className={`filter-tab filter-tab-overdue ${statusFilter === 'overdue' ? 'active' : ''}`}
                                        onClick={() => { setStatusFilter('overdue'); setCurrentPage(1); }}
                                    >
                                        🔥 เกินกำหนด ({stats.overdue})
                                    </button>
                                )}
                            </div>

                            <div className="admin-search-wrapper">
                                <span className="search-icon">🔍</span>
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="ค้นหาชื่อผู้ยืม, รหัสนิสิต, อีเมล @tsu, ครุภัณฑ์..."
                                    value={searchKeyword}
                                    onChange={e => { setSearchKeyword(e.target.value); setCurrentPage(1); }}
                                />
                            </div>
                        </div>

                        {/* Requests Table */}
                        <div className="data-table-container">
                            <div className="table-header">
                                <h3>📋 รายการคำขอยืม ({filteredRequests.length} รายการ)</h3>
                                <div className="table-actions">
                                    <select
                                        className="form-select form-select-sm"
                                        value={itemsPerPage}
                                        onChange={e => { setItemsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
                                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                                    >
                                        <option value={10}>10 รายการ/หน้า</option>
                                        <option value={20}>20 รายการ/หน้า</option>
                                        <option value={50}>50 รายการ/หน้า</option>
                                    </select>
                                </div>
                            </div>

                            {paginatedRequests.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">📭</div>
                                    <h3>ไม่พบรายการคำขอยืม</h3>
                                    <p>ไม่มีรายการที่ตรงกับเงื่อนไขการค้นหาหรือตัวกรองนี้</p>
                                </div>
                            ) : (
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>ลำดับ</th>
                                            <th>ผู้ยืม & อีเมล (@tsu)</th>
                                            <th>ครุภัณฑ์</th>
                                            <th>สถานที่</th>
                                            <th>วันที่ยืม - กำหนดคืน</th>
                                            <th>สถานะ</th>
                                            <th style={{ textAlign: 'center' }}>การดำเนินการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedRequests.map((request, index) => {
                                            const overdue = isOverdue(request);
                                            const seqNumber = (currentPage - 1) * itemsPerPage + index + 1;
                                            const studentEmail = request.studentEmail || getStudentEmail(request.studentId);
                                            const mailtoUrl = createMailtoUrl(overdue ? 'overdue' : request.status, request);

                                            return (
                                                <tr
                                                    key={request.id}
                                                    className={overdue ? 'tr-overdue' : ''}
                                                >
                                                    <td>{seqNumber}</td>
                                                    <td>
                                                        <div
                                                            className="clickable-cell"
                                                            onClick={() => setDetailRequest(request)}
                                                            title="คลิกเพื่อดูรายละเอียด"
                                                        >
                                                            <strong>{request.borrowerName}</strong>
                                                            <div className="cell-subtext" style={{ marginTop: '2px', display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                {request.borrowerType === 'staff' ? (
                                                                    <span className="badge-borrower-type staff">👔 บุคลากร ({request.affiliation || 'เจ้าหน้าที่'})</span>
                                                                ) : (
                                                                    <span className="badge-borrower-type student">🎓 {request.studentId}</span>
                                                                )}
                                                            </div>
                                                            <div className="cell-email">
                                                                <a
                                                                    href={mailtoUrl}
                                                                    className="link-student-email-sm"
                                                                    title="คลิกเพื่อส่งอีเมลหาผู้ยืม"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    📧 {studentEmail}
                                                                </a>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <strong>{request.equipmentName}</strong>
                                                        <div className="cell-subtext">
                                                            จำนวน: <span className="badge-qty">{request.quantity}</span> ชิ้น
                                                        </div>
                                                    </td>
                                                    <td>{request.location || '-'}</td>
                                                    <td>
                                                        {(() => {
                                                            const range = formatDateTimeRange(request.borrowDate, request.returnDate);
                                                            if (typeof range === 'string') return range;
                                                            if (range.isSameDay) {
                                                                return (
                                                                    <div>
                                                                        <strong style={{ fontSize: '0.875rem' }}>{range.dateStr}</strong>
                                                                        <div style={{ fontSize: '0.825rem', color: overdue ? 'var(--status-rejected)' : 'var(--primary)', fontWeight: 600 }}>
                                                                            {range.timeRange}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>
                                                                            (ยืมวันเดียว)
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return (
                                                                <div>
                                                                    <div style={{ fontSize: '0.85rem' }}>{range.bDateStr}</div>
                                                                    <div style={{ color: overdue ? 'var(--status-rejected)' : 'var(--text-secondary)', fontSize: '0.825rem', marginTop: '2px' }}>
                                                                        → {range.rDateStr}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                        {overdue && (
                                                            <div style={{ color: 'var(--status-rejected)', fontSize: '0.75rem', fontWeight: 700, marginTop: '2px' }}>
                                                                🔥 {getOverdueText(request) || 'เกินกำหนด'}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <StatusBadge status={overdue ? 'overdue' : request.status} />
                                                        {request.status === 'rejected' && request.rejectReason && (
                                                            <div className="table-reject-snippet" title={request.rejectReason}>
                                                                💬 {request.rejectReason}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div className="action-buttons" style={{ justifyContent: 'center' }}>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                onClick={() => setDetailRequest(request)}
                                                                title="ดูรายละเอียดเต็ม"
                                                            >
                                                                👁️ ดู
                                                            </button>

                                                            {overdue && (
                                                                <a
                                                                    href={createMailtoUrl('overdue', request)}
                                                                    className="btn btn-warning btn-sm"
                                                                    title="ส่งอีเมลแจ้งเตือนเกินกำหนดคืน"
                                                                >
                                                                    ✉️ เตือน
                                                                </a>
                                                            )}

                                                            {request.status === 'pending' && (
                                                                <>
                                                                    <button
                                                                        className="btn btn-success btn-sm"
                                                                        onClick={() => handleStatusChange(request.id, 'approved')}
                                                                    >
                                                                        ✓ อนุมัติ
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-danger btn-sm"
                                                                        onClick={() => setRejectingRequest(request)}
                                                                    >
                                                                        ✕ ปฏิเสธ
                                                                    </button>
                                                                </>
                                                            )}

                                                            {request.status === 'approved' && (
                                                                <button
                                                                    className="btn btn-primary btn-sm"
                                                                    onClick={() => handleStatusChange(request.id, 'returned')}
                                                                >
                                                                    📥 รับคืน
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="pagination-bar">
                                    <div className="pagination-info">
                                        หน้า {currentPage} จาก {totalPages} (ทั้งหมด {filteredRequests.length} รายการ)
                                    </div>
                                    <div className="pagination-controls">
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        >
                                            ← ก่อนหน้า
                                        </button>
                                        <span className="pagination-current-num">{currentPage}</span>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            disabled={currentPage === totalPages}
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        >
                                            ถัดไป →
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'equipments' && (
                    <>
                        <div className="data-table-container">
                            <div className="table-header">
                                <h3>📦 จัดการรายการครุภัณฑ์ ({equipments.length} รายการ)</h3>
                                <div className="table-actions">
                                    <button
                                        className="btn btn-warning"
                                        onClick={() => { setEditingEquipment(null); setShowEquipmentForm(true); }}
                                    >
                                        ➕ เพิ่มครุภัณฑ์ใหม่
                                    </button>
                                </div>
                            </div>

                            <div className="admin-subsearch">
                                <span className="search-icon">🔍</span>
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="ค้นหาครุภัณฑ์ตามชื่อ, หมวดหมู่ หรือรหัส SN..."
                                    value={equipmentSearch}
                                    onChange={e => setEquipmentSearch(e.target.value)}
                                />
                            </div>

                            {filteredEquipmentsList.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">📦</div>
                                    <h3>ยังไม่มีครุภัณฑ์ในระบบ</h3>
                                    <p>กดปุ่ม "เพิ่มครุภัณฑ์ใหม่" เพื่อเริ่มต้นบันทึกข้อมูลเข้าคลัง</p>
                                </div>
                            ) : (
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>รูปภาพ</th>
                                            <th>ชื่อครุภัณฑ์</th>
                                            <th>หมวดหมู่</th>
                                            <th>รหัสครุภัณฑ์ (SN)</th>
                                            <th>สภาพ</th>
                                            <th>คงเหลือ</th>
                                            <th style={{ textAlign: 'center' }}>การดำเนินการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredEquipmentsList.map((equipment) => (
                                            <tr key={equipment.id}>
                                                <td style={{ width: '60px' }}>
                                                    {equipment.imageUrl ? (
                                                        <img
                                                            src={equipment.imageUrl}
                                                            alt={equipment.name}
                                                            className="table-equip-thumb"
                                                        />
                                                    ) : (
                                                        <div className="table-equip-thumb-fallback">📦</div>
                                                    )}
                                                </td>
                                                <td>
                                                    <strong>{equipment.name}</strong>
                                                    {equipment.location && (
                                                        <div className="cell-subtext">📍 {equipment.location}</div>
                                                    )}
                                                </td>
                                                <td><span className="card-category">{equipment.category}</span></td>
                                                <td>{equipment.serialNumber ? <code>{equipment.serialNumber}</code> : '-'}</td>
                                                <td>
                                                    <span className={`badge-cond badge-cond-${equipment.condition || 'good'}`}>
                                                        {equipment.condition === 'excellent' ? '🟢 ดีมาก' :
                                                         equipment.condition === 'fair' ? '🟡 พอใช้' : '🔵 ปกติ'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge-qty ${equipment.quantity === 0 ? 'qty-zero' : ''}`}>
                                                        {equipment.quantity} ชิ้น
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="action-buttons" style={{ justifyContent: 'center' }}>
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => { setEditingEquipment(equipment); setShowEquipmentForm(true); }}
                                                        >
                                                            ✏️ แก้ไข
                                                        </button>
                                                        <button
                                                            className="btn btn-danger btn-sm"
                                                            onClick={() => handleDeleteEquipment(equipment)}
                                                        >
                                                            🗑️ ลบ
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )}
            </main>

            {/* Modal Components */}
            {showEquipmentForm && (
                <EquipmentFormModal
                    equipment={editingEquipment}
                    onClose={() => { setShowEquipmentForm(false); setEditingEquipment(null); }}
                    onSubmit={handleEquipmentSubmit}
                />
            )}

            {detailRequest && (
                <RequestDetailModal
                    isOpen={Boolean(detailRequest)}
                    request={detailRequest}
                    isAdmin={true}
                    onClose={() => setDetailRequest(null)}
                    onApprove={(r) => handleStatusChange(r.id, 'approved')}
                    onReject={(r) => setRejectingRequest(r)}
                    onReturn={(r) => handleStatusChange(r.id, 'returned')}
                />
            )}

            {rejectingRequest && (
                <RejectReasonModal
                    isOpen={Boolean(rejectingRequest)}
                    request={rejectingRequest}
                    onConfirm={handleConfirmReject}
                    onCancel={() => setRejectingRequest(null)}
                />
            )}

            {confirmAction && (
                <ConfirmModal
                    isOpen={Boolean(confirmAction)}
                    title={confirmAction.title}
                    message={confirmAction.message}
                    type={confirmAction.type}
                    confirmText={confirmAction.confirmText}
                    onConfirm={async () => {
                        const act = confirmAction.action;
                        setConfirmAction(null);
                        if (act) await act();
                    }}
                    onCancel={() => setConfirmAction(null)}
                />
            )}

            {showEmailConfig && (
                <EmailWebhookModal
                    isOpen={showEmailConfig}
                    onClose={() => setShowEmailConfig(false)}
                />
            )}
        </>
    );
}
