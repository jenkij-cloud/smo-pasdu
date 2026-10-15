import { useState, useRef, useEffect, useMemo } from 'react';

// รายชื่อคณะในมหาวิทยาลัยทักษิณ พร้อมธีมสีและไอคอน
export const FACULTIES = [
    {
        id: 'sci',
        name: 'คณะวิทยาศาสตร์และนวัตกรรมดิจิทัล',
        icon: '💻',
        color: '#2563eb',
        bg: '#eff6ff',
        isOwner: true,
        badge: 'สโมสรนิสิต วท.ด. (เจ้าของระบบ)',
        group: 'main'
    },
    { id: 'health', name: 'คณะวิทยาการสุขภาพและการกีฬา', icon: '🏃‍♂️', color: '#ea580c', bg: '#fff7ed', group: 'other' },
    { id: 'agri', name: 'คณะเกษตรศาสตร์', icon: '🌾', color: '#16a34a', bg: '#f0fdf4', group: 'other' },
    { id: 'eng', name: 'คณะวิศวกรรมศาสตร์', icon: '⚙️', color: '#d97706', bg: '#fffbeb', group: 'other' },
    { id: 'nurse', name: 'คณะพยาบาลศาสตร์', icon: '🩺', color: '#db2777', bg: '#fdf2f8', group: 'other' },
    { id: 'agro', name: 'คณะอุตสาหกรรมเกษตรและชีวภาพ', icon: '🔬', color: '#0d9488', bg: '#f0fdfa', group: 'other' },
    { id: 'inter', name: 'คณะสหวิทยาการและการประกอบการ', icon: '💡', color: '#ca8a04', bg: '#fefce8', group: 'other' },
    { id: 'allied', name: 'คณะสหเวชศาสตร์', icon: '🧪', color: '#7c3aed', bg: '#f5f3ff', group: 'other' },
    { id: 'med', name: 'คณะแพทยศาสตร์', icon: '🏥', color: '#dc2626', bg: '#fef2f2', group: 'other' },
    { id: 'edu', name: 'คณะศึกษาศาสตร์', icon: '📚', color: '#9333ea', bg: '#faf5ff', group: 'other' },
    { id: 'law', name: 'คณะนิติศาสตร์', icon: '⚖️', color: '#475569', bg: '#f8fafc', group: 'other' },
    { id: 'custom', name: 'อื่นๆ (ระบุเอง)', icon: '✏️', color: '#0284c7', bg: '#f0f9ff', group: 'custom' }
];

