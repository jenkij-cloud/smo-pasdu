import logoSmo from '../logosmo.png';

export default function LoadingScreen({
    message = 'กำลังโหลดรายการครุภัณฑ์...',
    submessage = 'สโมสรนิสิตคณะวิทยาศาสตร์และนวัตกรรมดิจิทัล'
}) {
    return (
        <div className="loading-screen-container">
            <div className="loading-content-card">
                {/* วงแหวนแสง Aura ด้านหลังโลโก้ */}
                <div className="loading-logo-wrapper">
                    <div className="loading-pulse-ring ring-1"></div>
                    <div className="loading-pulse-ring ring-2"></div>
                    
                    {/* ตัวโลโก้สโมสรฯ ลอยนุ่มนวล */}
                    <div className="loading-logo-box">
                        <img
                            src={logoSmo}
                            alt="สโมสรนิสิต วท.ด."
                            className="loading-smo-logo"
                        />
                    </div>
                </div>

                {/* ข้อความสถานะการโหลด */}
                <h3 className="loading-title">{message}</h3>
                {submessage && (
                    <p className="loading-subtitle">{submessage}</p>
                )}

                {/* แถบหลอดแก้ว Progress Bar ไล่เฉดสีวิ่งนุ่มๆ */}
                <div className="loading-bar-track">
                    <div className="loading-bar-shimmer"></div>
                </div>
            </div>
        </div>
    );
}

