import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { Link } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      // Check if user record exists in the new organization-based system
      if (data.user?.id) {
        const { data: userRecord, error: fetchError } = await supabase
          .from('users')
          .select('id, organization_id')
          .eq('id', data.user.id)
          .single()

        if (fetchError && fetchError.code === 'PGRST116') {
          // User record doesn't exist - this shouldn't happen with new signup flow
          // but handle it gracefully for existing users
          console.warn('User record not found - this user may need to re-signup with the new system');
          setError('Please sign up again to create your organization.');
          return;
        } else if (userRecord && !userRecord.organization_id) {
          // User exists but has no organization_id - legacy user
          console.warn('Legacy user detected - needs organization setup');
          setError('Your account needs to be updated. Please contact support.');
          return;
        } else if (userRecord && userRecord.organization_id) {
          console.log('✅ User authenticated with organization:', userRecord.organization_id);
        }
      }
      
      window.location.href = '/dashboard'
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-gray-100">
      <form
        onSubmit={handleLogin}
        className="bg-white p-8 rounded-2xl shadow-md w-80"
      >
        <h1 className="text-2xl font-bold mb-4 text-center text-gray-800">Login</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full p-2 mb-3 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full p-2 mb-4 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-blue-600 rounded text-white hover:bg-blue-700 transition-colors"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
        {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}

        <p className="mt-4 text-center text-sm text-gray-600">
          Don’t have an account?{' '}
          <Link to="/signup" className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  )
}
