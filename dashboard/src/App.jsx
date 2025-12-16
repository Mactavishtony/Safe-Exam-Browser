import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from './services/api';
import { socketService } from './services/socket';

// Pages
import Dashboard from './pages/Dashboard';
import Exams from './pages/Exams';
import Monitor from './pages/Monitor';
import Results from './pages/Results';
import Login from './components/Login';

function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            if (api.getToken()) {
                const data = await api.verifyToken();
                setUser(data.user);
                socketService.connect();
            }
        } catch {
            api.logout();
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = (userData) => {
        setUser(userData);
        socketService.connect();
    };

    const handleLogout = () => {
        api.logout();
        socketService.disconnect();
        setUser(null);
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <div>Loading...</div>
            </div>
        );
    }

    if (!user) {
        return <Login onLogin={handleLogin} />;
    }

    return (
        <BrowserRouter>
            <div className="app">
                <Sidebar user={user} onLogout={handleLogout} />
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/exams" element={<Exams />} />
                        <Route path="/monitor" element={<Monitor />} />
                        <Route path="/results" element={<Results />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}

function Sidebar({ user, onLogout }) {
    const location = useLocation();

    const navItems = [
        { path: '/', icon: '📊', label: 'Dashboard' },
        { path: '/exams', icon: '📝', label: 'Exams' },
        { path: '/monitor', icon: '👁', label: 'Live Monitor' },
        { path: '/results', icon: '📈', label: 'Results' }
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <h1>Safe Exam</h1>
                <span>Admin Dashboard</span>
            </div>

            <nav className="sidebar-nav">
                {navItems.map(item => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="user-info">
                    <div className="user-avatar">
                        {user.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-details">
                        <div className="user-name">{user.name}</div>
                        <div className="user-role">{user.role}</div>
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '1rem', width: '100%' }}
                >
                    Logout
                </button>
            </div>
        </aside>
    );
}

export default App;
