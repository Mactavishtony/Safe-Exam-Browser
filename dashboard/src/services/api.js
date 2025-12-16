const API_BASE = '/api';

class ApiService {
    constructor() {
        this.token = localStorage.getItem('adminToken');
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('adminToken', token);
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('adminToken');
    }

    getToken() {
        return this.token;
    }

    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    }

    // Auth
    async login(email, password) {
        const data = await this.request('/auth/admin/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        this.setToken(data.token);
        return data;
    }

    async verifyToken() {
        return this.request('/auth/verify');
    }

    logout() {
        this.clearToken();
    }

    // Exams
    async getExams() {
        return this.request('/exams');
    }

    async getExam(id) {
        return this.request(`/exams/${id}`);
    }

    async createExam(examData) {
        return this.request('/exams', {
            method: 'POST',
            body: JSON.stringify(examData)
        });
    }

    async updateExam(id, examData) {
        return this.request(`/exams/${id}`, {
            method: 'PUT',
            body: JSON.stringify(examData)
        });
    }

    async toggleExamStatus(id) {
        return this.request(`/exams/${id}/toggle`, {
            method: 'POST'
        });
    }

    async deleteExam(id, force = false) {
        return this.request(`/exams/${id}${force ? '?force=true' : ''}`, {
            method: 'DELETE'
        });
    }

    async getExamStats(id) {
        return this.request(`/exams/${id}/stats`);
    }

    async getLiveSessions(examId = null) {
        const endpoint = examId ? `/exams/${examId}/live` : '/monitor/live';
        return this.request(endpoint);
    }

    // Questions
    async addQuestion(examId, questionData) {
        return this.request(`/questions/exam/${examId}`, {
            method: 'POST',
            body: JSON.stringify(questionData)
        });
    }

    async bulkAddQuestions(examId, questions) {
        return this.request(`/questions/exam/${examId}/bulk`, {
            method: 'POST',
            body: JSON.stringify({ questions })
        });
    }

    async updateQuestion(id, questionData) {
        return this.request(`/questions/${id}`, {
            method: 'PUT',
            body: JSON.stringify(questionData)
        });
    }

    async deleteQuestion(id) {
        return this.request(`/questions/${id}`, {
            method: 'DELETE'
        });
    }

    // Submissions
    async getSubmissions(examId = null) {
        const endpoint = examId ? `/submissions/exam/${examId}` : '/submissions';
        return this.request(endpoint);
    }

    async deleteSubmission(id) {
        return this.request(`/submissions/${id}`, {
            method: 'DELETE'
        });
    }

    async exportSubmissions(examId = null, format = 'xlsx') {
        const params = new URLSearchParams({ format });
        if (examId) params.append('examId', examId);

        const response = await fetch(`${API_BASE}/submissions/export?${params}`, {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Export failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `submissions.${format}`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // Students
    async registerStudent(studentData) {
        return this.request('/auth/register-student', {
            method: 'POST',
            body: JSON.stringify(studentData)
        });
    }
}

export const api = new ApiService();
export default api;
