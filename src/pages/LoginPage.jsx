import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, user } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    useEffect(() => {
        if (user) {
            navigate('/admin');
        }
    }, [user, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(email, password);
            toast.success('เข้าสู่ระบบผู้ดูแลสำเร็จ!');
            navigate('/admin');
        } catch (err) {
            console.error('Login error:', err);
            setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
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
