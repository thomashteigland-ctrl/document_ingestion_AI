import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import DashboardLayout from './components/DashboardLayout'

import Inbox from './pages/Inbox'
import DragDropPage from './pages/DragDropPage'
import UsagePage from './pages/UsagePage'
import SchemaEditor from './pages/SchemaEditor'
import Login from './pages/Login'
import Signup from './pages/Signup'

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Auth routes - full screen, no sidebar */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Dashboard routes - wrapped in layout */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Navigate to="drag-drop" replace />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="drag-drop" element={<DragDropPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="schema-editor" element={<SchemaEditor />} />
        </Route>

        {/* Redirect base route to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard/drag-drop" replace />} />
      </Routes>
    </Router>
  )
}
