import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <h2>Loading...</h2>;
  }

  // If not logged in
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If profile is unavailable
  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  // Check user role
  if (
    allowedRoles &&
    !allowedRoles.includes(profile.role)
  ) {
    return (
      <Navigate
        to={profile.role === "admin" ? "/dashboard" : "/pos"}
        replace
      />
    );
  }

  return children ? children : <Outlet />;
}