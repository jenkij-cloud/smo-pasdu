import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import logoSmo from '../logosmo.png';

export default function Header() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleLogout = async () => {
        try {
            await logout();
            setMobileMenuOpen(false);
            toast.info('ออกจากระบบเรียบร้อยแล้ว');
            navigate('/');
        } catch (error) {
            console.error('Logout error:', error);
            toast.error('เกิดข้อผิดพลาดในการออกจากระบบ');
        }
    };

    const isActive = (path) => location.pathname === path;

    return (
        <>
            <header className="header">
                <div className="header-content">
                    <Link
                        to="/"
                        className="header-logo"
                        onClick={() => setMobileMenuOpen(false)}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                        <img
                            src={logoSmo}
                            alt="Logo SMO"
                            className="logo-icon-img"
                        />
                        <div className="header-title">
                            <h1>ระบบยืม-คืนครุภัณฑ์</h1>
                            <p>สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล</p>
                        </div>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="header-nav desktop-nav">
                        <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
                            📦 รายการครุภัณฑ์
                        </Link>
                        <Link to="/check-status" className={`nav-link ${isActive('/check-status') ? 'active' : ''}`}>
                            📋 ตรวจสอบสถานะ
                        </Link>
                        {user ? (
                            <>
                                <Link to="/admin" className={`nav-link ${isActive('/admin') ? 'active' : ''}`}>
                                    📊 จัดการระบบ
                                </Link>
                                <button onClick={handleLogout} className="btn btn-warning btn-sm">
                                    🚪 ออกจากระบบ
                                </button>
                            </>
                        ) : (
                            <Link to="/admin/login" className="btn-admin">
                                🔐 เข้าสู่ระบบผู้ดูแล
                            </Link>
                        )}
                    </nav>

                    {/* Mobile Hamburger Button */}
                    <button
                        className="mobile-menu-btn"
                        onClick={() => setMobileMenuOpen(prev => !prev)}
                        aria-label="เมนู"
                    >
                        {mobileMenuOpen ? '✕' : '☰'}
                    </button>
                </div>

                {/* Mobile Drawer Menu */}
                {mobileMenuOpen && (
                    <div className="mobile-menu-drawer">
                        <Link
                            to="/"
                            className={`mobile-menu-item ${isActive('/') ? 'active' : ''}`}
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            <span className="menu-icon">📦</span>
                            <span>รายการครุภัณฑ์</span>
                        </Link>
                        <Link
                            to="/check-status"
                            className={`mobile-menu-item ${isActive('/check-status') ? 'active' : ''}`}
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            <span className="menu-icon">📋</span>
                            <span>ตรวจสอบสถานะ</span>
                        </Link>
                        {user ? (
                            <>
                                <Link
                                    to="/admin"
                                    className={`mobile-menu-item ${isActive('/admin') ? 'active' : ''}`}
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <span className="menu-icon">📊</span>
                                    <span>จัดการระบบ (ผู้ดูแล)</span>
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="mobile-menu-item mobile-logout-btn"
                                >
                                    <span className="menu-icon">🚪</span>
                                    <span>ออกจากระบบ</span>
                                </button>
                            </>
                        ) : (
                            <Link
                                to="/admin/login"
                                className="mobile-menu-item mobile-login-item"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                <span className="menu-icon">🔐</span>
                                <span>เข้าสู่ระบบผู้ดูแล</span>
                            </Link>
                        )}
                    </div>
                )}
            </header>

            {/* Mobile Bottom Navigation Bar (Thumb-friendly App Experience) */}
            <nav className="mobile-bottom-nav">
                <Link
                    to="/"
                    className={`bottom-nav-item ${isActive('/') ? 'active' : ''}`}
                >
                    <span className="bottom-nav-icon">📦</span>
                    <span className="bottom-nav-label">ครุภัณฑ์</span>
                </Link>

                <Link
                    to="/check-status"
                    className={`bottom-nav-item ${isActive('/check-status') ? 'active' : ''}`}
                >
                    <span className="bottom-nav-icon">📋</span>
                    <span className="bottom-nav-label">เช็คสถานะ</span>
                </Link>

                {user ? (
                    <Link
                        to="/admin"
                        className={`bottom-nav-item ${isActive('/admin') ? 'active' : ''}`}
                    >
                        <span className="bottom-nav-icon">📊</span>
                        <span className="bottom-nav-label">จัดการ</span>
                    </Link>
                ) : (
                    <Link
                        to="/admin/login"
                        className={`bottom-nav-item ${isActive('/admin/login') ? 'active' : ''}`}
                    >
                        <span className="bottom-nav-icon">🔐</span>
                        <span className="bottom-nav-label">ผู้ดูแล</span>
                    </Link>
                )}
            </nav>
        </>
    );
}
