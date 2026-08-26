import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { examInfo, questions } from "../data/questions.js";
import {
  STATUS_ANSWERING,
  STATUS_FINALIZING,
  STATUS_DONE,
} from "./examSessionStatus.js";

const ExamSessionContext = createContext(null);
const makeStorageKey = (code) => `eduos.cbt.exam.${code}.answers`;

function loadPersistedAnswers(code) {
  try {
    const raw = localStorage.getItem(makeStorageKey(code));
    if (raw === null) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function persistAnswers(code, answers) {
  try {
    localStorage.setItem(makeStorageKey(code), JSON.stringify(answers));
  } catch {

  }
}

function ExamSessionProvider({ children }) {
  const [exam] = useState(examInfo);
  const [questionsList] = useState(questions);
  const [answers, setAnswers] = useState(() =>
    loadPersistedAnswers(examInfo.code)
  );

  const [status, setStatus] = useState(STATUS_ANSWERING);
  const submitAnswer = useCallback(
    (questionId, optionKey) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: optionKey };
        persistAnswers(examInfo.code, next);
        return next;
      });
    },
    []
  );

  const beginFinalizing = useCallback(() => {
    setStatus(STATUS_FINALIZING);
  }, []);

  const markDone = useCallback(() => {
    setStatus(STATUS_DONE);
  }, []);

  const value = useMemo(
    () => ({
      exam,
      questions: questionsList,
      answers,
      status,
      submitAnswer,
      beginFinalizing,
      markDone,
    }),
    [exam, questionsList, answers, status, submitAnswer, beginFinalizing, markDone]
  );

  return (
    <ExamSessionContext.Provider value={value}>
      {children}
    </ExamSessionContext.Provider>
  );
}

function useExamSession() {
  const ctx = useContext(ExamSessionContext);
  if (!ctx) {
    throw new Error(
      "useExamSession must be used within <ExamSessionProvider>"
    );
  }
  return ctx;
}

export { ExamSessionProvider, useExamSession };
