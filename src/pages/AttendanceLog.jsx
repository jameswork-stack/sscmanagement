
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import "./AttendanceLog.css";

const PH_TIMEZONE = "Asia/Manila";

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
  const [now, setNow] = useState(new Date());

  const [activeAttendance, setActiveAttendance] = useState(null);
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

  // Read logged-in account and credential name
  useEffect(() => {
    let current = true;

    const unsubscribe = onAuthStateChanged(auth, async (account) => {
      setUser(account);
      setEmployeeName("");
      setLoading(true);

      if (!account) {
        setError("Please log in to access attendance.");
        setLoading(false);
        return;
      }

      setError("");

      try {
        const userDoc = await getDoc(doc(db, "users", account.uid));

        if (!current) return;

        const data = userDoc.exists() ? userDoc.data() : {};

        setEmployeeName(
          data.name ||
          data.fullName ||
          data.displayName ||
          account.displayName ||
          account.email ||
          "Employee"
        );
      } catch (err) {
        if (!current) return;
        console.error("Account loading error:", err);
        setEmployeeName(
          account.displayName || account.email || "Employee"
        );
      }
    });

    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  // Detect active time-in record for this account
  useEffect(() => {
    if (!user) {
      setActiveAttendance(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const attendanceQuery = query(
      collection(db, "attendance"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      attendanceQuery,
      (snapshot) => {
        const activeRecords = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter((item) => item.status === "TIME_IN")
          .sort(
            (a, b) =>
              (b.timeIn?.toMillis?.() || 0) -
              (a.timeIn?.toMillis?.() || 0)
          );

        setActiveAttendance(activeRecords[0] || null);
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

  const handleTimeIn = async () => {
    if (!user || loading || saving || activeAttendance) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // A new record for every time-in/time-out session
      await addDoc(collection(db, "attendance"), {
        userId: user.uid,
        employeeName: employeeName || user.email || "Employee",
        email: user.email || "",
        timeIn: serverTimestamp(),
        timeOut: null,
        status: "TIME_IN",
        createdAt: serverTimestamp(),
      });

      setSuccess("Time In recorded successfully.");
    } catch (err) {
      console.error("Time In error:", err);
      setError(err.message || "Failed to record Time In.");
    } finally {
      setSaving(false);
    }
  };

  const handleTimeOut = async () => {
    if (!user || loading || saving || !activeAttendance) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await updateDoc(
        doc(db, "attendance", activeAttendance.id),
        {
          timeOut: serverTimestamp(),
          status: "TIME_OUT",
        }
      );

      setSuccess("Time Out recorded successfully.");
    } catch (err) {
      console.error("Time Out error:", err);
      setError(err.message || "Failed to record Time Out.");
    } finally {
      setSaving(false);
    }
  };

  const isTimedIn = Boolean(activeAttendance);

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
          <span>Employee</span>
          <strong>{employeeName || "Loading account..."}</strong>
        </div>

        <div className="attendance-status">
          <span>Attendance Status</span>
          <strong className={isTimedIn ? "timed-in" : "timed-out"}>
            {loading
              ? "Loading..."
              : isTimedIn
              ? "Currently Timed In"
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

        <div className="attendance-buttons">
          <button
            type="button"
            className="attendance-timein"
            onClick={handleTimeIn}
            disabled={
              !user || loading || saving || isTimedIn
            }
          >
            {saving ? "Processing..." : "Time In"}
          </button>

          <button
            type="button"
            className="attendance-timeout"
            onClick={handleTimeOut}
            disabled={
              !user || loading || saving || !isTimedIn
            }
          >
            {saving ? "Processing..." : "Time Out"}
          </button>
        </div>

        <p className="attendance-note">
          After Time Out, you can start another attendance session.
          All records are saved under your logged-in account.
        </p>
      </div>
    </div>
  );
}
