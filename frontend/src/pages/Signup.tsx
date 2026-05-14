import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { Link } from 'react-router-dom'

export default function Signup() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    company: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const { firstName, lastName, company, phone, email, password, confirmPassword } = formData

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          company,
          phone,
        },
      },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
      // Account created successfully - now create organization and user record
      if (data.user?.id) {
        console.log('✅ Account created successfully! Setting up organization...');
        
        try {
          // Create user record and organization using RPC function
          const { data: userData, error: userError } = await supabase.rpc('create_user_record', {
            user_id_param: data.user.id,
            email_param: data.user.email || '',
            folder_name_param: `temp-${data.user.id}`, // Temporary placeholder
            first_name_param: firstName,
            last_name_param: lastName,
            company_param: company,
            phone_param: phone
          });
          
          if (userError) {
            console.warn('⚠️ Organization creation failed:', userError);
            // Still show success but warn about setup
            alert('Account created but organization setup failed. Please contact support.');
          } else if (userData && userData.success) {
            console.log('✅ Organization and user record created successfully:', userData);
            
            // Create folder for organization documents
            const folderName = `organization-${userData.organization_id}`;
            console.log('Creating folder:', folderName);
            
            try {
              const { data: folderData, error: folderError } = await supabase.functions.invoke('createUserFolder', {
                body: { user_id: folderName },
              });
              
              if (folderError) {
                console.warn('⚠️ Folder creation failed:', folderError);
              } else {
                console.log('✅ Folder created successfully:', folderData);
              }
            } catch (folderErr) {
              console.warn('⚠️ Folder creation error:', folderErr);
            }
            
            // Create organization schema using Edge Function
            try {
              const response = await fetch(`https://dhkzbmrlgcxaxrwimzjs.supabase.co/functions/v1/createUserSchema`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ organization_id: userData.organization_id })
              });
              
              if (!response.ok) {
                const errorText = await response.text();
                console.warn('⚠️ Schema creation failed:', errorText);
              } else {
                const schemaData = await response.json();
                console.log('✅ Organization schema created successfully:', schemaData);
              }
            } catch (schemaErr) {
              console.warn('⚠️ Schema creation error:', schemaErr);
            }
          }
        } catch (setupError) {
          console.error('❌ Setup error:', setupError);
          alert('Account created but setup failed. Please contact support.');
        }
      }
      
      // Redirect to login after a short delay
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-gray-100">
      <form
        onSubmit={handleSignup}
        className="bg-white p-8 rounded-2xl shadow-md w-[360px]"
      >
        <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Create Account</h2>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            Account created successfully! Please check your email and sign in.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
              First Name
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
              Last Name
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-1">
            Company
          </label>
          <input
            type="text"
            id="company"
            name="company"
            value={formData.company}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>

        <p className="text-center text-sm text-gray-600 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:text-blue-800">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  )
}
