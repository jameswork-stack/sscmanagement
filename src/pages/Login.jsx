
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.css";
import logo from "../assets/images/logo.png";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const userData = await login(email, password);

      if (userData.role === "admin") {
        navigate("/dashboard", { replace: true });
      } else if (userData.role === "staff") {
        navigate("/pos", { replace: true });
      }
    } catch (error) {
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">

        <div className="login-brand">
          <div className="coffee-logo"><img src={logo}></img></div>
          <h1>SureShots</h1>
          <p>Coffee Shop Management System</p>
        </div>

        <div className="login-heading">
          <h2>Welcome Back!</h2>
          <p>Please login to continue.</p>
        </div>

        <form onSubmit={handleLogin}>

          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

        </form>

        <div className="login-footer">
          <p>☕ Fresh Coffee, Better Experience</p>
        </div>

      </div>
    </div>
  );
}
