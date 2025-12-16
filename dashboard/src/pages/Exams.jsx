import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Exams() {
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingExam, setEditingExam] = useState(null);
    const [showQuestions, setShowQuestions] = useState(null);

    useEffect(() => {
        loadExams();
    }, []);

    const loadExams = async () => {
        try {
            const data = await api.getExams();
            setExams(data);
        } catch (err) {
            console.error('Failed to load exams:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStatus = async (id) => {
        try {
            await api.toggleExamStatus(id);
            loadExams();
        } catch (err) {
            alert('Failed to toggle exam status');
        }
    };

    const handleDelete = async (id, sessionCount = 0) => {
        let confirmMsg = 'Are you sure you want to delete this exam?';
        let forceDelete = false;

        if (sessionCount > 0) {
            confirmMsg = `This exam has ${sessionCount} session(s). Delete all data including submissions?\n\nThis action cannot be undone.`;
            forceDelete = true;
        }

        if (!confirm(confirmMsg)) return;

        try {
            await api.deleteExam(id, forceDelete);
            loadExams();
        } catch (err) {
            // If error contains sessionCount, offer force delete
            if (err.message.includes('existing sessions')) {
                if (confirm('Exam has sessions. Force delete all data?')) {
                    await api.deleteExam(id, true);
                    loadExams();
                }
            } else {
                alert(err.message);
            }
        }
    };

    const openCreate = () => {
        setEditingExam(null);
        setShowModal(true);
    };

    const openEdit = (exam) => {
        setEditingExam(exam);
        setShowModal(true);
    };

    const handleSave = async (examData) => {
        try {
            if (editingExam) {
                await api.updateExam(editingExam.id, examData);
            } else {
                await api.createExam(examData);
            }
            setShowModal(false);
            loadExams();
        } catch (err) {
            alert(err.message);
        }
    };

    if (loading) {
        return <div className="page">Loading...</div>;
    }

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2>Exams</h2>
                    <p>Manage your exams and questions</p>
                </div>
                <button className="btn btn-primary" onClick={openCreate}>
                    + Create Exam
                </button>
            </div>

            {exams.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-icon">📝</div>
                        <p>No exams yet. Create your first exam!</p>
                    </div>
                </div>
            ) : (
                <div className="card">
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Title</th>
                                    <th>Duration</th>
                                    <th>Questions</th>
                                    <th>Sessions</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exams.map(exam => (
                                    <tr key={exam.id}>
                                        <td><strong>{exam.exam_code}</strong></td>
                                        <td>{exam.title}</td>
                                        <td>{exam.duration_minutes} min</td>
                                        <td>{exam.question_count || 0}</td>
                                        <td>{exam.session_count || 0}</td>
                                        <td>
                                            <span className={`badge ${exam.is_active ? 'badge-success' : 'badge-secondary'}`}>
                                                {exam.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="btn-group">
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => setShowQuestions(exam)}
                                                >
                                                    Questions
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => openEdit(exam)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className={`btn btn-sm ${exam.is_active ? 'btn-danger' : 'btn-primary'}`}
                                                    onClick={() => handleToggleStatus(exam.id)}
                                                >
                                                    {exam.is_active ? 'Stop' : 'Start'}
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => handleDelete(exam.id, exam.session_count || 0)}
                                                    title="Delete Exam"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showModal && (
                <ExamModal
                    exam={editingExam}
                    onSave={handleSave}
                    onClose={() => setShowModal(false)}
                />
            )}

            {showQuestions && (
                <QuestionsModal
                    exam={showQuestions}
                    onClose={() => {
                        setShowQuestions(null);
                        loadExams();
                    }}
                />
            )}
        </div>
    );
}

function ExamModal({ exam, onSave, onClose }) {
    const [formData, setFormData] = useState({
        examCode: exam?.exam_code || '',
        title: exam?.title || '',
        description: exam?.description || '',
        durationMinutes: exam?.duration_minutes || 60,
        maxViolations: exam?.max_violations || 3,
        shuffleQuestions: exam?.shuffle_questions ?? true,
        shuffleOptions: exam?.shuffle_options ?? true
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h3 className="modal-title">{exam ? 'Edit Exam' : 'Create Exam'}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Exam Code</label>
                        <input
                            type="text"
                            className="form-input"
                            value={formData.examCode}
                            onChange={e => setFormData({ ...formData, examCode: e.target.value })}
                            placeholder="EXAM2025"
                            required
                            disabled={!!exam}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Title</label>
                        <input
                            type="text"
                            className="form-input"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Final Examination"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Description</label>
                        <textarea
                            className="form-textarea"
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Optional description..."
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="form-label">Duration (minutes)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={formData.durationMinutes}
                                onChange={e => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) })}
                                min="1"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Max Violations</label>
                            <input
                                type="number"
                                className="form-input"
                                value={formData.maxViolations}
                                onChange={e => setFormData({ ...formData, maxViolations: parseInt(e.target.value) })}
                                min="1"
                                required
                            />
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function QuestionsModal({ exam, onClose }) {
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);

    useEffect(() => {
        loadQuestions();
    }, []);

    const loadQuestions = async () => {
        try {
            const data = await api.getExam(exam.id);
            setQuestions(data.questions || []);
        } catch (err) {
            console.error('Failed to load questions:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddQuestion = async (questionData) => {
        try {
            await api.addQuestion(exam.id, questionData);
            setShowAdd(false);
            loadQuestions();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDeleteQuestion = async (id) => {
        if (!confirm('Delete this question?')) return;
        try {
            await api.deleteQuestion(id);
            loadQuestions();
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '700px' }}>
                <div className="modal-header">
                    <h3 className="modal-title">Questions - {exam.title}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
                        + Add Question
                    </button>
                </div>

                {loading ? (
                    <p>Loading...</p>
                ) : questions.length === 0 ? (
                    <div className="empty-state">
                        <p>No questions yet</p>
                    </div>
                ) : (
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {questions.map((q, i) => (
                            <div key={q.id} style={{
                                padding: '1rem',
                                background: 'var(--bg-card)',
                                borderRadius: '8px',
                                marginBottom: '0.5rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <strong>Q{i + 1}. {q.question_text}</strong>
                                    <button
                                        className="btn btn-sm btn-danger"
                                        onClick={() => handleDeleteQuestion(q.id)}
                                    >
                                        Delete
                                    </button>
                                </div>
                                {q.options && (
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                        {q.options.map((opt, j) => (
                                            <div key={j} style={{
                                                color: opt === q.correct_answer ? 'var(--success)' : 'inherit'
                                            }}>
                                                {String.fromCharCode(65 + j)}. {opt} {opt === q.correct_answer && '✓'}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {showAdd && (
                    <AddQuestionForm
                        onSave={handleAddQuestion}
                        onCancel={() => setShowAdd(false)}
                    />
                )}
            </div>
        </div>
    );
}

function AddQuestionForm({ onSave, onCancel }) {
    const [formData, setFormData] = useState({
        questionText: '',
        options: ['', '', '', ''],
        correctAnswer: '',
        marks: 1
    });

    const handleOptionChange = (index, value) => {
        const newOptions = [...formData.options];
        newOptions[index] = value;
        setFormData({ ...formData, options: newOptions });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const options = formData.options.filter(o => o.trim());
        if (options.length < 2) {
            alert('Please add at least 2 options');
            return;
        }
        onSave({
            ...formData,
            options
        });
    };

    return (
        <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-card)', borderRadius: '8px' }}>
            <h4 style={{ marginBottom: '1rem' }}>Add Question</h4>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label className="form-label">Question</label>
                    <textarea
                        className="form-textarea"
                        value={formData.questionText}
                        onChange={e => setFormData({ ...formData, questionText: e.target.value })}
                        required
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Options</label>
                    {formData.options.map((opt, i) => (
                        <input
                            key={i}
                            type="text"
                            className="form-input"
                            value={opt}
                            onChange={e => handleOptionChange(i, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + i)}`}
                            style={{ marginBottom: '0.5rem' }}
                        />
                    ))}
                </div>

                <div className="form-group">
                    <label className="form-label">Correct Answer</label>
                    <select
                        className="form-select"
                        value={formData.correctAnswer}
                        onChange={e => setFormData({ ...formData, correctAnswer: e.target.value })}
                        required
                    >
                        <option value="">Select correct answer</option>
                        {formData.options.filter(o => o).map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                        ))}
                    </select>
                </div>

                <div className="btn-group">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm">Add</button>
                </div>
            </form>
        </div>
    );
}
