import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Results() {
    const [submissions, setSubmissions] = useState([]);
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedExam, setSelectedExam] = useState(null);

    useEffect(() => {
        loadExams();
    }, []);

    useEffect(() => {
        loadSubmissions();
    }, [selectedExam]);

    const loadExams = async () => {
        try {
            const data = await api.getExams();
            setExams(data);
        } catch (err) {
            console.error('Failed to load exams:', err);
        }
    };

    const loadSubmissions = async () => {
        setLoading(true);
        try {
            const data = await api.getSubmissions(selectedExam);
            setSubmissions(data);
        } catch (err) {
            console.error('Failed to load submissions:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async (format) => {
        try {
            await api.exportSubmissions(selectedExam, format);
        } catch (err) {
            alert('Export failed: ' + err.message);
        }
    };

    const handleDeleteSubmission = async (id, studentName) => {
        if (!confirm(`Delete submission for ${studentName}?\n\nThis will also remove their session data.`)) return;
        try {
            await api.deleteSubmission(id);
            loadSubmissions();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString();
    };

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2>Results</h2>
                    <p>View and export exam submissions</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                    <button className="btn btn-secondary" onClick={() => handleExport('xlsx')}>
                        📊 Export Excel
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleExport('csv')}>
                        📄 Export CSV
                    </button>
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Submissions</div>
                    <div className="stat-value">{submissions.length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Average Score</div>
                    <div className="stat-value success">
                        {submissions.length > 0
                            ? (submissions.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0) / submissions.length).toFixed(1) + '%'
                            : '-'
                        }
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Passed (≥50%)</div>
                    <div className="stat-value">
                        {submissions.filter(s => parseFloat(s.percentage) >= 50).length}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Disqualified</div>
                    <div className="stat-value danger">
                        {submissions.filter(s => s.session_status === 'DISQUALIFIED').length}
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Submissions</h3>
                </div>

                {loading ? (
                    <p>Loading...</p>
                ) : submissions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📋</div>
                        <p>No submissions yet</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Student ID</th>
                                    <th>Name</th>
                                    <th>Exam</th>
                                    <th>Score</th>
                                    <th>Percentage</th>
                                    <th>Violations</th>
                                    <th>Status</th>
                                    <th>Submitted</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map(sub => (
                                    <tr key={sub.id}>
                                        <td><strong>{sub.student_id}</strong></td>
                                        <td>{sub.student_name}</td>
                                        <td>{sub.exam_title || sub.exam_code}</td>
                                        <td>{sub.score} / {sub.max_score}</td>
                                        <td>
                                            <span className={`badge ${parseFloat(sub.percentage) >= 70 ? 'badge-success' :
                                                parseFloat(sub.percentage) >= 50 ? 'badge-warning' :
                                                    'badge-danger'
                                                }`}>
                                                {parseFloat(sub.percentage).toFixed(1)}%
                                            </span>
                                        </td>
                                        <td>{sub.violation_count}</td>
                                        <td>
                                            <span className={`badge ${sub.session_status === 'SUBMITTED' ? 'badge-success' :
                                                sub.session_status === 'DISQUALIFIED' ? 'badge-danger' :
                                                    'badge-secondary'
                                                }`}>
                                                {sub.session_status}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.875rem' }}>{formatDate(sub.submitted_at)}</td>
                                        <td>
                                            <button
                                                className="btn btn-sm btn-danger"
                                                onClick={() => handleDeleteSubmission(sub.id, sub.student_name)}
                                                title="Delete Submission"
                                            >
                                                🗑️
                                            </button>
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

