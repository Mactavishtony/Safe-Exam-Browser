require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./database');

async function seed() {
    try {
        console.log('Seeding database with initial data...');

        // Create admin user
        const adminPassword = await bcrypt.hash('admin123', 10);
        await pool.query(`
      INSERT INTO users (student_id, name, email, password_hash, role)
      VALUES ('ADMIN001', 'System Administrator', 'admin@example.com', $1, 'ADMIN')
      ON CONFLICT (email) DO NOTHING
    `, [adminPassword]);

        // Create sample students
        const studentPassword = await bcrypt.hash('student123', 10);
        const students = [
            { id: 'STU001', name: 'John Doe', email: 'john@example.com' },
            { id: 'STU002', name: 'Jane Smith', email: 'jane@example.com' },
            { id: 'STU003', name: 'Bob Wilson', email: 'bob@example.com' }
        ];

        for (const student of students) {
            await pool.query(`
        INSERT INTO users (student_id, name, email, password_hash, role)
        VALUES ($1, $2, $3, $4, 'STUDENT')
        ON CONFLICT (email) DO NOTHING
      `, [student.id, student.name, student.email, studentPassword]);
        }

        // Get admin ID for exam creation
        const adminResult = await pool.query(
            "SELECT id FROM users WHERE email = 'admin@example.com'"
        );
        const adminId = adminResult.rows[0]?.id;

        if (adminId) {
            // Create sample exam
            const examResult = await pool.query(`
        INSERT INTO exams (exam_code, title, description, duration_minutes, max_violations, is_active, created_by)
        VALUES ('DEMO2025', 'Demo Examination', 'A sample exam for testing the system', 60, 3, true, $1)
        ON CONFLICT (exam_code) DO UPDATE SET is_active = true
        RETURNING id
      `, [adminId]);

            const examId = examResult.rows[0]?.id;

            if (examId) {
                // Add sample questions
                const questions = [
                    {
                        text: 'What is the capital of France?',
                        options: ['London', 'Berlin', 'Paris', 'Madrid'],
                        answer: 'Paris',
                        marks: 1
                    },
                    {
                        text: 'Which programming language is known for its use in web browsers?',
                        options: ['Python', 'JavaScript', 'C++', 'Java'],
                        answer: 'JavaScript',
                        marks: 1
                    },
                    {
                        text: 'What is 2 + 2?',
                        options: ['3', '4', '5', '6'],
                        answer: '4',
                        marks: 1
                    },
                    {
                        text: 'Which planet is known as the Red Planet?',
                        options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
                        answer: 'Mars',
                        marks: 1
                    },
                    {
                        text: 'What is the largest ocean on Earth?',
                        options: ['Atlantic Ocean', 'Indian Ocean', 'Pacific Ocean', 'Arctic Ocean'],
                        answer: 'Pacific Ocean',
                        marks: 1
                    }
                ];

                // Clear existing questions for this exam
                await pool.query('DELETE FROM questions WHERE exam_id = $1', [examId]);

                for (let i = 0; i < questions.length; i++) {
                    const q = questions[i];
                    await pool.query(`
            INSERT INTO questions (exam_id, question_text, question_type, options, correct_answer, marks, order_index)
            VALUES ($1, $2, 'MCQ', $3, $4, $5, $6)
          `, [examId, q.text, JSON.stringify(q.options), q.answer, q.marks, i + 1]);
                }
            }
        }

        console.log('✓ Database seeded successfully');
        console.log('\nTest Credentials:');
        console.log('  Admin: admin@example.com / admin123');
        console.log('  Student: john@example.com / student123 (ID: STU001)');
        console.log('\nTest Exam Code: DEMO2025');

        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
}

seed();
