import { useMemo, useRef, useState } from 'react'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { db } from '../lib/db'
import { useLiveShared } from '../lib/useLive'
import { fmtTime, fmtDateLong } from '../store'

export default function NotificationBell() {
  const { data } = useLiveShared('notifications', { order: '-createdAt', limit: 50 })
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  const notifications = data || []
  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications])

  async function markRead(id) {
    try { await db.updateShared('notifications', id, { read: true }) } catch { /* non-critical */ }
  }

  async function markAllRead() {
    const unread = notifications.filter(n => !n.read)
    try { await Promise.all(unread.map(n => db.updateShared('notifications', n.id, { read: true }))) } catch { /* non-critical */ }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="relative text-white/60 hover:text-white transition p-1">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -left-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div ref={panelRef} className="absolute left-0 top-full mt-2 w-80 max-w-[90vw] cn-glass rounded-2xl border border-white/10 shadow-xl z-40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-white">التنبيهات</h3>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200">
                  <CheckCheck size={13} /> تعليم الكل كمقروء
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-center text-white/40 text-sm py-8">لا توجد تنبيهات بعد.</div>
              ) : (
                notifications.map(n => (
                  <button key={n.id} onClick={() => !n.read && markRead(n.id)}
                    className={`w-full text-right px-4 py-3 border-b border-white/5 last:border-0 transition ${n.read ? 'opacity-50' : 'bg-cyan-400/5 hover:bg-cyan-400/10'}`}>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">{n.title}</div>
                        <div className="text-xs text-white/55 mt-0.5">{n.body}</div>
                        <div className="text-[10px] text-white/35 mt-1">{fmtDateLong(n.createdAt)} · {fmtTime(n.createdAt)}</div>
                      </div>
                      {n.read && <Check size={13} className="text-white/25 shrink-0 mt-1" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
