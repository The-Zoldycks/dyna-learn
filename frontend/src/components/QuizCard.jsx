import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

export default function QuizCard({ quiz, onComplete }) {
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showExplanations, setShowExplanations] = useState({});

  if (!quiz || !quiz.questions || !quiz.questions.length) return null;

  const handleSelect = (qIdx, optIdx) => {
    if (selectedAnswers[qIdx] !== undefined) return; // Prevent changing answer after selection
    
    const newAnswers = { ...selectedAnswers, [qIdx]: optIdx };
    setSelectedAnswers(newAnswers);
    setShowExplanations(prev => ({ ...prev, [qIdx]: true }));

    // Check if quiz is complete (all questions answered)
    if (Object.keys(newAnswers).length === quiz.questions.length) {
      if (onComplete) {
        // Calculate score: pass if >= 2/3 correct
        let correctCount = 0;
        quiz.questions.forEach((q, i) => {
          if (newAnswers[i] === q.correct_index) correctCount++;
        });
        const passed = correctCount >= Math.ceil((quiz.questions.length * 2) / 3);
        onComplete(passed);
      }
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-violet-200/50 pt-4">
      {quiz.questions.map((q, qIdx) => {
        const hasAnswered = selectedAnswers[qIdx] !== undefined;
        const isCorrect = selectedAnswers[qIdx] === q.correct_index;

        return (
          <div key={qIdx} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-800 mb-2 leading-relaxed">
              {qIdx + 1}. {q.question}
            </h4>
            <div className="flex flex-col gap-1.5">
              {q.options.map((opt, optIdx) => {
                const isSelected = selectedAnswers[qIdx] === optIdx;
                const isActuallyCorrect = q.correct_index === optIdx;
                
                let btnStyle = "border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300";
                
                if (hasAnswered) {
                  if (isActuallyCorrect) {
                    btnStyle = "bg-emerald-50 border-emerald-500 text-emerald-800 font-medium";
                  } else if (isSelected) {
                    btnStyle = "bg-red-50 border-red-300 text-red-700";
                  } else {
                    btnStyle = "border-slate-100 text-slate-400 opacity-60";
                  }
                }

                return (
                  <button
                    key={optIdx}
                    onClick={() => handleSelect(qIdx, optIdx)}
                    disabled={hasAnswered}
                    className={`text-left text-xs px-3 py-2 rounded-md border transition-colors ${btnStyle}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[10px] opacity-50">{String.fromCharCode(65 + optIdx)}</span>
                      <span>{opt}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {showExplanations[qIdx] && (
              <div className={`mt-3 p-2.5 rounded-md text-xs leading-relaxed flex items-start gap-2 ${
                isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
              }`}>
                {isCorrect ? <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-600" /> : <XCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />}
                <span>{q.explanation}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
