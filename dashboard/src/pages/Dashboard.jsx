import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalExams: 0,
        activeExams: 0,
        activeStudents: 0,
        totalSubmissions: 0
    });
    const [recentExams, setRecentExams] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            const exams = await api.getExams();
            const submissions = await api.getSubmissions();

            setStats({
                totalExams: exams.length,
                activeExams: exams.filter(e => e.is_active).length,
                activeStudents: exams.reduce((sum, e) => sum + (e.session_count || 0), 0),
                totalSubmissions: submissions.length
            });

            setRecentExams(exams.slice(0, 5));
        } catch (err) {
            console.error('Failed to load dashboard:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="page">Loading...</div>;
    }

    return (
        <div className="page">
            <div className="page-header">
                <h2>Dashboard</h2>
                <p>Overview of your exam system</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Exams</div>
                    <div className="stat-value">{stats.totalExams}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Active Exams</div>
                    <div className="stat-value success">{stats.activeExams}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Sessions</div>
                    <div className="stat-value">{stats.activeStudents}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Submissions</div>
                    <div className="stat-value">{stats.totalSubmissions}</div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Recent Exams</h3>
                </div>

                {recentExams.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📝</div>
                        <p>No exams created yet</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Exam Code</th>
                                    <th>Title</th>
                                    <th>Questions</th>
                                    <th>Duration</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentExams.map(exam => (
                                    <tr key={exam.id}>
                                        <td><strong>{exam.exam_code}</strong></td>
                                        <td>{exam.title}</td>
                                        <td>{exam.question_count || 0}</td>
                                        <td>{exam.duration_minutes} min</td>
                                        <td>
                                            <span className={`badge ${exam.is_active ? 'badge-success' : 'badge-secondary'}`}>
                                                {exam.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
