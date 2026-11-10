import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { compressImage } from '../utils/imageUtils';

export default function EquipmentFormModal({ equipment, onClose, onSubmit }) {
    const toast = useToast();
    const [formData, setFormData] = useState({
        name: equipment?.name || '',
        quantity: equipment?.quantity !== undefined ? equipment.quantity : 1,
        category: equipment?.category || '',
        serialNumber: equipment?.serialNumber || '',
        condition: equipment?.condition || 'good',
        location: equipment?.location || '',
        imageUrl: equipment?.imageUrl || ''
    });

    const [imageFile, setImageFile] = useState(null);
    const [compressedData, setCompressedData] = useState(null);
    const [imagePreview, setImagePreview] = useState(equipment?.imageUrl || '');
    const [isCompressing, setIsCompressing] = useState(false);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(false);

    const validate = () => {
        const newErrors = {};
        if (!formData.name.trim()) newErrors.name = 'กรุณากรอกชื่อครุภัณฑ์';
        if (!formData.category.trim()) newErrors.category = 'กรุณากรอกหมวดหมู่';
        if (formData.quantity < 0) newErrors.quantity = 'จำนวนต้องไม่ติดลบ';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)');
            return;
        }

        if (file.size > 15 * 1024 * 1024) {
            toast.error('ขนาดไฟล์รูปภาพต้องไม่เกิน 15MB');
            return;
        }

        try {
            setIsCompressing(true);
            // บีบอัดรูปภาพลงให้กว้าง/สูงไม่เกิน 800px เพื่อความรวดเร็วและป้องกันหน้าค้าง
            const compressed = await compressImage(file, 800, 800, 0.75);
            setImageFile(file);
            setCompressedData(compressed);
            setImagePreview(compressed.dataUrl);
            setFormData(prev => ({ ...prev, imageUrl: '' }));
        } catch (err) {
            console.error('Error compressing image:', err);
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        } finally {
            setIsCompressing(false);
        }
    };

    const handleRemoveImage = () => {
        setImageFile(null);
        setCompressedData(null);
        setImagePreview('');
        setFormData(prev => ({ ...prev, imageUrl: '' }));
        const fileInput = document.getElementById('equipment-image-file');
        if (fileInput) fileInput.value = '';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        setSubmitting(true);
        let finalImageUrl = formData.imageUrl;

        try {
            // หากมีการเลือกไฟล์รูปภาพใหม่ ให้ใช้รูปภาพที่บีบอัดแล้วบันทึกลงฐานข้อมูล Firestore ได้ทันที
            // วิธีนี้ทำงานได้รวดเร็วในเสี้ยววินาที ไม่ต้องรอ Storage และใช้งานได้ 100% บนแพ็กเกจฟรี Spark โดยไม่ต้องผูกบัตรเครดิต
            if (compressedData?.dataUrl) {
                finalImageUrl = compressedData.dataUrl;
            } else if (imageFile) {
                setUploadProgress(true);
                const compressed = await compressImage(imageFile, 800, 800, 0.75);
                finalImageUrl = compressed.dataUrl;
                setUploadProgress(false);
            }

            await onSubmit({
                ...formData,
                imageUrl: finalImageUrl
            }, equipment?.id);

            onClose();
        } catch (error) {
            console.error('Error saving equipment:', error);
            toast.error('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        } finally {
            setSubmitting(false);
            setUploadProgress(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{equipment ? '✏️ แก้ไขข้อมูลครุภัณฑ์' : '➕ เพิ่มครุภัณฑ์ใหม่'}</h3>
                    <button className="modal-close" onClick={onClose} aria-label="ปิด">×</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {/* รูปภาพและ Preview */}
                        <div className="form-group image-upload-box">
                            <label className="form-label">🖼️ รูปภาพครุภัณฑ์</label>
                            <div className="image-upload-flex">
                                <div className="image-preview-slot">
                                    {imagePreview ? (
                                        <img src={imagePreview} alt="Preview" className="img-uploaded-preview" />
                                    ) : (
                                        <div className="img-placeholder-slot">ยังไม่มีรูปภาพ</div>
                                    )}
                                </div>
                                <div className="image-inputs-slot">
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            id="equipment-image-file"
                                            style={{ display: 'none' }}
                                            onChange={handleFileChange}
                                            disabled={isCompressing || submitting}
                                        />
                                        <label
                                            htmlFor="equipment-image-file"
                                            className="btn btn-secondary btn-sm"
                                            style={{ cursor: isCompressing || submitting ? 'not-allowed' : 'pointer' }}
                                        >
                                            {isCompressing ? '⏳ กำลังประมวลผลรูป...' : '📁 เลือกไฟล์รูปภาพจากเครื่อง'}
                                        </label>
                                        {imagePreview && (
                                            <button
                                                type="button"
                                                className="btn btn-sm"
                                                onClick={handleRemoveImage}
                                                disabled={isCompressing || submitting}
                                                style={{ color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)' }}
                                                title="ลบรูปภาพ"
                                            >
                                                🗑️ ลบรูป
                                            </button>
                                        )}
                                    </div>

                                    {compressedData && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--success, #10b981)', display: 'block', marginTop: '4px' }}>
                                            ✅ บีบอัดรูปภาพแล้ว (~{Math.round(compressedData.compressedSize / 1024)} KB) พร้อมบันทึก
                                        </span>
                                    )}

                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', display: 'block', margin: '6px 0' }}>
                                        หรือระบุ URL รูปภาพ:
                                    </span>
                                    <input
                                        type="url"
                                        className="form-input form-input-sm"
                                        placeholder="https://example.com/image.jpg"
                                        value={formData.imageUrl}
                                        disabled={Boolean(imageFile) || submitting}
                                        onChange={e => {
                                            setFormData({ ...formData, imageUrl: e.target.value });
                                            setImagePreview(e.target.value);
                                        }}
                                    />
                                    {imageFile && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', display: 'block', marginTop: '2px' }}>
                                            * หากต้องการใช้ URL รูปภาพแทน ให้กด "🗑️ ลบรูป" ด้านบนก่อน
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group" style={{ flex: 2 }}>
                                <label className="form-label">
                                    ชื่อครุภัณฑ์ <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น ไมโครโฟนไร้สาย / โปรเจคเตอร์"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                                {errors.name && <p className="form-error">{errors.name}</p>}
                            </div>

                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">
                                    จำนวน (ชิ้น) <span className="required">*</span>
                                </label>
                                <input
                                    type="number"
                                    className="form-input"
                                    min="0"
                                    value={formData.quantity}
                                    onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                                />
                                {errors.quantity && <p className="form-error">{errors.quantity}</p>}
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">
                                    หมวดหมู่ <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น อุปกรณ์เสียง, อุปกรณ์ภาพ, เครื่องเขียน"
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                />
                                {errors.category && <p className="form-error">{errors.category}</p>}
                            </div>

                            <div className="form-group">
                                <label className="form-label">รหัสครุภัณฑ์ / Serial Number</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น SMO-67-001"
                                    value={formData.serialNumber}
                                    onChange={e => setFormData({ ...formData, serialNumber: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">สภาพครุภัณฑ์</label>
                                <select
                                    className="form-select"
                                    value={formData.condition}
                                    onChange={e => setFormData({ ...formData, condition: e.target.value })}
                                >
                                    <option value="excellent">🟢 ดีมาก (สมบูรณ์ 100%)</option>
                                    <option value="good">🔵 ปกติ (ใช้งานได้ดี)</option>
                                    <option value="fair">🟡 พอใช้ (มีรอยเล็กน้อย)</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">สถานที่จัดเก็บ</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น ตู้ A ห้องสโมสรนิสิต"
                                    value={formData.location}
                                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            ยกเลิก
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {uploadProgress ? '⏳ กำลังประมวลผลรูปภาพ...' : submitting ? '⏳ กำลังบันทึก...' : '💾 บันทึกข้อมูล'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
