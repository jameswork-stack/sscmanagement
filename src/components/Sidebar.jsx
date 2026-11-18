
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Sidebar.css";
import logo from "../assets/images/logo.png"

export default function Sidebar({ isOpen, closeSidebar }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const adminLinks = [
    { name: "Dashboard", path: "/dashboard", icon: "⌂" },
    { name: "Inventory", path: "/inventory", icon: "▣" },
    { name: "Product", path: "/product", icon: "▣" },
    { name: "POS", path: "/pos", icon: "☕" },
    { name: "Transaction Record", path: "/transactions", icon: "▤" },
    { name: "Expense", path: "/expense", icon: "＄" },
    { name: "Attendance Log", path: "/attendance-log", icon: "◷" },
    { name: "Attendance Record", path: "/attendance-record", icon: "▦" },
  ];

  const staffLinks = [
    { name: "POS", path: "/pos", icon: "☕" },
    { name: "Transaction Record", path: "/transactions", icon: "▤" },
    { name: "Expense", path: "/expense", icon: "＄" },
    { name: "Attendance Log", path: "/attendance-log", icon: "◷" },
  ];

  const links =
    profile?.role === "admin" ? adminLinks : staffLinks;

  const handleLogout = async () => {
    await logout();
    closeSidebar();
    navigate("/login", { replace: true });
  };

  return (
    <>
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={closeSidebar}
        />
      )}

      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>

        <div className="sidebar-brand">
          <div className="sidebar-logo"><img src={logo} alt="logo" /></div>

          <div>
            <h2>SureShots</h2>
            <p>Coffee Shop POS</p>
          </div>

          <button
            className="sidebar-close"
            onClick={closeSidebar}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        <div className="sidebar-profile">
          <div className="profile-avatar">
            {profile?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>

          <div className="profile-info">
            <h4>{profile?.name || "User"}</h4>
            <span>{profile?.role?.toUpperCase()}</span>
          </div>
        </div>

        <div className="sidebar-label">MAIN MENU</div>

        <nav className="sidebar-nav">
          {links.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              onClick={closeSidebar}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              <span className="nav-icon">{link.icon}</span>
              <span>{link.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-coffee-note">
            <span>☕</span>
            <p>Good coffee, good day.</p>
          </div>

          <button
            className="logout-button"
            onClick={handleLogout}
          >
            <span>↪</span> Logout
          </button>
        </div>

      </aside>
    </>
  );
}
