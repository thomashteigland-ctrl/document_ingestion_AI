// src/pages/Dashboard.tsx
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar'

export default function Dashboard() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-6 bg-gray-100 min-h-screen">
        <Outlet /> {/* Nested pages render here */}
      </div>
    </div>
  )
}
