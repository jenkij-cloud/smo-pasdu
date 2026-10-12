import { useState } from 'react';
import { OFFICIAL_SENDER_EMAIL } from '../utils/notificationService';
import { useToast } from '../context/ToastContext';

const APPS_SCRIPT_CODE = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var to = data.to;
    var subject = data.subject;
    var body = data.body;
    
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body,
      name: "สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล ม.ทักษิณ"
    });
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

export default function EmailWebhookModal({ isOpen, onClose }) {
    const toast = useToast();
    const [webhookUrl, setWebhookUrl] = useState(
        localStorage.getItem('smo_notification_webhook') || ''
    );
    const [testEmail, setTestEmail] = useState('');
    const [testing, setTesting] = useState(false);

    if (!isOpen) return null;

    const handleCopyCode = () => {
        navigator.clipboard.writeText(APPS_SCRIPT_CODE);
        toast.success('คัดลอกโค้ด Google Apps Script แล้ว!');
    };

    const handleSave = (e) => {
        e.preventDefault();
        const trimmed = webhookUrl.trim();
        if (trimmed) {
            localStorage.setItem('smo_notification_webhook', trimmed);
            toast.success('บันทึกการตั้งค่า Webhook เรียบร้อยแล้ว!');
        } else {
            localStorage.removeItem('smo_notification_webhook');
            toast.info('ลบการตั้งค่า Webhook เรียบร้อยแล้ว');
        }
        onClose();
    };

    const handleTestSend = async () => {
        if (!webhookUrl.trim()) {
            toast.warning('กรุณากรอก Webhook URL ก่อนทดสอบ');
            return;
        }
        if (!testEmail.trim()) {
            toast.warning('กรุณากรอกอีเมลปลายทางที่ต้องการทดสอบ');
            return;
        }

        setTesting(true);
        try {
            await fetch(webhookUrl.trim(), {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: testEmail.trim(),
                    subject: '[ทดสอบระบบ] สโมสรนิสิต คณะวิทยาศาสตร์และนวัตกรรมดิจิทัล',
                    body: `นี่คืออีเมลทดสอบจากระบบยืม-คืนครุภัณฑ์ สโมสรนิสิต\nส่งออกจาก: ${OFFICIAL_SENDER_EMAIL}\nเวลา: ${new Date().toLocaleString('th-TH')}`
                })
            });
            toast.success(`ส่งคำขอทดสอบไปยัง ${testEmail.trim()} แล้ว! กรุณาเช็คกล่องข้อความ`);
        } catch (err) {
            console.error('Test send error:', err);
            toast.error('ไม่สามารถส่งอีเมลทดสอบได้ กรุณาตรวจสอบ URL');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>⚙️ ตั้งค่าระบบส่งอีเมลอัตโนมัติ (Google Apps Script)</h3>
                    <button className="modal-close" onClick={onClose} aria-label="ปิด">×</button>
                </div>
                <div className="modal-body">
                    <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
                        <div>
                            <strong>📧 อีเมลผู้ส่งของสโมสร:</strong> <code>{OFFICIAL_SENDER_EMAIL}</code><br />
                            <small>เมื่อตั้งค่าเสร็จ ระบบจะส่งอีเมลแจ้งเตือนออกจากบัญชีนี้ไปยัง <code>รหัสนิสิต@tsu.ac.th</code> อัตโนมัติทันทีที่อนุมัติ/ปฏิเสธ/คืน</small>
                        </div>
                    </div>

                    <div className="setup-steps">
                        <h4>📋 ขั้นตอนการเปิดใช้งาน (ทำครั้งเดียว 2 นาที):</h4>
                        <ol style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: '1.6' }}>
                            <li>
                                ล็อกอินเข้า <strong>{OFFICIAL_SENDER_EMAIL}</strong> แล้วเปิด{' '}
                                <a
                                    href="https://script.google.com"
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: 'var(--primary)', fontWeight: 600 }}
                                >
                                    Google Apps Script (คลิกที่นี่)
                                </a>
                            </li>
                            <li>กดปุ่ม <strong>"โครงการใหม่" (New Project)</strong></li>
                            <li>
                                ลบโค้ดเดิมออกทั้งหมด แล้ววางโค้ดด้านล่างนี้ลงไป:
                                <div style={{ margin: '0.5rem 0' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={handleCopyCode}
                                    >
                                        📋 คัดลอกโค้ด Apps Script
                                    </button>
                                </div>
                            </li>
                            <li>กด <strong>ทำให้ใช้งานได้ (Deploy)</strong> ➔ <strong>รายการทำให้ใช้งานได้ใหม่ (New deployment)</strong></li>
                            <li>เลือกประเภทเป็น <strong>เว็บแอป (Web app)</strong></li>
                            <li>
                                ตั้งค่า:
                                <ul style={{ marginTop: '0.25rem' }}>
                                    <li>เรียกใช้ในฐานะ (Execute as): <strong>ฉัน ({OFFICIAL_SENDER_EMAIL})</strong></li>
                                    <li>ผู้มีสิทธิ์เข้าถึง (Who has access): <strong>ทุกคน (Anyone)</strong></li>
                                </ul>
                            </li>
                            <li>กด <strong>ทำให้ใช้งานได้</strong> ➔ คัดลอก <strong>URL ของเว็บแอป (Web App URL)</strong> มาวางในช่องด้านล่าง</li>
                        </ol>
                    </div>

                    <form onSubmit={handleSave} style={{ marginTop: '1.25rem' }}>
                        <div className="form-group">
                            <label className="form-label">
                                🔗 Web App URL ของ Google Apps Script:
                            </label>
                            <input
                                type="url"
                                className="form-input"
                                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                                value={webhookUrl}
                                onChange={e => setWebhookUrl(e.target.value)}
                            />
                        </div>

                        <div className="form-group" style={{ background: 'var(--bg-light)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                            <label className="form-label" style={{ marginBottom: '0.4rem' }}>
                                🧪 ทดสอบส่งอีเมล:
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="email"
                                    className="form-input form-input-sm"
                                    placeholder="ใส่อีเมลของคุณเพื่อทดสอบ..."
                                    value={testEmail}
                                    onChange={e => setTestEmail(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={handleTestSend}
                                    disabled={testing || !webhookUrl.trim() || !testEmail.trim()}
                                >
                                    {testing ? '⏳ กำลังส่ง...' : '🚀 ทดสอบส่ง'}
                                </button>
                            </div>
                        </div>

                        <div className="modal-footer" style={{ marginTop: '1.5rem', padding: 0, border: 'none', background: 'transparent' }}>
                            <button type="button" className="btn btn-secondary" onClick={onClose}>
                                ปิด
                            </button>
                            <button type="submit" className="btn btn-success">
                                💾 บันทึกการตั้งค่า
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
