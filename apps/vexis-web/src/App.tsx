import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/auth/login-page";
import RegisterPage from "@/pages/auth/register-page";
import ForgotPasswordPage from "@/pages/auth/forgot-password-page";
import ResetPasswordPage from "@/pages/auth/reset-password-page";
import ProfilePage from "@/pages/profile/profile-page";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Toaster } from "@/components/ui/sonner";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage role="user" />} />
        <Route path="/admin/login" element={<LoginPage role="admin" />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* User Routes */}
        <Route element={<ProtectedRoute allowedRoles={["user"]} />}>
          <Route
            path="/dashboard"
            element={<div>Dashboard Pengguna (Segera Hadir)</div>}
          />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* Admin Routes */}
        <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
          <Route
            path="/admin/dashboard"
            element={<div>Dashboard Admin (Segera Hadir)</div>}
          />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toaster position="top-center" />
    </BrowserRouter>
  );
}

export default App;
