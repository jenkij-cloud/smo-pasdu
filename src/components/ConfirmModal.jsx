export default function ConfirmModal({
    isOpen,
    title = 'ยืนยันการทำรายการ',
    message = 'คุณแน่ใจหรือไม่ว่าต้องการดำเนินการนี้?',
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
    type = 'danger', // 'danger' | 'warning' | 'primary'
    onConfirm,
    onCancel
}) {
    if (!isOpen) return null;

    const btnClass = type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-warning' : 'btn-primary';

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        {type === 'danger' ? '⚠️ ' : type === 'warning' ? '🔔 ' : 'ℹ️ '}
                        {title}
                    </h3>
                    <button className="modal-close" onClick={onCancel} aria-label="ปิด">×</button>
                </div>
                <div className="modal-body">
                    <p style={{ fontSize: '1rem', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                        {message}
                    </p>
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button type="button" className={`btn ${btnClass}`} onClick={onConfirm}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
