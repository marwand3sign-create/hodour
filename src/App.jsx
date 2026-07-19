import { useEffect, useState } from 'react'
import { HashRouter } from 'react-router-dom'
import { auth } from './lib/auth'
import { team } from './lib/team'
import { social } from './lib/social'
import TeamLogin from './components/TeamLogin'
import ManagerShell from './components/ManagerShell'
import EmployeeShell from './components/EmployeeShell'
import { EMBLEM, groupId } from './store'

// Force RTL + Arabic at the document level so the platform sign-in and team-admin
// surfaces render their Arabic strings (they detect document dir / lang).
try {
  document.documentElement.dir = 'rtl'
  document.documentElement.lang = 'ar'
} catch {}

function Splash({ text }) {
  return (
    <div className="h-full cn-aurora flex flex-col items-center justify-center gap-5 text-white/70">
      <div className="relative flex items-center justify-center">
        <span
          className="absolute inset-0 rounded-full"
          style={{ animation: 'cn-glow-ring 2.2s ease-out infinite' }}
        />
        <img src={EMBLEM} alt="" className="relative w-20 h-20 rounded-2xl cn-logo-breathe" />
      </div>
      <p className="text-sm tracking-wide">{text}</p>
    </div>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(auth.isAuthenticated())
  const [role, setRole] = useState(null) // 'manager' | 'employee'

  async function resolveRole() {
    if (!auth.isAuthenticated()) { setRole(null); return }
    let r = 'employee'
    try {
      if (auth.isAppOwner()) {
        r = 'manager'
        const gid = await groupId()
        try { await social.claimGroupOwnership(gid) } catch {}
      } else {
        const m = await team.currentMember()
        if (m && (m.role === 'manager' || m.role === 'owner' || m.role === 'admin')) r = 'manager'
      }
    } catch {}
    setRole(r)
  }

  useEffect(() => {
    const unsub = auth.onAuthChange(async (u) => {
      setAuthed(!!u)
      await resolveRole()
      setReady(true)
    })
    return unsub
  }, [])

  if (!ready) return <Splash text="جارٍ تشغيل Hudour…" />

  if (!authed) {
    return (
      <TeamLogin
        fullScreen
        appName="Hudour"
        bgClassName="cn-aurora"
        ownerSignIn={false}
        brand={
          <div className="flex flex-col items-center gap-3 mb-2">
            <img src={EMBLEM} alt="Hudour" className="w-24 h-24 drop-shadow-[0_0_25px_rgba(56,189,248,0.5)]" />
            <div className="text-center">
              <div className="text-xs text-white/50 mt-1">حضور وانصراف بالتعرف على الوجه والموقع</div>
            </div>
          </div>
        }
        onSignedIn={async () => { setAuthed(true); await resolveRole() }}
      />
    )
  }

  if (!role) return <Splash text="جارٍ تجهيز مساحة العمل…" />

  return (
    <HashRouter>
      {role === 'manager' ? <ManagerShell /> : <EmployeeShell />}
    </HashRouter>
  )
}
