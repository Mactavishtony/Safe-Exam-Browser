import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { socketService } from '../services/socket';

export default function Monitor() {
    const [sessions, setSessions] = useState([]);
    const [violations, setViolations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedExam, setSelectedExam] = useState(null);
    const [exams, setExams] = useState([]);
    const [snapshots, setSnapshots] = useState({});  // sessionId -> {image, timestamp, studentName}
    const [selectedSnapshot, setSelectedSnapshot] = useState(null);  // For enlarged view

    useEffect(() => {
        // Ensure socket is connected
        socketService.connect();

        loadExams();
        loadSessions();

        // Socket event listeners
        const unsubConnect = socketService.on('student:connected', (data) => {
            console.log('[Monitor] Student connected:', data);
            setSessions(prev => {
                const exists = prev.find(s => s.id === data.sessionId);
                if (!exists) {
                    loadSessions();
                }
                return prev;
            });
            addViolation({ type: 'CONNECTED', ...data, icon: '🟢' });
        });

        const unsubDisconnect = socketService.on('student:disconnected', (data) => {
            console.log('[Monitor] Student disconnected:', data);
            setSessions(prev => prev.map(s =>
                s.id === data.sessionId ? { ...s, status: 'DISCONNECTED', isOnline: false } : s
            ));
            addViolation({ type: 'DISCONNECTED', ...data, icon: '🔴' });
        });

        const unsubViolation = socketService.on('violation:new', (data) => {
            console.log('[Monitor] New violation:', data);
            setSessions(prev => prev.map(s =>
                s.id === data.sessionId ? { ...s, violation_count: data.violationCount } : s
            ));
            addViolation({ ...data, icon: '⚠️' });
        });

        const unsubHeartbeat = socketService.on('student:heartbeat', (data) => {
            setSessions(prev => prev.map(s =>
                s.id === data.sessionId ? { ...s, time_remaining_seconds: data.timeRemaining, isOnline: true } : s
            ));
        });

        const unsubDisqualified = socketService.on('student:disqualified', (data) => {
            console.log('[Monitor] Student disqualified:', data);
            setSessions(prev => prev.map(s =>
                s.id === data.sessionId ? { ...s, status: 'DISQUALIFIED' } : s
            ));
            addViolation({ ...data, type: 'DISQUALIFIED', icon: '❌' });
        });

        // Handle camera snapshots
        const unsubSnapshot = socketService.on('student:snapshot', (data) => {
            setSnapshots(prev => ({
                ...prev,
                [data.sessionId]: {
                    image: data.image,
                    timestamp: data.timestamp,
                    studentName: data.studentName,
                    studentId: data.studentId
                }
            }));
        });

        // Refresh sessions every 30 seconds
        const interval = setInterval(loadSessions, 30000);

        return () => {
            unsubConnect();
            unsubDisconnect();
            unsubViolation();
            unsubHeartbeat();
            unsubDisqualified();
            unsubSnapshot();
            clearInterval(interval);
        };
    }, [selectedExam]);

    const loadExams = async () => {
        try {
            const data = await api.getExams();
            setExams(data.filter(e => e.is_active));
        } catch (err) {
            console.error('Failed to load exams:', err);
        }
    };

    const loadSessions = async () => {
        try {
            const data = await api.getLiveSessions(selectedExam);
            setSessions(data);
        } catch (err) {
            console.error('Failed to load sessions:', err);
        } finally {
            setLoading(false);
        }
    };

    const addViolation = (event) => {
        setViolations(prev => [
            { ...event, id: Date.now(), time: new Date().toLocaleTimeString() },
            ...prev.slice(0, 49)
        ]);
    };

    const handleWarn = (sessionId) => {
        const message = prompt('Warning message:');
        if (message) {
            socketService.warnStudent(sessionId, message);
        }
    };

    const handleForceSubmit = (sessionId) => {
        if (confirm('Force submit this student\'s exam?')) {
            socketService.forceSubmit(sessionId);
        }
    };

    const handleDisqualify = (sessionId) => {
        const reason = prompt('Reason for disqualification:');
        if (reason) {
            socketService.disqualifyStudent(sessionId, reason);
        }
    };

    const formatTime = (seconds) => {
        if (!seconds) return '--:--';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2>Live Monitor</h2>
                    <p>Real-time exam supervision</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <select
                        className="form-select"
                        style={{ width: 'auto' }}
                        value={selectedExam || ''}
                        onChange={e => setSelectedExam(e.target.value || null)}
                    >
                        <option value="">All Exams</option>
                        {exams.map(exam => (
                            <option key={exam.id} value={exam.id}>{exam.title}</option>
                        ))}
                    </select>
                    <div className="live-indicator">
                        <span className="live-dot"></span>
                        <span>Live</span>
                    </div>
                </div>
            </div>

            {/* Camera Snapshots Grid */}
            {Object.keys(snapshots).length > 0 && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-header">
                        <h3 className="card-title">📷 Live Camera Feeds ({Object.keys(snapshots).length})</h3>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '1rem',
                        padding: '1rem'
                    }}>
                        {Object.entries(snapshots).map(([sessionId, snap]) => (
                            <div
                                key={sessionId}
                                style={{
                                    position: 'relative',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    border: '2px solid var(--border-color)',
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s, box-shadow 0.2s'
                                }}
                                onClick={() => setSelectedSnapshot(snap)}
                                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <img
                                    src={snap.image}
                                    alt={snap.studentName}
                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                />
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                                    color: 'white',
                                    padding: '0.5rem',
                                    fontSize: '0.75rem'
                                }}>
                                    <div style={{ fontWeight: 'bold' }}>{snap.studentName}</div>
                                    <div style={{ opacity: 0.7 }}>
                                        {new Date(snap.timestamp).toLocaleTimeString()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem' }}>
                {/* Sessions Table */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Active Sessions ({sessions.length})</h3>
                    </div>

                    {loading ? (
                        <p>Loading...</p>
                    ) : sessions.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">👥</div>
                            <p>No active sessions</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Exam</th>
                                        <th>Time Left</th>
                                        <th>Violations</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map(session => (
                                        <tr key={session.id}>
                                            <td>
                                                <div>
                                                    <strong>{session.student_name}</strong>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {session.student_id}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{session.exam_title}</td>
                                            <td style={{ fontFamily: 'monospace' }}>
                                                {formatTime(session.time_remaining_seconds)}
                                            </td>
                                            <td>
                                                <span className={`badge ${session.violation_count >= session.max_violations ? 'badge-danger' : session.violation_count > 0 ? 'badge-warning' : 'badge-success'}`}>
                                                    {session.violation_count} / {session.max_violations}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge ${session.status === 'ACTIVE' && session.isOnline ? 'badge-success' :
                                                    session.status === 'DISCONNECTED' ? 'badge-warning' :
                                                        session.status === 'DISQUALIFIED' ? 'badge-danger' :
                                                            'badge-secondary'
                                                    }`}>
                                                    {session.status === 'ACTIVE' && session.isOnline ? 'Online' : session.status}
                                                </span>
                                            </td>
                                            <td>
                                                {session.status === 'ACTIVE' && (
                                                    <div className="btn-group">
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={() => handleWarn(session.id)}
                                                            title="Send warning"
                                                        >
                                                            ⚠️
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={() => handleForceSubmit(session.id)}
                                                            title="Force submit"
                                                        >
                                                            📤
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-danger"
                                                            onClick={() => handleDisqualify(session.id)}
                                                            title="Disqualify"
                                                        >
                                                            ❌
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Alerts Panel */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Live Alerts</h3>
                    </div>

                    {violations.length === 0 ? (
                        <div className="empty-state">
                            <p>No alerts yet</p>
                        </div>
                    ) : (
                        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                            {violations.map(v => (
                                <div key={v.id} className="alert-item">
                                    <span className="alert-icon">{v.icon}</span>
                                    <div className="alert-content">
                                        <div className="alert-title">
                                            {v.studentName} - {v.eventType || v.type}
                                        </div>
                                        <div className="alert-time">{v.time}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Enlarged Snapshot Modal */}
            {selectedSnapshot && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        cursor: 'pointer'
                    }}
                    onClick={() => setSelectedSnapshot(null)}
                >
                    <div style={{
                        background: 'var(--card-bg)',
                        borderRadius: '12px',
                        padding: '1rem',
                        maxWidth: '90vw',
                        maxHeight: '90vh'
                    }}>
                        <div style={{ marginBottom: '0.5rem', color: 'var(--text-color)' }}>
                            <strong>{selectedSnapshot.studentName}</strong>
                            <span style={{ marginLeft: '1rem', opacity: 0.7 }}>
                                {new Date(selectedSnapshot.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                        <img
                            src={selectedSnapshot.image}
                            alt={selectedSnapshot.studentName}
                            style={{
                                maxWidth: '100%',
                                maxHeight: 'calc(90vh - 60px)',
                                borderRadius: '8px'
                            }}
                        />
                        <div style={{
                            marginTop: '0.5rem',
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            fontSize: '0.875rem'
                        }}>
                            Click anywhere to close
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
