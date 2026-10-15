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
    const [isCartModalOpen, setIsCartModalOpen] = useState(false);
    const [cart, setCart] = useState([]);
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

    // เพิ่ม/ลบ ครุภัณฑ์ในตะกร้า/รายการยืมร่วม
    const handleToggleCart = (equipment) => {
        setCart(prev => {
            const exists = prev.some(item => item.id === equipment.id);
            if (exists) {
                return prev.filter(item => item.id !== equipment.id);
            } else {
                return [...prev, equipment];
            }
        });
    };

    // เมื่อกด "ยื่นคำขอยืม" ที่การ์ดโดยตรง
    const handleDirectBorrow = (equipment) => {
        // หากมีรายการในตะกร้าและยังไม่มีชิ้นนี้ ให้รวมชิ้นนี้เข้าไปด้วย
        if (cart.length > 0 && !cart.some(item => item.id === equipment.id)) {
            setCart(prev => [...prev, equipment]);
            setIsCartModalOpen(true);
        } else if (cart.length > 0) {
            setIsCartModalOpen(true);
        } else {
            setSelectedEquipment(equipment);
        }
    };

    const handleBorrowSubmit = async (data) => {
        try {
            const items = data.items && Array.isArray(data.items) && data.items.length > 0
                ? data.items
                : [{
                    equipmentId: data.equipmentId,
                    equipmentName: data.equipmentName,
                    quantity: data.quantity || 1
                }];

            // ป้องกัน Race Condition ด้วย Firestore runTransaction (อ่านทุกชิ้นก่อน แล้วเขียนพร้อมกัน)
            await runTransaction(db, async (transaction) => {
                const equipUpdates = [];

                // 1. อ่านและตรวจสอบสต็อกของทุกชิ้นก่อน (Reads MUST precede writes)
                for (const item of items) {
                    const equipmentRef = doc(db, 'equipments', item.equipmentId);
                    const equipmentDoc = await transaction.get(equipmentRef);

                    if (!equipmentDoc.exists()) {
                        throw new Error(`ไม่พบข้อมูลครุภัณฑ์ "${item.equipmentName}" ในระบบ`);
                    }

                    const currentStock = equipmentDoc.data().quantity || 0;
                    if (currentStock < item.quantity) {
                        throw new Error(`ขออภัย "${item.equipmentName}" คงเหลือเพียง ${currentStock} ชิ้น ไม่พอสำหรับจำนวนที่ต้องการยืม (${item.quantity} ชิ้น)`);
                    }

                    equipUpdates.push({
                        ref: equipmentRef,
                        newQuantity: currentStock - item.quantity
                    });
                }

                // 2. บันทึกใบคำขอ
                const newRequestRef = doc(collection(db, 'borrowRequests'));
                transaction.set(newRequestRef, data);

                // 3. ตัดสต็อกของแต่ละชิ้นอย่างปลอดภัย
                for (const u of equipUpdates) {
                    transaction.update(u.ref, {
                        quantity: u.newQuantity
                    });
                }
            });

            toast.success('🎉 ส่งคำขอยืมครุภัณฑ์เรียบร้อยแล้ว!');
            setCart([]); // ล้างตะกร้าเมื่อส่งสำเร็จ
            setSelectedEquipment(null);
            setIsCartModalOpen(false);

            // ส่งการแจ้งเตือน
            sendBorrowNotification({
                type: 'NEW_BORROW_REQUEST',
                data
            });

        } catch (error) {
            console.error("เกิดข้อผิดพลาดในการยืม:", error);
            const errorMsg = error.message.includes('ขออภัย') || error.message.includes('ไม่พบข้อมูล')
                ? error.message
                : 'เกิดข้อผิดพลาดในการส่งคำขอ กรุณาลองใหม่อีกครั้ง';
            toast.error(errorMsg);
            throw error; // Re-throw to keep modal state handling clean
        }
    };

    return (
        <>
            <Header />
            <main className={`main-container ${cart.length > 0 ? 'has-cart-bar' : ''}`}>
                <div className="page-header">
                    <h2>📦 รายการครุภัณฑ์สโมสรนิสิต</h2>
                    <p>ค้นหา เลือกดูรายละเอียด และยื่นคำขอยืมครุภัณฑ์ออนไลน์ได้ทันที (สามารถเลือกยืมได้ครั้งละหลายชิ้น/หลายรายการ)</p>
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
                        {filteredEquipments.map(equipment => {
                            const isInCart = cart.some(item => item.id === equipment.id);
                            return (
                                <EquipmentCard
                                    key={equipment.id}
                                    equipment={equipment}
                                    isInCart={isInCart}
                                    onToggleCart={handleToggleCart}
                                    onBorrow={handleDirectBorrow}
                                />
                            );
                        })}
                    </div>
                )}
            </main>

            {/* แถบแจ้งเตือนตะกร้าลอยด้านล่างเมื่อมีการเลือกหลายชิ้น */}
            {cart.length > 0 && (
                <div className="floating-cart-bar">
                    <div className="floating-cart-content">
                        <div className="floating-cart-info">
                            <span className="floating-cart-icon">🛒</span>
                            <div>
                                <div className="floating-cart-title">
                                    รายการครุภัณฑ์ที่เลือกไว้: <strong>{cart.length} รายการ</strong>
                                </div>
                                <div className="floating-cart-names">
                                    {cart.map(c => c.name).join(', ')}
                                </div>
                            </div>
                        </div>
                        <div className="floating-cart-actions">
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setCart([])}
                                title="ล้างรายการที่เลือกทั้งหมด"
                            >
                                ✕ ล้างรายการ
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => setIsCartModalOpen(true)}
                            >
                                📋 ยื่นขอยืม ({cart.length} รายการ) ➔
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal ยืมสำหรับชิ้นเดียวที่กด */}
            {selectedEquipment && !isCartModalOpen && (
                <BorrowFormModal
                    equipment={selectedEquipment}
                    allEquipments={equipments}
                    onClose={() => setSelectedEquipment(null)}
                    onSubmit={handleBorrowSubmit}
                />
            )}

            {/* Modal ยืมสำหรับรายการในตะกร้า (หลายชิ้น) */}
            {isCartModalOpen && (
                <BorrowFormModal
                    initialItems={cart}
                    allEquipments={equipments}
                    onClose={() => setIsCartModalOpen(false)}
                    onSubmit={handleBorrowSubmit}
                />
            )}
        </>
    );
}
