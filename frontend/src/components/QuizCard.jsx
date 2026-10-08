import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

export default function QuizCard({ quiz, onComplete }) {
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showExplanations, setShowExplanations] = useState({});

  const quizKey = JSON.stringify(quiz ?? null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [seenKey, setSeenKey] = useState(quizKey);
  if (seenKey !== quizKey) {
    setSeenKey(quizKey);
    setSelectedAnswers({});
    setShowExplanations({});
  }

  const validQuestions = Array.isArray(quiz?.questions)
    ? quiz.questions.filter(
        (q) =>
          q &&
          typeof q.question === "string" &&
          q.question.trim().length > 0 &&
          Array.isArray(q.options) &&
          q.options.length > 0 &&
          q.options.every((o) => typeof o === "string" && o.trim().length > 0) &&
          Number.isInteger(q.correct_index) &&
          q.correct_index >= 0 &&
          q.correct_index < q.options.length
      )
    : [];
  if (!validQuestions.length) return null;

  const handleSelect = (qIdx, optIdx) => {
    if (selectedAnswers[qIdx] !== undefined) return; // Prevent changing answer after selection
    
    const newAnswers = { ...selectedAnswers, [qIdx]: optIdx };
    setSelectedAnswers(newAnswers);
    setShowExplanations(prev => ({ ...prev, [qIdx]: true }));

    // Check if quiz is complete (all questions answered)
    if (Object.keys(newAnswers).length === validQuestions.length) {
      if (onComplete) {
        // Calculate score: pass if >= 2/3 correct
        let correctCount = 0;
        validQuestions.forEach((q, i) => {
          if (newAnswers[i] === q.correct_index) correctCount++;
        });
        const passed = correctCount >= Math.ceil((validQuestions.length * 2) / 3);
        onComplete(passed);
      }
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-accent-line pt-4" aria-label="Quiz questions">
      {validQuestions.map((q, qIdx) => {
        const hasAnswered = selectedAnswers[qIdx] !== undefined;
        const isCorrect = selectedAnswers[qIdx] === q.correct_index;

        return (
          <div key={qIdx} className="bg-surface rounded-lg border border-line p-3">
            <h4 id={`quiz-q-${qIdx}`} className="text-xs font-semibold text-fg mb-2 leading-relaxed">
              {qIdx + 1}. {q.question}
            </h4>
            <div className="flex flex-col gap-1.5" role="radiogroup" aria-labelledby={`quiz-q-${qIdx}`}>
              {q.options.map((opt, optIdx) => {
                const isSelected = selectedAnswers[qIdx] === optIdx;
                const isActuallyCorrect = q.correct_index === optIdx;

                let btnStyle = "border-line text-fg-muted hover:bg-surface-hover hover:border-line-strong";

                if (hasAnswered) {
                  if (isActuallyCorrect) {
                    btnStyle = "bg-success-soft border-success-fg text-success-fg font-medium";
                  } else if (isSelected) {
                    btnStyle = "bg-danger-soft border-danger-line text-danger-fg";
                  } else {
                    btnStyle = "border-line text-fg-subtle opacity-60";
                  }
                }

                return (
                  <button
                    key={optIdx}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`Option ${String.fromCharCode(65 + optIdx)}: ${opt}${hasAnswered ? (isActuallyCorrect ? " (correct answer)" : isSelected ? " (your answer, incorrect)" : "") : ""}`}
                    className={`w-full text-left text-xs px-3 py-2 rounded-md border transition-colors bg-transparent min-h-[44px] ${hasAnswered ? "cursor-default" : "cursor-pointer"} ${btnStyle}`}
                    onClick={() => handleSelect(qIdx, optIdx)}
                    disabled={hasAnswered}
                  >
                    <span className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[10px] opacity-50">{String.fromCharCode(65 + optIdx)}</span>
                      <span>{opt}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {showExplanations[qIdx] && (
              <div
                role="status"
                aria-live="polite"
                className={`mt-3 p-2.5 rounded-md text-xs leading-relaxed flex items-start gap-2 ${
                  isCorrect ? "bg-success-soft text-success-fg" : "bg-warn-soft text-warn-fg"
                }`}
              >
                {isCorrect ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" aria-hidden="true" /> : <XCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />}
                <span>{isCorrect ? "Correct. " : "Not quite. "}{q.explanation || "No explanation provided."}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
