import { useState, useEffect, useRef } from 'react';
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

// ฟังก์ชันจับคู่อีโมจิ/ไอคอนให้เข้ากับหมวดหมู่ต่างๆ
export const getCategoryIcon = (category) => {
    if (!category || category === 'all') return '📁';
    const lower = category.toLowerCase();
    if (lower.includes('กีฬา') || lower.includes('sport')) return '⚽';
    if (lower.includes('วัสดุ') || lower.includes('อุปกรณ์') || lower.includes('เครื่องมือ')) return '📦';
    if (lower.includes('ตรา') || lower.includes('สัญลักษณ์') || lower.includes('ป้าย')) return '🏅';
    if (lower.includes('สื่อสาร') || lower.includes('วิทยุ') || lower.includes('ไมค์')) return '📻';
    if (lower.includes('คอม') || lower.includes('ไอที') || lower.includes('it') || lower.includes('โน้ตบุ๊ก')) return '💻';
    if (lower.includes('กล้อง') || lower.includes('ถ่ายภาพ')) return '📷';
    if (lower.includes('เอกสาร') || lower.includes('หนังสือ')) return '📄';
    return '🏷️';
};

export default function UserPage() {
    const toast = useToast();
    const [equipments, setEquipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
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

    // ปิด Dropdown เมื่อคลิกข้างนอก
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredEquipments = equipments.filter(item => {
        const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (item.serialNumber && item.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
        return matchSearch && matchCategory;
    });

    // ค้นหา Label และ Icon ปัจจุบันที่เลือกอยู่
    const currentCategoryLabel = categoryFilter === 'all'
        ? `ทุกหมวดหมู่ (${equipments.length})`
        : `${categoryFilter} (${equipments.filter(e => e.category === categoryFilter).length})`;
    const currentCategoryIcon = getCategoryIcon(categoryFilter);

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
                        <div className="filter-select-wrapper" ref={dropdownRef}>
                            <button
                                type="button"
                                className={`custom-dropdown-btn ${isDropdownOpen ? 'is-open' : ''}`}
                                onClick={() => setIsDropdownOpen(prev => !prev)}
                                aria-expanded={isDropdownOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="selected-category-display">
                                    <span className="cat-icon-emoji">{currentCategoryIcon}</span>
                                    <span className="cat-text">{currentCategoryLabel}</span>
                                </span>
                                <span className="filter-select-arrow" aria-hidden="true">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </span>
                            </button>

                            {isDropdownOpen && (
                                <div className="custom-dropdown-menu" role="listbox">
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={categoryFilter === 'all'}
                                        className={`custom-dropdown-item ${categoryFilter === 'all' ? 'active' : ''}`}
                                        onClick={() => {
                                            setCategoryFilter('all');
                                            setIsDropdownOpen(false);
                                        }}
                                    >
                                        <span className="item-icon">📁</span>
                                        <span className="item-title">ทุกหมวดหมู่</span>
                                        <span className="item-count-badge">{equipments.length}</span>
                                    </button>

                                    {categories.map(cat => {
                                        const count = equipments.filter(e => e.category === cat).length;
                                        const icon = getCategoryIcon(cat);
                                        const isSelected = categoryFilter === cat;
                                        return (
                                            <button
                                                key={cat}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                className={`custom-dropdown-item ${isSelected ? 'active' : ''}`}
                                                onClick={() => {
                                                    setCategoryFilter(cat);
                                                    setIsDropdownOpen(false);
                                                }}
                                            >
                                                <span className="item-icon">{icon}</span>
                                                <span className="item-title">{cat}</span>
                                                <span className="item-count-badge">{count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
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
