const API_BASE = "http://localhost:5000/api";

function normaliseOptions(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 *
 *
 * @param {string} examCode
 * @returns {Promise<{ exam: object, questions: object[] }>}
 */
export async function getExam(examCode) {
  const res = await fetch(`${API_BASE}/exams/${encodeURIComponent(examCode)}`);

  if (!res.ok) {
    throw new Error(`Failed to fetch exam "${examCode}": HTTP ${res.status}`);
  }

  const raw = await res.json();
  const data =
    raw && typeof raw === "object" && "data" in raw ? raw.data : raw;

  const questions = (data.questions || []).map((q) => ({
    ...q,
    options: normaliseOptions(q.options),
  }));

  return {
    exam: data.exam || {},
    questions,
  };
}
