import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, ClipboardList, Users, Settings2, FileBarChart, LogOut, UserPlus, ShieldAlert } from 'lucide-react'
import { auth } from '../lib/auth'
import { team } from '../lib/team'
import { EMBLEM } from '../store'
import RosterAdmin from './RosterAdmin'
import NotificationBell from './NotificationBell'
import Dashboard from '../pages/manager/Dashboard'
import Attendance from '../pages/manager/Attendance'
import Staff from '../pages/manager/Staff'
import Setup from '../pages/manager/Setup'
import Reports from '../pages/manager/Reports'
import Alerts from '../pages/manager/Alerts'

const TABS = [
  { to: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/attendance', label: 'الحضور', icon: ClipboardList },
  { to: '/alerts', label: 'التنبيهات', icon: ShieldAlert },
  { to: '/staff', label: 'الموظفون', icon: Users },
  { to: '/setup', label: 'الإعدادات', icon: Settings2 },
  { to: '/reports', label: 'التقارير', icon: FileBarChart },
]

function ScrollReset({ scrollRef }) {
  const { pathname } = useLocation()
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0 }, [pathname, scrollRef])
  return null
}

export default function ManagerShell() {
  const scrollRef = useRef(null)
  const user = auth.getCurrentUser()
  const [canManage, setCanManage] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)

  useEffect(() => {
    team.canManage().then(setCanManage).catch(() => {})
    // Enable easy 6-digit PIN sign-in for staff (best effort, manager-only)
    team.setLoginConfig({ pin: true }).catch(() => {})
  }, [])

  const openRoster = () => setRosterOpen(true)

  return (
    <div className="h-full cn-aurora text-white flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 shrink-0 flex-col border-r border-white/10 p-5 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)]">
        <div className="flex items-center gap-3 mb-8">
          <img src={EMBLEM} alt="" className="w-10 h-10" />
          <div className="flex-1 min-w-0">
            <div className="font-display text-xl font-bold text-cyan-300 leading-none">Hudour</div>
            <div className="text-[10px] text-white/40 mt-1">مدير</div>
          </div>
          <NotificationBell />
        </div>
        <nav className="flex flex-col gap-1">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? 'bg-cyan-400/15 text-cyan-300' : 'text-white/60 hover:bg-white/5'}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          {canManage && (
            <button onClick={openRoster} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-white/80 border border-white/10">
              <UserPlus size={16} /> إدارة الحسابات
            </button>
          )}
          <div className="text-xs text-white/40 truncate">{user?.displayName || 'مدير'}</div>
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
        <div className="flex items-center gap-3">
          <NotificationBell />
          {canManage && <button onClick={openRoster} className="text-cyan-300"><UserPlus size={20} /></button>}
          <button onClick={() => auth.signOut()} className="text-white/50"><LogOut size={20} /></button>
        </div>
      </header>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <main ref={scrollRef} className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8">
          <ScrollReset scrollRef={scrollRef} />
          <div className="max-w-6xl mx-auto w-full px-4 md:px-8 py-5">
            <Routes>
              <Route path="/dashboard" element={<Dashboard openRoster={openRoster} canManage={canManage} />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/staff" element={<Staff openRoster={openRoster} canManage={canManage} />} />
              <Route path="/setup" element={<Setup openRoster={openRoster} />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </main>
      </div>

      {rosterOpen && <RosterAdmin onClose={() => setRosterOpen(false)} />}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 cn-glass border-t border-white/10 flex pb-[env(safe-area-inset-bottom,0px)]">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-cyan-300' : 'text-white/45'}`}>
            <Icon size={20} /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
