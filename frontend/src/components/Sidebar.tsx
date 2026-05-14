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
    <div className="flex flex-col justify-between w-60 bg-gray-800 text-white min-h-screen p-4">
      {/* Top section: Menu */}
      <div>
        <h2 className="text-xl font-bold mb-6">Menu</h2>
        <nav className="flex flex-col gap-3">
          <NavLink
            to="inbox"
            className={({ isActive }) =>
              isActive
                ? 'bg-gray-700 p-2 rounded'
                : 'hover:bg-gray-700 p-2 rounded'
            }
          >
            Inbox
          </NavLink>

          <NavLink
            to="drag-drop"
            className={({ isActive }) =>
              isActive
                ? 'bg-gray-700 p-2 rounded'
                : 'hover:bg-gray-700 p-2 rounded'
            }
          >
            Upload
          </NavLink>

          <NavLink
            to="usage"
            className={({ isActive }) =>
              isActive
                ? 'bg-gray-700 p-2 rounded'
                : 'hover:bg-gray-700 p-2 rounded'
            }
          >
            Usage
          </NavLink>

          <NavLink
            to="schema-editor"
            className={({ isActive }) =>
              isActive
                ? 'bg-gray-700 p-2 rounded'
                : 'hover:bg-gray-700 p-2 rounded'
            }
          >
            Schema Editor
          </NavLink>
        </nav>
      </div>

      {/* Bottom section: Sign out button */}
      <div className="mt-6 border-t border-gray-700 pt-4">
        <button
          onClick={handleSignOut}
          className="w-full py-2 text-center bg-red-600 hover:bg-red-700 rounded transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
