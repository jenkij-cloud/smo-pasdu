export default function EquipmentCard({ equipment, onBorrow }) {
    const isOutOfStock = equipment.quantity <= 0;
    const isLowStock = equipment.quantity > 0 && equipment.quantity <= 2;

    const conditionLabel = {
        excellent: { text: 'ดีมาก', color: '#10b981' },
        good: { text: 'ปกติ', color: '#3b82f6' },
        fair: { text: 'พอใช้', color: '#f59e0b' }
    };

    const condition = conditionLabel[equipment.condition] || (equipment.condition ? { text: equipment.condition, color: '#64748b' } : null);

    return (
        <div className={`equipment-card ${isOutOfStock ? 'out-of-stock' : ''}`}>
            <div className="card-image-wrapper">
                {equipment.imageUrl ? (
                    <img
                        src={equipment.imageUrl}
                        alt={equipment.name}
                        className="card-image"
                        loading="lazy"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling.style.display = 'flex';
                        }}
                    />
                ) : null}
                <div
                    className="card-image-fallback"
                    style={{ display: equipment.imageUrl ? 'none' : 'flex' }}
                >
                    <span className="card-fallback-icon">📦</span>
                </div>
                <div className="card-top-badges">
                    <span className="card-category">{equipment.category || 'ทั่วไป'}</span>
                    {condition && (
                        <span
                            className="card-condition-badge"
                            style={{ backgroundColor: `${condition.color}15`, color: condition.color, borderColor: condition.color }}
                        >
                            ● {condition.text}
                        </span>
                    )}
                </div>
            </div>

            <div className="card-body">
                <h3 className="card-title" title={equipment.name}>{equipment.name}</h3>

                {equipment.serialNumber && (
                    <div className="card-serial">
                        <small>SN: {equipment.serialNumber}</small>
                    </div>
                )}

                {equipment.location && (
                    <div className="card-location">
                        <small>📍 {equipment.location}</small>
                    </div>
                )}

                <div className="card-info">
                    <div className="quantity-badge">
                        <span>คงเหลือ:</span>
                        <span className={`quantity-number ${isOutOfStock ? 'qty-zero' : isLowStock ? 'qty-low' : ''}`}>
                            {equipment.quantity}
                        </span>
                        <span>ชิ้น</span>
                    </div>
                    {isLowStock && <span className="stock-warning">ใกล้หมด</span>}
                </div>

                <button
                    className={`btn-borrow ${isOutOfStock ? 'btn-disabled' : ''}`}
                    onClick={() => onBorrow(equipment)}
                    disabled={isOutOfStock}
                >
                    {isOutOfStock ? '❌ หมดชั่วคราว' : '📋 ยื่นคำขอยืม'}
                </button>
            </div>
        </div>
    );
}
