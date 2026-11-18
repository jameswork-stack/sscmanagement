
import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./MainLayout.css";

export default function MainLayout() {
  const [isOpen, setIsOpen] = useState(false);

  const closeSidebar = () => {
    setIsOpen(false);
  };

  return (
    <div className="main-layout">

      <Sidebar
        isOpen={isOpen}
        closeSidebar={closeSidebar}
      />

      <main className="main-content">

        <header className="content-header">

          <div className="header-left">

            <button
              className="menu-toggle"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle navigation"
              aria-expanded={isOpen}
            >
              ☰
            </button>

            <div>
              <span className="header-title">
                ☕ SureShots
              </span>

              <span className="header-subtitle">
                Coffee Shop Management
              </span>
            </div>

          </div>

          <div className="coffee-status">
            Coffee Management System
          </div>

        </header>

        <div className="page-container">
          <Outlet />
        </div>

      </main>

    </div>
  );
}
