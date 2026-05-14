import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'

export default function Sidebar() {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error.message)
      return
    }
    navigate('/login')
  }

  return (
    <aside className="flex min-h-screen w-64 shrink-0 flex-col justify-between border-r border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-lg">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Analysis Platform
        </p>
        <h2 className="mb-6 text-xl font-bold text-white">Menu</h2>
        <nav className="flex flex-col gap-1">
          <NavLink
            to="inbox"
            className={({ isActive }) =>
              isActive
                ? 'rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white'
                : 'rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white'
            }
          >
            Inbox
          </NavLink>

          <NavLink
            to="drag-drop"
            className={({ isActive }) =>
              isActive
                ? 'rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white'
                : 'rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white'
            }
          >
            Upload
          </NavLink>

          <NavLink
            to="usage"
            className={({ isActive }) =>
              isActive
                ? 'rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white'
                : 'rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white'
            }
          >
            Usage
          </NavLink>

          <NavLink
            to="schema-editor"
            className={({ isActive }) =>
              isActive
                ? 'rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white'
                : 'rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white'
            }
          >
            Schema Editor
          </NavLink>
        </nav>
      </div>

      <div className="mt-8 border-t border-slate-700 pt-4">
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full rounded-lg bg-red-600 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
