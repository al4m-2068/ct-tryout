import { Routes, Route } from "react-router-dom";
import { ExamSessionProvider } from "./contexts/ExamSessionContext.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ExamPage from "./pages/ExamPage.jsx";

function App() {
  return (
    <ExamSessionProvider>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/exam" element={<ExamPage />} />
      </Routes>
    </ExamSessionProvider>
  );
}

export default App;
