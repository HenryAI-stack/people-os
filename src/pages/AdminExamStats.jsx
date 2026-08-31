import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import { listAllExams } from '../lib/exams'
import { listResultsForExam, summarizeExamResults, PASS_THRESHOLD } from '../lib/results'

const PASS_COLOR = '#5fd0a3'
const FAIL_COLOR = '#e5786d'
const CORRECT_COLOR = '#5fd0a3'
const WRONG_COLOR = '#e5786d'

export default function AdminExamStats() {
  const { examId } = useParams()
  const [exam, setExam] = useState(null)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const exams = await listAllExams()
        setExam(exams.find((e) => e.id === examId) || null)
        setResults(await listResultsForExam(examId))
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [examId])

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (!results) return <div className="page"><p>Loading …</p></div>

  const stats = summarizeExamResults(results)
  const totalAnswers = stats.totalCorrect + stats.totalWrong

  const attendanceData = [
    { name: 'Attended', value: stats.attendees, fill: 'var(--muted)' },
    { name: 'Passed', value: stats.passed, fill: PASS_COLOR },
    { name: 'Failed', value: stats.failed, fill: FAIL_COLOR },
  ]

  const answersData = [
    { name: 'Correct', value: stats.totalCorrect, fill: CORRECT_COLOR },
    { name: 'Wrong', value: stats.totalWrong, fill: WRONG_COLOR },
  ]

  return (
    <div className="page">
      <div className="admin-header">
        <h1>{exam ? exam.name : 'Exam'} — Overview</h1>
        <Link className="button" to="/admin/questions">Back to exams</Link>
      </div>

      <div className="stats-grid">
        <StatCard label="Attendees" value={stats.attendees} />
        <StatCard
          label="Passed"
          value={stats.passed}
          sub={`${Math.round(stats.passRate)}% pass rate (≥ ${Math.round(PASS_THRESHOLD * 100)}%)`}
          accent
        />
        <StatCard label="Failed" value={stats.failed} />
        <StatCard
          label="Correct answers"
          value={stats.totalCorrect}
          sub={totalAnswers > 0 ? `${Math.round((stats.totalCorrect / totalAnswers) * 100)}% of all answers` : undefined}
        />
        <StatCard
          label="Wrong answers"
          value={stats.totalWrong}
          sub={totalAnswers > 0 ? `${Math.round((stats.totalWrong / totalAnswers) * 100)}% of all answers` : undefined}
        />
      </div>

      {stats.attendees === 0 && (
        <p className="muted">No one has attended this exam yet.</p>
      )}

      {stats.attendees > 0 && (
        <div className="chart-grid">
          <div className="card">
            <h2>Attendance &amp; pass rate</h2>
            <ExamBarChart data={attendanceData} />
          </div>
          <div className="card">
            <h2>Answers given</h2>
            <ExamBarChart data={answersData} />
          </div>
        </div>
      )}

      {stats.attendees > 0 && (
        <div className="card">
          <h2>Attendees</h2>
          <table className="results-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Score</th>
                <th>Result</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const pct = Math.round((r.correctCount / r.totalQuestions) * 100)
                const passed = r.correctCount / r.totalQuestions >= PASS_THRESHOLD
                return (
                  <tr key={r.id}>
                    <td>{r.userEmail}</td>
                    <td>{r.correctCount} / {r.totalQuestions} ({pct}%)</td>
                    <td className={passed ? 'pass-text' : 'fail-text'}>
                      {passed ? 'Passed' : 'Failed'}
                    </td>
                    <td>{r.autoSubmitted ? 'Timed out' : 'Submitted'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ExamBarChart({ data }) {
  return (
    <BarChart width={400} height={260} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="name" stroke="var(--muted)" fontSize={12} />
      <YAxis allowDecimals={false} stroke="var(--muted)" fontSize={12} />
      <Tooltip
        contentStyle={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text)',
        }}
      />
      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
        {data.map((entry, i) => (
          <Cell key={i} fill={entry.fill} />
        ))}
      </Bar>
    </BarChart>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="card stat-card">
      <p className="muted">{label}</p>
      <p className={'stat-value' + (accent ? ' stat-value-accent' : '')}>{value}</p>
      {sub && <p className="muted stat-sub">{sub}</p>}
    </div>
  )
}
