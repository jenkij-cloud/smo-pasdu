import { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    runTransaction
} from 'firebase/firestore';
import Header from '../components/Header';
import EquipmentCard from '../components/EquipmentCard';
import BorrowFormModal from '../components/BorrowFormModal';
import { useToast } from '../context/ToastContext';
import { sendBorrowNotification } from '../utils/notificationService';

export default function UserPage() {
    const toast = useToast();
    const [equipments, setEquipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [selectedEquipment, setSelectedEquipment] = useState(null);
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        const q = query(collection(db, 'equipments'), orderBy('name'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            }));
            setEquipments(items);

            // Extract unique categories
            const cats = [...new Set(items.map(item => item.category).filter(Boolean))];
            setCategories(cats);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching equipments:', error);
            toast.error('ไม่สามารถโหลดข้อมูลครุภัณฑ์ได้');
            setLoading(false);
        });

        return unsubscribe;
    }, [toast]);

    const filteredEquipments = equipments.filter(item => {
        const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (item.serialNumber && item.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
        return matchSearch && matchCategory;
    });

    const handleBorrowSubmit = async (data) => {
        try {
            // ป้องกัน Race Condition ด้วย Firestore runTransaction
            await runTransaction(db, async (transaction) => {
                const equipmentRef = doc(db, 'equipments', data.equipmentId);
                const equipmentDoc = await transaction.get(equipmentRef);

                if (!equipmentDoc.exists()) {
                    throw new Error('ไม่พบข้อมูลครุภัณฑ์นี้ในระบบ');
                }

                const currentStock = equipmentDoc.data().quantity || 0;
                if (currentStock < data.quantity) {
                    throw new Error(`ขออภัย ครุภัณฑ์นี้คงเหลือเพียง ${currentStock} ชิ้น ไม่พอสำหรับจำนวนที่ต้องการยืม`);
                }

                // 1. บันทึกใบคำขอ
                const newRequestRef = doc(collection(db, 'borrowRequests'));
                transaction.set(newRequestRef, data);

                // 2. ตัดสต็อกอย่างปลอดภัย
                transaction.update(equipmentRef, {
                    quantity: currentStock - data.quantity
                });
            });

            toast.success('🎉 ส่งคำขอยืมครุภัณฑ์เรียบร้อยแล้ว!');

            // ส่งการแจ้งเตือน
            sendBorrowNotification({
                type: 'NEW_BORROW_REQUEST',
                data
            });

        } catch (error) {
            console.error("เกิดข้อผิดพลาดในการยืม:", error);
            const errorMsg = error.message.includes('ขออภัย')
                ? error.message
                : 'เกิดข้อผิดพลาดในการส่งคำขอ กรุณาลองใหม่อีกครั้ง';
            toast.error(errorMsg);
            throw error; // Re-throw to keep modal state handling clean
        }
    };

    return (
        <>
            <Header />
            <main className="main-container">
                <div className="page-header">
                    <h2>📦 รายการครุภัณฑ์สโมสรนิสิต</h2>
                    <p>ค้นหา เลือกดูรายละเอียด และยื่นคำขอยืมครุภัณฑ์ออนไลน์ได้ทันที</p>
                </div>

                <div className="search-section">
                    <div className="search-row">
                        <div className="search-input-wrapper">
                            <span className="search-icon">🔍</span>
                            <input
                                type="text"
                                className="search-input"
                                placeholder="ค้นหาตามชื่อครุภัณฑ์, หมวดหมู่ หรือรหัส SN..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select
                            className="filter-select"
                            value={categoryFilter}
                            onChange={e => setCategoryFilter(e.target.value)}
                        >
                            <option value="all">📁 ทุกหมวดหมู่ ({equipments.length})</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>
                                    {cat} ({equipments.filter(e => e.category === cat).length})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="loading">
                        <div className="spinner"></div>
                        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>กำลังโหลดรายการครุภัณฑ์...</p>
                    </div>
                ) : filteredEquipments.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📭</div>
                        <h3>ไม่พบรายการครุภัณฑ์</h3>
                        <p>ลองค้นหาด้วยคำอื่น หรือเลือกหมวดหมู่อื่นดูนะครับ</p>
                    </div>
                ) : (
                    <div className="cards-container">
                        {filteredEquipments.map(equipment => (
                            <EquipmentCard
                                key={equipment.id}
                                equipment={equipment}
                                onBorrow={setSelectedEquipment}
                            />
                        ))}
                    </div>
                )}
            </main>

            {selectedEquipment && (
                <BorrowFormModal
                    equipment={selectedEquipment}
                    onClose={() => setSelectedEquipment(null)}
                    onSubmit={handleBorrowSubmit}
                />
            )}
        </>
    );
}
