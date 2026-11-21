
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import "./AttendanceLog.css";

const PH_TIMEZONE = "Asia/Manila";

const normalizeEmployeeName = (name) =>
  String(name || "").trim().toLocaleLowerCase();

const formatPH = (date, options) =>
  new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIMEZONE,
    ...options,
  }).format(date);

const formatTime = (date) =>
  formatPH(date, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

const formatDate = (date) =>
  formatPH(date, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export default function AttendanceLog() {
  const [user, setUser] = useState(null);
  const [employeeName, setEmployeeName] = useState("");
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [nameInputFocused, setNameInputFocused] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [now, setNow] = useState(new Date());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Live Philippine clock
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Read the logged-in account without using account details as the employee name
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (account) => {
      setUser(account);
      setEmployeeName("");
      setAttendanceRecords([]);
      setNameInputFocused(false);
      setPendingAction("");
      setLoading(Boolean(account));

      if (!account) {
        setError("Please log in to access attendance.");
        setLoading(false);
        return;
      }

      setError("");
    });

    return () => unsubscribe();
  }, []);

  // Load attendance records for employee suggestions and active sessions
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      collection(db, "attendance"),
      (snapshot) => {
        setAttendanceRecords(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Attendance loading error:", err);
        setError("Unable to load attendance records.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const openNameForm = (action) => {
    setEmployeeName("");
    setNameInputFocused(false);
    setPendingAction(action);
    setError("");
    setSuccess("");
  };

  const handleTimeIn = async () => {
    if (!user || loading || saving) return;

    const name = employeeName.trim();
    if (!name) {
      setError("Enter an employee name to record attendance.");
      return;
    }

    if (activeAttendance) {
      setError(`${name} is already timed in.`);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // A new record for every time-in/time-out session
      await addDoc(collection(db, "attendance"), {
        userId: user.uid,
        employeeName: name,
        email: user.email || "",
        timeIn: serverTimestamp(),
        timeOut: null,
        status: "TIME_IN",
        createdAt: serverTimestamp(),
      });

      setSuccess("Time In recorded successfully.");
      setPendingAction("");
    } catch (err) {
      console.error("Time In error:", err);
      setError(err.message || "Failed to record Time In.");
    } finally {
      setSaving(false);
    }
  };

  const handleTimeOut = async () => {
    if (!user || loading || saving) return;

    const name = employeeName.trim();
    if (!name) {
      setError("Enter an employee name to record attendance.");
      return;
    }

    if (!activeAttendance) {
      setError(`No active Time In record found for ${name}.`);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await updateDoc(
        doc(db, "attendance", activeAttendance.id),
        {
          employeeName: name,
          timeOut: serverTimestamp(),
          status: "TIME_OUT",
        }
      );

      setSuccess("Time Out recorded successfully.");
      setPendingAction("");
    } catch (err) {
      console.error("Time Out error:", err);
      setError(err.message || "Failed to record Time Out.");
    } finally {
      setSaving(false);
    }
  };

  const activeRecords = attendanceRecords.filter(
    (record) => record.status === "TIME_IN"
  );
  const activeAttendance = activeRecords
    .filter(
      (record) =>
        normalizeEmployeeName(record.employeeName) ===
        normalizeEmployeeName(employeeName)
    )
    .sort(
      (a, b) =>
        (b.timeIn?.toMillis?.() || 0) - (a.timeIn?.toMillis?.() || 0)
    )[0] || null;
  const isTimedIn = activeRecords.length > 0;
  const savedNames = [
    ...new Set(
      attendanceRecords
        .map((record) => String(record.employeeName || "").trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
  const suggestedNames =
    pendingAction === "TIME_OUT"
      ? [
          ...new Set(
            activeRecords
              .map((record) => String(record.employeeName || "").trim())
              .filter(Boolean)
          ),
        ]
      : savedNames;
  const matchingNames = suggestedNames
    .filter((name) =>
      normalizeEmployeeName(name).includes(normalizeEmployeeName(employeeName))
    )
    .slice(0, 8);
  const showNameSuggestions =
    nameInputFocused && matchingNames.length > 0;

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <h1>Attendance Log</h1>
        <p>Record your Time In and Time Out.</p>
      </div>

      <div className="attendance-card">
        <div className="attendance-clock">
          <span>Philippine Standard Time (PHT)</span>
          <h2>{formatTime(now)}</h2>
          <p>{formatDate(now)}</p>
        </div>

        <div className="attendance-employee">
          <span>Employee Name</span>
          <strong>
            {employeeName || "Enter a name when recording attendance"}
          </strong>
        </div>

        <div className="attendance-status">
          <span>Attendance Status</span>
          <strong className={isTimedIn ? "timed-in" : "timed-out"}>
            {loading
              ? "Loading..."
              : isTimedIn
              ? `${activeRecords.length} ${
                  activeRecords.length === 1 ? "employee" : "employees"
                } currently timed in`
              : "Ready to Time In"}
          </strong>
        </div>

        {activeAttendance?.timeIn?.toDate && (
          <div className="attendance-last-time">
            Time In: {formatTime(activeAttendance.timeIn.toDate())}
          </div>
        )}

        {error && <div className="attendance-error">{error}</div>}
        {success && (
          <div className="attendance-success">{success}</div>
        )}

        {pendingAction ? (
          <form
            className="attendance-name-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (pendingAction === "TIME_IN") {
                handleTimeIn();
              } else {
                handleTimeOut();
              }
            }}
          >
            <label htmlFor="attendance-employee-name">
              Employee Name
            </label>
            <div className="attendance-name-input-wrap">
              <input
                id="attendance-employee-name"
                type="text"
                autoComplete="off"
                placeholder="Enter employee name"
                value={employeeName}
                onChange={(event) => setEmployeeName(event.target.value)}
                onFocus={() => setNameInputFocused(true)}
                onBlur={() => setNameInputFocused(false)}
                aria-autocomplete="list"
                aria-expanded={showNameSuggestions}
                aria-controls="attendance-name-suggestions"
                required
              />
              {showNameSuggestions && (
                <ul
                  id="attendance-name-suggestions"
                  className="attendance-name-suggestions"
                  role="listbox"
                >
                  {matchingNames.map((name) => (
                    <li key={name} role="option" aria-selected="false">
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setEmployeeName(name);
                          setNameInputFocused(false);
                        }}
                      >
                        {name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="attendance-buttons">
              <button
                type="submit"
                className={
                  pendingAction === "TIME_IN"
                    ? "attendance-timein"
                    : "attendance-timeout"
                }
                disabled={!user || loading || saving}
              >
                {saving
                  ? "Processing..."
                  : pendingAction === "TIME_IN"
                  ? "Confirm Time In"
                  : "Confirm Time Out"}
              </button>
              <button
                type="button"
                className="attendance-cancel"
                onClick={() => setPendingAction("")}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="attendance-buttons">
            <button
              type="button"
              className="attendance-timein"
              onClick={() => openNameForm("TIME_IN")}
              disabled={!user || loading || saving}
            >
              Time In
            </button>

            <button
              type="button"
              className="attendance-timeout"
              onClick={() => openNameForm("TIME_OUT")}
              disabled={!user || loading || saving || !isTimedIn}
            >
              Time Out
            </button>
          </div>
        )}

        <p className="attendance-note">
          After Time Out, you can start another attendance session.
          Enter the employee name to save it with the attendance record.
        </p>
      </div>
    </div>
  );
}
