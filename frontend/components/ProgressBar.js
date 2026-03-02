export default function ProgressBar({ current, total }) {
    const percentage = total > 0 ? Math.min(100, (current / total) * 100) : 0;

    return (
        <div className="w-full max-w-md mx-auto space-y-2">
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted">
                <span>Aprofundando...</span>
                <span>{Math.round(percentage)}%</span>
            </div>
            <div className="h-px w-full bg-border relative overflow-hidden">
                <div
                    className="absolute top-0 left-0 h-full bg-foreground transition-all duration-1000 ease-out"
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}
