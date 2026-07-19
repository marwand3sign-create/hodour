import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { Clock, History, LogOut } from 'lucide-react'
import { auth } from '../lib/auth'
import { EMBLEM } from '../store'
import ClockPage from '../pages/employee/Clock'
import HistoryPage from '../pages/employee/History'

const TABS = [
  { to: '/clock', label: 'التسجيل', icon: Clock },
  { to: '/history', label: 'سجلي', icon: History },
]

function ScrollReset({ scrollRef }) {
  const { pathname } = useLocation()
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0 }, [pathname, scrollRef])
  return null
}

export default function EmployeeShell() {
  const scrollRef = useRef(null)
  const user = auth.getCurrentUser()

  return (
    <div className="h-full cn-aurora text-white flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 shrink-0 flex-col border-r border-white/10 p-5 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)]">
        <div className="flex items-center gap-3 mb-8">
          <img src={EMBLEM} alt="" className="w-10 h-10" />
          <span className="font-display text-xl font-bold text-cyan-300">Hudour</span>
        </div>
        <nav className="flex flex-col gap-1">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? 'bg-cyan-400/15 text-cyan-300' : 'text-white/60 hover:bg-white/5'}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <div className="text-xs text-white/40 mb-2 truncate">{user?.displayName || 'موظف'}</div>
          <button onClick={() => auth.signOut()} className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80">
            <LogOut size={16} /> تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <img src={EMBLEM} alt="" className="w-8 h-8" />
          <span className="font-display text-lg font-bold text-cyan-300">Hudour</span>
        </div>
        <button onClick={() => auth.signOut()} className="text-white/50"><LogOut size={20} /></button>
      </header>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <main ref={scrollRef} className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8">
          <ScrollReset scrollRef={scrollRef} />
          <div className="max-w-2xl mx-auto w-full px-4 md:px-8 py-5">
            <Routes>
              <Route path="/clock" element={<ClockPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="*" element={<Navigate to="/clock" replace />} />
            </Routes>
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 cn-glass border-t border-white/10 flex pb-[env(safe-area-inset-bottom,0px)]">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium ${isActive ? 'text-cyan-300' : 'text-white/45'}`}>
            <Icon size={22} /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
