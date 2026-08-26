import { Navigate } from "react-router-dom";
import { useExamSession } from "../contexts/ExamSessionContext.jsx";

function RequireExamSession({ children }) {
  const { sessionId } = useExamSession();

  if (sessionId === null) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default RequireExamSession;
