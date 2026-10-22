export default function AuthCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`content-signup-card ${className}`}>
        <div className="form-card">
      {children}
        </div>
    </div>
  );
}
