import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import MainLayout from "./components/MainLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import POS from "./pages/POS";
import TransactionRecord from "./pages/TransactionRecord";
import Expense from "./pages/Expense";
import AttendanceLog from "./pages/AttendanceLog";
import AttendanceRecord from "./pages/AttendanceRecord";
import Product from "./pages/Product";
import PWAInstall from "./components/PWAInstall";

// Redirect users depending on their role
function HomeRedirect() {
  const { user, profile, loading } = useAuth();

  if (loading) return <h2>Loading...</h2>;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.role === "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  if (profile?.role === "staff") {
    return <Navigate to="/pos" replace />;
  }

  return <Navigate to="/login" replace />;
}

// Prevent logged-in users from returning to login
function GuestRoute() {
  const { user, profile, loading } = useAuth();

  if (loading) return <h2>Loading...</h2>;

  if (user && profile) {
    return (
      <Navigate
        to={profile.role === "admin" ? "/dashboard" : "/pos"}
        replace
      />
    );
  }

  function App() {
  return (
    <>
      {/* Your existing routes and components */}

      <PWAInstall />
    </>
  );
}

  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<GuestRoute />} />

      {/* All authenticated pages */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>

          {/* ADMIN ONLY */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/inventory"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Inventory />
              </ProtectedRoute>
            }
          />

          {/* ADMIN ONLY */}
          <Route
            path="/product"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Product />
              </ProtectedRoute>
            }
          />

          {/* ADMIN AND STAFF */}
          <Route
            path="/pos"
            element={
              <ProtectedRoute allowedRoles={["admin", "staff"]}>
                <POS />
              </ProtectedRoute>
            }
          />

          <Route
            path="/transactions"
            element={
              <ProtectedRoute allowedRoles={["admin", "staff"]}>
                <TransactionRecord />
              </ProtectedRoute>
            }
          />

          <Route
            path="/expense"
            element={
              <ProtectedRoute allowedRoles={["admin", "staff"]}>
                <Expense />
              </ProtectedRoute>
            }
          />

          <Route
            path="/attendance-log"
            element={
              <ProtectedRoute allowedRoles={["admin", "staff"]}>
                <AttendanceLog />
              </ProtectedRoute>
            }
          />

          {/* ADMIN ONLY */}
          <Route
            path="/attendance-record"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AttendanceRecord />
              </ProtectedRoute>
            }
          />

        </Route>
      </Route>

      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}