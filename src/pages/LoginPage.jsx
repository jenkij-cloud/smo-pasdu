import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [lockoutSeconds, setLockoutSeconds] = useState(0);
    const { login, user } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    useEffect(() => {
        if (user) {
            navigate('/admin');
        }
    }, [user, navigate]);

    // ตรวจสอบ Lockout จากการกรอกรหัสผ่านผิดหลายครั้ง
    useEffect(() => {
        const lockoutUntil = localStorage.getItem('smo_login_lockout_until');
        if (lockoutUntil) {
            const remaining = Math.ceil((parseInt(lockoutUntil, 10) - Date.now()) / 1000);
            if (remaining > 0) {
                setLockoutSeconds(remaining);
            } else {
                localStorage.removeItem('smo_login_lockout_until');
                localStorage.removeItem('smo_login_fail_count');
            }
        }
    }, []);

    // นับถอยหลังเมื่อติด Lockout
    useEffect(() => {
        if (lockoutSeconds <= 0) return;
        const timer = setInterval(() => {
            setLockoutSeconds(prev => {
                if (prev <= 1) {
                    localStorage.removeItem('smo_login_lockout_until');
                    localStorage.removeItem('smo_login_fail_count');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [lockoutSeconds]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (lockoutSeconds > 0) {
            setError(`🛡️ ระบบระงับการเข้าสู่ระบบชั่วคราว กรุณารอ ${lockoutSeconds} วินาที`);
            return;
        }

        setError('');
        setLoading(true);

        try {
            await login(email.trim(), password);
            localStorage.removeItem('smo_login_fail_count');
            localStorage.removeItem('smo_login_lockout_until');
            toast.success('เข้าสู่ระบบผู้ดูแลสำเร็จ!');
            navigate('/admin');
        } catch (err) {
            console.error('Login error:', err);
            const currentFails = (parseInt(localStorage.getItem('smo_login_fail_count'), 10) || 0) + 1;
            localStorage.setItem('smo_login_fail_count', String(currentFails));

            if (currentFails >= 5) {
                const lockUntil = Date.now() + 60 * 1000; // ระงับ 60 วินาที
                localStorage.setItem('smo_login_lockout_until', String(lockUntil));
                setLockoutSeconds(60);
                setError('🛡️ คุณป้อนรหัสผ่านผิดเกิน 5 ครั้ง ระบบระงับการเข้าสู่ระบบ 60 วินาที เพื่อความปลอดภัย');
            } else {
                setError(`อีเมลหรือรหัสผ่านไม่ถูกต้อง (เหลือโอกาสลองอีก ${5 - currentFails} ครั้ง)`);
            }
            toast.error('เข้าสู่ระบบไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="logo-icon">🔐</div>
                    <h2>เข้าสู่ระบบผู้ดูแล</h2>
                    <p>ระบบยืม-คืนครุภัณฑ์ สโมสรนิสิต</p>
                </div>
                <form onSubmit={handleSubmit} className="login-body">
                    {error && (
                        <div className="alert alert-error">
                            ⚠️ {error}
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label">อีเมลผู้ดูแล</label>
                        <input
                            type="email"
                            className="form-input"
                            placeholder="admin@example.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">รหัสผ่าน</label>
                        <input
                            type="password"
                            className="form-input"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: '0.5rem' }}
                        disabled={loading}
                    >
                        {loading ? '⏳ กำลังเข้าสู่ระบบ...' : '🚀 เข้าสู่ระบบ'}
                    </button>
                </form>
                <div className="login-footer">
                    <Link to="/">← กลับสู่หน้าหลัก</Link>
                </div>
            </div>
        </div>
    );
}