export default function FacultySelect({
    value,
    onChange,
    customValue = '',
    onCustomChange,
    error,
    required = true,
    label = 'คณะ'
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef(null);
    const searchInputRef = useRef(null);

    // ปิด dropdown เมื่อคลิกที่อื่น หรือกด Escape
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                setSearchQuery('');
            }
        }
        function handleKeyDown(event) {
            if (event.key === 'Escape' && isOpen) {
                setIsOpen(false);
                setSearchQuery('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // เมื่อเปิด dropdown ให้โฟกัสที่ช่องค้นหา และเลื่อนให้อยู่กึ่งกลางสายตา
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                searchInputRef.current?.focus();
                dropdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 60);
        } else {
            setSearchQuery('');
        }
    }, [isOpen]);

    // หา item ที่ตรงกับ value
    const isOther = value === 'อื่นๆ (ระบุเอง)';
    const selectedItem = FACULTIES.find(f => f.name === value) || (isOther ? FACULTIES.find(f => f.id === 'custom') : FACULTIES[0]);

    // รายการที่ผ่านการกรองด้วยคำค้นหา
    const filteredFaculties = useMemo(() => {
        if (!searchQuery.trim()) return FACULTIES;
        const kw = searchQuery.toLowerCase().trim();
        return FACULTIES.filter(f => f.name.toLowerCase().includes(kw));
    }, [searchQuery]);

    const handleSelect = (fac) => {
        onChange(fac.name);
        setIsOpen(false);
        setSearchQuery('');
    };

    return (
        <div className="form-group faculty-select-group" ref={dropdownRef}>
            <div className="faculty-select-header-row">
                <label className="form-label" style={{ marginBottom: 0 }}>
                    {label} {required && <span className="required">*</span>}
                </label>
                <span className="faculty-select-hint">มหาวิทยาลัยทักษิณ</span>
            </div>

            <div className="custom-faculty-dropdown">
                {/* Trigger Button */}
                <button
                    type="button"
                    className={`custom-faculty-trigger ${isOpen ? 'active' : ''} ${error ? 'has-error' : ''}`}
                    onClick={() => setIsOpen(prev => !prev)}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                >
                    <div className="faculty-trigger-content">
                        <span
                            className="faculty-trigger-icon"
                            style={{
                                backgroundColor: selectedItem?.bg || '#eff6ff',
                                color: selectedItem?.color || '#2563eb'
                            }}
                        >
                            {selectedItem ? selectedItem.icon : '🏛️'}
                        </span>
                        <div className="faculty-trigger-info">
                            <span className="faculty-trigger-text">
                                {selectedItem ? selectedItem.name : 'เลือกคณะ...'}
                            </span>
                            {selectedItem?.isOwner && (
                                <span className="faculty-owner-badge">
                                    <span className="badge-dot"></span>(เจ้าของระบบ)
                                </span>
                            )}
                        </div>
                    </div>
                    <span className={`faculty-chevron ${isOpen ? 'rotated' : ''}`}>
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </span>
                </button>

                {/* Dropdown Menu Options */}
                {isOpen && (
                    <div className="custom-faculty-menu" role="listbox">
                        {/* Search Top Bar */}
                        <div className="faculty-menu-top-bar">
                            <div className="faculty-search-wrapper">
                                <span className="faculty-search-icon">
                                    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                                    </svg>
                                </span>
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    className="faculty-search-input"
                                    placeholder="ค้นหาชื่อคณะใน ม.ทักษิณ..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        className="btn-clear-search-fac"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSearchQuery('');
                                            searchInputRef.current?.focus();
                                        }}
                                        title="ล้างข้อความค้นหา"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Options List */}
                        <div className="faculty-menu-list">
                            {filteredFaculties.length === 0 ? (
                                <div className="faculty-empty-search">
                                    <span className="faculty-empty-emoji">🔍</span>
                                    <p className="faculty-empty-title">ไม่พบคณะที่ค้นหา "{searchQuery}"</p>
                                    <p className="faculty-empty-desc">ท่านสามารถเลือกพิมพ์ระบุสังกัดหรือหน่วยงานเองได้</p>
                                    <button
                                        type="button"
                                        className="btn-select-other-direct"
                                        onClick={() => handleSelect(FACULTIES.find(f => f.id === 'custom'))}
                                    >
                                        ✏️ คลิกที่นี่เพื่อระบุเอง
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Section 1: คณะเจ้าของระบบ (เมื่อไม่มีคำค้นหา หรือคำค้นหาตรงกับ วท.ด.) */}
                                    {!searchQuery.trim() && (
                                        <div className="faculty-menu-section-label">
                                            ⭐ คณะเจ้าของระบบ
                                        </div>
                                    )}

                                    {filteredFaculties.map((fac, idx) => {
                                        const isSelected = (value === fac.name) || (isOther && fac.id === 'custom');
                                        const showOtherSectionHeader = !searchQuery.trim() && idx === 1;
                                        const showCustomSectionHeader = !searchQuery.trim() && fac.id === 'custom';

                                        return (
                                            <div key={fac.id}>
                                                {showOtherSectionHeader && (
                                                    <div className="faculty-menu-section-label">
                                                        🏛️ คณะอื่นๆ ในมหาวิทยาลัยทักษิณ
                                                    </div>
                                                )}
                                                {showCustomSectionHeader && (
                                                    <div className="faculty-menu-section-label">
                                                        ✏️ สังกัดอื่นๆ
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    role="option"
                                                    aria-selected={isSelected}
                                                    className={`faculty-menu-item ${isSelected ? 'selected' : ''} ${fac.isOwner ? 'is-owner-item' : ''}`}
                                                    onClick={() => handleSelect(fac)}
                                                >
                                                    <div className="faculty-item-left">
                                                        <span
                                                            className="faculty-item-icon-box"
                                                            style={{
                                                                backgroundColor: fac.bg,
                                                                color: fac.color
                                                            }}
                                                        >
                                                            {fac.icon}
                                                        </span>
                                                        <div className="faculty-item-info-col">
                                                            <span className="faculty-item-name">{fac.name}</span>
                                                        </div>
                                                    </div>
                                                    {isSelected && (
                                                        <span className="faculty-item-check">
                                                            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                        </span>
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ช่องกรอกข้อความเมื่อเลือก "อื่นๆ (ระบุเอง)" */}
            {isOther && (
                <div className="custom-faculty-input-box">
                    <div className="custom-input-label-row">
                        <span className="custom-input-icon">✏️</span>
                        <span>โปรดระบุคณะ หรือหน่วยงาน/ชมรมที่สังกัด:</span>
                    </div>
                    <input
                        type="text"
                        className="form-input custom-affiliation-input"
                        placeholder="เช่น สำนักคอมพิวเตอร์, กองกิจการนิสิต, หรือชมรมดนตรี..."
                        value={customValue}
                        onChange={e => onCustomChange(e.target.value)}
                        autoFocus
                    />
                </div>
            )}

            {error && <p className="form-error">{error}</p>}
        </div>
    );
}
