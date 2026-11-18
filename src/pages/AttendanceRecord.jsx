import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  deleteDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase/firebase";
import "./AttendanceRecord.css";

const PH_TIMEZONE = "Asia/Manila";

// Convert Firestore Timestamp to JavaScript Date
const toDate = (value) => {
  if (!value) return null;

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

// Format Philippine date
const formatDate = (timestamp) => {
  const date = toDate(timestamp);
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

// Format Philippine time
const formatTime = (timestamp) => {
  const date = toDate(timestamp);
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
};

// Get Philippine calendar date YYYY-MM-DD
const getPHDateKey = (timestamp) => {
  const date = toDate(timestamp);
  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
};

// Calculate duration between Time In and Time Out
const calculateHours = (timeIn, timeOut) => {
  const start = toDate(timeIn);
  const end = toDate(timeOut);

  if (!start || !end) return null;

  const milliseconds = end.getTime() - start.getTime();

  if (milliseconds < 0) return null;

  return milliseconds / (1000 * 60 * 60);
};

// Display hours and minutes
const formatDuration = (hours) => {
  if (hours === null) return "—";

  const totalMinutes = Math.round(hours * 60);

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  return `${h}h ${m}m`;
};

export default function AttendanceRecord() {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("today");

  const [now, setNow] = useState(new Date());

  const [isAdmin, setIsAdmin] = useState(false);
const [roleLoading, setRoleLoading] = useState(true);

const [activeMenu, setActiveMenu] = useState(null);
const [menuPosition, setMenuPosition] = useState({
  top: 0,
  left: 0,
});

const [selectedRecord, setSelectedRecord] = useState(null);
const [removingId, setRemovingId] = useState(null);

const menuRef = useRef(null);

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    setIsAdmin(false);
    setRoleLoading(true);

    if (!user) {
      setRoleLoading(false);
      return;
    }

    try {
      const userSnapshot = await getDoc(
        doc(db, "users", user.uid)
      );

      if (auth.currentUser?.uid !== user.uid) return;

      setIsAdmin(
        userSnapshot.exists() &&
        userSnapshot.data().role === "admin"
      );
    } catch (err) {
      console.error("Unable to verify admin role:", err);
      setIsAdmin(false);
    } finally {
      if (auth.currentUser?.uid === user.uid) {
        setRoleLoading(false);
      }
    }
  });

  return () => unsubscribe();
}, []);

  // Keep Today filter updated in Philippine time
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Listen to all employees' attendance records
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "attendance"),
      (snapshot) => {
        const records = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        // Newest Time In first
        records.sort((a, b) => {
          const dateA = toDate(a.timeIn)?.getTime() || 0;
          const dateB = toDate(b.timeIn)?.getTime() || 0;

          return dateB - dateA;
        });

        setAttendance(records);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Attendance record error:", err);

        setError(
          err.code === "permission-denied"
            ? "Missing or insufficient permissions to view attendance records."
            : "Unable to load attendance records."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter attendance records
  const filteredAttendance = useMemo(() => {
    const keyword = search.toLowerCase().trim();
    const todayKey = getPHDateKey(now);
    const monthKey = todayKey.slice(0, 7);

    return attendance.filter((record) => {
      const employeeName = String(
        record.employeeName || "Employee"
      ).toLowerCase();

      const email = String(
        record.email || ""
      ).toLowerCase();

      const matchesSearch =
        !keyword ||
        employeeName.includes(keyword) ||
        email.includes(keyword);

      const recordDate = getPHDateKey(record.timeIn);

      let matchesDate = true;

      if (filter === "today") {
        matchesDate = recordDate === todayKey;
      }

      if (filter === "month") {
        matchesDate = recordDate.startsWith(monthKey);
      }

      return matchesSearch && matchesDate;
    });
  }, [attendance, search, filter, now]);

  // Summary statistics for the selected date filter
  const summary = useMemo(() => {
    const uniqueEmployees = new Set(
      filteredAttendance.map((record) => record.userId)
    );

    const timedIn = filteredAttendance.filter(
      (record) => record.status === "TIME_IN"
    ).length;

    const completed = filteredAttendance.filter(
      (record) => record.status === "TIME_OUT"
    ).length;

    const totalHours = filteredAttendance.reduce(
      (sum, record) => {
        const hours = calculateHours(
          record.timeIn,
          record.timeOut
        );

        return sum + (hours || 0);
      },
      0
    );

    return {
      employees: uniqueEmployees.size,
      timedIn,
      completed,
      totalHours,
    };
  }, [filteredAttendance]);

  const toggleActionMenu = (event, recordId) => {
  event.stopPropagation();

  if (activeMenu === recordId) {
    setActiveMenu(null);
    return;
  }

  const rect = event.currentTarget.getBoundingClientRect();
  const menuWidth = 180;

  setMenuPosition({
    top: rect.bottom + 6,
    left: Math.max(
      8,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)
    ),
  });

  setActiveMenu(recordId);
};

// Close dropdown when clicking outside, scrolling, or pressing Escape
useEffect(() => {
  if (!activeMenu) return;

  const handleOutsideClick = (event) => {
    if (
      !menuRef.current?.contains(event.target) &&
      !event.target.closest(".attendance-action-btn")
    ) {
      setActiveMenu(null);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setActiveMenu(null);
    }
  };

  const closeMenu = () => setActiveMenu(null);

  document.addEventListener("mousedown", handleOutsideClick);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu);

  return () => {
    document.removeEventListener("mousedown", handleOutsideClick);
    document.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("scroll", closeMenu, true);
    window.removeEventListener("resize", closeMenu);
  };
}, [activeMenu]);

