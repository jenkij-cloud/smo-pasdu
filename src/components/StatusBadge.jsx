export default function StatusBadge({ status }) {
    const statusConfig = {
        pending: { label: 'รอดำเนินการ', icon: '🟡', className: 'status-pending' },
        approved: { label: 'อนุมัติแล้ว', icon: '🟢', className: 'status-approved' },
        rejected: { label: 'ปฏิเสธ', icon: '🔴', className: 'status-rejected' },
        returned: { label: 'คืนแล้ว', icon: '🔵', className: 'status-returned' },
        overdue: { label: 'เกินกำหนด', icon: '🔥', className: 'status-overdue' }
    };

    const config = statusConfig[status] || statusConfig.pending;

    return (
        <span className={`status-badge ${config.className}`}>
            <span className="status-badge-icon">{config.icon}</span>
            <span>{config.label}</span>
        </span>
    );
}
