import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import ExamPage from "./pages/ExamPage.jsx";

// Catatan: routing di bawah ini cuma contoh biar app-nya bisa langsung
// dicoba (klik "Mulai Ujian" -> masuk ke halaman soal).
// Silakan disambungkan ulang sesuai alur/router punya kamu sendiri.
function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/exam" element={<ExamPage />} />
    </Routes>
  );
}

export default App;
