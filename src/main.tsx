import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// StrictMode is intentionally omitted — it double-fires all useEffect hooks
// in development, causing duplicate Rust backend calls (ensure_dir, check_update,
// set_debug_mode…) that pollute logs and add unnecessary overhead.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
