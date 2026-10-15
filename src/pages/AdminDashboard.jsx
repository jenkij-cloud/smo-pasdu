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
import ReturnModal from '../components/ReturnModal';
import RequestDetailModal from '../components/RequestDetailModal';
import EquipmentFormModal from '../components/EquipmentFormModal';
import EmailWebhookModal from '../components/EmailWebhookModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate, isOverdue, formatDateTimeRange, getOverdueText, isDueSoon, getDueSoonText } from '../utils/dateUtils';
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
    const [returningRequest, setReturningRequest] = useState(null);
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
            dueSoon: requests.filter(r => isDueSoon(r)).length,
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
                statusFilter === 'due_soon' ? isDueSoon(r) :
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
                (r.items && Array.isArray(r.items) && r.items.some(it => it.equipmentName && it.equipmentName.toLowerCase().includes(kw))) ||
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

    // Status Change with Transaction (Safe from double clicking / race condition & multi-items)
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

                    // กรณีมีหลายครุภัณฑ์ในคำขอเดียว (Multi-items)
                    if (currentData.items && Array.isArray(currentData.items) && currentData.items.length > 0) {
                        const equipUpdates = [];
                        for (const item of currentData.items) {
                            const equipRef = doc(db, 'equipments', item.equipmentId);
                            const equipDoc = await transaction.get(equipRef);
                            if (equipDoc.exists()) {
                                equipUpdates.push({
                                    ref: equipRef,
                                    newQuantity: (equipDoc.data().quantity || 0) + (item.quantity || 1)
                                });
                            }
                        }
                        for (const u of equipUpdates) {
                            transaction.update(u.ref, { quantity: u.newQuantity });
                        }
                    } else if (currentData.equipmentId) {
                        // กรณีคำขอเดิม (Single Item)
                        const equipRef = doc(db, 'equipments', currentData.equipmentId);
                        const equipDoc = await transaction.get(equipRef);

                        if (equipDoc.exists()) {
                            const currentQty = equipDoc.data().quantity || 0;
                            transaction.update(equipRef, {
                                quantity: currentQty + (currentData.quantity || 1)
                            });
                        }
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

    // ส่งอีเมลแจ้งเตือนใกล้ถึงกำหนดคืน (ก่อน 1 ชั่วโมง)
    const handleSendDueReminder = async (request) => {
        try {
            await sendBorrowNotification({
                type: 'STATUS_DUE_SOON',
                data: request
            });
            await updateDoc(doc(db, 'borrowRequests', request.id), {
                dueReminderSent: true,
                dueReminderSentAt: serverTimestamp()
            });
            const targetEmail = request.studentEmail || request.borrowerEmail || request.contactEmail || getStudentEmail(request.studentId);
            toast.success(`ส่งอีเมลแจ้งเตือนส่งคืน (ก่อน 1 ชม.) ไปยัง ${targetEmail} สำเร็จ! 🔔`);
        } catch (err) {
            console.error('Error sending due reminder:', err);
            toast.error('ไม่สามารถส่งอีเมลแจ้งเตือนได้');
        }
    };

    // ตรวจสอบและส่งอีเมลแจ้งเตือนอัตโนมัติเมื่อใกล้ถึงกำหนดคืน 1 ชม. (Auto Reminder Scanner)
    useEffect(() => {
        if (!user || requests.length === 0) return;

        const scanAndSendDueReminders = async () => {
            const needReminderList = requests.filter(r => r.status === 'approved' && isDueSoon(r) && !r.dueReminderSent);
            for (const req of needReminderList) {
                try {
                    console.log(`[Auto Reminder] Triggering 1-hour before due notification for request ${req.id}`);
                    await sendBorrowNotification({
                        type: 'STATUS_DUE_SOON',
                        data: req
                    });
                    await updateDoc(doc(db, 'borrowRequests', req.id), {
                        dueReminderSent: true,
                        dueReminderSentAt: serverTimestamp()
                    });
                    const targetEmail = req.studentEmail || req.borrowerEmail || req.contactEmail || getStudentEmail(req.studentId);
                    toast.info(`⏰ ส่งอีเมลเตือนส่งคืน (ก่อน 1 ชม.) ถึง ${targetEmail} อัตโนมัติ`);
                } catch (e) {
                    console.error('Auto reminder error:', e);
                }
            }
        };

        scanAndSendDueReminders();
        const intervalId = setInterval(scanAndSendDueReminders, 60000); // ตรวจสอบทุกๆ 1 นาที
        return () => clearInterval(intervalId);
    }, [requests, user, toast]);

    // Rejection confirmation handler
    const handleConfirmReject = async (reason) => {
        if (!rejectingRequest) return;
        await handleStatusChange(rejectingRequest.id, 'rejected', { rejectReason: reason });
    };

    // Return confirmation handler (บันทึกชื่อผู้รับคืนและสภาพพัสดุ)
    const handleConfirmReturn = async ({ returnedReceiverName, returnNotes }) => {
        if (!returningRequest) return;
        await handleStatusChange(returningRequest.id, 'returned', {
            returnedReceiverName,
            returnNotes
        });
        setReturningRequest(null);
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

    // Export Excel (.xls / SpreadsheetML) ที่เปิดและแก้ไขใน Microsoft Excel ได้ 100%
    const exportToExcel = () => {
        const dataToExport = filteredRequests;
        if (dataToExport.length === 0) {
            toast.warning('ไม่มีข้อมูลสำหรับ Export');
            return;
        }

        const headers = [
            'ลำดับ',
            'รหัสคำขอ',
            'ชื่อผู้ยืม',
            'ประเภทผู้ยืม',
            'รหัสนิสิต / บุคลากร',
            'อีเมล (@tsu.ac.th)',
            'เบอร์โทรศัพท์',
            'สังกัด / คณะ',
            'รายการครุภัณฑ์ที่ยืม',
            'จำนวนรวม (ชิ้น)',
            'สถานที่ใช้งาน',
            'วันที่ยืม',
            'กำหนดคืน',
            'วัตถุประสงค์',
            'สถานะ',
            'เหตุผลที่ปฏิเสธ',
            'วันที่ยื่นคำขอ',
            'วันที่อนุมัติ',
            'วันที่คืนจริง',
            'ผู้รับคืน',
            'หมายเหตุการรับคืน'
        ];

        const statusLabels = {
            pending: 'รอดำเนินการ',
            approved: 'อนุมัติแล้ว',
            rejected: 'ปฏิเสธ',
            returned: 'คืนแล้ว'
        };

        let tableHtml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <!--[if gte mso 9]>
    <xml>
        <x:ExcelWorkbook>
            <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                    <x:Name>ประวัติการยืมครุภัณฑ์_SMO</x:Name>
                    <x:WorksheetOptions>
                        <x:DisplayGridlines/>
                    </x:WorksheetOptions>
                </x:ExcelWorksheet>
            </x:ExcelWorksheets>
        </x:ExcelWorkbook>
    </xml>
    <![endif]-->
    <style>
        table { border-collapse: collapse; font-family: 'Segoe UI', Tahoma, 'Prompt', sans-serif; font-size: 10pt; }
        th { background-color: #1a237e; color: #ffffff; font-weight: bold; border: 1px solid #0f172a; padding: 8px 12px; text-align: center; }
        td { border: 1px solid #cbd5e1; padding: 6px 10px; vertical-align: middle; }
        .text-cell { mso-number-format:"\\@"; } /* บังคับให้ Excel แสดงเป็นข้อความ ไม่ตัด 0 นำหน้า และไม่แสดงเป็น 6.72E+09 */
        .num-cell { mso-number-format:"#,##0"; text-align: center; }
        .date-cell { text-align: center; }
        .status-pending { background-color: #fef3c7; color: #b45309; font-weight: bold; text-align: center; }
        .status-approved { background-color: #d1fae5; color: #065f46; font-weight: bold; text-align: center; }
        .status-rejected { background-color: #fee2e2; color: #991b1b; font-weight: bold; text-align: center; }
        .status-returned { background-color: #dbeafe; color: #1e40af; font-weight: bold; text-align: center; }
    </style>
</head>
<body>
    <table border="1">
        <thead>
            <tr>
                ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
        `;

        dataToExport.forEach((r, idx) => {
            const hasMulti = r.items && Array.isArray(r.items) && r.items.length > 0;
            const equipStr = hasMulti
                ? r.items.map(it => `${it.equipmentName} (${it.quantity || 1} ชิ้น)`).join(' + ')
                : (r.equipmentName || '-');
            const totalQty = r.totalQuantity || r.quantity || (hasMulti ? r.items.reduce((s, i) => s + (i.quantity || 1), 0) : 1);
            const identifier = r.borrowerType === 'staff' ? (r.staffId || r.position || 'อาจารย์/บุคลากร') : (r.studentId || '-');
            const borrowerEmail = r.studentEmail || r.borrowerEmail || r.contactEmail || getStudentEmail(r.studentId) || '-';

            tableHtml += `
            <tr>
                <td class="num-cell">${idx + 1}</td>
                <td class="text-cell">${r.id}</td>
                <td>${r.borrowerName || '-'}</td>
                <td style="text-align: center;">${r.borrowerType === 'staff' ? 'อาจารย์/บุคลากร' : 'นิสิต'}</td>
                <td class="text-cell">${identifier}</td>
                <td class="text-cell">${borrowerEmail}</td>
                <td class="text-cell">${r.phone || '-'}</td>
                <td>${r.affiliation || '-'}</td>
                <td>${equipStr}</td>
                <td class="num-cell">${totalQty}</td>
                <td>${r.location || '-'}</td>
                <td class="date-cell">${formatDate(r.borrowDate, true)}</td>
                <td class="date-cell">${formatDate(r.returnDate, true)}</td>
                <td>${r.purpose || '-'}</td>
                <td class="status-${r.status}">${statusLabels[r.status] || r.status}</td>
                <td>${r.rejectReason || '-'}</td>
                <td class="date-cell">${formatDate(r.requestDate, true)}</td>
                <td class="date-cell">${formatDate(r.approvedDate, true)}</td>
                <td class="date-cell">${formatDate(r.returnedDate, true)}</td>
                <td class="text-cell">${r.returnedReceiverName || '-'}</td>
                <td>${r.returnNotes || '-'}</td>
            </tr>
            `;
        });

        tableHtml += `
        </tbody>
    </table>
</body>
</html>
        `;

        const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `รายงานการยืมครุภัณฑ์_SMO_${new Date().toISOString().split('T')[0]}.xls`;
        link.click();
        toast.success('ดาวน์โหลดไฟล์ Excel (.xls) สำเร็จ! สามารถเปิดและแก้ไขในโปรแกรม Excel ได้ทันที');
    };

    // Export CSV แบบรองรับ Microsoft Excel (ใส่ sep=, และฟอร์แมตข้อความป้องกันรหัส/เบอร์เพี้ยน)
    const exportToCSV = () => {
        const dataToExport = filteredRequests;
        if (dataToExport.length === 0) {
            toast.warning('ไม่มีข้อมูลสำหรับ Export');
            return;
        }

        const headers = [
            'ลำดับ',
            'รหัสคำขอ',
            'ชื่อผู้ยืม',
            'ประเภทผู้ยืม',
            'รหัสนิสิต / บุคลากร',
            'อีเมล (@tsu.ac.th)',
            'เบอร์โทร',
            'สังกัด/คณะ',
            'ครุภัณฑ์',
            'จำนวนรวม (ชิ้น)',
            'สถานที่ใช้งาน',
            'วันที่ยืม',
            'กำหนดคืน',
            'วัตถุประสงค์',
            'สถานะ',
            'เหตุผลที่ปฏิเสธ',
            'วันที่ยื่นคำขอ',
            'วันที่อนุมัติ',
            'วันที่คืนจริง',
            'ผู้รับคืน',
            'หมายเหตุการรับคืน'
        ];

        const statusLabels = {
            pending: 'รอดำเนินการ',
            approved: 'อนุมัติแล้ว',
            rejected: 'ปฏิเสธ',
            returned: 'คืนแล้ว'
        };

        // ฟังก์ชันช่วยจัดรูปแบบข้อความสำหรับ Excel เพื่อไม่ให้ตัดเลข 0 นำหน้า และไม่แสดงเป็นตัวเลขวิทยาศาสตร์ (Scientific Notation)
        const formatForExcel = (val) => {
            const clean = String(val || '').replace(/"/g, '""');
            return `="${clean}"`;
        };

        const rows = dataToExport.map((r, index) => {
            const hasMulti = r.items && Array.isArray(r.items) && r.items.length > 0;
            const equipStr = hasMulti
                ? r.items.map(it => `${it.equipmentName} (${it.quantity || 1} ชิ้น)`).join(' + ')
                : (r.equipmentName || '-');
            const totalQty = r.totalQuantity || r.quantity || (hasMulti ? r.items.reduce((s, i) => s + (i.quantity || 1), 0) : 1);
            const identifier = r.borrowerType === 'staff' ? (r.staffId || r.position || 'อาจารย์/บุคลากร') : (r.studentId || '-');
            const borrowerEmail = r.studentEmail || r.borrowerEmail || r.contactEmail || getStudentEmail(r.studentId) || '-';

            return [
                index + 1,
                formatForExcel(r.id),
                `"${String(r.borrowerName || '').replace(/"/g, '""')}"`,
                `"${r.borrowerType === 'staff' ? 'อาจารย์/บุคลากร' : 'นิสิต'}"`,
                formatForExcel(identifier),
                `"${borrowerEmail}"`,
                formatForExcel(r.phone || '-'),
                `"${String(r.affiliation || '-').replace(/"/g, '""')}"`,
                `"${equipStr.replace(/"/g, '""')}"`,
                totalQty,
                `"${String(r.location || '-').replace(/"/g, '""')}"`,
                `"${formatDate(r.borrowDate, true)}"`,
                `"${formatDate(r.returnDate, true)}"`,
                `"${String(r.purpose || '-').replace(/"/g, '""')}"`,
                `"${statusLabels[r.status] || r.status}"`,
                `"${String(r.rejectReason || '-').replace(/"/g, '""')}"`,
                `"${formatDate(r.requestDate, true)}"`,
                `"${formatDate(r.approvedDate, true)}"`,
                `"${formatDate(r.returnedDate, true)}"`,
                formatForExcel(r.returnedReceiverName || '-'),
                `"${String(r.returnNotes || '-').replace(/"/g, '""')}"`
            ];
        });

        // ใส่ sep=, บรรทัดแรกสุด เพื่อบังคับให้ Excel แยกคอลัมน์ด้วยคอมม่าอัตโนมัติ ไม่ไปกองรวมในคอลัมน์ A
        const csvContent = '\uFEFFsep=,\r\n' + [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\r\n');

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
                    <div className="admin-quick-actions">
                        <button
                            className="btn btn-secondary admin-action-btn"
                            onClick={() => setShowEmailConfig(true)}
                            title="ตั้งค่าระบบส่งอีเมลอัตโนมัติ"
                        >
                            📧 ตั้งค่าอีเมล ({OFFICIAL_SENDER_EMAIL})
                        </button>
                        <button
                            className="btn btn-success admin-action-btn"
                            onClick={exportToExcel}
                            title="ดาวน์โหลดไฟล์สำหรับเปิดและแก้ไขใน Microsoft Excel (.xls) สไตล์ตารางทางการ"
                            style={{ background: '#107c41', borderColor: '#107c41', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                            📊 Export Excel (.xls)
                        </button>
                        <button
                            className="btn btn-secondary admin-action-btn"
                            onClick={exportToCSV}
                            title="ดาวน์โหลดไฟล์ CSV (รองรับภาษาไทย และไม่ตัดเลข 0 นำหน้า)"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                            📄 Export CSV
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
                            <div
                                className={`stat-card pending ${statusFilter === 'pending' ? 'active-stat' : ''}`}
                                onClick={() => { setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending'); setCurrentPage(1); }}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="stat-icon">🟡</div>
                                <div className="stat-info">
                                    <h4>รอดำเนินการ</h4>
                                    <div className="stat-number">{stats.pending}</div>
                                </div>
                            </div>
                            <div
                                className={`stat-card approved ${statusFilter === 'approved' ? 'active-stat' : ''}`}
                                onClick={() => { setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved'); setCurrentPage(1); }}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="stat-icon">🟢</div>
                                <div className="stat-info">
                                    <h4>อนุมัติแล้ว</h4>
                                    <div className="stat-number">{stats.approved}</div>
                                </div>
                            </div>
                            <div
                                className={`stat-card rejected ${statusFilter === 'rejected' ? 'active-stat' : ''}`}
                                onClick={() => { setStatusFilter(statusFilter === 'rejected' ? 'all' : 'rejected'); setCurrentPage(1); }}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="stat-icon">🔴</div>
                                <div className="stat-info">
                                    <h4>ปฏิเสธ</h4>
                                    <div className="stat-number">{stats.rejected}</div>
                                </div>
                            </div>
                            <div
                                className={`stat-card returned ${statusFilter === 'returned' ? 'active-stat' : ''}`}
                                onClick={() => { setStatusFilter(statusFilter === 'returned' ? 'all' : 'returned'); setCurrentPage(1); }}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="stat-icon">🔵</div>
                                <div className="stat-info">
                                    <h4>คืนแล้ว</h4>
                                    <div className="stat-number">{stats.returned}</div>
                                </div>
                            </div>
                            {stats.overdue > 0 && (
                                <div
                                    className={`stat-card overdue ${statusFilter === 'overdue' ? 'active-stat' : ''}`}
                                    onClick={() => { setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue'); setCurrentPage(1); }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="stat-icon">🔥</div>
                                    <div className="stat-info">
                                        <h4>เกินกำหนดคืน</h4>
                                        <div className="stat-number">{stats.overdue}</div>
                                    </div>
                                </div>
                            )}
                            {stats.dueSoon > 0 && (
                                <div
                                    className={`stat-card duesoon ${statusFilter === 'due_soon' ? 'active-stat' : ''}`}
                                    onClick={() => { setStatusFilter(statusFilter === 'due_soon' ? 'all' : 'due_soon'); setCurrentPage(1); }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="stat-icon">⏰</div>
                                    <div className="stat-info">
                                        <h4>ใกล้ถึงกำหนด (1 ชม.)</h4>
                                        <div className="stat-number">{stats.dueSoon}</div>
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
                                {stats.dueSoon > 0 && (
                                    <button
                                        className={`filter-tab filter-tab-duesoon ${statusFilter === 'due_soon' ? 'active' : ''}`}
                                        onClick={() => { setStatusFilter('due_soon'); setCurrentPage(1); }}
                                    >
                                        ⏰ ใกล้ถึงกำหนด ({stats.dueSoon})
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
                                <>
                                {/* Desktop Table */}
                                <table className="data-table desktop-only-table">
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
                                                        {request.items && Array.isArray(request.items) && request.items.length > 1 ? (
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                    <span className="badge-multi-items">📦 {request.items.length} รายการ</span>
                                                                    <span className="badge-qty">รวม {request.totalQuantity || request.quantity} ชิ้น</span>
                                                                </div>
                                                                <div className="cell-subtext" style={{ marginTop: '4px', color: 'var(--text-primary)', fontSize: '0.825rem' }}>
                                                                    {request.items.map(it => `${it.equipmentName} (${it.quantity})`).join(', ')}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <strong>{request.equipmentName}</strong>
                                                                <div className="cell-subtext">
                                                                    จำนวน: <span className="badge-qty">{request.quantity}</span> ชิ้น
                                                                </div>
                                                            </div>
                                                        )}
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
                                                        {isDueSoon(request) && !overdue && (
                                                            <div style={{ color: '#d97706', fontSize: '0.75rem', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                ⏰ {getDueSoonText(request)} (ใกล้กำหนด)
                                                                {request.dueReminderSent && <span title="ส่งอีเมลเตือนส่งคืนแล้ว">✅</span>}
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
                                                        {request.status === 'returned' && request.returnedReceiverName && (
                                                            <div className="table-return-snippet" title={`ผู้รับคืน: ${request.returnedReceiverName}${request.returnNotes ? ` (${request.returnNotes})` : ''}`}>
                                                                📥 รับโดย: {request.returnedReceiverName}
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

                                                            {request.status === 'approved' && isDueSoon(request) && (
                                                                <button
                                                                    type="button"
                                                                    className={`btn btn-sm ${request.dueReminderSent ? 'btn-secondary' : 'btn-warning'}`}
                                                                    onClick={() => handleSendDueReminder(request)}
                                                                    title={request.dueReminderSent ? 'ส่งอีเมลเตือนซ้ำอีกครั้ง' : 'ส่งอีเมลแจ้งเตือนใกล้ถึงกำหนดคืน (ก่อน 1 ชม.)'}
                                                                >
                                                                    {request.dueReminderSent ? '🔔 เตือนแล้ว' : '🔔 เตือน 1 ชม.'}
                                                                </button>
                                                            )}

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
                                                                    onClick={() => setReturningRequest(request)}
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

                                {/* Mobile Card List */}
                                <div className="mobile-request-cards">
                                    {paginatedRequests.map((request, index) => {
                                        const overdue = isOverdue(request);
                                        const seqNumber = (currentPage - 1) * itemsPerPage + index + 1;
                                        const studentEmail = request.studentEmail || getStudentEmail(request.studentId);

                                        return (
                                            <div
                                                key={request.id}
                                                className={`mobile-req-card ${overdue ? 'mobile-req-card-overdue' : ''}`}
                                            >
                                                <div className="mobile-req-card-top" onClick={() => setDetailRequest(request)}>
                                                    <div className="mobile-req-card-header">
                                                        <span className="mobile-req-seq">#{seqNumber}</span>
                                                        <StatusBadge status={overdue ? 'overdue' : request.status} />
                                                    </div>
                                                    <div className="mobile-req-card-name">
                                                        <strong>{request.borrowerName}</strong>
                                                        {request.borrowerType === 'staff' ? (
                                                            <span className="badge-borrower-type staff">👔 บุคลากร</span>
                                                        ) : (
                                                            <span className="badge-borrower-type student">🎓 {request.studentId}</span>
                                                        )}
                                                    </div>
                                                    <div className="mobile-req-card-email">📧 {studentEmail}</div>
                                                </div>

                                                <div className="mobile-req-card-details">
                                                    <div className="mobile-req-detail-row">
                                                        <span className="mobile-req-label">📦 ครุภัณฑ์</span>
                                                        <span className="mobile-req-value">
                                                            {request.items && Array.isArray(request.items) && request.items.length > 1 ? (
                                                                <span>
                                                                    <strong>{request.items.length} รายการ (รวม {request.totalQuantity || request.quantity} ชิ้น)</strong>
                                                                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                                        {request.items.map(it => `${it.equipmentName} ×${it.quantity}`).join(', ')}
                                                                    </span>
                                                                </span>
                                                            ) : (
                                                                <span><strong>{request.equipmentName}</strong> ×{request.quantity}</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    {request.location && (
                                                        <div className="mobile-req-detail-row">
                                                            <span className="mobile-req-label">📍 สถานที่</span>
                                                            <span className="mobile-req-value">{request.location}</span>
                                                        </div>
                                                    )}
                                                    <div className="mobile-req-detail-row">
                                                        <span className="mobile-req-label">📅 วันยืม-คืน</span>
                                                        <span className="mobile-req-value">
                                                            {(() => {
                                                                const range = formatDateTimeRange(request.borrowDate, request.returnDate);
                                                                if (typeof range === 'string') return range;
                                                                if (range.isSameDay) {
                                                                    return <>{range.dateStr} <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{range.timeRange}</span></>;
                                                                }
                                                                return <>{range.bDateStr} → {range.rDateStr}</>;
                                                            })()}
                                                        </span>
                                                    </div>
                                                    {overdue && (
                                                        <div className="mobile-req-overdue-badge">
                                                            🔥 {getOverdueText(request) || 'เกินกำหนดคืน'}
                                                        </div>
                                                    )}
                                                    {isDueSoon(request) && !overdue && (
                                                        <div className="mobile-req-duesoon-badge">
                                                            ⏰ ใกล้ถึงกำหนดคืน ({getDueSoonText(request)}) {request.dueReminderSent ? '✅ ส่งเตือนแล้ว' : ''}
                                                        </div>
                                                    )}
                                                    {request.status === 'rejected' && request.rejectReason && (
                                                        <div className="mobile-req-reject-reason">
                                                            💬 {request.rejectReason}
                                                        </div>
                                                    )}
                                                    {request.status === 'returned' && request.returnedReceiverName && (
                                                        <div className="mobile-req-return-receiver">
                                                            📥 รับคืนโดย: <strong>{request.returnedReceiverName}</strong>
                                                            {request.returnNotes && <span style={{ color: '#64748b', fontSize: '0.78rem' }}> ({request.returnNotes})</span>}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mobile-req-card-actions">
                                                    <button
                                                        className="btn btn-secondary mobile-action-btn"
                                                        onClick={() => setDetailRequest(request)}
                                                    >
                                                        👁️ ดูรายละเอียด
                                                    </button>

                                                    {request.status === 'approved' && isDueSoon(request) && (
                                                        <button
                                                            type="button"
                                                            className={`btn btn-sm mobile-action-btn ${request.dueReminderSent ? 'btn-secondary' : 'btn-warning'}`}
                                                            onClick={() => handleSendDueReminder(request)}
                                                        >
                                                            {request.dueReminderSent ? '🔔 เตือนแล้ว (ส่งซ้ำ)' : '🔔 เตือน 1 ชม.'}
                                                        </button>
                                                    )}

                                                    {overdue && (
                                                        <a
                                                            href={createMailtoUrl('overdue', request)}
                                                            className="btn btn-warning mobile-action-btn"
                                                        >
                                                            ✉️ ส่งเตือน
                                                        </a>
                                                    )}


                                                    {request.status === 'pending' && (
                                                        <>
                                                            <button
                                                                className="btn btn-success mobile-action-btn"
                                                                onClick={() => handleStatusChange(request.id, 'approved')}
                                                            >
                                                                ✓ อนุมัติ
                                                            </button>
                                                            <button
                                                                className="btn btn-danger mobile-action-btn"
                                                                onClick={() => setRejectingRequest(request)}
                                                            >
                                                                ✕ ปฏิเสธ
                                                            </button>
                                                        </>
                                                    )}

                                                    {request.status === 'approved' && (
                                                        <button
                                                            className="btn btn-primary mobile-action-btn"
                                                            onClick={() => setReturningRequest(request)}
                                                        >
                                                            📥 รับคืน
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                </>
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
                                <>
                                <table className="data-table desktop-only-table">
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

                                {/* Mobile Equipment Cards */}
                                <div className="mobile-equipment-cards">
                                    {filteredEquipmentsList.map((equipment) => (
                                        <div key={equipment.id} className="mobile-equip-card">
                                            <div className="mobile-equip-card-top">
                                                <div className="mobile-equip-thumb-wrap">
                                                    {equipment.imageUrl ? (
                                                        <img
                                                            src={equipment.imageUrl}
                                                            alt={equipment.name}
                                                            className="mobile-equip-thumb"
                                                        />
                                                    ) : (
                                                        <div className="mobile-equip-thumb-fallback">📦</div>
                                                    )}
                                                </div>
                                                <div className="mobile-equip-info">
                                                    <div className="mobile-equip-name">{equipment.name}</div>
                                                    {equipment.location && (
                                                        <div className="mobile-equip-location">📍 {equipment.location}</div>
                                                    )}
                                                    <div className="mobile-equip-tags">
                                                        <span className="card-category">{equipment.category}</span>
                                                        <span className={`badge-cond badge-cond-${equipment.condition || 'good'}`}>
                                                            {equipment.condition === 'excellent' ? '🟢 ดีมาก' :
                                                             equipment.condition === 'fair' ? '🟡 พอใช้' : '🔵 ปกติ'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mobile-equip-details">
                                                <div className="mobile-equip-detail-row">
                                                    <span className="mobile-equip-label">รหัส SN</span>
                                                    <span className="mobile-equip-val">
                                                        {equipment.serialNumber ? <code>{equipment.serialNumber}</code> : '-'}
                                                    </span>
                                                </div>
                                                <div className="mobile-equip-detail-row">
                                                    <span className="mobile-equip-label">คงเหลือในคลัง</span>
                                                    <span className={`mobile-equip-val badge-qty ${equipment.quantity === 0 ? 'qty-zero' : ''}`}>
                                                        {equipment.quantity} ชิ้น
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mobile-equip-actions">
                                                <button
                                                    className="btn btn-secondary mobile-action-btn"
                                                    onClick={() => { setEditingEquipment(equipment); setShowEquipmentForm(true); }}
                                                >
                                                    ✏️ แก้ไขข้อมูล
                                                </button>
                                                <button
                                                    className="btn btn-danger mobile-action-btn"
                                                    onClick={() => handleDeleteEquipment(equipment)}
                                                >
                                                    🗑️ ลบ
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                </>
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
                    onReturn={(r) => { setDetailRequest(null); setReturningRequest(r); }}
                    onSendDueReminder={handleSendDueReminder}
                />
            )}

            {returningRequest && (
                <ReturnModal
                    isOpen={Boolean(returningRequest)}
                    request={returningRequest}
                    onConfirm={handleConfirmReturn}
                    onCancel={() => setReturningRequest(null)}
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
