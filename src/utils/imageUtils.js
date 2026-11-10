// src/utils/imageUtils.js

/**
 * รูปภาพสำรองแบบ SVG Data URL สำหรับแสดงผลเมื่อรูปภาพโหลดไม่ขึ้นหรือลิงก์เสีย
 */
export const IMAGE_FALLBACK_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><rect width="60" height="60" fill="%23f1f5f9"/><text x="50%" y="50%" font-size="24" text-anchor="middle" dominant-baseline="central">📦</text></svg>';

/**
 * ฟังก์ชันช่วยจัดการเมื่อรูปภาพโหลดผิดพลาด ให้เปลี่ยนเป็นรูปสำรองแทน
 */
export const handleImageError = (e) => {
    if (e?.currentTarget) {
        e.currentTarget.onerror = null;
        e.currentTarget.src = IMAGE_FALLBACK_SVG;
    }
};

/**
 * บีบอัดรูปภาพฝั่งเบราว์เซอร์ด้วย Canvas เพื่อลดขนาดไฟล์ก่อนบันทึกหรืออัปโหลด
 * ป้องกันปัญหารูปภาพขนาดใหญ่เกินไป ทำให้เบราว์เซอร์ค้างหรืออัปโหลดช้า
 * 
 * @param {File|Blob} file ไฟล์รูปภาพที่ผู้ใช้เลือก
 * @param {number} maxWidth ความกว้างสูงสุด (default 800px)
 * @param {number} maxHeight ความสูงสูงสุด (default 800px)
 * @param {number} quality คุณภาพของ JPEG ระหว่าง 0 ถึง 1 (default 0.75)
 * @returns {Promise<{dataUrl: string, blob: Blob, originalSize: number, compressedSize: number, width: number, height: number}>}
 */
export const compressImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.75) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error('ไม่พบไฟล์รูปภาพ'));
        }

        if (typeof file === 'string') {
            return resolve({
                dataUrl: file,
                blob: null,
                originalSize: 0,
                compressedSize: file.length,
                width: 0,
                height: 0
            });
        }

        const reader = new FileReader();

        reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));

        reader.onload = (e) => {
            const img = new Image();

            img.onerror = () => reject(new Error('ไฟล์รูปภาพไม่ถูกต้องหรือเปิดไม่ได้'));

            img.onload = () => {
                let { width, height } = img;

                // คำนวณขนาดใหม่โดยรักษาอัตราส่วนภาพเดิม
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    // Fallback หากสร้าง context ไม่สำเร็จ
                    return resolve({
                        dataUrl: e.target.result,
                        blob: file,
                        originalSize: file.size,
                        compressedSize: file.size,
                        width,
                        height
                    });
                }

                // ตั้งค่าความคมชัดของภาพย่อ
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // รองรับภาพ PNG โปร่งใสโดยเติมพื้นขาวก่อนแปลงเป็น JPEG
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // แปลงเป็น Base64 Data URL (JPEG คุณภาพที่กำหนด)
                const dataUrl = canvas.toDataURL('image/jpeg', quality);

                // แปลงเป็น Blob เพื่อรองรับการอัปโหลดไปยัง Storage
                canvas.toBlob(
                    (blob) => {
                        resolve({
                            dataUrl,
                            blob: blob || file,
                            originalSize: file.size,
                            compressedSize: blob ? blob.size : dataUrl.length,
                            width,
                            height
                        });
                    },
                    'image/jpeg',
                    quality
                );
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    });
};