const handleViewRecord = (record) => {
  setSelectedRecord(record);
  setActiveMenu(null);
};

const handleRemoveRecord = async (record) => {
  setActiveMenu(null);

  if (!isAdmin || roleLoading || removingId) {
    alert("Only Admin can remove attendance records.");
    return;
  }

  const confirmed = window.confirm(
    `Are you sure you want to remove the attendance record of ${
      record.employeeName || "this employee"
    }?\n\nThis action cannot be undone.`
  );

  if (!confirmed) return;

  setRemovingId(record.id);
  setError("");

  try {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error("You must be logged in.");
    }

    // Recheck Admin permission before deleting
    const userSnapshot = await getDoc(
      doc(db, "users", currentUser.uid)
    );

    if (
      !userSnapshot.exists() ||
      userSnapshot.data().role !== "admin"
    ) {
      throw new Error("Only Admin can remove attendance records.");
    }

    await deleteDoc(doc(db, "attendance", record.id));

    alert("Attendance record removed successfully.");
  } catch (err) {
    console.error("Remove attendance error:", err);

    setError(
      err.message || "Failed to remove attendance record."
    );
  } finally {
    setRemovingId(null);
  }
};

  return (
    <div className="attendance-record-page">
      {/* HEADER */}
      <div className="attendance-record-header">
        <div>
          <h1>Attendance Records</h1>
          <p>
            View and monitor employee Time In and Time Out
            records.
          </p>
        </div>
      </div>

      {error && (
        <div className="attendance-record-error">
          {error}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="attendance-record-summary">
        <div className="attendance-record-summary-card">
          <span>Employees</span>
          <strong>{summary.employees}</strong>
          <small>Unique employees in selected records</small>
        </div>

        <div className="attendance-record-summary-card">
          <span>Currently Timed In</span>
          <strong>{summary.timedIn}</strong>
          <small>Sessions without Time Out</small>
        </div>

        <div className="attendance-record-summary-card">
          <span>Completed Sessions</span>
          <strong>{summary.completed}</strong>
          <small>Recorded Time Out sessions</small>
        </div>

        <div className="attendance-record-summary-card">
          <span>Total Hours</span>
          <strong>
            {formatDuration(summary.totalHours)}
          </strong>
          <small>Completed work sessions</small>
        </div>
      </div>

      {/* CONTENT */}
      <div className="attendance-record-content">
        <div className="attendance-record-toolbar">
          <div>
            <h2>Attendance List</h2>
            <p>Employee attendance history</p>
          </div>

          <input
            type="search"
            className="attendance-record-search"
            placeholder="Search employee name or email..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        {/* FILTER BUTTONS */}
        <div className="attendance-record-filters">
          <button
            type="button"
            className={filter === "today" ? "active" : ""}
            onClick={() => setFilter("today")}
          >
            Today
          </button>

          <button
            type="button"
            className={filter === "month" ? "active" : ""}
            onClick={() => setFilter("month")}
          >
            This Month
          </button>

          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All Records
          </button>
        </div>

        {/* TABLE */}
        <div className="attendance-record-table-wrapper">
          <table className="attendance-record-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Total Hours</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="7"
                    className="attendance-record-empty"
                  >
                    Loading attendance records...
                  </td>
                </tr>
              ) : filteredAttendance.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="attendance-record-empty"
                  >
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                filteredAttendance.map((record) => {
                  const hours = calculateHours(
                    record.timeIn,
                    record.timeOut
                  );

                  const isTimedIn =
                    record.status === "TIME_IN";

                  return (
                    <tr key={record.id}>
                      <td>
                        <div className="attendance-record-employee">
                          <strong>
                            {record.employeeName || "Employee"}
                          </strong>

                          <small>
                            {record.email || "No email"}
                          </small>
                        </div>
                      </td>

                      <td>
                        {formatDate(record.timeIn)}
                      </td>

                      <td className="attendance-record-time">
                        {formatTime(record.timeIn)}
                      </td>

                      <td className="attendance-record-time">
                        {formatTime(record.timeOut)}
                      </td>

                      <td>
                        {formatDuration(hours)}
                      </td>

                      <td>
                        <span
                          className={`attendance-record-status ${
                            isTimedIn
                              ? "attendance-record-active"
                              : "attendance-record-completed"
                          }`}
                        >
                          {isTimedIn
                            ? "Timed In"
                            : "Completed"}
                        </span>
                      </td>

                      <td>
  <button
    type="button"
    className="attendance-action-btn"
    title="More actions"
    aria-label={`Actions for ${record.employeeName || "employee"}`}
    aria-expanded={activeMenu === record.id}
    onClick={(event) =>
      toggleActionMenu(event, record.id)
    }
  >
    ⋮
  </button>
</td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="attendance-record-footer">
          Showing {filteredAttendance.length} of{" "}
          {attendance.length} attendance records
        </div>

        {/* ACTION DROPDOWN - RENDERED OUTSIDE TABLE */}
{activeMenu &&
  createPortal(
    <div
      ref={menuRef}
      className="attendance-action-dropdown"
      style={{
        top: menuPosition.top,
        left: menuPosition.left,
      }}
    >
      <button
        type="button"
        onClick={() => {
          const record = attendance.find(
            (item) => item.id === activeMenu
          );

          if (record) handleViewRecord(record);
        }}
      >
        <span>◉</span>
        View Details
      </button>

      {isAdmin && !roleLoading && (
        <button
          type="button"
          className="attendance-action-remove"
          disabled={Boolean(removingId)}
          onClick={() => {
            const record = attendance.find(
              (item) => item.id === activeMenu
            );

            if (record) handleRemoveRecord(record);
          }}
        >
          <span>✕</span>
          Remove
        </button>
      )}
    </div>,
    document.body
  )}

{/* VIEW ATTENDANCE DETAILS MODAL */}
{selectedRecord && (
  <div
    className="attendance-detail-overlay"
    onClick={() => setSelectedRecord(null)}
  >
    <div
      className="attendance-detail-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Attendance details"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="attendance-detail-header">
        <div>
          <h2>Attendance Details</h2>
          <p>Employee attendance information</p>
        </div>

        <button
          type="button"
          className="attendance-detail-close"
          onClick={() => setSelectedRecord(null)}
        >
          ✕
        </button>
      </div>

      <div className="attendance-detail-body">
        <div className="attendance-detail-row">
          <span>Employee Name</span>
          <strong>
            {selectedRecord.employeeName || "Employee"}
          </strong>
        </div>

        <div className="attendance-detail-row">
          <span>Email</span>
          <strong>{selectedRecord.email || "—"}</strong>
        </div>

        <div className="attendance-detail-row">
          <span>Date</span>
          <strong>{formatDate(selectedRecord.timeIn)}</strong>
        </div>

        <div className="attendance-detail-row">
          <span>Time In</span>
          <strong>{formatTime(selectedRecord.timeIn)}</strong>
        </div>

        <div className="attendance-detail-row">
          <span>Time Out</span>
          <strong>{formatTime(selectedRecord.timeOut)}</strong>
        </div>

        <div className="attendance-detail-row">
          <span>Total Hours</span>
          <strong>
            {formatDuration(
              calculateHours(
                selectedRecord.timeIn,
                selectedRecord.timeOut
              )
            )}
          </strong>
        </div>

        <div className="attendance-detail-row">
          <span>Status</span>
          <strong>
            {selectedRecord.status === "TIME_IN"
              ? "Currently Timed In"
              : "Completed"}
          </strong>
        </div>
      </div>

      <div className="attendance-detail-footer">
        <button
          type="button"
          onClick={() => setSelectedRecord(null)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
      </div>
    </div>
  );
}
