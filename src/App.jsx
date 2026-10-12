import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import UserPage from './pages/UserPage';
import StatusCheckPage from './pages/StatusCheckPage';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';

// Route Guard สำหรับหน้าผู้ดูแลระบบ
function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="loading" style={{ height: '100vh' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/admin/login" replace />;
    }

    return children;
}

export default function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    <Routes>
                        {/* หน้าหลักสำหรับนิสิต */}
                        <Route path="/" element={<UserPage />} />

                        {/* หน้าตรวจสอบสถานะการยืม */}
                        <Route path="/check-status" element={<StatusCheckPage />} />

                        {/* หน้าเข้าสู่ระบบผู้ดูแล */}
                        <Route path="/admin/login" element={<LoginPage />} />

                        {/* แผงควบคุมผู้ดูแล (Protected) */}
                        <Route
                            path="/admin"
                            element={
                                <ProtectedRoute>
                                    <AdminDashboard />
                                </ProtectedRoute>
                            }
                        />

                        {/* เส้นทางที่ไม่พบ ให้ย้อนกลับหน้าแรก */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </ToastProvider>
        </AuthProvider>
    );
}
