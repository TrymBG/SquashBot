// The page frame (header) and the route table: which URL shows which page.
import { Link, Route, Routes } from 'react-router'
import LeaderboardPage from './pages/LeaderboardPage.tsx'
import PlayerPage from './pages/PlayerPage.tsx'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Squash Ladder
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <Routes>
          <Route path="/" element={<LeaderboardPage />} />
          <Route path="/players/:id" element={<PlayerPage />} />
          <Route path="*" element={<p className="text-slate-400">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  )
}
